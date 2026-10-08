import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { fakeAccessToken, ids } from "./support/mock-backend";

// Password visibility, readable select menus, the patient / clinic sign-in entrances, provider
// applications, the platform-admin console and clinic doctor management. Everything runs against
// the mocked backend; authorisation itself lives in the database (migration 00054, pgTAP 011).

const adminMembership = (clinic: Record<string, unknown> | undefined) => ({
  id: "mem-1",
  clinic_id: ids.clinicA,
  role: "clinic_admin",
  active: true,
  clinics: clinic,
  user: { email: "admin@test.invalid" },
  clinic: { name: "Test Clinic A" },
});

test.describe("Password visibility", () => {
  test("sign in: reveals and hides without changing the value or submitting", async ({
    page,
    backend,
  }) => {
    const mock = await backend({}, { signedIn: false });
    await page.goto("/login");
    const field = page.getByLabel("Password", { exact: true });
    await field.fill("s3cret-Pass");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "current-password");

    const show = page.getByRole("button", { name: "Show password" });
    await expect(show).toHaveAttribute("aria-pressed", "false");
    await show.click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue("s3cret-Pass");

    // Keyboard operable: Enter and Space toggle it; it never submits the form.
    const hide = page.getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await hide.focus();
    await page.keyboard.press("Enter");
    await expect(field).toHaveAttribute("type", "password");
    await page.keyboard.press("Space");
    await expect(field).toHaveAttribute("type", "text");
    expect(mock.callsTo("POST", "/auth/v1/token")).toEqual([]);
    expect(page.url()).not.toContain("s3cret");
  });

  test("sign up: new-password field has the toggle, and switching mode hides it again", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page.goto("/login?signup=true");
    const field = page.getByLabel("Password", { exact: true });
    await expect(field).toHaveAttribute("autocomplete", "new-password");
    await field.fill("another-Pass-1");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  });

  test("reset password: both fields toggle independently", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    const hash = new URLSearchParams({
      access_token: fakeAccessToken(),
      refresh_token: "test-refresh-token",
      expires_in: "3600",
      expires_at: String(Math.floor(Date.now() / 1000) + 3600),
      token_type: "bearer",
      type: "recovery",
    });
    await page.goto(`/reset-password#${hash}`);
    const next = page.getByLabel("New password", { exact: true });
    const confirm = page.getByLabel("Confirm new password");
    await next.fill("a-new-password-1");
    await confirm.fill("a-new-password-1");
    const toggles = page.getByRole("button", { name: "Show password" });
    await expect(toggles).toHaveCount(2);
    await toggles.first().click();
    await expect(next).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "password");
    await expect(next).toHaveValue("a-new-password-1");
  });
});

/** WCAG contrast between two CSS colours as the browser resolves them (via a canvas). */
async function selectContrastProblems(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgb = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b!, a: a! };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(rgb(a)), lum(rgb(b))];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const problems: string[] = [];
    const selects = [...document.querySelectorAll("select")];
    for (const select of selects) {
      const s = getComputedStyle(select);
      if (rgb(s.backgroundColor).a < 255) problems.push(`#${select.id}: transparent background`);
      if (ratio(s.color, s.backgroundColor) < 4.5) problems.push(`#${select.id}: value contrast`);
      for (const option of [...select.options]) {
        const o = getComputedStyle(option);
        if (rgb(o.backgroundColor).a < 255) {
          problems.push(`#${select.id} "${option.text}": transparent option background`);
        }
        if (ratio(o.color, o.backgroundColor) < 4.5) {
          problems.push(`#${select.id} "${option.text}": option contrast`);
        }
      }
    }
    return {
      count: selects.length,
      problems,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme} theme: every select and its options are readable`, async ({ page, backend }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const mock = await backend();
    mock.state.memberships = [
      adminMembership(mock.state.clinics[0]),
      { ...adminMembership(mock.state.clinics[1]), id: "mem-2", clinic_id: ids.clinicB },
    ];

    let total = 0;
    const visit = async (path: string, prepare?: () => Promise<void>) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await prepare?.();
      const { count, problems, scheme: used } = await selectContrastProblems(page);
      expect(used, `${path} colour-scheme`).toContain(scheme);
      expect(problems, path).toEqual([]);
      total += count;
    };
    await visit("/profile", () => page.getByRole("button", { name: "Edit", exact: true }).click());
    await visit("/discover");
    await visit("/clinic/signup");
    await visit("/clinic/doctors", () =>
      page.getByRole("button", { name: "Edit hours" }).first().click(),
    );
    // gender + language, sort, contact role, clinic switcher, day + slot length.
    expect(total).toBeGreaterThanOrEqual(7);
  });
}

// Patient / clinic / doctor sign-in entrances are covered in tests/portals.spec.ts.

test.describe("Clinic applications", () => {
  test("for-clinics page explains verification and links to clinic registration", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page.goto("/providers");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bring your clinic");
    await expect(page.getByText("About the sample listings")).toBeVisible();
    await page.getByRole("link", { name: "Apply to list your clinic" }).first().click();
    await expect(page).toHaveURL(/\/clinic\/signup$/);
  });

  test("the old application address opens clinic registration", async ({ page, backend }) => {
    await backend();
    await page.goto("/providers/apply");
    await expect(page).toHaveURL(/\/clinic\/signup$/);
  });

  test("applying validates input and submits only content fields", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/clinic/signup");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByRole("alert")).toContainText("clinic name");
    expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);

    await page.getByLabel(/^Clinic name/).fill("Real Health Clinic");
    await page.getByLabel(/^Area/).fill("Adyar");
    await page.getByLabel(/^Full address/).fill("12 Main Road, Adyar, Chennai");
    await page.getByLabel(/^Registration details/).fill("TN CE Act reg. 2026/123");
    await page.getByLabel(/^Your name/).fill("A Applicant");
    await page.getByLabel(/^Phone/).fill("+91 98400 00000");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Application received")).toBeVisible();

    const sent = mock.callsTo("POST", "/rest/v1/provider_applications")[0]?.body as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty("status");
    expect(sent).not.toHaveProperty("applicant_id");
    // An empty official email defaults to the account's own address.
    expect(sent).toMatchObject({
      clinic_name: "Real Health Clinic",
      contact_role: "owner",
      contact_email: "patient@test.invalid",
    });
  });

  test("before the onboarding migration, applying is honestly unavailable", async ({
    page,
    backend,
  }) => {
    await backend({ applications: "notDeployed" });
    await page.goto("/clinic/signup");
    await expect(page.getByText("Applications aren't open online yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);
  });

  test("three open applications stop new ones", async ({ page, backend }) => {
    const open = (n: number) => ({
      id: `app-${n}`,
      clinic_name: `Clinic ${n}`,
      area: "OMR",
      address: "1 Road",
      contact_name: "A",
      contact_role: "owner",
      contact_phone: "9840000000",
      contact_email: "a@test.invalid",
      registration_details: "reg 12345",
      status: "submitted",
      created_at: "2026-10-01T00:00:00Z",
    });
    await backend({ applications: [open(1), open(2), open(3)] });
    await page.goto("/clinic/signup");
    await expect(page.getByText("You already have 3 applications under review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);
  });
});

test.describe("Platform administration", () => {
  test("is closed to accounts without the platform_admin role", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
    expect(mock.callsTo("GET", "/rest/v1/provider_applications")).toEqual([]);
  });

  test("fails closed when the role check is not deployed (42P17)", async ({ page, backend }) => {
    const mock = await backend({ platformAdmin: "notDeployed" });
    await page.goto("/admin");
    await expect(page.getByText("Administration needs a backend update")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    expect(mock.callsTo("GET", "/rest/v1/provider_applications")).toEqual([]);
  });

  test("an admin approves an application only after confirming", async ({ page, backend }) => {
    const mock = await backend({
      platformAdmin: true,
      applications: [
        {
          id: "app-1",
          clinic_name: "Real Health Clinic",
          area: "Adyar",
          address: "12 Main Road",
          contact_name: "A Applicant",
          contact_role: "owner",
          contact_phone: "+91 98400 00000",
          contact_email: "applicant@test.invalid",
          registration_details: "TN CE reg 2026/123",
          doctor_count: 3,
          message: null,
          status: "submitted",
          review_note: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
    });
    await page.goto("/admin");
    await expect(page.getByText("TN CE reg 2026/123")).toBeVisible();
    await page.getByRole("button", { name: "Approve clinic" }).click();
    expect(mock.callsTo("POST", "/rest/v1/rpc/admin_review_provider_application")).toEqual([]);
    await expect(page.getByText("Approve Real Health Clinic?")).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Clinic approved")).toBeVisible();
    expect(
      mock.callsTo("POST", "/rest/v1/rpc/admin_review_provider_application")[0]?.body,
    ).toMatchObject({ p_application_id: "app-1", p_approve: true });
  });

  test("an admin verifies a pending doctor; sample doctors are not offered", async ({
    page,
    backend,
  }) => {
    const mock = await backend({ platformAdmin: true });
    // Dr. Pending Tester is a sample (is_demo) in the default fixtures; add a real pending doctor.
    const real = structuredClone(mock.state.doctors[1]!);
    Object.assign(real, {
      id: "00000000-0000-4000-8000-0000000000d9",
      name: "Dr. Real Pending",
      is_demo: false,
      registration_note: "TNMC 555",
    });
    mock.state.doctors.push(real);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Doctor verification" }).click();
    await expect(page.getByText("Dr. Real Pending")).toBeVisible();
    await expect(page.getByText("Dr. Pending Tester")).toHaveCount(0);
    await expect(page.getByText("1 sample listings are hidden here")).toBeVisible();
    await page.getByRole("button", { name: "Verify doctor" }).click();
    await expect(page.getByText("Doctor verified")).toBeVisible();
    expect(mock.callsTo("PATCH", "/rest/v1/clinic_doctors")[0]?.body).toEqual({
      verification_state: "verified",
    });
  });

  test("adding a member by an unknown email explains what to do", async ({ page, backend }) => {
    const mock = await backend({ platformAdmin: true });
    mock.state.clinics[0]!["is_demo"] = false;
    mock.state.memberships = [];
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Clinic teams" }).click();
    await page.getByLabel("Clinic", { exact: true }).selectOption(ids.clinicA);
    await page.getByLabel("Email").fill("nobody@test.invalid");
    await page.getByRole("button", { name: "Add clinic member" }).click();
    await expect(page.getByRole("alert")).toContainText("No CareConnect account uses that email");
  });
});

test.describe("Clinic doctors", () => {
  test("shows verification status; only verified doctors get hours", async ({ page, backend }) => {
    const mock = await backend();
    mock.state.doctors[1]!["clinic_doctors"] = [
      { clinic_id: ids.clinicA, active: true, verification_state: "pending" },
    ];
    mock.state.memberships = [adminMembership(mock.state.clinics[0])];
    await page.goto("/clinic/doctors");
    const verified = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
    const pending = page.getByRole("listitem").filter({ hasText: "Dr. Pending Tester" });
    await expect(verified.getByText("Verified", { exact: true })).toBeVisible();
    await expect(pending.getByText("Awaiting verification")).toBeVisible();
    await expect(pending.getByRole("button", { name: "Edit hours" })).toHaveCount(0);

    await verified.getByRole("button", { name: "Edit hours" }).click();
    await verified.getByLabel("Day").selectOption("2");
    await verified.getByLabel("Opens").fill("10:00");
    await verified.getByLabel("Closes").fill("09:00");
    await verified.getByRole("button", { name: "Save hours" }).click();
    await expect(verified.getByRole("alert")).toContainText("closing time must be after");
    await verified.getByLabel("Closes").fill("13:00");
    await verified.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByText("Hours saved for Tuesday")).toBeVisible();
    await expect(verified.getByRole("listitem").filter({ hasText: "Tuesday" })).toContainText(
      "10:00",
    );
    expect(mock.callsTo("POST", "/rest/v1/doctor_schedules")[0]?.body).toMatchObject({
      doctor_id: ids.doctorVerified,
      clinic_id: ids.clinicA,
      day_of_week: 2,
      start_time: "10:00",
      end_time: "13:00",
    });
  });

  test("a clinic admin proposes a doctor, who starts pending", async ({ page, backend }) => {
    const mock = await backend();
    mock.state.memberships = [adminMembership(mock.state.clinics[0])];
    await page.goto("/clinic/doctors");
    await page.getByRole("button", { name: "Propose a doctor" }).click();
    await page.getByRole("button", { name: "Send for verification" }).click();
    await expect(page.getByRole("alert")).toContainText("full name");
    await page.getByLabel(/^Doctor's full name/).fill("Dr. New Proposal");
    await page.getByLabel(/^Years of experience/).fill("8");
    await page.getByLabel(/^Consultation fee/).fill("600");
    await page.getByLabel(/^Medical registration/).fill("TNMC 123456");
    await page.getByRole("button", { name: "Send for verification" }).click();
    await expect(page.getByText("Doctor sent for verification")).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Dr. New Proposal" })
        .getByText("Awaiting verification"),
    ).toBeVisible();
    expect(mock.callsTo("POST", "/rest/v1/rpc/clinic_propose_doctor")[0]?.body).toMatchObject({
      p_clinic_id: ids.clinicA,
      p_name: "Dr. New Proposal",
      p_registration_note: "TNMC 123456",
    });
  });

  test("clinic staff (not admins) cannot propose doctors", async ({ page, backend }) => {
    const mock = await backend();
    mock.state.memberships = [{ ...adminMembership(mock.state.clinics[0]), role: "clinic_staff" }];
    await page.goto("/clinic/doctors");
    await expect(page.getByText("Only your clinic's administrator can propose")).toBeVisible();
    await expect(page.getByRole("button", { name: "Propose a doctor" })).toHaveCount(0);
  });
});

test.describe("Phones", () => {
  for (const width of [320, 375, 390, 430]) {
    test(`no horizontal overflow at ${width}px on forms and new pages`, async ({
      page,
      backend,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const mock = await backend({ platformAdmin: true });
      mock.state.memberships = [adminMembership(mock.state.clinics[0])];
      const overflowing: string[] = [];
      for (const path of [
        "/providers",
        "/clinic/signup",
        "/admin",
        "/clinic/doctors",
        "/profile",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        if (path === "/profile")
          await page.getByRole("button", { name: "Edit", exact: true }).click();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 0) overflowing.push(`${path} (+${overflow}px)`);
      }
      expect(overflowing).toEqual([]);
    });

    test(`no horizontal overflow at ${width}px on the sign-in screens`, async ({
      page,
      backend,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await backend({}, { signedIn: false });
      const overflowing: string[] = [];
      for (const path of ["/login", "/login?signup=true", "/clinic/login", "/providers"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 0) overflowing.push(`${path} (+${overflow}px)`);
      }
      expect(overflowing).toEqual([]);
    });
  }

  test("Urdu: new pages render right-to-left without overflow", async ({ page, backend }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("baseURL is not configured");
    await page.context().addCookies([{ name: "cc_lang", value: "ur", url: baseURL }]);
    const mock = await backend({ platformAdmin: true });
    mock.state.memberships = [adminMembership(mock.state.clinics[0])];
    for (const path of ["/providers", "/clinic/signup", "/clinic/doctors", "/clinic/login"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
