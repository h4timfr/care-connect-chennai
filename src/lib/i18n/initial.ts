import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  negotiateLanguage,
  normalizeLanguage,
  parseAcceptLanguage,
  type Language,
} from "./languages";

/**
 * The language to render a request in: the saved choice (cookie), else the browser's preferred
 * languages, else English. Runs on the server for the first render and in the browser if the
 * root loader ever re-runs there, so both sides pick the same language.
 */
export const resolveInitialLanguage = createIsomorphicFn()
  .server((): Language => {
    const saved = normalizeLanguage(getCookie(LANGUAGE_COOKIE));
    if (saved) return saved;
    return (
      negotiateLanguage(parseAcceptLanguage(getRequestHeader("accept-language"))) ??
      DEFAULT_LANGUAGE
    );
  })
  .client((): Language => {
    const cookie = document.cookie
      .split(/;\s*/)
      .find((c) => c.startsWith(`${LANGUAGE_COOKIE}=`))
      ?.slice(LANGUAGE_COOKIE.length + 1);
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // Storage unavailable.
    }
    return (
      normalizeLanguage(cookie) ??
      normalizeLanguage(stored) ??
      negotiateLanguage(navigator.languages ?? []) ??
      DEFAULT_LANGUAGE
    );
  });
