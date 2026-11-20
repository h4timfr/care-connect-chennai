import { expect, test } from "./support/fixtures";

test("a missing catalogue column is unavailable, stays compact, and retries", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  let fail = true;
  await page.route(/\/rest\/v1\/(clinics|doctors)\?/, async (route) => {
    if (!fail) return route.fallback();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "42703", message: "column missing" }),
    });
  });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("CareConnect is temporarily unavailable.");
  expect((await alert.boundingBox())!.height).toBeLessThan(220);
  fail = false;
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester" })).toBeVisible();
});

test("empty catalogues show compact empty states, not server failures", async ({
  page,
  backend,
}) => {
  await backend({ doctors: [], clinics: [] }, { signedIn: false });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/discover");
  await expect(page.getByText("No matching doctors")).toBeVisible();
  await expect(page.getByText("No doctors are listed on CareConnect yet.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const panel = page.getByText("No matching doctors").locator("../..");
  expect((await panel.boundingBox())!.height).toBeLessThan(220);
});
