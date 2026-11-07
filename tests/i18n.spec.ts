import { test, expect } from "@playwright/test";
import { en } from "../src/lib/i18n/messages/en";
import { hi } from "../src/lib/i18n/messages/hi";
import { ur } from "../src/lib/i18n/messages/ur";
import { ml } from "../src/lib/i18n/messages/ml";
import { ta } from "../src/lib/i18n/messages/ta";
import { te } from "../src/lib/i18n/messages/te";
import {
  LANGUAGES,
  negotiateLanguage,
  normalizeLanguage,
  parseAcceptLanguage,
} from "../src/lib/i18n/languages";
import { dayPeriod } from "../src/lib/greeting";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const DICTIONARIES = { hi, ur, ml, ta, te } as const;

test.describe("translations", () => {
  test("every supported language has a dictionary", () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(["en", "hi", "ml", "ta", "te", "ur"]);
  });

  for (const [code, messages] of Object.entries(DICTIONARIES)) {
    test(`${code}: same keys and placeholders as English, nothing left empty`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      const problems: string[] = [];
      for (const [key, source] of Object.entries(en)) {
        const translated = (messages as Record<string, string>)[key] ?? "";
        if (!translated.trim()) problems.push(`${key}: empty`);
        if (placeholders(translated).join() !== placeholders(source).join()) {
          problems.push(
            `${key}: placeholders ${placeholders(translated)} ≠ ${placeholders(source)}`,
          );
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test("Urdu is the only right-to-left language", () => {
    expect(LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code)).toEqual(["ur"]);
  });
});

test.describe("language preference parsing", () => {
  test("accepts codes, regional tags and the names patients typed before", () => {
    expect(normalizeLanguage("ta")).toBe("ta");
    expect(normalizeLanguage("ta-IN")).toBe("ta");
    expect(normalizeLanguage(" Tamil ")).toBe("ta");
    expect(normalizeLanguage("தமிழ்")).toBe("ta");
    expect(normalizeLanguage("HINDI")).toBe("hi");
    expect(normalizeLanguage("ur_PK")).toBe("ur");
  });

  test("rejects unsupported or malformed values", () => {
    expect(normalizeLanguage("Kannada")).toBeNull();
    expect(normalizeLanguage("fr")).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage("<script>")).toBeNull();
    expect(normalizeLanguage(42)).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
  });

  test("negotiates the browser's Accept-Language by quality", () => {
    expect(negotiateLanguage(parseAcceptLanguage("fr-FR,fr;q=0.9,ml;q=0.8,en;q=0.7"))).toBe("ml");
    expect(negotiateLanguage(parseAcceptLanguage("en;q=0.5,te;q=0.9"))).toBe("te");
    expect(negotiateLanguage(parseAcceptLanguage("de,fr"))).toBeNull();
    expect(negotiateLanguage(parseAcceptLanguage("ta;q=0"))).toBeNull();
    expect(negotiateLanguage(parseAcceptLanguage(undefined))).toBeNull();
  });
});

test.describe("greeting by local time of day", () => {
  const cases: [string, number, string][] = [
    ["00:00", 0, "night"],
    ["02:28", 2, "night"],
    ["04:59", 4, "night"],
    ["05:00", 5, "morning"],
    ["11:59", 11, "morning"],
    ["12:00", 12, "afternoon"],
    ["16:59", 16, "afternoon"],
    ["17:00", 17, "evening"],
    ["20:59", 20, "evening"],
    ["21:00", 21, "night"],
    ["23:59", 23, "night"],
  ];
  for (const [clock, hour, expected] of cases) {
    test(`${clock} is ${expected}`, () => {
      expect(dayPeriod(hour)).toBe(expected);
    });
  }
});
