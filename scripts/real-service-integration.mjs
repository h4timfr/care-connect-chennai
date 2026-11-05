import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  aliasFile,
  targetVersions,
  validateInventory,
  validateTestInventory,
  verifyMigrationContents,
  verifyPinnedCliVersion,
} from "./staging-reconciliation-rehearsal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "test-artifacts");
let activeAssertionResults = null;
let currentIntegrationCheck = "fixture-creation";
const browserWorkflowNames = ["patient", "clinic", "doctor", "administrator"];

export function assertLoopbackUrl(raw, expectedPort) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("local service URL is invalid");
  }
  if (
    !["http:", "ws:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    (expectedPort && url.port !== String(expectedPort)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("refusing a non-loopback or unexpected Supabase target");
  }
  return url;
}

export function spawnSyncBounded(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("child process timeout must be a positive safe integer");
  }
  const spawnOptions = { ...options };
  delete spawnOptions.timeoutMs;
  return spawnSync(command, args, {
    ...spawnOptions,
    timeout: timeoutMs,
    killSignal: "SIGTERM",
  });
}

async function settleWithin(operation, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Realtime shutdown timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function closeRealtimeResources(resources, timeoutMs = 3_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Realtime shutdown timeout must be a positive safe integer");
  }

  const channelFailures = [];
  const teardownFailures = [];
  const disconnectFailures = [];
  const clients = new Set(resources.map(({ client }) => client));

  await Promise.all(
    resources.map(async ({ channel, state }, index) => {
      for (const pending of state?.pending || []) {
        try {
          pending.cancel();
        } catch {}
      }
      try {
        const status = await settleWithin(() => channel.unsubscribe(timeoutMs), timeoutMs + 250);
        if (status !== "ok") channelFailures.push(index);
      } catch {
        channelFailures.push(index);
      } finally {
        try {
          channel.teardown();
        } catch {
          teardownFailures.push(index);
        }
      }
    }),
  );

  await Promise.all(
    [...clients].map(async (client, index) => {
      try {
        await settleWithin(() => client.realtime.disconnect(), timeoutMs + 250);
      } catch {
        disconnectFailures.push(index);
      }
    }),
  );

  return {
    channels: resources.length,
    clients: clients.size,
    unsubscribe_failures: channelFailures.length,
    teardown_failures: teardownFailures.length,
    disconnect_failures: disconnectFailures.length,
    verified:
      channelFailures.length === 0 &&
      teardownFailures.length === 0 &&
      disconnectFailures.length === 0,
  };
}

export async function closeAuthResources(clients, timeoutMs = 5_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Auth shutdown timeout must be a positive safe integer");
  }

  let failures = 0;
  const uniqueClients = new Set(clients);
  await Promise.all(
    [...uniqueClients].map(async (client) => {
      try {
        const result = await settleWithin(
          () => client.auth.signOut({ scope: "global" }),
          timeoutMs,
        );
        if (result?.error) failures += 1;
      } catch {
        failures += 1;
      }
      try {
        await settleWithin(() => client.auth.stopAutoRefresh(), timeoutMs);
      } catch {
        failures += 1;
      }
      try {
        await settleWithin(() => client.auth.dispose(), timeoutMs);
      } catch {
        failures += 1;
      }
    }),
  );
  return { clients: uniqueClients.size, failures, verified: failures === 0 };
}

export async function prepareRealtimeAuth(client, expectedUserId, diagnostics) {
  if (diagnostics) {
    diagnostics.auth = {
      mode: "authenticated",
      sessionPresent: false,
      sessionIdentityMatched: false,
      authApiCheck: "not-checked",
      authApiStatus: null,
      authApiErrorCode: "none",
      realtimeAuthSet: false,
    };
  }
  const result = await client.auth.getSession();
  const session = result?.data?.session;
  const token = session?.access_token;
  if (diagnostics) diagnostics.auth.sessionPresent = typeof token === "string" && token.length > 0;
  if (result?.error || typeof token !== "string" || token.length === 0) {
    throw new Error("Realtime subscription authentication is unavailable");
  }

  const sessionIdentityMatched =
    typeof expectedUserId === "string" && session.user?.id === expectedUserId;
  if (diagnostics) {
    diagnostics.auth.sessionIdentityMatched = sessionIdentityMatched;
  }
  if (!sessionIdentityMatched) {
    throw new Error("Realtime subscription session identity could not be verified");
  }

  let authApiCheck;
  try {
    const verified = await client.auth.getUser(token);
    const authenticatedUserId = verified?.data?.user?.id;
    const authApiStatus = verified?.error ? safeAuthApiStatus(verified.error.status) : null;
    const authApiErrorCode = verified?.error ? safeAuthApiErrorCode(verified.error.code) : "none";
    authApiCheck = verified?.error
      ? "rejected"
      : typeof authenticatedUserId === "string"
        ? authenticatedUserId === expectedUserId
          ? "accepted"
          : "identity-mismatch"
        : "no-user";
    if (diagnostics) {
      diagnostics.auth.authApiCheck = authApiCheck;
      diagnostics.auth.authApiStatus = authApiStatus;
      diagnostics.auth.authApiErrorCode = authApiErrorCode;
    }
    if (authApiCheck === "identity-mismatch") {
      throw new Error("Realtime Auth API identity did not match the current session");
    }
  } catch (error) {
    if (error?.message === "Realtime Auth API identity did not match the current session") {
      throw error;
    }
    authApiCheck = "unavailable";
    if (diagnostics) {
      diagnostics.auth.authApiCheck = authApiCheck;
      diagnostics.auth.authApiStatus = safeAuthApiStatus(error?.status);
      diagnostics.auth.authApiErrorCode = safeAuthApiErrorCode(error?.code);
    }
  }

  await client.realtime.setAuth(token);
  if (diagnostics) diagnostics.auth.realtimeAuthSet = true;
  return true;
}

function safeAuthApiStatus(status) {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

function safeAuthApiErrorCode(code) {
  const allowed = [
    "bad_jwt",
    "invalid_jwt",
    "session_not_found",
    "token_expired",
    "user_not_found",
    "unexpected_failure",
  ];
  return allowed.includes(code) ? code : code ? "other" : "none";
}

function validRealtimeChannelErrorKind(kind) {
  return [
    "authorization-denied",
    "binding-mismatch",
    "timeout",
    "configuration",
    "transport",
    "other",
  ].includes(kind)
    ? kind
    : "other";
}

export function classifyRealtimeChannelError(error) {
  if (!error) return "other";
  const cause = error.cause;
  const detail = [
    error.message,
    typeof cause === "string" ? cause : "",
    cause && typeof cause === "object" ? cause.code : "",
    cause && typeof cause === "object" ? cause.error : "",
    cause && typeof cause === "object" ? cause.reason : "",
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
  if (/unauthorized|forbidden|permission denied|not authorized/.test(detail)) {
    return "authorization-denied";
  }
  if (/mismatch between server and client bindings/.test(detail)) return "binding-mismatch";
  if (/timed? ?out|timeout|subscribe timeout/.test(detail)) return "timeout";
  if (/realtimedisabledforconfiguration|realtime disabled/.test(detail)) return "configuration";
  if (/socket|transport|connection lost|connection closed/.test(detail)) return "transport";
  return "other";
}

export function authenticatedRealtimeAuthChecksPass(diagnostics) {
  const authenticated = diagnostics.filter((item) => item.auth?.mode === "authenticated");
  return (
    authenticated.length > 0 &&
    authenticated.every(
      (item) =>
        item.auth.sessionIdentityMatched === true &&
        item.auth.authApiCheck === "accepted" &&
        item.auth.realtimeAuthSet === true,
    )
  );
}

export function sanitizeRealtimeDiagnostics(diagnostics) {
  const validStatus = (status) =>
    ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status) ? status : "OTHER";
  const validMode = (mode) => (["authenticated", "anonymous"].includes(mode) ? mode : "unknown");
  return diagnostics.map((item) => ({
    role: ["patient", "clinic_staff", "doctor", "unrelated_patient", "anonymous"].includes(
      item.role,
    )
      ? item.role
      : "unknown",
    auth: {
      mode: validMode(item.auth?.mode),
      sessionPresent: item.auth?.sessionPresent === true,
      sessionIdentityMatched: item.auth?.sessionIdentityMatched === true,
      authApiCheck: [
        "not-checked",
        "accepted",
        "rejected",
        "identity-mismatch",
        "no-user",
        "unavailable",
      ].includes(item.auth?.authApiCheck)
        ? item.auth.authApiCheck
        : "unavailable",
      authApiStatus: safeAuthApiStatus(item.auth?.authApiStatus),
      authApiErrorCode: safeAuthApiErrorCode(item.auth?.authApiErrorCode),
      realtimeAuthSet: item.auth?.realtimeAuthSet === true,
    },
    subscription: {
      statuses: Array.isArray(item.subscription?.statuses)
        ? item.subscription.statuses.map(validStatus)
        : [],
      errorKinds: Array.isArray(item.subscription?.errorKinds)
        ? item.subscription.errorKinds.map(validRealtimeChannelErrorKind)
        : [],
      ready: item.subscription?.ready === true,
    },
    rowVisibility: {
      checked: item.rowVisibility?.checked === true,
      visible: item.rowVisibility?.visible === true,
      rowCount: Number.isSafeInteger(item.rowVisibility?.rowCount)
        ? item.rowVisibility.rowCount
        : 0,
    },
    delivery: {
      eventCount: Number.isSafeInteger(item.delivery?.eventCount) ? item.delivery.eventCount : 0,
      payloadFieldsPresent: item.delivery?.payloadFieldsPresent === true,
      conversationFilterMatched: item.delivery?.conversationFilterMatched === true,
      expectedMessageMatched: item.delivery?.expectedMessageMatched === true,
      waitOutcome: ["not-started", "matched", "not-observed", "timeout", "cancelled"].includes(
        item.delivery?.waitOutcome,
      )
        ? item.delivery.waitOutcome
        : "unknown",
    },
  }));
}

export function recordRealtimePayload(state, payload) {
  const body = payload.new?.body;
  const hasExpectedFields =
    typeof payload.new?.id === "string" &&
    typeof payload.new?.conversation_id === "string" &&
    typeof payload.new?.sender_id === "string" &&
    typeof body === "string";
  state.diagnostics.delivery.eventCount += 1;
  state.diagnostics.delivery.payloadFieldsPresent ||= hasExpectedFields;
  state.diagnostics.delivery.conversationFilterMatched ||=
    payload.new?.conversation_id === state.conversationId;
  state.diagnostics.delivery.expectedMessageMatched ||= [...state.pending].some(
    (pending) => pending.body === body,
  );
  state.delivered.push(body);
  for (const pending of state.pending) {
    if (pending.body === body) pending.deliver();
  }
}

export function realtimePostgresChangesOptions() {
  return {
    config: {
      postgres_changes_options: { wait: true, timeout: 10_000 },
    },
  };
}

export async function collectRealtimeDeliveries(deliveries) {
  return Promise.all(
    deliveries.map((delivery) => Promise.resolve(delivery).then(Boolean, () => false)),
  );
}

export function rejectRemoteConfiguration(env, files = []) {
  const forbidden = Object.entries(env).filter(([name, value]) => {
    if (!value) return false;
    return (
      /(?:SUPABASE|DATABASE|POSTGRES|PGHOST|PGPORT|PGDATABASE)/i.test(name) ||
      /https?:\/\/[^/]+\.supabase\.co|postgres(?:ql)?:\/\/[^/@]+@[^/]*\.supabase\.co/i.test(value)
    );
  });
  if (forbidden.length)
    throw new Error("remote-capable database environment variables are present");
  if (files.some((file) => existsSync(file)))
    throw new Error("environment or linked-project metadata exists");
}

export function assertLocalProjectRefMatchesConfig(configText, markerText) {
  if (markerText === null) return;
  const projectId = configText.match(/^project_id\s*=\s*["']([^"']+)["']/m)?.[1];
  if (!projectId || markerText.trim() !== projectId) {
    throw new Error("local Supabase project metadata does not match the unlinked config");
  }
}

function migrationFiles() {
  return validateInventory(readdirSync(path.join(root, "supabase/migrations")));
}

function readManifest() {
  return JSON.parse(readFileSync(path.join(root, "scripts/migration-integrity.json"), "utf8"));
}

export function verifyRepositoryIntegrity() {
  const files = migrationFiles();
  const originals = new Map(
    files.map((name) => [name, readFileSync(path.join(root, "supabase/migrations", name), "utf8")]),
  );
  verifyMigrationContents(originals, readManifest());
  const tests = validateTestInventory(readdirSync(path.join(root, "supabase/tests")));
  return { files, tests };
}

function preflight({ stackStarted = false } = {}) {
  const environmentFiles = readdirSync(root).filter(
    (name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example",
  );
  const linked = [
    path.join(root, "supabase/.temp/linked-project.json"),
    ...environmentFiles.map((name) => path.join(root, name)),
  ];
  const projectRef = path.join(root, "supabase/.temp/project-ref");
  if (!stackStarted) linked.push(projectRef);
  rejectRemoteConfiguration(process.env, linked);
  const cliVersion = spawnSyncBounded("supabase", ["--version"], {
    timeoutMs: 15_000,
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (cliVersion.status !== 0) throw new Error("Supabase CLI version check failed");
  verifyPinnedCliVersion(cliVersion.stdout);
  const { files, tests } = verifyRepositoryIntegrity();
  if (files.length !== 41 || files.at(-1)?.slice(0, 5) !== "00062" || tests.length !== 22) {
    throw new Error("canonical migration or SQL test inventory differs from the reviewed baseline");
  }
  const config = path.join(root, "supabase/config.toml");
  if (!existsSync(config))
    throw new Error("unlinked local Supabase configuration has not been initialized");
  const configText = readFileSync(config, "utf8");
  if (
    /https?:\/\/[^/]+\.supabase\.co|postgres(?:ql)?:\/\/[^/@]+@[^/]*\.supabase\.co|project_id\s*=\s*['"]aqwzrpwiqbrykorlqwow['"]/i.test(
      configText,
    )
  ) {
    throw new Error("local Supabase config contains a hosted project reference");
  }
  if (stackStarted && existsSync(projectRef)) {
    assertLocalProjectRefMatchesConfig(configText, readFileSync(projectRef, "utf8"));
  }
  console.log(
    `Preflight PASS: ${files.length} migrations, ${tests.length} pgTAP files, local unlinked config.`,
  );
}

export function classifyStartupFailure(raw) {
  const lines = String(raw).split(/\r?\n/);
  const signatures = [
    ["cli-network-flag-rejected", /(?:unknown|unrecognized|invalid) (?:flag|option).*network-id/i],
    [
      "docker-daemon",
      /(?:cannot connect to|failed to connect to|error during connect).*docker daemon|docker daemon.*(?:unavailable|not running)/i,
    ],
    [
      "image-pull",
      /(?:failed to pull|error pulling image|pull access denied|manifest unknown|image pull failed|failed to resolve reference)/i,
    ],
    [
      "dns-resolution",
      /no such host|temporary failure in name resolution|name or service not known/i,
    ],
    [
      "network-connectivity",
      /network is unreachable|connection refused|i\/o timeout|tls handshake timeout/i,
    ],
    [
      "network-attachment",
      /(?:network .*not found|failed to (?:create|connect|attach).*network|error (?:creating|connecting).*network)/i,
    ],
    ["port-binding", /address already in use|port is already allocated|failed to bind.*port/i],
    ["disk-space", /no space left on device|disk quota exceeded/i],
    [
      "configuration",
      /(?:config(?:uration)? file.*(?:not found|missing)|failed to (?:read|parse).*config)/i,
    ],
    [
      "container-health",
      /(?:container .*unhealthy|health check.*(?:failed|timeout)|unhealthy containers)/i,
    ],
  ];
  const categories = signatures
    .filter(([, pattern]) => lines.some((line) => pattern.test(line)))
    .map(([name]) => name);
  return {
    categories: categories.length ? categories : ["unclassified"],
    image_pull_output_observed: lines.some((line) =>
      /pulling (?:docker )?image|pulling from/i.test(line),
    ),
    container_start_output_observed: lines.some((line) =>
      /starting containers|starting container/i.test(line),
    ),
  };
}

function rawStartupSummary(failed) {
  const file = path.join(process.env.RUNNER_TEMP || "", "careconnect-supabase-start.raw.log");
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  const applied = migrationFiles().filter((name) => raw.includes(`Applying migration ${name}`));
  if (failed) {
    const diagnostics = classifyStartupFailure(raw);
    writeSafe(
      "startup.log",
      `Supabase local startup failed.\nMigration attempts: ${applied.length}.\nSanitized diagnostics: ${JSON.stringify(diagnostics)}\n`,
    );
    console.log(
      `Startup FAIL: ${diagnostics.categories.join(", ")}; migration attempts ${applied.length}.`,
    );
    return;
  }
  writeSafe(
    "startup.log",
    `Supabase local startup succeeded.\nMigration attempts: ${applied.length}.\n${applied.at(-1) ? `Last: ${applied.at(-1)}.\n` : ""}`,
  );
  console.log(`Startup PASS: ${applied.length} migration application messages observed.`);
}

function writeSafe(name, content) {
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(path.join(artifacts, name), content, { mode: 0o600 });
}

export function summarizeBrowserWorkflows(items) {
  const workflowCounts = {
    passed: items.filter((item) => item.status === "PASS").length,
    failed: items.filter((item) => item.status === "FAIL").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
  };
  const assertions = items.flatMap((item) =>
    item.assertions.map((assertion) => ({ workflow: item.name, ...assertion })),
  );
  return {
    environment: "disposable-local-supabase",
    test_cases: { total: items.length, ...workflowCounts },
    workflows: items,
    workflow_counts: workflowCounts,
    assertions: {
      total: assertions.length,
      passed: assertions.filter((item) => item.status === "PASS").length,
      failed: assertions.filter((item) => item.status === "FAIL").length,
      results: assertions,
    },
    service_operations: {
      kind: "observed browser HTTP requests",
      observed: items.reduce((sum, item) => sum + item.http_requests, 0),
      failed: items.reduce((sum, item) => sum + item.request_failures, 0),
    },
  };
}

function blockedBrowserWorkflows() {
  return summarizeBrowserWorkflows(
    browserWorkflowNames.map((name) => ({
      name,
      status: "BLOCKED",
      assertions: [],
      http_requests: 0,
      request_failures: 0,
    })),
  );
}

function readBrowserWorkflowEvidence() {
  const filename = path.join(artifacts, "browser-workflow-summary.json");
  if (!existsSync(filename)) return blockedBrowserWorkflows();
  try {
    const source = JSON.parse(readFileSync(filename, "utf8"));
    const byName = new Map(
      Array.isArray(source.workflows) ? source.workflows.map((item) => [item.name, item]) : [],
    );
    const workflows = browserWorkflowNames.map((name) => {
      const item = byName.get(name);
      const status = ["PASS", "FAIL", "BLOCKED"].includes(item?.status) ? item.status : "BLOCKED";
      const assertions = Array.isArray(item?.assertions)
        ? item.assertions
            .filter(
              (assertion) =>
                typeof assertion?.name === "string" && ["PASS", "FAIL"].includes(assertion?.status),
            )
            .map(({ name: assertionName, status: assertionStatus }) => ({
              name: assertionName,
              status: assertionStatus,
            }))
        : [];
      const integer = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
      return {
        name,
        status,
        assertions,
        http_requests: integer(item?.http_requests),
        request_failures: integer(item?.request_failures),
      };
    });
    return summarizeBrowserWorkflows(workflows);
  } catch {
    return blockedBrowserWorkflows();
  }
}

function statusValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) throw new Error("local service status was incomplete");
  return match[1].replace(/^['"]|['"]$/g, "");
}

function getLocalCredentials() {
  const proc = spawnSyncBounded("supabase", ["status", "--output", "env"], {
    timeoutMs: 30_000,
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (proc.status !== 0) throw new Error("local Supabase status command failed");
  const text = proc.stdout;
  const url = statusValue(text, "API_URL");
  const databaseUrl = statusValue(text, "DB_URL");
  const anonKey = statusValue(text, "ANON_KEY");
  const serviceKey = statusValue(text, "SERVICE_ROLE_KEY");
  const jwtSecret = statusValue(text, "JWT_SECRET");
  assertLoopbackUrl(url, 54321);
  const db = new URL(databaseUrl);
  if (db.protocol !== "postgres:" && db.protocol !== "postgresql:")
    throw new Error("local database URL scheme is invalid");
  if (
    !["127.0.0.1", "localhost", "::1"].includes(db.hostname) ||
    db.port !== "54322" ||
    db.pathname !== "/postgres"
  ) {
    throw new Error("refusing a database target outside the runner-owned local Supabase stack");
  }
  if (!db.username || !db.password || !anonKey || !serviceKey || !jwtSecret)
    throw new Error("local service credentials were incomplete");
  return { url, databaseUrl, anonKey, serviceKey, jwtSecret };
}

function psql(dbUrl, filename, variables) {
  const db = new URL(dbUrl);
  const args = [
    "-X",
    "--no-psqlrc",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    db.hostname,
    "-p",
    db.port,
    "-U",
    decodeURIComponent(db.username),
    "-d",
    db.pathname.slice(1),
  ];
  for (const [key, value] of Object.entries(variables)) args.push("-v", `${key}=${String(value)}`);
  args.push("-f", path.join(root, filename));
  const proc = spawnSyncBounded("/usr/bin/psql", args, {
    timeoutMs: 30_000,
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PGPASSWORD: decodeURIComponent(db.password),
      PGSSLMODE: "disable",
    },
    maxBuffer: 1024 * 1024,
  });
  if (proc.status !== 0) throw new Error(`local fixture SQL ${path.basename(filename)} failed`);
}

function safeEmail(runId, role) {
  return `careconnect-ci+${runId}-${role}@tests.invalid`;
}

function password() {
  return `Cc!${randomBytes(24).toString("base64url")}a9`;
}

function assert(condition, label) {
  currentIntegrationCheck = label;
  activeAssertionResults?.push({ name: label, status: condition ? "PASS" : "FAIL" });
  if (!condition) throw new Error(`integration assertion failed: ${label}`);
}

export function safeSqlState(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

async function expectDenied(promise, label) {
  let denied = false;
  try {
    const result = await promise;
    denied = Boolean(result?.error) || (Array.isArray(result?.data) && result.data.length === 0);
  } catch {
    denied = true;
  }
  assert(denied, label);
}

const canonicalDisposableBaseline = Object.freeze({
  users: 0,
  patients: 0,
  appointments: 0,
  conversations: 0,
  messages: 0,
  clinic_memberships: 0,
  clinic_doctors: 12,
  doctor_schedules: 64,
  doctors: 12,
  clinics: 6,
  audit_logs: 0,
  notifications: 0,
  provider_applications: 0,
  doctor_applications: 0,
  user_roles: 0,
  auth_users: 0,
  storage_objects: 0,
});

export function matchesCanonicalDisposableBaseline(counts) {
  return Object.entries(canonicalDisposableBaseline).every(
    ([table, expected]) => Number.isSafeInteger(counts?.[table]) && counts[table] === expected,
  );
}

export async function countOwnedRecords(admin, table, column, values) {
  const result = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);
  return result.error ? null : result.count;
}

export async function removeUnseededApplicationUsers(admin, userIds) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !Array.isArray(userIds) ||
    userIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))
  ) {
    return false;
  }
  const ownedIds = [...new Set(userIds)];
  if (ownedIds.length === 0) return true;
  const result = await admin.from("users").delete().in("id", ownedIds);
  return !result.error;
}

async function verifyDisposableBaseline(admin) {
  const counts = {};
  for (const table of [
    "users",
    "patients",
    "appointments",
    "conversations",
    "messages",
    "clinic_memberships",
    "clinic_doctors",
    "doctor_schedules",
    "doctors",
    "clinics",
    "audit_logs",
    "notifications",
    "provider_applications",
    "doctor_applications",
    "user_roles",
  ]) {
    const result = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = result.error ? null : result.count;
  }
  const auth = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  counts.auth_users = auth.error ? null : auth.data.users.length;
  const storage = await admin.storage.from("avatars").list();
  counts.storage_objects = storage.error ? null : storage.data.length;
  return { verified: matchesCanonicalDisposableBaseline(counts), counts };
}

async function runIntegration() {
  // `supabase start` may write its local project-ref marker. The initial CI
  // preflight already rejected linked metadata before startup; recheck all
  // guards while allowing only the generated marker that matches config.toml.
  preflight({ stackStarted: true });
  const creds = getLocalCredentials();
  const admin = createClient(creds.url, creds.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ownerToken = randomUUID();
  const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const runLabel = `careconnect-real-service-${runId}`;
  const roles = [
    "patient",
    "other-patient",
    "doctor",
    "clinic-staff",
    "clinic-admin",
    "platform-admin",
    "clinic-applicant",
    "doctor-applicant",
    "unauthorized",
  ];
  const users = {};
  const clients = {};
  const authClients = new Set();
  const realtimeResources = [];
  const realtimeDiagnostics = [];
  const realtimeShutdownResults = [];
  const timings = {};
  const serviceAssertions = [];
  const serviceOperations = [];
  const ids = { clinic_id: randomUUID(), doctor_id: randomUUID() };
  let storagePath;
  let cleanupResult;
  let initialCounts;
  let fixturesSeeded = false;
  let recoveryEmailAddress;
  let serviceStatus = "RUNNING";
  let browserRunnerFailed = false;
  let cleanupSqlSucceeded = true;
  let unseededApplicationProfilesCleaned = true;
  activeAssertionResults = serviceAssertions;
  currentIntegrationCheck = "fixture-creation";
  writeSafe("browser-workflow-summary.json", JSON.stringify(blockedBrowserWorkflows(), null, 2));
  const measure = async (name, action) => {
    currentIntegrationCheck = name;
    const started = performance.now();
    try {
      const value = await action();
      const elapsed = Math.round(performance.now() - started);
      timings[name] = elapsed;
      serviceOperations.push({ name, status: "COMPLETED", duration_ms: elapsed });
      return value;
    } catch (error) {
      const elapsed = Math.round(performance.now() - started);
      timings[name] = elapsed;
      serviceOperations.push({ name, status: "THREW", duration_ms: elapsed });
      throw error;
    }
  };
  try {
    initialCounts = await verifyDisposableBaseline(admin);
    assert(
      initialCounts.verified,
      "fresh local Supabase stack matches the canonical seed baseline and has no user/test records",
    );
    for (const role of roles) {
      const email = safeEmail(runId, role);
      const pass = password();
      if (role === "patient") {
        const signup = await measure("auth.signup", () =>
          createClient(creds.url, creds.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          }).auth.signUp({
            email,
            password: pass,
            options: { data: { full_name: "Synthetic CI Patient" } },
          }),
        );
        assert(!signup.error && signup.data.user?.id, "Auth signup creates synthetic patient");
        users[role] = { id: signup.data.user.id, email, password: pass };
        await admin.auth.admin.updateUserById(signup.data.user.id, { email_confirm: true });
      } else {
        const created = await admin.auth.admin.createUser({
          email,
          password: pass,
          email_confirm: true,
          user_metadata: { full_name: `Synthetic CI ${role}` },
        });
        assert(!created.error && created.data.user?.id, `Auth admin creates ${role} fixture`);
        users[role] = { id: created.data.user.id, email, password: pass };
      }
    }
    for (const [role, user] of Object.entries(users)) {
      const client = createClient(creds.url, creds.anonKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      });
      const signedIn = await measure(`auth.login.${role}`, () =>
        client.auth.signInWithPassword({ email: user.email, password: user.password }),
      );
      assert(!signedIn.error && signedIn.data.session, `${role} password login`);
      clients[role] = client;
      authClients.add(client);
    }
    const patient = clients.patient;
    const refreshed = await measure("auth.session_refresh", () => patient.auth.refreshSession());
    assert(
      !refreshed.error && refreshed.data.session,
      "Auth refresh returns a session before password recovery",
    );
    const recovery = await measure("auth.password_recovery_request", () =>
      patient.auth.resetPasswordForEmail(users.patient.email),
    );
    assert(!recovery.error, "local password recovery request accepted");
    recoveryEmailAddress = users.patient.email;
    const recoveryMail = await measure("auth.password_recovery_complete", () =>
      completePasswordRecovery(users.patient.email, patient, creds.url, creds.anonKey),
    );
    assert(
      recoveryMail.completed,
      "password recovery link completes and changes the synthetic user's password",
    );
    users.patient.password = recoveryMail.newPassword;
    await expectDenied(
      createClient(creds.url, creds.anonKey).auth.signInWithPassword({
        email: users.patient.email,
        password: "invalid-password",
      }),
      "invalid password rejected",
    );
    await expectDenied(
      createClient(creds.url, creds.anonKey).from("patients").select("id").limit(1),
      "anonymous patient data request is denied",
    );
    const expired = createClient(creds.url, creds.anonKey, { auth: { persistSession: false } });
    await expectDenied(
      expired.auth.getUser(createExpiredJwt(creds.jwtSecret)),
      "expired token rejected",
    );

    ids.patient_id = users.patient.id;
    ids.other_patient_id = users["other-patient"].id;
    ids.doctor_user_id = users.doctor.id;
    ids.clinic_staff_id = users["clinic-staff"].id;
    ids.clinic_admin_id = users["clinic-admin"].id;
    ids.platform_admin_id = users["platform-admin"].id;
    ids.clinic_applicant_id = users["clinic-applicant"].id;
    ids.doctor_applicant_id = users["doctor-applicant"].id;
    ids.unauthorized_id = users.unauthorized.id;
    ids.owner_token = ownerToken;
    ids.run_label = runLabel;
    ids.clinic_name = `Synthetic CI Clinic ${runId}`;
    ids.clinic_email = `clinic+${runId}@tests.invalid`;
    await psql(creds.databaseUrl, "tests/real-service/seed-owned-fixtures.sql", ids);
    fixturesSeeded = true;

    const clinic = ids.clinic_id;
    const doctor = ids.doctor_id;
    const seededRelationship = await measure("postgrest.synthetic_provider_relationship", () =>
      admin
        .from("clinic_doctors")
        .select("active,verification_state")
        .eq("clinic_id", clinic)
        .eq("doctor_id", doctor)
        .single(),
    );
    assert(
      !seededRelationship.error &&
        seededRelationship.data.active === true &&
        seededRelationship.data.verification_state === "verified",
      "synthetic provider relationship remains verified after authorized fixture seeding",
    );
    const patientProfile = await measure("postgrest.patient_profile", async () => {
      const own = await patient
        .from("patients")
        .select("id,user_id,full_name")
        .eq("user_id", users.patient.id)
        .single();
      const other = await patient
        .from("patients")
        .select("id")
        .eq("user_id", users["other-patient"].id);
      assert(
        !own.error && own.data.user_id === users.patient.id,
        "patient profile is self-readable",
      );
      assert(!other.error && other.data.length === 0, "patient cannot read another profile");
      return own.data;
    });
    assert(patientProfile.id, "patient profile created by Auth trigger");
    const adminClient = clients["platform-admin"];
    await expectDenied(
      clients.patient.rpc("admin_set_clinic_publication_state", {
        p_clinic_id: clinic,
        p_verification_state: "verified",
        p_is_published: false,
        p_contact_permission: "revoked",
        p_booking_enabled: false,
      }),
      "patient cannot change clinic publication",
    );
    const publish = await measure("rpc.admin_publish_provider", () =>
      adminClient.rpc("admin_set_clinic_publication_state", {
        p_clinic_id: clinic,
        p_verification_state: "verified",
        p_is_published: true,
        p_contact_permission: "granted",
        p_booking_enabled: true,
      }),
    );
    const publicationSqlState = safeSqlState(publish.error);
    assert(
      !publish.error,
      `platform admin can publish a verified synthetic provider${publicationSqlState ? ` (SQLSTATE ${publicationSqlState})` : ""}`,
    );
    const discovery = await measure("postgrest.provider_discovery", async () => {
      const docs = await patient.from("doctors").select("id,name").eq("id", doctor).single();
      const clinics = await patient.from("clinics").select("id,name").eq("id", clinic).single();
      assert(
        !docs.error && docs.data.id === doctor,
        "authenticated patient discovers the published doctor",
      );
      assert(
        !clinics.error && clinics.data.id === clinic,
        "authenticated patient discovers the published clinic",
      );
      await expectDenied(
        patient.from("doctor_schedules").select("id").eq("clinic_id", clinic),
        "authenticated patient cannot read published schedules directly",
      );
      const publicDiscovery = createClient(creds.url, creds.anonKey);
      const schedules = await publicDiscovery
        .from("doctor_schedules")
        .select("id")
        .eq("clinic_id", clinic);
      assert(
        !schedules.error && schedules.data.length === 7,
        "anonymous role reads schedules for a published provider",
      );
      return true;
    });
    assert(discovery, "provider discovery requests completed");
    const staffIdentity = await measure("auth.verify_clinic_staff_identity", () =>
      clients["clinic-staff"].auth.getUser(),
    );
    assert(
      !staffIdentity.error && staffIdentity.data.user?.id === users["clinic-staff"].id,
      "clinic staff Auth identity matches its synthetic fixture",
    );
    const seededStaffMembership = await measure("postgrest.verify_seeded_clinic_membership", () =>
      admin
        .from("clinic_memberships")
        .select("user_id,clinic_id,role,active")
        .eq("user_id", users["clinic-staff"].id)
        .eq("clinic_id", clinic)
        .single(),
    );
    assert(
      !seededStaffMembership.error &&
        seededStaffMembership.data.role === "clinic_staff" &&
        seededStaffMembership.data.active === true,
      "service role confirms the synthetic active clinic membership fixture",
    );
    const staffClinicScope = await measure("rpc.verify_clinic_staff_scope", () =>
      clients["clinic-staff"].rpc("get_my_clinic_contacts"),
    );
    assert(
      !staffClinicScope.error && staffClinicScope.data.some((row) => row.clinic_id === clinic),
      "clinic staff scope RPC returns its assigned clinic",
    );
    const staffMemberships = await measure("postgrest.clinic_staff_membership_read", () =>
      clients["clinic-staff"]
        .from("clinic_memberships")
        .select("user_id,clinic_id,role,active")
        .eq("clinic_id", clinic)
        .eq("user_id", users["clinic-staff"].id),
    );
    const membershipSqlState = safeSqlState(staffMemberships.error);
    const membershipRows = Array.isArray(staffMemberships.data)
      ? staffMemberships.data.length
      : "unavailable";
    const membershipResponse = staffMemberships.error ? "error" : `rows ${membershipRows}`;
    const otherMemberships = await clients["other-patient"]
      .from("clinic_memberships")
      .select("clinic_id")
      .eq("clinic_id", clinic);
    assert(
      !staffMemberships.error &&
        staffMemberships.data.length === 1 &&
        staffMemberships.data[0].user_id === users["clinic-staff"].id &&
        staffMemberships.data[0].active === true,
      `clinic staff reads its active membership (${membershipResponse}${membershipSqlState ? `; SQLSTATE ${membershipSqlState}` : ""})`,
    );
    assert(
      !otherMemberships.error && otherMemberships.data.length === 0,
      "unrelated patient cannot read clinic membership",
    );
    const scheduleBefore = await clients["clinic-staff"]
      .from("doctor_schedules")
      .select("id,start_time")
      .eq("clinic_id", clinic)
      .limit(1)
      .single();
    assert(!scheduleBefore.error, "clinic member reads associated schedule");
    const scheduleChanged = await clients["clinic-staff"]
      .from("doctor_schedules")
      .update({ start_time: "07:30" })
      .eq("id", scheduleBefore.data.id)
      .select("id,start_time")
      .single();
    assert(
      !scheduleChanged.error && scheduleChanged.data.start_time.startsWith("07:30"),
      "clinic member can change an associated schedule",
    );
    const scheduleRestored = await clients["clinic-staff"]
      .from("doctor_schedules")
      .update({ start_time: "08:00" })
      .eq("id", scheduleBefore.data.id)
      .select("id")
      .single();
    assert(!scheduleRestored.error, "clinic member can restore schedule fixture");
    await expectDenied(
      clients["other-patient"]
        .from("doctor_schedules")
        .update({ start_time: "07:30" })
        .eq("id", scheduleBefore.data.id)
        .select("id"),
      "unrelated patient cannot edit schedule",
    );

    const nextDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const slots = await measure("rpc.available_slots", () =>
      patient.rpc("get_doctor_slots", {
        p_doctor_id: doctor,
        p_clinic_id: clinic,
        p_date: nextDate,
      }),
    );
    assert(
      !slots.error && Array.isArray(slots.data) && slots.data.length > 1,
      "available slot RPC returns slots",
    );
    const available = slots.data.filter((slot) => slot.available).slice(0, 6);
    assert(available.length >= 6, "at least six synthetic booking slots are available");
    const booked = [];
    for (const [index, slot] of available.slice(0, 5).entries()) {
      const appointmentReason =
        index === 1 ? `Synthetic browser fixture ${runId}` : "Synthetic integration test";
      const appointment = await measure("rpc.book_appointment", () =>
        patient.rpc("book_appointment", {
          p_doctor_id: doctor,
          p_clinic_id: clinic,
          p_date: nextDate,
          p_time: slot.slot_time,
          p_reason: appointmentReason,
        }),
      );
      assert(
        !appointment.error && appointment.data,
        "patient booking RPC succeeds for available slot",
      );
      booked.push(appointment.data);
    }
    const sixth = await patient.rpc("book_appointment", {
      p_doctor_id: doctor,
      p_clinic_id: clinic,
      p_date: nextDate,
      p_time: available[5].slot_time,
      p_reason: "Synthetic limit assertion",
    });
    assert(Boolean(sixth.error), "sixth active booking is rejected");
    const cancellation = await patient
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", booked[0].id)
      .select("id")
      .maybeSingle();
    assert(!cancellation.error && cancellation.data?.id, "patient can cancel owned booking");
    const clinicAppts = await clients["clinic-staff"]
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinic);
    assert(
      !clinicAppts.error && clinicAppts.data.length >= 5,
      "clinic member sees synthetic appointments",
    );
    const doctorAppts = await clients.doctor.rpc("doctor_appointments");
    assert(!doctorAppts.error && doctorAppts.data.length >= 5, "doctor RPC sees own appointments");
    const outsiderAppts = await clients["other-patient"]
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinic);
    assert(
      !outsiderAppts.error && outsiderAppts.data.length === 0,
      "unrelated patient sees no appointment rows",
    );
    const contacts = await clients["clinic-staff"].rpc("get_my_clinic_contacts");
    const deniedContacts = await patient.rpc("get_my_clinic_contacts");
    assert(
      !contacts.error && contacts.data.some((row) => row.clinic_id === clinic),
      "active clinic member can read contact projection",
    );
    assert(
      !deniedContacts.error && deniedContacts.data.length === 0,
      "patient cannot read clinic contact projection",
    );

    const saved = await measure("rpc.saved_provider", () =>
      patient.rpc("toggle_saved_doctor", { p_doctor_id: doctor }),
    );
    assert(!saved.error && saved.data.includes(doctor), "patient saves a provider");
    const unsaved = await patient.rpc("toggle_saved_doctor", { p_doctor_id: doctor });
    assert(!unsaved.error && !unsaved.data.includes(doctor), "patient removes a saved provider");

    const conversation = await measure("postgrest.patient_conversation_create", () =>
      patient
        .from("conversations")
        .insert({
          clinic_id: clinic,
          doctor_id: doctor,
          patient_id: patientProfile.id,
          kind: "appointment",
          appointment_id: booked[1].id,
        })
        .select("id")
        .single(),
    );
    assert(
      !conversation.error && conversation.data.id,
      "patient creates an authorized conversation",
    );
    const conversationId = conversation.data.id;
    const unrelatedConversation = await clients["other-patient"]
      .from("conversations")
      .select("id")
      .eq("id", conversationId);
    assert(
      !unrelatedConversation.error && unrelatedConversation.data.length === 0,
      "conversation is isolated from unrelated patient",
    );
    const unrelatedMessages = await clients["other-patient"]
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    assert(
      !unrelatedMessages.error && unrelatedMessages.data.length === 0,
      "messages are isolated from unrelated patient",
    );

    const patientMessage = `Synthetic patient message ${runId}`;
    const doctorMessage = `Synthetic doctor reply ${runId}`;
    currentIntegrationCheck = "realtime-postgres-readiness";
    psql(creds.databaseUrl, "tests/real-service/assert-realtime-readiness.sql", {});
    assert(true, "PostgreSQL logical replication and messages publication are ready");

    const patientChannel = realtimeChannel(
      patient,
      "patient",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    const clinicChannel = realtimeChannel(
      clients["clinic-staff"],
      "clinic_staff",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    const doctorChannel = realtimeChannel(
      clients.doctor,
      "doctor",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    const outsiderChannel = realtimeChannel(
      clients["other-patient"],
      "unrelated_patient",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    const anonClient = createClient(creds.url, creds.anonKey, { auth: { persistSession: false } });
    authClients.add(anonClient);
    const realtimeAuthReady = await measure("realtime.auth.sync", async () => {
      await Promise.all(
        [
          [patient, users.patient.id, patientChannel],
          [clients["clinic-staff"], users["clinic-staff"].id, clinicChannel],
          [clients.doctor, users.doctor.id, doctorChannel],
          [clients["other-patient"], users["other-patient"].id, outsiderChannel],
        ].map(([client, expectedUserId, state]) =>
          prepareRealtimeAuth(client, expectedUserId, state.diagnostics),
        ),
      );
      return true;
    });
    assert(realtimeAuthReady, "Realtime clients set the token for the expected session identity");
    const anonChannel = realtimeChannel(
      anonClient,
      "anonymous",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    const readiness = await measure("realtime.subscription.readiness", () =>
      Promise.all([
        subscribed(patientChannel),
        subscribed(clinicChannel),
        subscribed(doctorChannel),
        subscribed(outsiderChannel),
        subscribed(anonChannel, { expectedStatus: "CHANNEL_ERROR" }),
      ]),
    );
    assert(
      readiness.every(Boolean),
      "authorized Realtime clients are ready and anonymous subscription is denied",
    );
    const receivedByPatient = waitForInsert(patientChannel, patientMessage);
    const receivedByClinic = waitForInsert(clinicChannel, patientMessage);
    const patientInsert = await patient.from("messages").insert({
      conversation_id: conversationId,
      sender_id: users.patient.id,
      body: patientMessage,
    });
    assert(!patientInsert.error, "patient sends authorized message through PostgREST");
    const patientCanReadInsertedMessage = await verifyRealtimeMessageVisibility(
      patient,
      patientChannel,
      conversationId,
      patientMessage,
    );
    const clinicCanReadInsertedMessage = await verifyRealtimeMessageVisibility(
      clients["clinic-staff"],
      clinicChannel,
      conversationId,
      patientMessage,
    );
    assert(
      patientCanReadInsertedMessage,
      "Realtime patient can SELECT the inserted message under its JWT",
    );
    assert(
      clinicCanReadInsertedMessage,
      "Realtime clinic staff can SELECT the inserted message under its JWT",
    );
    const patientDeliveries = await measure("realtime.patient_message_delivery", () =>
      collectRealtimeDeliveries([receivedByPatient, receivedByClinic]),
    );
    assert(
      patientDeliveries[0] && patientDeliveries[1],
      `Realtime authorized patient message delivery (patient=${patientDeliveries[0] ? "PASS" : "FAIL"}; clinic_staff=${patientDeliveries[1] ? "PASS" : "FAIL"})`,
    );
    const doctorDirectMessages = await clients.doctor
      .from("messages")
      .select("body")
      .eq("conversation_id", conversationId);
    assert(
      !doctorDirectMessages.error &&
        doctorDirectMessages.data.length === 0 &&
        !doctorDirectMessages.data.some((row) => row.body === patientMessage),
      "doctor cannot read protected raw messages outside the scoped inbox RPC",
    );
    const doctorInbox = await clients.doctor.rpc("doctor_conversations");
    assert(
      !doctorInbox.error &&
        doctorInbox.data.some(
          (row) =>
            row.id === conversationId &&
            Array.isArray(row.messages) &&
            row.messages.some((message) => message.body === patientMessage),
        ),
      "doctor receives the patient message through the assigned-conversation RPC",
    );
    const receivedByPatientReply = waitForInsert(patientChannel, doctorMessage);
    const receivedByClinicReply = waitForInsert(clinicChannel, doctorMessage);
    const reply = await clients.doctor
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: users.doctor.id, body: doctorMessage });
    assert(!reply.error, "doctor replies only to assigned conversation");
    const replyDeliveries = await measure("realtime.doctor_reply_delivery", () =>
      collectRealtimeDeliveries([receivedByPatientReply, receivedByClinicReply]),
    );
    assert(
      replyDeliveries[0] && replyDeliveries[1],
      `Realtime authorized doctor reply delivery (patient=${replyDeliveries[0] ? "PASS" : "FAIL"}; clinic_staff=${replyDeliveries[1] ? "PASS" : "FAIL"})`,
    );
    const doctorInboxAfterReply = await clients.doctor.rpc("doctor_conversations");
    assert(
      !doctorInboxAfterReply.error &&
        doctorInboxAfterReply.data.some(
          (row) =>
            row.id === conversationId &&
            Array.isArray(row.messages) &&
            [patientMessage, doctorMessage].every((body) =>
              row.messages.some((message) => message.body === body),
            ),
        ),
      "doctor receives both message directions through the scoped inbox RPC",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const outsiderDelivery = await noInsert(outsiderChannel, patientMessage);
    const anonDelivery = await noInsert(anonChannel, patientMessage);
    const doctorRawDelivery = await noInsert(doctorChannel, patientMessage);
    assert(
      !outsiderDelivery && !anonDelivery && !doctorRawDelivery,
      "unrelated, anonymous, and doctor raw-table subscribers receive no unauthorized events",
    );
    assert(
      authenticatedRealtimeAuthChecksPass(realtimeDiagnostics),
      "Auth API accepts every authenticated Realtime identity",
    );

    const beforeReconnect = await closeRealtimeResources(realtimeResources);
    realtimeShutdownResults.push(beforeReconnect);
    if (beforeReconnect.verified) realtimeResources.length = 0;
    assert(beforeReconnect.verified, "Realtime channels close before reconnect verification");

    const refreshedChannel = realtimeChannel(
      patient,
      "patient",
      conversationId,
      realtimeResources,
      realtimeDiagnostics,
    );
    refreshedChannel.diagnostics.auth = { ...patientChannel.diagnostics.auth };
    await subscribed(refreshedChannel);
    const reconnection = `Synthetic reconnect check ${runId}`;
    const reconnected = waitForInsert(refreshedChannel, reconnection);
    const reconnectMessage = await patient
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: users.patient.id, body: reconnection });
    assert(!reconnectMessage.error, "message insert succeeds after realtime reconnect");
    const reconnectDelivery = await measure("realtime.reconnect_delivery", () => reconnected);
    assert(reconnectDelivery, "patient receives a message after a fresh Realtime connection");
    const afterReconnect = await closeRealtimeResources(realtimeResources);
    realtimeShutdownResults.push(afterReconnect);
    if (afterReconnect.verified) realtimeResources.length = 0;
    assert(
      afterReconnect.verified,
      "Realtime channels and sockets close after reconnect verification",
    );

    storagePath = `${users.patient.id}/avatar`;
    const bucket = await admin.storage.getBucket("avatars");
    assert(!bucket.error && bucket.data.public === false, "avatars bucket remains private");
    const avatar = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: "image/png",
    });
    const upload = await measure("storage.authenticated_upload", () =>
      patient.storage
        .from("avatars")
        .upload(storagePath, avatar, { contentType: "image/png", upsert: true }),
    );
    assert(!upload.error, "authenticated owner uploads private avatar");
    const retrieve = await patient.storage.from("avatars").download(storagePath);
    assert(!retrieve.error && retrieve.data, "owner retrieves private avatar");
    const unauthorizedRetrieve = await clients["other-patient"].storage
      .from("avatars")
      .download(storagePath);
    assert(Boolean(unauthorizedRetrieve.error), "unrelated patient cannot retrieve private avatar");
    const anonymousRetrieve = await anonClient.storage.from("avatars").download(storagePath);
    assert(Boolean(anonymousRetrieve.error), "anonymous user cannot retrieve private avatar");
    const unauthorizedUpload = await clients["other-patient"].storage
      .from("avatars")
      .upload(storagePath, avatar, { contentType: "image/png", upsert: true });
    assert(Boolean(unauthorizedUpload.error), "unrelated patient cannot overwrite private avatar");
    const removed = await patient.storage.from("avatars").remove([storagePath]);
    assert(!removed.error, "owner removes private avatar");

    const clinicApplication = await clients["clinic-applicant"]
      .from("provider_applications")
      .insert({
        clinic_name: `Synthetic applicant clinic ${runId}`,
        area: "Test area",
        address: "Synthetic test address 123",
        contact_name: "Synthetic Applicant",
        contact_role: "manager",
        contact_phone: "+919000000000",
        contact_email: safeEmail(runId, "clinic-contact"),
        registration_details: "Synthetic integration-only registration",
      })
      .select("id")
      .single();
    assert(
      !clinicApplication.error && clinicApplication.data.id,
      "provider applicant submits application",
    );
    await expectDenied(
      clients["clinic-applicant"].rpc("admin_review_provider_application", {
        p_application_id: clinicApplication.data.id,
        p_approve: false,
        p_note: "Synthetic non-admin review attempt",
      }),
      "clinic applicant cannot review provider applications",
    );
    const clinicReviewed = await adminClient.rpc("admin_review_provider_application", {
      p_application_id: clinicApplication.data.id,
      p_approve: true,
      p_note: "Synthetic CI review",
    });
    assert(
      !clinicReviewed.error && clinicReviewed.data,
      "platform admin approves provider application",
    );
    ids.extra_clinic_ids = [clinicReviewed.data];
    const applicantMembership = await clients["clinic-applicant"]
      .from("clinic_memberships")
      .select("clinic_id,role,active")
      .eq("clinic_id", clinicReviewed.data)
      .single();
    assert(
      !applicantMembership.error &&
        applicantMembership.data.role === "clinic_admin" &&
        applicantMembership.data.active,
      "approved provider applicant receives only the intended clinic-admin membership",
    );
    const doctorApplication = await clients["doctor-applicant"]
      .from("doctor_applications")
      .insert({
        full_name: "Synthetic Applicant Doctor",
        specialty_id: "general",
        qualifications: "Synthetic test qualification",
        registration_council: "Synthetic test council",
        registration_number: `CI-${runId}`,
        experience_years: 1,
        consultation_fee: 100,
        contact_phone: "+919000000001",
        contact_email: safeEmail(runId, "doctor-contact"),
      })
      .select("id")
      .single();
    assert(
      !doctorApplication.error && doctorApplication.data.id,
      "doctor applicant submits application",
    );
    await expectDenied(
      clients["doctor-applicant"].rpc("admin_review_doctor_application", {
        p_application_id: doctorApplication.data.id,
        p_approve: false,
        p_note: "Synthetic non-admin review attempt",
        p_existing_doctor_id: null,
      }),
      "doctor applicant cannot review doctor applications",
    );
    const doctorReviewed = await adminClient.rpc("admin_review_doctor_application", {
      p_application_id: doctorApplication.data.id,
      p_approve: true,
      p_note: "Synthetic CI review",
      p_existing_doctor_id: null,
    });
    assert(
      !doctorReviewed.error && doctorReviewed.data,
      "platform admin approves doctor application",
    );
    ids.extra_doctor_ids = [doctorReviewed.data];
    const approvedDoctor = await clients["doctor-applicant"]
      .from("doctors")
      .select("id,user_id")
      .eq("id", doctorReviewed.data)
      .single();
    assert(
      !approvedDoctor.error && approvedDoctor.data.user_id === users["doctor-applicant"].id,
      "approved doctor applicant can read only the newly linked doctor identity",
    );
    await expectDenied(
      clients["unauthorized"]
        .from("clinics")
        .update({ is_published: false })
        .eq("id", clinic)
        .select("id"),
      "unauthorized user cannot update publication columns",
    );
    await expectDenied(
      anonClient.rpc("book_appointment", {
        p_doctor_id: doctor,
        p_clinic_id: clinic,
        p_date: nextDate,
        p_time: available[5].slot_time,
        p_reason: "Synthetic unauthorized booking",
      }),
      "anonymous booking is rejected",
    );

    const browserDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const browserSlots = await measure("rpc.browser_booking_slots", () =>
      patient.rpc("get_doctor_slots", {
        p_doctor_id: ids.doctor_id,
        p_clinic_id: ids.clinic_id,
        p_date: browserDate,
      }),
    );
    const browserSlot = browserSlots.data?.find((slot) => slot.available);
    assert(
      !browserSlots.error && browserSlot,
      "a disposable slot exists for the UI booking workflow",
    );
    const browserTime = browserSlot.slot_time.slice(0, 5);
    ids.browser_appointment_reason = `Synthetic UI appointment ${runId}`;
    browserRunnerFailed = !(await runBrowserFlow({
      creds,
      users,
      ids,
      runId,
      conversationId,
      browserDate,
      browserTime,
    }));
    const signedOut = await measure("auth.logout", () => patient.auth.signOut());
    assert(!signedOut.error, "patient logout succeeds");
    const userAfterLogout = await patient.auth.getUser();
    assert(
      Boolean(userAfterLogout.error) || !userAfterLogout.data.user,
      "logout removes active session",
    );
    serviceStatus = "PASS";
  } catch (error) {
    serviceStatus = "FAIL";
    throw error;
  } finally {
    // Close WebSockets before fixture cleanup so a failed subscription cannot hold the runner open.
    const realtimeShutdown = await closeRealtimeResources(realtimeResources);
    realtimeShutdownResults.push(realtimeShutdown);
    realtimeResources.length = 0;
    // Revoke sessions and stop auth timers before deleting run-owned identities and rows.
    const authShutdown = await closeAuthResources([...authClients]);
    if (storagePath && users.patient) {
      try {
        await admin.storage.from("avatars").remove([storagePath]);
      } catch {}
    }
    if (fixturesSeeded) {
      try {
        psql(creds.databaseUrl, "tests/real-service/cleanup-owned-fixtures.sql", {
          owner_token: ownerToken,
          run_label: runLabel,
        });
      } catch {
        cleanupSqlSucceeded = false;
      }
    } else {
      try {
        unseededApplicationProfilesCleaned = await removeUnseededApplicationUsers(
          admin,
          Object.values(users).map((user) => user.id),
        );
      } catch {
        unseededApplicationProfilesCleaned = false;
      }
    }
    for (const user of Object.values(users)) {
      try {
        await admin.auth.admin.deleteUser(user.id);
      } catch {}
    }
    let recoveryMailCleaned = true;
    if (recoveryEmailAddress) {
      try {
        await deleteRecoveryEmail(recoveryEmailAddress);
      } catch {
        recoveryMailCleaned = false;
      }
    }
    cleanupResult = await verifyCleanup(
      admin,
      Object.values(users).map((user) => user.id),
      ids,
      initialCounts,
    );
    cleanupResult.realtime_shutdown = realtimeShutdownResults;
    cleanupResult.realtime_shutdown_verified = realtimeShutdownResults.every(
      (result) => result.verified,
    );
    cleanupResult.auth_shutdown = authShutdown;
    cleanupResult.recovery_email_cleaned = recoveryMailCleaned;
    cleanupResult.sql_succeeded = cleanupSqlSucceeded;
    cleanupResult.unseeded_application_profiles_cleaned = unseededApplicationProfilesCleaned;
    cleanupResult.verified =
      cleanupResult.verified &&
      cleanupResult.realtime_shutdown_verified &&
      authShutdown.verified &&
      recoveryMailCleaned &&
      cleanupSqlSucceeded &&
      unseededApplicationProfilesCleaned;
    serviceAssertions.push({
      name: "runner-owned synthetic fixtures are removed and verified",
      status: cleanupResult.verified ? "PASS" : "FAIL",
    });
    const browserEvidence = readBrowserWorkflowEvidence();
    const testCases = [
      { name: "real-service-interaction-suite", status: serviceStatus },
      {
        name: "runner-owned-fixture-cleanup",
        status: cleanupResult.verified ? "PASS" : "FAIL",
      },
      ...browserEvidence.workflows.map(({ name, status }) => ({ name, status })),
    ];
    const testCaseCounts = {
      total: testCases.length,
      passed: testCases.filter((item) => item.status === "PASS").length,
      failed: testCases.filter((item) => item.status === "FAIL").length,
      blocked: testCases.filter((item) => item.status === "BLOCKED").length,
    };
    const assertionCounts = {
      total: serviceAssertions.length + browserEvidence.assertions.total,
      passed:
        serviceAssertions.filter((item) => item.status === "PASS").length +
        browserEvidence.assertions.passed,
      failed:
        serviceAssertions.filter((item) => item.status === "FAIL").length +
        browserEvidence.assertions.failed,
    };
    writeSafe(
      "real-service-summary.json",
      JSON.stringify(
        {
          environment: "disposable-local-supabase",
          migration_count: 41,
          pg_tap_files: 22,
          initial_counts: initialCounts,
          test_cases: { ...testCaseCounts, results: testCases },
          assertions: {
            ...assertionCounts,
            service: serviceAssertions,
            browser: browserEvidence.assertions.results,
          },
          service_operations: {
            kind: "instrumented service calls; COMPLETED means the call returned",
            total: serviceOperations.length,
            completed: serviceOperations.filter((item) => item.status === "COMPLETED").length,
            threw: serviceOperations.filter((item) => item.status === "THREW").length,
            results: serviceOperations,
          },
          workflows: browserEvidence.workflow_counts,
          timings_ms: timings,
          cleanup: cleanupResult,
          realtime_diagnostics: sanitizeRealtimeDiagnostics(realtimeDiagnostics),
          failure:
            serviceStatus === "FAIL"
              ? { stage: currentIntegrationCheck, category: "service-integration" }
              : null,
        },
        null,
        2,
      ),
    );
    console.log(
      `Test cases: ${testCaseCounts.passed} passed, ${testCaseCounts.failed} failed, ${testCaseCounts.blocked} blocked. Assertions: ${assertionCounts.passed} passed, ${assertionCounts.failed} failed. Instrumented service operations: ${serviceOperations.length}; browser workflows: ${browserEvidence.workflow_counts.passed} passed, ${browserEvidence.workflow_counts.failed} failed, ${browserEvidence.workflow_counts.blocked} blocked; Realtime shutdown ${cleanupResult.realtime_shutdown_verified ? "verified" : "failed"}; Auth shutdown ${authShutdown.verified ? "verified" : "failed"}; cleanup ${cleanupResult.verified ? "verified" : "failed"}.`,
    );
    activeAssertionResults = null;
  }
  if (!cleanupResult?.verified)
    throw new Error("runner-owned fixture cleanup could not be independently verified");
  if (browserRunnerFailed)
    throw new Error("one or more real-service browser workflows did not pass");
}

function createExpiredJwt(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", role: "authenticated", sub: randomUUID(), exp: 1, iat: 0 })}`;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

async function completePasswordRecovery(email, client, serviceUrl, anonKey) {
  const url = "http://127.0.0.1:54324";
  assertLoopbackUrl(url, 54324);
  const query = new URLSearchParams({ query: `to:"${email}"`, limit: "5" });
  let messages = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${url}/api/v1/search?${query}`);
    if (!response.ok) throw new Error("local email capture service request failed");
    const result = await response.json();
    if (Array.isArray(result.messages) && result.messages.length > 0) {
      messages = result.messages;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const summary = messages[0];
  if (!summary?.ID) return { completed: false };
  const messageResponse = await fetch(`${url}/api/v1/message/${encodeURIComponent(summary.ID)}`);
  if (!messageResponse.ok) throw new Error("local recovery message could not be read");
  const message = await messageResponse.json();
  const content = `${message.Text || ""}\n${message.HTML || ""}`.replace(/&amp;/g, "&");
  const confirmationUrl = content
    .match(/https?:\/\/[^\s\"'<>]+/g)
    ?.find((raw) => raw.includes("/auth/v1/verify") && /[?&]type=recovery(?:&|$)/.test(raw));
  if (!confirmationUrl) throw new Error("local recovery email link was not recognized");
  assertLoopbackUrl(new URL(confirmationUrl).origin, 54321);
  const verification = await fetch(confirmationUrl, { redirect: "manual" });
  const location = verification.headers.get("location");
  if (verification.status < 300 || verification.status >= 400 || !location) {
    throw new Error("local recovery link exchange was rejected");
  }
  const redirect = new URL(location);
  const fragment = new URLSearchParams(redirect.hash.replace(/^#/, ""));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken || fragment.get("type") !== "recovery") {
    throw new Error("local recovery link did not return a recovery session");
  }
  const session = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (session.error || session.data.session?.user.email !== email) {
    throw new Error("local recovery session could not be established");
  }
  const newPassword = password();
  const update = await client.auth.updateUser({ password: newPassword });
  if (update.error) throw new Error("local recovery session could not change the password");
  const check = createClient(serviceUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await check.auth.signInWithPassword({ email, password: newPassword });
  if (login.error || !login.data.session) {
    throw new Error("password recovery password was rejected on login");
  }
  await check.auth.signOut();
  return { completed: true, newPassword };
}

async function deleteRecoveryEmail(email) {
  const url = "http://127.0.0.1:54324";
  assertLoopbackUrl(url, 54324);
  const query = new URLSearchParams({ query: `to:"${email}"` });
  const response = await fetch(`${url}/api/v1/search?${query}`, { method: "DELETE" });
  if (!response.ok) throw new Error("runner-owned recovery email cleanup failed");
}

function realtimeChannel(client, role, conversationId, resources, diagnosticsCollection) {
  const state = {
    delivered: [],
    pending: new Set(),
    role,
    conversationId,
    diagnostics: {
      role,
      auth: {
        mode: role === "anonymous" ? "anonymous" : "unknown",
        sessionPresent: false,
        sessionIdentityMatched: false,
        authApiCheck: "not-checked",
        authApiStatus: null,
        authApiErrorCode: "none",
        realtimeAuthSet: false,
      },
      subscription: { statuses: [], errorKinds: [], ready: false },
      rowVisibility: { checked: false, visible: false, rowCount: 0 },
      delivery: {
        eventCount: 0,
        payloadFieldsPresent: false,
        conversationFilterMatched: false,
        expectedMessageMatched: false,
        waitOutcome: "not-started",
      },
    },
  };
  const channel = client
    .channel(`careconnect-ci-${randomUUID()}`, realtimePostgresChangesOptions())
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        recordRealtimePayload(state, payload);
      },
    );
  state.channel = channel;
  resources.push({ client, channel, state });
  diagnosticsCollection.push(state.diagnostics);
  return state;
}

export function subscribed(state, { expectedStatus = "SUBSCRIBED" } = {}) {
  if (!["SUBSCRIBED", "CHANNEL_ERROR"].includes(expectedStatus)) {
    throw new Error("invalid expected Realtime subscription status");
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    let timeout;
    const pending = {
      cancel: () => finish(resolve, false),
    };
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      state.pending.delete(pending);
      callback(value);
    };
    state.pending.add(pending);
    timeout = setTimeout(() => {
      finish(reject, new Error("realtime subscription readiness timeout"));
    }, 15_000);
    try {
      state.channel.subscribe((status, error) => {
        const safeStatus = ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)
          ? status
          : "OTHER";
        state.diagnostics.subscription.statuses.push(safeStatus);
        const errorKind = error ? classifyRealtimeChannelError(error) : null;
        if (errorKind) state.diagnostics.subscription.errorKinds.push(errorKind);
        if (status === expectedStatus) {
          if (status === "CHANNEL_ERROR" && errorKind !== "authorization-denied") {
            finish(
              reject,
              new Error("anonymous Realtime subscription was not denied by authorization"),
            );
            return;
          }
          if (status === "SUBSCRIBED") {
            state.diagnostics.subscription.ready = true;
          }
          finish(resolve, true);
          return;
        }
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          finish(reject, new Error("realtime subscription failed"));
        }
      });
    } catch {
      finish(reject, new Error("realtime subscription failed"));
    }
  });
}

function waitForInsert(state, body) {
  if (state.delivered.includes(body)) {
    state.diagnostics.delivery.expectedMessageMatched = true;
    state.diagnostics.delivery.waitOutcome = "matched";
    return Promise.resolve(true);
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    let timeout;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      state.pending.delete(pending);
      callback(value);
    };
    const pending = {
      body,
      deliver: () => {
        state.diagnostics.delivery.waitOutcome = "matched";
        finish(resolve, true);
      },
      cancel: () => {
        state.diagnostics.delivery.waitOutcome = "cancelled";
        finish(resolve, false);
      },
    };
    state.pending.add(pending);
    timeout = setTimeout(() => {
      state.diagnostics.delivery.waitOutcome = "timeout";
      finish(reject, new Error("realtime message delivery timeout"));
    }, 15_000);
  });
}

async function verifyRealtimeMessageVisibility(client, state, conversationId, body) {
  const result = await client
    .from("messages")
    .select("id,conversation_id")
    .eq("conversation_id", conversationId)
    .eq("body", body);
  const rows = Array.isArray(result?.data) ? result.data : [];
  const visible =
    !result?.error &&
    rows.length === 1 &&
    rows[0]?.conversation_id === conversationId &&
    typeof rows[0]?.id === "string";
  state.diagnostics.rowVisibility = {
    checked: true,
    visible,
    rowCount: rows.length,
  };
  return visible;
}

function noInsert(state, body) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const matched = state.delivered.includes(body);
      state.diagnostics.delivery.expectedMessageMatched = matched;
      state.diagnostics.delivery.waitOutcome = matched ? "matched" : "not-observed";
      resolve(matched);
    }, 1_500);
  });
}

async function runBrowserFlow({
  creds,
  users,
  ids,
  runId,
  conversationId,
  browserDate,
  browserTime,
}) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    RUNNER_TEMP: process.env.RUNNER_TEMP,
    CI: "true",
    CARECONNECT_REAL_SERVICE: "1",
    CARECONNECT_RUN_ID: runId,
    CARECONNECT_PATIENT_EMAIL: users.patient.email,
    CARECONNECT_PATIENT_PASSWORD: users.patient.password,
    CARECONNECT_CLINIC_EMAIL: users["clinic-staff"].email,
    CARECONNECT_CLINIC_PASSWORD: users["clinic-staff"].password,
    CARECONNECT_DOCTOR_EMAIL: users.doctor.email,
    CARECONNECT_DOCTOR_PASSWORD: users.doctor.password,
    CARECONNECT_ADMIN_EMAIL: users["platform-admin"].email,
    CARECONNECT_ADMIN_PASSWORD: users["platform-admin"].password,
    CARECONNECT_UNAUTHORIZED_EMAIL: users.unauthorized.email,
    CARECONNECT_UNAUTHORIZED_PASSWORD: users.unauthorized.password,
    CARECONNECT_CLINIC_ID: ids.clinic_id,
    CARECONNECT_CLINIC_NAME: ids.clinic_name,
    CARECONNECT_DOCTOR_ID: ids.doctor_id,
    CARECONNECT_BROWSER_APPOINTMENT_REASON: ids.browser_appointment_reason,
    CARECONNECT_CONVERSATION_ID: conversationId,
    CARECONNECT_BROWSER_DATE: browserDate,
    CARECONNECT_BROWSER_TIME: browserTime,
    VITE_SUPABASE_URL: creds.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: creds.anonKey,
    PLAYWRIGHT_REAL_SERVICE_BASE_URL: "http://127.0.0.1:4173",
  };
  const proc = spawnSyncBounded(
    "npx",
    ["playwright", "test", "--config=playwright.real-service.config.ts"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      timeoutMs: 15 * 60 * 1000,
    },
  );
  const evidence = readBrowserWorkflowEvidence();
  writeSafe("browser-workflow-summary.json", JSON.stringify(evidence, null, 2));
  return (
    proc.status === 0 &&
    evidence.test_cases.total === browserWorkflowNames.length &&
    evidence.workflow_counts.failed === 0 &&
    evidence.workflow_counts.blocked === 0
  );
}

export function safeFailureCategory(error) {
  const message = String(error?.message || "");
  if (/realtime/i.test(message)) return "realtime-delivery";
  if (/cleanup/i.test(message)) return "cleanup";
  if (/\b(?:Auth|login|session|password)\b/i.test(message)) return "auth";
  if (/Storage|avatar/i.test(message)) return "storage";
  if (/publication|booking|appointment/i.test(message)) return "booking-or-publication";
  if (/provider|clinic|doctor/i.test(message)) return "provider-workflow";
  return "service-assertion";
}

async function verifyCleanup(admin, userIds, ids, initialCounts) {
  const checks = [];
  const clinicIds = [ids.clinic_id, ...(ids.extra_clinic_ids || [])];
  const doctorIds = [ids.doctor_id, ...(ids.extra_doctor_ids || [])];
  for (const [table, column, values] of [
    ["users", "id", userIds],
    ["patients", "user_id", userIds],
    ["appointments", "clinic_id", clinicIds],
    ["appointments", "doctor_id", doctorIds],
    ["conversations", "clinic_id", clinicIds],
    ["messages", "sender_id", userIds],
    ["provider_applications", "applicant_id", userIds],
    ["doctor_applications", "applicant_id", userIds],
    ["clinic_memberships", "user_id", userIds],
    ["doctor_schedules", "clinic_id", clinicIds],
    ["doctor_schedules", "doctor_id", doctorIds],
    ["clinic_doctors", "clinic_id", clinicIds],
    ["clinic_doctors", "doctor_id", doctorIds],
    ["doctors", "id", doctorIds],
    ["clinics", "id", clinicIds],
  ]) {
    checks.push({ table, count: await countOwnedRecords(admin, table, column, values) });
  }
  let authUsersAbsent = true;
  for (const id of userIds) {
    const response = await admin.auth.admin.getUserById(id);
    if (response.data.user) authUsersAbsent = false;
  }
  const objectList = await admin.storage.from("avatars").list();
  const authAfter = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authAfter.error || authAfter.data.users.length !== 0) authUsersAbsent = false;
  const storageEmptyForRun =
    !objectList.error && !objectList.data.some((item) => item.name === ids.patient_id);
  const noOwnedRows = checks.every((check) => check.count === 0);
  const restoredCounts = [];
  for (const [table, expected] of Object.entries(initialCounts?.counts || {})) {
    if (["auth_users", "storage_objects"].includes(table)) continue;
    const result = await admin.from(table).select("*", { count: "exact", head: true });
    const count = result.error ? null : result.count;
    restoredCounts.push({ table, count, matches_baseline: count === expected });
  }
  const authCountMatchesBaseline =
    !authAfter.error && authAfter.data.users.length === initialCounts?.counts.auth_users;
  const storageCountMatchesBaseline =
    !objectList.error && objectList.data.length === initialCounts?.counts.storage_objects;
  const baselineRestored =
    Boolean(initialCounts?.verified) &&
    restoredCounts.every((item) => item.matches_baseline) &&
    authCountMatchesBaseline &&
    storageCountMatchesBaseline;
  return {
    auth_users_absent: authUsersAbsent,
    storage_empty_for_run: storageEmptyForRun,
    owned_table_counts: checks,
    restored_table_counts: restoredCounts,
    baseline_restored: baselineRestored,
    verified: authUsersAbsent && storageEmptyForRun && noOwnedRows && baselineRestored,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    if (command === "preflight") preflight();
    else if (command === "verify-migrations") {
      const { files, tests } = verifyRepositoryIntegrity();
      console.log(
        `Integrity PASS: ${files.length} migration files, ending ${files.at(-1)}; ${tests.length} pgTAP files; alias ${aliasFile}.`,
      );
    } else if (command === "startup-summary") rawStartupSummary(false);
    else if (command === "startup-failure-summary") rawStartupSummary(true);
    else if (command === "run") await runIntegration();
    else throw new Error("unknown real-service integration command");
  } catch (error) {
    console.error(`Real-service integration failed: ${safeFailureCategory(error)}.`);
    process.exitCode = 1;
  }
}
