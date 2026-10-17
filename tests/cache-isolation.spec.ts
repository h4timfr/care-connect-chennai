import { QueryClient } from "@tanstack/react-query";
import { clearPrivateQueryCache } from "../src/lib/supabase/private-query-cache";
import { expect, test } from "./support/fixtures";
import { candidateFixtures, fakeAccessToken, ids } from "./support/mock-backend";

const accountB = "00000000-0000-4000-8000-0000000000b2";

test("direct principal change drops private cache and keeps public results", () => {
  const client = new QueryClient();
  client.setQueryData(["clinics"], [{ id: "public" }]);
  client.setQueryData(["doctor_appointments", ids.user], [{ patientName: "Private A" }]);
  client.setQueryData(["conversations", ids.user], [{ id: "private-a" }]);
  client.setQueryData(["candidates", ids.user], [{ id: "admin-a" }]);
  client.setQueryData(["admin", "clinics"], [{ id: "unpublished", phone: "private" }]);

  clearPrivateQueryCache(client); // A -> B, with no intermediate anonymous session.
  expect(client.getQueryData(["doctor_appointments", ids.user])).toBeUndefined();
  expect(client.getQueryData(["conversations", ids.user])).toBeUndefined();
  expect(client.getQueryData(["candidates", ids.user])).toBeUndefined();
  expect(client.getQueryData(["admin", "clinics"])).toBeUndefined();
  expect(client.getQueryData(["clinics"])).toEqual([{ id: "public" }]);

  client.setQueryData(["doctor_appointments", accountB], [{ patientName: "Private B" }]);
  clearPrivateQueryCache(client); // B -> signed out.
  expect(client.getQueryData(["doctor_appointments", accountB])).toBeUndefined();
  client.clear();
});

test("direct doctor A to doctor B switch never renders A's appointment data", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    doctorAppointments: [
      {
        id: "a-appointment",
        clinic_id: ids.clinicA,
        clinic_name: "Test Clinic A",
        date: "2099-01-05",
        time: "10:00:00",
        status: "confirmed",
        reason: "Test",
        patient_name: "Private A",
      },
    ],
  });
  mock.state.doctors[0]!["user_id"] = ids.user;
  await page.goto("/doctor/appointments");
  await expect(page.getByText("Private A")).toBeVisible({ timeout: 15000 });

  mock.state.authUserId = accountB;
  mock.state.authEmail = "doctor-b@test.invalid";
  mock.state.doctors[0]!["user_id"] = null;
  mock.state.doctors[1]!["user_id"] = accountB;
  mock.state.doctorAppointments = [
    {
      id: "b-appointment",
      clinic_id: ids.clinicB,
      clinic_name: "Test Clinic B",
      date: "2099-01-06",
      time: "11:00:00",
      status: "confirmed",
      reason: "Test",
      patient_name: "Private B",
    },
  ];
  await page.evaluate(
    ({ userId, email, accessToken }) => {
      const key = "sb-careconnect-test-auth-token";
      const previous = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>;
      if (!previous) throw new Error("Mock session missing");
      const user = previous["user"] as Record<string, unknown>;
      const next = { ...previous, access_token: accessToken, user: { ...user, id: userId, email } };
      localStorage.setItem(key, JSON.stringify(next));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session: next });
      channel.close();
    },
    {
      userId: accountB,
      email: "doctor-b@test.invalid",
      accessToken: fakeAccessToken(accountB, "doctor-b@test.invalid"),
    },
  );

  await expect(page.getByText("Private B")).toBeVisible();
  await expect(page.getByText("Private A")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Private B")).toBeVisible();
  await expect(page.getByText("Private A")).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/doctor\/login/);
  mock.state.authUserId = ids.user;
  mock.state.authEmail = "patient@test.invalid";
  mock.state.doctors[0]!["user_id"] = ids.user;
  mock.state.doctors[1]!["user_id"] = null;
  mock.state.doctorAppointments = [
    {
      id: "a-appointment",
      clinic_id: ids.clinicA,
      clinic_name: "Test Clinic A",
      date: "2099-01-05",
      time: "10:00:00",
      status: "confirmed",
      reason: "Test",
      patient_name: "Private A",
    },
  ];
  await page.getByLabel("Email").fill("patient@test.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in to Doctor Portal" }).click();
  await page.goto("/doctor/appointments");
  await expect(page.getByText("Private A")).toBeVisible();
  await expect(page.getByText("Private B")).toHaveCount(0);
});

test("admin to patient switch closes private candidate review", async ({ page, backend }) => {
  const mock = await backend({ platformAdmin: true, candidates: candidateFixtures() });
  await page.goto("/admin/providers");
  await expect(page.getByText("Test Candidate Facility Adyar")).toBeVisible();

  mock.state.authUserId = accountB;
  mock.state.authEmail = "patient-b@test.invalid";
  mock.state.platformAdmin = false;
  await page.evaluate(
    ({ userId, accessToken }) => {
      const key = "sb-careconnect-test-auth-token";
      const previous = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>;
      if (!previous) throw new Error("Mock session missing");
      const user = previous["user"] as Record<string, unknown>;
      const next = {
        ...previous,
        access_token: accessToken,
        user: { ...user, id: userId, email: "patient-b@test.invalid" },
      };
      localStorage.setItem(key, JSON.stringify(next));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session: next });
      channel.close();
    },
    { userId: accountB, accessToken: fakeAccessToken(accountB, "patient-b@test.invalid") },
  );
  await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
  await expect(page.getByText("Test Candidate Facility Adyar")).toHaveCount(0);
});

test("patient to linked doctor transition starts with fresh provider data", async ({
  page,
  backend,
}) => {
  const mock = await backend({
    doctorAppointments: [
      {
        id: "new-doctor-appointment",
        clinic_id: ids.clinicA,
        clinic_name: "Test Clinic A",
        date: "2099-01-07",
        time: "12:00:00",
        status: "confirmed",
        reason: "Test",
        patient_name: "Doctor B Patient",
      },
    ],
  });
  await page.goto("/doctor/appointments");
  await expect(
    page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
  ).toBeVisible();

  mock.state.authUserId = accountB;
  mock.state.authEmail = "doctor-b@test.invalid";
  mock.state.doctors[0]!["user_id"] = accountB;
  await page.evaluate(
    ({ userId, accessToken }) => {
      const key = "sb-careconnect-test-auth-token";
      const previous = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>;
      if (!previous) throw new Error("Mock session missing");
      const user = previous["user"] as Record<string, unknown>;
      const next = {
        ...previous,
        access_token: accessToken,
        user: { ...user, id: userId, email: "doctor-b@test.invalid" },
      };
      localStorage.setItem(key, JSON.stringify(next));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session: next });
      channel.close();
    },
    { userId: accountB, accessToken: fakeAccessToken(accountB, "doctor-b@test.invalid") },
  );
  await expect(page.getByText("Doctor B Patient")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Doctor access isn't enabled for this account" }),
  ).toHaveCount(0);
});
