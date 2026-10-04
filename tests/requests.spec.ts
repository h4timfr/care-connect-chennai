import { test, expect } from "@playwright/test";
import { appointmentRow, conversationRow, ids, mockBackend } from "./support/mock-backend";

// Request budget per route on a cold load (mocked backend, signed in as a clinic member so every
// route renders its full content). Guards against duplicate fetches and data loaded globally
// for pages that don't show it.

const SHARED = ["clinics", "doctors", "patients", "clinic_memberships"];

const EXPECTED: Record<string, string[]> = {
  "/": [...SHARED, "appointments"],
  "/discover": SHARED,
  [`/doctors/${ids.doctorVerified}`]: [...SHARED, "rpc/get_doctor_slots"],
  [`/clinics/${ids.clinicA}`]: SHARED,
  [`/book/${ids.doctorVerified}`]: [...SHARED, "rpc/get_doctor_slots"],
  "/appointments": [...SHARED, "appointments"],
  [`/appointments/${ids.appointment}`]: [...SHARED, "appointments"],
  "/messages": [...SHARED, "conversations"],
  "/profile": SHARED,
  "/reset-password": ["patients", "clinic_memberships"],
  "/clinic": [...SHARED, "appointments"],
  "/clinic/appointments": [...SHARED, "appointments"],
  "/clinic/calendar": [...SHARED, "appointments"],
  "/clinic/patients": [...SHARED, "appointments"],
  "/clinic/doctors": SHARED,
  "/clinic/messages": [...SHARED, "conversations"],
  "/clinic/profile": SHARED,
};

test("each route requests only what it shows, once", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await mockBackend(page, {
    state: {
      appointments: [appointmentRow()],
      conversations: [conversationRow([{ from: "clinic", body: "Hello" }])],
    },
  });
  mock.state.memberships = [{ clinic_id: ids.clinicA, clinics: mock.state.clinics[0] }];

  const actual: Record<string, string[]> = {};
  for (const route of Object.keys(EXPECTED)) {
    const before = mock.calls.length;
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    actual[route] = mock.calls
      .slice(before)
      .filter((c) => c.path.startsWith("/rest/v1/"))
      .map((c) => c.path.replace("/rest/v1/", ""))
      .sort();
  }
  const expected = Object.fromEntries(
    Object.entries(EXPECTED).map(([route, calls]) => [route, [...calls].sort()]),
  );
  expect(actual).toEqual(expected);
  // A valid stored session is used as-is: no auth-server round trips on page loads.
  expect(mock.calls.filter((c) => c.path.startsWith("/auth/v1/"))).toEqual([]);
});

test("public listings request explicit columns only", async ({ page }) => {
  const mock = await mockBackend(page, { signedIn: false });
  await page.goto("/discover");
  await page.waitForLoadState("networkidle");
  await page.fill("#discover-search", "adyar");
  await expect.poll(() => mock.callsTo("GET", "/rest/v1/doctors").length).toBe(2);
  for (const call of [
    ...mock.callsTo("GET", "/rest/v1/doctors"),
    ...mock.callsTo("GET", "/rest/v1/clinics"),
  ]) {
    const select = new URLSearchParams(call.search).get("select") ?? "";
    expect(select).not.toMatch(/(^|,)\*($|,)/);
    expect(select).not.toContain("user_id");
  }
});
