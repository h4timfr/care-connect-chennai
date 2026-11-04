import { expect, test } from "./support/fixtures";

test("profile save loads the deferred toast UI and announces success", async ({
  page,
  backend,
}) => {
  await backend();
  const javascriptRequests = new Set<string>();
  page.on("request", (request) => {
    if (/\/assets\/.*\.js(?:\?|$)/.test(request.url())) javascriptRequests.add(request.url());
  });

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Test Patient" })).toBeVisible();
  const initialRequestCount = javascriptRequests.size;

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Full name").fill("Test Patient Updated");
  await page.getByRole("button", { name: "Save details" }).click();

  await expect(
    page
      .getByRole("region", { name: "Notifications alt+T" })
      .getByText("Your details have been saved."),
  ).toBeVisible();
  expect(javascriptRequests.size).toBeGreaterThan(initialRequestCount);
});
