import { LANGUAGES, LANGUAGE_COOKIE, LANGUAGE_STORAGE_KEY } from "../src/lib/i18n/languages";
import { en } from "../src/lib/i18n/messages/en";
import { hi } from "../src/lib/i18n/messages/hi";
import { ml } from "../src/lib/i18n/messages/ml";
import { ta } from "../src/lib/i18n/messages/ta";
import { te } from "../src/lib/i18n/messages/te";
import { ur } from "../src/lib/i18n/messages/ur";
import { LANGUAGE_WELCOME_KEY } from "../src/lib/onboarding-preferences";
import { expect, test } from "./support/fixtures";
import { enablePatientContact, ids } from "./support/mock-backend";

const dictionaries = { en, hi, ml, ta, te, ur };

for (const code of ["en", "hi", "ta", "te", "ml", "ur"] as const) {
  test(`${code} guide remains usable at 200% text size on a narrow screen`, async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page
      .context()
      .addCookies([{ name: LANGUAGE_COOKIE, value: code, url: test.info().project.use.baseURL! }]);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/discover");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.getByRole("button", { name: dictionaries[code]["tour.help"] }).click();
    const guide = page.getByRole("dialog", { name: dictionaries[code]["tour.title.patient"] });
    await expect(
      guide.getByRole("button", { name: dictionaries[code]["tour.skip"] }),
    ).toBeVisible();
    await expect(
      guide.getByRole("button", { name: dictionaries[code]["tour.next"] }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", code === "ur" ? "rtl" : "ltr");
    const overflow = await guide.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

for (const role of ["doctor", "clinic", "admin"] as const) {
  test(`${role} receives an optional first-visit guide and can restart it`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ platformAdmin: role === "admin" });
    if (role === "doctor") mock.state.doctors[0]!["user_id"] = ids.user;
    if (role === "clinic") {
      mock.state.memberships = [
        { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
      ];
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/${role}`);
    const offer = page.getByRole("region", { name: "Take a quick tour?" });
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Start quick tour" }).click();
    const guide = page.getByRole("dialog", { name: en[`tour.title.${role}`] });
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "Skip" }).click();
    await page.reload();
    await expect(offer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restart tour" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
}

test("the welcome can start the patient tour immediately", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Take a quick tour?" })).toBeFocused();
  await page.getByRole("button", { name: "Start quick tour" }).click();
  await expect(page.getByRole("dialog", { name: "Patient guide" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Restart tour" })).toBeFocused();
});

test("first visit defaults to English regardless of browser language", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setExtraHTTPHeaders({ "Accept-Language": "ta-IN,ta;q=0.9" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
  await expect(page.getByRole("region", { name: en["welcome.title"] })).toBeVisible();
});

test("the mobile language welcome leaves the page heading and navigation in place", async ({
  page,
  backend,
}) => {
  await backend();
  await page.setViewportSize({ width: 375, height: 812 });
  let releaseProfile!: () => void;
  const profileReady = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  await page.route("**/rest/v1/patients?*", async (route) => {
    await profileReady;
    await route.fallback();
  });
  const welcome = page.getByRole("region", { name: en["welcome.title"] });
  const heading = page.locator("#home-heading");
  let originalTop = 0;
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(heading).toBeVisible();
    await expect(welcome).toHaveCount(0);
    originalTop = await heading.evaluate((element) => element.getBoundingClientRect().top);
  } finally {
    releaseProfile();
  }
  await expect(welcome).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs((await heading.evaluate((el) => el.getBoundingClientRect().top)) - originalTop),
    )
    .toBeLessThanOrEqual(1);
  const mobileNav = page.getByRole("navigation", { name: en["nav.primaryMobile"] });
  await expect(mobileNav.getByRole("link", { name: en["nav.discover"] })).toBeVisible();
  await mobileNav.getByRole("link", { name: en["nav.discover"] }).click({ trial: true });
  await welcome.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator("#main-content")).toBeFocused();
});

test("changing language during a guide keeps its current step", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/assets/*.js", async (route) => {
    await scriptsReady;
    await route.fallback();
  });
  const help = page.getByRole("button", { name: "Help and tour" });
  try {
    await page.goto("/discover", { waitUntil: "commit" });
    await expect(help).toBeDisabled();
  } finally {
    releaseScripts();
  }
  await expect(help).toBeEnabled();
  await help.click();
  const guide = page.getByRole("dialog", { name: "Patient guide" });
  await guide.getByRole("button", { name: "Next" }).click();
  await guide.getByRole("button", { name: /Change language/ }).click();
  await page.getByRole("menuitemradio", { name: /தமிழ்/ }).click();
  const tamilGuide = page.getByRole("dialog", { name: ta["tour.title.patient"] });
  await expect(tamilGuide).toContainText(ta["tour.patient.book"]);
  await expect(tamilGuide).toContainText("2");
});

for (const { code, locale, nativeName, dir } of LANGUAGES) {
  test(`first visit can choose ${nativeName}, then reopen a fully localized guide`, async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    const messages = dictionaries[code];
    await page.goto("/");
    const welcome = page.getByRole("region", { name: en["welcome.title"] });
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole("button", { name: nativeName, exact: true })).toHaveAttribute(
      "lang",
      locale,
    );
    await welcome.getByRole("button", { name: nativeName, exact: true }).click();
    await page.getByRole("button", { name: messages["welcome.getStarted"], exact: true }).click();
    await page.getByRole("button", { name: messages["welcome.skipTour"], exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    expect(await page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY)).toBe(
      code,
    );
    expect(mock.callsTo("PATCH", "/rest/v1/patients")).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole("region", { name: messages["welcome.title"] })).toHaveCount(0);
    await page.getByRole("button", { name: messages["tour.help"], exact: true }).click();
    const tour = page.getByRole("dialog", { name: messages["tour.title.patient"] });
    await expect(tour).toContainText(messages["tour.patient.find"]);
    for (const step of ["book", "track", "message"] as const) {
      await tour.getByRole("button", { name: messages["tour.next"] }).click();
      await expect(tour).toContainText(messages[`tour.patient.${step}`]);
    }
    await tour.getByRole("button", { name: messages["tour.finish"] }).click();
    await expect(page.getByRole("button", { name: messages["tour.restart"] })).toBeFocused();
  });
}

test("an existing profile or device language suppresses the welcome", async ({ page, backend }) => {
  const mock = await backend();
  (mock.state.patients as Record<string, unknown>[])[0]!["preferred_language"] = "ta";
  await page.goto("/discover");
  await expect(page.locator("html")).toHaveAttribute("lang", "ta-IN");
  await expect(page.getByRole("region", { name: ta["welcome.title"] })).toHaveCount(0);
  expect(mock.callsTo("PATCH", "/rest/v1/patients")).toHaveLength(0);
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === LANGUAGE_COOKIE)?.value,
  ).toBe("ta");
});

test("a new visitor can skip the welcome permanently without starting a tour", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.goto("/discover");
  const welcome = page.getByRole("region", { name: en["welcome.title"] });
  await welcome.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), LANGUAGE_WELCOME_KEY)).toBe(
    "seen",
  );
  await page.reload();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help and tour" })).toBeVisible();
});

test("storage unavailable does not block login or a preselected booking", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  enablePatientContact(mock.state, ids.clinicA, true);
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("careconnect."))
        throw new DOMException("Storage blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("careconnect."))
        throw new DOMException("Storage blocked", "SecurityError");
      set.call(this, key, value);
    };
    Object.defineProperty(document, "cookie", {
      get: () => {
        throw new DOMException("Cookies blocked", "SecurityError");
      },
      set: () => {
        throw new DOMException("Cookies blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("region", { name: en["welcome.title"] })
    .getByRole("button", { name: "English", exact: true })
    .click();
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByRole("region", { name: en["welcome.title"] })).toHaveCount(0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  await page.goto(`/book/${ids.doctorVerified}?date=${today}&time=09%3A30&clinicId=${ids.clinicA}`);
  await expect(page.getByRole("button", { name: "Request appointment" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("patient guide traps keyboard focus, skips missing targets, and restarts at step one", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover");
  const trigger = page.getByRole("button", { name: "Help and tour" });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await trigger.press("Enter");
  const tour = page.getByRole("dialog", { name: "Patient guide" });
  await expect(tour.getByRole("heading")).toBeFocused();
  await expect(tour).toHaveAccessibleDescription(/Step 1 of 4/);
  await expect(page.locator("[data-tour-highlight]")).toHaveCount(1);
  const next = tour.getByRole("button", { name: "Next" });
  await page.keyboard.press("Tab");
  await expect(tour.getByRole("button", { name: /Change language/ })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tour).toHaveAccessibleDescription(/Step 2 of 4/);
  await expect(page.locator("[data-tour-highlight]")).toHaveCount(0);
  await tour.getByRole("button", { name: "Back" }).click();
  await expect(tour).toHaveAccessibleDescription(/Step 1 of 4/);
  await tour.getByRole("button", { name: "Skip" }).click();
  const restart = page.getByRole("button", { name: "Restart tour" });
  await expect(restart).toBeFocused();
  await page.reload();
  await restart.click();
  await expect(tour).toHaveAccessibleDescription(/Step 1 of 4/);
  await page.keyboard.press("Escape");
  await expect(restart).toBeFocused();
  await expect(tour).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("patient guide moves its highlight to the visible navigation after resizing", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover");
  const trigger = page.getByRole("button", { name: "Help and tour" });
  await expect(trigger).toBeEnabled();
  await trigger.press("Enter");
  const tour = page.getByRole("dialog", { name: "Patient guide" });
  const highlight = page.locator("[data-tour-highlight]");
  await expect(highlight).toHaveCount(1);

  await page.setViewportSize({ width: 1280, height: 900 });
  const target = page.locator('[data-tour-target="/discover"]:visible');
  await expect
    .poll(() =>
      target.evaluateAll((links) => {
        const outline = document.querySelector("[data-tour-highlight]")?.getBoundingClientRect();
        return Boolean(
          outline &&
          links.some((link) => {
            const rect = link.getBoundingClientRect();
            return Math.abs(outline.x - rect.x) < 1 && Math.abs(outline.y - rect.y) < 1;
          }),
        );
      }),
    )
    .toBe(true);
  await expect(tour.getByRole("heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(highlight).toHaveCount(0);
});

for (const { role, path, count, text } of [
  { role: "doctor", path: "/doctor", count: 4, text: en["tour.doctor.verify"] },
  { role: "clinic", path: "/clinic", count: 4, text: en["tour.clinic.verify"] },
  { role: "admin", path: "/admin", count: 3, text: en["tour.admin.review"] },
] as const) {
  test(`${role} guide stays optional and records completion only for its role`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ platformAdmin: role === "admin" });
    if (role === "doctor") mock.state.doctors[0]!["user_id"] = ids.user;
    if (role === "clinic") {
      mock.state.memberships = [
        { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
      ];
    }
    await page.addInitScript(() => localStorage.setItem("careconnect.tour.patient.v1", "seen"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Help and tour" }).click();
    const tour = page.getByRole("dialog", { name: en[`tour.title.${role}`] });
    await expect(tour).toContainText(text);
    for (let step = 1; step < count; step++)
      await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Finish" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Restart tour" })).toBeVisible();
    const decisions = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("careconnect.tour."))
        .sort(),
    );
    expect(decisions).toEqual(
      ["careconnect.tour.patient.v1", `careconnect.tour.${role}.v1`].sort(),
    );
  });
}
