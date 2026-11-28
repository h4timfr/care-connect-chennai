import { expect, test } from "./support/fixtures";
import {
  conversationRow,
  enablePatientContact,
  fakeAccessToken,
  ids,
  PROJECT_REF,
} from "./support/mock-backend";

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

test("a genuine logout fallback warning clears when the doctor signs back in", async ({
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

test("a delayed logout failure cannot announce in a replacement doctor session", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  const doctor = mock.state.doctors[0]!;
  doctor["user_id"] = ids.user;
  let releaseLogout!: () => void;
  const pendingLogout = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  let requestStarted = false;
  let requestFailed = false;
  await page.route("**/auth/v1/logout?*", async (route) => {
    requestStarted = true;
    await pendingLogout;
    await route.abort("failed");
    requestFailed = true;
  });

  await page.goto("/doctor");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  try {
    await expect.poll(() => requestStarted).toBe(true);
    await expect(page).toHaveURL(/\/doctor\/login/);
    const newOwner = "00000000-0000-4000-8000-0000000000b2";
    mock.state.authUserId = newOwner;
    mock.state.authEmail = "other-doctor@example.test";
    doctor["user_id"] = newOwner;
    await page.getByLabel("Email", { exact: true }).fill(mock.state.authEmail);
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in to Doctor Portal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  } finally {
    releaseLogout();
  }
  await expect.poll(() => requestFailed).toBe(true);
  // Observe the failed request's UI result without relying on a race with the catch handler.
  await expect(page.getByText(connectionWarning)).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("fallback timers expire independently and a direct account switch clears the remaining alert", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  await page.route(/\/assets\/sonner-[^/]+\.js(?:\?.*)?$/, (route) => route.abort("failed"));
  await page.clock.install();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Test Patient" })).toBeVisible();

  const saveProfile = async (name: string) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Full name").fill(name);
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  };
  const notifications = page.getByTestId("toast-fallback-announcement");
  await saveProfile("Synthetic patient first save");
  await expect(notifications).toHaveCount(1);
  await page.clock.fastForward(1600);
  await saveProfile("Synthetic patient second save");
  await expect(notifications).toHaveCount(2);
  await page.clock.fastForward(2500);
  await expect(notifications).toHaveCount(1);

  const replacement = "00000000-0000-4000-8000-0000000000b2";
  const email = "replacement@example.test";
  mock.state.authUserId = replacement;
  mock.state.authEmail = email;
  const newUserCheck = page.waitForResponse(
    (response) => response.url().endsWith("/auth/v1/user") && response.ok(),
  );
  await page.evaluate(
    ({ key, id, email, token }) => {
      const session = {
        access_token: token,
        refresh_token: "synthetic-replacement-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: { id, email },
      };
      localStorage.setItem(key, JSON.stringify(session));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session });
      channel.close();
    },
    {
      key: `sb-${PROJECT_REF}-auth-token`,
      id: replacement,
      email,
      token: fakeAccessToken(replacement, email),
    },
  );
  await newUserCheck;
  await expect(notifications).toHaveCount(0);
});
