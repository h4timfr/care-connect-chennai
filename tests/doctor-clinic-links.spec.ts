import { expect, test } from "./support/fixtures";
import { ids } from "./support/mock-backend";

const requestId = "00000000-0000-4000-8000-000000000631";
const requestRow = {
  id: requestId,
  clinic_name: "Test Clinic A",
  doctor_id: ids.doctorPending,
  doctor_name: null,
  status: "requested",
};

test("clinic admin requests an existing profile and sees consent and review as distinct", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  const clinic = mock.state.clinics[0]!;
  clinic["is_demo"] = false;
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_admin", active: true, clinics: clinic },
  ];

  let state = "";
  const submissions: unknown[] = [];
  await page.route("**/rest/v1/rpc/list_doctor_clinic_link_requests", (route) =>
    route.fulfill({ json: state ? [{ ...requestRow, status: state }] : [] }),
  );
  await page.route("**/rest/v1/rpc/request_doctor_clinic_link", (route) => {
    submissions.push(route.request().postDataJSON());
    if (state)
      return route.fulfill({ status: 409, json: { code: "23505", message: "Already requested" } });
    state = "requested";
    return route.fulfill({ json: requestId });
  });

  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/clinic/doctors");
  const form = page.getByRole("region", { name: "Link an existing doctor" });
  const profileId = form.getByLabel("Doctor profile ID");
  const send = form.getByRole("button", { name: "Send link request" });
  await profileId.fill("not-a-profile-id");
  await send.click();
  await expect(form.getByRole("alert")).toContainText("Enter the doctor profile ID");
  expect(submissions).toHaveLength(0);

  await profileId.fill(ids.doctorPending);
  await send.click();
  await expect(form.getByText("Waiting for doctor approval")).toBeVisible();
  expect(submissions).toEqual([{ p_clinic_id: ids.clinicA, p_doctor_id: ids.doctorPending }]);
  expect(mock.callsTo("POST", "/rpc/clinic_propose_doctor")).toHaveLength(0);

  await profileId.fill(ids.doctorPending);
  await send.click();
  await expect(form.getByRole("alert")).toContainText("already exists");
  await expect(profileId).toHaveValue(ids.doctorPending);

  const doctor = mock.state.doctors.find((row) => row["id"] === ids.doctorPending)!;
  const link = { clinic_id: ids.clinicA, active: true, verification_state: "pending" };
  doctor["clinic_doctors"] = [link];
  state = "accepted";
  const refresh = form.getByRole("button", { name: "Refresh requests" });
  await refresh.click();
  await expect(form.getByText("Awaiting verification")).toBeVisible();
  await expect(form.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  const doctorCard = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Dr. Pending Tester" }),
  });
  await expect(doctorCard).toBeVisible();
  await expect(doctorCard.getByRole("button", { name: "Edit hours" })).toHaveCount(0);

  state = "verified";
  link.verification_state = "verified";
  await refresh.click();
  await expect(doctorCard.getByRole("button", { name: "Edit hours" })).toBeVisible();
});

test("linked doctor can accept on the dashboard and sees verification is still pending", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  const doctor = mock.state.doctors.find((row) => row["id"] === ids.doctorPending)!;
  Object.assign(doctor, { user_id: ids.user, is_demo: false, clinic_doctors: [] });
  let state = "requested";
  let fail = true;
  const responses: unknown[] = [];
  await page.route("**/rest/v1/rpc/list_doctor_clinic_link_requests", (route) =>
    route.fulfill({ json: [{ ...requestRow, status: state }] }),
  );
  await page.route("**/rest/v1/rpc/respond_doctor_clinic_link", (route) => {
    responses.push(route.request().postDataJSON());
    if (fail) return route.fulfill({ status: 500, json: { code: "XX000", message: "Failed" } });
    state = "accepted";
    return route.fulfill({ status: 204 });
  });

  await page.goto("/doctor");
  const inbox = page.getByRole("region", { name: "Link to a clinic" });
  await expect(inbox.getByLabel("Doctor profile ID")).toHaveValue(ids.doctorPending);
  await expect(inbox.getByText("Test Clinic A")).toBeVisible();
  await inbox.getByRole("button", { name: "Accept request" }).click();
  await expect(inbox.getByRole("alert")).toBeVisible();
  await expect(inbox.getByText("Waiting for doctor approval")).toBeVisible();
  fail = false;
  await inbox.getByRole("button", { name: "Accept request" }).click();
  await expect(inbox.getByText("Awaiting verification")).toBeVisible();
  await expect(inbox.getByRole("button", { name: "Accept request" })).toHaveCount(0);
  expect(responses).toEqual([
    { p_request_id: requestId, p_action: "accept" },
    { p_request_id: requestId, p_action: "accept" },
  ]);
});

test("clinic staff have no relationship controls or request-queue read", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  const clinic = mock.state.clinics[0]!;
  clinic["is_demo"] = false;
  mock.state.memberships = [
    { clinic_id: ids.clinicA, role: "clinic_staff", active: true, clinics: clinic },
  ];
  await page.goto("/clinic/doctors");
  await expect(
    page.getByText("Only your clinic's administrator can propose new doctors."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Link an existing doctor" })).toHaveCount(0);
  expect(mock.callsTo("POST", "/rpc/list_doctor_clinic_link_requests")).toHaveLength(0);
});
