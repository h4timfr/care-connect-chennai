import {
  AuthClient,
  createClient,
  type Session,
  type SupportedStorage,
} from "@supabase/supabase-js";
import type { Database } from "../database.types";
import config from "virtual:careconnect-public-config";
import { sharedAuthStorage } from "./auth-storage";
import { updateRecoveryPassword as updateIsolatedPassword } from "./recovery-password";

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

const authStorageKey = isSupabaseConfigured
  ? `sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`
  : undefined;
const authUrl = isSupabaseConfigured
  ? new URL("auth/v1", `${supabaseUrl!.replace(/\/+$/, "")}/`)
  : undefined;
export const authSessionStorage =
  authStorageKey && authUrl ? sharedAuthStorage(authStorageKey, authUrl) : undefined;
export const canPersistProviderDrafts = !!authSessionStorage;

export const supabase = isSupabaseConfigured
  ? createClient<Database>(
      supabaseUrl!,
      supabaseKey!,
      authSessionStorage
        ? {
            auth: { storage: authSessionStorage.adapter, storageKey: authStorageKey! },
            global: { fetch: authSessionStorage.fetch },
          }
        : { auth: { persistSession: false } },
    )
  : createClient<Database>("https://supabase-not-configured.invalid", "not-configured", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: rejectUnconfigured },
    });

export function createProviderAuthClient(
  adoptionStorage?: SupportedStorage,
  purpose = "provider-signup",
) {
  if (!authStorageKey || !authUrl) throw new SupabaseConfigError("Supabase is not configured.");
  return new AuthClient({
    url: authUrl.href,
    headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    autoRefreshToken: false,
    detectSessionInUrl: false,
    skipAutoInitialize: true,
    ...(adoptionStorage
      ? { storageKey: authStorageKey, persistSession: true, storage: adoptionStorage }
      : { storageKey: `${authStorageKey}:${purpose}`, persistSession: false }),
  });
}

let verifier: ReturnType<typeof createProviderAuthClient> | undefined;
export function verifyAuthUser(accessToken: string) {
  verifier ??= createProviderAuthClient(undefined, "verification");
  return verifier.getUser(accessToken);
}

export function updateRecoveryPassword(session: Session, password: string, send: typeof fetch) {
  if (!authUrl || !supabaseKey) throw new SupabaseConfigError("Supabase is not configured.");
  return updateIsolatedPassword(authUrl, supabaseKey, session, password, send);
}
