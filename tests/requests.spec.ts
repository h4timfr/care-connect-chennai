import { test, expect } from "./support/fixtures";
import {
  appointmentRow,
  conversationRow,
  enablePatientContact,
  ids,
  mockBackend,
} from "./support/mock-backend";

// Request budget per route on a cold load (mocked backend, signed in as a clinic member so every
// route renders its full content). Guards against duplicate fetches and data loaded globally
// for pages that don't show it.

const ACCOUNT = ["patients", "clinic_memberships"];
const SHARED = ["clinics", "doctors", ...ACCOUNT];

const EXPECTED: Record<string, string[]> = {
  "/": [...SHARED, "appointments"],
  "/discover": SHARED,
  [`/doctors/${ids.doctorVerified}`]: [...SHARED, "rpc/get_doctor_slots"],
  [`/clinics/${ids.clinicA}`]: SHARED,
  [`/book/${ids.doctorVerified}`]: [...SHARED, "rpc/get_doctor_slots"],
  "/appointments": [...SHARED, "appointments"],
  [`/appointments/${ids.appointment}`]: [
    ...SHARED,
    "appointments",
    "rpc/can_message_assigned_doctor",
  ],
  "/messages": [
    ...ACCOUNT,
    "conversations",
    "rpc/doctor_message_inbox",
    "rpc/patient_conversation_clinics",
  ],
  "/profile": SHARED,
  "/reset-password": ACCOUNT,
  "/clinic": [
    ...SHARED,
    "appointments",
    "clinic_doctors",
    "doctor_schedules",
    "rpc/list_doctor_clinic_link_requests",
  ],
  "/clinic/appointments": [...SHARED, "appointments"],
  "/clinic/calendar": [...SHARED, "appointments", "clinic_doctors", "doctor_schedules"],
  "/clinic/patients": [...ACCOUNT, "appointments"],
  "/clinic/doctors": [
    ...SHARED,
    "clinic_doctors",
    "doctor_schedules",
    "rpc/list_doctor_clinic_link_requests",
  ],
  "/clinic/messages": [...SHARED, "conversations"],
  "/clinic/profile": [
    ...ACCOUNT,
    "clinic_doctors",
    "doctor_schedules",
    "rpc/get_my_clinic_contacts",
  ],
};

test("each route requests only what it shows, once", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await mockBackend(page, {
    state: {
      appointments: [appointmentRow()],
      conversations: [conversationRow([{ from: "clinic", body: "Hello" }])],
    },
  });
  mock.state.memberships = [
    {
      clinic_id: ids.clinicA,
      role: "clinic_admin",
      active: true,
      clinics: mock.state.clinics[0],
    },
  ];
  enablePatientContact(mock.state, ids.clinicA, true);

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
  expect(
    mock.callsTo("POST", "/rest/v1/rpc/patient_conversation_clinics").map((call) => call.body),
  ).toEqual([{ p_conversation_ids: [ids.conversation] }]);
  // Verify the stored identity once per document before loading private data.
  expect(mock.callsTo("GET", "/auth/v1/user")).toHaveLength(Object.keys(EXPECTED).length);
  expect(mock.callsTo("POST", "/auth/v1/token")).toEqual([]);
});

test("the inbox defers both catalogues until the patient navigates to discovery", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    conversations: [conversationRow([{ from: "clinic", body: "Synthetic historical reply" }])],
  });
  enablePatientContact(mock.state, ids.clinicA);
  await page.goto("/messages");
  await expect(page.getByText("Synthetic historical reply", { exact: true })).toBeVisible();
  expect(mock.callsTo("GET", "/rest/v1/clinics")).toHaveLength(0);
  expect(mock.callsTo("GET", "/rest/v1/doctors")).toHaveLength(0);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Find doctors", exact: true })
    .click();
  await expect(page.getByRole("link", { name: "Dr. Verified Tester" })).toBeVisible();
  expect(mock.callsTo("GET", "/rest/v1/clinics")).toHaveLength(1);
  expect(mock.callsTo("GET", "/rest/v1/doctors")).toHaveLength(1);
});

test("public listings request safe columns and preserve publication filters", async ({ page }) => {
  const mock = await mockBackend(page, { signedIn: false });
  await page.goto("/discover");
  await page.waitForLoadState("networkidle");
  await page.fill("#discover-search", "adyar");
  await expect.poll(() => mock.callsTo("GET", "/rest/v1/doctors").length).toBe(2);
  const doctorCalls = mock.callsTo("GET", "/rest/v1/doctors");
  const clinicCalls = mock.callsTo("GET", "/rest/v1/clinics");
  expect(clinicCalls.length).toBeGreaterThan(0);
  for (const call of [...doctorCalls, ...clinicCalls]) {
    const params = new URLSearchParams(call.search);
    const select = params.get("select") ?? "";
    expect(select).not.toMatch(/(^|[,(])\s*\*\s*(?=[,)]|$)/);
    expect(select).not.toContain("user_id");
    expect(select).not.toMatch(/(^|[,(])\s*(?:phone|email)\s*(?=[,)]|$)/);
    expect(params.get("is_demo")).toBe("eq.false");
  }
  for (const call of clinicCalls) {
    const params = new URLSearchParams(call.search);
    expect(params.get("clinic_verification_state")).toBe("eq.verified");
    expect(params.get("is_published")).toBe("eq.true");
  }
  for (const call of doctorCalls) {
    const params = new URLSearchParams(call.search);
    const select = params.get("select") ?? "";
    expect(select).toContain("clinic_doctors!inner(");
    expect(select).toContain("clinics!inner(");
    expect(params.get("clinic_doctors.active")).toBe("eq.true");
    expect(params.get("clinic_doctors.verification_state")).toBe("eq.verified");
    expect(params.get("clinic_doctors.clinics.clinic_verification_state")).toBe("eq.verified");
    expect(params.get("clinic_doctors.clinics.is_published")).toBe("eq.true");
  }
});
