import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";
import { supabaseConfigError, supabaseConfigMessage } from "./client";

// Turns Supabase/PostgREST/Auth errors into short, user-facing messages. Raw backend messages are
// only passed through where Supabase documents them as user-facing (e.g. password rules).

const NETWORK_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "fetch failed",
];

const SERVICE_TROUBLE =
  "The sign-in service is having trouble right now. Please try again shortly.";
const CONFIRMATION_EMAIL_FAILED =
  "Your account couldn't be created because the confirmation email failed to send. Please try again later.";

const CONNECTION_MESSAGE =
  "We couldn't reach CareConnect's servers. Check your internet connection and try again.";

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

function configMessage() {
  return import.meta.env.DEV
    ? `CareConnect isn't connected to its backend. ${supabaseConfigMessage ?? ""}`.trim()
    : (supabaseConfigMessage ?? "CareConnect is temporarily unavailable. Please try again later.");
}

/** Message for failures of data queries and mutations (PostgREST / RPC). */
export function describeDataError(error: unknown): string {
  if (isConfigError(error)) return configMessage();
  if (isNetworkError(error)) return CONNECTION_MESSAGE;

  const code = codeOf(error);
  if (code === "PGRST301" || code === "PGRST303" || messageOf(error).includes("JWT expired")) {
    return "Your session has expired. Please sign in again.";
  }
  if (code === "42501") return "You don't have permission to do that.";
  return "Something went wrong while talking to the server. Please try again.";
}

/** Message for Supabase Auth failures (sign in / sign up). */
export function describeAuthError(error: unknown): string {
  if (isConfigError(error)) return configMessage();
  if (isAuthRetryableFetchError(error) && (error.status === 0 || isNetworkError(error))) {
    return "We couldn't reach the sign-in service. Check your internet connection and try again.";
  }
  if (isNetworkError(error)) return CONNECTION_MESSAGE;

  // auth-js reports server-side (5xx) failures as retryable fetch errors, not API errors.
  if (isAuthRetryableFetchError(error)) {
    if (/confirmation email/i.test(error.message)) return CONFIRMATION_EMAIL_FAILED;
    return SERVICE_TROUBLE;
  }

  if (isAuthWeakPasswordError(error)) {
    return error.message || "Please choose a stronger password.";
  }

  if (isAuthApiError(error)) {
    switch (error.code) {
      case "invalid_credentials":
        return "Incorrect email or password.";
      case "email_not_confirmed":
        return "Please confirm your email address first. Check your inbox for the confirmation link.";
      case "user_already_exists":
      case "email_exists":
        return "An account with this email already exists. Try signing in instead.";
      case "email_address_invalid":
        return "Please enter a valid email address.";
      case "signup_disabled":
      case "email_provider_disabled":
        return "New account sign-ups are currently unavailable.";
      case "over_email_send_rate_limit":
        return "Too many emails have been sent to this address. Please wait a few minutes and try again.";
      case "over_request_rate_limit":
        return "Too many attempts. Please wait a moment and try again.";
      case "validation_failed":
        return error.message || "Please check the details you entered.";
    }
    if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
    if (/confirmation email/i.test(error.message)) return CONFIRMATION_EMAIL_FAILED;
    if (error.status >= 500) return SERVICE_TROUBLE;
  }
  return "Something went wrong. Please try again.";
}
