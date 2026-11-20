import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
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
    return DEFAULT_LANGUAGE;
  })
  .client((): Language => {
    let cookie: string | undefined;
    let stored: string | null = null;
    try {
      cookie = document.cookie
        .split(/;\s*/)
        .find((c) => c.startsWith(`${LANGUAGE_COOKIE}=`))
        ?.slice(LANGUAGE_COOKIE.length + 1);
    } catch {
      // Cookies unavailable.
    }
    try {
      stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // Storage unavailable.
    }
    return normalizeLanguage(cookie) ?? normalizeLanguage(stored) ?? DEFAULT_LANGUAGE;
  });
