import { en } from "../src/lib/i18n/messages/en";
import { expect, test } from "./support/fixtures";

test("Home search submits the chosen term before JavaScript is available", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: en["home.searchLabel"] });
  await search.fill("Cardiology");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/discover\?q=Cardiology$/);
  await expect(page.getByRole("heading", { level: 1, name: en["discover.title"] })).toBeVisible();
});

test("hydration preserves text and keyboard focus in Home search", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  let releaseScripts!: () => void;
  const scripts = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/assets/*.js", async (route) => {
    await scripts;
    await route.fallback();
  });
  const search = page.getByRole("searchbox", { name: en["home.searchLabel"] });
  try {
    await page.goto("/", { waitUntil: "commit" });
    await search.fill("Adyar");
    await expect(search).toBeFocused();
  } finally {
    releaseScripts();
  }
  await expect(page.getByRole("link", { name: en["nav.signIn"], exact: true })).toBeVisible();
  await expect(search).toHaveValue("Adyar");
  await expect(search).toBeFocused();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/discover\?q=Adyar$/);
});

test("Home balances specialty rows and opens the matching Discovery filter", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const specialties = page.getByRole("region", { name: en["home.browseBySpecialty"] });
  await expect(specialties.getByRole("listitem")).toHaveCount(12);
  const rows = await specialties.getByRole("listitem").evaluateAll((items) => {
    const counts = new Map<number, number>();
    for (const item of items) {
      const y = Math.round(item.getBoundingClientRect().y);
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    return [...counts.values()];
  });
  expect(rows).toEqual([6, 6]);
  await page.setViewportSize({ width: 375, height: 812 });
  const eyeCareLabel = specialties.getByText(en["specialty.ophthalmology"], { exact: true });
  await expect(eyeCareLabel).toBeVisible();
  const labelFits = await eyeCareLabel.evaluate(
    (label) =>
      label.getBoundingClientRect().height <= parseFloat(getComputedStyle(label).lineHeight) + 1,
  );
  expect(labelFits).toBe(true);
  await expect(
    specialties.getByRole("link", { name: en["discover.allSpecialties"] }),
  ).toHaveAttribute("href", "/discover");
  await specialties.getByRole("link", { name: en["specialty.cardiology"], exact: true }).click();
  await expect(page).toHaveURL(/\/discover\?specialty=cardiology$/);
  await expect(
    page.getByRole("button", { name: en["specialty.cardiology"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("admin review selection survives browser Back and reload", async ({ page, backend }) => {
  await backend({ platformAdmin: true });
  await page.goto("/admin");
  const demo = page.getByRole("tab", { name: en["admin.tab.demo"] });
  await demo.click();
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: en["candidates.openReview"] }).click();
  await expect(page).toHaveURL(/\/admin\/providers$/);
  await page.goBack();
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(demo).toHaveAttribute("aria-selected", "true");
});

test("empty Home keeps a clinic application link and uses local fonts", async ({
  page,
  backend,
}) => {
  await backend({ doctors: [], clinics: [] }, { signedIn: false });
  const response = await page.goto("/");
  if (!response) throw new Error("Missing Home response.");
  const html = await response.text();
  expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  const csp = (response.headers()["content-security-policy"] ?? "")
    .split(";")
    .map((value) => value.trim());
  expect(csp).toContain("font-src 'self'");
  await expect(page.getByRole("heading", { name: en["home.noDoctorsTitle"] })).toBeVisible();
  await expect(page.getByRole("heading", { name: en["home.noClinicsTitle"] })).toBeVisible();
  const apply = page.getByRole("link", { name: en["providers.apply"], exact: true });
  await expect(apply).toHaveAttribute("href", "/providers/apply");
  await apply.click();
  await expect(page).toHaveURL(/\/clinic\/signup$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a long patient name leaves the Home search usable on a narrow screen", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  const longName = "பயனர்".repeat(12);
  const patient = Array.isArray(mock.state.patients) ? mock.state.patients[0] : undefined;
  if (!patient) throw new Error("Missing synthetic patient.");
  patient["full_name"] = longName;
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(longName);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("searchbox", { name: en["home.searchLabel"] }).fill("Adyar");
  await page.getByRole("button", { name: en["home.search"], exact: true }).click();
  await expect(page).toHaveURL(/\/discover\?q=Adyar$/);
});

test("English provider names keep their card alignment in Urdu", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  const origin = test.info().project.use.baseURL;
  if (!origin) throw new Error("Missing app origin.");
  await page.context().addCookies([{ name: "cc_lang", value: "ur", url: origin }]);
  await page.goto("/");
  for (const name of ["Dr. Verified Tester", "Test Clinic A"]) {
    const heading = page.getByRole("heading", { level: 3, name });
    await expect(heading).toHaveCSS("direction", "rtl");
    await expect(heading.locator("bdi")).toHaveCSS("direction", "ltr");
  }
});
