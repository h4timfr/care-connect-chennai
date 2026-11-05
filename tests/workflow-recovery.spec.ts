import { conversationRow, defaultState, ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

for (const [url, recovered] of [
  [`/book/${ids.doctorVerified}`, "Book an appointment"],
  ["/appointments", "No upcoming appointments"],
  ["/messages", "No conversations yet"],
]) {
  test(`profile-load retry recovers ${url}`, async ({ page, backend }) => {
    const mock = await backend({ patients: "error" });
    await page.goto(url!);
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    const before = mock.callsTo("GET", "/rest/v1/patients").length;
    mock.state.patients = defaultState().patients;
    await retry.click();
    await expect(retry).toHaveCount(0);
    await expect(page.getByText(recovered!, { exact: true })).toBeVisible();
    expect(mock.callsTo("GET", "/rest/v1/patients").length).toBeGreaterThan(before);
  });
}

test("patient drafts do not cross conversation boundaries", async ({ page, backend }) => {
  await backend({
    conversations: [
      conversationRow([]),
      { ...conversationRow([]), id: "second-conversation", clinic_id: ids.clinicB },
    ],
  });
  await page.goto(`/messages?c=${ids.conversation}`);
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Private draft for clinic A");
  await page.getByRole("button", { name: /Test Clinic B/ }).click();
  await expect(page).toHaveURL(/c=second-conversation/);
  await expect(input).toHaveValue("");
});

test("clinic drafts do not cross patient boundaries", async ({ page, backend }) => {
  const state = defaultState();
  await backend({
    memberships: [{ clinic_id: ids.clinicA, role: "clinic_staff", clinics: state.clinics[0] }],
    conversations: [
      conversationRow([]),
      {
        ...conversationRow([]),
        id: "second-conversation",
        patients: { full_name: "Second Patient", user_id: "second-patient" },
      },
    ],
  });
  await page.goto(`/clinic/messages?c=${ids.conversation}`);
  const input = page.getByLabel("Reply to patient");
  await input.fill("Private draft for first patient");
  await page.getByRole("button", { name: /Second Patient/ }).click();
  await expect(input).toHaveValue("");
});

test("doctor drafts do not cross patient boundaries and retain scoped RPC reads", async ({
  page,
  backend,
}) => {
  const state = defaultState();
  state.doctors[0]!["user_id"] = ids.user;
  const mock = await backend({
    doctors: state.doctors,
    doctorConversations: ["First Patient", "Second Patient"].map((name, index) => ({
      id: `doctor-conversation-${index}`,
      clinic_id: ids.clinicA,
      clinic_name: "Test Clinic A",
      patient_name: name,
      created_at: "2026-01-01T00:00:00Z",
      messages: [],
    })),
  });
  await page.goto("/doctor/messages?c=doctor-conversation-0");
  const input = page.getByRole("textbox");
  await input.fill("Private draft for first patient");
  await page.getByRole("button", { name: /Second Patient/ }).click();
  await expect(input).toHaveValue("");
  expect(mock.callsTo("POST", "/rest/v1/rpc/doctor_conversations").length).toBeGreaterThan(0);
  expect(mock.callsTo("GET", "/rest/v1/messages")).toHaveLength(0);
});
