import { conversationRow, defaultState, fakeAccessToken, ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

const accountB = "00000000-0000-4000-8000-0000000000b2";
const patientB = "00000000-0000-4000-8000-0000000000b3";

for (const role of ["patient", "clinic", "doctor"] as const) {
  for (const transition of ["logout", "account-switch"] as const) {
    test(`${role}: ${transition} isolates a pending send and its draft`, async ({
      page,
      backend,
    }) => {
      const state = defaultState();
      if (role === "doctor") state.doctors[0]!["user_id"] = ids.user;
      const mock = await backend({
        doctors: state.doctors,
        memberships:
          role === "clinic"
            ? [{ clinic_id: ids.clinicA, role: "clinic_staff", clinics: state.clinics[0] }]
            : [],
        conversations: [conversationRow([])],
        doctorConversations: [
          {
            id: ids.conversation,
            clinic_id: ids.clinicA,
            clinic_name: "Test Clinic A",
            patient_name: "Synthetic Recipient",
            messages: [],
          },
        ],
      });
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let submissions = 0;
      await page.route("**/rest/v1/messages", async (route) => {
        submissions += 1;
        await pending;
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "Synthetic denied old request" }),
        });
      });
      const url = role === "patient" ? "/messages" : `/${role}/messages`;
      await page.goto(`${url}?c=${ids.conversation}`);
      const input = page.getByRole("textbox");
      await input.fill("Private draft from account A");
      const request = page.waitForRequest(
        (r) => r.method() === "POST" && r.url().includes("/rest/v1/messages"),
      );
      await page
        .getByRole("button", { name: role === "patient" ? "Send message" : "Send reply" })
        .click();
      expect((await request).postDataJSON()).toMatchObject({ sender_id: ids.user });
      await input.fill("Unsent edit from account A");
      try {
        if (transition === "logout") {
          await page.evaluate(() => {
            const key = "sb-careconnect-test-auth-token";
            localStorage.removeItem(key);
            const channel = new BroadcastChannel(key);
            channel.postMessage({ event: "SIGNED_OUT", session: null });
            channel.close();
          });
          await expect(page).toHaveURL(/\/login/);
        } else {
          mock.state.authUserId = accountB;
          mock.state.authEmail = "account-b@test.invalid";
          mock.state.patients =
            state.patients === "error"
              ? []
              : state.patients.map((row) => ({
                  ...row,
                  id: patientB,
                  user_id: accountB,
                }));
          if (role === "doctor") mock.state.doctors[0]!["user_id"] = accountB;
          if (role === "patient") {
            mock.state.conversations = [
              {
                ...conversationRow([]),
                id: "account-b-conversation",
                patient_id: patientB,
                patients: { full_name: "Synthetic B", user_id: accountB },
              },
            ];
          }
          // Staff may share a conversation; the patient instead receives a distinct authorized row.
          const nextProfile = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/rest/v1/patients" &&
              url.searchParams.get("user_id") === `eq.${accountB}`
            );
          });
          await page.evaluate(
            ({ userId, accessToken }) => {
              const key = "sb-careconnect-test-auth-token";
              const previous = JSON.parse(localStorage.getItem(key) ?? "null");
              if (!previous) throw new Error("Synthetic session unavailable");
              const next = {
                ...previous,
                access_token: accessToken,
                user: { ...previous.user, id: userId, email: "account-b@test.invalid" },
              };
              localStorage.setItem(key, JSON.stringify(next));
              const channel = new BroadcastChannel(key);
              channel.postMessage({ event: "SIGNED_IN", session: next });
              channel.close();
            },
            { userId: accountB, accessToken: fakeAccessToken(accountB, "account-b@test.invalid") },
          );
          await (await nextProfile).finished();
          if (role === "patient") {
            await page.getByRole("button", { name: /Test Clinic A/ }).click();
            await expect(page).toHaveURL(/c=account-b-conversation/);
          }
          await expect(input).toHaveValue("");
          await input.fill("Account B draft");
        }
        const denied = page.waitForResponse(
          (r) => r.status() === 403 && r.url().includes("/rest/v1/messages"),
        );
        release();
        await (await denied).finished();
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        expect(submissions).toBe(1);
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
        if (transition === "account-switch") {
          await expect(input).toHaveValue("Account B draft");
        } else {
          await expect(page).toHaveURL(/\/login/);
          await expect(page.getByText("Unsent edit from account A", { exact: true })).toHaveCount(
            0,
          );
        }
      } finally {
        release();
      }
    });
  }
}
