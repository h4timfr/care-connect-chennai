import type { Page } from "@playwright/test";
import { defaultState, enablePatientContact, ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

// Booking availability honesty, and clinic-portal visibility driven by real memberships.

test.describe("Online booking availability", () => {
  test("an unverified doctor explains booking is unavailable and offers no booking", async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    await page.goto(`/doctors/${ids.doctorPending}`);
    const notice = page.getByTestId("booking-unavailable");
    await expect(notice).toContainText("Online booking unavailable");
    await expect(notice).toContainText("not currently accepting online appointments");
    await expect(page.getByRole("link", { name: "Book appointment" })).toHaveCount(0);
    // A pending clinic link does not create a patient-contact affordance.
    await expect(page.getByRole("button", { name: "Message clinic" })).toHaveCount(0);
  });

  test("a verified doctor offers booking and no unavailable notice", async ({ page, backend }) => {
    const mock = await backend({}, { signedIn: false });
    enablePatientContact(mock.state, ids.clinicA, true);
    await page.goto(`/doctors/${ids.doctorVerified}`);
    await expect(page.getByRole("link", { name: "Book appointment" })).toBeVisible();
    await expect(page.getByTestId("booking-unavailable")).toHaveCount(0);
  });

  test("booking a doctor without a verified clinic link is refused in the UI", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto(`/book/${ids.doctorPending}`);
    await expect(page.getByText(/isn't accepting online bookings right now/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Request appointment" })).toHaveCount(0);
    expect(mock.callsTo("POST", "/rpc/book_appointment")).toHaveLength(0);
  });
});

test.describe("Provider publication controls", () => {
  test("publication, patient permission, and booking are independent admin actions", async ({
    page,
    backend,
  }) => {
    const mock = await backend({ platformAdmin: true });
    mock.state.clinics[0]!["is_demo"] = false;
    mock.state.doctors[0]!["is_demo"] = false;
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Provider publishing" }).click();
    const row = page.locator("li").filter({ hasText: "Test Clinic A" });
    await expect(row).toContainText("Pending");
    await expect(row).toContainText("Not granted");
    await expect(row).toContainText("Disabled");

    const dialog = page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
    const writes = () => mock.callsTo("POST", "/rpc/admin_set_clinic_publication_state");
    const verify = row.getByRole("button", { name: "Verify clinic" });
    await verify.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toContainText("Test Clinic A");
    await expect(dialog).toContainText("Verified");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    expect(writes()).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(verify).toBeFocused();
    expect(writes()).toHaveLength(0);

    await verify.click();
    await confirm.click();
    await expect(row).toContainText("Verified");
    expect(writes().at(-1)?.body).toMatchObject({
      p_clinic_id: ids.clinicA,
      p_verification_state: "verified",
      p_is_published: false,
      p_contact_permission: "not_granted",
      p_booking_enabled: false,
    });

    await row.getByRole("button", { name: "Publish listing" }).click();
    await expect(dialog).toContainText("Not granted");
    await confirm.click();
    await expect(row.getByRole("button", { name: "Unpublish listing" })).toBeEnabled();
    expect(writes().at(-1)?.body).toMatchObject({
      p_is_published: true,
      p_contact_permission: "not_granted",
      p_booking_enabled: false,
    });

    const grant = row.getByRole("button", { name: "Grant patient contact" });
    const acknowledgment = dialog.getByRole("checkbox", { name: /explicitly authorized/ });
    await grant.click();
    await expect(confirm).toBeDisabled();
    await acknowledgment.check();
    await expect(confirm).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await grant.click();
    await expect(acknowledgment).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    expect(writes()).toHaveLength(2);
    await acknowledgment.check();
    await confirm.click();
    await expect(row.getByRole("button", { name: "Revoke patient contact" })).toBeEnabled();
    expect(writes().at(-1)?.body).toMatchObject({
      p_contact_permission: "granted",
      p_booking_enabled: false,
    });

    await row.getByRole("button", { name: "Enable online booking" }).click();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await confirm.click();
    await expect(row.getByRole("button", { name: "Disable online booking" })).toBeEnabled();
    expect(writes().at(-1)?.body).toMatchObject({
      p_contact_permission: "granted",
      p_booking_enabled: true,
    });

    await row.getByRole("button", { name: "Unpublish listing" }).click();
    await expect(dialog.getByText("Disabled", { exact: true })).toHaveCount(2);
    await expect(dialog.getByText("Not granted", { exact: true })).toBeVisible();
    await confirm.click();
    await expect(row.getByRole("button", { name: "Publish listing" })).toBeEnabled();
    expect(writes()).toHaveLength(5);
    expect(writes().at(-1)?.body).toMatchObject({
      p_is_published: false,
      p_contact_permission: "not_granted",
      p_booking_enabled: false,
    });
  });
});

test.describe("Clinic portal visibility", () => {
  test("patients without a membership see no clinic portal entry, on any screen size", async ({
    page,
    backend,
  }) => {
    await backend();
    for (const size of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Clinic portal" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Clinic access" })).toHaveCount(0);
    }
  });

  test("a clinic member reaches the portal from the header on mobile and desktop", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    mock.state.memberships = [
      { clinic_id: ids.clinicA, role: "clinic_staff", clinics: mock.state.clinics[0] },
    ];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const mobileEntry = page.getByRole("link", { name: "Clinic portal" });
    await expect(mobileEntry).toBeVisible();
    await mobileEntry.click();
    await expect(page).toHaveURL(/\/clinic$/);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Clinic access" })).toBeVisible();
    await expect(page.getByText("You're a member of 1 clinic on CareConnect.")).toBeVisible();
  });

  test("the portal shows the member's role at each clinic", async ({ page, backend }) => {
    const mock = await backend();
    mock.state.memberships = [
      { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
      { clinic_id: ids.clinicB, role: "clinic_staff", clinics: mock.state.clinics[1] },
    ];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/clinic");
    await expect(page.getByTestId("clinic-role")).toHaveText("Clinic administrator");
    await page.locator("#clinic-picker-sidebar").selectOption(ids.clinicB);
    await expect(page.getByTestId("clinic-role")).toHaveText("Clinic staff");
    // The membership query only ever asks for the signed-in user's own active memberships.
    const membershipCall = mock.callsTo("GET", "/rest/v1/clinic_memberships")[0];
    expect(membershipCall?.search).toContain(`user_id=eq.${ids.user}`);
    expect(membershipCall?.search).toContain("active=eq.true");
  });
});

test.describe("Truthful listing status", () => {
  // Real (non-sample) listings: Clinic A has a verified, active doctor link; Clinic B only a
  // pending one. Booking and contact indicators must follow their separate backend permissions.
  const realListings = () => {
    const state = defaultState();
    for (const row of [...state.clinics, ...state.doctors]) row["is_demo"] = false;
    enablePatientContact(state, ids.clinicA, true);
    enablePatientContact(state, ids.clinicB, true);
    return { clinics: state.clinics, doctors: state.doctors };
  };
  const card = (page: Page, name: string) => page.locator("article").filter({ hasText: name });

  test("doctor cards show booking without claiming registration verification", async ({
    page,
    backend,
  }) => {
    await backend(realListings(), { signedIn: false });
    await page.goto("/discover");
    const verified = card(page, "Dr. Verified Tester");
    const pending = card(page, "Dr. Pending Tester");
    await expect(verified.getByRole("link", { name: "Book", exact: true })).toBeVisible();
    await expect(verified.getByText("Verified", { exact: true })).toHaveCount(0);
    await expect(verified.getByText("Not yet bookable")).toHaveCount(0);
    await expect(pending.getByText("Not yet bookable")).toBeVisible();
    await expect(pending.getByText("Patient enquiries unavailable")).toBeVisible();
    await expect(pending.getByText("Verified", { exact: true })).toHaveCount(0);
  });

  test("clinic cards distinguish booking from patient contact", async ({ page, backend }) => {
    await backend(realListings(), { signedIn: false });
    await page.goto("/discover?tab=clinics");
    await expect(card(page, "Test Clinic A").getByText("Not yet bookable")).toHaveCount(0);
    await expect(card(page, "Test Clinic A").getByText("Verified", { exact: true })).toHaveCount(0);
    const clinicB = card(page, "Test Clinic B");
    await expect(clinicB.getByText("Not yet bookable")).toBeVisible();
    await expect(clinicB.getByText("Patient enquiries unavailable")).toBeVisible();
    await expect(clinicB.getByText("Verified", { exact: true })).toHaveCount(0);

    await page.goto(`/clinics/${ids.clinicB}`);
    await expect(page.getByRole("heading", { level: 1, name: "Test Clinic B" })).toBeVisible();
    await expect(page.getByText("Patient enquiries unavailable").first()).toBeVisible();
    await page.goto(`/doctors/${ids.doctorPending}`);
    await expect(page.getByRole("heading", { level: 1, name: "Dr. Pending Tester" })).toBeVisible();
    await expect(page.getByText("Patient enquiries unavailable").first()).toBeVisible();
  });

  test("a bookable provider may independently disable patient enquiries", async ({
    page,
    backend,
  }) => {
    const listings = realListings();
    listings.clinics[0]!["patient_contact_permission"] = "revoked";
    await backend(listings, { signedIn: false });
    await page.goto("/discover");
    const provider = card(page, "Dr. Verified Tester");
    await expect(provider.getByRole("link", { name: "Book", exact: true })).toBeVisible();
    await expect(provider.getByText("Patient enquiries unavailable")).toBeVisible();
    await expect(provider.getByText("Not yet bookable")).toHaveCount(0);
  });

  test("a contactable provider may independently disable booking", async ({ page, backend }) => {
    const listings = realListings();
    listings.clinics[0]!["booking_enabled"] = false;
    await backend(listings, { signedIn: false });
    await page.goto("/discover");
    const provider = card(page, "Dr. Verified Tester");
    await expect(provider.getByRole("link", { name: "Book", exact: true })).toHaveCount(0);
    await expect(provider.getByText("Not yet bookable")).toBeVisible();
    await expect(provider.getByText("Patient enquiries unavailable")).toHaveCount(0);
  });

  test("sample listings are never shown as verified", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
    await page.goto("/discover");
    const verified = card(page, "Dr. Verified Tester");
    await expect(verified.getByText("Sample listing")).toBeVisible();
    await expect(verified.getByText("Verified", { exact: true })).toHaveCount(0);
  });
});

test.describe("Portal skip links", () => {
  for (const portal of ["clinic", "doctor"] as const) {
    test(`the ${portal} portal's first Tab stop skips to the main content`, async ({
      page,
      backend,
    }) => {
      const mock = await backend();
      if (portal === "clinic") {
        mock.state.memberships = [
          { clinic_id: ids.clinicA, role: "clinic_admin", clinics: mock.state.clinics[0] },
        ];
      } else {
        mock.state.doctors[0]!["user_id"] = ids.user;
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${portal}`);
      await expect(page.locator("#main-content")).toBeVisible();
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to content" });
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#main-content$/);
    });
  }
});

test("clinic teams reports clinic-list failure and retries", async ({ page, backend }) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  let failed = false;
  await page.route("**/rest/v1/rpc/admin_list_clinics", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "Denied" }),
      });
    } else await route.fallback();
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Clinic teams" }).click();
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  await expect(page.getByLabel("Clinic", { exact: true })).toHaveCount(0);
  await retry.click();
  await expect(page.getByLabel("Clinic", { exact: true })).toBeVisible();
});

test("failed publication does not claim success or change the displayed state", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  let attempts = 0;
  await page.route("**/rest/v1/rpc/admin_set_clinic_publication_state", async (route) => {
    attempts++;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "Denied" }),
    });
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Provider publishing" }).click();
  const row = page.locator("li").filter({ hasText: "Test Clinic A" });
  await row.getByRole("button", { name: "Verify clinic" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("You don't have permission to do that.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Pending");
  await expect(page.getByText("Provider state updated.")).toHaveCount(0);
  expect(attempts).toBe(1);
});

test("adding a clinic member locks the fields and ignores repeated submission while pending", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route("**/rest/v1/rpc/admin_add_clinic_member", async (route) => {
    attempts++;
    await gate;
    await route.fallback();
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Clinic teams" }).click();
  await page.getByLabel("Clinic", { exact: true }).selectOption(ids.clinicA);
  const email = page.getByLabel("Email", { exact: true });
  await email.fill("staff@test.invalid");
  const submit = page.getByRole("button", { name: "Add clinic member" });
  await submit.click();
  await expect(email).toBeDisabled();
  await expect(submit).toBeDisabled();
  expect(attempts).toBe(1);
  release();
  await expect(email).toBeEnabled();
  await expect(email).toHaveValue("");
  expect(mock.callsTo("POST", "/rpc/admin_add_clinic_member")).toHaveLength(1);
});

test("publication controls stay locked until refreshed clinic state arrives", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let listCalls = 0;
  await page.route("**/rest/v1/rpc/admin_list_clinics", async (route) => {
    listCalls++;
    if (listCalls > 1) await gate;
    await route.fallback();
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Provider publishing" }).click();
  const row = page.locator("li").filter({ hasText: "Test Clinic A" });
  const verify = row.getByRole("button", { name: "Verify clinic" });
  await verify.click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  try {
    await confirm.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => listCalls).toBeGreaterThan(1);
    await expect(confirm).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(mock.callsTo("POST", "/rpc/admin_set_clinic_publication_state")).toHaveLength(1);
  } finally {
    release();
  }
  await expect(dialog).toBeHidden();
  await expect(row.getByRole("button", { name: "Publish listing" })).toBeEnabled();
});

test("a refreshed clinic state requires a new publication preview", async ({ page, backend }) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  await page.clock.install();
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Provider publishing" }).click();
  await page.getByRole("button", { name: "Verify clinic" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeEnabled();
  mock.state.clinics[0]!["clinic_verification_state"] = "verified";
  await page.clock.fastForward(6 * 60 * 1000);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(dialog.getByRole("alert")).toContainText("publication settings changed");
  await expect(confirm).toBeDisabled();
  expect(mock.callsTo("POST", "/rpc/admin_set_clinic_publication_state")).toHaveLength(0);
});

test("publication cards with long clinic names fit and support keyboard actions", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  mock.state.clinics[0]!["is_demo"] = false;
  const name = "SyntheticClinic".repeat(10);
  mock.state.clinics[0]!["name"] = name;
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/admin");
    const tab = page.getByRole("tab", { name: "Provider publishing" });
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await page.getByRole("button", { name: "Verify clinic" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(name);
    const { clientWidth, scrollWidth } = await dialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});
