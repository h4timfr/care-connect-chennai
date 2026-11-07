/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { en, type MessageKey, type Messages } from "./messages/en";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  languageInfo,
  normalizeLanguage,
  type Language,
  type LanguageInfo,
} from "./languages";
import {
  addDays,
  clockTime,
  fullDate,
  inr,
  isoDate,
  longDate,
  shortDate,
  specialtyInfo,
  to12h,
} from "@/lib/format";

export type { MessageKey, Messages } from "./messages/en";
export * from "./languages";

type Vars = Record<string, string | number>;
/** Keys that have _one/_other plural forms, without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_one` ? Base : never;
}[MessageKey];

// ---------------------------------------------------------------------------------------------
// Dictionaries: English ships with the app; the others are loaded on demand and cached.
// ---------------------------------------------------------------------------------------------

const loaders: Record<Exclude<Language, "en">, () => Promise<Messages>> = {
  hi: () => import("./messages/hi").then((m) => m.hi),
  ur: () => import("./messages/ur").then((m) => m.ur),
  ml: () => import("./messages/ml").then((m) => m.ml),
  ta: () => import("./messages/ta").then((m) => m.ta),
  te: () => import("./messages/te").then((m) => m.te),
};

const cache = new Map<Language, Messages>([["en", en]]);

export async function loadMessages(lang: Language): Promise<Messages> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const messages = lang === "en" ? en : await loaders[lang]();
  cache.set(lang, messages);
  return messages;
}

export function primeMessages(lang: Language, messages: Messages) {
  cache.set(lang, messages);
}

/** A message in a specific language (English if that dictionary hasn't been loaded). */
export function translateIn(lang: Language, key: MessageKey, vars?: Vars) {
  return interpolate((cache.get(lang) ?? en)[key] ?? en[key], vars);
}

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

// ---------------------------------------------------------------------------------------------
// Formatting in the active language
// ---------------------------------------------------------------------------------------------

/** Display names for languages doctors list (stored in English in the database). */
const LANGUAGE_NAME_CODES: Record<string, string> = {
  english: "en",
  tamil: "ta",
  hindi: "hi",
  telugu: "te",
  malayalam: "ml",
  kannada: "kn",
  urdu: "ur",
  bengali: "bn",
  marathi: "mr",
  gujarati: "gu",
  punjabi: "pa",
  odia: "or",
  arabic: "ar",
  french: "fr",
};

/** Left-to-right isolate, so "7:30 PM" or "₹400" isn't reordered inside right-to-left text. */
const ltr = (s: string) => `\u2066${s}\u2069`;

function createFormatters(info: LanguageInfo, t: Translate) {
  const { locale, code } = info;
  const iso = info.dir === "rtl" ? ltr : (s: string) => s;
  const languageNames =
    code === "en" ? null : new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
  const hourFormat = new Intl.DateTimeFormat(code === "en" ? "en-US" : locale, {
    hour: "numeric",
    timeZone: "UTC",
  });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  return {
    number: (n: number) => n.toLocaleString(locale),
    inr: (n: number) => iso(inr(n, locale)),
    time: (hhmm: string) => iso(to12h(hhmm, locale)),
    timeIst: (hhmm: string) => t("common.timeIst", { time: iso(to12h(hhmm, locale)) }),
    longDate: (iso: string) => longDate(iso, locale) || t("common.notSet"),
    fullDate: (iso: string) => fullDate(iso, locale),
    shortDate: (iso: string) => shortDate(iso, locale),
    relativeDay: (iso: string) => {
      if (iso === isoDate(new Date())) return t("common.today");
      if (iso === isoDate(addDays(new Date(), 1))) return t("common.tomorrow");
      return shortDate(iso, locale);
    },
    clockTime: (isoDateTime: string) => iso(clockTime(isoDateTime, locale)),
    /** Weekday name for 0 (Sunday) … 6 (Saturday), as stored in doctor_schedules.day_of_week. */
    weekday: (dow: number) => weekdayFormat.format(new Date(Date.UTC(2024, 0, 7 + dow))),
    /** "9 AM" style label for an hour of the day (0-23). */
    hour: (h: number) => hourFormat.format(new Date(Date.UTC(2000, 0, 1, h))),
    specialty: (id: string) => {
      if (!id) return "";
      if (specialtyInfo(id)) return t(`specialty.${id}` as MessageKey);
      return id
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    },
    /** A doctor's spoken language ("Tamil") shown in the UI language; unknown names unchanged. */
    languageName: (name: string) => {
      const iso = LANGUAGE_NAME_CODES[name.trim().toLowerCase()];
      return (iso && languageNames?.of(iso)) || name;
    },
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

// ---------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------

export interface Translate {
  (key: MessageKey, vars?: Vars): string;
  /** Plural form for `count` (also available to the template as {count}). */
  plural: (key: PluralKey, count: number, vars?: Vars) => string;
}

export interface I18n {
  lang: Language;
  info: LanguageInfo;
  dir: "ltr" | "rtl";
  t: Translate;
  fmt: Formatters;
  /** Switches the UI language; resolves once the dictionary is loaded and applied. */
  setLanguage: (lang: Language) => Promise<void>;
}

function createTranslate(messages: Messages, locale: string): Translate {
  const rules = new Intl.PluralRules(locale);
  const t = ((key: MessageKey, vars?: Vars) =>
    interpolate(messages[key] ?? en[key] ?? key, vars)) as Translate;
  t.plural = (key, count, vars) => {
    const form = rules.select(count) === "one" ? "one" : "other";
    return t(`${key}_${form}` as MessageKey, { count: count.toLocaleString(locale), ...vars });
  };
  return t;
}

function buildI18n(
  lang: Language,
  messages: Messages,
  setLanguage: (lang: Language) => Promise<void>,
): I18n {
  const info = languageInfo(lang);
  const t = createTranslate(messages, info.locale);
  return { lang, info, dir: info.dir, t, fmt: createFormatters(info, t), setLanguage };
}

// English without a provider (e.g. the root error page if the app itself failed to render).
const fallback = buildI18n("en", en, async () => {});
const I18nContext = createContext<I18n>(fallback);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remembers the choice in a cookie (read by the server renderer) and in localStorage. */
export function persistLanguage(lang: Language) {
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  } catch {
    // Cookies disabled: the choice still applies for this visit.
  }
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Storage unavailable (private mode).
  }
}

function readStoredLanguage(): Language | null {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function hasLanguageCookie() {
  try {
    return document.cookie.split(/;\s*/).some((c) => c.startsWith(`${LANGUAGE_COOKIE}=`));
  } catch {
    return false;
  }
}

export function I18nProvider({
  initialLanguage,
  initialMessages,
  children,
}: {
  initialLanguage: Language;
  /** Dictionary for `initialLanguage` (from the root loader, so hydration matches the server). */
  initialMessages: Messages;
  children: ReactNode;
}) {
  primeMessages(initialLanguage, initialMessages);
  const [state, setState] = useState({ lang: initialLanguage, messages: initialMessages });
  const requested = useRef(initialLanguage);

  const setLanguage = useCallback(async (lang: Language) => {
    requested.current = lang;
    persistLanguage(lang);
    const messages = await loadMessages(lang);
    // A later choice made while this dictionary was loading wins.
    if (requested.current === lang) setState({ lang, messages });
  }, []);

  // A choice stored on this device but missing from the cookie (cleared cookies) still applies.
  useEffect(() => {
    if (hasLanguageCookie()) return;
    const stored = readStoredLanguage();
    if (stored && stored !== requested.current) void setLanguage(stored);
  }, [setLanguage]);

  const value = useMemo(
    () => buildI18n(state.lang, state.messages, setLanguage),
    [state, setLanguage],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.info.locale;
    root.dir = value.dir;
  }, [value.info.locale, value.dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Renders a message whose placeholders are React nodes, e.g.
 * <Trans k="auth.confirmSent" values={{ email: <strong>{email}</strong> }} />.
 */
export function Trans({ k, values }: { k: MessageKey; values: Record<string, ReactNode> }) {
  const { t } = useI18n();
  const parts = t(k).split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return <Fragment key={i}>{name && name in values ? values[name] : part}</Fragment>;
      })}
    </>
  );
}

export { DEFAULT_LANGUAGE };
