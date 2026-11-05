import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyStartupStage,
  isValidObserverMarker,
  matchesObserverArguments,
  sanitizeDockerEvent,
  sanitizeDockerEventLines,
  sanitizeStartupObservation,
} from "./startup-observer.mjs";

const project = "careconnect-ci-12345-1";
const id = "a".repeat(64);
const event = (action, extra = {}) => ({
  Type: "container",
  Action: action,
  Actor: {
    ID: id,
    Attributes: {
      name: `supabase_db_${project}`,
      "com.supabase.cli.project": project,
      image: "private-registry.example/supabase/postgres:private-tag",
      error: "private-error-detail",
      ...extra,
    },
  },
});

test("early image pull failure is classified only from an explicit failure marker", () => {
  assert.equal(
    classifyStartupStage({ raw: "failed to pull image: private registry detail", exitCode: 1 }),
    "image_preparation",
  );
  assert.equal(
    classifyStartupStage({ raw: "Pulling image private-name", exitCode: 1 }),
    "unavailable",
  );
});

test("Postgres create failure requires the verified database marker and known operation text", () => {
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...\nfailed to create docker container: private error",
      exitCode: 1,
      eventCapture: "completed",
      events: [],
    }),
    "postgres_creation",
  );
  assert.equal(
    classifyStartupStage({ raw: "failed to create docker container: private error", exitCode: 1 }),
    "unavailable",
  );
});

test("Postgres start and health failures use explicit event evidence", () => {
  const created = [{ service: "db", event: "create", exit_code: null }];
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...\nfailed to start docker container",
      exitCode: 1,
      eventCapture: "completed",
      events: created,
    }),
    "postgres_startup",
  );
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...",
      exitCode: 1,
      eventCapture: "completed",
      events: [
        ...created,
        { service: "db", event: "start", exit_code: null },
        { service: "db", event: "die", exit_code: 1 },
      ],
    }),
    "postgres_startup",
  );
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...",
      exitCode: 1,
      eventCapture: "completed",
      events: [
        ...created,
        { service: "db", event: "start", exit_code: null },
        { service: "db", event: "health_status: unhealthy", exit_code: null },
      ],
    }),
    "postgres_health",
  );
});

test("verified CLI markers classify later database and service startup stages", () => {
  assert.equal(
    classifyStartupStage({ raw: "Initialising schema...\nprivate error", exitCode: 1 }),
    "database_setup",
  );
  assert.equal(
    classifyStartupStage({ raw: "Starting containers...\nprivate error", exitCode: 1 }),
    "service_startup",
  );
  assert.equal(
    classifyStartupStage({ raw: "Waiting for health checks...\nprivate error", exitCode: 1 }),
    "service_health",
  );
  assert.equal(classifyStartupStage({ raw: "", exitCode: 0 }), "completed");
});

test("Docker event ownership requires the exact run label, ID shape and service name", () => {
  assert.deepEqual(sanitizeDockerEvent(event("create"), project), {
    service: "db",
    event: "create",
    exit_code: null,
  });
  assert.equal(sanitizeDockerEvent(event("create"), "careconnect-ci-999-1"), null);
  assert.equal(
    sanitizeDockerEvent(event("create", { "com.supabase.cli.project": "another-run" }), project),
    null,
  );
  assert.equal(sanitizeDockerEvent({ ...event("create"), Type: "image" }, project), null);
  assert.equal(sanitizeDockerEvent(event("attach"), project), null);
  assert.equal(
    sanitizeDockerEvent(
      { ...event("create"), Actor: { ...event("create").Actor, ID: "bad" } },
      project,
    ),
    null,
  );
});

test("cancellation reaper recognizes only the exact run-filtered observer command", () => {
  const args = [
    "/usr/bin/docker",
    "events",
    "--filter",
    "type=container",
    "--filter",
    `label=com.supabase.cli.project=${project}`,
    "--since",
    "1762345678",
    "--format",
    "{{json .}}",
  ];
  assert.equal(matchesObserverArguments(args, project), true);
  assert.equal(matchesObserverArguments(args, "careconnect-ci-999-1"), false);
  assert.equal(
    matchesObserverArguments(
      ["/usr/bin/docker", "ps", "--filter", "name=video2product-api:local"],
      project,
    ),
    false,
  );
  assert.equal(matchesObserverArguments([...args, "--all"], project), false);
});

test("cancellation reaper rejects malformed or mismatched ownership markers", () => {
  assert.equal(isValidObserverMarker({ project_id: project, pid: 123 }, project), true);
  assert.equal(isValidObserverMarker({ project_id: project, pid: "123" }, project), false);
  assert.equal(isValidObserverMarker({ project_id: project, pid: 1 }, project), false);
  assert.equal(isValidObserverMarker({ project_id: "other-run", pid: 123 }, project), false);
  assert.equal(isValidObserverMarker(null, project), false);
});

test("event summaries retain rollback lifecycle after the CLI removes containers", () => {
  const lines = ["create", "start", "die", "destroy"].map((action) =>
    JSON.stringify(event(action, action === "die" ? { exitCode: "17" } : {})),
  );
  const safe = sanitizeDockerEventLines(lines, project);
  assert.equal(safe.capture, "completed");
  assert.deepEqual(safe.events, [
    { service: "db", event: "create", exit_code: null },
    { service: "db", event: "start", exit_code: null },
    { service: "db", event: "die", exit_code: 17 },
    { service: "db", event: "destroy", exit_code: null },
  ]);
});

test("missing or malformed events fail closed to unavailable stage", () => {
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...",
      exitCode: 1,
      eventCapture: "unavailable",
      events: [],
    }),
    "unavailable",
  );
  const malformed = sanitizeDockerEventLines(
    ["not-json", JSON.stringify(event("attach"))],
    project,
  );
  assert.equal(malformed.capture, "partial");
  assert.equal(malformed.events.length, 0);
  assert.equal(
    classifyStartupStage({
      raw: "Starting database...",
      exitCode: 1,
      eventCapture: malformed.capture,
      events: malformed.events,
    }),
    "unavailable",
  );
  assert.equal(sanitizeDockerEventLines([], "wrong-id").capture, "unavailable");
});

test("diagnostic output drops raw errors, image names, IDs, labels and tokens", () => {
  const safe = sanitizeStartupObservation({
    project_id: project,
    cli_exit_code: 1,
    elapsed_ms: 7000,
    event_capture: "completed",
    event_lines: [JSON.stringify(event("die", { exitCode: "1" }))],
    raw: "Starting database...\nprivate token private-error-detail",
  });
  const serialized = JSON.stringify(safe);
  assert.equal(safe.startup_stage, "postgres_startup");
  assert.doesNotMatch(serialized, /private|supabase_db_|example|a{12}|com\.supabase/);
  assert.deepEqual(safe.events, [{ service: "db", event: "die", exit_code: 1 }]);
});

test("workflow starts the observer before CLI and reaps it before Supabase cleanup", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  const startup = workflow.indexOf("startup-observer.mjs run");
  const capture = workflow.indexOf("Capture sanitized startup evidence before cleanup");
  const cleanup = workflow.indexOf("Stop the disposable Supabase stack");
  const reap = workflow.indexOf("startup-observer.mjs reap");
  const upload = workflow.indexOf("Upload sanitized integration evidence");
  assert.ok(startup >= 0 && startup < capture && capture < cleanup && cleanup < upload);
  assert.ok(reap > cleanup && reap < upload);
  const uploaded = workflow.slice(upload);
  assert.match(uploaded, /startup-observer\.json/);
  assert.match(uploaded, /startup-observer-cleanup\.json/);
  assert.doesNotMatch(uploaded, /careconnect-supabase-start\.raw\.log|\.raw\.jsonl/);
});
