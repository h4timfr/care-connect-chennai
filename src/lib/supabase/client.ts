import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
// VITE_SUPABASE_ANON_KEY is the legacy name for the same browser-safe key; still accepted so older
// local .env files keep working.
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

/** Raised by every Supabase request when the browser client has no usable configuration. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

function isPrivilegedKey(key: string) {
  if (key.startsWith("sb_secret_")) return true;
  // Legacy JWT keys: refuse a service_role key so it can never ship in the browser bundle.
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

function getConfigError(): string | null {
  if (!supabaseUrl || !supabaseKey) {
    return "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set. Copy .env.example to .env, fill in your project values and restart the dev server.";
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
  if (isPrivilegedKey(supabaseKey)) {
    return "The configured Supabase key is a secret/service-role key. Only the publishable (anon) key may be used in the browser.";
  }
  return null;
}

export const supabaseConfigError = getConfigError();
export const isSupabaseConfigured = supabaseConfigError === null;

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
