import type { Page, Request, Route } from "@playwright/test";

/**
 * In-test stand-in for the Supabase backend, used to exercise signed-in flows without any
 * production account or data. Every request to *.supabase.co (REST, RPC, Auth and the realtime
 * websocket) is answered here; nothing is forwarded to a real project. Requests the mock does
 * not understand are answered with 501 and recorded in `unhandled` so tests can fail on them.
 *
 * All fixture records below are synthetic and exist only inside the test process.
 */

export const PROJECT_REF = "bqijgbmhlwtslhrtszsj";

export const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  patient: "00000000-0000-4000-8000-000000000002",
  clinicA: "00000000-0000-4000-8000-0000000000a1",
  clinicB: "00000000-0000-4000-8000-0000000000b1",
  doctorVerified: "00000000-0000-4000-8000-0000000000d1",
  doctorPending: "00000000-0000-4000-8000-0000000000d2",
  appointment: "00000000-0000-4000-8000-0000000000e1",
  conversation: "00000000-0000-4000-8000-0000000000c1",
};

export const TEST_EMAIL = "patient@test.invalid";
export const TEST_NAME = "Test Patient";

type Row = Record<string, unknown>;

export interface MockState {
  patients: Row[] | "error";
  memberships: Row[] | "error";
  clinics: Row[];
  doctors: Row[];
  appointments: Row[] | "error";
  conversations: Row[] | "error";
  slots: Row[];
  bookResult: { status: number; body: unknown } | null;
  failMessageInsert: boolean;
  failStatusUpdate: boolean;
  /** Overrides /auth/v1/token (sign-in and refresh) and /auth/v1/signup responses. */
  tokenResponse: { status: number; body: unknown } | null;
  signupResponse: { status: number; body: unknown } | null;
  /** Rows returned for doctor requests that carry filters (searches), and an optional delay. */
  doctorSearch: Row[] | null;
  doctorSearchDelayMs: number;
  /** Artificial latency per table or RPC path segment, e.g. { clinic_memberships: 800 }. */
  delays: Record<string, number>;
}

export interface MockBackend {
  state: MockState;
  calls: { method: string; path: string; search: string; body: unknown }[];
  unhandled: string[];
  callsTo: (method: string, pathFragment: string) => MockBackend["calls"];
}

const clinic = (id: string, name: string, area: string): Row => ({
  id,
  name,
  address: `1 Test Street, ${area}`,
  area,
  phone: "+91 00000 00000",
  email: "clinic@test.invalid",
  about: "Synthetic clinic used by automated tests.",
  specialty_ids: ["general"],
  services: [],
  facilities: [],
  languages: ["English"],
  opening_hours: [],
  fee_range: [300, 600],
  rating: null,
  review_count: 0,
  photo_tone: null,
  is_demo: true,
  lat: null,
  lng: null,
  created_at: "2026-01-01T00:00:00Z",
});

const doctor = (id: string, name: string, clinicId: string, verified: boolean): Row => ({
  id,
  name,
  gender: "female",
  experience_years: 5,
  consultation_fee: 400,
  about: "Synthetic doctor used by automated tests.",
  specialty_id: "general",
  qualifications: ["MBBS"],
  languages: ["English"],
  services: [],
  rating: null,
  review_count: 0,
  registration_note: null,
  is_demo: true,
  user_id: null,
  created_at: "2026-01-01T00:00:00Z",
  clinic_doctors: [
    { clinic_id: clinicId, active: true, verification_state: verified ? "verified" : "pending" },
  ],
});

export function defaultState(): MockState {
  return {
    patients: [
      {
        id: ids.patient,
        user_id: ids.user,
        full_name: TEST_NAME,
        date_of_birth: null,
        gender: null,
        preferred_language: null,
        area: null,
        saved_doctor_ids: [],
        saved_clinic_ids: [],
        is_demo: false,
        created_at: "2026-01-01T00:00:00Z",
        user: { email: TEST_EMAIL, phone: null },
      },
    ],
    memberships: [],
    clinics: [
      clinic(ids.clinicA, "Test Clinic A", "Adyar"),
      clinic(ids.clinicB, "Test Clinic B", "OMR"),
    ],
    doctors: [
      doctor(ids.doctorVerified, "Dr. Verified Tester", ids.clinicA, true),
      doctor(ids.doctorPending, "Dr. Pending Tester", ids.clinicB, false),
    ],
    appointments: [],
    conversations: [],
    slots: [
      { slot_time: "09:00:00", available: false },
      { slot_time: "09:30:00", available: true },
      { slot_time: "18:30:00", available: true },
    ],
    bookResult: null,
    failMessageInsert: false,
    failStatusUpdate: false,
    tokenResponse: null,
    signupResponse: null,
    doctorSearch: null,
    doctorSearchDelayMs: 0,
    delays: {},
  };
}

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** A syntactically valid, unsigned JWT. The mock never verifies it; production would reject it. */
export function fakeAccessToken() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({
    sub: ids.user,
    role: "authenticated",
    aud: "authenticated",
    email: TEST_EMAIL,
    exp,
  })}.test-signature`;
}

function sessionPayload(expired = false) {
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  return {
    access_token: fakeAccessToken(),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "test-refresh-token",
    user: {
      id: ids.user,
      aud: "authenticated",
      role: "authenticated",
      email: TEST_EMAIL,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: TEST_NAME },
      identities: [],
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

const serverError = { code: "XX000", message: "simulated server failure", details: "", hint: "" };

/**
 * Installs the mock on `page`. With `signedIn`, a session is placed in localStorage before the
 * app boots, exactly where supabase-js stores a real one.
 */
export async function mockBackend(
  page: Page,
  {
    signedIn = true,
    expiredSession = false,
    state: overrides = {},
  }: { signedIn?: boolean; expiredSession?: boolean; state?: Partial<MockState> } = {},
): Promise<MockBackend> {
  const state: MockState = { ...defaultState(), ...overrides };
  const backend: MockBackend = {
    state,
    calls: [],
    unhandled: [],
    callsTo: (method, fragment) =>
      backend.calls.filter((c) => c.method === method && c.path.includes(fragment)),
  };

  if (signedIn) {
    const session = sessionPayload(expiredSession);
    await page.addInitScript(
      ([key, value]) => {
        // Only seed once per test, so a sign-out inside the test is not undone on reload.
        if (!sessionStorage.getItem("__mock_seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("__mock_seeded", "1");
        }
      },
      [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(session)] as const,
    );
  }

  // Realtime: accept the socket but never connect it to anything.
  await page.routeWebSocket(/supabase\.co/, () => {});

  await page.route(/https:\/\/[^/]*supabase\.co\//, async (route: Route, request: Request) => {
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    backend.calls.push({ method, path: url.pathname, search: url.search, body });

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders() });

    const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const respond = (rows: Row[] | "error") => {
      if (rows === "error") return json(route, 500, serverError);
      if (wantsObject) {
        return rows.length ? json(route, 200, rows[0]) : json(route, 406, { code: "PGRST116" });
      }
      return json(route, 200, rows);
    };

    const path = url.pathname;

    // ---- Auth
    if (path === "/auth/v1/user") return json(route, 200, sessionPayload().user);
    if (path === "/auth/v1/token") {
      if (state.tokenResponse) {
        return json(route, state.tokenResponse.status, state.tokenResponse.body);
      }
      return json(route, 200, sessionPayload());
    }
    if (path === "/auth/v1/signup" && state.signupResponse) {
      return json(route, state.signupResponse.status, state.signupResponse.body);
    }
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers: corsHeaders() });
    if (path === "/auth/v1/recover") return json(route, 200, {});

    // ---- RPC
    if (path === "/rest/v1/rpc/get_doctor_slots") return json(route, 200, state.slots);
    if (path === "/rest/v1/rpc/book_appointment") {
      if (state.bookResult) return json(route, state.bookResult.status, state.bookResult.body);
      const args = (body ?? {}) as Row;
      const created = {
        id: ids.appointment,
        patient_id: ids.patient,
        doctor_id: args["p_doctor_id"],
        clinic_id: args["p_clinic_id"],
        date: args["p_date"],
        time: args["p_time"],
        status: "pending",
        reason: args["p_reason"] ?? null,
        fee: 400,
        created_at: new Date().toISOString(),
      };
      if (Array.isArray(state.appointments)) state.appointments.push(created);
      return json(route, 200, created);
    }
    if (path.startsWith("/rest/v1/rpc/toggle_saved_")) return json(route, 200, []);

    // ---- Tables
    const table = path.replace("/rest/v1/", "");
    const delay = state.delays[table];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    switch (table) {
      case "clinics":
        return respond(state.clinics);
      case "doctors": {
        const filtered = [...url.searchParams.keys()].some(
          (k) => !["select", "order", "limit"].includes(k),
        );
        if (filtered && state.doctorSearch) {
          if (state.doctorSearchDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, state.doctorSearchDelayMs));
          }
          return respond(state.doctorSearch);
        }
        return respond(state.doctors);
      }
      case "clinic_doctors":
        return respond([]);
      case "patients": {
        if (method === "PATCH" && Array.isArray(state.patients)) {
          const row = state.patients[0];
          if (row) Object.assign(row, body as Row);
          return respond(row ? [row] : []);
        }
        return respond(state.patients);
      }
      case "clinic_memberships":
        return respond(state.memberships);
      case "appointments": {
        if (method === "PATCH") {
          if (state.failStatusUpdate || !Array.isArray(state.appointments)) {
            return json(route, 400, {
              code: "P0001",
              message: "Terminal states cannot be modified",
              details: "",
              hint: "",
            });
          }
          const id = url.searchParams.get("id")?.replace("eq.", "");
          const row = state.appointments.find((a) => a["id"] === id);
          if (!row) return json(route, 406, { code: "PGRST116" });
          Object.assign(row, body as Row);
          return respond([row]);
        }
        return respond(state.appointments);
      }
      case "conversations": {
        if (method === "POST") {
          const created = {
            id: ids.conversation,
            ...(body as Row),
            created_at: new Date().toISOString(),
            unread_for_patient: 0,
            unread_for_clinic: 0,
            messages: [],
            patients: { full_name: TEST_NAME, user_id: ids.user },
          };
          if (Array.isArray(state.conversations)) state.conversations.push(created);
          return respond([created]);
        }
        return respond(state.conversations);
      }
      case "messages": {
        if (method === "POST") {
          if (state.failMessageInsert) return json(route, 500, serverError);
          const created = {
            id: `m-${Date.now()}`,
            ...(body as Row),
            created_at: new Date().toISOString(),
          };
          const conversations = Array.isArray(state.conversations) ? state.conversations : [];
          const conversation = conversations.find(
            (c) => c["id"] === (body as Row)["conversation_id"],
          );
          (conversation?.["messages"] as Row[] | undefined)?.push(created);
          return respond([created]);
        }
        return respond([]);
      }
    }

    backend.unhandled.push(`${method} ${path}${url.search}`);
    return json(route, 501, { message: "unhandled by mock backend" });
  });

  return backend;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
}

/** A conversation fixture as returned by the app's conversations query. */
export function conversationRow(messages: { from: "patient" | "clinic"; body: string }[]): Row {
  return {
    id: ids.conversation,
    clinic_id: ids.clinicA,
    patient_id: ids.patient,
    doctor_id: null,
    appointment_id: null,
    kind: "general",
    unread_for_patient: 0,
    unread_for_clinic: 0,
    created_at: "2026-01-01T00:00:00Z",
    patients: { full_name: TEST_NAME, user_id: ids.user },
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      conversation_id: ids.conversation,
      sender_id: m.from === "patient" ? ids.user : "00000000-0000-4000-8000-0000000000ff",
      body: m.body,
      created_at: new Date(Date.UTC(2026, 0, 1, 4, i)).toISOString(),
    })),
  };
}

/** An appointment row fixture. */
export function appointmentRow(overrides: Row = {}): Row {
  return {
    id: ids.appointment,
    patient_id: ids.patient,
    doctor_id: ids.doctorVerified,
    clinic_id: ids.clinicA,
    date: "2099-01-05",
    time: "19:30:00",
    status: "pending",
    reason: "Routine check",
    fee: 400,
    created_at: "2026-01-01T00:00:00Z",
    patients: { full_name: TEST_NAME },
    ...overrides,
  };
}
