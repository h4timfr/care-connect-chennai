import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const guard = new URL("./deny-local-env.mjs", import.meta.url).href;
const production = {
  VITE_SUPABASE_URL: "https://bqijgbmhlwtslhrtszsj.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production-test",
};
const staging = {
  VITE_SUPABASE_STAGING_URL: "https://aqwzrpwiqbrykorlqwow.supabase.co",
  VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: "sb_publishable_staging-test",
};
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !/^(VITE_|VERCEL|CARECONNECT_|NITRO_|NODE_OPTIONS$|DEBUG$)/i.test(name),
  ),
);

function resolveBuild(vars) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      guard,
      "--input-type=module",
      "--eval",
      `import { resolveConfig } from "vite";
       try {
         const config = await resolveConfig({}, "build", "production", "production");
         console.log("resolved", config.envPrefix.length, Object.keys(config.define || {}).join(","));
       } catch (error) {
         console.error(error.message);
         process.exitCode = 1;
       }`,
    ],
    {
      cwd: root,
      env: {
        ...inheritedEnv,
        NITRO_PRESET: "node-server",
        CARECONNECT_VERCEL_BUILD: "1",
        ...Object.fromEntries(Object.entries(vars).filter(([, value]) => value !== undefined)),
      },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.ifError(result.error);
  return result;
}

test("Vercel Production fails the build with the current Preview-only target scope", () => {
  const result = resolveBuild({ ...production, VERCEL_ENV: "production" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Vercel Production requires VITE_SUPABASE_TARGET=production/);
});

test("Vercel Production accepts its scoped target while exposing no VITE environment keys", () => {
  const result = resolveBuild({
    ...production,
    VERCEL_ENV: "production",
    VITE_VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "production",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^resolved 0(?:\s|$)/m);
  assert.doesNotMatch(result.stdout, /import\.meta\.env\.VITE_/);
});

test("Vercel Preview selects staging even with Production variables in Preview scope", () => {
  const result = resolveBuild({
    ...production,
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^resolved 0(?:\s|$)/m);
});

test("Vercel Preview rejects a Production target even if the prefixed context says Production", () => {
  const result = resolveBuild({
    ...production,
    VERCEL_ENV: "preview",
    VITE_VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Vercel Preview requires VITE_SUPABASE_TARGET=staging/);
});

test("Vercel build command fails closed with system variables disabled", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(
    config.buildCommand,
    "CARECONNECT_VERCEL_BUILD=1 npm run build && node scripts/security-artifacts.mjs .vercel/output/static",
  );
  const result = resolveBuild({
    ...production,
    VITE_SUPABASE_TARGET: "production",
    VITE_VERCEL_ENV: "production",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /require the VERCEL_ENV system variable/);
});

test("Vercel build requires an explicit system environment", () => {
  const result = resolveBuild({
    ...production,
    VITE_SUPABASE_TARGET: "production",
    VITE_VERCEL_ENV: "production",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /require the VERCEL_ENV system variable/);
});

test("synthetic bundle mode is rejected by a guarded Vercel build", () => {
  const result = resolveBuild({ CARECONNECT_BUNDLE_TEST: "1", CI: "true" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Synthetic bundle test configuration is not allowed/);
});

test("Preview and Production fail closed when their selected URL is missing or invalid", () => {
  const missingPreviewUrl = resolveBuild({
    ...production,
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_URL: undefined,
  });
  const missingProductionUrl = resolveBuild({
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_PUBLISHABLE_KEY: production.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const missingProductionKey = resolveBuild({
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_URL: production.VITE_SUPABASE_URL,
  });
  const invalidPreviewUrl = resolveBuild({
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_URL: "not a URL",
  });
  assert.equal(missingPreviewUrl.status, 1);
  assert.match(missingPreviewUrl.stderr, /VITE_SUPABASE_STAGING_URL/);
  assert.equal(missingProductionUrl.status, 1);
  assert.match(missingProductionUrl.stderr, /explicit Supabase URL and publishable key/);
  assert.equal(missingProductionKey.status, 1);
  assert.match(missingProductionKey.stderr, /explicit Supabase URL and publishable key/);
  assert.equal(invalidPreviewUrl.status, 1);
  assert.match(invalidPreviewUrl.stderr, /valid absolute URL/);
});

test("Preview and Production fail closed when selected keys are missing or privileged", () => {
  const missingPreviewKey = resolveBuild({
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: undefined,
  });
  const secretPreviewKey = resolveBuild({
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: "sb_secret_synthetic_only",
  });
  const serviceRoleJwt = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.synthetic`;
  const privilegedProductionKey = resolveBuild({
    ...production,
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt,
  });
  assert.equal(missingPreviewKey.status, 1);
  assert.match(missingPreviewKey.stderr, /VITE_SUPABASE_STAGING_PUBLISHABLE_KEY/);
  assert.equal(secretPreviewKey.status, 1);
  assert.match(secretPreviewKey.stderr, /Only a Supabase publishable/);
  assert.equal(privilegedProductionKey.status, 1);
  assert.match(privilegedProductionKey.stderr, /Only a Supabase publishable/);
});

test("Preview and Production reject cross-environment URL and key collisions", () => {
  const previewCollision = resolveBuild({
    ...production,
    ...staging,
    VERCEL_ENV: "preview",
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: production.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const productionCollision = resolveBuild({
    ...production,
    ...staging,
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_URL: staging.VITE_SUPABASE_STAGING_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: staging.VITE_SUPABASE_STAGING_PUBLISHABLE_KEY,
  });
  const productionWrongTarget = resolveBuild({
    ...production,
    ...staging,
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "staging",
  });
  assert.equal(previewCollision.status, 1);
  assert.match(previewCollision.stderr, /distinct from the Production key/);
  assert.equal(productionCollision.status, 1);
  assert.match(productionCollision.stderr, /approved CareConnect production project/);
  assert.equal(productionWrongTarget.status, 1);
  assert.match(
    productionWrongTarget.stderr,
    /Vercel Production requires VITE_SUPABASE_TARGET=production/,
  );
});

test("browser client does not consume the complete Vite environment", () => {
  const client = readFileSync(new URL("../src/lib/supabase/client.ts", import.meta.url), "utf8");
  assert.match(client, /virtual:careconnect-public-config/);
  assert.doesNotMatch(client, /resolveSupabaseConfig\(import\.meta\.env/);
});

test("Vite and Nitro both ignore dotenv files for guarded and isolated builds", () => {
  const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const nitro = readFileSync(new URL("../nitro.config.ts", import.meta.url), "utf8");
  assert.match(vite, /usesBuildSystemEnvironment\(process\.env\)/);
  assert.match(nitro, /usesBuildSystemEnvironment\(process\.env\)/);
  assert.match(nitro, /loadEnv\("production", process\.cwd\(\)\)/);
});

test("Vercel rejects arbitrary strings in the public key slot", () => {
  const result = resolveBuild({
    ...production,
    VERCEL_ENV: "production",
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-opaque-private-value",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Only a Supabase publishable/);
});
