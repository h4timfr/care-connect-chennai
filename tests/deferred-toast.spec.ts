import { expect, test } from "./support/fixtures";
import { conversationRow, ids } from "./support/mock-backend";

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

test("profile save announces success when the deferred Sonner chunk fails to load", async ({
  page,
  backend,
}) => {
  await backend();
  let blockedSonnerChunk = false;
  await page.route(/\/assets\/sonner-[^/]+\.js(?:\?.*)?$/, async (route) => {
    blockedSonnerChunk = true;
    await route.abort("failed");
  });

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Test Patient" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Full name").fill("Test Patient Updated");
  await page.getByRole("button", { name: "Save details" }).click();

  const announcement = page.getByTestId("toast-fallback-announcement");
  await expect(announcement).toHaveAttribute("role", "status");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveText("Your details have been saved.");
  expect(blockedSonnerChunk).toBe(true);
});

test("message failure remains announced when the deferred Sonner chunk fails to load", async ({
  page,
  backend,
}) => {
  await backend({
    conversations: [conversationRow([{ from: "clinic", body: "Synthetic clinic message" }])],
    failMessageInsert: true,
  });
  let blockedSonnerChunk = false;
  await page.route(/\/assets\/sonner-[^/]+\.js(?:\?.*)?$/, async (route) => {
    blockedSonnerChunk = true;
    await route.abort("failed");
  });

  await page.goto(`/messages?c=${ids.conversation}`);
  await page.getByLabel("Message", { exact: true }).fill("Synthetic reply that will fail");
  await page.getByRole("button", { name: "Send message" }).click();

  const announcement = page.getByTestId("toast-fallback-announcement");
  await expect(announcement).toHaveAttribute("role", "alert");
  await expect(announcement).toHaveAttribute("aria-live", "assertive");
  await expect(announcement).toContainText("Message not sent");
  expect(blockedSonnerChunk).toBe(true);
});
