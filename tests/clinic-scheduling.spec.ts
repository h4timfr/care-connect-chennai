import { expect, test } from "./support/fixtures";
import { appointmentRow, defaultState, ids } from "./support/mock-backend";

const membership = (clinic: Record<string, unknown>) => ({
  clinic_id: clinic["id"],
  role: "clinic_admin",
  active: true,
  clinics: clinic,
});

test("schedule loading is not empty and a failed load can be retried", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  const mock = await backend({
    memberships: [membership(state.clinics[0]!)],
    failTables: ["doctor_schedules"],
    delays: { doctor_schedules: 600 },
  });
  await page.goto("/clinic/doctors");
  const card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await expect(card.getByRole("status")).toBeVisible();
  await expect(card.getByText("No hours set, so patients can't book this doctor yet.")).toHaveCount(
    0,
  );
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(card.getByRole("button", { name: "Edit hours" })).toBeDisabled();
  mock.state.failTables = [];
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(
    card.getByText("No hours set, so patients can't book this doctor yet."),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: "Edit hours" })).toBeEnabled();
});

test("verified hours remain editable when clinic booking is disabled", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  state.clinics[0]!["is_demo"] = false;
  state.clinics[0]!["clinic_verification_state"] = "verified";
  state.clinics[0]!["is_published"] = true;
  state.clinics[0]!["booking_enabled"] = false;
  state.doctors[0]!["is_demo"] = false;
  await backend({
    clinics: state.clinics,
    doctors: state.doctors,
    memberships: [membership(state.clinics[0]!)],
  });
  await page.goto("/clinic/doctors");
  const card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await expect(card.getByText("Online booking unavailable")).toBeVisible();
  await expect(card.getByRole("button", { name: "Edit hours" })).toBeEnabled();
});

test("duplicate schedule saves are blocked and rejected input is preserved", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  await backend({ memberships: [membership(state.clinics[0]!)] });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/rest/v1/doctor_schedules?*", async (route) => {
    if (route.request().method() === "POST") {
      calls++;
      await gate;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "Denied" }),
      });
    } else await route.fallback();
  });
  await page.goto("/clinic/doctors");
  const card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await card.getByRole("button", { name: "Edit hours" }).click();
  await card.getByLabel("Opens").fill("10:00");
  await card.getByLabel("Closes").fill("14:00");
  await card.locator("form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(card.getByRole("alert")).toContainText("Hours can only be set");
  await expect(card.getByLabel("Opens")).toHaveValue("10:00");
  await expect(card.getByLabel("Closes")).toHaveValue("14:00");
  expect(calls).toBe(1);
});

test("switching clinics clears the prior doctor's calendar filter", async ({ page, backend }) => {
  const state = defaultState();
  state.doctors[1]!["clinic_doctors"] = [
    { clinic_id: ids.clinicA, active: true, verification_state: "verified" },
  ];
  (state.doctors[0]!["clinic_doctors"] as Record<string, unknown>[]).push({
    clinic_id: ids.clinicB,
    active: true,
    verification_state: "verified",
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  await backend({
    doctors: state.doctors,
    memberships: [membership(state.clinics[0]!), membership(state.clinics[1]!)],
    appointments: [
      appointmentRow({
        clinic_id: ids.clinicB,
        date: today,
        patients: { full_name: "Clinic B Patient" },
      }),
    ],
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/clinic/calendar");
  await page.getByRole("button", { name: "Dr. Pending Tester" }).click();
  await page.locator("#clinic-picker-sidebar").selectOption(ids.clinicB);
  await expect(page.getByText("Clinic B Patient")).toBeVisible();
});

test("calendar navigation crosses India year boundary with long names at all widths", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-31T18:29:00Z"));
  const state = defaultState();
  const name = "SyntheticPatient".repeat(12);
  await backend({
    memberships: [membership(state.clinics[0]!)],
    appointments: [appointmentRow({ date: "2027-01-01", patients: { full_name: name } })],
  });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/clinic/calendar");
    const next = page.getByRole("button", { name: "Next day" });
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(name)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  }
});

test("a delayed schedule response cannot change the newly selected clinic", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  (state.doctors[0]!["clinic_doctors"] as Record<string, unknown>[]).push({
    clinic_id: ids.clinicB,
    active: true,
    verification_state: "verified",
  });
  const mock = await backend({
    doctors: state.doctors,
    memberships: [membership(state.clinics[0]!), membership(state.clinics[1]!)],
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/doctor_schedules?*", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/clinic/doctors");
  let card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await card.getByRole("button", { name: "Edit hours" }).click();
  await card.getByLabel("Opens").fill("10:00");
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("/rest/v1/doctor_schedules"),
  );
  await card.getByRole("button", { name: "Save hours" }).click();
  await request;
  await page.locator("#clinic-picker-sidebar").selectOption(ids.clinicB);
  card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await card.getByRole("button", { name: "Edit hours" }).click();
  await expect(card.getByLabel("Opens")).toHaveValue("09:00");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/rest/v1/doctor_schedules"),
  );
  release();
  await response;
  await expect(card.getByLabel("Opens")).toHaveValue("09:00");
  await expect(page.getByText("Hours saved for Monday")).toHaveCount(0);
  expect(mock.callsTo("POST", "/rest/v1/doctor_schedules")[0]?.body).toMatchObject({
    clinic_id: ids.clinicA,
  });
});

test("a deleted schedule stays locked while the list refresh is pending", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  const mock = await backend({
    memberships: [membership(state.clinics[0]!)],
    schedules: [
      {
        id: "schedule-one",
        clinic_id: ids.clinicA,
        doctor_id: ids.doctorVerified,
        day_of_week: 1,
        start_time: "09:00:00",
        end_time: "13:00:00",
        slot_minutes: 30,
      },
    ],
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let gets = 0;
  await page.route("**/rest/v1/doctor_schedules?*", async (route) => {
    if (route.request().method() === "GET" && ++gets > 1) await gate;
    await route.fallback();
  });
  await page.goto("/clinic/doctors");
  const card = page.getByRole("listitem").filter({ hasText: "Dr. Verified Tester" });
  await card.getByRole("button", { name: "Edit hours" }).click();
  const remove = card.getByRole("button", { name: "Remove hours for Monday" });
  await remove.click();
  try {
    await expect.poll(() => gets).toBeGreaterThan(1);
    await expect(remove).toBeDisabled();
    await remove.dispatchEvent("click");
    expect(mock.callsTo("DELETE", "/rest/v1/doctor_schedules")).toHaveLength(1);
  } finally {
    release();
  }
  await expect(remove).toHaveCount(0);
});
