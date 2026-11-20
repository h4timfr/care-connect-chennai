import { expect, test } from "./support/fixtures";

for (const [portal, table] of [
  ["clinic", "provider_applications"],
  ["doctor", "doctor_applications"],
] as const) {
  test(`${portal} application history failure blocks submission until retry succeeds`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ failTables: [table] });
    await page.goto(`/${portal}/signup`);
    await expect(page.getByRole("alert")).toContainText("Something went wrong");
    await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);
    expect(mock.callsTo("POST", `/rest/v1/${table}`)).toEqual([]);

    mock.state.failTables = [];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Submit application" })).toBeEnabled();
  });
}

test("clinic application rejects a fractional doctor count before sending a request", async ({
  page,
  backend,
}) => {
  const mock = await backend();
  await page.goto("/clinic/signup");
  await page.getByLabel(/^Clinic name/).fill("Synthetic Health Clinic");
  await page.getByLabel(/^Area/).fill("Adyar");
  await page.getByLabel(/^Full address/).fill("12 Main Road, Adyar, Chennai");
  await page.getByLabel(/^Registration details/).fill("Synthetic registration");
  await page.getByLabel(/^Your name/).fill("Synthetic Applicant");
  await page.getByLabel(/^Phone/).fill("+91 98400 00000");
  await page.locator("#doctor-count").fill("1.5");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("alert")).toContainText("The number of doctors");
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);

  await page.locator("#doctor-count").fill("2");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Application received")).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")[0]?.body).toMatchObject({
    doctor_count: 2,
  });
});

test("a denied doctor review leaves the application pending and a confirmed rejection is shown", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    platformAdmin: true,
    doctorApplications: [
      {
        id: "synthetic-doctor-application",
        full_name: "Synthetic Doctor Applicant",
        specialty_id: "general",
        qualifications: "Synthetic qualifications",
        registration_council: "Synthetic council",
        registration_number: "SYNTHETIC",
        experience_years: 1,
        contact_phone: "9840000000",
        contact_email: "doctor@test.invalid",
        status: "submitted",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Doctor applications" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Synthetic Doctor Applicant" });
  await expect(row.getByText("Under review")).toBeVisible();
  const note = "Synthetic registration could not be verified";
  await row.getByLabel("Note to the applicant (optional)").fill(note);
  await row.getByRole("button", { name: "Reject", exact: true }).click();
  const endpoint = "/rest/v1/rpc/admin_review_doctor_application";
  expect(mock.callsTo("POST", endpoint)).toHaveLength(0);

  mock.state.platformAdmin = false;
  await row.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("You don't have permission to do that.")).toBeVisible();
  await expect(row.getByText("Under review")).toBeVisible();
  await expect(row.getByLabel("Note to the applicant (optional)")).toHaveValue(note);

  mock.state.platformAdmin = true;
  await row.getByRole("button", { name: "Reject", exact: true }).click();
  await row.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Application rejected")).toBeVisible();
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(row.getByText("Not approved")).toBeVisible();
  await expect(row.getByText(note)).toBeVisible();
  expect(mock.callsTo("POST", endpoint)).toHaveLength(2);
});
