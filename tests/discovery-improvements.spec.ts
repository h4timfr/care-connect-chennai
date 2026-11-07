import { expect, test } from "./support/fixtures";
import { defaultState, enablePatientContact, ids } from "./support/mock-backend";

test("complete catalogs can open providers beyond the first page and disclose displayed limits", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  const clinic = state.clinics[0]!;
  const doctor = state.doctors[0]!;
  state.clinics = Array.from({ length: 501 }, (_, i) => ({
    ...clinic,
    id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Clinic ${String(i).padStart(4, "0")}`,
  }));
  state.doctors = Array.from({ length: 501 }, (_, i) => ({
    ...doctor,
    id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Doctor ${String(i).padStart(4, "0")}`,
  }));
  const mock = await backend(state, { signedIn: false });
  await page.goto("/discover");
  await expect(
    page.getByText("Showing the first 100 — refine your search to narrow it down."),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Doctors", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Clinics", exact: true }).click();
  await expect(
    page.getByText("Showing the first 100 — refine your search to narrow it down."),
  ).toBeVisible();
  expect(
    mock.callsTo("GET", "/rest/v1/clinics").some((call) => call.search.includes("offset=500")),
  ).toBe(true);
  expect(
    mock.callsTo("GET", "/rest/v1/doctors").some((call) => call.search.includes("offset=500")),
  ).toBe(true);
  await page.goto(`/doctors/${state.doctors[500]!["id"]}`);
  await expect(page.getByRole("heading", { name: "Doctor 0500" })).toBeVisible();
});

test("incomplete catalog responses show an error and can recover", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  let broken = true;
  await page.route("**/rest/v1/clinics?*", async (route) => {
    if (broken) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range",
          "content-range": "0--1/1",
        },
        body: "[]",
      });
    } else await route.fallback();
  });
  await page.goto("/discover");
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  broken = false;
  await retry.click();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester" })).toBeVisible();
});

test("long provider details fit at representative widths and remain keyboard reachable", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  enablePatientContact(state, ids.clinicA, true);
  const name = "SyntheticDoctor".repeat(10);
  state.doctors[0]!["name"] = name;
  state.doctors[0]!["about"] = "SyntheticDetails".repeat(20);
  state.doctors[0]!["qualifications"] = ["SyntheticQualification".repeat(10)];
  await backend(state, { signedIn: false });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/discover");
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

test("clinic cards do not show an empty phone field", async ({ page, backend }) => {
  const state = defaultState();
  enablePatientContact(state, ids.clinicA, true);
  await backend(state, { signedIn: false });
  await page.goto("/discover?tab=clinics");
  const card = page.locator("article").filter({ hasText: "Test Clinic A" });
  await expect(card).toBeVisible();
  await expect(card.locator("dt").filter({ hasText: "Phone" })).toHaveCount(0);
});

test("discovery slot selection preserves doctor, clinic and date through booking", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  enablePatientContact(state, ids.clinicA, true);
  const mock = await backend(state);
  await page.goto("/discover");
  await page.getByRole("link", { name: "Dr. Verified Tester", exact: true }).click();
  await page.getByRole("button", { name: "9:30 AM", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/book/${ids.doctorVerified}`));
  await expect(page.getByRole("button", { name: "9:30 AM", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  await page.getByRole("button", { name: "Request appointment" }).dblclick();
  await expect(page).toHaveURL(new RegExp(`/appointments/${ids.appointment}$`));
  const calls = mock.callsTo("POST", "/rest/v1/rpc/book_appointment");
  expect(calls).toHaveLength(1);
  expect(calls[0]?.body).toMatchObject({
    p_doctor_id: ids.doctorVerified,
    p_clinic_id: ids.clinicA,
    p_date: today,
    p_time: "09:30:00",
  });
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/doctors/${ids.doctorVerified}`));
});
