import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { appointmentRow, conversationRow, ids, type MockBackend } from "./support/mock-backend";

// Patient app, clinic portal and doctor portal share one Supabase Auth account system;
// authorization comes only from what the database returns (clinic_memberships, the doctor
// profile linked by CareConnect, user_roles). These tests drive the UI against the mocked backend;
// the database rules themselves are covered by supabase/tests/011 and 012.

const membershipA = (mock: MockBackend) => ({
  id: "mem-a",
  clinic_id: ids.clinicA,
  role: "clinic_staff",
  active: true,
  clinics: mock.state.clinics[0],
});

/** Links the signed-in test account to a doctor profile, as a platform admin's approval would. */
function makeDoctor(mock: MockBackend, which: "verified" | "pending") {
  const row = mock.state.doctors[which === "verified" ? 0 : 1]!;
  row["user_id"] = ids.user;
  return row;
}

async function signIn(page: Page) {
  await page.getByLabel("Email").fill("patient@test.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
}

test.describe("Entry points", () => {
  test("patient sign-in stays primary, with clinic and doctor entrances below", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to CareConnect");
    const providers = page.getByRole("region", { name: "Are you a healthcare provider?" });
    await expect(providers.getByRole("link", { name: "Clinic Sign In" })).toHaveAttribute(
      "href",
      "/clinic/login",
    );
    await expect(providers.getByRole("link", { name: "Doctor Sign In" })).toHaveAttribute(
      "href",
      "/doctor/login",
    );

    await page.goto("/login?signup=true");
    const join = page.getByRole("region", {
      name: "Joining CareConnect as a healthcare provider?",
    });
    await expect(join.getByRole("link", { name: "Register a Clinic" })).toHaveAttribute(
      "href",
      "/clinic/signup",
    );
    await expect(join.getByRole("link", { name: "Register as a Doctor" })).toHaveAttribute(
      "href",
      "/doctor/signup",
    );
  });

  test("old clinic-portal links open the clinic sign-in", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/login?portal=clinic");
    await expect(page).toHaveURL(/\/clinic\/login$/);
    await expect(page.getByRole("heading", { name: "Clinic Portal", level: 1 })).toBeVisible();
  });

  test("the patient navbar has no provider portal links", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(
      header.getByRole("link", { name: /clinic|doctor portal|for clinics/i }),
    ).toHaveCount(0);
  });
});

test.describe("Patient", () => {
  test("a patient can sign in to the patient app", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/login");
    await signIn(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("a patient cannot open the clinic portal", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/clinic");
    await expect(
      page.getByRole("heading", { name: "Clinic access isn't enabled for this account" }),
    ).toBeVisible();
    // No clinic-scoped data is requested for an account without membership.
    expect(
      mock.callsTo("GET", "/rest/v1/appointments").filter((c) => c.search.includes("clinic_id")),
    ).toEqual([]);
  });

  test("a patient cannot open the doctor portal", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/doctor/appointments");
    await expect(
      page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
    ).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_appointments")).toEqual([]);
  });
});

test.describe("Clinic portal", () => {
  test("signed-out visitors are sent to the clinic sign-in", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/clinic/appointments");
    await expect(page).toHaveURL(/\/clinic\/login\?redirect=%2Fclinic%2Fappointments$/);
  });

  test("signing in without a membership shows access isn't enabled, and no clinic data", async ({
    page,
    backend,
  }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/clinic/login");
    await signIn(page);
    await page.getByRole("button", { name: "Sign in to Clinic Portal" }).click();
    await expect(page.getByText("Clinic access isn't enabled for this account")).toBeVisible();
    await expect(page).toHaveURL(/\/clinic\/login$/);
    expect(mock.callsTo("GET", "/rest/v1/appointments")).toEqual([]);
    expect(mock.callsTo("GET", "/rest/v1/conversations")).toEqual([]);
  });

  test("a clinic member signs in and lands in the portal", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    mock.state.memberships = [membershipA(mock)];
    await page.goto("/clinic/login?redirect=%2Fclinic%2Fdoctors");
    await signIn(page);
    await page.getByRole("button", { name: "Sign in to Clinic Portal" }).click();
    await expect(page).toHaveURL(/\/clinic\/doctors$/);
    await expect(page.getByRole("heading", { name: "Doctors", level: 1 })).toBeVisible();
  });

  test("a member of clinic A never sees clinic B's appointments", async ({ page, backend }) => {
    const mock = await backend({
      appointments: [
        appointmentRow({ id: "appt-a", patients: { full_name: "Patient At A" } }),
        appointmentRow({
          id: "appt-b",
          clinic_id: ids.clinicB,
          doctor_id: ids.doctorPending,
          patients: { full_name: "Patient At B" },
        }),
      ],
    });
    mock.state.memberships = [membershipA(mock)];
    // A stored choice of clinic B (not a membership) must not widen anything.
    await page.addInitScript((clinicId) => {
      sessionStorage.setItem("careconnect.activeClinic", clinicId);
    }, ids.clinicB);
    await page.goto("/clinic/appointments");
    await expect(page.getByRole("cell", { name: "Patient At A" })).toBeVisible();
    await expect(page.getByText("Patient At B")).toHaveCount(0);
    const requests = mock
      .callsTo("GET", "/rest/v1/appointments")
      .map((c) => decodeURIComponent(c.search));
    expect(requests.some((s) => s.includes(`clinic_id=in.(${ids.clinicA})`))).toBe(true);
    expect(requests.some((s) => s.includes(ids.clinicB))).toBe(false);
  });

  test("clinic sign-in errors, password visibility and password reset", async ({
    page,
    backend,
  }) => {
    const mock = await backend(
      {
        tokenResponse: {
          status: 400,
          body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" },
        },
      },
      { signedIn: false },
    );
    await page.goto("/clinic/login");
    await signIn(page);
    const field = page.getByLabel("Password", { exact: true });
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue("test-password");
    await page.getByRole("button", { name: "Sign in to Clinic Portal" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/clinic\/login$/);

    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("patient@test.invalid")).toBeVisible();
    const recover = mock.callsTo("POST", "/auth/v1/recover")[0];
    expect(decodeURIComponent(recover?.search ?? "")).toContain("/reset-password");
  });

  test("an expired session that can't be refreshed returns to the clinic sign-in", async ({
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
    await page.goto("/clinic");
    await expect(page).toHaveURL(/\/clinic\/login\?redirect=%2Fclinic$/);
  });
});

test.describe("Doctor portal", () => {
  test("signed-out visitors are sent to the doctor sign-in", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/doctor/schedule");
    await expect(page).toHaveURL(/\/doctor\/login\?redirect=%2Fdoctor%2Fschedule$/);
  });

  test("signing in with an account not linked to a doctor shows access isn't enabled", async ({
    page,
    backend,
  }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/doctor/login");
    await signIn(page);
    await page.getByRole("button", { name: "Sign in to Doctor Portal" }).click();
    await expect(page.getByText("Doctor access isn't enabled for this account")).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_appointments")).toEqual([]);
    expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_conversations")).toEqual([]);
  });

  test("a linked doctor signs in and sees only their own appointments", async ({
    page,
    backend,
  }) => {
    const mock = await backend(
      {
        doctorAppointments: [
          {
            id: "dappt-1",
            clinic_id: ids.clinicA,
            clinic_name: "Test Clinic A",
            date: "2099-01-05",
            time: "10:00:00",
            status: "confirmed",
            reason: "Follow-up",
            patient_name: "Patient For Me",
          },
        ],
      },
      { signedIn: false },
    );
    makeDoctor(mock, "verified");
    await page.goto("/doctor/login");
    await signIn(page);
    await page.getByRole("button", { name: "Sign in to Doctor Portal" }).click();
    await expect(page).toHaveURL(/\/doctor$/);
    await expect(page.getByText("Patient For Me")).toBeVisible();
    await page.getByRole("link", { name: "Appointments" }).first().click();
    await expect(page.getByText("Follow-up")).toBeVisible();
    // The browser never names a doctor: the database scopes the list to auth.uid().
    for (const call of mock.callsTo("POST", "/rest/v1/rpc/doctor_appointments")) {
      expect(call.body ?? {}).toEqual({});
    }
    expect(mock.callsTo("GET", "/rest/v1/appointments")).toEqual([]);
    expect(
      mock.callsTo("GET", "/rest/v1/patients").every((c) => !c.search.includes(ids.doctorVerified)),
    ).toBe(true);
  });

  test("another doctor's profile can't be opened from this account", async ({ page, backend }) => {
    const mock = await backend();
    mock.state.doctors[0]!["user_id"] = "00000000-0000-4000-8000-0000000000ee";
    await page.goto("/doctor/profile");
    await expect(
      page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
    ).toBeVisible();
    await expect(page.getByText("Dr. Verified Tester")).toHaveCount(0);
  });

  test("a pending doctor gets no scheduling or messaging", async ({ page, backend }) => {
    const mock = await backend();
    makeDoctor(mock, "pending");
    await page.goto("/doctor");
    await expect(page.getByText("isn't verified at any clinic yet")).toBeVisible();
    await page.goto("/doctor/schedule");
    await expect(page.getByText("can be set once CareConnect verifies you")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
  });

  test("a verified doctor sets hours and replies to a patient", async ({ page, backend }) => {
    const mock = await backend({
      doctorConversations: [
        {
          id: "dconv-1",
          clinic_id: ids.clinicA,
          clinic_name: "Test Clinic A",
          patient_name: "Patient For Me",
          created_at: "2026-10-01T00:00:00Z",
          messages: [
            {
              id: "m1",
              body: "Is the clinic open Sunday?",
              created_at: "2026-10-01T04:00:00Z",
              from: "patient",
            },
          ],
        },
      ],
    });
    makeDoctor(mock, "verified");
    await page.goto("/doctor/schedule");
    await page.getByLabel("Day").selectOption("3");
    await page.getByLabel("Opens").fill("10:00");
    await page.getByLabel("Closes").fill("13:00");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByText("Hours saved for Wednesday")).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/doctor_schedules")[0]?.body).toMatchObject({
      doctor_id: ids.doctorVerified,
      clinic_id: ids.clinicA,
      day_of_week: 3,
    });

    await page.goto("/doctor/messages?c=dconv-1");
    const thread = page.getByRole("region", { name: "Patient For Me" });
    await expect(thread.getByText("Is the clinic open Sunday?")).toBeVisible();
    await page.getByLabel("Write a reply").fill("Yes, from 10 to 1.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(thread.getByText("Yes, from 10 to 1.")).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/messages")[0]?.body).toMatchObject({
      conversation_id: "dconv-1",
      sender_id: ids.user,
    });
  });

  test("a doctor can't edit their name or registration, only practice details", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    makeDoctor(mock, "verified");
    await page.goto("/doctor/profile");
    await expect(page.getByRole("heading", { name: "Managed by CareConnect" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /full name/i })).toHaveCount(0);
    await page.getByLabel("About the doctor").fill("Family physician in Adyar.");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Your details have been saved")).toBeVisible();
    const sent = mock.callsTo("PATCH", "/rest/v1/doctors")[0]?.body as Record<string, unknown>;
    expect(sent).toMatchObject({ about: "Family physician in Adyar." });
    expect(Object.keys(sent)).not.toContain("name");
    expect(Object.keys(sent)).not.toContain("registration_note");
    expect(Object.keys(sent)).not.toContain("user_id");
  });

  test("signing out of the doctor portal returns to the doctor sign-in", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    makeDoctor(mock, "verified");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/doctor");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/doctor\/login/);
    expect(mock.callsTo("POST", "/auth/v1/logout").length).toBeGreaterThan(0);
  });
});

test.describe("Provider registration", () => {
  test("clinic registration without a session waits for email confirmation, never trusting anything", async ({
    page,
    backend,
  }) => {
    const mock = await backend(
      {
        signupResponse: {
          status: 200,
          body: { id: "new-user", email: "owner@test.invalid", identities: [{ id: "i1" }] },
        },
      },
      { signedIn: false },
    );
    await page.goto("/clinic/signup");
    await expect(page.getByText("will require verification")).toBeVisible();
    await page.getByLabel(/^Full name/).fill("Clinic Owner");
    await page.getByLabel(/^Email/).fill("owner@test.invalid");
    await page.getByLabel(/^Password/).fill("a-strong-pass-1");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel(/^Password/)).toHaveAttribute("type", "text");
    await page.getByLabel(/^Clinic name/).fill("New Clinic");
    await page.getByLabel(/^Area/).fill("Adyar");
    await page.getByLabel(/^Full address/).fill("1 Main Road, Adyar");
    await page.getByLabel(/^Registration details/).fill("TN CE reg 2026/9");
    await page.getByLabel(/^Phone/).fill("9840000000");
    await page.getByRole("button", { name: "Create account and submit" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
    expect(mock.callsTo("POST", "/rest/v1/clinic_memberships")).toEqual([]);
    const draft = await page.evaluate(() =>
      localStorage.getItem("careconnect.clinicApplicationDraft"),
    );
    expect(draft).toContain("New Clinic");
    expect(draft).not.toContain("a-strong-pass-1");
  });

  test("a doctor application stays pending and grants no doctor access", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto("/doctor/signup");
    await page.getByLabel(/^Doctor's full name/).fill("Dr. New Applicant");
    await page.getByLabel(/^Years of experience/).fill("7");
    await page.getByLabel(/^Qualifications/).fill("MBBS, MD");
    await page.getByLabel(/^Medical council/).fill("Tamil Nadu Medical Council");
    await page.getByLabel(/^Registration number/).fill("123456");
    await page.getByLabel(/^Phone/).fill("9840000000");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Application received")).toBeVisible();
    const sent = mock.callsTo("POST", "/rest/v1/doctor_applications")[0]?.body as Record<
      string,
      unknown
    >;
    for (const forbidden of ["status", "applicant_id", "doctor_id"]) {
      expect(Object.keys(sent)).not.toContain(forbidden);
    }
    // Pending application: still no doctor portal.
    await page.goto("/doctor");
    await expect(
      page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
    ).toBeVisible();
  });
});

test.describe("Client-side state never grants access", () => {
  test("spoofed role flags in storage open no portal", async ({ page, backend }) => {
    await backend();
    await page.addInitScript(() => {
      for (const store of [localStorage, sessionStorage]) {
        store.setItem("role", "platform_admin");
        store.setItem("isAdmin", "true");
        store.setItem("doctorId", "00000000-0000-4000-8000-0000000000d1");
        store.setItem("careconnect.activeClinic", "00000000-0000-4000-8000-0000000000a1");
      }
      document.cookie = "role=clinic_admin; path=/";
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
    await page.goto("/clinic");
    await expect(
      page.getByRole("heading", { name: "Clinic access isn't enabled for this account" }),
    ).toBeVisible();
    await page.goto("/doctor");
    await expect(
      page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
    ).toBeVisible();
  });
});

test.describe("Portal status is truthful", () => {
  test("the clinic profile states real facts and never claims verification", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    mock.state.memberships = [membershipA(mock)];
    await page.goto("/clinic/profile");
    const status = page.getByRole("region", { name: "Status" });
    await expect(status.getByText("Clinic staff")).toBeVisible();
    // The test clinic is sample data, so it says so instead of posing as a real provider.
    await expect(status.getByText("Sample listing, not shown as a real provider")).toBeVisible();
    // Dr. Verified Tester has a verified, active link here, so booking really is open.
    await expect(status.getByText("Available", { exact: true })).toBeVisible();
    await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
    // Opening hours are empty in the fixture: counted as missing, not invented.
    const completeness = page.getByRole("region", { name: "Profile completeness" });
    await expect(completeness.getByText("7 of 8 details provided")).toBeVisible();
    await expect(completeness.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "7");
  });

  test("online booking reads as unavailable when no doctor link is verified and active", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    mock.state.memberships = [membershipA(mock)];
    const link = (mock.state.doctors[0]!["clinic_doctors"] as Record<string, unknown>[])[0]!;
    link["active"] = false;
    await page.goto("/clinic/profile");
    const status = page.getByRole("region", { name: "Status" });
    await expect(status.getByText("Not yet available")).toBeVisible();
    await expect(status.getByText(/Online booking opens once CareConnect verifies/)).toBeVisible();
  });

  test("a doctor sees each clinic link's real state, including inactive and rejected", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    const me = makeDoctor(mock, "verified");
    me["clinic_doctors"] = [
      { clinic_id: ids.clinicA, active: false, verification_state: "verified" },
      { clinic_id: ids.clinicB, active: true, verification_state: "rejected" },
    ];
    await page.goto("/doctor/profile");
    const links = page.getByRole("region", { name: "Clinic links" });
    const a = links.getByRole("listitem").filter({ hasText: "Test Clinic A" });
    await expect(a.getByText("Verified")).toBeVisible();
    await expect(a.getByText("Inactive")).toBeVisible();
    const b = links.getByRole("listitem").filter({ hasText: "Test Clinic B" });
    await expect(b.getByText("Not verified")).toBeVisible();
    await expect(page.getByText("Awaiting verification")).toHaveCount(0);

    await page.goto("/doctor/schedule");
    await expect(page.getByText("This clinic link is inactive")).toBeVisible();
    await expect(page.getByText("CareConnect didn't verify you at this clinic")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
  });

  test("inboxes mark conversations where the patient wrote last, from real messages only", async ({
    page,
    backend,
  }) => {
    const mock = await backend({
      conversations: [conversationRow([{ from: "patient", body: "Are you open today?" }])],
      doctorConversations: [
        {
          id: "dconv-1",
          clinic_id: ids.clinicA,
          clinic_name: "Test Clinic A",
          patient_name: "Patient For Me",
          created_at: "2026-10-01T00:00:00Z",
          messages: [
            { id: "m1", body: "Hello?", created_at: "2026-10-01T04:00:00Z", from: "patient" },
            { id: "m2", body: "Hi", created_at: "2026-10-01T05:00:00Z", from: "you" },
          ],
        },
      ],
    });
    mock.state.memberships = [membershipA(mock)];
    makeDoctor(mock, "verified");
    await page.goto("/clinic/messages");
    await expect(page.getByRole("button", { name: /Awaiting reply/ })).toBeVisible();
    // Once the clinic has replied, the marker is gone: nothing is invented.
    mock.state.conversations = [
      conversationRow([
        { from: "patient", body: "Are you open today?" },
        { from: "clinic", body: "Yes, until 8." },
      ]),
    ];
    await page.reload();
    await expect(page.getByText("Yes, until 8.").first()).toBeVisible();
    await expect(page.getByText("Awaiting reply")).toHaveCount(0);

    // The doctor already replied in their only conversation.
    await page.goto("/doctor/messages");
    await expect(page.getByText("Patient For Me").first()).toBeVisible();
    await expect(page.getByText("Awaiting reply")).toHaveCount(0);
  });

  test("clinic patients: an empty state, and cards instead of a table on phones", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    mock.state.memberships = [membershipA(mock)];
    await page.goto("/clinic/patients");
    await expect(page.getByText("No patients have booked appointments yet.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    mock.state.appointments = [appointmentRow({ patients: { full_name: "Card Patient" } })];
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload();
    const card = page.getByRole("listitem").filter({ hasText: "Card Patient" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Next appointment")).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByRole("cell", { name: "Card Patient" })).toBeVisible();
  });
});
