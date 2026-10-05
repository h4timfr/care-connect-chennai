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
  /**
   * Simulates a concurrent creation: the next conversation insert is rejected by the unique
   * index (23505) and this row appears, as if another request had just created it.
   */
  concurrentConversation: Row | null;
  /** Tables whose reads fail with a server error (e.g. ["doctors"]). */
  failTables: string[];
  /**
   * Profile photo storage: "none" (no photo yet), "photo" (one exists), "noBucket" (the avatars
   * bucket isn't set up), "noPolicies" (a bucket without migration 00053's policies: reads find
   * nothing and every write is refused by RLS) or "error" (storage failing).
   */
  avatar: "none" | "photo" | "noBucket" | "noPolicies" | "error";
  /** Makes the next avatar upload fail with a storage error. */
  failAvatarUpload: boolean;
  /** Content types of avatar uploads received, in order. */
  avatarUploads: string[];
  /**
   * Provider onboarding (migration 00054). "notDeployed" answers like a backend without the
   * migration: missing table/functions (PGRST205/PGRST202) and, for user_roles, 42P17.
   */
  platformAdmin: boolean | "notDeployed";
  applications: Row[] | "notDeployed";
  proposeDeployed: boolean;
  schedules: Row[];
  /** Emails of existing accounts, for admin_add_clinic_member. */
  knownEmails: string[];
  /**
   * Doctor portal (migration 00055). A doctor is a doctors row whose user_id is the signed-in
   * account (set a row's user_id to ids.user). The RPCs return what doctor_appointments() and
   * doctor_conversations() would for that doctor; "notDeployed" answers PGRST202.
   */
  doctorAppointments: Row[] | "notDeployed";
  doctorConversations: Row[] | "notDeployed";
  doctorApplications: Row[] | "notDeployed";
  /**
   * Private provider-candidate review (migration 00056). Visible to platform admins only;
   * "notDeployed" answers PGRST205. Use candidateFixtures() for synthetic records.
   */
  candidates: CandidateState | "notDeployed";
}

export interface CandidateState {
  facilities: Row[];
  doctors: Row[];
  relationships: Row[];
  sources: Row[];
  evidence: Row[];
  contacts: Row[];
}

export const candidateIds = {
  facilityA: "00000000-0000-4000-8000-00000000c0a1",
  facilityB: "00000000-0000-4000-8000-00000000c0b1",
  doctorA: "00000000-0000-4000-8000-00000000d0a1",
  relationshipA: "00000000-0000-4000-8000-00000000e0a1",
};

/** Synthetic research candidates for UI tests. Not real providers; example.invalid sources. */
export function candidateFixtures(): CandidateState {
  const base = {
    review_status: "candidate",
    permission_status: "unknown",
    booking_enabled: false,
    notes: null,
    researched_on: "2026-10-01",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  return {
    facilities: [
      {
        ...base,
        id: candidateIds.facilityA,
        research_id: "CLINIC-901",
        name: "Test Candidate Facility Adyar",
        facility_type: "Multispecialty clinic",
        address: "1 Test Street, Adyar",
        locality: "Adyar",
        website: "https://example.invalid/facility-a",
        specialties: ["General Medicine"],
        source_confidence: "medium",
        unresolved_issues: ["Two address formulations found for this branch"],
      },
      {
        ...base,
        id: candidateIds.facilityB,
        research_id: "CLINIC-902",
        name: "Test Candidate Facility Guindy",
        facility_type: "Hospital",
        address: null,
        locality: "Guindy",
        website: null,
        specialties: [],
        source_confidence: "high",
        unresolved_issues: [],
      },
    ],
    doctors: [
      {
        ...base,
        id: candidateIds.doctorA,
        research_id: "DOCTOR-901",
        full_name: "Test Candidate Doctor",
        specialty: "General Medicine",
        qualifications: "MBBS",
        registration_info: null,
        registration_status: "not_verified",
        source_confidence: "medium",
        unresolved_issues: [],
      },
    ],
    relationships: [
      {
        id: candidateIds.relationshipA,
        doctor_candidate_id: candidateIds.doctorA,
        facility_candidate_id: candidateIds.facilityA,
        research_status: "POSSIBLE_NEEDS_CONFIRMATION",
        confidence: "low",
        unresolved_issues: ["Listed only on a directory page"],
        careconnect_status: "unverified",
        notes: null,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    sources: [
      {
        id: "src-1",
        facility_candidate_id: candidateIds.facilityA,
        doctor_candidate_id: null,
        relationship_id: null,
        url: "https://example.invalid/facility-a/about",
        source_type: "official_facility",
        supports: "Facility name and address",
        researched_on: "2026-10-01",
        confidence: "medium",
        origin: "research",
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "src-2",
        facility_candidate_id: null,
        doctor_candidate_id: null,
        relationship_id: candidateIds.relationshipA,
        url: "https://example.invalid/directory/doctor",
        source_type: "directory",
        supports: "Doctor listed at this facility",
        researched_on: "2026-10-01",
        confidence: "low",
        origin: "research",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    evidence: [],
    contacts: [],
  };
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
    concurrentConversation: null,
    failTables: [],
    avatar: "none",
    failAvatarUpload: false,
    avatarUploads: [],
    platformAdmin: false,
    applications: [],
    proposeDeployed: true,
    schedules: [],
    knownEmails: [TEST_EMAIL, "staff@test.invalid"],
    doctorAppointments: [],
    doctorConversations: [],
    doctorApplications: [],
    candidates: {
      facilities: [],
      doctors: [],
      relationships: [],
      sources: [],
      evidence: [],
      contacts: [],
    },
  };
}

/** A 1x1 PNG, served as the stored profile photo. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

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
        // (Storage is unavailable on about:blank, e.g. after going back past the first page.)
        try {
          if (!sessionStorage.getItem("__mock_seeded")) {
            localStorage.setItem(key, value);
            sessionStorage.setItem("__mock_seeded", "1");
          }
        } catch {
          // not an app origin
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

    // ---- Storage (profile photos; the bucket and path rules mirror migration 00053)
    if (path.startsWith("/storage/v1/")) {
      const avatarPath = `${ids.user}/avatar`;
      const storageError = (status: number, error: string, message: string) =>
        json(route, status, { statusCode: String(status), error, message });
      if (state.avatar === "noBucket")
        return storageError(400, "Bucket not found", "Bucket not found");
      if (state.avatar === "error")
        return storageError(500, "internal", "simulated storage failure");
      if (path === `/storage/v1/object/sign/avatars/${avatarPath}`) {
        if (state.avatar !== "photo") return storageError(400, "not_found", "Object not found");
        if (method === "GET") {
          return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
        }
        return json(route, 200, {
          signedURL: `/object/sign/avatars/${avatarPath}?token=test-token-${state.avatarUploads.length}`,
        });
      }
      // Any other account's object: storage RLS hides it, which the API reports as not found.
      if (path.startsWith("/storage/v1/object/sign/")) {
        return storageError(400, "not_found", "Object not found");
      }
      if (
        path === `/storage/v1/object/avatars/${avatarPath}` &&
        (method === "POST" || method === "PUT")
      ) {
        if (state.avatar === "noPolicies") {
          return storageError(403, "Unauthorized", "new row violates row-level security policy");
        }
        if (state.failAvatarUpload) {
          state.failAvatarUpload = false;
          return storageError(500, "internal", "simulated upload failure");
        }
        // storage-js sends a Blob as multipart form data; the file part carries the image type.
        const header = request.headers()["content-type"] ?? "";
        const partType = header.startsWith("multipart/")
          ? /content-type:\s*([^\r\n]+)/i.exec(
              request.postDataBuffer()?.toString("latin1") ?? "",
            )?.[1]
          : header;
        state.avatarUploads.push(partType?.trim() ?? "");
        state.avatar = "photo";
        return json(route, 200, { Key: `avatars/${avatarPath}`, Id: "test-object" });
      }
      if (path === "/storage/v1/object/avatars" && method === "DELETE") {
        const removed = state.avatar === "photo" ? [{ name: avatarPath }] : [];
        state.avatar = "none";
        return json(route, 200, removed);
      }
    }

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

    // ---- Provider onboarding RPCs (rules mirror migration 00054)
    const args = (body ?? {}) as Row;
    const pgError = (status: number, code: string, message: string) =>
      json(route, status, { code, message, details: "", hint: "" });
    const notFoundFn = () => pgError(404, "PGRST202", "Could not find the function");
    if (path === "/rest/v1/rpc/withdraw_provider_application") {
      if (state.applications === "notDeployed") return notFoundFn();
      const app = state.applications.find((a) => a["id"] === args["p_application_id"]);
      if (!app || app["status"] !== "submitted") {
        return pgError(400, "P0001", "Validation Failed: that application cannot be withdrawn.");
      }
      app["status"] = "withdrawn";
      return route.fulfill({ status: 204, headers: corsHeaders() });
    }
    if (path === "/rest/v1/rpc/admin_review_provider_application") {
      if (state.applications === "notDeployed") return notFoundFn();
      if (state.platformAdmin !== true) {
        return pgError(403, "42501", "Unauthorized: platform admins only.");
      }
      const app = state.applications.find((a) => a["id"] === args["p_application_id"]);
      if (!app || app["status"] !== "submitted") {
        return pgError(400, "P0001", "Validation Failed: that application is not awaiting review.");
      }
      const approve = args["p_approve"] === true;
      app["status"] = approve ? "approved" : "rejected";
      app["review_note"] = args["p_note"] ?? null;
      app["clinic_id"] = approve ? "00000000-0000-4000-8000-0000000000a9" : null;
      return json(route, 200, app["clinic_id"]);
    }
    if (path === "/rest/v1/rpc/admin_add_clinic_member") {
      if (state.platformAdmin !== true) {
        return pgError(403, "42501", "Unauthorized: platform admins only.");
      }
      const email = String(args["p_email"] ?? "").toLowerCase();
      if (!state.knownEmails.includes(email)) {
        return pgError(
          400,
          "P0001",
          "Validation Failed: no CareConnect account uses that email address.",
        );
      }
      if (Array.isArray(state.memberships)) {
        const clinic = state.clinics.find((c) => c["id"] === args["p_clinic_id"]);
        state.memberships.push({
          id: "mem-" + (state.memberships.length + 1),
          clinic_id: args["p_clinic_id"],
          role: args["p_role"],
          active: true,
          user: { email },
          clinic: { name: clinic?.["name"] ?? "" },
          clinics: clinic,
        });
      }
      return json(route, 200, "mem-new");
    }
    if (path === "/rest/v1/rpc/doctor_appointments") {
      if (state.doctorAppointments === "notDeployed") return notFoundFn();
      return json(route, 200, state.doctorAppointments);
    }
    if (path === "/rest/v1/rpc/doctor_conversations") {
      if (state.doctorConversations === "notDeployed") return notFoundFn();
      return json(route, 200, state.doctorConversations);
    }
    if (path === "/rest/v1/rpc/admin_review_doctor_application") {
      if (state.doctorApplications === "notDeployed") return notFoundFn();
      if (state.platformAdmin !== true) {
        return pgError(403, "42501", "Unauthorized: platform admins only.");
      }
      const app = state.doctorApplications.find((a) => a["id"] === args["p_application_id"]);
      if (!app || app["status"] !== "submitted") {
        return pgError(400, "P0001", "Validation Failed: that application is not awaiting review.");
      }
      app["status"] = args["p_approve"] === true ? "approved" : "rejected";
      app["review_note"] = args["p_note"] ?? null;
      return json(
        route,
        200,
        args["p_approve"] === true ? "00000000-0000-4000-8000-0000000000fd" : null,
      );
    }
    if (path === "/rest/v1/rpc/clinic_propose_doctor") {
      if (!state.proposeDeployed) return notFoundFn();
      const id = "00000000-0000-4000-8000-0000000000f" + state.doctors.length;
      state.doctors.push({
        ...doctor(id, String(args["p_name"]), String(args["p_clinic_id"]), false),
        specialty_id: args["p_specialty_id"],
        registration_note: args["p_registration_note"],
        is_demo: false,
      });
      return json(route, 200, id);
    }

    // ---- Tables
    const table = path.replace("/rest/v1/", "");
    const delay = state.delays[table];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (method === "GET" && state.failTables.includes(table)) return json(route, 500, serverError);
    switch (table) {
      case "clinics":
        return respond(state.clinics);
      case "doctors": {
        const userFilter = url.searchParams.get("user_id")?.replace(/^eq\./, "");
        if (userFilter) {
          // RLS: only the signed-in account's own doctor row is returned for this lookup.
          const own = state.doctors
            .filter((d) => d["user_id"] === userFilter && userFilter === ids.user)
            .map((d) => ({
              ...d,
              clinic_doctors: ((d["clinic_doctors"] as Row[] | undefined) ?? []).map((l) => ({
                ...l,
                clinics: {
                  name: state.clinics.find((c) => c["id"] === l["clinic_id"])?.["name"] ?? "",
                },
              })),
            }));
          return respond(own);
        }
        if (method === "PATCH") {
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          const row = state.doctors.find((d) => d["id"] === id && d["user_id"] === ids.user);
          if (!row) return json(route, 406, { code: "PGRST116" });
          const update = body as Row;
          if ("name" in update || "registration_note" in update || "is_demo" in update) {
            return json(route, 400, {
              code: "P0001",
              message: "Only CareConnect can change that",
              details: "",
              hint: "",
            });
          }
          Object.assign(row, update);
          return respond([{ id: row["id"] }]);
        }
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
      case "clinic_doctors": {
        // Built from the doctors' embedded links, embedding doctors and clinics like PostgREST.
        if (method === "GET" && state.failTables.includes("doctors")) {
          return json(route, 500, serverError);
        }
        const filter = (key: string) => url.searchParams.get(key)?.replace(/^eq\./, "");
        if (method === "PATCH") {
          if (state.platformAdmin !== true) return json(route, 406, { code: "PGRST116" });
          const doc = state.doctors.find((d) => d["id"] === filter("doctor_id"));
          const link = (doc?.["clinic_doctors"] as Row[] | undefined)?.find(
            (l) => l["clinic_id"] === filter("clinic_id"),
          );
          if (!link) return json(route, 406, { code: "PGRST116" });
          Object.assign(link, body as Row);
          return respond([{ doctor_id: doc?.["id"] }]);
        }
        const rows = state.doctors.flatMap((d) =>
          ((d["clinic_doctors"] as Row[] | undefined) ?? []).map((l) => ({
            clinic_id: l["clinic_id"],
            doctor_id: d["id"],
            active: l["active"],
            verification_state: l["verification_state"],
            doctors: {
              name: d["name"],
              specialty_id: d["specialty_id"],
              registration_note: d["registration_note"],
              qualifications: d["qualifications"],
              is_demo: d["is_demo"],
            },
            clinics: {
              name: state.clinics.find((c) => c["id"] === l["clinic_id"])?.["name"] ?? "",
            },
          })),
        );
        return respond(
          rows.filter(
            (r) =>
              (!filter("clinic_id") || r.clinic_id === filter("clinic_id")) &&
              (!filter("verification_state") ||
                r.verification_state === filter("verification_state")),
          ),
        );
      }
      case "user_roles":
        if (state.platformAdmin === "notDeployed") {
          return json(route, 500, {
            code: "42P17",
            message: "infinite recursion detected in policy for relation user_roles",
            details: "",
            hint: "",
          });
        }
        return respond(state.platformAdmin ? [{ role: "platform_admin" }] : []);
      case "provider_applications": {
        if (state.applications === "notDeployed") {
          return json(route, 404, {
            code: "PGRST205",
            message: "Could not find the table",
            details: "",
            hint: "",
          });
        }
        if (method === "POST") {
          const input = body as Row;
          // Column-level INSERT grant: status and owner can't be supplied.
          if ("status" in input || "applicant_id" in input) {
            return json(route, 403, {
              code: "42501",
              message: "permission denied for table provider_applications",
              details: "",
              hint: "",
            });
          }
          if (state.applications.filter((a) => a["status"] === "submitted").length >= 3) {
            return json(route, 400, {
              code: "P0001",
              message: "Rate Limit Exceeded: at most 3 open provider applications per account.",
              details: "",
              hint: "",
            });
          }
          const created: Row = {
            id: "app-" + (state.applications.length + 1),
            applicant_id: ids.user,
            status: "submitted",
            review_note: null,
            reviewed_at: null,
            reviewed_by: null,
            clinic_id: null,
            doctor_count: null,
            message: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...input,
          };
          state.applications.unshift(created);
          return respond([created]);
        }
        return respond(state.applications);
      }
      case "candidate_facilities":
      case "candidate_doctors":
      case "candidate_relationships":
      case "candidate_sources":
      case "candidate_evidence":
      case "candidate_contacts": {
        if (state.candidates === "notDeployed") {
          return json(route, 404, {
            code: "PGRST205",
            message: "Could not find the table",
            details: "",
            hint: "",
          });
        }
        const c = state.candidates;
        const pgErr = (status: number, code: string, message: string) =>
          json(route, status, { code, message, details: "", hint: "" });
        // RLS: everything here is platform-admin only.
        if (state.platformAdmin !== true) {
          return method === "GET"
            ? respond([])
            : pgErr(403, "42501", "new row violates row-level security policy");
        }
        const key = table.replace("candidate_", "") as keyof CandidateState;
        const rows = c[key];
        const eqOf = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
        if (method === "GET") {
          let out = rows;
          for (const col of ["facility_candidate_id", "doctor_candidate_id", "relationship_id"]) {
            const v = url.searchParams.get(col);
            if (!v) continue;
            if (v.startsWith("in.(")) {
              const ids = v.slice(4, -1).split(",");
              out = out.filter((r) => ids.includes(String(r[col])));
            } else {
              out = out.filter((r) => r[col] === v.replace(/^eq\./, ""));
            }
          }
          return respond(out);
        }
        if (method === "PATCH") {
          const row = rows.find((r) => r["id"] === eqOf("id"));
          if (!row) return json(route, 406, { code: "PGRST116" });
          const update = body as Row;
          const has = (col: string, type: string) =>
            c.evidence.some((e) => e[col] === row["id"] && e["evidence_type"] === type);
          if (key === "facilities" || key === "doctors") {
            const col = key === "facilities" ? "facility_candidate_id" : "doctor_candidate_id";
            const needed =
              key === "facilities"
                ? ["clinic_identity", "address", "contact_details"]
                : ["provider_identity", "doctor_registration"];
            if (
              update["review_status"] === "verified" &&
              row["review_status"] !== "verified" &&
              !needed.every((n) => has(col, n))
            ) {
              return pgErr(
                400,
                "P0001",
                "Validation Failed: verification needs evidence of " + needed.join(", ") + ".",
              );
            }
            if (
              update["permission_status"] === "granted" &&
              row["permission_status"] !== "granted" &&
              !has(col, "listing_permission")
            ) {
              return pgErr(
                400,
                "P0001",
                "Validation Failed: permission can only be marked granted with listing_permission evidence.",
              );
            }
          }
          if (
            key === "relationships" &&
            update["careconnect_status"] === "confirmed" &&
            !has("relationship_id", "doctor_clinic_relationship")
          ) {
            return pgErr(
              400,
              "P0001",
              "Validation Failed: confirming a relationship needs doctor_clinic_relationship evidence.",
            );
          }
          Object.assign(row, update);
          return respond([{ id: row["id"] }]);
        }
        if (method === "POST" && (key === "evidence" || key === "contacts")) {
          const input = body as Row;
          if ("recorded_by" in input || "recorded_at" in input) {
            return pgErr(403, "42501", "permission denied for table " + table);
          }
          const created = {
            id: key + "-" + (rows.length + 1),
            recorded_by: ids.user,
            recorded_at: new Date().toISOString(),
            ...input,
          };
          rows.push(created);
          return respond([{ id: created.id }]);
        }
        return pgErr(403, "42501", "permission denied for table " + table);
      }
      case "doctor_applications": {
        if (state.doctorApplications === "notDeployed") {
          return json(route, 404, {
            code: "PGRST205",
            message: "Could not find the table",
            details: "",
            hint: "",
          });
        }
        if (method === "POST") {
          const input = body as Row;
          if ("status" in input || "applicant_id" in input || "doctor_id" in input) {
            return json(route, 403, {
              code: "42501",
              message: "permission denied for table doctor_applications",
              details: "",
              hint: "",
            });
          }
          if (state.doctors.some((d) => d["user_id"] === ids.user)) {
            return json(route, 400, {
              code: "P0001",
              message: "Validation Failed: this account is already linked to a doctor profile.",
              details: "",
              hint: "",
            });
          }
          if (state.doctorApplications.filter((a) => a["status"] === "submitted").length >= 2) {
            return json(route, 400, {
              code: "P0001",
              message: "Rate Limit Exceeded: at most 2 open doctor applications per account.",
              details: "",
              hint: "",
            });
          }
          const created: Row = {
            id: "dapp-" + (state.doctorApplications.length + 1),
            applicant_id: ids.user,
            status: "submitted",
            review_note: null,
            clinic: null,
            created_at: new Date().toISOString(),
            ...input,
          };
          state.doctorApplications.unshift(created);
          return respond([{ id: created["id"] }]);
        }
        return respond(state.doctorApplications);
      }
      case "doctor_schedules": {
        const filter = (key: string) => url.searchParams.get(key)?.replace(/^eq\./, "");
        if (method === "POST") {
          const row = body as Row;
          const doc = state.doctors.find((d) => d["id"] === row["doctor_id"]);
          const verified = ((doc?.["clinic_doctors"] as Row[] | undefined) ?? []).some(
            (l) =>
              l["clinic_id"] === row["clinic_id"] &&
              l["verification_state"] === "verified" &&
              l["active"],
          );
          if (!verified) {
            return json(route, 403, {
              code: "42501",
              message: "new row violates row-level security policy",
              details: "",
              hint: "",
            });
          }
          state.schedules = state.schedules.filter(
            (x) =>
              !(
                x["doctor_id"] === row["doctor_id"] &&
                x["clinic_id"] === row["clinic_id"] &&
                x["day_of_week"] === row["day_of_week"]
              ),
          );
          const created = { id: "sch-" + (state.schedules.length + 1), ...row };
          state.schedules.push(created);
          return respond([created]);
        }
        if (method === "DELETE") {
          const removed = state.schedules.filter((x) => x["id"] === filter("id"));
          state.schedules = state.schedules.filter((x) => x["id"] !== filter("id"));
          return respond(removed);
        }
        return respond(
          state.schedules.filter(
            (x) => !filter("clinic_id") || x["clinic_id"] === filter("clinic_id"),
          ),
        );
      }
      case "patients": {
        if (method === "PATCH" && Array.isArray(state.patients)) {
          const row = state.patients[0];
          if (row) Object.assign(row, body as Row);
          return respond(row ? [row] : []);
        }
        return respond(state.patients);
      }
      case "clinic_memberships": {
        if (method === "PATCH" && Array.isArray(state.memberships)) {
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          const row = state.memberships.find((m) => m["id"] === id);
          if (!row || state.platformAdmin !== true) return json(route, 406, { code: "PGRST116" });
          Object.assign(row, body as Row);
          return respond([row]);
        }
        return respond(state.memberships);
      }
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
        if (method === "POST" && state.concurrentConversation) {
          if (Array.isArray(state.conversations)) {
            state.conversations.push(state.concurrentConversation);
          }
          state.concurrentConversation = null;
          return json(route, 409, {
            code: "23505",
            message: "duplicate key value violates unique constraint",
            details: "",
            hint: "",
          });
        }
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
          const doctorConversation = Array.isArray(state.doctorConversations)
            ? state.doctorConversations.find((c) => c["id"] === (body as Row)["conversation_id"])
            : undefined;
          if (!conversation && !doctorConversation) {
            return json(route, 403, {
              code: "42501",
              message: "new row violates row-level security policy",
              details: "",
              hint: "",
            });
          }
          (doctorConversation?.["messages"] as Row[] | undefined)?.push({
            id: created["id"],
            body: (body as Row)["body"],
            created_at: created["created_at"],
            from: "you",
          });
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
