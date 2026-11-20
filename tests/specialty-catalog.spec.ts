import { expect, test } from "./support/fixtures";
import { defaultState } from "./support/mock-backend";
import { SPECIALTIES } from "../src/lib/format";

test("the specialty catalog remains available without listed providers", async ({
  page,
  backend,
}) => {
  await backend({ doctors: [], clinics: [] }, { signedIn: false });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  for (const specialty of SPECIALTIES) {
    await expect(page.getByRole("link", { name: specialty.name, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Psychiatry", exact: true }).click();
  await expect(page).toHaveURL(/specialty=psychiatry/);
  await expect(page.getByRole("button", { name: "Psychiatry", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText(/no doctors match/i)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("general medicine still finds published doctors", async ({ page, backend }) => {
  const state = defaultState();
  state.doctors[0]!["specialty_id"] = "general";
  await backend(state, { signedIn: false });
  await page.goto("/discover?specialty=general");
  await expect(page.getByRole("link", { name: "Dr. Verified Tester", exact: true })).toBeVisible();
  await page.locator("#discover-search").fill("Verified Tester");
  await expect(page.getByRole("link", { name: "Dr. Verified Tester", exact: true })).toBeVisible();
});

test("switching language retains the selected specialty", async ({ page, backend }) => {
  await backend({ doctors: [], clinics: [] }, { signedIn: false });
  await page.goto("/discover?specialty=psychiatry");
  await page.getByRole("button", { name: /change language/i }).click();
  await page.getByRole("menuitemradio", { name: /தமிழ்/ }).click();
  await expect(page).toHaveURL(/specialty=psychiatry/);
  await expect(page.getByRole("button", { name: "மனநல மருத்துவம்", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
