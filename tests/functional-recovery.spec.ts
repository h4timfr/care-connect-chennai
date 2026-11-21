import { expect, test } from "./support/fixtures";
import { ids } from "./support/mock-backend";

test("doctor profile saves refresh cached patient search results", async ({ page, backend }) => {
  const mock = await backend();
  mock.state.doctors[0]!["user_id"] = ids.user;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/doctor/profile");
  await page.getByRole("link", { name: "Switch to patient app" }).click();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Find doctors" })
    .click();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search doctors and clinics" }).fill("Verified");
  await expect(page).toHaveURL(/q=Verified/);
  await expect
    .poll(
      () => mock.callsTo("GET", "/rest/v1/doctors").filter((c) => c.search.includes("or=")).length,
    )
    .toBeGreaterThan(0);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/doctor\/profile/);
  await page.getByLabel("Consultation fee (₹)").fill("9876");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Your details have been saved")).toBeVisible();
  const count = mock
    .callsTo("GET", "/rest/v1/doctors")
    .filter((c) => c.search.includes("or=")).length;
  await page.goForward();
  await page.goForward();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester" })).toBeVisible();
  await expect
    .poll(
      () => mock.callsTo("GET", "/rest/v1/doctors").filter((c) => c.search.includes("or=")).length,
    )
    .toBeGreaterThan(count);
  await expect(page.getByText(/9,876/)).toBeVisible();
});
