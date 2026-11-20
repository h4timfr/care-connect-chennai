import { expect, test } from "./support/fixtures";
import { appointmentRow, conversationRow, enablePatientContact, ids } from "./support/mock-backend";

const hours = {
  id: "weekly-monday",
  clinic_id: ids.clinicA,
  doctor_id: ids.doctorVerified,
  day_of_week: 1,
  start_time: "10:00:00",
  end_time: "12:00:00",
  slot_minutes: 20,
};

test("the clinic dashboard links to its Chennai-day bookings and authorized roster", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-15T19:00:00Z"));
  const mock = await backend({
    appointments: [
      appointmentRow({
        date: "2026-11-16",
        time: "10:00:00",
        patients: { full_name: "Today Visit" },
      }),
      appointmentRow({
        id: "previous",
        date: "2026-11-15",
        patients: { full_name: "Previous Visit" },
      }),
      appointmentRow({
        id: "other",
        clinic_id: ids.clinicB,
        date: "2026-11-16",
        patients: { full_name: "Other Clinic Visit" },
      }),
    ],
    schedules: [hours],
  });
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: mock.state.clinics[0] },
  ];
  await page.goto("/clinic");
  await expect(page.getByText("Today Visit").first()).toBeVisible();
  await expect(page.getByText("Previous Visit")).toHaveCount(0);
  await expect(page.getByText("Other Clinic Visit")).toHaveCount(0);
  await expect(page.getByText("1 verified · 1 with hours set")).toBeVisible();
  await page.getByRole("link", { name: /Today's visits/ }).click();
  await expect(page).toHaveURL(/view=today/);
  await expect(page.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
});

test("status change is explicit, filtered and confirmed by the backend", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-16T00:00:00Z"));
  const mock = await backend({
    appointments: [
      appointmentRow({
        date: "2026-11-16",
        patients: {
          full_name: "Filter Patient",
          phone: "SYNTHETIC_PRIVATE_PHONE",
          email: "SYNTHETIC_PRIVATE_EMAIL",
        },
      }),
      appointmentRow({
        id: "second",
        date: "2026-11-17",
        patients: { full_name: "Different Patient" },
      }),
    ],
  });
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: mock.state.clinics[0] },
  ];
  await page.goto("/clinic/appointments");
  await page.getByLabel("Date", { exact: true }).fill("2026-11-16");
  await page
    .getByRole("combobox", { name: "Doctor", exact: true })
    .selectOption(ids.doctorVerified);
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("pending");
  await expect(page.getByText("Different Patient")).toHaveCount(0);
  const details = page.getByRole("button", { name: "Appointment details" });
  await details.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Routine check")).toBeVisible();
  await expect(dialog.getByText(/SYNTHETIC_PRIVATE/)).toHaveCount(0);
  const selects = mock
    .callsTo("GET", "/rest/v1/appointments")
    .map((call) => decodeURIComponent(call.search));
  expect(selects.every((select) => !/phone|email/.test(select))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  expect(mock.callsTo("PATCH", "/rest/v1/appointments")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Apply status change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("No appointments match this filter.")).toBeVisible();
  expect(mock.callsTo("PATCH", "/rest/v1/appointments")).toHaveLength(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Confirmed", { exact: true }).last()).toBeVisible();
});

test("weekly editor keeps saved values and explains future-booking locks", async ({
  page,
  backend,
}) => {
  const mock = await backend({ schedules: [hours] });
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: mock.state.clinics[0] },
  ];
  await page.route("**/rest/v1/doctor_schedules?*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 400,
      json: {
        code: "P0001",
        message: "Validation Failed: A schedule with future active appointments cannot be changed.",
      },
    });
  });
  await page.goto("/clinic/doctors");
  await page.getByRole("button", { name: "Edit hours" }).click();
  await expect(page.getByLabel("Opens")).toHaveValue("10:00");
  await page.getByLabel("Closes").fill("10:05");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("alert")).toContainText("must fit at least one appointment");
  await page.getByLabel("Closes").fill("11:20");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("alert")).toContainText("Existing future appointments");
  await expect(page.getByLabel("Closes")).toHaveValue("11:20");
  await expect(page.getByText(/10:00 AM.*12:00 PM/)).toBeVisible();
});

test("clinic inbox handles a private-thread deep link without reading the doctor inbox", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    conversations: [conversationRow([{ from: "patient", body: "Clinic enquiry fixture" }])],
  });
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: mock.state.clinics[0] },
  ];
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/clinic/messages?c=private-doctor-thread");
  await expect(page.getByText("That conversation isn't available.").first()).toBeVisible();
  await expect(page.getByLabel("Reply to patient")).toHaveCount(0);
  expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_message_inbox")).toEqual([]);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Clinic enquiry fixture/ })
    .click();
  await expect(page.getByRole("log")).toContainText("Clinic enquiry fixture");
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeFocused();
});

test("profile reads authorized clinic settings and retries failed contact lookup", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  enablePatientContact(mock.state, ids.clinicA, true);
  const clinic = mock.state.clinics[0]!;
  clinic["is_published"] = false;
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_admin", active: true, clinics: clinic },
  ];
  let denied = true;
  await page.route("**/rest/v1/rpc/get_my_clinic_contacts", async (route) => {
    if (!denied) return route.fallback();
    await route.fulfill({ status: 403, json: { code: "42501", message: "Denied" } });
  });
  await page.goto("/clinic/profile");
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  denied = false;
  await retry.click();
  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Not published in the directory")).toBeVisible();
  await expect(status.getByText("Permission for patient enquiries")).toBeVisible();
  await expect(page.getByRole("button", { name: /publish|verify|save changes/i })).toHaveCount(0);
  expect(mock.callsTo("PATCH", "/rest/v1/clinics")).toHaveLength(0);
});

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test("clinic operational routes fit at " + width + "px", async ({ page, backend }, info) => {
    const name = "நீண்டமருத்துவமனைப்பெயர்".repeat(5);
    const mock = await backend({
      appointments: [appointmentRow()],
      schedules: [hours],
      conversations: [conversationRow([{ from: "patient", body: "Clinic enquiry fixture" }])],
    });
    mock.state.clinics[0]!["name"] =
      width === 375 || width === 1440 ? "Harbour Family Clinic" : name;
    mock.state.memberships = [
      {
        clinic_id: ids.clinicA,
        role: "clinic_staff",
        active: true,
        clinics: mock.state.clinics[0],
      },
    ];
    const language =
      width === 320 || width === 1024 ? "ta" : width === 390 || width === 768 ? "ur" : "en";
    await page.addInitScript(
      (value) => localStorage.setItem("careconnect.language", value),
      language,
    );
    await page.emulateMedia({
      colorScheme: width === 390 ? "dark" : "light",
      reducedMotion: "reduce",
    });
    await page.setViewportSize({ width, height: 850 });
    for (const route of [
      "",
      "/appointments",
      "/calendar",
      "/doctors",
      "/patients",
      "/messages",
      "/profile",
    ]) {
      await page.goto("/clinic" + route);
      await expect(page.getByRole("main")).toBeVisible();
      if (!route && (width === 375 || width === 1440)) {
        await expect(page.getByText("1 verified · 1 with hours set")).toBeVisible();
        await page.getByRole("button", { name: "Skip for now" }).click();
        await page.screenshot({
          path: info.outputPath("clinic-dashboard-" + width + ".png"),
          animations: "disabled",
        });
      }
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        language === "ur" ? "ur" : language + "-IN",
      );
      await expect(page.locator("html")).toHaveClass(width === 390 ? /\bdark\b/ : /\blight\b/);
      if (language === "ur") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        route,
      ).toBeLessThanOrEqual(1);
    }
  });
}
