import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Default service candidates from the CLI 2.117.0 image manifest. Only these
// fixed aliases leave the process; Docker's image metadata remains private.
const images = {
  postgres: ["postgres:17.6.1.167", "supabase/postgres:17.6.1.167"],
  kong: ["kong:2.8.1", "kong:2.8.1"],
  auth: ["gotrue:v2.196.0", "supabase/gotrue:v2.196.0"],
  mailpit: ["mailpit:v1.30.2", "axllent/mailpit:v1.30.2"],
  realtime: ["realtime:v2.130.0", "supabase/realtime:v2.130.0"],
  postgrest: ["postgrest:v16.2", "postgrest/postgrest:v16.2"],
  storage: ["storage-api:v1.72.1", "supabase/storage-api:v1.72.1"],
  pg_meta: ["postgres-meta:v0.99.0", "supabase/postgres-meta:v0.99.0"],
  studio: ["studio:2026.08.24-sha-8ec45b2", "supabase/studio:2026.08.24-sha-8ec45b2"],
  edge_runtime: ["edge-runtime:v1.74.3", "supabase/edge-runtime:v1.74.3"],
  analytics: ["logflare:1.50.6", "supabase/logflare:1.50.6"],
  vector: ["vector:0.53.0-alpine", "timberio/vector:0.53.0-alpine"],
};
const services = [
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
const projectLabel = "com.supabase.cli.project";

function validProject(id) {
  return typeof id === "string" && id.length <= 40 && /^careconnect-ci-\d{1,20}-\d{1,6}$/.test(id);
}

export function rewriteProjectId(config, projectId) {
  if (!validProject(projectId)) throw new Error("invalid project id");
  const pattern = /^project_id[ \t]*=[ \t]*"[^"\r\n]*"[ \t]*$/gm;
  if ([...config.matchAll(pattern)].length !== 1) throw new Error("invalid generated config");
  return config.replace(pattern, `project_id = "${projectId}"`);
}

function runDocker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("docker inspection failed");
  return result.stdout;
}

function save(filename, value) {
  mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  writeFileSync(filename, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}

export function imagePresence(rows) {
  if (
    !Array.isArray(rows) ||
    rows.some((row) => typeof row?.Repository !== "string" || typeof row?.Tag !== "string")
  )
    return Object.fromEntries(Object.keys(images).map((key) => [key, "unavailable"]));
  return Object.fromEntries(
    Object.entries(images).map(([service, [mirror, original]]) => {
      const refs = [
        `public.ecr.aws/supabase/${mirror}`,
        `ghcr.io/supabase/${mirror}`,
        original,
        `docker.io/${original}`,
        ...(service === "kong" ? ["library/kong:2.8.1", "docker.io/library/kong:2.8.1"] : []),
      ];
      const present = rows.some(
        (row) =>
          typeof row?.Repository === "string" &&
          typeof row?.Tag === "string" &&
          refs.includes(`${row.Repository}:${row.Tag}`),
      );
      return [service, present ? "present" : "not-present"];
    }),
  );
}

function readImages() {
  try {
    const lines = runDocker(["image", "ls", "--format", "{{json .}}"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length > 10000) return imagePresence(null);
    return imagePresence(lines.map((line) => JSON.parse(line)));
  } catch {
    return imagePresence(null);
  }
}

export function sanitizeContainers(containers, projectId, networkName) {
  if (!validProject(projectId) || !Array.isArray(containers) || containers.length > 100) {
    return { inspection: "unavailable", services: [] };
  }
  const results = [];
  for (const item of containers) {
    if (item?.Config?.Labels?.[projectLabel] !== projectId || typeof item.Name !== "string")
      continue;
    const suffix = services.find((name) => item.Name === `/supabase_${name}_${projectId}`);
    if (!suffix) continue;
    if (results.some((row) => row.service === suffix))
      return { inspection: "unavailable", services: [] };
    const state = item.State ?? {};
    const status = [
      "created",
      "running",
      "paused",
      "restarting",
      "removing",
      "exited",
      "dead",
    ].includes(state.Status)
      ? state.Status
      : "unknown";
    const exitCode =
      Number.isInteger(state.ExitCode) && state.ExitCode >= 0 && state.ExitCode <= 255
        ? state.ExitCode
        : null;
    const health =
      state.Health === undefined
        ? "none"
        : ["starting", "healthy", "unhealthy"].includes(state.Health?.Status)
          ? state.Health.Status
          : "unknown";
    const networks = item.NetworkSettings?.Networks;
    const attached =
      networks && typeof networks === "object" && !Array.isArray(networks)
        ? Object.hasOwn(networks, networkName)
        : null;
    results.push({
      service: suffix,
      state: status,
      exit_code: exitCode,
      health,
      expected_network_attached: attached,
    });
  }
  return {
    inspection: "completed",
    services: services.map(
      (service) =>
        results.find((row) => row.service === service) ?? {
          service,
          state: "unavailable",
          exit_code: null,
          health: "unavailable",
          expected_network_attached: null,
        },
    ),
  };
}

function containerIds(projectId) {
  const ids = runDocker([
    "ps",
    "--all",
    "--quiet",
    "--filter",
    `label=${projectLabel}=${projectId}`,
  ])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (ids.length > 100 || ids.some((id) => !/^[a-f0-9]{12,64}$/i.test(id)))
    throw new Error("invalid container ids");
  return ids;
}

function projectContainers(projectId) {
  const ids = containerIds(projectId);
  return ids.length ? JSON.parse(runDocker(["inspect", ...ids])) : [];
}

export function imagePreparation(raw, startupOutcome) {
  if (startupOutcome === "success") return "completed";
  return typeof raw === "string" && /^Starting containers\.\.\.\r?$/m.test(raw)
    ? "completed"
    : "unavailable";
}

export function ownershipVerified(baseline, owner, projectId) {
  return (
    validProject(projectId) &&
    baseline?.ownership_baseline === "clear" &&
    owner?.ownership_baseline === "clear" &&
    owner?.project_id === projectId
  );
}

export function projectCollision({
  projectId,
  ids,
  labeledVolumes,
  labeledNetworks,
  containerNames,
  volumeNames,
  networkNames,
}) {
  if (
    !validProject(projectId) ||
    ![ids, labeledVolumes, labeledNetworks, containerNames, volumeNames, networkNames].every(
      (list) => Array.isArray(list) && list.every((item) => typeof item === "string"),
    )
  )
    return true;
  const ownedNames = new Set(services.map((service) => `supabase_${service}_${projectId}`));
  return (
    ids.length > 0 ||
    labeledVolumes.length > 0 ||
    labeledNetworks.length > 0 ||
    containerNames.some((name) => ownedNames.has(name)) ||
    volumeNames.some(
      (name) =>
        typeof name === "string" && name.startsWith("supabase_") && name.endsWith(`_${projectId}`),
    ) ||
    networkNames.includes(`supabase_network_${projectId}`) ||
    networkNames.includes(projectId)
  );
}

export function processEvidence(input) {
  const bounded = (value, max) =>
    Number.isInteger(value) && value >= 0 && value <= max ? value : null;
  return {
    cli_exit_code: bounded(input?.cli_exit_code, 255),
    elapsed_ms: bounded(input?.elapsed_ms, 5_400_000),
  };
}

function safeRaw(filename) {
  try {
    if (statSync(filename).size > 4 * 1024 * 1024) return null;
    return readFileSync(filename, "utf8");
  } catch {
    return null;
  }
}

function main() {
  const [mode, projectId, file, networkName, outcome] = process.argv.slice(2);
  const expectedProject = `careconnect-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    !validProject(projectId) ||
    projectId !== expectedProject
  )
    throw new Error("invalid CI project id");
  if (mode === "configure") {
    if (path.resolve(file) !== path.resolve("supabase/config.toml"))
      throw new Error("invalid config path");
    if (
      existsSync("supabase/.temp/project-ref") ||
      existsSync("supabase/.temp/linked-project.json")
    )
      throw new Error("linked metadata present");
    writeFileSync(file, rewriteProjectId(readFileSync(file, "utf8"), projectId));
  } else if (mode === "before") {
    const volumes = runDocker([
      "volume",
      "ls",
      "--quiet",
      "--filter",
      `label=${projectLabel}=${projectId}`,
    ])
      .split(/\r?\n/)
      .filter(Boolean);
    const networks = runDocker([
      "network",
      "ls",
      "--quiet",
      "--filter",
      `label=${projectLabel}=${projectId}`,
    ])
      .split(/\r?\n/)
      .filter(Boolean);
    const existingNames = runDocker(["ps", "--all", "--format", "{{.Names}}"])
      .split(/\r?\n/)
      .filter(Boolean);
    const volumeNames = runDocker(["volume", "ls", "--quiet"]).split(/\r?\n/).filter(Boolean);
    const networkNames = runDocker(["network", "ls", "--format", "{{.Name}}"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (
      projectCollision({
        projectId,
        ids: containerIds(projectId),
        labeledVolumes: volumes,
        labeledNetworks: networks,
        containerNames: existingNames,
        volumeNames,
        networkNames,
      })
    )
      throw new Error("project already exists");
    save(path.join(process.env.RUNNER_TEMP, "careconnect-startup-owner.json"), {
      project_id: projectId,
      ownership_baseline: "clear",
    });
    save(file, { ownership_baseline: "clear", images: readImages() });
  } else if (mode === "after") {
    if (networkName !== projectId || !["success", "failure", "cancelled"].includes(outcome)) {
      throw new Error("invalid startup context");
    }
    let baseline = {};
    try {
      if (statSync("test-artifacts/startup-images-before.json").size <= 16384) {
        baseline = JSON.parse(readFileSync("test-artifacts/startup-images-before.json", "utf8"));
      }
    } catch {
      /* unavailable */
    }
    const before = baseline?.images;
    const prior = Object.fromEntries(
      Object.keys(images).map((key) => [
        key,
        ["present", "not-present", "unavailable"].includes(before?.[key])
          ? before[key]
          : "unavailable",
      ]),
    );
    let owner = {};
    try {
      const ownerFile = path.join(process.env.RUNNER_TEMP, "careconnect-startup-owner.json");
      if (statSync(ownerFile).size <= 1024) owner = JSON.parse(readFileSync(ownerFile, "utf8"));
    } catch {
      /* unavailable */
    }
    let containers;
    try {
      containers = ownershipVerified(baseline, owner, projectId)
        ? sanitizeContainers(projectContainers(projectId), projectId, networkName)
        : { inspection: "unavailable", services: [] };
    } catch {
      containers = { inspection: "unavailable", services: [] };
    }
    const raw = safeRaw(path.join(process.env.RUNNER_TEMP, "careconnect-supabase-start.raw.log"));
    let processResult = {};
    try {
      if (statSync("test-artifacts/startup-process.json").size <= 1024) {
        processResult = JSON.parse(readFileSync("test-artifacts/startup-process.json", "utf8"));
      }
    } catch {
      /* unavailable */
    }
    save(file, {
      startup_outcome: outcome,
      process: processEvidence(processResult),
      image_scope: "cli-2.117.0-default-candidates",
      runtime_image_plan: "unverified",
      image_preparation: imagePreparation(raw, outcome),
      images_before: prior,
      images_after: readImages(),
      containers,
      removed_containers: "unavailable",
    });
  } else throw new Error("invalid mode");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch {
    console.error("Startup evidence operation failed.");
    process.exitCode = 1;
  }
}
