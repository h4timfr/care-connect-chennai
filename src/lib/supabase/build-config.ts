import { isAbsolute, relative, resolve, sep } from "node:path";
import { resolveSupabaseConfig, type SupabaseConfigResult } from "./config.ts";

/** Vercel builds must use scoped system variables and never merge local dotenv files. */
export function usesBuildSystemEnvironment(env: NodeJS.ProcessEnv): boolean {
  const vercelEnv = env["VERCEL_ENV"];
  return (
    env["CARECONNECT_VERCEL_BUILD"] === "1" ||
    (env["VERCEL"] === "1" && vercelEnv !== "development") ||
    env["CARECONNECT_ISOLATED_TEST"] === "1"
  );
}

/** Resolve the selected target for server-side build configuration only. */
export function resolveBuildSupabaseConfig(
  env: NodeJS.ProcessEnv,
  vercelEnv?: string,
): SupabaseConfigResult {
  if (env["CARECONNECT_BUNDLE_TEST"] === "1") {
    const output = env["CARECONNECT_BUNDLE_TEST_OUTPUT"];
    const relativeOutput = output ? relative(process.cwd(), resolve(output)) : "";
    const target = env["CARECONNECT_BUNDLE_TARGET"];
    const expectedTarget = target === "preview" ? "staging" : target;
    const urlValue =
      expectedTarget === "staging" ? env["VITE_SUPABASE_STAGING_URL"] : env["VITE_SUPABASE_URL"];
    const key =
      expectedTarget === "staging"
        ? env["VITE_SUPABASE_STAGING_PUBLISHABLE_KEY"]
        : env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    let url: URL | null = null;
    try {
      url = urlValue ? new URL(urlValue) : null;
    } catch {
      url = null;
    }
    if (
      env["CI"] !== "true" ||
      env["CARECONNECT_ISOLATED_TEST"] !== "1" ||
      env["VERCEL"] === "1" ||
      env["CARECONNECT_VERCEL_BUILD"] === "1" ||
      !output ||
      !isAbsolute(output) ||
      relativeOutput === "" ||
      (relativeOutput !== ".." &&
        !relativeOutput.startsWith(`..${sep}`) &&
        !isAbsolute(relativeOutput)) ||
      (target !== "preview" && target !== "production") ||
      vercelEnv !== target ||
      env["VITE_SUPABASE_TARGET"] !== expectedTarget ||
      !url ||
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".invalid") ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      !key ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) ||
      !key.startsWith(`sb_publishable_synthetic_${target}_`)
    ) {
      return { ok: false, error: "Synthetic bundle test configuration failed validation." };
    }
    return { ok: true, url: urlValue!, key };
  }
  return resolveSupabaseConfig(env, vercelEnv);
}
