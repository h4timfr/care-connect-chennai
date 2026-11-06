import { conversationRow, defaultState, ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

for (const role of ["patient", "clinic", "doctor"] as const) {
  test(`${role}: denied send after switching recipients cannot alter the new composer`, async ({
    page,
    backend,
  }) => {
    const state = defaultState();
    if (role === "doctor") state.doctors[0]!["user_id"] = ids.user;
    await backend({
      doctors: state.doctors,
      memberships:
        role === "clinic"
          ? [{ clinic_id: ids.clinicA, role: "clinic_staff", clinics: state.clinics[0] }]
          : [],
      conversations: [
        conversationRow([]),
        {
          ...conversationRow([]),
          id: "second-thread",
          clinic_id: role === "patient" ? ids.clinicB : ids.clinicA,
          patients: { full_name: "Second Recipient", user_id: "synthetic-other" },
        },
      ],
      doctorConversations: [ids.conversation, "second-thread"].map((id, index) => ({
        id,
        clinic_id: ids.clinicA,
        clinic_name: "Test Clinic A",
        patient_name: index ? "Second Recipient" : "First Recipient",
        messages: [],
      })),
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let submissions = 0;
    await page.route("**/rest/v1/messages", async (route) => {
      submissions += 1;
      await gate;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "Synthetic authorization denial" }),
      });
    });
    const route = role === "patient" ? "/messages" : `/${role}/messages`;
    await page.goto(`${route}?c=${ids.conversation}`);
    const input = page.getByRole("textbox");
    await input.fill("First recipient draft");
    const request = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().includes("/rest/v1/messages"),
    );
    await page
      .locator("form")
      .last()
      .evaluate((form) => {
        (form as HTMLFormElement).requestSubmit();
        (form as HTMLFormElement).requestSubmit();
      });
    await request;
    try {
      await page
        .getByRole("button", { name: role === "patient" ? /Test Clinic B/ : /Second Recipient/ })
        .click();
      await input.fill("Second recipient draft");
      const denied = page.waitForResponse(
        (r) => r.status() === 403 && r.url().includes("/rest/v1/messages"),
      );
      release();
      await denied;
      expect(submissions).toBe(1);
      await expect(input).toHaveValue("Second recipient draft");
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await page
        .getByRole("button", {
          name:
            role === "patient"
              ? /Test Clinic A/
              : role === "clinic"
                ? /Test Patient/
                : /First Recipient/,
        })
        .click();
      await expect(input).toHaveValue("");
    } finally {
      release();
    }
  });
}

test("repeated profile retries remain errors until a genuine profile response succeeds", async ({
  page,
  backend,
}) => {
  const mock = await backend({ patients: "error" });
  await page.goto("/messages");
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  const response = page.waitForResponse(
    (r) => r.url().includes("/rest/v1/patients") && r.status() === 500,
  );
  await retry.click();
  await response;
  await expect(retry).toBeVisible();
  await expect(page.getByText("No conversations yet")).toHaveCount(0);
  mock.state.patients = defaultState().patients;
  await retry.click();
  await expect(page.getByText("No conversations yet")).toBeVisible();
});

for (const route of ["/messages", "/appointments", `/book/${ids.doctorVerified}`]) {
  test(`logout during profile retry cannot restore private UI at ${route}`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ patients: "error" });
    await page.goto(route);
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    mock.state.patients = defaultState().patients;
    mock.state.delays["patients"] = 1000;
    const started = page.waitForRequest((r) => r.url().includes("/rest/v1/patients"));
    await retry.click();
    const request = await started;
    await page.evaluate(() => {
      const key = "sb-careconnect-test-auth-token";
      localStorage.removeItem(key);
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_OUT", session: null });
      channel.close();
    });
    const response = await request.response();
    if (response) await response.finished();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Test Patient", { exact: true })).toHaveCount(0);
  });
}
