import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  aliasFile,
  assertCliArguments,
  assertNoRemoteEnvironment,
  assertOutsideCheckout,
  normalizeDump,
  pendingVersions,
  targetVersions,
  validateInventory,
  verifyPinnedCliVersion,
  verifyMigrationContents,
  restoreFailureLabels,
} from "./staging-reconciliation-rehearsal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(path.join(root, "supabase/migrations")).sort();
const originals = new Map(
  files.map((file) => [file, readFileSync(path.join(root, "supabase/migrations", file), "utf8")]),
);
const manifest = JSON.parse(
  readFileSync(path.join(root, "scripts/migration-integrity.json"), "utf8"),
);

test("restore diagnostic categories never echo raw SQL, credentials or object names", () => {
  const raw =
    "pg_restore: error: could not execute query: ERROR: permission denied for schema private_secret_name\nCommand was: CREATE EVENT TRIGGER private_name; postgres://user:password@private.invalid/db";
  assert.deepEqual(restoreFailureLabels(raw), [
    "permission-or-ownership",
    "event-trigger-context",
    "restore-sql-failed",
  ]);
  assert.deepEqual(restoreFailureLabels("unrecognized private diagnostic"), [
    "unrecognized-restore-failure",
  ]);
  assert.deepEqual(restoreFailureLabels('schema "private_name" already exists'), [
    "object-already-exists",
  ]);
  assert.deepEqual(
    restoreFailureLabels(
      'pg_restore: error: could not execute query: ERROR: must be able to SET ROLE "private_role"\nCommand was: ALTER SCHEMA private_schema OWNER TO private_role;',
    ),
    [
      "permission-or-ownership",
      "role-membership-required",
      "restore-sql-failed",
      "operation-alter",
    ],
  );
  assert.deepEqual(
    restoreFailureLabels(
      'ERROR: schema "auth" does not exist\nCommand was: DROP TRIGGER IF EXISTS private_trigger ON auth.private_table;',
    ),
    ["missing-object-or-role", "operation-drop-trigger", "missing-managed-auth-schema"],
  );
});

test("all forty reviewed migration contents match; CRLF checkout is equivalent", () => {
  assert.doesNotThrow(() => verifyMigrationContents(originals, manifest));
  const crlf = new Map(
    [...originals].map(([file, source]) => [
      file,
      source.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
    ]),
  );
  assert.doesNotThrow(() => verifyMigrationContents(crlf, manifest));
});

test("restore retains ownership and requires an existing administrator only inside the owned local container", () => {
  const source = readFileSync(
    path.join(root, "scripts/staging-reconciliation-rehearsal.mjs"),
    "utf8",
  );
  const restore = source.slice(
    source.indexOf("function restoreBaseline()"),
    source.indexOf("function normalize("),
  );
  assert.match(restore, /rolsuper::text FROM pg_catalog\.pg_roles WHERE rolname='supabase_admin'/);
  assert.match(
    restore,
    /"exec",\s*container,\s*"pg_restore",\s*"-U",\s*"supabase_admin",\s*"--exit-on-error",\s*"--single-transaction"/,
  );
  assert.doesNotMatch(restore, /--no-owner|--no-acl|ALTER ROLE|GRANT .*supabase_admin/);
  assert.match(restore, /check\(snapshot\(restoreDatabase\) === before\)/);
});

test("integrity gate rejects changed SQL despite identical filename and version", () => {
  const changed = new Map(originals);
  changed.set(files[0], `${changed.get(files[0])}\nGRANT ALL ON public.users TO anon;\n`);
  assert.throws(() => verifyMigrationContents(changed, manifest));
  changed.delete(files[0]);
  assert.throws(() => verifyMigrationContents(changed, manifest));
  for (const entries of [
    manifest.migrations.slice(1),
    [...manifest.migrations].reverse(),
    [...manifest.migrations.slice(0, -1), manifest.migrations[0]],
  ]) {
    assert.throws(() => verifyMigrationContents(originals, { format: 1, migrations: entries }));
  }
});

test("pinned CLI version accepts the actual update notice observed in successful CI", () => {
  const fixture =
    "2.117.0\nA new version of Supabase CLI is available: v2.121.0 (currently installed v2.117.0)\n";
  assert.doesNotThrow(() => verifyPinnedCliVersion(fixture));
  assert.doesNotThrow(() =>
    verifyPinnedCliVersion(`\u001b[36m2.117.0\u001b[0m\r\n${fixture.split("\n")[1]}\r\n`),
  );
  for (const source of [
    "",
    "2.118.0\n",
    "2.117.0\n2.118.0\n",
    "2.117.0\n2.117.0\n",
    "A new version is available: v2.117.0\n",
  ]) {
    assert.throws(() => verifyPinnedCliVersion(source));
  }
});

test("inventory is exact, with an intentional gap and 39 genuinely pending versions", () => {
  assert.equal(validateInventory(files).length, 40);
  assert.deepEqual(pendingVersions(["00001"]), targetVersions.slice(1));
  assert.equal(pendingVersions(["00001"]).length, 39);
  assert.deepEqual(pendingVersions(targetVersions), []);
  assert.equal(aliasFile, "20261009041700_00001_initial_schema.sql");
});

for (const [label, invalid] of [
  ["missing", files.slice(1)],
  ["duplicate version", [...files, "00001_duplicate.sql"]],
  ["invented history", [...files, "00024_placeholder.sql"]],
  ["malformed SQL filename", [...files.slice(1), "00001-invalid.sql"]],
])
  test(`inventory rejects ${label}`, () => assert.throws(() => validateInventory(invalid)));

test("pending comparison rejects duplicate and unexpected recorded versions", () => {
  assert.throws(() => pendingVersions(["00001", "00001"]));
  assert.throws(() => pendingVersions(["20261009041700"]));
  assert.throws(() => pendingVersions(["00024"]));
});

test("snapshot normalization strips only volatile dump wrappers", () => {
  const body =
    "ALTER TABLE public.clinics OWNER TO postgres;\nGRANT SELECT (id) ON public.clinics TO anon;\nCOPY public.clinics (id) FROM stdin;\nfixture\n\\.\n";
  assert.equal(
    normalizeDump(
      `-- Started on volatile\n\\restrict random\n${body}\\unrestrict random\n-- Completed on volatile\n`,
    ),
    body,
  );
  assert.notEqual(normalizeDump(body), normalizeDump(body.replace("TO anon", "TO authenticated")));
  assert.notEqual(normalizeDump(body), normalizeDump(body.replace("fixture", "other-fixture")));
  assert.notEqual(
    normalizeDump(body),
    normalizeDump(body.replace("OWNER TO postgres", "OWNER TO attacker")),
  );
});

test("remote credentials and configuration are rejected without exposing values", () => {
  assert.doesNotThrow(() =>
    assertNoRemoteEnvironment({ RUNNER_TEMP: "/tmp", SUPABASE_ACCESS_TOKEN: "" }),
  );
  for (const key of [
    "DATABASE_URL",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_ID",
    "SUPABASE_DB_PASSWORD",
    "VITE_SUPABASE_STAGING_URL",
    "DOTENV_PRIVATE_KEY",
  ]) {
    assert.throws(
      () => assertNoRemoteEnvironment({ [key]: "must-not-appear" }),
      (error) => !error.message.includes("must-not-appear"),
    );
  }
});

test("raw diagnostics must resolve outside checkout", () => {
  assert.throws(() => assertOutsideCheckout(root, root));
  assert.throws(() => assertOutsideCheckout(root, path.join(root, "scripts")));
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-rehearsal-unit-"));
  try {
    assert.doesNotThrow(() => assertOutsideCheckout(root, temp));
  } finally {
    rmSync(temp, { recursive: true });
  }
});

test("mutating CLI calls require explicit local target and forbid hosted overrides", () => {
  for (const args of [
    ["db", "push", "--local", "--yes"],
    ["db", "reset", "--local", "--no-seed"],
    ["migration", "repair", "00001", "--local", "--status", "applied"],
    ["db", "push", "--help"],
  ]) {
    assert.doesNotThrow(() => assertCliArguments(args));
  }
  for (const args of [
    ["db", "push"],
    ["db", "reset"],
    ["migration", "repair", "00001"],
    ["link"],
    ["db", "push", "--local", "--db-url", "anything"],
    ["db", "push", "--local", "--include-all"],
  ]) {
    assert.throws(() => assertCliArguments(args));
  }
});

test("new demo-boundary SQL plan is exactly 18 assertions", () => {
  const source = readFileSync(
    path.join(root, "supabase/tests/021_demo_seed_publication_boundary.test.sql"),
    "utf8",
  );
  assert.equal([...source.matchAll(/extensions\.plan\(18\)/g)].length, 1);
  assert.equal([...source.matchAll(/SELECT\s+extensions\.(?:is|ok|throws_ok)\s*\(/gi)].length, 18);
});

test("publication safety guard disables only this branch, with production unspecified", () => {
  const config = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual(config.git.deploymentEnabled, { "claude/careconnect-frontend-repair": false });
  assert.equal(
    Object.keys(config)
      .filter((k) => k !== "$schema")
      .join(","),
    "git",
  );
});
