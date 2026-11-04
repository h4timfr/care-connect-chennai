import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertLoopbackUrl,
  assertLocalProjectRefMatchesConfig,
  countOwnedRecords,
  matchesCanonicalDisposableBaseline,
  removeUnseededApplicationUsers,
  rejectRemoteConfiguration,
  summarizeBrowserWorkflows,
  verifyRepositoryIntegrity,
} from "./real-service-integration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("only the expected loopback Supabase API endpoint is accepted", () => {
  assert.equal(assertLoopbackUrl("http://127.0.0.1:54321", 54321).port, "54321");
  assert.throws(() => assertLoopbackUrl("https://project.supabase.co", 54321), /refusing/);
  assert.throws(() => assertLoopbackUrl("http://127.0.0.1:54322", 54321), /refusing/);
  assert.throws(
    () => assertLoopbackUrl("http://127.0.0.1:54321/?target=remote", 54321),
    /refusing/,
  );
  assert.throws(() => assertLoopbackUrl("http://user:pass@127.0.0.1:54321", 54321), /refusing/);
});

test("runtime accepts only the local CLI marker matching the unlinked project config", () => {
  const config = 'project_id = "careconnect"\n';
  assert.doesNotThrow(() => assertLocalProjectRefMatchesConfig(config, "careconnect\n"));
  assert.doesNotThrow(() => assertLocalProjectRefMatchesConfig(config, null));
  assert.throws(
    () => assertLocalProjectRefMatchesConfig(config, "hosted-project-ref"),
    /does not match/,
  );
  assert.throws(() => assertLocalProjectRefMatchesConfig('project_id = ""', "careconnect"));
});

test("hosted project variables and linked metadata fail closed without echoing values", () => {
  assert.throws(
    () => rejectRemoteConfiguration({ SUPABASE_URL: "https://secret-project.supabase.co" }),
    /environment variables/,
  );
  assert.throws(
    () => rejectRemoteConfiguration({ DATABASE_URL: "postgres://private" }),
    /environment variables/,
  );
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "careconnect-linked-marker-"));
  const marker = path.join(tempDir, "linked-project.json");
  writeFileSync(marker, "synthetic-link-marker");
  try {
    assert.throws(() => rejectRemoteConfiguration({}, [marker]), /metadata exists/);
  } finally {
    unlinkSync(marker);
    rmdirSync(tempDir);
  }
});

test("repository migration and SQL test inventories match the integrity manifest", () => {
  const result = verifyRepositoryIntegrity();
  assert.equal(result.files.length, 41);
  assert.equal(result.files.at(-1)?.slice(0, 5), "00062");
  assert.equal(result.tests.length, 22);
});

test("real-service startup accepts only the exact canonical disposable baseline", () => {
  const baseline = {
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
  };
  assert.equal(matchesCanonicalDisposableBaseline(baseline), true);
  for (const table of Object.keys(baseline)) {
    assert.equal(
      matchesCanonicalDisposableBaseline({ ...baseline, [table]: baseline[table] + 1 }),
      false,
      `${table} must match its exact canonical baseline`,
    );
  }
  assert.equal(matchesCanonicalDisposableBaseline({ ...baseline, users: null }), false);
  assert.equal(matchesCanonicalDisposableBaseline({ clinics: 6 }), false);
});

test("ownership cleanup counts composite-key links without assuming an id column", async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        select(columns, options) {
          calls.push({ table, columns, options });
          return {
            in(column, values) {
              calls.push({ column, values });
              return Promise.resolve({ count: 0, error: null });
            },
          };
        },
      };
    },
  };

  assert.equal(await countOwnedRecords(admin, "clinic_doctors", "clinic_id", ["owned-id"]), 0);
  assert.deepEqual(calls, [
    { table: "clinic_doctors", columns: "*", options: { count: "exact", head: true } },
    { column: "clinic_id", values: ["owned-id"] },
  ]);
});

test("Auth session refresh is checked before password recovery can terminate the session", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  const refresh = runner.indexOf('measure("auth.session_refresh"');
  const recovery = runner.indexOf('measure("auth.password_recovery_request"');
  assert.ok(refresh >= 0 && recovery > refresh);
});

test("anonymous patient profile access accepts an explicit ACL rejection", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  assert.match(
    runner,
    /await expectDenied\(\s*createClient\(creds\.url, creds\.anonKey\)\.from\("patients"\)\.select\("id"\)\.limit\(1\),\s*"anonymous patient data request is denied"/,
  );
});

test("pre-seed cleanup deletes application profiles only for valid run Auth IDs", async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        delete() {
          return {
            in(column, ids) {
              calls.push({ table, column, ids });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const ownedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  assert.equal(await removeUnseededApplicationUsers(admin, [ownedId, ownedId]), true);
  assert.deepEqual(calls, [{ table: "users", column: "id", ids: [ownedId] }]);
  assert.equal(await removeUnseededApplicationUsers(admin, ["not-an-auth-id"]), false);
  assert.equal(calls.length, 1);
});

test("real-service fixtures use reserved synthetic identities and explicit ownership keys", () => {
  const seed = readFileSync(path.join(root, "tests/real-service/seed-owned-fixtures.sql"), "utf8");
  const cleanup = readFileSync(
    path.join(root, "tests/real-service/cleanup-owned-fixtures.sql"),
    "utf8",
  );
  assert.match(seed, /careconnect_ci\.real_service_runs/);
  assert.match(seed, /:'owner_token'::uuid/);
  assert.match(seed, /Synthetic CI fixture/);
  assert.match(cleanup, /runner ownership marker did not match exactly one row/);
  assert.match(cleanup, /pg_temp\.runner_owned/);
  assert.match(cleanup, /DELETE FROM public\.users[\s\S]*?WHERE u\.id = ANY\(o\.user_ids\)/);
  assert.match(cleanup, /public\.patients WHERE user_id = ANY\(run\.user_ids\)/);
  assert.doesNotMatch(cleanup, /:\x27owner_token\x27[^\n]*\$\$/);
});

test("the workflow provisions only local Supabase services and never links a remote project", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /version:\s*2\.117\.0/);
  assert.match(workflow, /supabase start/);
  assert.doesNotMatch(
    workflow,
    /supabase\s+(?:link|db\s+push|migration\s+up\s+--linked|db\s+reset\s+--linked)/,
  );
  assert.match(workflow, /supabase stop --no-backup/);
});

test("browser evidence counts test cases, assertions, and observed HTTP operations separately", () => {
  const summary = summarizeBrowserWorkflows([
    {
      name: "patient",
      status: "PASS",
      assertions: [{ name: "patient booking is confirmed", status: "PASS" }],
      http_requests: 8,
      request_failures: 0,
    },
    {
      name: "clinic",
      status: "FAIL",
      assertions: [{ name: "clinic can see appointment", status: "FAIL" }],
      http_requests: 5,
      request_failures: 1,
    },
    {
      name: "doctor",
      status: "BLOCKED",
      assertions: [],
      http_requests: 0,
      request_failures: 0,
    },
    {
      name: "administrator",
      status: "PASS",
      assertions: [{ name: "admin publication change succeeds", status: "PASS" }],
      http_requests: 6,
      request_failures: 0,
    },
  ]);

  assert.deepEqual(summary.test_cases, { total: 4, passed: 2, failed: 1, blocked: 1 });
  assert.deepEqual(summary.workflow_counts, { passed: 2, failed: 1, blocked: 1 });
  assert.deepEqual(
    {
      total: summary.assertions.total,
      passed: summary.assertions.passed,
      failed: summary.assertions.failed,
    },
    { total: 3, passed: 2, failed: 1 },
  );
  assert.deepEqual(summary.service_operations, {
    kind: "observed browser HTTP requests",
    observed: 19,
    failed: 1,
  });
});

test("browser workflow scenarios use UI actions and run independently", () => {
  const spec = readFileSync(path.join(root, "tests/real-service/workflows.spec.ts"), "utf8");
  const config = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
  for (const title of [
    "patient books and cancels an appointment through the interface",
    "clinic staff sees the created appointment in the clinic portal",
    "doctor sees the appointment, receives a patient message, and replies in the portals",
    "administrator reviews the clinic and changes publication through the interface",
  ]) {
    assert.ok(spec.includes(`test("${title}"`), `missing independent scenario: ${title}`);
  }
  assert.doesNotMatch(spec, /createClient|fetch\(|page\.request\.|\.rpc\(/);
  assert.match(spec, /getByRole\("button", \{ name: "Request appointment" \}\)/);
  assert.match(spec, /getByRole\("button", \{ name: "Send reply" \}\)/);
  assert.match(spec, /getByRole\("tab", \{ name: "Provider publishing" \}\)/);
  assert.ok(config.includes('"**/real-service/**"'));
});

test("real-service workflow triggers cover every imported project runtime dependency", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  for (const pathFilter of [
    "scripts/staging-reconciliation-rehearsal.mjs",
    "scripts/staging-reconciliation-rehearsal.test.mjs",
    "scripts/run-sql-ci-step*.mjs",
    "scripts/local-sql-test-target*.mjs",
    "vite.config.ts",
    "nitro.config.ts",
    "src/**",
    "package-lock.json",
  ]) {
    assert.ok(workflow.includes(`- "${pathFilter}"`), `missing CI path filter: ${pathFilter}`);
  }
  assert.match(workflow, /test-artifacts\/browser-workflow-summary\.json/);
  assert.doesNotMatch(workflow, /browser-flow-summary\.json/);
  const rehearsal = readFileSync(
    path.join(root, ".github/workflows/staging-reconciliation-rehearsal.yml"),
    "utf8",
  );
  for (const pathFilter of [
    "playwright.config.ts",
    "tests/deferred-toast.spec.ts",
    "src/components/DeferredToaster.tsx",
  ]) {
    assert.ok(
      rehearsal.includes(`- "${pathFilter}"`),
      `missing mocked suite path filter: ${pathFilter}`,
    );
  }
});

test("generated integration artifacts and build output stay outside proposed commits", () => {
  const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^test-artifacts\/$/m);
  assert.match(ignore, /^\.output$/m);
  assert.match(ignore, /^\.wrangler\/$/m);
});
