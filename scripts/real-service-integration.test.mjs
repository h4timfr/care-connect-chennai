import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertLoopbackUrl,
  assertLocalProjectRefMatchesConfig,
  rejectRemoteConfiguration,
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

test("generated integration artifacts and build output stay outside proposed commits", () => {
  const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^test-artifacts\/$/m);
  assert.match(ignore, /^\.output$/m);
  assert.match(ignore, /^\.wrangler\/$/m);
});
