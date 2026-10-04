import { test as base, expect } from "@playwright/test";
import {
  appointmentRow,
  conversationRow,
  defaultState,
  fakeAccessToken,
  ids,
  mockBackend,
  TEST_EMAIL,
  TEST_NAME,
  type MockBackend,
  type MockState,
} from "./support/mock-backend";

// Signed-in flows against a fully mocked backend (see tests/support/mock-backend.ts). No request
// in this file reaches a real Supabase project.

const test = base.extend<{
  backend: (
    state?: Partial<MockState>,
    options?: { signedIn?: boolean; expiredSession?: boolean },
  ) => Promise<MockBackend>;
  consoleErrors: string[];
}>({
  consoleErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        // Failed requests the test provokes on purpose are logged by the browser itself.
        if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
          errors.push(m.text());
        }
      });
      await provide(errors);
      // No React warnings, unhandled rejections or app errors in any signed-in flow.
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
  backend: async ({ page }, provide) => {
    let installed: MockBackend | undefined;
    await provide(async (state = {}, options = {}) => {
      installed = await mockBackend(page, {
        state,
        signedIn: options.signedIn ?? true,
        expiredSession: options.expiredSession ?? false,
      });
      return installed;
    });
    // Every request must have been understood by the mock.
    expect(installed?.unhandled ?? []).toEqual([]);
  },
});

test.describe("Patient account", () => {
  test("header and profile show the signed-in patient", async ({ page, backend }) => {
    await backend();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: TEST_NAME })).toBeVisible();
    await expect(page.getByText(TEST_EMAIL).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
    // Not a clinic member: no portal link.
    await expect(page.getByRole("link", { name: "Clinic portal" })).toHaveCount(0);
  });

  test("patients can edit their own details; empty values are not invented", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto("/profile");
    await expect(page.getByText("Not provided").first()).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Gender")).toHaveValue("");
    await page.getByLabel("Full name").fill("Test Patient Updated");
    await page.getByLabel("Date of birth").fill("1990-04-12");
    await page.getByLabel("Area").fill("Velachery");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Your details have been saved.")).toBeVisible();
    await expect(page.getByText("12 April 1990")).toBeVisible();
    const patch = mock.callsTo("PATCH", "/rest/v1/patients").at(-1);
    expect(patch?.body).toEqual({
      full_name: "Test Patient Updated",
      date_of_birth: "1990-04-12",
      gender: null,
      area: "Velachery",
      preferred_language: null,
    });
    expect(patch?.search).toContain(`id=eq.${ids.patient}`);
    expect(mock.callsTo("PATCH", "/rest/v1/users")).toEqual([]);
  });

  test("missing patient profile is explained, not faked", async ({ page, backend }) => {
    const mock = await backend({ patients: [] });
    await page.goto("/profile");
    await expect(page.getByText("Patient profile not found")).toBeVisible();
    await page.goto(`/book/${ids.doctorVerified}`);
    await expect(page.getByText("Patient profile not found")).toBeVisible();
    // The browser never tries to create a profile row itself.
    expect(mock.callsTo("POST", "/rest/v1/patients")).toEqual([]);
  });

  test("profile load failure is an error, not a missing profile", async ({ page, backend }) => {
    await backend({ patients: "error" });
    await page.goto("/profile");
    await expect(page.getByText("We couldn't load your profile")).toBeVisible();
    await expect(page.getByText("Patient profile not found")).toHaveCount(0);
  });

  test("sign out clears private data and protects routes again", async ({ page, backend }) => {
    const mock = await backend({ appointments: [appointmentRow()] });
    await page.goto("/appointments");
    await expect(page.getByText("Dr. Verified Tester").first()).toBeVisible();
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(mock.callsTo("POST", "/auth/v1/logout").length).toBe(1);
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-"))),
    ).toEqual([]);
    await page.goto("/appointments");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fappointments$/);
    await expect(page.getByText("Dr. Verified Tester")).toHaveCount(0);
  });
});

test.describe("Discover request efficiency", () => {
  test("an unfiltered visit loads doctors and clinics once each", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/discover");
    await expect(page.getByText("Dr. Verified Tester")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(mock.callsTo("GET", "/rest/v1/doctors")).toHaveLength(1);
    expect(mock.callsTo("GET", "/rest/v1/clinics")).toHaveLength(1);

    // Sorting alone re-orders the same rows without another request.
    await page.getByLabel("Sort by").selectOption("fee_desc");
    await page.waitForLoadState("networkidle");
    expect(mock.callsTo("GET", "/rest/v1/doctors")).toHaveLength(1);
  });

  test("a search is one doctors request and one clinics request, with no waterfall", async ({
    page,
    backend,
  }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/discover");
    await expect(page.getByText("Dr. Verified Tester")).toBeVisible();
    await page.fill("#discover-search", "adyar");
    await expect.poll(() => mock.callsTo("GET", "/rest/v1/doctors").length).toBe(2);
    await page.waitForLoadState("networkidle");
    expect(mock.callsTo("GET", "/rest/v1/clinics")).toHaveLength(2);
    expect(mock.callsTo("GET", "/rest/v1/clinic_doctors")).toEqual([]);
    // Clinic matches still resolve to doctors: Test Clinic A is in Adyar.
    const search = mock.callsTo("GET", "/rest/v1/doctors").at(-1)?.search ?? "";
    expect(decodeURIComponent(search)).toContain(`id.in.(${ids.doctorVerified})`);
  });

  test("a direct search link never shows unfiltered results first", async ({ page, backend }) => {
    const seen = new Set<string>();
    await backend(
      { doctorSearch: [defaultState().doctors[0]!], doctorSearchDelayMs: 1200 },
      { signedIn: false },
    );
    await page.exposeFunction("recordDoctor", (name: string) => seen.add(name));
    await page.addInitScript(() => {
      new MutationObserver(() => {
        for (const h of document.querySelectorAll('[role="tabpanel"] article h3')) {
          (window as unknown as { recordDoctor: (n: string) => void }).recordDoctor(
            h.textContent ?? "",
          );
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/discover?q=verified");
    await expect(page.getByText("1 doctor matches your search.")).toBeVisible();
    expect([...seen]).toEqual(["Dr. Verified Tester"]);
  });
});

test.describe("Discover search input", () => {
  test("user text never becomes PostgREST filter syntax", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/discover");
    await expect(page.locator('[role="tabpanel"] article').first()).toBeVisible();
    const hostile = String.raw`adyar),id.neq.0,(name.ilike."*" ; drop:table\ %_* 'rao' <script>`;
    await page.fill("#discover-search", hostile);
    await expect
      .poll(() => mock.callsTo("GET", "/rest/v1/doctors").some((c) => c.search.includes("or=")))
      .toBe(true);

    const filters = mock
      .callsTo("GET", "/rest/v1/")
      .flatMap((c) => new URLSearchParams(c.search).getAll("or"));
    expect(filters.length).toBeGreaterThan(0);

    // Each OR group must consist only of conditions the app itself builds:
    //   <column>.ilike."[% ]<word>%"   (user word: letters, marks and digits only)
    //   languages|specialty_ids.cs.{<Word>}   specialty_id.in.(<ids>)   id.in.(<uuids>)
    const condition = new RegExp(
      String.raw`^(?:(?:name|area|address)\.ilike\."%? ?[\p{L}\p{M}\p{N}]+%"` +
        String.raw`|(?:languages|specialty_ids)\.cs\.\{[\p{L}\p{M}\p{N}]+\}` +
        String.raw`|specialty_id\.in\.\([a-z,]+\)` +
        String.raw`|id\.in\.\([0-9a-f,-]+\))$`,
      "u",
    );
    for (const group of filters) {
      expect(group.startsWith("(") && group.endsWith(")")).toBe(true);
      const parts = group.slice(1, -1).match(/(?:[^,"(]+|"[^"]*"|\([^)]*\))+/g) ?? [];
      for (const part of parts) expect(part).toMatch(condition);
    }
  });
});

test.describe("Saved doctors", () => {
  test("bookmark calls the toggle RPC once per click", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/discover");
    await page.getByRole("button", { name: "Save Dr. Verified Tester" }).click();
    await expect
      .poll(() => mock.callsTo("POST", "/rest/v1/rpc/toggle_saved_doctor").length)
      .toBe(1);
    expect(mock.callsTo("POST", "/rest/v1/rpc/toggle_saved_doctor")[0]?.body).toEqual({
      p_doctor_id: ids.doctorVerified,
    });
  });
});

test.describe("Sign-in redirects", () => {
  test("returns to the original page after signing in", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/appointments?tab=past");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/appointments\?tab=past$/);
  });

  for (const target of ["/\\evil.com", "//evil.com", "https://evil.com", "javascript:alert(1)"]) {
    test(`ignores unsafe redirect ${target}`, async ({ page, backend }) => {
      await backend({}, { signedIn: false });
      await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
      await page.getByLabel("Email").fill(TEST_EMAIL);
      await page.getByLabel("Password").fill("test-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/localhost:\d+\/$/);
    });
  }
});

test.describe("Auth edge cases", () => {
  test("empty or malformed input never reaches the auth server", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("whatever-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForTimeout(300);
    expect(mock.callsTo("POST", "/auth/v1/token")).toEqual([]);
  });

  test("sign-in rate limiting is explained", async ({ page, backend }) => {
    await backend(
      {
        tokenResponse: {
          status: 429,
          body: {
            code: 429,
            error_code: "over_request_rate_limit",
            msg: "Request rate limit reached",
          },
        },
      },
      { signedIn: false },
    );
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Too many attempts");
  });

  test("a weak password rejected by the server shows its rule", async ({ page, backend }) => {
    await backend(
      {
        signupResponse: {
          status: 422,
          body: {
            code: 422,
            error_code: "weak_password",
            msg: "Password is known to be weak and easy to guess, please choose a different one.",
            weak_password: { reasons: ["pwned"] },
          },
        },
      },
      { signedIn: false },
    );
    await page.goto("/login?signup=true");
    await page.getByLabel("Full name").fill(TEST_NAME);
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert")).toContainText("weak and easy to guess");
  });

  test("the email confirmation link signs the new patient in", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    const hash = new URLSearchParams({
      access_token: fakeAccessToken(),
      refresh_token: "test-refresh-token",
      expires_in: "3600",
      expires_at: String(Math.floor(Date.now() / 1000) + 3600),
      token_type: "bearer",
      type: "signup",
    });
    await page.goto(`/login#${hash}`);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  });

  test("an expired session that can't be refreshed signs the user out", async ({
    page,
    backend,
  }) => {
    await backend(
      {
        tokenResponse: {
          status: 400,
          body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" },
        },
      },
      { expiredSession: true },
    );
    await page.goto("/appointments");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fappointments$/);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });
});

test.describe("Password reset", () => {
  test("requests a reset link without revealing whether the account exists", async ({
    page,
    backend,
  }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(`If an account exists for ${TEST_EMAIL}`)).toBeVisible();
    const call = mock.callsTo("POST", "/auth/v1/recover").at(-1);
    expect(call?.body).toMatchObject({ email: TEST_EMAIL });
    expect(decodeURIComponent(call?.search ?? "")).toContain("/reset-password");
  });

  test("a recovery link allows choosing a new password", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    const hash = new URLSearchParams({
      access_token: fakeAccessToken(),
      refresh_token: "test-refresh-token",
      expires_in: "3600",
      expires_at: String(Math.floor(Date.now() / 1000) + 3600),
      token_type: "bearer",
      type: "recovery",
    });
    await page.goto(`/reset-password#${hash}`);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill("a-new-password-1");
    await page.getByLabel("Confirm new password").fill("a-different-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("alert")).toContainText("don't match");
    expect(mock.callsTo("PUT", "/auth/v1/user")).toEqual([]);

    await page.getByLabel("Confirm new password").fill("a-new-password-1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Your password has been updated.")).toBeVisible();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    expect(mock.callsTo("PUT", "/auth/v1/user").at(-1)?.body).toMatchObject({
      password: "a-new-password-1",
    });
  });

  test("an ordinary session cannot change the password here", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Reset link needed" })).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    expect(mock.callsTo("PUT", "/auth/v1/user")).toEqual([]);
  });

  test("an expired link says so", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto(
      "/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });
});

test.describe("Appointments", () => {
  test("empty list is distinct from a failed load, and retry works", async ({ page, backend }) => {
    const mock = await backend({ appointments: "error" });
    await page.goto("/appointments");
    await expect(page.getByText("We couldn't load your appointments")).toBeVisible();
    await expect(page.getByText("No upcoming appointments")).toHaveCount(0);
    mock.state.appointments = [];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("No upcoming appointments")).toBeVisible();
  });

  test("past requests can't be cancelled and say they weren't confirmed", async ({
    page,
    backend,
  }) => {
    await backend({ appointments: [appointmentRow({ date: "2020-01-06", status: "pending" })] });
    await page.goto(`/appointments/${ids.appointment}`);
    await expect(page.getByText("didn't confirm this request before its date")).toBeVisible();
    await expect(page.getByText("6 January 2020")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0);
  });

  test("cancelling waits for the backend and reports failures", async ({ page, backend }) => {
    const mock = await backend({ appointments: [appointmentRow()], failStatusUpdate: true });
    await page.goto("/appointments");
    await page.getByRole("button", { name: "Cancel appointment" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel appointment" }).click();
    await expect(page.getByText("This appointment can no longer be cancelled.")).toBeVisible();
    await expect(page.getByText("Appointment cancelled")).toHaveCount(0);

    mock.state.failStatusUpdate = false;
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel appointment" }).click();
    await expect(page.getByText("Appointment cancelled")).toBeVisible();
    const patch = mock.callsTo("PATCH", "/rest/v1/appointments").at(-1);
    expect(patch?.body).toEqual({ status: "cancelled" });
  });
});

test.describe("Booking", () => {
  test("books through the RPC exactly once and shows the pending request", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto(`/book/${ids.doctorVerified}`);
    await expect(page.getByRole("button", { name: "9:00 AM, unavailable" })).toBeDisabled();
    await page.getByRole("button", { name: "6:30 PM" }).click();
    await page.getByLabel("Reason for visit (optional)").fill("Follow-up");
    await page.getByRole("button", { name: "Request appointment" }).dblclick();
    await expect(page).toHaveURL(new RegExp(`/appointments/${ids.appointment}$`));
    await expect(page.getByText("Awaiting confirmation").first()).toBeVisible();

    const calls = mock.callsTo("POST", "/rest/v1/rpc/book_appointment");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      p_doctor_id: ids.doctorVerified,
      p_clinic_id: ids.clinicA,
      p_time: "18:30:00",
      p_reason: "Follow-up",
    });
    // The browser never inserts appointment rows directly.
    expect(mock.callsTo("POST", "/rest/v1/appointments")).toEqual([]);
  });

  test("a taken slot shows the RPC's reason and asks for another time", async ({
    page,
    backend,
  }) => {
    await backend({
      bookResult: {
        status: 400,
        body: {
          code: "P0001",
          message: "Validation Failed: That time slot is no longer available.",
        },
      },
    });
    await page.goto(`/book/${ids.doctorVerified}`);
    await page.getByRole("button", { name: "9:30 AM" }).click();
    await page.getByRole("button", { name: "Request appointment" }).click();
    await expect(page.getByRole("alert")).toContainText("no longer available");
    await expect(page).toHaveURL(new RegExp(`/book/${ids.doctorVerified}`));
    await expect(page.getByRole("button", { name: "Request appointment" })).toBeDisabled();
  });

  test("unverified doctor-clinic links offer no online booking", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto(`/doctors/${ids.doctorPending}`);
    await expect(page.getByText("Online booking isn't available")).toBeVisible();
    await expect(page.getByRole("link", { name: "Book appointment" })).toHaveCount(0);
    await page.goto(`/book/${ids.doctorPending}`);
    await expect(page.getByText("isn't accepting online bookings")).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/rpc/get_doctor_slots")).toEqual([]);
  });
});

test.describe("Messages", () => {
  test("the inbox never claims to be empty while it is still loading", async ({
    page,
    backend,
  }) => {
    const seen: string[] = [];
    await backend({
      conversations: [conversationRow([{ from: "clinic", body: "Hello from the clinic" }])],
      delays: { clinic_memberships: 1200, conversations: 400 },
    });
    await page.exposeFunction("recordText", (text: string) => seen.push(text));
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.body?.innerText.includes("No conversations yet")) {
          (window as unknown as { recordText: (t: string) => void }).recordText("empty");
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/messages");
    await expect(page.getByText("Hello from the clinic")).toBeVisible();
    expect(seen).toEqual([]);
  });

  test("empty inbox is distinct from a failed load", async ({ page, backend }) => {
    const mock = await backend({ conversations: "error" });
    await page.goto("/messages");
    await expect(page.getByText("We couldn't load your messages")).toBeVisible();
    mock.state.conversations = [];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("No conversations yet")).toBeVisible();
  });

  test("sends real messages and keeps the draft when sending fails", async ({ page, backend }) => {
    const mock = await backend({
      conversations: [conversationRow([{ from: "clinic", body: "Hello from the clinic" }])],
      failMessageInsert: true,
    });
    await page.goto(`/messages?c=${ids.conversation}`);
    await expect(page.getByText("Clinic: Hello from the clinic")).toBeVisible();

    const input = page.getByLabel("Message", { exact: true });
    await input.fill("Is parking available?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/Message not sent/)).toBeVisible();
    await expect(input).toHaveValue("Is parking available?");

    mock.state.failMessageInsert = false;
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(input).toHaveValue("");
    const insert = mock.callsTo("POST", "/rest/v1/messages").at(-1);
    expect(insert?.body).toMatchObject({
      conversation_id: ids.conversation,
      sender_id: ids.user,
      body: "Is parking available?",
    });
  });

  test("message clinic from a doctor profile opens a real conversation", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto(`/doctors/${ids.doctorVerified}`);
    await page.getByRole("button", { name: "Message clinic" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/messages\\?c=${ids.conversation}$`));
    const insert = mock.callsTo("POST", "/rest/v1/conversations").at(-1);
    expect(insert?.body).toMatchObject({
      clinic_id: ids.clinicA,
      patient_id: ids.patient,
      kind: "general",
    });
  });
});

const PROTECTED_ROUTES = [
  "/appointments",
  "/appointments?tab=past",
  `/appointments/${ids.appointment}`,
  "/messages",
  `/messages?c=${ids.conversation}`,
  "/profile",
  `/book/${ids.doctorVerified}`,
  `/book/${ids.doctorVerified}?date=2099-01-01&time=10:00`,
  "/clinic",
  "/clinic/appointments",
  "/clinic/calendar",
  "/clinic/patients",
  "/clinic/doctors",
  "/clinic/messages",
  "/clinic/profile",
];

test.describe("Route protection (regression for the redirect loop)", () => {
  for (const path of PROTECTED_ROUTES) {
    test(`signed out: ${path} redirects to login exactly once`, async ({ page, backend }) => {
      await backend({}, { signedIn: false });
      const navigations: string[] = [];
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
      await page.waitForTimeout(1500);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      expect(decodeURIComponent(url.searchParams.get("redirect") ?? "")).toBe(path);
      expect(navigations.filter((u) => u.includes("/login")).length).toBeLessThanOrEqual(1);
    });
  }

  for (const path of PROTECTED_ROUTES.filter((p) => p.startsWith("/clinic"))) {
    test(`signed-in non-member: ${path} shows 'No clinic access' and stays put`, async ({
      page,
      backend,
    }) => {
      await backend({ memberships: [] });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "No clinic access" })).toBeVisible();
      await page.waitForTimeout(1000);
      expect(new URL(page.url()).pathname).toBe(path.split("?")[0]);
    });
  }
});

test.describe("Clinic portal", () => {
  const membership = { clinic_id: ids.clinicA, clinics: {} as Record<string, unknown> };

  test("a patient without membership gets 'No clinic access'", async ({ page, backend }) => {
    await backend({ memberships: [] });
    await page.goto("/clinic");
    await expect(page.getByRole("heading", { name: "No clinic access" })).toBeVisible();
    await page.goto("/clinic/messages");
    await expect(page.getByRole("heading", { name: "No clinic access" })).toBeVisible();
  });

  test("a failed membership lookup is not reported as 'No clinic access'", async ({
    page,
    backend,
  }) => {
    const mock = await backend({ memberships: "error" });
    await page.goto("/clinic");
    await expect(page.getByText("We couldn't check your clinic access")).toBeVisible();
    await expect(page.getByText("No clinic access")).toHaveCount(0);
    mock.state.memberships = [{ ...membership, clinics: mock.state.clinics[0] }];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("members can confirm requests; success is shown only after the save", async ({
    page,
    backend,
  }) => {
    const mock = await backend({ appointments: [appointmentRow()] });
    mock.state.memberships = [{ ...membership, clinics: mock.state.clinics[0] }];
    await page.goto("/clinic");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    mock.state.failStatusUpdate = true;
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("already changed")).toBeVisible();
    await expect(page.getByText("Appointment confirmed")).toHaveCount(0);

    mock.state.failStatusUpdate = false;
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Appointment confirmed")).toBeVisible();
    expect(mock.callsTo("PATCH", "/rest/v1/appointments").at(-1)?.body).toEqual({
      status: "confirmed",
    });
  });

  test("calendar shows evening appointments", async ({ page, backend }) => {
    const mock = await backend({
      appointments: [appointmentRow({ date: todayInIndia(), status: "confirmed" })],
    });
    mock.state.memberships = [{ ...membership, clinics: mock.state.clinics[0] }];
    await page.goto("/clinic/calendar");
    await expect(page.getByText("7:30 PM")).toBeVisible();
    await expect(page.getByText(TEST_NAME)).toBeVisible();
  });
});

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
