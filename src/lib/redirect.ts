/** Path used when a redirect target is missing or unsafe. */
export const DEFAULT_REDIRECT = "/";

const MAX_REDIRECT_LENGTH = 2048;
// Any origin works here: it only lets URL() resolve the candidate so we can compare origins.
const BASE_ORIGIN = "https://careconnect.invalid";

/** Backslashes or ASCII control characters (which URL parsers strip or reinterpret). */
function hasUnsafeChars(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * Returns `value` if it is a same-origin path inside the app, otherwise `DEFAULT_REDIRECT`.
 *
 * Rejects absolute and protocol-relative URLs (`https://x`, `//x`), backslash tricks that
 * browsers normalise to `//` (`/\x`), schemes (`javascript:`, `data:`), control characters,
 * encoded variants of those, and anything pointing back at /login (which would nest redirects).
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_REDIRECT;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_REDIRECT_LENGTH) return DEFAULT_REDIRECT;

  // Must be a rooted path; "//" and "/\" are scheme-relative to browsers.
  if (!candidate.startsWith("/") || /^\/[/\\]/.test(candidate)) return DEFAULT_REDIRECT;
  // No backslashes or control characters anywhere, raw or percent-encoded.
  if (hasUnsafeChars(candidate)) return DEFAULT_REDIRECT;
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (hasUnsafeChars(decoded) || /^\/[/\\]/.test(decoded)) return DEFAULT_REDIRECT;

  let url: URL;
  try {
    url = new URL(candidate, BASE_ORIGIN);
  } catch {
    return DEFAULT_REDIRECT;
  }
  if (url.origin !== BASE_ORIGIN) return DEFAULT_REDIRECT;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return DEFAULT_REDIRECT;

  return `${url.pathname}${url.search}${url.hash}`;
}
