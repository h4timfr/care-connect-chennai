import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspectPublicAssets } from "./security-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const guard = new URL("./deny-local-env.mjs", import.meta.url).href;
const targets = {
  preview: {
    selectedUrl: "https://careconnect-preview.synthetic.invalid",
    selectedKey: "sb_publishable_synthetic_preview_5b1f6c",
    otherUrl: "https://careconnect-production.synthetic.invalid",
    otherKey: "sb_publishable_synthetic_production_92d4a1",
  },
  production: {
    selectedUrl: "https://careconnect-production.synthetic.invalid",
    selectedKey: "sb_publishable_synthetic_production_92d4a1",
    otherUrl: "https://careconnect-preview.synthetic.invalid",
    otherKey: "sb_publishable_synthetic_preview_5b1f6c",
  },
};
const privateValues = {
  viteSentinel: "cc_private_vite_sentinel_7d3f2a",
  plainSentinel: "cc_private_plain_sentinel_4e8b19",
  databaseCredential: "cc_synthetic_database_password_85c2",
  serviceRoleCredential: "cc_synthetic_service_role_63a7",
  secretKey: "sb_secret_synthetic_private_194c",
};
const inheritedEnv = Object.fromEntries(
  ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "TEMP", "TMP", "COMSPEC"]
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);

function sanitizedBuildFailure(result, targetName) {
  let output = `${result.stdout}\n${result.stderr}`;
  for (const value of [
    ...Object.values(privateValues),
    ...Object.values(targets).flatMap((config) => [
      config.selectedUrl,
      config.selectedKey,
      config.otherUrl,
      config.otherKey,
    ]),
  ]) {
    output = output.replaceAll(value, "[redacted-test-value]");
  }
  output = output.replace(/sb_(?:secret|publishable)_[A-Za-z0-9._-]+/g, "[redacted-key]");
  output = output.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-connection]");
  return `${targetName} synthetic application bundle build failed (exit ${result.status ?? "unknown"}).\n${output.slice(-1800)}`;
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(filename) : [filename];
  });
}

function contains(files, value) {
  const needle = Buffer.from(value);
  return files.some((filename) => readFileSync(filename).includes(needle));
}

function buildBundle(targetName, outputDir) {
  const selected = targets[targetName];
  const env = {
    ...inheritedEnv,
    CI: "true",
    CARECONNECT_ISOLATED_TEST: "1",
    CARECONNECT_BUNDLE_TEST: "1",
    CARECONNECT_BUNDLE_TEST_OUTPUT: outputDir,
    CARECONNECT_BUNDLE_TARGET: targetName,
    VERCEL_ENV: targetName,
    VITE_SUPABASE_TARGET: targetName === "preview" ? "staging" : "production",
    NITRO_PRESET: "node-server",
    VITE_SUPABASE_URL: targetName === "preview" ? selected.otherUrl : selected.selectedUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      targetName === "preview" ? selected.otherKey : selected.selectedKey,
    VITE_SUPABASE_STAGING_URL: targetName === "preview" ? selected.selectedUrl : selected.otherUrl,
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY:
      targetName === "preview" ? selected.selectedKey : selected.otherKey,
    VITE_UNRELATED_PRIVATE_SENTINEL: privateValues.viteSentinel,
    VITE_SUPABASE_SECRET_KEY: privateValues.secretKey,
    VITE_DATABASE_PASSWORD: privateValues.databaseCredential,
    DATABASE_URL: privateValues.databaseCredential,
    SUPABASE_SERVICE_ROLE_KEY: privateValues.serviceRoleCredential,
    CARECONNECT_UNRELATED_PRIVATE_SENTINEL: privateValues.plainSentinel,
  };
  const result = spawnSync(
    process.execPath,
    ["--import", guard, path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error) throw new Error("Synthetic application bundle build could not be started.");
  assert.equal(result.status, 0, sanitizedBuildFailure(result, targetName));
}

test("complete Preview and Production bundles contain only their selected public Supabase config", (t) => {
  for (const targetName of ["preview", "production"]) {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), `careconnect-${targetName}-bundle-`));
    t.after(() => rmSync(outputDir, { recursive: true, force: true }));
    buildBundle(targetName, outputDir);

    const files = listFiles(outputDir);
    assert.ok(files.length > 0, `${targetName} build emitted deployable output.`);
    const selected = targets[targetName];
    const browserFiles = listFiles(path.join(outputDir, "public"));
    const serverFiles = listFiles(path.join(outputDir, "server"));
    assert.ok(browserFiles.length > 0, `${targetName} build emitted browser assets.`);
    assert.ok(serverFiles.length > 0, `${targetName} build emitted SSR assets.`);
    assert.equal(
      contains(browserFiles, selected.selectedUrl),
      true,
      `${targetName} browser assets contain the selected URL.`,
    );
    assert.equal(
      contains(browserFiles, selected.selectedKey),
      true,
      `${targetName} browser assets contain the selected public key.`,
    );
    assert.equal(
      contains(serverFiles, selected.selectedUrl),
      true,
      `${targetName} SSR assets use the selected URL.`,
    );
    assert.equal(
      contains(serverFiles, selected.selectedKey),
      true,
      `${targetName} SSR assets use the selected public key.`,
    );
    assert.equal(
      contains(files, selected.otherUrl),
      false,
      `${targetName} bundle excludes the other environment URL.`,
    );
    assert.equal(
      contains(files, selected.otherKey),
      false,
      `${targetName} bundle excludes the other environment key.`,
    );
    for (const [label, value] of Object.entries(privateValues)) {
      assert.equal(contains(files, value), false, `${targetName} bundle excludes ${label}.`);
    }
    if (targetName === "preview") {
      assert.ok(
        files.some((filename) => filename.endsWith(".map")),
        "Preview maps are scanned.",
      );
    } else {
      assert.deepEqual(inspectPublicAssets(path.join(outputDir, "public")), []);
    }
  }
});
