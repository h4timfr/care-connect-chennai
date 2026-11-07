import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { isPrivilegedSupabaseKey, resolveSupabaseConfig } from "./config";

const config = resolveSupabaseConfig(import.meta.env);
const supabaseUrl = config.ok ? config.url : undefined;
const supabaseKey = config.ok ? config.key : undefined;

/** Raised by every Supabase request when the browser client has no usable configuration. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

function getConfigError(): string | null {
  if (!config.ok) return config.error;
  if (!supabaseUrl || !supabaseKey) {
    return "Supabase URL and publishable key are missing for the selected target.";
  }
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL. Use your project URL, e.g. https://<project-ref>.supabase.co";
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    return "VITE_SUPABASE_URL must use https://";
  }
  if (
    /your-project|placeholder|example/i.test(url.hostname) ||
    /^(your[-_]|<|placeholder)/i.test(supabaseKey)
  ) {
    return "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY still contain the placeholder values from .env.example. Replace them with your project's values and restart the dev server.";
  }
  if (isPrivilegedSupabaseKey(supabaseKey)) {
    return "The configured Supabase key is a secret/service-role key. Only the publishable (anon) key may be used in the browser.";
  }
  return null;
}

/** Developer-facing diagnostic (never contains key values). Null when configured correctly. */
export const supabaseConfigError = getConfigError();
export const isSupabaseConfigured = supabaseConfigError === null;

/**
 * What to show people in the UI. Development builds show the diagnostic so it can be fixed;
 * production visitors get a plain message and the diagnostic goes to the console only.
 */
export const supabaseConfigMessage =
  supabaseConfigError === null
    ? null
    : import.meta.env.DEV
      ? supabaseConfigError
      : "CareConnect is temporarily unavailable. Please try again later.";

if (supabaseConfigError !== null && typeof window !== "undefined") {
  console.error(`[CareConnect] Supabase configuration error: ${supabaseConfigError}`);
}

// Without configuration, every request fails immediately with a SupabaseConfigError instead of
// silently calling a placeholder host and surfacing a confusing "Failed to fetch".
const rejectUnconfigured: typeof fetch = () =>
  Promise.reject(new SupabaseConfigError(supabaseConfigError ?? "Supabase is not configured."));

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseKey!)
  : createClient<Database>("https://supabase-not-configured.invalid", "not-configured", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: rejectUnconfigured },
    });
