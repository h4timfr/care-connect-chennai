import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

test("manual account-creation checks refuse execution before loading dotenv", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(path.join(tmpdir(), "careconnect-test-safety-"));
  try {
    writeFileSync(path.join(directory, ".env"), "VITE_SUPABASE_URL=https://sentinel.invalid\n");
    const env = { ...process.env };
    delete env.SECURITY_TEST_CONFIRM_HOST;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(path.join(root, "node_modules/tsx/dist/loader.mjs")).href,
        path.join(root, "tests/security.test.ts"),
      ],
      { cwd: directory, env, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /explicitly confirmed disposable target/);
    assert.doesNotMatch(result.stdout + result.stderr, /sentinel|injected env|Starting Security/);
  } finally {
    unlinkSync(path.join(directory, ".env"));
    rmdirSync(directory);
  }
});
