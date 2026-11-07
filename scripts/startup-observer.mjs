import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  requireServicePreExposureIsolation,
  reportServiceExecutionBlock,
} from "./service-execution-boundary.mjs";

const projectLabel = "com.supabase.cli.project";
const workflowLabel = "com.careconnect.disposable-real-service-run";
const serviceNames = [
  "db",
  "analytics",
  "vector",
  "kong",
  "auth",
  "inbucket",
  "realtime",
  "rest",
  "storage",
  "imgproxy",
  "edge_runtime",
  "pg_meta",
  "studio",
  "pooler",
];
const allowedActions = new Set([
  "create",
  "start",
  "die",
  "destroy",
  "kill",
  "restart",
  "oom",
  "pause",
  "unpause",
  "health_status: starting",
  "health_status: healthy",
  "health_status: unhealthy",
]);
const maxEvents = 256;
const maxEventLineBytes = 64 * 1024;
const maxRawBytes = 32 * 1024 * 1024;
const stageNames = new Set([
  "image_preparation",
  "postgres_creation",
  "postgres_startup",
  "postgres_health",
  "database_setup",
  "service_startup",
  "service_health",
  "completed",
  "unavailable",
]);

function validProject(projectId) {
  return (
    typeof projectId === "string" &&
    projectId.length <= 40 &&
    /^careconnect-ci-\d{1,20}-\d{1,6}$/.test(projectId)
  );
}

function validId(id) {
  return typeof id === "string" && /^[a-f0-9]{12,64}$/i.test(id);
}

function eventService(name, projectId) {
  if (typeof name !== "string") return null;
  const normalized = name.startsWith("/") ? name.slice(1) : name;
  const prefix = "supabase_";
  const suffix = `_${projectId}`;
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) return null;
  const service = normalized.slice(prefix.length, -suffix.length);
  return serviceNames.includes(service) ? service : null;
}

export function sanitizeDockerEvent(value, projectId) {
  if (!validProject(projectId) || !value || typeof value !== "object" || Array.isArray(value))
    return null;
  if (value.Type !== "container") return null;
  const actor = value.Actor;
  const attributes = actor?.Attributes;
  if (
    !actor ||
    typeof actor !== "object" ||
    !validId(actor.ID) ||
    !attributes ||
    typeof attributes !== "object" ||
    Array.isArray(attributes) ||
    attributes[projectLabel] !== projectId
  )
    return null;
  const service = eventService(attributes.name, projectId);
  const action = value.Action ?? value.status;
  if (
    !service ||
    typeof action !== "string" ||
    !allowedActions.has(action) ||
    (value.Action !== undefined && value.status !== undefined && value.Action !== value.status)
  )
    return null;
  const exitText = attributes.exitCode;
  const exitCode =
    action === "die" && typeof exitText === "string" && /^\d{1,3}$/.test(exitText)
      ? Number(exitText)
      : null;
  return {
    service,
    event: action,
    exit_code: exitCode !== null && exitCode <= 255 ? exitCode : null,
  };
}

export function sanitizeDockerEventLines(lines, projectId) {
  if (!Array.isArray(lines) || lines.length > 4096 || !validProject(projectId)) {
    return { capture: "unavailable", events: [], rejected_events: 0 };
  }
  const events = [];
  let rejected = 0;
  for (const line of lines) {
    if (typeof line !== "string" || Buffer.byteLength(line) > maxEventLineBytes) {
      rejected += 1;
      continue;
    }
    let event;
    try {
      event = sanitizeDockerEvent(JSON.parse(line), projectId);
    } catch {
      event = null;
    }
    if (!event) {
      rejected += 1;
      continue;
    }
    if (events.length < maxEvents) events.push(event);
    else rejected += 1;
  }
  return { capture: rejected ? "partial" : "completed", events, rejected_events: rejected };
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function hasLine(raw, line) {
  return stripAnsi(raw)
    .split(/\r?\n/)
    .some((entry) => entry.trim() === line);
}

export function classifyStartupStage({ raw, exitCode, eventCapture, events }) {
  if (exitCode === 0) return "completed";
  if (typeof raw !== "string" || !Number.isInteger(exitCode) || exitCode < 1 || exitCode > 255)
    return "unavailable";

  const clean = stripAnsi(raw);
  if (
    /(?:failed to pull|error pulling image|pull access denied|manifest unknown|image pull failed|failed to resolve reference)/i.test(
      clean,
    )
  )
    return "image_preparation";

  const trustedEvents = eventCapture === "completed" && Array.isArray(events) ? events : [];
  const databaseStarted =
    hasLine(clean, "Starting database...") || hasLine(clean, "Starting database from backup...");
  const schemaStarted = hasLine(clean, "Initialising schema...");
  const servicesStarted = hasLine(clean, "Starting containers...");
  const healthStarted = hasLine(clean, "Waiting for health checks...");
  const dbEvents = trustedEvents.filter((event) => event.service === "db");
  const healthyIndex = dbEvents.findIndex((event) => event.event === "health_status: healthy");
  const unhealthyIndex = dbEvents.findIndex((event) => event.event === "health_status: unhealthy");
  const nonzeroExitIndex = dbEvents.findIndex(
    (event) => event.event === "die" && event.exit_code !== null && event.exit_code !== 0,
  );

  // Prefer the furthest verified phase over earlier normal Postgres lifecycle events.
  if (healthStarted) return "service_health";
  if (servicesStarted) return "service_startup";
  if (schemaStarted) return "database_setup";

  if (databaseStarted && /failed to create docker container/i.test(clean))
    return "postgres_creation";
  if (
    databaseStarted &&
    /failed to start docker container/i.test(clean) &&
    healthyIndex === -1 &&
    dbEvents.some((event) => event.event === "create")
  )
    return "postgres_startup";
  if (
    databaseStarted &&
    unhealthyIndex !== -1 &&
    (healthyIndex === -1 || unhealthyIndex < healthyIndex)
  )
    return "postgres_health";
  if (
    databaseStarted &&
    nonzeroExitIndex !== -1 &&
    (healthyIndex === -1 || nonzeroExitIndex < healthyIndex)
  )
    return "postgres_startup";
  return "unavailable";
}

export function sanitizeStartupObservation(input) {
  const exitCode =
    Number.isInteger(input?.cli_exit_code) && input.cli_exit_code >= 0 && input.cli_exit_code <= 255
      ? input.cli_exit_code
      : null;
  const elapsedMs =
    Number.isInteger(input?.elapsed_ms) && input.elapsed_ms >= 0 && input.elapsed_ms <= 5_400_000
      ? input.elapsed_ms
      : null;
  const eventCapture = ["completed", "partial", "unavailable"].includes(input?.event_capture)
    ? input.event_capture
    : "unavailable";
  const sanitized = sanitizeDockerEventLines(input?.event_lines ?? [], input?.project_id);
  const stage = classifyStartupStage({
    raw: typeof input?.raw === "string" ? input.raw : "",
    exitCode,
    eventCapture,
    events: sanitized.events,
  });
  return {
    cli_exit_code: exitCode,
    elapsed_ms: elapsedMs,
    startup_stage: stageNames.has(stage) ? stage : "unavailable",
    event_capture:
      eventCapture === "completed" && sanitized.capture === "completed"
        ? "completed"
        : eventCapture === "unavailable"
          ? "unavailable"
          : "partial",
    events: sanitized.events,
    rejected_events: Math.min(4096, sanitized.rejected_events),
  };
}

function readJson(filename, maxBytes) {
  try {
    if (statSync(filename).size > maxBytes) return null;
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function writeEvidence(filename, value) {
  mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function observerPidPath(runnerTemp) {
  return path.join(runnerTemp, "careconnect-startup-observer-owner.json");
}

export function matchesObserverArguments(args, projectId) {
  return (
    validProject(projectId) &&
    Array.isArray(args) &&
    args.length === 10 &&
    path.basename(args[0] ?? "") === "docker" &&
    args[1] === "events" &&
    args[2] === "--filter" &&
    args[3] === "type=container" &&
    args[4] === "--filter" &&
    args[5] === `label=${projectLabel}=${projectId}` &&
    args[6] === "--since" &&
    /^\d{1,12}$/.test(args[7] ?? "") &&
    args[8] === "--format" &&
    args[9] === "{{json .}}"
  );
}

export function isValidObserverMarker(marker, projectId) {
  return (
    marker !== null &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    marker.project_id === projectId &&
    Number.isSafeInteger(marker.pid) &&
    marker.pid >= 2 &&
    validProject(projectId)
  );
}

function ownedObserverPid(pid, projectId) {
  if (
    !Number.isSafeInteger(pid) ||
    pid < 2 ||
    !validProject(projectId) ||
    process.platform === "win32"
  )
    return false;
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`).toString("utf8").split("\0").filter(Boolean);
    return matchesObserverArguments(args, projectId);
  } catch {
    return false;
  }
}

function pidAlive(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.split(" ")[2] !== "Z";
  } catch {
    return false;
  }
}

async function reapObserver(projectId) {
  const runnerTemp = process.env.RUNNER_TEMP;
  const artifactPath = path.resolve("test-artifacts/startup-observer-cleanup.json");
  const markerPath = runnerTemp ? observerPidPath(runnerTemp) : "";
  let status = "PASS";
  let processStopped = true;
  if (!runnerTemp || !expectedContext(projectId, projectId)) {
    status = "FAIL";
    processStopped = false;
  } else {
    const marker = readJson(markerPath, 1024);
    if (marker === null) {
      status = existsSync(markerPath) ? "FAIL" : "PASS";
      processStopped = !existsSync(markerPath);
    } else if (
      !isValidObserverMarker(marker, projectId) ||
      (pidAlive(marker.pid) && !ownedObserverPid(marker.pid, projectId))
    ) {
      status = "FAIL";
      processStopped = false;
    } else if (!pidAlive(marker.pid)) {
      unlinkSync(markerPath);
      processStopped = true;
    } else {
      try {
        process.kill(marker.pid, "SIGTERM");
      } catch {
        /* The process may already have exited. */
      }
      const deadline = Date.now() + 2000;
      while (pidAlive(marker.pid) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (pidAlive(marker.pid) && ownedObserverPid(marker.pid, projectId)) {
        try {
          process.kill(marker.pid, "SIGKILL");
        } catch {
          /* Rechecked below. */
        }
        const killDeadline = Date.now() + 1000;
        while (pidAlive(marker.pid) && Date.now() < killDeadline)
          await new Promise((resolve) => setTimeout(resolve, 50));
      }
      processStopped = !pidAlive(marker.pid);
      status = processStopped ? "PASS" : "FAIL";
      if (processStopped) unlinkSync(markerPath);
    }
  }
  writeEvidence(artifactPath, { status, observer_process_stopped: processStopped });
  return status === "PASS" ? 0 : 1;
}

function signalGroup(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32" && child.spawnargs && child.pid)
      process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    /* The process may already have exited. */
  }
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("close", onClose);
      resolve(false);
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("close", onClose);
  });
}

async function stopProcess(child, graceMs = 2000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  signalGroup(child, "SIGTERM");
  if (await waitForClose(child, graceMs)) return true;
  signalGroup(child, "SIGKILL");
  return waitForClose(child, 1000);
}

function expectedContext(projectId, networkName) {
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  const expected = `careconnect-ci-${runId}-${attempt}`;
  return (
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.CI === "true" &&
    validProject(projectId) &&
    projectId === expected &&
    networkName === expected
  );
}

async function runStartup(projectId, networkName) {
  requireServicePreExposureIsolation();
  const runnerTemp = process.env.RUNNER_TEMP;
  const owner = readJson(path.join(runnerTemp ?? "", "careconnect-startup-owner.json"), 1024);
  const networkOwner = readJson(
    path.join(runnerTemp ?? "", "careconnect-docker-network-owned.json"),
    1024,
  );
  const expectedRun = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if (
    !runnerTemp ||
    !expectedContext(projectId, networkName) ||
    owner?.project_id !== projectId ||
    owner?.ownership_baseline !== "clear" ||
    networkOwner?.name !== networkName ||
    networkOwner?.run_label !== expectedRun ||
    !validId(networkOwner?.id)
  )
    throw new Error("invalid run ownership context");

  const rawPath = path.join(runnerTemp, "careconnect-supabase-start.raw.log");
  if (existsSync(rawPath)) throw new Error("startup log already exists");
  const artifactPath = path.resolve("test-artifacts/startup-observer.json");
  const rawFd = openSync(rawPath, "wx", 0o600);
  let rawBytes = 0;
  let rawTruncated = false;
  let eventBuffer = "";
  let eventBytes = 0;
  let eventTruncated = false;
  let rejectedEventLines = 0;
  const eventLines = [];
  let eventCapture = "unavailable";
  let observerStopping = false;
  let observerFailed = false;
  let signalReceived = null;
  let cli = null;
  let observer = null;
  let cliExitCode = null;
  let commandExitCode = 125;
  let elapsedMs = null;
  let cliStartedAt = null;
  const startedAt = Date.now();

  const appendRaw = (chunk) => {
    const remaining = maxRawBytes - rawBytes;
    if (remaining > 0) {
      const kept = chunk.subarray(0, remaining);
      if (kept.length) writeSync(rawFd, kept);
      rawBytes += kept.length;
    }
    if (chunk.length > remaining) rawTruncated = true;
  };
  const acceptEventLine = (line) => {
    if (!line) return;
    if (Buffer.byteLength(line) > maxEventLineBytes) {
      rejectedEventLines += 1;
      return;
    }
    if (eventLines.length >= maxEvents) {
      eventTruncated = true;
      return;
    }
    eventBytes += Buffer.byteLength(line);
    if (eventBytes > 4 * 1024 * 1024) {
      eventTruncated = true;
      return;
    }
    eventLines.push(line);
  };
  const onSignal = (signal) => {
    signalReceived ??= signal;
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const since = String(Math.max(0, Math.floor(startedAt / 1000) - 2));
    observer = spawn(
      "docker",
      [
        "events",
        "--filter",
        "type=container",
        "--filter",
        `label=${projectLabel}=${projectId}`,
        "--since",
        since,
        "--format",
        "{{json .}}",
      ],
      { stdio: ["ignore", "pipe", "ignore"], detached: process.platform !== "win32" },
    );
    writeFileSync(
      observerPidPath(runnerTemp),
      `${JSON.stringify({ project_id: projectId, pid: observer.pid })}\n`,
      { flag: "wx", mode: 0o600 },
    );
    observer.stdout.setEncoding("utf8");
    observer.stdout.on("data", (chunk) => {
      eventBuffer += chunk;
      if (Buffer.byteLength(eventBuffer) > maxEventLineBytes * 2) {
        const split = eventBuffer.lastIndexOf("\n");
        if (split < 0) {
          eventBuffer = "";
          rejectedEventLines += 1;
        } else {
          const complete = eventBuffer.slice(0, split);
          for (const line of complete.split(/\r?\n/)) acceptEventLine(line);
          eventBuffer = eventBuffer.slice(split + 1);
        }
        eventTruncated = true;
        return;
      }
      const lines = eventBuffer.split(/\r?\n/);
      eventBuffer = lines.pop() ?? "";
      for (const line of lines) acceptEventLine(line);
    });
    observer.on("error", () => {
      observerFailed = true;
      eventCapture = "unavailable";
    });
    observer.once("close", () => {
      if (!observerStopping) {
        observerFailed = true;
        eventCapture = "unavailable";
      }
    });
    await new Promise((resolve, reject) => {
      observer.once("spawn", resolve);
      observer.once("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (observer.exitCode !== null || observer.signalCode !== null) {
      eventCapture = "unavailable";
      throw new Error("event observer unavailable");
    }
    eventCapture = "completed";

    if (signalReceived) throw new Error("startup cancelled before launch");
    cliStartedAt = Date.now();
    cli = spawn("supabase", ["--debug", "--network-id", networkName, "start"], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    cli.stdout.on("data", appendRaw);
    cli.stderr.on("data", appendRaw);
    const closePromise = new Promise((resolve, reject) => {
      cli.once("error", reject);
      cli.once("close", (code, signal) => resolve({ code, signal }));
    });
    const cancelledPromise = new Promise((resolve) => {
      const poll = setInterval(() => {
        if (signalReceived) {
          clearInterval(poll);
          resolve(signalReceived);
        }
      }, 50);
      closePromise.then(
        () => clearInterval(poll),
        () => clearInterval(poll),
      );
    });
    const result = await Promise.race([
      closePromise.then((value) => ({ kind: "closed", ...value })),
      cancelledPromise.then((signal) => ({ kind: "cancelled", signal })),
    ]);
    if (result.kind === "cancelled") {
      await stopProcess(cli, 5000);
      commandExitCode = result.signal === "SIGINT" ? 130 : 143;
      eventCapture = "partial";
    } else {
      cliExitCode =
        Number.isInteger(result.code) && result.code >= 0 && result.code <= 255
          ? result.code
          : null;
      commandExitCode = cliExitCode ?? 125;
      if (result.signal) eventCapture = "partial";
    }
  } catch {
    if (cli) await stopProcess(cli, 5000);
    if (cliExitCode === null)
      commandExitCode =
        signalReceived === "SIGINT" ? 130 : signalReceived === "SIGTERM" ? 143 : 125;
    if (eventCapture === "completed") eventCapture = "partial";
  } finally {
    observerStopping = true;
    const observerStopped = await stopProcess(observer, 2000);
    if (!observerStopped || observerFailed) eventCapture = "unavailable";
    if (observerStopped) {
      try {
        unlinkSync(observerPidPath(runnerTemp));
      } catch {
        eventCapture = "unavailable";
      }
    }
    if (eventBuffer) acceptEventLine(eventBuffer);
    elapsedMs =
      cliStartedAt === null ? 0 : Math.min(5_400_000, Math.max(0, Date.now() - cliStartedAt));
    closeSync(rawFd);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }

  const raw = !rawTruncated && rawBytes <= maxRawBytes ? readFileSync(rawPath, "utf8") : "";
  const safe = sanitizeStartupObservation({
    project_id: projectId,
    cli_exit_code: cliExitCode,
    elapsed_ms: elapsedMs,
    event_capture: eventTruncated ? "partial" : eventCapture,
    event_lines: eventLines,
    raw: rawTruncated ? "" : raw,
  });
  safe.rejected_events = Math.min(4096, safe.rejected_events + rejectedEventLines);
  if (rawTruncated) safe.startup_stage = "unavailable";
  writeEvidence(artifactPath, safe);
  writeEvidence(path.resolve("test-artifacts/startup-process.json"), {
    cli_exit_code: safe.cli_exit_code,
    elapsed_ms: safe.elapsed_ms,
  });
  return commandExitCode;
}

async function main() {
  const [mode, projectId, networkName] = process.argv.slice(2);
  if (mode === "reap") return reapObserver(projectId);
  if (mode !== "run") throw new Error("invalid observer mode");
  return runStartup(projectId, networkName);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    if (!reportServiceExecutionBlock(error)) {
      console.error("Startup observer failed closed.");
      process.exitCode = 125;
    }
  }
}
