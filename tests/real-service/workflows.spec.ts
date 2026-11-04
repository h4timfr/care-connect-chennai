import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const runId = process.env.CARECONNECT_RUN_ID!;
const workflows = [
  { id: "patient", title: "patient booking and cancellation" },
  { id: "clinic", title: "clinic appointment visibility" },
  { id: "doctor", title: "doctor appointment and messaging" },
  { id: "administrator", title: "administrator publication control" },
] as const;
type WorkflowId = (typeof workflows)[number]["id"];
type AssertionResult = { name: string; status: "PASS" | "FAIL" };
type WorkflowResult = {
  name: WorkflowId;
  status: "PASS" | "FAIL" | "BLOCKED";
  assertions: AssertionResult[];
  http_requests: number;
  request_failures: number;
};

const trace: Array<{ kind: string; method?: string; path?: string; status?: number }> = [];
const results: WorkflowResult[] = [];
let assertionResults: AssertionResult[] = [];
let traceOffset = 0;

test.beforeEach(() => {
  assertionResults = [];
  traceOffset = trace.length;
});

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

async function check(assertion: Promise<void>, name: string) {
  try {
    await assertion;
    assertionResults.push({ name, status: "PASS" });
  } catch (error) {
    assertionResults.push({ name, status: "FAIL" });
    throw error;
  }
}

async function signIn(
  page: Page,
  portal: "patient" | "clinic" | "doctor",
  email: string,
  password: string,
) {
  const pathName = portal === "patient" ? "/login" : "/" + portal + "/login";
  await page.goto(pathName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const buttonName =
    portal === "patient"
      ? "Sign in"
      : "Sign in to " + (portal === "clinic" ? "Clinic" : "Doctor") + " Portal";
  await page.getByRole("button", { name: buttonName }).click();
  await check(
    expect(page.getByLabel("Email", { exact: true })).toHaveCount(0, { timeout: 20_000 }),
    portal + " login completes through the interface",
  );
}

async function patientAppointment(page: Page) {
  await signIn(
    page,
    "patient",
    process.env.CARECONNECT_PATIENT_EMAIL!,
    process.env.CARECONNECT_PATIENT_PASSWORD!,
  );
}

test("patient books and cancels an appointment through the interface", async ({ page }) => {
  addNetworkEvidence(page);
  const clinicId = process.env.CARECONNECT_CLINIC_ID!;
  const doctorId = process.env.CARECONNECT_DOCTOR_ID!;
  const date = process.env.CARECONNECT_BROWSER_DATE!;
  const time = process.env.CARECONNECT_BROWSER_TIME!;
  const reason = process.env.CARECONNECT_BROWSER_APPOINTMENT_REASON!;

  await patientAppointment(page);
  await page.goto(
    "/book/" +
      doctorId +
      "?date=" +
      date +
      "&time=" +
      encodeURIComponent(time) +
      "&clinicId=" +
      clinicId,
  );
  await check(
    expect(page.getByRole("heading", { name: "Synthetic CI Doctor" })).toBeVisible({
      timeout: 20_000,
    }),
    "booking page displays the published synthetic doctor",
  );
  const slotLabel = time.replace(/^0(?=\d:)/, "");
  const slot = page.getByRole("button", { name: new RegExp(slotLabel) }).first();
  await check(
    slot.isEnabled().then((enabled) => expect(enabled).toBe(true)),
    "available slot is enabled",
  );
  await slot.click();
  await page.getByLabel("Reason for visit (optional)").fill(reason);
  await page.getByRole("button", { name: "Request appointment" }).click();
  await check(
    expect(page).toHaveURL(/\/appointments\/[0-9a-f-]+/i, { timeout: 20_000 }),
    "booking navigates to appointment confirmation",
  );
  await check(
    expect(page.getByRole("heading", { name: "Appointment details" })).toBeVisible(),
    "appointment confirmation details render",
  );
  await check(
    expect(page.getByText("Awaiting confirmation", { exact: true })).toBeVisible(),
    "new appointment status is shown as awaiting confirmation",
  );

  await page.getByRole("button", { name: "Cancel appointment" }).click();
  const confirmation = page.getByRole("alertdialog");
  await check(
    expect(confirmation.getByRole("heading", { name: "Cancel this appointment?" })).toBeVisible(),
    "cancellation confirmation is shown",
  );
  await confirmation.getByRole("button", { name: "Cancel appointment" }).click();
  await check(
    expect(page.getByText("Cancelled", { exact: true })).toBeVisible({ timeout: 20_000 }),
    "cancelled appointment status updates in the interface",
  );
});

test("clinic staff sees the created appointment in the clinic portal", async ({ page }) => {
  addNetworkEvidence(page);
  await signIn(
    page,
    "clinic",
    process.env.CARECONNECT_CLINIC_EMAIL!,
    process.env.CARECONNECT_CLINIC_PASSWORD!,
  );
  await page.goto("/clinic/appointments");
  await check(
    expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible({ timeout: 20_000 }),
    "clinic appointment page opens for an authorized staff member",
  );
  const appointmentRow = page
    .getByRole("row")
    .filter({ hasText: "Synthetic CI Patient" })
    .filter({ hasText: "Synthetic CI Doctor" })
    .filter({ hasText: process.env.CARECONNECT_BROWSER_APPOINTMENT_REASON! })
    .first();
  await check(
    expect(appointmentRow).toBeVisible({ timeout: 20_000 }),
    "clinic appointment table renders the synthetic patient and doctor",
  );
});

test("doctor sees the appointment, receives a patient message, and replies in the portals", async ({
  page,
  browser,
}) => {
  addNetworkEvidence(page);
  const conversationId = process.env.CARECONNECT_CONVERSATION_ID!;
  const patientMessage = "Synthetic UI patient message " + runId;
  const doctorReply = "Synthetic UI doctor reply " + runId;

  await patientAppointment(page);
  await page.goto("/messages?c=" + conversationId);
  const patientInput = page.getByLabel("Message", { exact: true });
  await check(
    expect(patientInput).toBeVisible({ timeout: 20_000 }),
    "patient message thread opens",
  );
  await patientInput.fill(patientMessage);
  await page.getByRole("button", { name: "Send message" }).click();
  await check(
    expect(page.getByText(patientMessage, { exact: true })).toBeVisible({ timeout: 20_000 }),
    "patient message appears in the patient portal",
  );

  const doctorPage = await browser.newPage();
  addNetworkEvidence(doctorPage);
  await signIn(
    doctorPage,
    "doctor",
    process.env.CARECONNECT_DOCTOR_EMAIL!,
    process.env.CARECONNECT_DOCTOR_PASSWORD!,
  );
  await doctorPage.goto("/doctor/appointments");
  const appointment = doctorPage
    .getByRole("listitem")
    .filter({ hasText: "Synthetic CI Patient" })
    .filter({ hasText: process.env.CARECONNECT_BROWSER_APPOINTMENT_REASON! });
  await check(
    expect(appointment).toBeVisible({ timeout: 20_000 }),
    "doctor appointments page displays the appointment created through patient UI",
  );
  await doctorPage.goto("/doctor/messages?c=" + conversationId);
  const doctorThread = doctorPage.getByRole("region", { name: "Synthetic CI Patient" });
  await check(
    expect(doctorThread.getByText(patientMessage, { exact: true })).toBeVisible({
      timeout: 40_000,
    }),
    "doctor inbox receives the patient message through its scoped inbox query",
  );
  await doctorPage.getByLabel("Write a reply", { exact: true }).fill(doctorReply);
  await doctorPage.getByRole("button", { name: "Send reply" }).click();
  await check(
    expect(doctorThread.getByText(doctorReply, { exact: true })).toBeVisible({ timeout: 20_000 }),
    "doctor reply appears in the doctor portal thread",
  );

  await page.reload();
  await check(
    expect(page.getByText(doctorReply, { exact: true })).toBeVisible({ timeout: 20_000 }),
    "patient sees the doctor reply in the patient portal",
  );
  await doctorPage.close();
});

test("administrator reviews the clinic and changes publication through the interface", async ({
  page,
}) => {
  addNetworkEvidence(page);
  await signIn(
    page,
    "patient",
    process.env.CARECONNECT_ADMIN_EMAIL!,
    process.env.CARECONNECT_ADMIN_PASSWORD!,
  );
  await page.goto("/admin");
  await check(
    expect(page.getByRole("heading", { name: "CareConnect administration" })).toBeVisible({
      timeout: 20_000,
    }),
    "platform administrator opens the administration interface",
  );
  await page.getByRole("tab", { name: "Provider publishing" }).click();
  const clinic = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: process.env.CARECONNECT_CLINIC_NAME! }) });
  await check(
    expect(clinic).toBeVisible({ timeout: 20_000 }),
    "publication panel displays the synthetic clinic",
  );
  await check(
    expect(clinic.getByText("Enabled", { exact: true }).first()).toBeVisible(),
    "clinic publication begins enabled",
  );
  await clinic.getByRole("button", { name: "Unpublish listing" }).click();
  await check(
    expect(clinic.getByText("Disabled", { exact: true }).first()).toBeVisible({ timeout: 20_000 }),
    "authorized administrator unpublishes the clinic through the UI",
  );
  await clinic.getByRole("button", { name: "Publish listing" }).click();
  await check(
    expect(clinic.getByText("Enabled", { exact: true }).first()).toBeVisible({ timeout: 20_000 }),
    "authorized administrator restores clinic publication through the UI",
  );
});

function workflowId(title: string): WorkflowId | null {
  return workflows.find((workflow) => workflow.title === title)?.id ?? null;
}

function writeWorkflowEvidence() {
  const directory = path.join(process.cwd(), "test-artifacts");
  mkdirSync(directory, { recursive: true });
  const completed = new Map(results.map((result) => [result.name, result]));
  const items = workflows.map(
    ({ id }) =>
      completed.get(id) ?? {
        name: id,
        status: "BLOCKED" as const,
        assertions: [],
        http_requests: 0,
        request_failures: 0,
      },
  );
  const counts = {
    passed: items.filter((item) => item.status === "PASS").length,
    failed: items.filter((item) => item.status === "FAIL").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
  };
  writeFileSync(
    path.join(directory, "browser-workflow-summary.json"),
    JSON.stringify(
      {
        environment: "disposable-local-supabase",
        test_cases: { total: items.length, ...counts },
        workflows: items,
        workflow_counts: counts,
        assertions: {
          total: items.reduce((sum, item) => sum + item.assertions.length, 0),
          passed: items.reduce(
            (sum, item) =>
              sum + item.assertions.filter((assertion) => assertion.status === "PASS").length,
            0,
          ),
          failed: items.reduce(
            (sum, item) =>
              sum + item.assertions.filter((assertion) => assertion.status === "FAIL").length,
            0,
          ),
          results: items.flatMap((item) =>
            item.assertions.map((assertion) => ({ workflow: item.name, ...assertion })),
          ),
        },
        service_operations: {
          kind: "observed browser HTTP requests",
          observed: items.reduce((sum, item) => sum + item.http_requests, 0),
          failed: items.reduce((sum, item) => sum + item.request_failures, 0),
        },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

test.afterEach(async ({ page }, testInfo: TestInfo) => {
  const name = workflowId(testInfo.title);
  if (!name) return;
  const status =
    testInfo.status === "skipped"
      ? "BLOCKED"
      : testInfo.status === testInfo.expectedStatus
        ? "PASS"
        : "FAIL";
  const events = trace.slice(traceOffset);
  const requestFailures = events.filter(
    (event) =>
      event.kind === "request-failed" ||
      (event.kind === "response" && event.status !== undefined && event.status >= 400),
  ).length;
  results.push({
    name,
    status,
    assertions: assertionResults,
    http_requests: events.filter((event) => event.kind === "request").length,
    request_failures: requestFailures,
  });
  writeWorkflowEvidence();

  if (status === "FAIL") {
    const directory = path.join(process.cwd(), "test-artifacts");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "browser-failure-trace.json"),
      JSON.stringify(
        {
          workflow: name,
          status,
          failure_path: new URL(page.url()).pathname,
          assertions: assertionResults,
          request_events: events,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
});

test.afterAll(() => writeWorkflowEvidence());
