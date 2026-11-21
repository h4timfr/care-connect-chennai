import { expect, test } from "./support/fixtures";
import type { Page, WebSocketRoute } from "@playwright/test";
import {
  appointmentRow,
  conversationRow,
  defaultState,
  enablePatientContact,
  ids,
  mockBackend,
} from "./support/mock-backend";

async function mockRealtime(page: Page) {
  let joins = 0;
  let connection: { socket: WebSocketRoute; topic: string } | undefined;
  await page.routeWebSocket(/careconnect-test\.invalid/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(message);
      if (event !== "phx_join") return;
      joins++;
      connection = { socket, topic };
      socket.send(
        JSON.stringify([
          joinRef,
          ref,
          topic,
          "phx_reply",
          {
            status: "ok",
            response: {
              postgres_changes: payload.config.postgres_changes.map((binding: object) => ({
                ...binding,
                id: 1,
              })),
            },
          },
        ]),
      );
    });
  });
  return {
    joins: () => joins,
    async disconnect() {
      if (!connection) throw new Error("Mock Realtime didn't join.");
      await connection.socket.close({ code: 1012 });
    },
    notifyInsert() {
      if (!connection) throw new Error("Mock Realtime didn't join.");
      connection.socket.send(
        JSON.stringify([
          null,
          null,
          connection.topic,
          "postgres_changes",
          {
            ids: [1],
            data: {
              schema: "public",
              table: "messages",
              type: "INSERT",
              columns: [],
              record: {},
            },
          },
        ]),
      );
    },
  };
}

test("a Realtime join and reconnect reconcile missed messages without duplicates", async ({
  page,
  backend,
}) => {
  const initial = conversationRow([{ from: "clinic", body: "Initial clinic reply" }]);
  const mock = await backend({ conversations: [initial] });
  const realtime = await mockRealtime(page);
  let firstRead = true;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/conversations?*", async (route) => {
    if (!firstRead) return route.fallback();
    firstRead = false;
    await pending;
    await route.fulfill({ json: [initial] });
  });

  await page.goto(`/messages?c=${ids.conversation}`);
  try {
    await expect.poll(() => !firstRead && realtime.joins() === 1).toBe(true);
    mock.state.conversations = [
      conversationRow([
        { from: "clinic", body: "Initial clinic reply" },
        { from: "clinic", body: "Reply during the initial inbox read" },
      ]),
    ];
  } finally {
    release();
  }
  await expect(
    page.getByText("Clinic: Reply during the initial inbox read", { exact: true }),
  ).toHaveCount(1);
  expect(mock.callsTo("GET", "/rest/v1/conversations")).toHaveLength(1);

  mock.state.conversations = [
    conversationRow([
      { from: "clinic", body: "Initial clinic reply" },
      { from: "clinic", body: "Reply during the initial inbox read" },
      { from: "clinic", body: "Reply while reconnecting" },
    ]),
  ];
  await realtime.disconnect();
  await expect.poll(realtime.joins).toBe(2);
  await expect(page.getByText("Clinic: Reply while reconnecting", { exact: true })).toHaveCount(1);
  expect(mock.callsTo("GET", "/rest/v1/conversations")).toHaveLength(2);
  await page.screenshot({ path: test.info().outputPath("messaging-reconnect.png") });
});

test("separate patient and clinic sessions exchange and reload the same clinic thread", async ({
  page,
  browser,
  backend,
}) => {
  const conversations: ReturnType<typeof conversationRow>[] = [];
  const patient = await backend({ appointments: [appointmentRow()], conversations });
  enablePatientContact(patient.state, ids.clinicA, true);
  const patientSocket = await mockRealtime(page);
  await page.goto(`/appointments/${ids.appointment}`);
  await page.getByRole("button", { name: "Message clinic" }).click();
  await expect(page).toHaveURL(new RegExp(`/messages\\?c=${ids.conversation}$`));

  const origin = new URL(page.url()).origin;
  const clinicContext = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
  try {
    await clinicContext.route("**/*", (route) =>
      [origin, "https://careconnect-test.invalid"].includes(new URL(route.request().url()).origin)
        ? route.fallback()
        : route.abort(),
    );
    await clinicContext.routeWebSocket(/^wss?:\/\/(?!careconnect-test\.invalid\/)/, (socket) =>
      socket.close(),
    );
    const clinicPage = await clinicContext.newPage();
    const clinicState = defaultState();
    const clinic = await mockBackend(clinicPage, {
      state: {
        authUserId: "00000000-0000-4000-8000-000000000099",
        authEmail: "clinic@example.invalid",
        conversations,
        memberships: [
          {
            clinic_id: ids.clinicA,
            role: "clinic_staff",
            active: true,
            clinics: clinicState.clinics[0],
          },
        ],
      },
    });
    const clinicSocket = await mockRealtime(clinicPage);
    await clinicPage.goto(`/clinic/messages?c=${ids.conversation}`);
    await expect.poll(clinicSocket.joins).toBe(1);
    await expect.poll(patientSocket.joins).toBe(1);
    const patientLog = page.getByRole("log");
    const clinicLog = clinicPage.getByRole("log");

    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Synthetic question");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(patientLog.getByText("You: Synthetic question", { exact: true })).toBeVisible();
    clinicSocket.notifyInsert();
    await expect(clinicLog.getByText("Patient: Synthetic question", { exact: true })).toBeVisible();

    await clinicPage.getByRole("textbox").fill("Synthetic reply");
    await clinicPage.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(clinicLog.getByText("Clinic: Synthetic reply", { exact: true })).toBeVisible();
    patientSocket.notifyInsert();
    patientSocket.notifyInsert();
    await expect(patientLog.getByText("Clinic: Synthetic reply", { exact: true })).toHaveCount(1);
    await Promise.all([page.reload(), clinicPage.reload()]);
    await expect(patientLog).toContainText(/You: Synthetic question[\s\S]*Clinic: Synthetic reply/);
    await expect(clinicLog).toContainText(
      /Patient: Synthetic question[\s\S]*Clinic: Synthetic reply/,
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!["messages"]).toHaveLength(2);
    const times = (conversations[0]!["messages"] as { created_at: string }[]).map(
      (message) => message.created_at,
    );
    for (const log of [patientLog, clinicLog]) {
      expect(
        await log
          .locator("time")
          .evaluateAll((items) => items.map((item) => item.getAttribute("datetime"))),
      ).toEqual(times);
    }
    expect(patient.callsTo("POST", "/rest/v1/messages")).toHaveLength(1);
    expect(clinic.callsTo("POST", "/rest/v1/messages")).toHaveLength(1);
    expect(clinic.unhandled).toEqual([]);
  } finally {
    await clinicContext.close();
  }
});

test("confirming an input method composition does not send the patient's message", async ({
  page,
  backend,
}) => {
  const mock = await backend({ conversations: [conversationRow([])] });
  enablePatientContact(mock.state, ids.clinicA);
  await page.goto(`/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("வணக்கம்");
  const enterWasNotClaimed = await composer.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(enterWasNotClaimed).toBe(true);
  await expect(composer).toHaveValue("வணக்கம்");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(composer).toHaveValue("");
  expect(mock.callsTo("POST", "/rest/v1/messages")).toHaveLength(1);
});

test("an unpublished clinic keeps its real name and historical messages without a composer", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    conversations: [conversationRow([{ from: "clinic", body: "A preserved historical reply" }])],
  });
  enablePatientContact(mock.state, ids.clinicA);
  mock.state.clinics[0]!["is_published"] = false;
  await page.goto(`/messages?c=${ids.conversation}`);

  await expect(
    page.getByRole("heading", { name: "Test Clinic A · General enquiry" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversations" })).toContainText(
    "Historical clinic conversation",
  );
  await expect(
    page.getByText("Clinic: A preserved historical reply", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/This clinic is unavailable/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  expect(mock.callsTo("POST", "/rest/v1/rpc/patient_conversation_clinics")[0]?.body).toEqual({
    p_conversation_ids: [ids.conversation],
  });
  expect(mock.callsTo("POST", "/rest/v1/messages")).toHaveLength(0);
});

test("a stale composer closes after a denied send and the thread stays readable", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    conversations: [conversationRow([{ from: "clinic", body: "Preserved after revocation" }])],
  });
  enablePatientContact(mock.state, ids.clinicA);
  await page.goto(`/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("A draft before revocation");
  mock.state.clinics[0]!["patient_contact_permission"] = "revoked";
  let rejectedSends = 0;
  await page.route("**/rest/v1/messages", async (route) => {
    rejectedSends++;
    await route.fulfill({ status: 403, json: { code: "42501", message: "Synthetic denial" } });
  });
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/This clinic is not accepting new patient messages/)).toBeVisible();
  await expect(page.getByText("Clinic: Preserved after revocation", { exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0);
  expect(rejectedSends).toBe(1);
});

test("reconciliation removes a deleted thread and restores the mobile inbox list", async ({
  page,
  backend,
}) => {
  const remaining = { ...conversationRow([]), id: "remaining-thread", clinic_id: ids.clinicB };
  const mock = await backend({
    conversations: [
      conversationRow([{ from: "clinic", body: "Synthetic deleted history" }]),
      remaining,
    ],
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.install();
  await page.goto(`/messages?c=${ids.conversation}`);
  await expect(page.getByText("Clinic: Synthetic deleted history", { exact: true })).toBeVisible();

  mock.state.conversations = [remaining];
  await page.clock.fastForward(30_000);
  await expect(page.getByText("That conversation isn't available.")).toBeVisible();
  await expect(page.getByText(/Synthetic deleted history/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Test Clinic B/ })).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect.poll(() => mock.callsTo("GET", "/rest/v1/conversations").length).toBeGreaterThan(2);
  await expect(page.getByRole("button", { name: /Test Clinic A/ })).toHaveCount(0);
});

test("a thread deleted between inbox and clinic metadata reads is not rendered", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    conversations: [conversationRow([{ from: "clinic", body: "Deleted during the read" }])],
  });
  await page.route("**/rest/v1/rpc/patient_conversation_clinics", (route) => {
    mock.state.conversations = [];
    return route.fallback();
  });
  await page.goto(`/messages?c=${ids.conversation}`);
  await expect(page.getByText("That conversation isn't available.")).toBeVisible();
  await expect(page.getByText("No conversations yet")).toBeVisible();
  await expect(page.getByText(/Deleted during the read/)).toHaveCount(0);
});

test("inboxes request only their visible scope and refresh without a socket event", async ({
  page,
  backend,
}) => {
  const patientThread = conversationRow([{ from: "clinic", body: "Patient-side fixture" }]);
  const clinicThread = {
    ...conversationRow([{ from: "patient", body: "Clinic-side fixture" }]),
    id: "clinic-thread",
    patient_id: "another-patient",
  };
  const mock = await backend({ conversations: [patientThread, clinicThread] });
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_admin", active: true, clinics: mock.state.clinics[0] },
  ];
  await page.clock.install();
  await page.goto(`/messages?c=${ids.conversation}`);
  await expect(page.getByText("Clinic: Patient-side fixture")).toBeVisible();
  const patientRead = mock.callsTo("GET", "/rest/v1/conversations")[0]!;
  expect(new URLSearchParams(patientRead.search).get("patient_id")).toBe(`eq.${ids.patient}`);
  expect(new URLSearchParams(patientRead.search).has("or")).toBe(false);
  expect(new URLSearchParams(patientRead.search).has("clinic_id")).toBe(false);

  mock.state.conversations = [
    conversationRow([{ from: "clinic", body: "Arrived while the socket was silent" }]),
    clinicThread,
  ];
  await page.clock.fastForward(30_000);
  await expect(page.getByText("Clinic: Arrived while the socket was silent")).toBeVisible();
  expect(mock.callsTo("GET", "/rest/v1/conversations")).toHaveLength(2);

  await page.goto("/clinic/messages?c=clinic-thread");
  await expect(page.getByText("Patient: Clinic-side fixture")).toBeVisible();
  const clinicRead = mock.callsTo("GET", "/rest/v1/conversations").at(-1)!;
  expect(new URLSearchParams(clinicRead.search).get("clinic_id")).toBe(`eq.${ids.clinicA}`);
  expect(new URLSearchParams(clinicRead.search).has("patient_id")).toBe(false);
  expect(new URLSearchParams(clinicRead.search).has("or")).toBe(false);
});

test("patient drafts survive a thread switch and a failed background refresh", async ({
  page,
  backend,
}) => {
  const rows = [
    conversationRow([{ from: "clinic", body: "First thread" }]),
    { ...conversationRow([]), id: "second-thread", kind: "appointment" },
  ];
  const mock = await backend({ conversations: rows });
  enablePatientContact(mock.state, ids.clinicA);
  await page.clock.install();
  await page.goto(`/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("An unsent draft");
  const inbox = page.getByRole("list", { name: "Conversations" });
  await inbox.getByRole("button", { name: /About an appointment/i }).click();
  await expect(composer).toHaveValue("");
  await inbox.getByRole("button", { name: /General enquiry/ }).click();
  await expect(composer).toHaveValue("An unsent draft");

  mock.state.conversations = "error";
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("alert")).toContainText("We couldn't load your messages");
  await expect(page.getByText("Clinic: First thread")).toHaveCount(0);
  mock.state.conversations = rows;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(composer).toHaveValue("An unsent draft");
});

test("a lost send response retries the same message and renders only one copy", async ({
  page,
  backend,
}) => {
  const thread = conversationRow([]);
  const mock = await backend({
    conversations: [thread],
    loseMessageInsertResponse: true,
  });
  enablePatientContact(mock.state, ids.clinicA);
  await page.goto(`/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  const send = page.getByRole("button", { name: "Send message" });
  await composer.fill("A synthetic message");
  await send.click();
  await expect(page.getByText(/Delivery could not be confirmed/)).toBeVisible();
  await expect(composer).toHaveValue("A synthetic message");
  await send.click();
  await expect(composer).toHaveValue("");
  const writes = mock.callsTo("POST", "/rest/v1/messages");
  expect(writes).toHaveLength(2);
  expect(writes[0]?.body).toEqual(writes[1]?.body);
  expect(writes[0]?.body).toMatchObject({ id: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  expect(thread["messages"]).toHaveLength(1);
  await expect(page.getByText("A synthetic message", { exact: true })).toBeVisible();
});

test("doctor retries confirm delivery through the scoped RPC only", async ({ page, backend }) => {
  const thread = {
    id: ids.conversation,
    clinic_id: ids.clinicA,
    clinic_name: "Test Clinic A",
    patient_name: "Synthetic Patient",
    created_at: "2026-01-01T00:00:00Z",
    messages: [],
  };
  const mock = await backend({ doctorConversations: [thread], loseMessageInsertResponse: true });
  const doctor = mock.state.doctors.find((row) => row["id"] === ids.doctorVerified)!;
  doctor["user_id"] = ids.user;
  await page.goto(`/doctor/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox");
  const send = page.getByRole("button", { name: "Send reply", exact: true });
  await composer.fill("A synthetic doctor reply");
  await send.click();
  await expect(page.getByRole("alert")).toContainText("Delivery could not be confirmed");
  await send.click();
  await expect(composer).toHaveValue("");
  expect(thread.messages).toHaveLength(1);
  expect(mock.callsTo("POST", "/rest/v1/messages")).toHaveLength(2);
  expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_conversations").length).toBeGreaterThan(1);
  expect(mock.callsTo("GET", "/rest/v1/messages")).toHaveLength(0);
});

test("an appointment opens its own thread even when a general clinic thread already exists", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    appointments: [appointmentRow()],
    conversations: [{ ...conversationRow([]), id: "prior-general-thread" }],
  });
  enablePatientContact(mock.state, ids.clinicA, true);
  await page.goto(`/appointments/${ids.appointment}`);
  await page.getByRole("button", { name: "Message clinic" }).click();
  await expect(page).toHaveURL(new RegExp(`/messages\\?c=${ids.conversation}$`));
  expect(mock.callsTo("POST", "/rest/v1/conversations")[0]?.body).toMatchObject({
    appointment_id: ids.appointment,
    doctor_id: ids.doctorVerified,
    kind: "appointment",
  });
});
