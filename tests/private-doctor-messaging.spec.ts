import { expect, test } from "./support/fixtures";
import { appointmentRow, conversationRow, enablePatientContact, ids } from "./support/mock-backend";

const appointmentPath = `/appointments/${ids.appointment}`;
const privateThread = `doctor:${ids.appointment}`;

test("a private inbox policy error is visible and can be retried", async ({ page, backend }) => {
  await backend();
  let failed = true;
  await page.route("**/rest/v1/rpc/doctor_message_inbox?*", (route) =>
    failed
      ? route.fulfill({ status: 500, json: { code: "42P17", message: "Synthetic policy error" } })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/messages");
  const error = page.getByText("We couldn't load private doctor messages", { exact: true });
  await expect(error).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(error).toBeHidden();
});

test("clinic enquiry and appointment threads have distinct labels even with the same doctor", async ({
  page,
  backend,
}) => {
  await backend({
    conversations: [
      { ...conversationRow([]), id: "general-clinic-thread", doctor_id: ids.doctorVerified },
      {
        ...conversationRow([{ from: "clinic", body: "Appointment clinic reply" }]),
        doctor_id: ids.doctorVerified,
        appointment_id: ids.appointment,
        appointments: { date: "2026-11-16" },
        kind: "appointment",
      },
    ],
  });
  await page.goto("/messages");
  const inbox = page.getByRole("list", { name: "Conversations" });
  await expect(
    inbox.getByRole("button", { name: /Test Clinic A · Appointment 16 Nov/ }),
  ).toBeVisible();
  await expect(
    inbox.getByRole("button", {
      name: /Test Clinic A · General enquiry Clinic conversation No messages yet/,
    }),
  ).toBeVisible();
  await expect(inbox.getByRole("button").first()).toContainText("Appointment clinic reply");
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test(`${viewport.name}: private doctor thread is reused and messages survive reload in both inboxes`, async ({
    page,
    backend,
  }) => {
    await page.setViewportSize(viewport);
    const mock = await backend({ appointments: [appointmentRow()] });
    enablePatientContact(mock.state, ids.clinicA, true);
    mock.state.doctors.find((doctor) => doctor["id"] === ids.doctorVerified)!["user_id"] = ids.user;
    let opened = false;
    let sender: "patient" | "doctor" = "patient";
    const messages = new Map<
      string,
      { id: string; body: string; sender: string; created_at: string }
    >();
    await page.route("**/rest/v1/rpc/*", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      if (name === "can_message_assigned_doctor") return route.fulfill({ json: true });
      if (name === "open_doctor_message_thread") {
        expect(route.request().postDataJSON()).toEqual({ p_appointment_id: ids.appointment });
        opened = true;
        return route.fulfill({ json: ids.appointment });
      }
      if (name === "doctor_message_inbox") {
        return route.fulfill({
          json: opened
            ? [
                {
                  appointment_id: ids.appointment,
                  appointment_date: "2026-11-16",
                  clinic_id: ids.clinicA,
                  clinic_name: "Test Clinic A",
                  patient_id: ids.patient,
                  patient_name: "Test Patient",
                  doctor_name: "Dr. Verified Tester",
                  can_send: true,
                  messages: [...messages.values()],
                },
              ]
            : [],
        });
      }
      if (name === "send_doctor_message") {
        const { p_appointment_id, p_message_id, p_body } = route.request().postDataJSON();
        expect(p_appointment_id).toBe(ids.appointment);
        if (!messages.has(p_message_id)) {
          messages.set(p_message_id, {
            id: p_message_id,
            body: p_body,
            sender,
            created_at: new Date().toISOString(),
          });
        }
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });

    await page.goto(appointmentPath);
    await expect(page.getByRole("button", { name: "Message clinic" })).toBeVisible();
    await page.getByRole("button", { name: "Message doctor" }).click();
    await expect(
      page.getByRole("heading", { name: "Dr. Verified Tester · Appointment 16 Nov" }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("c")).toBe(privateThread);
    await expect(
      page.getByText("Private messages are for non-emergency communication only."),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Message" }).fill("Private patient question");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Private patient question", { exact: true })).toBeVisible();

    await page.goto(appointmentPath);
    await page.getByRole("button", { name: "Message doctor" }).click();
    await expect(page.getByText("Private patient question", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("c")).toBe(privateThread);
    expect(mock.callsTo("POST", "/rest/v1/conversations")).toHaveLength(0);

    sender = "doctor";
    await page.goto("/doctor/messages");
    await page.getByRole("button", { name: /Test Patient.*Private doctor conversation/ }).click();
    await expect(page.getByRole("heading", { name: "Test Patient" })).toBeVisible();
    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Back to conversations" }).click();
      await page.getByRole("button", { name: /Test Patient.*Private doctor conversation/ }).click();
    }
    await page.getByRole("textbox").fill("Private doctor reply");
    await page.getByRole("button", { name: "Send reply" }).click();
    const doctorThread = page.getByRole("region", { name: "Test Patient" });
    await expect(doctorThread.getByText("Private doctor reply", { exact: true })).toBeVisible();
    await page.reload();
    await expect(doctorThread.getByText("Private patient question", { exact: true })).toBeVisible();
    await expect(doctorThread.getByText("Private doctor reply", { exact: true })).toBeVisible();

    await page.goto(`/messages?c=${encodeURIComponent(privateThread)}`);
    await expect(page.getByText("Doctor: Private doctor reply")).toBeVisible();
    expect(messages.size).toBe(2);
    expect(mock.callsTo("POST", "/rest/v1/messages")).toHaveLength(0);
  });
}
