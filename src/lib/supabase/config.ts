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

const STAGING_SUPABASE_ORIGIN = "https://aqwzrpwiqbrykorlqwow.supabase.co";
const PRODUCTION_SUPABASE_ORIGIN = "https://bqijgbmhlwtslhrtszsj.supabase.co";

function matchesProjectOrigin(url: URL, origin: string) {
  return (
    url.origin === origin &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}

function fail(error: string): SupabaseConfigResult {
  return { ok: false, error };
}

function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const jwt = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(key);
  if (!jwt?.[1]) return false;
  try {
    const claims = JSON.parse(globalThis.atob(jwt[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return claims?.role === "anon";
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
  if (
    parsedUrl.hostname.replace(/\.$/, "") === new URL(PRODUCTION_SUPABASE_ORIGIN).hostname &&
    target !== "production"
  ) {
    return fail("The CareConnect production project requires VITE_SUPABASE_TARGET=production.");
  }
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
    if (!matchesProjectOrigin(parsedUrl, STAGING_SUPABASE_ORIGIN)) {
      return fail(
        "VITE_SUPABASE_STAGING_URL must point to the approved CareConnect staging project.",
      );
    }
    const productionKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
    if (productionKey && key === productionKey) {
      return fail("The staging publishable key must be distinct from the Production key.");
    }
  }

  if (target === "production") {
    if (!matchesProjectOrigin(parsedUrl, PRODUCTION_SUPABASE_ORIGIN)) {
      return fail("VITE_SUPABASE_URL must point to the approved CareConnect production project.");
    }
    if (key === env.VITE_SUPABASE_STAGING_PUBLISHABLE_KEY?.trim()) {
      return fail("The production publishable key must be distinct from the staging key.");
    }
  }

  if (!isPublicSupabaseKey(key)) {
    return fail("Only a Supabase publishable (anon) key may be used in the browser.");
  }
  return { ok: true, url, key };
}
