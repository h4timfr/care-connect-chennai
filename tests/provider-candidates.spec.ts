import { test, expect } from "./support/fixtures";
import { candidateFixtures, candidateIds, type CandidateState } from "./support/mock-backend";

// Private provider-candidate review (/admin/providers, migration 00056). Records are synthetic
// test data. The database is the boundary (pgTAP 013); these tests check the screen never
// widens it and never presents candidates as providers.

const asState = (c: CandidateState) => ({ candidates: c });

test.describe("Provider candidate review", () => {
  test("is closed to accounts without the platform_admin role and requests no candidate data", async ({
    page,
    backend,
  }) => {
    const mock = await backend(asState(candidateFixtures()));
    await page.goto("/admin/providers");
    await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
    expect(mock.calls.filter((c) => c.path.includes("/rest/v1/candidate_"))).toEqual([]);
  });

  test("before migration 00056 it says the update isn't deployed", async ({ page, backend }) => {
    await backend({ platformAdmin: true, candidates: "notDeployed" });
    await page.goto("/admin/providers");
    await expect(page.getByText("needs a backend update")).toBeVisible();
  });

  test("with nothing imported it explains how the catalogue arrives", async ({ page, backend }) => {
    await backend({ platformAdmin: true });
    await page.goto("/admin/providers");
    await expect(page.getByText("No research candidates imported yet")).toBeVisible();
  });

  test("candidates are clearly marked as research, not providers, and never bookable", async ({
    page,
    backend,
  }) => {
    await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto("/admin/providers");
    await expect(page.getByText("Research candidates are not CareConnect providers")).toBeVisible();
    await page.getByRole("button", { name: /Test Candidate Facility Adyar/ }).click();
    const detail = page.getByRole("article", { name: "Test Candidate Facility Adyar" });
    await expect(detail.getByText("Research candidate", { exact: true })).toBeVisible();
    await expect(detail.getByText("Booking off")).toBeVisible();
    await expect(detail.getByText("Two address formulations found for this branch")).toBeVisible();
    const link = detail.getByRole("link", { name: /example\.invalid\/facility-a\/about/ });
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("target", "_blank");
    // The researched relationship keeps its research classification, separate from CareConnect's.
    await expect(detail.getByText("Needs confirmation (research)")).toBeVisible();
    await expect(detail.getByLabel("CareConnect conclusion")).toHaveValue("unverified");
  });

  test("filters by status, locality and open issues", async ({ page, backend }) => {
    await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto("/admin/providers");
    const list = page.getByRole("list", { name: "Facilities" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await page.getByLabel("Locality").selectOption("Guindy");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByLabel("Locality").selectOption("");
    await page.getByLabel("Only with open issues").check();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByText("Test Candidate Facility Adyar")).toBeVisible();
    await page.getByLabel("Review status").first().selectOption("verified");
    await expect(page.getByText("No candidates match these filters")).toBeVisible();
  });

  test("verification needs evidence: the database refusal is shown, then evidence unlocks it", async ({
    page,
    backend,
  }) => {
    const mock = await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto(`/admin/providers?tab=facilities&id=${candidateIds.facilityA}`);
    const detail = page.getByRole("article", { name: "Test Candidate Facility Adyar" });
    await detail.locator("#review-status").selectOption("verified");
    await detail.getByRole("button", { name: "Save review" }).click();
    await expect(detail.getByRole("alert")).toContainText("record the required identity evidence");

    for (const [type, value] of [
      ["clinic_identity", "Registration certificate seen"],
      ["address", "Address confirmed"],
      ["contact_details", "Front desk number confirmed"],
    ] as const) {
      await detail.getByRole("button", { name: "Record evidence" }).click();
      await detail.getByLabel("Evidence type").selectOption(type);
      await detail.getByLabel("What was confirmed").fill(value);
      await detail
        .getByRole("textbox", { name: "Source" })
        .fill("Video call with the administrator");
      await detail.getByRole("button", { name: "Save evidence" }).click();
      await expect(page.getByText("Evidence recorded").first()).toBeVisible();
    }
    const posted = mock
      .callsTo("POST", "/rest/v1/candidate_evidence")
      .map((c) => c.body as Record<string, unknown>);
    expect(posted).toHaveLength(3);
    for (const body of posted) {
      expect(Object.keys(body)).not.toContain("recorded_by");
      expect(body["facility_candidate_id"]).toBe(candidateIds.facilityA);
    }

    await detail.locator("#review-status").selectOption("verified");
    await detail.getByRole("button", { name: "Save review" }).click();
    await expect(page.getByText("Review saved")).toBeVisible();
    // Verification never touches the real provider tables or booking.
    expect(
      mock.calls.filter(
        (c) =>
          c.method !== "GET" &&
          /\/rest\/v1\/(clinics|doctors|clinic_doctors|doctor_schedules)/.test(c.path),
      ),
    ).toEqual([]);
    expect(
      JSON.stringify(mock.callsTo("PATCH", "/rest/v1/candidate_facilities").map((c) => c.body)),
    ).not.toContain("booking_enabled");
  });

  test("a logged contact never grants listing permission", async ({ page, backend }) => {
    const mock = await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto(`/admin/providers?tab=facilities&id=${candidateIds.facilityA}`);
    const detail = page.getByRole("article", { name: "Test Candidate Facility Adyar" });
    await detail.getByRole("button", { name: "Log a contact attempt" }).click();
    await detail.getByLabel("Method").selectOption("phone");
    await detail.getByLabel("Outcome").selectOption("interested");
    await detail.locator("#contact-permission").selectOption("granted");
    await detail.getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Contact logged")).toBeVisible();
    expect(mock.callsTo("PATCH", "/rest/v1/candidate_facilities")).toEqual([]);

    await detail.locator("#permission-status").selectOption("granted");
    await detail.getByRole("button", { name: "Save review" }).click();
    await expect(detail.getByRole("alert")).toContainText("listing permission evidence");
  });

  test("a researched relationship can't be confirmed without relationship evidence", async ({
    page,
    backend,
  }) => {
    await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto(`/admin/providers?tab=doctors&id=${candidateIds.doctorA}`);
    const detail = page.getByRole("article", { name: "Test Candidate Doctor" });
    await expect(detail.getByText("Not verified", { exact: true })).toBeVisible();
    await detail.getByLabel("CareConnect conclusion").selectOption("confirmed");
    await expect(
      page.getByText("Record relationship evidence before confirming").first(),
    ).toBeVisible();
  });

  test("patients never load candidate data anywhere in the app", async ({ page, backend }) => {
    const mock = await backend(asState(candidateFixtures()));
    for (const path of ["/", "/discover", "/discover?tab=clinics", "/profile"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(mock.calls.filter((c) => c.path.includes("candidate_"))).toEqual([]);
    await expect(page.getByText("Test Candidate Facility")).toHaveCount(0);
  });

  for (const width of [320, 375, 390, 430]) {
    test(`fits a ${width}px phone, list and detail`, async ({ page, backend }) => {
      await page.setViewportSize({ width, height: 800 });
      await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
      for (const path of [
        "/admin/providers",
        `/admin/providers?tab=facilities&id=${candidateIds.facilityA}`,
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  }

  test("Urdu renders right-to-left with translated labels", async ({ page, backend }) => {
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("baseURL is not configured");
    await page.context().addCookies([{ name: "cc_lang", value: "ur", url: baseURL }]);
    await page.setViewportSize({ width: 375, height: 800 });
    await backend({ platformAdmin: true, ...asState(candidateFixtures()) });
    await page.goto(`/admin/providers?tab=facilities&id=${candidateIds.facilityA}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("تحقیقی امیدوار CareConnect فراہم کنندگان نہیں ہیں")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
