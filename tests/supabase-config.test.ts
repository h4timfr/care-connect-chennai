import assert from "node:assert/strict";
import test from "node:test";
import { resolveSupabaseConfig } from "../src/lib/supabase/config";

const productionUrl = "https://careconnect-production.supabase.co";
const productionKey = "sb_publishable_production-test";
const stagingUrl = "https://aqwzrpwiqbrykorlqow.supabase.co";
const stagingKey = "sb_publishable_staging-test";

test("Preview selects the staging URL and key even when Production values are present", () => {
  const result = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: stagingUrl,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );

  assert.deepEqual(result, { ok: true, url: stagingUrl, key: stagingKey });
});

test("Preview fails closed when either staging variable is missing", () => {
  const missingUrl = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );
  const missingKey = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: stagingUrl,
    },
    "preview",
  );

  assert.equal(missingUrl.ok, false);
  assert.equal(missingKey.ok, false);
  if (!missingUrl.ok) assert.match(missingUrl.error, /VITE_SUPABASE_STAGING_URL/);
  if (!missingKey.ok) assert.match(missingKey.error, /VITE_SUPABASE_STAGING_PUBLISHABLE_KEY/);
});

test("Preview fails closed when the target is missing", () => {
  const result = resolveSupabaseConfig(
    {
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: stagingUrl,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /VITE_SUPABASE_TARGET=staging/);
});

test("Preview rejects a Production URL or a key copied from Production", () => {
  const productionUrlUsedForStaging = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: productionUrl,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );
  const productionKeyUsedForStaging = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: stagingUrl,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: productionKey,
    },
    "preview",
  );

  assert.equal(productionUrlUsedForStaging.ok, false);
  assert.equal(productionKeyUsedForStaging.ok, false);
});

test("Preview rejects malformed and insecure staging URLs", () => {
  const malformedUrl = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_STAGING_URL: "not a URL",
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );
  const insecureUrl = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "staging",
      VITE_SUPABASE_STAGING_URL: stagingUrl.replace("https://", "http://"),
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "preview",
  );

  assert.equal(malformedUrl.ok, false);
  assert.equal(insecureUrl.ok, false);
  if (!malformedUrl.ok) assert.match(malformedUrl.error, /valid absolute URL/);
  if (!insecureUrl.ok) assert.match(insecureUrl.error, /must use HTTPS/);
});

test("Preview rejects Production target selection", () => {
  const result = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "production",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
    },
    "preview",
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /VITE_SUPABASE_TARGET=staging/);
});

test("Production still selects the existing URL and publishable key", () => {
  const result = resolveSupabaseConfig(
    {
      VITE_SUPABASE_TARGET: "production",
      VITE_SUPABASE_URL: productionUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: productionKey,
      VITE_SUPABASE_STAGING_URL: stagingUrl,
      VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: stagingKey,
    },
    "production",
  );

  assert.deepEqual(result, { ok: true, url: productionUrl, key: productionKey });
});

test("Production retains the legacy anon-key fallback", () => {
  const result = resolveSupabaseConfig({
    VITE_SUPABASE_TARGET: "production",
    VITE_SUPABASE_URL: productionUrl,
    VITE_SUPABASE_ANON_KEY: productionKey,
  });

  assert.deepEqual(result, { ok: true, url: productionUrl, key: productionKey });
});

test("local development retains localhost HTTP URL support without Vercel target", () => {
  const localUrl = "http://localhost:54321";
  const localKey = "sb_publishable_local-test";
  const result = resolveSupabaseConfig({
    VITE_SUPABASE_URL: localUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: localKey,
  });

  assert.deepEqual(result, { ok: true, url: localUrl, key: localKey });
});

test("browser configuration rejects secret and service-role keys", () => {
  const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const serviceRoleKey = `${encoded({ alg: "none" })}.${encoded({ role: "service_role" })}.test`;
  const secretKey = "sb_secret_test-only";
  const base = {
    VITE_SUPABASE_TARGET: "staging",
    VITE_SUPABASE_STAGING_URL: stagingUrl,
  };

  const secretResult = resolveSupabaseConfig({
    ...base,
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: secretKey,
  });
  const serviceRoleResult = resolveSupabaseConfig({
    ...base,
    VITE_SUPABASE_STAGING_PUBLISHABLE_KEY: serviceRoleKey,
  });

  assert.equal(secretResult.ok, false);
  assert.equal(serviceRoleResult.ok, false);
  if (!secretResult.ok) assert.match(secretResult.error, /Only a Supabase publishable/);
  if (!serviceRoleResult.ok) assert.match(serviceRoleResult.error, /Only a Supabase publishable/);
});
