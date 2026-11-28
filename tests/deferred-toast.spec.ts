import { expect, test } from "./support/fixtures";
import { conversationRow, enablePatientContact, ids } from "./support/mock-backend";

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
  const mock = await backend({
    conversations: [conversationRow([{ from: "clinic", body: "Synthetic clinic message" }])],
    failMessageInsert: true,
  });
  enablePatientContact(mock.state, ids.clinicA);
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

const connectionWarning = /We couldn't reach CareConnect's servers/;

test("a failed logout fallback warning expires after the doctor signs back in", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  mock.state.doctors[0]!["user_id"] = ids.user;
  let logoutFailed = false;
  let toastImportFailed = false;
  const successfulReads = new Set<string>();
  const realtimeSockets: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname === "careconnect-test.invalid" && response.ok()) {
      successfulReads.add(url.pathname);
    }
  });
  page.on("websocket", (socket) => {
    if (socket.url().includes("/realtime/")) realtimeSockets.push(socket.url());
  });
  await page.route("**/auth/v1/logout?*", async (route) => {
    logoutFailed = true;
    await route.abort("failed");
  });
  await page.route(/\/assets\/sonner-[^/]+\.js(?:\?.*)?$/, async (route) => {
    toastImportFailed = true;
    await route.abort("failed");
  });
  await page.route("**/rest/v1/rpc/doctor_message_inbox?*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: [], headers: { "access-control-allow-origin": "*" } })
      : route.fallback(),
  );
  await page.clock.install();
  await page.goto("/doctor");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();

  const announcement = page.getByTestId("toast-fallback-announcement");
  await expect(announcement).toHaveText(connectionWarning);
  expect(logoutFailed).toBe(true);
  expect(toastImportFailed).toBe(true);
  await expect(page).toHaveURL(/\/doctor\/login/);
  await page.getByLabel("Email", { exact: true }).fill("doctor@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in to Doctor Portal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No upcoming appointments")).toBeVisible();
  await page.getByRole("link", { name: "Appointments", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Schedule", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Messages", exact: true }).first().click();
  await expect(page.getByText("No conversations yet", { exact: true })).toBeVisible();
  expect(successfulReads.has("/rest/v1/rpc/doctor_appointments")).toBe(true);
  expect(successfulReads.has("/rest/v1/rpc/doctor_conversations")).toBe(true);
  expect(successfulReads.has("/rest/v1/rpc/doctor_message_inbox")).toBe(true);
  expect(realtimeSockets).toHaveLength(0);
  await page.clock.fastForward(5000);
  await expect(announcement).toHaveCount(0);
});

test("a real doctor appointments request failure still shows a retryable connection error", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  mock.state.doctors[0]!["user_id"] = ids.user;
  let requestFailed = false;
  const appointmentsPath = "**/rest/v1/rpc/doctor_appointments";
  await page.route(appointmentsPath, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    requestFailed = true;
    await route.abort("failed");
  });

  await page.goto("/doctor/appointments");
  await expect(page.getByText(connectionWarning)).toBeVisible();
  await expect(page.getByTestId("toast-fallback-announcement")).toHaveCount(0);
  expect(requestFailed).toBe(true);
  await page.unroute(appointmentsPath);
  await page.getByRole("button", { name: /retry|try again/i }).click();
  await expect(page.getByText("No upcoming appointments", { exact: true })).toBeVisible();
  await expect(page.getByText(connectionWarning)).toHaveCount(0);
});
