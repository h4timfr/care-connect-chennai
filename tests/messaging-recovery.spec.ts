import { expect, test } from "./support/fixtures";
import { appointmentRow, conversationRow, enablePatientContact, ids } from "./support/mock-backend";

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
    { ...conversationRow([]), id: "second-thread", clinic_id: ids.clinicB },
  ];
  const mock = await backend({ conversations: rows });
  await page.clock.install();
  await page.goto(`/messages?c=${ids.conversation}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("An unsent draft");
  const inbox = page.getByRole("list", { name: "Conversations" });
  await inbox.getByRole("button", { name: /Test Clinic B/ }).click();
  await expect(composer).toHaveValue("");
  await inbox.getByRole("button", { name: /Test Clinic A/ }).click();
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
