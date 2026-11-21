import { expect, test } from "./support/fixtures";
import { ids } from "./support/mock-backend";

test("a pending linked doctor sees their unpublished clinic name", async ({ page, backend }) => {
  const mock = await backend({ hiddenDoctorClinicIds: [ids.clinicB] });
  mock.state.doctors[1]!["user_id"] = ids.user;
  await page.goto("/doctor/profile");

  const clinic = page.getByRole("listitem").filter({ hasText: "Test Clinic B" });
  await expect(clinic).toContainText("Awaiting verification");
  const lookups = mock.callsTo("POST", "/rest/v1/rpc/my_linked_clinic_names");
  expect(lookups.length).toBeGreaterThan(0);
  for (const lookup of lookups) expect(lookup.body ?? {}).toEqual({});
});

test("admins can inspect demo links without actions, and can still verify a genuine link", async ({
  page,
  backend,
}) => {
  const mock = await backend({ platformAdmin: true });
  const genuine = mock.state.doctors[0]!;
  genuine["is_demo"] = false;
  genuine["name"] = "Genuine Applicant";
  genuine["clinic_doctors"] = [
    { clinic_id: ids.clinicA, active: true, verification_state: "pending" },
    { clinic_id: ids.clinicB, active: false, verification_state: "rejected" },
  ];
  mock.state.clinics[0]!["is_demo"] = false;

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Test/Demo" }).click();
  const demo = page.getByRole("tabpanel", { name: "Test/Demo" });
  await expect(demo).toContainText("Read-only");
  const pending = demo.getByRole("listitem").filter({ hasText: "Dr. Pending Tester" });
  await expect(pending).toContainText("Test Clinic B");
  await expect(pending).toContainText("Awaiting verification");
  const inactive = demo.getByRole("listitem").filter({ hasText: "Genuine Applicant" });
  await expect(inactive).toContainText("Test Clinic B");
  await expect(inactive).toContainText("Not verified");
  await expect(inactive).toContainText("Inactive");
  await expect(demo.getByText("Test Clinic A")).toHaveCount(0);
  await expect(demo.getByRole("button")).toHaveCount(0);
  await expect(demo.getByRole("link")).toHaveCount(0);
  const writes = () => mock.callsTo("PATCH", "/rest/v1/clinic_doctors");
  expect(writes()).toHaveLength(0);
  expect(mock.callsTo("POST", "/rest/v1/rpc/admin_set_clinic_publication_state")).toHaveLength(0);

  await page.getByRole("tab", { name: "Doctor verification" }).click();
  const queue = page.getByRole("tabpanel", { name: "Doctor verification" });
  await expect(queue.getByText("Dr. Pending Tester")).toHaveCount(0);
  await queue.getByRole("button", { name: "Verify doctor", exact: true }).click();
  await expect(queue.getByText("No doctors waiting for verification")).toBeVisible();
  expect(writes()).toHaveLength(1);
  expect(writes()[0]!.search).toContain(ids.doctorVerified);
  expect(writes()[0]!.body).toEqual({ verification_state: "verified" });
});

test("the demo section is unavailable to a non-admin", async ({ page, backend }) => {
  const mock = await backend();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Test/Demo" })).toHaveCount(0);
  expect(mock.callsTo("POST", "/rest/v1/rpc/admin_demo_doctor_links")).toHaveLength(0);
});
