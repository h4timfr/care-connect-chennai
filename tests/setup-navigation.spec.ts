import { expect, test } from "./support/fixtures";
import { enablePatientContact, ids } from "./support/mock-backend";

const hours = {
  id: "schedule-test",
  clinic_id: ids.clinicA,
  doctor_id: ids.doctorVerified,
  day_of_week: 1,
  start_time: "09:00:00",
  end_time: "10:00:00",
  slot_minutes: 15,
};

const doctorApplication = {
  id: "doctor-application",
  full_name: "Synthetic Doctor Applicant",
  specialty_id: "general",
  status: "submitted",
  created_at: "2026-01-01T00:00:00Z",
};

test("a doctor applicant sees their progress without entering the protected doctor workflow", async ({
  page,
  backend,
}) => {
  const mock = await backend({ doctorApplications: [doctorApplication] });
  await page.goto("/doctor/login");
  await expect(page).toHaveURL(/\/doctor\/?$/);
  const checklist = page.getByRole("region", { name: "Doctor setup" });
  await expect(
    checklist.getByRole("listitem").filter({ hasText: "Application submitted" }),
  ).toContainText("Under review");
  await expect(
    checklist.getByRole("listitem").filter({ hasText: "Profile approved" }),
  ).toContainText("Pending");
  await expect(checklist.getByRole("link", { name: "View application" })).toHaveAttribute(
    "href",
    "/doctor/signup",
  );
  expect(mock.callsTo("POST", "/rpc/doctor_appointments")).toHaveLength(0);
  await page.goto("/doctor/messages");
  await expect(
    page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
  ).toBeVisible();
});

test("doctor readiness requires hours and publishing at the same verified clinic", async ({
  page,
  backend,
}) => {
  const mock = await backend({ schedules: [hours] });
  enablePatientContact(mock.state, ids.clinicA, false);
  enablePatientContact(mock.state, ids.clinicB, true);
  const doctor = mock.state.doctors[0]!;
  doctor["user_id"] = ids.user;
  (doctor["clinic_doctors"] as unknown[]).push({
    clinic_id: ids.clinicB,
    active: true,
    verification_state: "verified",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/doctor");
  const checklist = page.getByRole("region", { name: "Doctor setup" });
  const readiness = checklist
    .getByRole("listitem")
    .filter({ hasText: "Ready to receive appointments" });
  await expect(
    checklist.getByRole("listitem").filter({ hasText: "Clinic connection accepted" }),
  ).toContainText("No separate consent record");
  await expect(
    checklist.getByRole("listitem").filter({ hasText: "Clinic relationship verified" }),
  ).toContainText("Complete");
  await expect(
    checklist.getByRole("listitem").filter({ hasText: "Consultation hours configured" }),
  ).toContainText("Complete");
  await expect(readiness).toContainText("Pending");
  expect(mock.callsTo("GET", "/rest/v1/doctor_schedules")).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  mock.state.schedules = [{ ...hours, clinic_id: ids.clinicB, end_time: "09:05:00" }];
  await page.reload();
  await expect(readiness).toContainText("Waiting for earlier steps");
  await expect(
    checklist.getByText("Set a consultation window long enough", { exact: false }),
  ).toBeVisible();

  mock.state.schedules = [{ ...hours, clinic_id: ids.clinicB }];
  await page.reload();
  await expect(readiness).toContainText("Complete");
});

test("clinic setup distinguishes consent, verification, hours, booking and patient contact", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  enablePatientContact(mock.state, ids.clinicA, true);
  const clinic = mock.state.clinics[0]!;
  clinic["patient_contact_permission"] = "not_granted";
  mock.state.memberships = [{ clinic_id: ids.clinicA, role: "clinic_admin", clinics: clinic }];
  const doctor = mock.state.doctors[0]!;
  doctor["clinic_doctors"] = [];
  let requestStatus = "requested";
  await page.route("**/rest/v1/rpc/list_doctor_clinic_link_requests", (route) =>
    route.fulfill({
      json: [{ id: "link-request", doctor_id: ids.doctorVerified, status: requestStatus }],
    }),
  );
  await page.goto("/clinic");
  const checklist = page.getByRole("region", { name: "Clinic setup" });
  const step = (label: string) => checklist.getByRole("listitem").filter({ hasText: label });
  await expect(step("Doctor invited or linked")).toContainText("Complete");
  await expect(step("Doctor consent and verification")).toContainText(
    "Waiting for doctor approval",
  );
  await expect(step("Online booking enabled")).toContainText("Waiting for earlier steps");

  requestStatus = "accepted";
  doctor["clinic_doctors"] = [
    { clinic_id: ids.clinicA, active: true, verification_state: "pending" },
  ];
  await page.reload();
  await expect(step("Doctor consent and verification")).toContainText("Awaiting verification");

  requestStatus = "verified";
  doctor["clinic_doctors"] = [
    { clinic_id: ids.clinicA, active: true, verification_state: "verified" },
  ];
  await page.reload();
  await expect(step("Doctor consent and verification")).toContainText("Complete");
  await expect(step("Consultation hours configured")).toContainText("Next action");
  await expect(step("Manage consultation hours").getByRole("link")).toHaveAttribute(
    "href",
    "/clinic/doctors#clinic-consultation-hours",
  );
  mock.state.schedules = [hours];
  await page.reload();
  await expect(step("Online booking enabled")).toContainText("Complete");
  await expect(step("Patient contact enabled")).toContainText("Pending");
  await page.route("**/rest/v1/doctor_schedules?*", (route) =>
    route.fulfill({ status: 500, json: { code: "XX000" } }),
  );
  await page.reload();
  await expect(step("Online booking enabled")).toContainText("Status unavailable");
  await expect(step("Patient contact enabled")).toContainText("Pending");
});

test("admin review counts are visible at 375px and queues work by keyboard", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    platformAdmin: true,
    applications: [
      {
        id: "clinic-application",
        clinic_name: "Synthetic Clinic Applicant",
        status: "submitted",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    doctorApplications: [doctorApplication],
  });
  mock.state.doctors[1]!["is_demo"] = false;
  mock.state.clinics[1]!["is_demo"] = false;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin");
  const tabs = page.getByRole("tablist", { name: "Review queues" });
  const clinic = tabs.getByRole("tab", { name: "Clinic applications" });
  const doctor = tabs.getByRole("tab", { name: "Doctor applications" });
  const links = tabs.getByRole("tab", { name: "Doctor verification" });
  for (const tab of [clinic, doctor, links]) {
    await expect(tab).toHaveAccessibleDescription("Awaiting review: 1");
  }
  await clinic.focus();
  await clinic.press("ArrowRight");
  await expect(doctor).toBeFocused();
  await expect(page.getByRole("heading", { name: "Synthetic Doctor Applicant" })).toBeVisible();
  await doctor.press("ArrowRight");
  await expect(links).toBeFocused();
  await expect(page.getByRole("heading", { name: "Dr. Pending Tester" })).toBeVisible();
  await links.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Provider publishing" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(mock.callsTo("GET", "/rest/v1/provider_applications")).toHaveLength(1);
  expect(mock.callsTo("GET", "/rest/v1/doctor_applications")).toHaveLength(1);
  expect(mock.callsTo("GET", "/rest/v1/clinic_doctors")).toHaveLength(1);
});

for (const relationship of ["pending", "verified", "rejected", "absent"] as const) {
  test(`doctor setup handles a ${relationship} clinic relationship without a request record`, async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    const doctor = mock.state.doctors[0]!;
    doctor["user_id"] = ids.user;
    doctor["clinic_doctors"] =
      relationship === "absent"
        ? []
        : [{ clinic_id: ids.clinicA, active: true, verification_state: relationship }];

    await page.goto("/doctor");
    const checklist = page.getByRole("region", { name: "Doctor setup" });
    const connection = checklist
      .getByRole("listitem")
      .filter({ hasText: "Clinic connection accepted" });
    const verification = checklist
      .getByRole("listitem")
      .filter({ hasText: "Clinic relationship verified" });
    const request = connection.getByRole("link", { name: "View link requests" });

    if (relationship === "pending") {
      await expect(connection).toContainText("Awaiting verification");
      await expect(verification).toContainText("Pending");
      await expect(request).toHaveCount(0);
      await expect(connection).not.toContainText("Share your profile ID");
    } else if (relationship === "verified") {
      await expect(connection).toContainText("No separate consent record");
      await expect(verification).toContainText("Complete");
      await expect(request).toHaveCount(0);
    } else {
      await expect(connection).toContainText("Share your profile ID");
      await expect(verification).toContainText("Waiting for earlier steps");
      await expect(request).toBeVisible();
    }
  });
}
