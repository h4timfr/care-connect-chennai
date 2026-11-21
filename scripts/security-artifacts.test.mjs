import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { forbiddenPath, inspectPublicAssets, secretType } from "./security-artifacts.mjs";

test("private files cannot be committed or published; a root env template can be tracked", () => {
  for (const filename of [
    ".env.production",
    "ops\\production.pgpass",
    "ops/restore.dump.gpg",
    "public/key.pem",
    "data.zip",
  ]) {
    assert.equal(forbiddenPath(filename, { tracked: true }), true);
    assert.equal(forbiddenPath(filename), true);
  }
  assert.equal(forbiddenPath(".env.example", { tracked: true }), false);
  assert.equal(forbiddenPath(".env.example"), true);
  assert.equal(forbiddenPath("assets/app.js.map"), true);
});

test("public Supabase keys are allowed and privileged key formats are rejected", () => {
  const jwt = (role) =>
    "eyJhbGciOiJIUzI1NiJ9." +
    Buffer.from(JSON.stringify({ role })).toString("base64url") +
    ".Signature";
  assert.equal(secretType("sb_publishable_" + "fixture_public"), null);
  assert.equal(secretType(jwt("anon")), null);
  assert.equal(secretType(jwt("service_role")), "Supabase legacy service role key");
  assert.equal(secretType("sb_secret_" + "fixture_private"), "Supabase secret key");
  assert.equal(secretType("postgresql://" + "test:fixture@localhost/db"), "PostgreSQL credentials");
  assert.equal(secretType("-----BEGIN " + "OPENSSH PRIVATE KEY-----"), "private key");
});

test("the public artifact gate reports unsafe files and source-map references without values", (t) => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cc-security-gate-"));
  t.after(() =>
    import("node:fs/promises").then(({ rm }) => rm(output, { recursive: true, force: true })),
  );
  mkdirSync(path.join(output, "assets"));
  const script = path.join(output, "assets", "app.js");
  const gate = fileURLToPath(new URL("./security-artifacts.mjs", import.meta.url));
  const runGate = (target) => spawnSync(process.execPath, [gate, target], { encoding: "utf8" });
  writeFileSync(script, "console.log('entry')");
  assert.deepEqual(inspectPublicAssets(output), []);
  assert.equal(runGate(output).status, 0);
  writeFileSync(
    script,
    "const value = 'sb_secret_" + "fixture_private';\n//# sourceMappingURL=app.js.map",
  );
  writeFileSync(path.join(output, "assets", "app.js.map"), "{}");
  writeFileSync(path.join(output, ".env.production"), "");
  const findings = inspectPublicAssets(output);
  assert.deepEqual(findings.map((entry) => entry[1]).sort(), [
    "Supabase secret key",
    "source map reference",
    "unsafe public path",
    "unsafe public path",
  ]);
  assert.doesNotMatch(JSON.stringify(findings), /fixture_private/);
  const rejected = runGate(output);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Supabase secret key/);
  assert.doesNotMatch(rejected.stderr, /fixture_private/);
  assert.equal(runGate(path.join(output, "missing")).status, 1);
});
