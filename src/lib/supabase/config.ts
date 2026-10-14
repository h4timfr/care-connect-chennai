export interface SupabaseEnvironment {
  VITE_SUPABASE_TARGET?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_STAGING_URL?: string;
  VITE_SUPABASE_STAGING_PUBLISHABLE_KEY?: string;
}

export type SupabaseConfigResult =
  { ok: true; url: string; key: string } | { ok: false; error: string };

const STAGING_SUPABASE_ORIGIN = "https://aqwzrpwiqbrykorlqow.supabase.co";

function fail(error: string): SupabaseConfigResult {
  return { ok: false, error };
}

export function isPrivilegedSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  if (typeof globalThis.atob !== "function") return true;
  try {
    const claims = JSON.parse(globalThis.atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

export function resolveSupabaseConfig(
  env: SupabaseEnvironment,
  vercelEnv?: string,
): SupabaseConfigResult {
  const target = env.VITE_SUPABASE_TARGET?.trim();
  if (vercelEnv === "preview" && target !== "staging") {
    return fail("Vercel Preview requires VITE_SUPABASE_TARGET=staging.");
  }
  if (vercelEnv === "production" && target !== "production") {
    return fail("Vercel Production requires VITE_SUPABASE_TARGET=production.");
  }
  if (target && target !== "staging" && target !== "production") {
    return fail("VITE_SUPABASE_TARGET must be staging or production.");
  }

  const isStaging = target === "staging";
  const urlValue = isStaging ? env.VITE_SUPABASE_STAGING_URL : env.VITE_SUPABASE_URL;
  const keyValue = isStaging
    ? env.VITE_SUPABASE_STAGING_PUBLISHABLE_KEY
    : env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const url = urlValue?.trim();
  const key = keyValue?.trim();

  if (isStaging && !url) {
    return fail("VITE_SUPABASE_STAGING_URL is required when VITE_SUPABASE_TARGET=staging.");
  }
  if (isStaging && !key) {
    return fail(
      "VITE_SUPABASE_STAGING_PUBLISHABLE_KEY is required when VITE_SUPABASE_TARGET=staging.",
    );
  }
  if (!url || !key) {
    return fail(
      "CareConnect requires an explicit Supabase URL and publishable key for the selected target.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return fail("The configured Supabase URL must be a valid absolute URL.");
  }
  const isLocal = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLocal)) {
    return fail("The configured Supabase URL must use HTTPS outside local development.");
  }
  if (
    /your-project|placeholder|example/i.test(parsedUrl.hostname) ||
    /^(your[-_]|<|placeholder)/i.test(key)
  ) {
    return fail("Replace placeholder Supabase URL and key values with project configuration.");
  }

  if (isStaging) {
    if (
      parsedUrl.origin !== STAGING_SUPABASE_ORIGIN ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search ||
      parsedUrl.hash ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return fail(
        "VITE_SUPABASE_STAGING_URL must point to the approved CareConnect staging project.",
      );
    }
    const productionKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
    if (productionKey && key === productionKey) {
      return fail("The staging publishable key must be distinct from the Production key.");
    }
  }

  if (isPrivilegedSupabaseKey(key)) {
    return fail("Only a Supabase publishable (anon) key may be used in the browser.");
  }
  return { ok: true, url, key };
}
