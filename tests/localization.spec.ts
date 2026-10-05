import type { Page } from "@playwright/test";
import { en } from "../src/lib/i18n/messages/en";
import {
  appointmentRow,
  conversationRow,
  defaultState,
  ids,
  TEST_NAME,
} from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

// UI language: selection, persistence (cookie for the server render, localStorage, the patient
// profile), right-to-left Urdu, and the local-time greeting.

const LANGUAGE_COOKIE = "cc_lang";

/** Sets the saved-language cookie before the first request, as a returning visitor has it. */
async function setLanguageCookie(page: Page, lang: string) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("baseURL is not configured");
  await page.context().addCookies([{ name: LANGUAGE_COOKIE, value: lang, url: baseURL }]);
}

const ENGLISH_KEYS = Object.keys(en);
const ENGLISH_STRINGS = new Set(Object.values(en).filter((v) => !v.includes("{")));

test.describe("Language selection", () => {
  test("choosing a language translates the page, survives a reload and is server-rendered", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page.goto("/discover");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find doctors");

    await page.getByRole("button", { name: /change language/i }).click();
    await page.getByRole("menuitemradio", { name: /தமிழ்/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("மருத்துவர்களைத் தேடுங்கள்");
    await expect(page.locator("html")).toHaveAttribute("lang", "ta-IN");
    expect(await page.evaluate(() => localStorage.getItem("careconnect.language"))).toBe("ta");

    // The server reads the cookie, so the first HTML is already Tamil (no English flash).
    const html = await (await page.request.get("/discover")).text();
    expect(html).toContain('lang="ta-IN"');

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("மருத்துவர்களைத் தேடுங்கள்");
    // The selector names the current language for screen readers.
    await expect(page.getByRole("button", { name: /தமிழ்/ })).toBeVisible();
  });

  test("Urdu switches the document to right-to-left without horizontal overflow", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await setLanguageCookie(page, "ur");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/", "/discover", `/doctors/${ids.doctorPending}`, "/login"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ur");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
    // Phone numbers and email addresses stay left-to-right inside Urdu text.
    await page.goto(`/clinics/${ids.clinicA}`);
    await expect(page.getByText("+91 00000 00000")).toHaveAttribute("dir", "ltr");
  });

  test("an unsupported stored language falls back to the browser's language", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await setLanguageCookie(page, "xx");
    await page.addInitScript(() => localStorage.setItem("careconnect.language", "klingon"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a doctor in Chennai");
  });

  test("the language saved on the patient's profile applies when they sign in", async ({
    page,
    backend,
  }) => {
    const state = defaultState();
    const patients = state.patients as Record<string, unknown>[];
    patients[0]!["preferred_language"] = "Hindi"; // a value typed before the field was a picker
    await backend({ patients });
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("मेरे अपॉइंटमेंट");
    await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
  });

  test("choosing a language while signed in saves only that field to the profile", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: TEST_NAME })).toBeVisible();
    await page.getByRole("button", { name: /change language/i }).click();
    await page.getByRole("menuitemradio", { name: /മലയാളം/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("പ്രൊഫൈൽ");
    await expect.poll(() => mock.callsTo("PATCH", "/rest/v1/patients").length).toBe(1);
    expect(mock.callsTo("PATCH", "/rest/v1/patients")[0]?.body).toEqual({
      preferred_language: "ml",
    });
    // The details card shows the saved language by its own name.
    await expect(page.getByText("മലയാളം", { exact: true }).first()).toBeVisible();
  });

  test("a failed profile save keeps the language on this device and says so", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: TEST_NAME })).toBeVisible();
    mock.state.patients = "error";
    await page.getByRole("button", { name: /change language/i }).click();
    await page.getByRole("menuitemradio", { name: /తెలుగు/ }).click();
    await expect(page.getByText(/ఈ పరికరంలో అది ఇప్పటికీ ఉపయోగించబడుతుంది/)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "te-IN");
  });
});

test.describe("Long translations fit small screens", () => {
  // Tamil and Malayalam have the longest words; these pages overflowed before (sort select,
  // appointment tabs, dashboard stat labels and request buttons).
  for (const lang of ["ta", "ml"]) {
    for (const width of [390, 1024]) {
      test(`${lang} at ${width}px: no horizontal page scroll`, async ({ page, backend }) => {
        const mock = await backend({ appointments: [appointmentRow()] });
        mock.state.memberships = [
          { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
        ];
        await setLanguageCookie(page, lang);
        await page.setViewportSize({ width, height: 900 });
        for (const path of ["/", "/discover", "/appointments", "/profile", "/clinic"]) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${lang} ${width} ${path}`).toBeLessThanOrEqual(1);
        }
      });
    }
  }

  test("Urdu keeps Latin times in reading order inside right-to-left text", async ({
    page,
    backend,
  }) => {
    await backend({ appointments: [appointmentRow()] });
    await setLanguageCookie(page, "ur");
    await page.goto("/appointments");
    // The time is wrapped in a left-to-right isolate (U+2066…U+2069), so it reads "7:30 PM".
    await expect(page.getByText(/⁦7:30 PM⁩/).first()).toBeVisible();
  });
});

test.describe("Every page in every language", () => {
  const PAGES = [
    "/",
    "/discover",
    `/doctors/${ids.doctorVerified}`,
    `/doctors/${ids.doctorPending}`,
    `/clinics/${ids.clinicA}`,
    `/book/${ids.doctorVerified}`,
    "/appointments",
    `/appointments/${ids.appointment}`,
    "/messages",
    "/profile",
    "/login",
    "/clinic",
    "/clinic/appointments",
    "/clinic/calendar",
    "/clinic/doctors",
    "/clinic/patients",
    "/clinic/messages",
    "/clinic/profile",
    "/providers",
    "/clinic/signup",
    "/doctor/signup",
    "/doctor",
    "/admin",
    "/admin/providers",
  ];

  for (const lang of ["hi", "ur", "ml", "ta", "te"]) {
    test(`${lang}: no untranslated placeholders, raw keys or English headings`, async ({
      page,
      backend,
    }) => {
      test.setTimeout(120_000);
      const mock = await backend({
        appointments: [appointmentRow()],
        conversations: [conversationRow([{ from: "clinic", body: "Hello" }])],
      });
      mock.state.memberships = [
        { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
      ];
      await setLanguageCookie(page, lang);
      const problems: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const text = await page.locator("body").innerText();
        // {placeholders} left in output, or raw message keys such as "discover.title".
        for (const m of text.matchAll(/\{\w+\}/g)) problems.push(`${path}: ${m[0]}`);
        for (const key of ENGLISH_KEYS) {
          if (text.includes(key)) problems.push(`${path}: raw key ${key}`);
        }
        // Headings are UI strings unless they are database content (doctor or clinic names).
        for (const h of await page.locator("h1, h2").allInnerTexts()) {
          if (ENGLISH_STRINGS.has(h.trim()))
            problems.push(`${path}: English heading "${h.trim()}"`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

test.describe("Greeting uses the viewer's own clock", () => {
  test.describe("in India", () => {
    test.use({ timezoneId: "Asia/Kolkata" });
    test("02:28 local time is night", async ({ page, backend }) => {
      await page.clock.setFixedTime(new Date("2026-10-05T02:28:00+05:30"));
      await backend();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Good night, ${TEST_NAME}`);
    });

    test("09:00 local time is morning, also in Tamil", async ({ page, backend }) => {
      await page.clock.setFixedTime(new Date("2026-10-05T09:00:00+05:30"));
      await backend();
      await setLanguageCookie(page, "ta");
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `காலை வணக்கம், ${TEST_NAME}`,
      );
    });
  });

  test.describe("outside India", () => {
    test.use({ timezoneId: "America/New_York" });
    test("uses the browser's time zone, not IST", async ({ page, backend }) => {
      // 18:00 in New York is 03:30 the next morning in India.
      await page.clock.setFixedTime(new Date("2026-10-05T18:00:00-04:00"));
      await backend();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Good evening, ${TEST_NAME}`,
      );
    });
  });
});
