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
    const inheritedConfirmation = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(path.join(root, "node_modules/tsx/dist/loader.mjs")).href,
        path.join(root, "tests/security.test.ts"),
      ],
      {
        cwd: directory,
        env: { ...env, SECURITY_TEST_CONFIRM_HOST: "sentinel.invalid" },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(inheritedConfirmation.status, 1);
    assert.match(inheritedConfirmation.stderr, /explicitly confirmed disposable target/);
    assert.doesNotMatch(
      inheritedConfirmation.stdout + inheritedConfirmation.stderr,
      /injected env|Starting Security/,
    );
  } finally {
    unlinkSync(path.join(directory, ".env"));
    rmdirSync(directory);
  }
});

test("synthetic test preload blocks sync, promise and stream dotenv reads before contents", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "careconnect-env-denial-"));
  try {
    writeFileSync(path.join(directory, ".env"), "PRIVATE_SENTINEL=never-print-this\n");
    for (const code of [
      "require('fs').readFileSync('.env')",
      "require('fs').readFileSync('.ENV')",
      "require('fs').createReadStream('.env')",
      "require('fs/promises').readFile('.env')",
    ]) {
      const result = spawnSync(
        process.execPath,
        ["--import", new URL("../scripts/deny-local-env.mjs", import.meta.url).href, "-e", code],
        {
          cwd: directory,
          env: { ...process.env, CARECONNECT_ENV_GUARD_ROOT: directory },
          encoding: "utf8",
        },
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /read blocked in synthetic tests/);
      assert.doesNotMatch(result.stdout + result.stderr, /never-print-this/);
    }
    const discovery = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../scripts/deny-local-env.mjs", import.meta.url).href,
        "-e",
        "const fs=require('fs'); console.log(fs.existsSync('.env'), fs.statSync('.env', {throwIfNoEntry:false}) === undefined)",
      ],
      {
        cwd: directory,
        env: { ...process.env, CARECONNECT_ENV_GUARD_ROOT: directory },
        encoding: "utf8",
      },
    );
    assert.equal(discovery.status, 0);
    assert.equal(discovery.stdout.trim(), "false true");
  } finally {
    unlinkSync(path.join(directory, ".env"));
    rmdirSync(directory);
  }
});
