import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  imagePreparation,
  imagePresence,
  ownershipVerified,
  processEvidence,
  projectCollision,
  rewriteProjectId,
  sanitizeContainers,
} from "./startup-evidence.mjs";

const project = "careconnect-ci-12345-1";
const network = "careconnect-ci-12345-1";
const container = (service, state = {}) => ({
  Name: `/supabase_${service}_${project}`,
  Config: { Labels: { "com.supabase.cli.project": project }, Env: ["SECRET=private-token"] },
  State: {
    Status: "running",
    ExitCode: 0,
    Error: "private-error",
    Health: { Status: "healthy" },
    ...state,
  },
  NetworkSettings: { Networks: { [network]: { IPAddress: "private-address" } } },
});

test("run-specific project IDs are strictly bounded and only replace the generated field", () => {
  assert.equal(
    rewriteProjectId('project_id = "old"\n[api]\nenabled = true\n', project),
    `project_id = "${project}"\n[api]\nenabled = true\n`,
  );
  assert.throws(() => rewriteProjectId('project_id = "old"\n', "other-project"));
  assert.throws(() => rewriteProjectId('project_id = "a"\nproject_id = "b"\n', project));
});

test("successful preparation is explicit while failure without the marker is unavailable", () => {
  assert.equal(imagePreparation("", "success"), "completed");
  assert.equal(imagePreparation("Starting containers...\n", "failure"), "completed");
  assert.equal(imagePreparation("Pulling image private-token", "failure"), "unavailable");
  assert.equal(imagePreparation(null, "cancelled"), "unavailable");
  assert.equal(imagePreparation("Starting containers... private-token", "failure"), "unavailable");
});

test("container inspection requires this run's clean ownership baseline", () => {
  const baseline = { ownership_baseline: "clear" };
  const owner = { ownership_baseline: "clear", project_id: project };
  assert.equal(ownershipVerified(baseline, owner, project), true);
  assert.equal(ownershipVerified({}, owner, project), false);
  assert.equal(
    ownershipVerified(baseline, { ...owner, project_id: "careconnect-ci-2-1" }, project),
    false,
  );
  assert.equal(ownershipVerified(baseline, owner, "other"), false);
});

test("run ownership fails closed for pre-existing labelled or named resources", () => {
  const base = {
    projectId: project,
    ids: [],
    labeledVolumes: [],
    labeledNetworks: [],
    containerNames: [],
    volumeNames: [],
    networkNames: [],
  };
  assert.equal(projectCollision(base), false);
  assert.equal(projectCollision({ ...base, ids: ["existing"] }), true);
  assert.equal(projectCollision({ ...base, labeledVolumes: ["existing"] }), true);
  assert.equal(projectCollision({ ...base, labeledNetworks: ["existing"] }), true);
  assert.equal(projectCollision({ ...base, containerNames: [`supabase_db_${project}`] }), true);
  assert.equal(projectCollision({ ...base, volumeNames: [`supabase_db_${project}`] }), true);
  assert.equal(projectCollision({ ...base, networkNames: [project] }), true);
  assert.equal(projectCollision({ ...base, volumeNames: null }), true);
  assert.equal(projectCollision({ ...base, containerNames: [null] }), true);
  assert.equal(projectCollision({ ...base, containerNames: ["video2product-api"] }), false);
});

test("process evidence retains only bounded numeric fields", () => {
  assert.deepEqual(
    processEvidence({ cli_exit_code: 42, elapsed_ms: 1000, secret: "private-token" }),
    { cli_exit_code: 42, elapsed_ms: 1000 },
  );
  assert.deepEqual(processEvidence({ cli_exit_code: "1", elapsed_ms: -1 }), {
    cli_exit_code: null,
    elapsed_ms: null,
  });
  assert.deepEqual(processEvidence(null), { cli_exit_code: null, elapsed_ms: null });
});

test("image evidence contains only fixed aliases and rejects malformed inventories", () => {
  const result = imagePresence([
    { Repository: "public.ecr.aws/supabase/postgres", Tag: "17.6.1.167" },
    { Repository: "private-token", Tag: "private-value" },
  ]);
  assert.equal(result.postgres, "present");
  assert.equal(result.realtime, "not-present");
  assert.equal(
    imagePresence([{ Repository: "docker.io/library/kong", Tag: "2.8.1" }]).kong,
    "present",
  );
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.doesNotMatch(JSON.stringify(result), /public\.ecr|ghcr|docker\.io/);
  assert.equal(imagePresence([{ Repository: "broken" }]).postgres, "unavailable");
});

test("only positively owned containers yield bounded service lifecycle evidence", () => {
  const outsider = {
    ...container("db"),
    Config: { Labels: { "com.supabase.cli.project": "other" } },
  };
  const result = sanitizeContainers(
    [
      container("db"),
      container("auth", { Status: "exited", ExitCode: 9, Health: { Status: "unhealthy" } }),
      outsider,
    ],
    project,
    network,
  );
  assert.deepEqual(
    result.services.find((row) => row.service === "db"),
    {
      service: "db",
      state: "running",
      exit_code: 0,
      health: "healthy",
      expected_network_attached: true,
    },
  );
  assert.deepEqual(
    result.services.find((row) => row.service === "auth"),
    {
      service: "auth",
      state: "exited",
      exit_code: 9,
      health: "unhealthy",
      expected_network_attached: true,
    },
  );
  assert.equal(result.services.find((row) => row.service === "realtime").state, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /private-token|private-address|private-error|other/);
});

test("missing, removed and malformed containers never become successful states", () => {
  const missing = sanitizeContainers([], project, network);
  assert.ok(missing.services.every((row) => row.state === "unavailable"));
  const malformed = container("db", {
    Status: "private-token",
    ExitCode: 999,
    Health: { Status: "private-token" },
  });
  malformed.NetworkSettings = {};
  const row = sanitizeContainers([malformed], project, network).services.find(
    (item) => item.service === "db",
  );
  assert.deepEqual(row, {
    service: "db",
    state: "unknown",
    exit_code: null,
    health: "unknown",
    expected_network_attached: null,
  });
  assert.equal(sanitizeContainers(null, project, network).inspection, "unavailable");
  assert.equal(sanitizeContainers([container("db")], "other", network).inspection, "unavailable");
  assert.equal(
    sanitizeContainers([container("db"), container("db")], project, network).inspection,
    "unavailable",
  );
});

test("CI captures evidence before binding verification and preserves cleanup ordering", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  const configure = workflow.indexOf("startup-evidence.mjs configure");
  const before = workflow.indexOf("startup-evidence.mjs before");
  const start = workflow.indexOf("Start a fresh disposable Supabase stack");
  const after = workflow.indexOf("Capture sanitized startup evidence before cleanup");
  const binding = workflow.indexOf(
    "Verify actual Docker bindings before application service requests",
  );
  const cleanup = workflow.indexOf("Stop the disposable Supabase stack");
  assert.ok(
    configure >= 0 &&
      configure < before &&
      before < start &&
      start < after &&
      after < binding &&
      binding < cleanup,
  );
  assert.match(
    workflow,
    /Capture sanitized startup evidence before cleanup\s+if: \$\{\{ always\(\)/,
  );
  assert.match(workflow, /test-artifacts\/startup-evidence\.json/);
  const upload = workflow.slice(workflow.indexOf("Upload sanitized integration evidence"));
  assert.doesNotMatch(upload, /\.raw\.log/);
});
