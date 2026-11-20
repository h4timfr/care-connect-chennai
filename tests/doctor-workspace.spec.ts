import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { ids, type MockBackend } from "./support/mock-backend";

const now = new Date("2026-11-19T04:30:00Z");
const body = "Synthetic follow-up reason";

function fixtureDoctor(mock: MockBackend, state = "verified", active = true) {
  const doctor = mock.state.doctors[0]!;
  doctor["user_id"] = ids.user;
  doctor["is_demo"] = false;
  doctor["clinic_doctors"] = [{ clinic_id: ids.clinicA, active, verification_state: state }];
}

function appt(id: string, date: string, time: string, status: string, patient: string) {
  return {
    id,
    date,
    time,
    status,
    patient_name: patient,
    clinic_name: "Test Clinic A",
    clinic_id: ids.clinicA,
    reason: body,
  };
}

const appointments = [
  appt("old", "2026-11-19", "09:45:00", "completed", "Morning Patient"),
  appt("today", "2026-11-19", "11:30:00", "confirmed", "Today Patient"),
  appt("later", "2026-11-20", "11:30:00", "pending", "Tomorrow Patient"),
];
const conversation = {
  id: "doctor-clinic-thread",
  clinic_id: ids.clinicA,
  clinic_name: "Test Clinic A",
  patient_name: "Fixture Patient",
  messages: [
    {
      id: "first",
      body: "Follow-up question",
      from: "patient",
      created_at: "2026-11-19T03:00:00Z",
    },
  ],
};

async function noOverflow(page: Page, width: number) {
  const measured = await page.locator("html").evaluate((html) => html.scrollWidth);
  expect(measured).toBeLessThanOrEqual(width);
}

test("protects a doctor deep link from an unrelated signed-in account", async ({
  page,
  backend,
}) => {
  const mock = await backend({ doctorAppointments: appointments });
  await page.goto("/doctor/appointments?day=today");
  await expect(
    page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
  ).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_appointments")).toHaveLength(0);
  await expect(page.getByText("Today Patient")).toHaveCount(0);
});

test("shows authorized clinic, separates days, filters statuses and restores dialog focus", async ({
  page,
  backend,
}) => {
  const mock = await backend({ doctorAppointments: appointments });
  fixtureDoctor(mock);
  await page.clock.setFixedTime(now);
  await page.goto("/doctor");
  await expect(page.getByRole("heading", { name: "Dr. Verified Tester" })).toBeVisible();
  const clinics = page.getByRole("region", { name: "Your clinics" });
  await expect(clinics.getByText("Test Clinic A")).toBeVisible();
  await expect(clinics.getByText("Test Clinic B")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Remaining today" }).getByText("Today Patient"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Upcoming appointments" }).getByText("Tomorrow Patient"),
  ).toBeVisible();
  await page.getByRole("link", { name: "View today’s appointments" }).click();
  await expect(page.getByText("Morning Patient")).toBeVisible();
  await expect(page.getByText("Tomorrow Patient")).toHaveCount(0);
  await page.getByLabel("Status", { exact: true }).selectOption("confirmed");
  await expect(page.getByText("Morning Patient")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "View details" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Appointment details" });
  await expect(dialog.getByText(body)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: /confirm|cancel appointment/i })).toHaveCount(0);
  // The shared session provider may read the caller's own patient profile. Never read the appointment patient's record.
  for (const call of mock.callsTo("GET", "/rest/v1/patients")) {
    expect(new URLSearchParams(call.search).get("user_id")).toBe("eq." + ids.user);
  }
  await expect(page.getByText(/patient@test\.invalid/i)).toHaveCount(0);
  await page.getByLabel("Appointment period").selectOption("all");
  await page.getByLabel("Status", { exact: true }).selectOption("");
  await page.getByLabel("Date", { exact: true }).fill("2026-11-20");
  await expect(page.getByText("Tomorrow Patient")).toBeVisible();
  await expect(page.getByText("Today Patient")).toHaveCount(0);
  expect(mock.callsTo("PATCH", "/rest/v1/appointments")).toHaveLength(0);
});

test("recovers from an appointment error and distinguishes an empty agenda", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  fixtureDoctor(mock);
  let fail = true;
  await page.route("**/rest/v1/rpc/doctor_appointments", (route) => {
    if (!fail) return route.fallback();
    return route.fulfill({ status: 503, json: { code: "PGRST000" } });
  });
  await page.goto("/doctor/appointments");
  await expect(page.getByText("We couldn't load your appointments")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No upcoming appointments", { exact: true })).toBeVisible();
  await expect(page.getByText("No past appointments", { exact: true })).toBeVisible();
});

test("validates weekly hours and allows confirmed changes at the verified clinic", async ({
  page,
  backend,
}) => {
  const mock = await backend({ schedules: [] });
  fixtureDoctor(mock);
  await page.goto("/doctor/schedule");
  await page.getByLabel("Opens", { exact: true }).fill("12:00");
  await page.getByLabel("Closes", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("alert")).toContainText("closing time");
  await page.getByLabel("Closes", { exact: true }).fill("12:10");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("alert")).toContainText("at least one appointment");
  expect(mock.callsTo("POST", "/rest/v1/doctor_schedules")).toHaveLength(0);
  await page.getByLabel("Closes", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByText("Hours saved for Monday")).toBeVisible();
  await expect(page.getByRole("list", { name: "Schedule" }).getByRole("listitem")).toHaveCount(7);
  await page.getByRole("button", { name: "Edit hours for Monday" }).click();
  await expect(page.getByLabel("Day", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Opens", { exact: true })).toHaveValue("12:00");
  await page.getByRole("button", { name: "Remove hours for Monday" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove hours for Monday" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(mock.callsTo("DELETE", "/rest/v1/doctor_schedules")).toHaveLength(0);
  await page.getByRole("button", { name: "Remove hours for Monday" }).click();
  await dialog.getByRole("button", { name: "Remove hours for Monday" }).click();
  await expect(page.getByText("Hours removed", { exact: true })).toBeVisible();
  expect(mock.callsTo("DELETE", "/rest/v1/doctor_schedules")).toHaveLength(1);
});

for (const link of [
  { state: "pending", active: true },
  { state: "verified", active: false },
]) {
  test(`blocks hours when clinic link is ${link.active ? "pending" : "inactive"}`, async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    fixtureDoctor(mock, link.state, link.active);
    await page.goto("/doctor/schedule");
    await expect(
      page.getByText(link.active ? /CareConnect verifies/ : /clinic link is inactive/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
    expect(mock.callsTo("GET", "/rest/v1/doctor_schedules")).toHaveLength(0);
  });
}

test("keeps a rejected message draft and only shows sent text after confirmation", async ({
  page,
  backend,
}) => {
  const mock = await backend({ doctorConversations: [conversation], failMessageInsert: true });
  fixtureDoctor(mock);
  await page.goto("/doctor/messages?c=not-owned");
  await expect(page.getByText("Follow-up question")).toBeVisible();
  await expect(page.getByLabel("Write a reply")).toHaveCount(0);
  await page.getByRole("button", { name: /Fixture Patient.*Clinic conversation/ }).click();
  const thread = page.getByRole("region", { name: "Fixture Patient" });
  await expect(thread.getByRole("heading")).toBeFocused();
  await expect(
    page.getByText("Private appointment messaging is currently unavailable."),
  ).toBeVisible();
  const draft = page.getByLabel("Write a reply");
  await draft.fill("Fixture reply");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(thread.getByRole("alert")).toBeVisible();
  await expect(draft).toHaveValue("Fixture reply");
  await expect(thread.locator("ol").getByText("Fixture reply", { exact: true })).toHaveCount(0);
  mock.state.failMessageInsert = false;
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(thread.locator("ol").getByText("Fixture reply", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("");
  expect(mock.callsTo("POST", "/rest/v1/rpc/send_doctor_message")).toHaveLength(0);
});

test("signing in as a different doctor cannot restore the previous doctor's draft", async ({
  page,
  backend,
}) => {
  const mock = await backend({ doctorConversations: [conversation] });
  fixtureDoctor(mock);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/doctor/messages?c=${conversation.id}`);
  const reply = page.getByRole("textbox", { name: "Write a reply" });
  await reply.fill("An unsent message from the first doctor");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/doctor\/login/);

  const secondDoctor = "00000000-0000-4000-8000-000000000012";
  mock.state.authUserId = secondDoctor;
  mock.state.authEmail = "second-doctor@test.invalid";
  mock.state.doctors[0]!["user_id"] = secondDoctor;
  mock.state.doctors[0]!["name"] = "Second Test Doctor";
  mock.state.doctorConversations = [{ ...conversation, patient_name: "Second Test Patient" }];
  await page.getByLabel("Email", { exact: true }).fill(mock.state.authEmail);
  await page.getByLabel("Password", { exact: true }).fill("a-synthetic-password");
  await page.getByRole("button", { name: "Sign in to Doctor Portal" }).click();
  await expect(page.getByRole("heading", { name: "Second Test Patient" })).toBeVisible();
  await expect(reply).toHaveValue("");
  await expect(page.getByText("Fixture Patient", { exact: true })).toHaveCount(0);
});

test("retains profile edits on rejection and waits for a confirmed save", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  fixtureDoctor(mock);
  let attempts = 0;
  await page.route("**/rest/v1/doctors?*", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    attempts++;
    if (attempts !== 1) return route.fallback();
    return route.fulfill({ status: 400, json: { code: "P0001" } });
  });
  await page.goto("/doctor/profile");
  const about = page.getByLabel("About the doctor");
  const save = page.getByRole("button", { name: "Save details" });
  await about.fill("Synthetic professional introduction");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("That change isn't allowed");
  await expect(about).toHaveValue("Synthetic professional introduction");
  await expect(page.getByText("Your details have been saved")).toHaveCount(0);
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your details have been saved" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  const changed = mock.callsTo("PATCH", "/rest/v1/doctors")[0]?.body;
  expect(changed).toMatchObject({ about: "Synthetic professional introduction" });
  expect(changed).not.toHaveProperty("registration_note");
});

test("reports a booking lock and preserves the original weekly window", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    schedules: [
      {
        id: "locked-hours",
        doctor_id: ids.doctorVerified,
        clinic_id: ids.clinicA,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "13:00",
        slot_minutes: 30,
      },
    ],
  });
  fixtureDoctor(mock);
  await page.route("**/rest/v1/doctor_schedules?*", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 400,
      json: {
        code: "P0001",
        message: "Validation Failed: A schedule with future active appointments cannot be changed.",
      },
    });
  });
  await page.goto("/doctor/schedule");
  const closes = page.getByLabel("Closes", { exact: true });
  await expect(closes).toHaveValue("13:00");
  await closes.fill("14:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Existing future appointments prevent changes",
  );
  await expect(closes).toHaveValue("14:00");
  await expect(page.getByRole("list", { name: "Schedule" })).toContainText("1:00 PM");
  await expect(page.getByText("Hours saved for Monday")).toHaveCount(0);
});

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`doctor workspace fits ${width}px`, async ({ page, backend, context }, info) => {
    const mock = await backend({
      doctorAppointments: appointments,
      doctorConversations: [conversation],
    });
    fixtureDoctor(mock);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: width === 390 ? "dark" : "light",
      reducedMotion: "reduce",
    });
    const language = width === 320 ? "ta" : width === 375 ? "ur" : "en";
    await context.addCookies([
      { name: "cc_lang", value: language, url: info.project.use.baseURL! },
    ]);
    await page.clock.setFixedTime(now);
    for (const route of ["", "/appointments", "/schedule", "/profile", "/messages"]) {
      await page.goto("/doctor" + route);
      await expect(page.getByRole("main")).toBeVisible();
      if (route === "") await expect(page.getByText("Today Patient")).toBeVisible();
      if (route === "/appointments") await expect(page.getByText("Today Patient")).toBeVisible();
      if (route === "/schedule")
        await expect(page.getByText("Test Clinic A", { exact: true })).toBeVisible();
      if (route === "/profile")
        await expect(page.getByText("Test Clinic A", { exact: true })).toBeVisible();
      if (route === "/messages")
        await expect(page.getByText("Fixture Patient", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        language === "ur" ? "ur" : language + "-IN",
      );
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ur" ? "rtl" : "ltr");
      if (width === 390) await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await noOverflow(page, width);
      if (width <= 390 || width === 1440) {
        await page.screenshot({
          path: info.outputPath(`${width}-${language}-${route.slice(1) || "dashboard"}.png`),
        });
      }
    }
  });
}
