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
} from "./staging-reconciliation-rehearsal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(path.join(root, "supabase/migrations")).sort();

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
