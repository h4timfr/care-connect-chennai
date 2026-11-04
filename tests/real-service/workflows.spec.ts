import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const localSupabase = process.env.VITE_SUPABASE_URL!;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const runId = process.env.CARECONNECT_RUN_ID!;
const trace: Array<{ kind: string; method?: string; path?: string; status?: number }> = [];

function addNetworkEvidence(page: Page) {
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      trace.push({ kind: "request", method: request.method(), path: url.pathname });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      trace.push({
        kind: "response",
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      trace.push({ kind: "request-failed", method: request.method(), path: url.pathname });
    }
  });
}

async function signIn(
  page: Page,
  portal: "patient" | "clinic" | "doctor",
  email: string,
  password: string,
) {
  const pathName = portal === "patient" ? "/login" : `/${portal}/login`;
  await page.goto(pathName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", {
      name:
        portal === "patient"
          ? "Sign in"
          : `Sign in to ${portal === "clinic" ? "Clinic" : "Doctor"} Portal`,
    })
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0, { timeout: 20_000 });
}

async function browserRest(
  page: Page,
  method: string,
  pathName: string,
  body?: unknown,
  prefer?: string,
) {
  return page.evaluate(
    async ({ localSupabase, publishableKey, method, pathName, body, prefer }) => {
      const entries = Object.keys(localStorage).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
      );
      const session = entries
        .map((key) => {
          try {
            return JSON.parse(localStorage.getItem(key) || "null");
          } catch {
            return null;
          }
        })
        .find((candidate) => candidate?.access_token);
      if (!session?.access_token) throw new Error("browser auth session missing");
      const headers: Record<string, string> = {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      };
      if (prefer) headers.Prefer = prefer;
      const response = await fetch(`${localSupabase}/rest/v1/${pathName}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { localSupabase, publishableKey, method, pathName, body, prefer },
  );
}

async function browserRpc(page: Page, name: string, args: Record<string, unknown>) {
  return browserRest(page, "POST", `rpc/${name}`, args, "return=representation");
}

async function anonymousRpc(page: Page, name: string, args: Record<string, unknown>) {
  return page.evaluate(
    async ({ localSupabase, publishableKey, name, args }) => {
      const response = await fetch(`${localSupabase}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return { status: response.status };
    },
    { localSupabase, publishableKey, name, args },
  );
}

test("patient booking, clinic and doctor inboxes, messaging, and admin publication use local services", async ({
  page,
  browser,
}) => {
  addNetworkEvidence(page);
  const email = process.env.CARECONNECT_PATIENT_EMAIL!;
  const password = process.env.CARECONNECT_PATIENT_PASSWORD!;
  const clinicId = process.env.CARECONNECT_CLINIC_ID!;
  const doctorId = process.env.CARECONNECT_DOCTOR_ID!;
  const conversationId = process.env.CARECONNECT_CONVERSATION_ID!;
  const date = process.env.CARECONNECT_BROWSER_DATE!;

  await test.step("patient logs in and books against PostgREST-backed availability", async () => {
    await signIn(page, "patient", email, password);
    await page.goto(`/book/${doctorId}?date=${date}&time=08%3A00&clinicId=${clinicId}`);
    await expect(page.getByRole("heading", { name: "Synthetic CI Doctor" })).toBeVisible({
      timeout: 20_000,
    });
    const slot = page.getByRole("button", { name: /8:00/ }).first();
    await expect(slot).toBeEnabled({ timeout: 20_000 });
    await slot.click();
    await page.getByRole("button", { name: "Request appointment" }).click();
    await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]+/i, { timeout: 20_000 });
    const rows = await browserRest(
      page,
      "GET",
      `appointments?clinic_id=eq.${clinicId}&date=eq.${date}&select=id,doctor_id,clinic_id`,
    );
    expect(rows.status).toBe(200);
    expect(rows.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clinic_id: clinicId, doctor_id: doctorId }),
      ]),
    );
  });

  await test.step("clinic staff authenticates and sees the booked appointment", async () => {
    const clinicPage = await browser.newPage();
    addNetworkEvidence(clinicPage);
    await signIn(
      clinicPage,
      "clinic",
      process.env.CARECONNECT_CLINIC_EMAIL!,
      process.env.CARECONNECT_CLINIC_PASSWORD!,
    );
    await expect(clinicPage).toHaveURL(/\/clinic(?:\/|$)/, { timeout: 20_000 });
    const rows = await browserRest(
      clinicPage,
      "GET",
      `appointments?clinic_id=eq.${clinicId}&date=eq.${date}&select=id,clinic_id`,
    );
    expect(rows.status).toBe(200);
    expect(rows.body.length).toBeGreaterThan(0);
    await clinicPage.close();
  });

  await test.step("doctor authenticates, sees the booking, and replies to the patient", async () => {
    const doctorPage = await browser.newPage();
    addNetworkEvidence(doctorPage);
    await signIn(
      doctorPage,
      "doctor",
      process.env.CARECONNECT_DOCTOR_EMAIL!,
      process.env.CARECONNECT_DOCTOR_PASSWORD!,
    );
    await expect(doctorPage).toHaveURL(/\/doctor(?:\/|$)/, { timeout: 20_000 });
    const appointments = await browserRpc(doctorPage, "doctor_appointments", {});
    expect(appointments.status).toBe(200);
    expect(appointments.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ clinic_id: clinicId })]),
    );
    const replyText = `Synthetic browser doctor reply ${runId}`;
    const reply = await browserRest(
      doctorPage,
      "POST",
      "messages",
      {
        conversation_id: conversationId,
        sender_id: await browserUserId(doctorPage),
        body: replyText,
      },
      "return=minimal",
    );
    expect(reply.status).toBe(201);
    await doctorPage.close();

    await page.bringToFront();
    const messages = await browserRest(
      page,
      "GET",
      `messages?conversation_id=eq.${conversationId}&select=body`,
    );
    expect(messages.status).toBe(200);
    expect(messages.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ body: replyText })]),
    );
  });

  await test.step("patient sends a message and admin changes publication state", async () => {
    const patientMessage = `Synthetic browser patient message ${runId}`;
    const insert = await browserRest(
      page,
      "POST",
      "messages",
      {
        conversation_id: conversationId,
        sender_id: await browserUserId(page),
        body: patientMessage,
      },
      "return=minimal",
    );
    expect(insert.status).toBe(201);
    const replies = await browserRest(
      page,
      "GET",
      `messages?conversation_id=eq.${conversationId}&select=body`,
    );
    expect(replies.status).toBe(200);
    expect(replies.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ body: patientMessage })]),
    );

    const contacts = await browserRpc(page, "get_my_clinic_contacts", {});
    expect(contacts.status).toBe(200);
    expect(contacts.body).toEqual([]);

    const anonymousPage = await browser.newPage();
    addNetworkEvidence(anonymousPage);
    await anonymousPage.goto("/");
    const anonymousBooking = await anonymousRpc(anonymousPage, "book_appointment", {
      p_doctor_id: doctorId,
      p_clinic_id: clinicId,
      p_date: date,
      p_time: "08:30",
      p_reason: "Synthetic anonymous browser request",
    });
    expect(anonymousBooking.status).toBeGreaterThanOrEqual(400);
    await anonymousPage.close();

    for (const portal of ["clinic", "doctor"] as const) {
      const restrictedPage = await browser.newPage();
      addNetworkEvidence(restrictedPage);
      await signIn(
        restrictedPage,
        portal,
        process.env.CARECONNECT_UNAUTHORIZED_EMAIL!,
        process.env.CARECONNECT_UNAUTHORIZED_PASSWORD!,
      );
      await expect(restrictedPage.getByRole("alert")).toContainText(
        portal === "clinic"
          ? "Clinic access isn't enabled for this account"
          : "Doctor access isn't enabled for this account",
      );
      await restrictedPage.close();
    }

    const adminPage = await browser.newPage();
    addNetworkEvidence(adminPage);
    await signIn(
      adminPage,
      "patient",
      process.env.CARECONNECT_ADMIN_EMAIL!,
      process.env.CARECONNECT_ADMIN_PASSWORD!,
    );
    const hidden = await browserRpc(adminPage, "admin_set_clinic_publication_state", {
      p_clinic_id: clinicId,
      p_verification_state: "verified",
      p_is_published: false,
      p_contact_permission: "revoked",
      p_booking_enabled: false,
    });
    expect([200, 204]).toContain(hidden.status);
    const restored = await browserRpc(adminPage, "admin_set_clinic_publication_state", {
      p_clinic_id: clinicId,
      p_verification_state: "verified",
      p_is_published: true,
      p_contact_permission: "granted",
      p_booking_enabled: true,
    });
    expect([200, 204]).toContain(restored.status);
    await adminPage.close();
  });
});

async function browserUserId(page: Page) {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      try {
        const session = JSON.parse(localStorage.getItem(key) || "null");
        if (session?.user?.id) return session.user.id as string;
      } catch {
        /* Ignore non-session local storage values. */
      }
    }
    throw new Error("browser authenticated user missing");
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const directory = path.join(process.cwd(), "test-artifacts");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "browser-failure-trace.json"),
    JSON.stringify(
      {
        test: testInfo.title,
        status: testInfo.status,
        failure_path: new URL(page.url()).pathname,
        request_events: trace,
        request_failures: trace.filter((event) => event.kind === "request-failed").length,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
});
