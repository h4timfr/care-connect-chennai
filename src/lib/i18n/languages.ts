/** UI languages CareConnect is translated into. English is the source language and the fallback. */
export const LANGUAGES = [
  { code: "en", nativeName: "English", englishName: "English", locale: "en-IN", dir: "ltr" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", locale: "hi-IN", dir: "ltr" },
  // "ur" rather than "ur-IN": the latter formats with Eastern Arabic digits, which makes phone
  // numbers, times and fees harder to compare with what clinics print.
  { code: "ur", nativeName: "اردو", englishName: "Urdu", locale: "ur", dir: "rtl" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam", locale: "ml-IN", dir: "ltr" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", locale: "ta-IN", dir: "ltr" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", locale: "te-IN", dir: "ltr" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];
export type LanguageInfo = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/** Cookie read during server rendering, so the first HTML is already in the chosen language. */
export const LANGUAGE_COOKIE = "cc_lang";
/** Client-side copy of the choice (survives a cleared cookie). */
export const LANGUAGE_STORAGE_KEY = "careconnect.language";

const BY_CODE = new Map<string, LanguageInfo>(LANGUAGES.map((l) => [l.code, l]));

export function languageInfo(code: Language): LanguageInfo {
  return BY_CODE.get(code) ?? LANGUAGES[0];
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && BY_CODE.has(value);
}

/**
 * A supported language code for a stored value, or null. Accepts codes ("ta", "ta-IN") and the
 * English or native language names patients may have typed into their profile before the field
 * became a picker ("Tamil", "தமிழ்").
 */
export function normalizeLanguage(value: unknown): Language | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const primary = v.split(/[-_]/)[0] ?? "";
  if (isLanguage(primary)) return primary;
  const match = LANGUAGES.find(
    (l) => l.englishName.toLowerCase() === v || l.nativeName.toLowerCase() === v,
  );
  return match?.code ?? null;
}

/** First supported language in an Accept-Language header or navigator.languages list. */
export function negotiateLanguage(preferred: readonly string[]): Language | null {
  for (const tag of preferred) {
    const code = normalizeLanguage(tag.split(";")[0]);
    if (code) return code;
  }
  return null;
}

export function parseAcceptLanguage(header: string | undefined | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim(), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((p) => p.tag && p.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}
