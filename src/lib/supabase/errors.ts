import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";
import { supabaseConfigError } from "./client";
import type { MessageKey } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

// Turns Supabase/PostgREST/Auth errors into translatable, user-facing messages. Raw backend
// messages are never shown: they are English, may expose internals, and can't be translated.

/** A message key plus its placeholder values, ready for t(key, vars). */
export interface Described {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

const NETWORK_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "fetch failed",
];

function stringField(error: unknown, field: "message" | "code"): string {
  if (!error || typeof error !== "object" || !(field in error)) return "";
  const value: unknown = Reflect.get(error, field);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** `error.message` for any error-like value (Error, PostgrestError, plain object), else "". */
export function messageOf(error: unknown): string {
  return stringField(error, "message");
}

/** `error.code` (PostgREST / SQLSTATE / Auth error code) for any error-like value, else "". */
export function codeOf(error: unknown): string {
  return stringField(error, "code");
}

function isConfigError(error: unknown) {
  return (
    supabaseConfigError !== null ||
    (error instanceof Error && error.name === "SupabaseConfigError") ||
    messageOf(error).startsWith("SupabaseConfigError")
  );
}

export function isNetworkError(error: unknown) {
  const message = messageOf(error).toLowerCase();
  return NETWORK_PATTERNS.some((pattern) => message.includes(pattern));
}

/** Message for failures of data queries and mutations (PostgREST / RPC / Storage). */
export function describeDataError(error: unknown): MessageKey {
  if (isConfigError(error)) return "error.unavailable";
  if (isNetworkError(error)) return "error.connection";

  const code = codeOf(error);
  if (code === "PGRST301" || code === "PGRST303" || messageOf(error).includes("JWT expired")) {
    return "error.sessionExpired";
  }
  if (code === "42501") return "error.permission";
  return "error.server";
}

/** Message for Supabase Auth failures (sign in / sign up / password reset). */
export function describeAuthError(error: unknown): Described {
  if (isConfigError(error)) return { key: "error.unavailable" };
  if (isAuthRetryableFetchError(error) && (error.status === 0 || isNetworkError(error))) {
    return { key: "authError.unreachable" };
  }
  if (isNetworkError(error)) return { key: "error.connection" };

  // auth-js reports server-side (5xx) failures as retryable fetch errors, not API errors.
  if (isAuthRetryableFetchError(error)) {
    if (/confirmation email/i.test(error.message))
      return { key: "authError.confirmationEmailFailed" };
    return { key: "authError.serviceTrouble" };
  }

  if (isAuthWeakPasswordError(error)) {
    const reasons: string[] = error.reasons ?? [];
    if (reasons.includes("pwned")) return { key: "authError.passwordPwned" };
    if (reasons.includes("length")) {
      return { key: "authError.passwordTooShort", vars: { count: MIN_PASSWORD_LENGTH } };
    }
    if (reasons.includes("characters")) return { key: "authError.passwordCharacters" };
    return { key: "authError.weakPassword" };
  }

  if (isAuthApiError(error)) {
    switch (error.code) {
      case "invalid_credentials":
        return { key: "authError.invalidCredentials" };
      case "email_not_confirmed":
        return { key: "authError.emailNotConfirmed" };
      case "user_already_exists":
      case "email_exists":
        return { key: "authError.emailExists" };
      case "email_address_invalid":
        return { key: "authError.invalidEmail" };
      case "signup_disabled":
      case "email_provider_disabled":
        return { key: "authError.signupDisabled" };
      case "over_email_send_rate_limit":
        return { key: "authError.emailRateLimit" };
      case "over_request_rate_limit":
        return { key: "authError.rateLimit" };
      case "same_password":
        return { key: "authError.samePassword" };
      case "reauthentication_needed":
      case "session_not_found":
      case "refresh_token_not_found":
        return { key: "authError.linkSessionExpired" };
      case "validation_failed":
        return { key: "error.checkDetails" };
    }
    if (error.status === 429) return { key: "authError.rateLimit" };
    if (/confirmation email/i.test(error.message))
      return { key: "authError.confirmationEmailFailed" };
    if (error.status >= 500) return { key: "authError.serviceTrouble" };
  }
  return { key: "error.generic" };
}
