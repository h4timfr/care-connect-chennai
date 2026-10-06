import type { Page } from "@playwright/test";
import { defaultState, ids } from "./support/mock-backend";
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
    // The clinic can still be contacted.
    await expect(page.getByRole("button", { name: "Message clinic" })).toBeVisible();
  });

  test("a verified doctor offers booking and no unavailable notice", async ({ page, backend }) => {
    await backend({}, { signedIn: false });
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
  // pending one. "Verified" must follow the booking rule, never mere presence in the directory.
  const realListings = () => {
    const state = defaultState();
    for (const row of [...state.clinics, ...state.doctors]) row["is_demo"] = false;
    return { clinics: state.clinics, doctors: state.doctors };
  };
  const card = (page: Page, name: string) => page.locator("article").filter({ hasText: name });

  test("doctor cards say Verified only for a bookable doctor", async ({ page, backend }) => {
    await backend(realListings(), { signedIn: false });
    await page.goto("/discover");
    const verified = card(page, "Dr. Verified Tester");
    const pending = card(page, "Dr. Pending Tester");
    await expect(verified.getByText("Verified", { exact: true })).toBeVisible();
    await expect(verified.getByText("Not yet bookable")).toHaveCount(0);
    await expect(pending.getByText("Not yet bookable")).toBeVisible();
    await expect(pending.getByText("Verified", { exact: true })).toHaveCount(0);
  });

  test("a clinic is Verified only when one of its doctors is bookable", async ({
    page,
    backend,
  }) => {
    await backend(realListings(), { signedIn: false });
    await page.goto("/discover?tab=clinics");
    await expect(card(page, "Test Clinic A").getByText("Verified", { exact: true })).toBeVisible();
    const clinicB = card(page, "Test Clinic B");
    await expect(clinicB.getByText("Not yet bookable")).toBeVisible();
    await expect(clinicB.getByText("Verified", { exact: true })).toHaveCount(0);

    await page.goto(`/clinics/${ids.clinicB}`);
    await expect(page.getByRole("heading", { level: 1, name: "Test Clinic B" })).toBeVisible();
    await expect(page.getByText("Not yet bookable").first()).toBeVisible();
    await page.goto(`/doctors/${ids.doctorPending}`);
    await expect(page.getByRole("heading", { level: 1, name: "Dr. Pending Tester" })).toBeVisible();
    await expect(page.getByText("Not yet bookable").first()).toBeVisible();
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
