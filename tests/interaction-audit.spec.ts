import { defaultState, enablePatientContact, ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

test("booking deep-link time is selected and clinic radios support arrow keys", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  enablePatientContact(state, ids.clinicA, true);
  enablePatientContact(state, ids.clinicB, true);
  (state.doctors[0]!["clinic_doctors"] as unknown[]).push({
    clinic_id: ids.clinicB,
    active: true,
    verification_state: "verified",
  });
  await backend(state);
  await page.goto(`/book/${ids.doctorVerified}?time=18%3A30`);
  const slot = page.getByRole("button", { name: "6:30 PM", exact: true });
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  const first = page.getByRole("radio", { name: /Test Clinic A/ });
  const second = page.getByRole("radio", { name: /Test Clinic B/ });
  await expect(first).toBeChecked();
  await first.focus();
  await first.press("ArrowDown");
  await expect(second).toBeChecked();
  await expect(slot).toHaveAttribute("aria-pressed", "false");
});

test("failed remote logout clears local credentials and reports the error", async ({
  page,
  backend,
}) => {
  await backend();
  const url = "**/auth/v1/logout*";
  await page.route(url, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "unexpected_failure", msg: "Synthetic outage" }),
    }),
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("[data-sonner-toast]")).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sb-"))),
  ).toEqual([]);
});
