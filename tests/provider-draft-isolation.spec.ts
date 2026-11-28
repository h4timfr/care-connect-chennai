import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  fakeAccessToken,
  ids,
  mockBackend,
  PROJECT_REF,
  type MockBackend,
} from "./support/mock-backend";

const accountA = ids.user;
const accountB = "00000000-0000-4000-8000-0000000000b2";
const emailA = "first-applicant@test.invalid";
const emailB = "second-applicant@test.invalid";
const draftPrefix = "careconnect.providerApplicationDraft.v1:";
const authKey = `sb-${PROJECT_REF}-auth-token`;
const legacyDoctorKey = "careconnect.doctorApplicationDraft";
const legacyClinicKey = "careconnect.clinicApplicationDraft";
const firstClinic = "Synthetic Clinic A";
const firstNote = "Synthetic private application note A";
const testPassword = "draft-test-password-1";

function draftKey(portal: "doctor" | "clinic", accountId: string) {
  return `${draftPrefix}${portal}:${accountId}`;
}

function signupUser(id: string, email: string) {
  return {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: { full_name: "Synthetic Applicant" },
    identities: [{ id: "synthetic-identity" }],
    created_at: "2026-01-01T00:00:00Z",
  };
}

function authSession(userId: string, email: string) {
  return {
    access_token: fakeAccessToken(userId, email),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "test-refresh-token",
    user: signupUser(userId, email),
  };
}

async function changePrincipal(
  page: Page,
  mock: MockBackend,
  account: { id: string; email: string } | null,
) {
  if (account) {
    mock.state.authUserId = account.id;
    mock.state.authEmail = account.email;
  }
  const session = account ? authSession(account.id, account.email) : null;
  // Use the same Auth event Supabase emits when another tab switches principal.
  await page.evaluate(
    ({ key, session }) => {
      if (session) localStorage.setItem(key, JSON.stringify(session));
      else localStorage.removeItem(key);
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: session ? "SIGNED_IN" : "SIGNED_OUT", session });
      channel.close();
    },
    { key: authKey, session },
  );
}

async function seedDrafts(page: Page, drafts: Record<string, Record<string, string>>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, drafts);
}

function storedDraftKeys(page: Page) {
  return page.evaluate(
    (prefix) =>
      Object.keys(localStorage).filter((key) => {
        if (!key.startsWith(prefix)) return false;
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        return value && (!value.revision || !!value.form);
      }),
    draftPrefix,
  );
}

async function fillClinic(page: Page) {
  await page.getByLabel(/^Clinic name/).fill(firstClinic);
  await page.getByLabel(/^Area/).fill("Adyar");
  await page.getByLabel(/^Full address/).fill("1 Synthetic Test Street, Adyar");
  await page.getByLabel(/^Registration details/).fill("Synthetic registration 100");
  await page.getByLabel(/^Phone/).fill("0000000000");
  await page.getByLabel("Anything else we should know").fill(firstNote);
}

async function fillSignupAccount(page: Page) {
  await page.getByLabel(/^Full name/).fill("Synthetic Applicant");
  await page.getByLabel(/^Email/).fill(emailA);
  await page.getByLabel(/^Password/).fill(testPassword);
}

for (const { portal, field, label } of [
  { portal: "doctor", field: "fullName", label: /^Doctor's full name/ },
  { portal: "clinic", field: "clinicName", label: /^Clinic name/ },
] as const) {
  test(`${portal} signup opens only the current account's saved draft`, async ({
    page,
    backend,
  }) => {
    await backend({ authUserId: accountB, authEmail: emailB });
    await seedDrafts(page, {
      [draftKey(portal, accountA)]: {
        [field]: "First applicant's draft",
        contactPhone: "1111111111",
      },
      [draftKey(portal, accountB)]: { [field]: "Second applicant's draft" },
    });
    await page.goto(`/${portal}/signup`);

    await expect(page.getByLabel(label)).toHaveValue("Second applicant's draft");
    await expect(page.getByLabel(/^Phone/)).toHaveValue("");
  });
}

test("signed-out signup does not read an account's persisted draft", async ({ page, backend }) => {
  await backend({}, { signedIn: false });
  const key = draftKey("doctor", accountA);
  await seedDrafts(page, { [key]: { fullName: "Previously signed-in applicant" } });
  await page.addInitScript((draftKey) => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === draftKey) sessionStorage.setItem("__providerDraftRead", "1");
      return getItem.call(this, key);
    };
  }, key);
  await page.goto("/doctor/signup");

  await expect(page.getByLabel(/^Doctor's full name/)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Create account and submit" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("__providerDraftRead"))).toBeNull();
  expect(await storedDraftKeys(page)).toEqual([key]);
});

test("a doctor draft never fills clinic fields for the same account", async ({ page, backend }) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  await seedDrafts(page, {
    [draftKey("doctor", accountA)]: { fullName: "Synthetic Doctor A", contactPhone: "1111111111" },
  });
  await page.goto("/doctor/signup");
  await expect(page.getByLabel(/^Phone/)).toHaveValue("1111111111");

  await page.goto("/clinic/signup");
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
  await expect(page.getByLabel(/^Phone/)).toHaveValue("");
});

test("unscoped legacy drafts are deleted without adopting their fields", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  await seedDrafts(page, {
    [legacyDoctorKey]: { fullName: "Unowned old doctor draft" },
    [legacyClinicKey]: { clinicName: "Unowned old clinic draft" },
  });

  await page.goto("/clinic/signup");
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
  await page.goto("/doctor/signup");
  await expect(page.getByLabel(/^Doctor's full name/)).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(
        (keys) => keys.map((key) => localStorage.getItem(key)),
        [legacyDoctorKey, legacyClinicKey],
      ),
    )
    .toEqual([null, null]);
  expect(await storedDraftKeys(page)).toEqual([]);
});

test("signout and account switches reset mounted form state", async ({ page, backend }) => {
  const mock = await backend({ authUserId: accountA, authEmail: emailA });
  await page.goto("/clinic/signup");
  const clinicName = page.getByLabel(/^Clinic name/);
  const applicationMessage = page.getByLabel("Anything else we should know");
  await clinicName.fill(firstClinic);
  await applicationMessage.fill(firstNote);

  await changePrincipal(page, mock, { id: accountB, email: emailB });
  await expect(page.locator("#contact-email")).toHaveValue(emailB);
  await expect(clinicName).toHaveValue("");
  await expect(applicationMessage).toHaveValue("");
  await clinicName.fill("Second applicant's unsaved changes");

  await changePrincipal(page, mock, null);
  await expect(page.getByLabel(/^Password/)).toBeVisible();
  await expect(clinicName).toHaveValue("");
  await expect(applicationMessage).toHaveValue("");

  await changePrincipal(page, mock, { id: accountA, email: emailA });
  await expect(page.locator("#contact-email")).toHaveValue(emailA);
  await expect(clinicName).toHaveValue("");
  expect(await storedDraftKeys(page)).toEqual([]);
});

test("email confirmation lets the original applicant resume their own application", async ({
  page,
  backend,
}) => {
  const mock = await backend(
    {
      authUserId: accountA,
      authEmail: emailA,
      signupResponse: { status: 200, body: signupUser(accountA, emailA) },
    },
    { signedIn: false },
  );
  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  expect(await storedDraftKeys(page)).toEqual([]);

  await page.getByRole("button", { name: "Create account and submit" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
  expect(await storedDraftKeys(page)).toEqual([draftKey("clinic", accountA)]);
  const draft = await page.evaluate(
    (key) => localStorage.getItem(key),
    draftKey("clinic", accountA),
  );
  expect(draft?.includes(testPassword)).toBe(false);
  expect(draft?.includes("access_token")).toBe(false);
  expect(draft?.includes("refresh_token")).toBe(false);

  await page.reload();
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
  const hash = new URLSearchParams({
    access_token: fakeAccessToken(accountA, emailA),
    refresh_token: "test-refresh-token",
    expires_in: "3600",
    expires_at: String(Math.floor(Date.now() / 1000) + 3600),
    token_type: "bearer",
    type: "signup",
  });
  await page.goto(`/login#${hash}`);
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();

  await page.goto("/clinic/signup");
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  await expect(page.getByLabel("Anything else we should know")).toHaveValue(firstNote);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Application received")).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toHaveLength(1);
  expect(await storedDraftKeys(page)).toEqual([]);
});

test("immediate signup session submits once with the new account", async ({ page, backend }) => {
  const session = authSession(accountA, emailA);
  const mock = await backend(
    {
      authUserId: accountA,
      authEmail: emailA,
      signupResponse: { status: 200, body: session },
    },
    { signedIn: false },
  );
  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);

  const submission = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/rest/v1/provider_applications"),
  );
  await page.getByRole("button", { name: "Create account and submit" }).click();
  expect(
    (await (await submission).headerValue("authorization")) === `Bearer ${session.access_token}`,
  ).toBe(true);
  await expect(page.getByText("Application received")).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toHaveLength(1);
  expect(await storedDraftKeys(page)).toEqual([]);
});

test("a failed signup does not persist the form or log sensitive values", async ({
  page,
  backend,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  const mock = await backend(
    {
      signupResponse: {
        status: 422,
        body: { code: 422, error_code: "validation_failed", msg: firstNote },
      },
    },
    { signedIn: false },
  );

  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  await page.getByRole("button", { name: "Create account and submit" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).not.toContainText(firstNote);
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
  expect(await storedDraftKeys(page)).toEqual([]);
  expect(
    logs.some((message) =>
      [firstClinic, firstNote, emailA, testPassword].some((value) => message.includes(value)),
    ),
  ).toBe(false);
});

test("a delayed submission failure cannot bind the draft to a new account", async ({
  page,
  backend,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  const mock = await backend({ authUserId: accountA, authEmail: emailA });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/provider_applications*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await gate;
    await route.fulfill({
      status: 403,
      json: { code: "42501", message: firstNote },
      headers: { "access-control-allow-origin": "*" },
    });
  });

  await page.goto("/clinic/signup");
  await fillClinic(page);
  const clinicName = page.getByLabel(/^Clinic name/);
  const submission = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/rest/v1/provider_applications"),
  );
  try {
    await page.getByRole("button", { name: "Submit application" }).click();
    const authorization = await (await submission).headerValue("authorization");
    const token = authorization?.split(" ")[1]?.split(".")[1];
    const claims: unknown = token ? JSON.parse(Buffer.from(token, "base64url").toString()) : null;
    expect(
      typeof claims === "object" && claims !== null && Reflect.get(claims, "sub") === accountA,
    ).toBe(true);

    await changePrincipal(page, mock, { id: accountB, email: emailB });
    await expect(page.locator("#contact-email")).toHaveValue(emailB);
    await expect(clinicName).toHaveValue("");
    await clinicName.fill("Second applicant's unsaved changes");
    const denied = page.waitForResponse(
      (response) =>
        response.status() === 403 && response.url().includes("/rest/v1/provider_applications"),
    );
    release();
    await denied;
    await expect.poll(() => storedDraftKeys(page)).toEqual([draftKey("clinic", accountA)]);
    await expect(clinicName).toHaveValue("Second applicant's unsaved changes");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await changePrincipal(page, mock, { id: accountA, email: emailA });
    await expect(clinicName).toHaveValue(firstClinic);
    await expect(page.getByLabel("Anything else we should know")).toHaveValue(firstNote);
    expect(
      logs.some((message) => [firstClinic, firstNote].some((value) => message.includes(value))),
    ).toBe(false);
  } finally {
    release();
  }
});

test("submitting a stale form cannot use a replacement session", async ({ page, backend }) => {
  const mock = await backend({ authUserId: accountA, authEmail: emailA });
  await page.goto("/clinic/signup");
  await fillClinic(page);
  await expect(page.locator("#contact-email")).toHaveValue(emailA);

  // Model the gap before the other tab's Auth event arrives. The SDK reads the newer
  // session from storage while this form still belongs to the original principal.
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: authKey,
    session: authSession(accountB, emailB),
  });
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
  const keys = await storedDraftKeys(page);
  expect(keys).not.toContain(draftKey("clinic", accountB));
});

test("denied draft storage is nonfatal", async ({ page, backend }) => {
  const mock = await backend(
    {
      authUserId: accountA,
      authEmail: emailA,
      signupResponse: { status: 200, body: signupUser(accountA, emailA) },
    },
    { signedIn: false },
  );
  await page.addInitScript((prefix) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith(prefix))
        throw new DOMException("Draft storage unavailable", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  }, draftPrefix);
  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  await page.getByRole("button", { name: "Create account and submit" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  expect(await storedDraftKeys(page)).toEqual([]);
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
});
test("a duplicate-account response does not assign a draft", async ({ page, backend }) => {
  const mock = await backend(
    {
      signupResponse: {
        status: 200,
        body: { ...signupUser(accountB, emailA), identities: [] },
      },
    },
    { signedIn: false },
  );
  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  await page.getByRole("button", { name: "Create account and submit" }).click();

  await expect(page.getByRole("alert")).toContainText("An account with this email already exists");
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  expect(await storedDraftKeys(page)).toEqual([]);
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
});

test("a delayed pending signup stores its draft only for the identity returned by Auth", async ({
  page,
  backend,
}) => {
  const mock = await backend({}, { signedIn: false });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/v1/signup*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await gate;
    await route.fulfill({
      json: signupUser(accountA, emailA),
      headers: { "access-control-allow-origin": "*" },
    });
  });

  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  const signup = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/auth/v1/signup"),
  );

  try {
    await page.getByRole("button", { name: "Create account and submit" }).click();
    await signup;

    await changePrincipal(page, mock, { id: accountB, email: emailB });
    await expect(page.locator("#contact-email")).toHaveValue(emailB);
    const clinicName = page.getByLabel(/^Clinic name/);
    await expect(clinicName).toHaveValue("");
    await clinicName.fill("Second applicant's unsaved changes");

    release();
    await expect.poll(() => storedDraftKeys(page)).toEqual([draftKey("clinic", accountA)]);
    await expect(clinicName).toHaveValue("Second applicant's unsaved changes");
    await expect(page.getByText("Check your email")).toHaveCount(0);
    expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
  } finally {
    release();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function watchDraftReads(page: Page, key: string) {
  await page.addInitScript(
    ({ watched, sessionKey }) => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (name: string) {
        if (name === watched) sessionStorage.setItem("__watchedDraftRead", "yes");
        if (name === sessionKey && sessionStorage.getItem("__watchSessionRead") === "yes") {
          sessionStorage.setItem("__sawSessionRead", "yes");
        }
        return getItem.call(this, name);
      };
    },
    { watched: key, sessionKey: authKey },
  );
}

function tokenSubject(header: string | null | undefined): unknown {
  const payload = header?.split(".")[1];
  return payload ? JSON.parse(Buffer.from(payload, "base64url").toString()).sub : undefined;
}

test("a stale signed-in event cannot hydrate the previous account's draft", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountB, authEmail: emailB });
  await seedDrafts(page, {
    [draftKey("clinic", accountA)]: { clinicName: firstClinic },
    [draftKey("clinic", accountB)]: { clinicName: "Current clinic draft" },
  });
  await watchDraftReads(page, draftKey("clinic", accountA));
  await page.goto("/clinic/signup");
  const name = page.getByLabel(/^Clinic name/);
  await expect(name).toHaveValue("Current clinic draft");
  await name.fill("Current unsaved edit");

  await page.evaluate(
    ({ key, session }) => {
      sessionStorage.setItem("__watchSessionRead", "yes");
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session });
      channel.close();
    },
    { key: authKey, session: authSession(accountA, emailA) },
  );

  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("__sawSessionRead")))
    .toBe("yes");
  await expect(name).toHaveValue("Current unsaved edit");
  expect(await page.evaluate(() => sessionStorage.getItem("__watchedDraftRead"))).toBeNull();
});

for (const staleOutcome of ["success", "session_not_found", "temporary failure"]) {
  test(`a late ${staleOutcome} verification cannot displace the active account`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ authUserId: accountA, authEmail: emailA });
    const gate = deferred();
    const started = deferred();
    await seedDrafts(page, {
      [draftKey("clinic", accountA)]: { clinicName: firstClinic },
      [draftKey("clinic", accountB)]: { clinicName: "Current clinic draft" },
    });
    await watchDraftReads(page, draftKey("clinic", accountA));
    await page.addInitScript(() => {
      const json = Response.prototype.json;
      Response.prototype.json = function () {
        const parsed = json.call(this);
        if (this.headers.get("x-test-delayed-verification") === "yes") {
          void parsed.then(() =>
            setTimeout(() => sessionStorage.setItem("__oldVerifyProcessed", "yes"), 0),
          );
        }
        return parsed;
      };
    });
    await page.route("**/auth/v1/user", async (route) => {
      if (tokenSubject(route.request().headers()["authorization"]) !== accountA)
        return route.fallback();
      started.resolve();
      await gate.promise;
      await route.fulfill({
        status: staleOutcome === "success" ? 200 : staleOutcome === "session_not_found" ? 403 : 503,
        json:
          staleOutcome === "success"
            ? signupUser(accountA, emailA)
            : {
                error_code:
                  staleOutcome === "session_not_found" ? staleOutcome : "unexpected_failure",
              },
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "x-test-delayed-verification",
          "x-test-delayed-verification": "yes",
        },
      });
    });

    try {
      await page.goto("/clinic/signup");
      await started.promise;
      await expect(page.getByLabel(/^Clinic name/)).toHaveCount(0);
      await changePrincipal(page, mock, { id: accountB, email: emailB });
      await expect(page.getByLabel(/^Clinic name/)).toHaveValue("Current clinic draft");
      const oldVerification = page.waitForResponse(
        (response) =>
          response.url().endsWith("/auth/v1/user") &&
          tokenSubject(response.request().headers()["authorization"]) === accountA,
      );
      gate.resolve();
      await (await oldVerification).finished();
      await expect
        .poll(() => page.evaluate(() => sessionStorage.getItem("__oldVerifyProcessed")))
        .toBe("yes");
      await page.evaluate((key) => navigator.locks.request(key, () => {}), authKey);
      expect((await sharedSession(page))?.owner).toBe(accountB);
      await expect(page.getByLabel(/^Clinic name/)).toHaveValue("Current clinic draft");
      expect(await page.evaluate(() => sessionStorage.getItem("__watchedDraftRead"))).toBeNull();
    } finally {
      gate.resolve();
    }
  });
}

for (const oldSucceeds of [true, false]) {
  test(`reverse completion: an old ${oldSucceeds ? "success keeps the newer draft" : "failure cannot resurrect a submitted draft"}`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ authUserId: accountA, authEmail: emailA });
    const gate = deferred();
    const started = deferred();
    let writes = 0;
    await page.route("**/rest/v1/provider_applications*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const first = ++writes === 1;
      if (first) {
        started.resolve();
        await gate.promise;
      }
      if (first === oldSucceeds) return route.fallback();
      await route.fulfill({
        status: 403,
        json: { code: "42501", message: "Synthetic rejection" },
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await page.goto("/clinic/signup");
    await fillClinic(page);
    const submit = page.getByRole("button", { name: "Submit application" });
    let otherTab: Page | undefined;

    try {
      await submit.click();
      await started.promise;
      if (oldSucceeds) {
        otherTab = await page.context().newPage();
        await mockBackend(otherTab, { signedIn: false });
        await otherTab.route("**/rest/v1/provider_applications*", async (route) => {
          if (route.request().method() !== "POST") return route.fallback();
          await route.fulfill({
            status: 403,
            json: { code: "42501", message: "Synthetic rejection" },
            headers: { "access-control-allow-origin": "*" },
          });
        });
        await otherTab.goto("/clinic/signup");
      } else {
        await changePrincipal(page, mock, null);
        await expect(page.getByLabel(/^Password/)).toBeVisible();
        await changePrincipal(page, mock, { id: accountA, email: emailA });
      }
      const newer = otherTab ?? page;
      await expect(newer.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
      await newer.getByLabel(/^Clinic name/).fill("Newer synthetic revision");
      await newer.getByRole("button", { name: "Submit application" }).click();

      if (oldSucceeds) await expect(newer.getByRole("alert")).toBeVisible();
      else await expect(newer.getByText("Application received")).toBeVisible();

      const key = draftKey("clinic", accountA);
      const read = () => page.evaluate((item) => localStorage.getItem(item), key);
      const before = await read();
      if (oldSucceeds) expect(before).toContain("Newer synthetic revision");
      else {
        expect(JSON.parse(before ?? "null")).toEqual({ revision: expect.any(String) });
      }

      // onSettled invalidates the current account's application list. Wait until the old
      // request reaches that callback before synchronizing with the storage lock.
      const refreshed = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().includes("/rest/v1/provider_applications"),
      );
      gate.resolve();
      await (await refreshed).finished();
      await page.evaluate((item) => navigator.locks.request(item, () => {}), key);
      expect(await read()).toBe(before);
    } finally {
      gate.resolve();
      await otherTab?.close();
    }
  });
}

test("edits made during submission remain in the newer stored revision", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  const gate = deferred();
  const started = deferred();
  await page.route("**/rest/v1/provider_applications*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    started.resolve();
    await gate.promise;
    await route.fallback();
  });

  try {
    await page.goto("/clinic/signup");
    await fillClinic(page);
    const submit = page.getByRole("button", { name: "Submit application" });
    await submit.click();
    await started.promise;
    await page.getByLabel(/^Clinic name/).fill("New edit during save");
    gate.resolve();
    await expect(submit).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel(/^Clinic name/)).toHaveValue("New edit during save");
  } finally {
    gate.resolve();
  }
});

for (const delayedPath of ["signup", "user"] as const) {
  test(`a later login wins while immediate signup awaits ${delayedPath}`, async ({
    page,
    backend,
  }) => {
    const mock = await backend(
      { signupResponse: { status: 200, body: authSession(accountA, emailA) } },
      { signedIn: false },
    );
    const gate = deferred();
    const started = deferred();
    const secondTab = await page.context().newPage();
    await mockBackend(secondTab, {
      signedIn: false,
      state: { authUserId: accountB, authEmail: emailB },
    });
    await page.route(`**/auth/v1/${delayedPath}*`, async (route) => {
      await page.unroute(`**/auth/v1/${delayedPath}*`);
      started.resolve();
      await gate.promise;
      // This response belongs to the original A request even after the mock switches account.
      await route.fulfill({
        json:
          delayedPath === "signup" ? authSession(accountA, emailA) : signupUser(accountA, emailA),
        headers: { "access-control-allow-origin": "*" },
      });
    });

    try {
      await secondTab.goto("/login");
      const replacementSignIn = secondTab.getByRole("button", { name: "Sign in", exact: true });
      await expect(replacementSignIn).toBeEnabled();
      await page.goto("/clinic/signup");
      await fillSignupAccount(page);
      await fillClinic(page);
      await page.getByRole("button", { name: "Create account and submit" }).click();
      await started.promise;
      await secondTab.getByLabel("Email", { exact: true }).fill(emailB);
      await secondTab.getByLabel("Password", { exact: true }).fill(testPassword);
      const replacementResponse = secondTab.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/auth/v1/token?grant_type=password"),
      );
      await replacementSignIn.click();
      expect((await replacementResponse).ok()).toBe(true);
      await expect(secondTab).toHaveURL(/\/$/);
      await expect(page.locator("#contact-email")).toHaveValue(emailB);
      const response = page.waitForResponse((item) =>
        item.url().includes(`/auth/v1/${delayedPath}`),
      );
      gate.resolve();
      await (await response).finished();
      await expect.poll(() => storedDraftKeys(page)).toEqual([draftKey("clinic", accountA)]);
      await expect(page.locator("#contact-email")).toHaveValue(emailB);
      const activeAccount = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.user?.id,
        authKey,
      );
      expect(activeAccount).toBe(accountB);
      expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
    } finally {
      gate.resolve();
      await secondTab.close();
    }
  });
}

test("a switch between header capture and dispatch never substitutes the replacement token", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  await page.goto("/clinic/signup");
  await fillClinic(page);
  await page.evaluate(
    ({ key, session }) => {
      const getItem = Storage.prototype.getItem;
      let reads = 0;
      Storage.prototype.getItem = function (item: string) {
        if (item === key && ++reads === 2) {
          Storage.prototype.getItem = getItem;
          localStorage.setItem(key, JSON.stringify(session));
          const channel = new BroadcastChannel(key);
          channel.postMessage({ event: "SIGNED_IN", session });
          channel.close();
          sessionStorage.setItem("__switchedBeforeDispatch", "yes");
        }
        return getItem.call(this, item);
      };
    },
    { key: authKey, session: authSession(accountB, emailB) },
  );
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/rest/v1/provider_applications"),
  );

  await page.getByRole("button", { name: "Submit application" }).click();
  const bearer = await (await sent).headerValue("authorization");
  expect(tokenSubject(bearer)).toBe(accountA);
  expect(await page.evaluate(() => sessionStorage.getItem("__switchedBeforeDispatch"))).toBe("yes");
  await expect(page.locator("#contact-email")).toHaveValue(emailB);
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
});

function refreshedSession(id: string, email: string, label: string) {
  const session = authSession(id, email);
  const [header, payload] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
  return {
    ...session,
    access_token: `${header}.${Buffer.from(JSON.stringify({ ...claims, label })).toString("base64url")}.test-signature`,
    refresh_token: `test-rotated-${label}`,
  };
}

async function holdAuthLock(page: Page) {
  await page.evaluate(async (key) => {
    const release = new BroadcastChannel("__test_release_auth_lock");
    await new Promise<void>((acquired) => {
      void navigator.locks.request(
        key,
        () =>
          new Promise<void>((resolve) => {
            release.onmessage = () => {
              release.close();
              resolve();
            };
            acquired();
          }),
      );
    });
  }, authKey);
}

async function releaseAuthLock(page: Page) {
  await page.evaluate(async (key) => {
    const release = new BroadcastChannel("__test_release_auth_lock");
    release.postMessage("release");
    release.close();
    // Enter after the previously queued SDK commits, including the obsolete refresh.
    await navigator.locks.request(key, () => {});
  }, authKey);
}

async function waitForAuthWrites(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        async (key) =>
          (await navigator.locks.query()).pending?.filter((entry) => entry.name === key).length ??
          0,
        authKey,
      ),
    )
    .toBeGreaterThanOrEqual(count);
}

function sharedSession(page: Page) {
  return page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key) ?? "null");
    return session ? { owner: session.user.id, generation: session.refresh_token } : null;
  }, authKey);
}

for (const replacement of ["other account", "same account", "sign-out"] as const) {
  test(`an expired A refresh queued behind ${replacement} cannot commit`, async ({
    page,
    backend,
  }) => {
    await backend({ authUserId: accountA, authEmail: emailA }, { signedIn: false });
    const competingTab = await page.context().newPage();
    const nextId = replacement === "same account" ? accountA : accountB;
    const nextEmail = replacement === "same account" ? emailA : emailB;
    const next = refreshedSession(nextId, nextEmail, "new-login");
    const refresh = refreshedSession(accountA, emailA, "old-refresh");
    const refreshStarted = deferred();
    const refreshResponse = deferred();
    const loginStarted = deferred();
    const loginResponse = deferred();
    let locked = false;

    await mockBackend(competingTab, {
      signedIn: false,
      state: { authUserId: nextId, authEmail: nextEmail },
    });
    await competingTab.route("**/auth/v1/token?grant_type=password", async (route) => {
      loginStarted.resolve();
      await loginResponse.promise;
      await route.fulfill({ json: next, headers: { "access-control-allow-origin": "*" } });
    });
    await page.route("**/auth/v1/token?grant_type=refresh_token", async (route) => {
      refreshStarted.resolve();
      await refreshResponse.promise;
      await route.fulfill({ json: refresh, headers: { "access-control-allow-origin": "*" } });
    });
    await seedDrafts(page, {
      [draftKey("clinic", accountA)]: { clinicName: firstClinic },
      [draftKey("clinic", accountB)]: { clinicName: "Account B clinic" },
    });
    const first = authSession(accountA, emailA);

    try {
      await competingTab.goto(replacement === "sign-out" ? "/" : "/login");
      if (replacement === "sign-out") {
        await competingTab.evaluate(
          ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
          { key: authKey, session: first },
        );
        await competingTab.goto("/profile");
        await expect(competingTab.getByRole("button", { name: "Sign out" })).toBeVisible();
      } else {
        await competingTab.getByLabel("Email", { exact: true }).fill(nextEmail);
        await competingTab.getByLabel("Password", { exact: true }).fill(testPassword);
        await competingTab.getByRole("button", { name: "Sign in", exact: true }).click();
        await loginStarted.promise;
      }

      await page.addInitScript(
        ({ key, session }) => {
          if (!sessionStorage.getItem("__seedExpiredRefresh")) {
            localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1 }));
            sessionStorage.setItem("__seedExpiredRefresh", "yes");
          }
        },
        { key: authKey, session: first },
      );
      await page.goto("/");
      await refreshStarted.promise;
      await holdAuthLock(page);
      locked = true;

      if (replacement === "sign-out") {
        await competingTab.getByRole("button", { name: "Sign out" }).click();
      } else {
        loginResponse.resolve();
      }
      await waitForAuthWrites(page, 1);
      refreshResponse.resolve();
      await waitForAuthWrites(page, 2);
      await releaseAuthLock(page);
      locked = false;

      expect(await sharedSession(page)).toEqual(
        replacement === "sign-out" ? null : { owner: nextId, generation: next.refresh_token },
      );
      await page.goto("/clinic/signup");
      if (replacement === "sign-out") {
        await expect(page.getByLabel(/^Password/)).toBeVisible();
        await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
      } else {
        await expect(page.getByLabel(/^Clinic name/)).toHaveValue(
          replacement === "other account" ? "Account B clinic" : firstClinic,
        );
      }
      expect(await sharedSession(page)).toEqual(
        replacement === "sign-out" ? null : { owner: nextId, generation: next.refresh_token },
      );
    } finally {
      if (locked) await releaseAuthLock(page);
      refreshResponse.resolve();
      loginResponse.resolve();
      await competingTab.close();
    }
  });
}

test("the current account can commit a normal token refresh and restore its draft", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  const next = refreshedSession(accountA, emailA, "current-refresh");
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1 }));
    },
    { key: authKey, session: authSession(accountA, emailA) },
  );
  await seedDrafts(page, { [draftKey("clinic", accountA)]: { clinicName: firstClinic } });
  await page.route("**/auth/v1/token?grant_type=refresh_token", (route) =>
    route.fulfill({ json: next, headers: { "access-control-allow-origin": "*" } }),
  );

  await page.goto("/clinic/signup");
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  expect(await sharedSession(page)).toEqual({ owner: accountA, generation: next.refresh_token });
});

test("temporary verification failure keeps identity pending and retries the same session", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  await seedDrafts(page, { [draftKey("clinic", accountA)]: { clinicName: firstClinic } });
  const started = deferred();
  const release = deferred();
  let attempts = 0;
  await page.route("**/auth/v1/user", async (route) => {
    if (++attempts === 1) {
      return route.fulfill({
        status: 503,
        json: { msg: "Temporary synthetic error" },
        headers: { "access-control-allow-origin": "*" },
      });
    }

    started.resolve();
    await release.promise;
    return route.fallback();
  });
  try {
    await page.goto("/clinic/signup");
    await started.promise;
    await expect(page.getByLabel(/^Clinic name/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create account and submit" })).toHaveCount(0);
    expect((await sharedSession(page))?.owner).toBe(accountA);
    release.resolve();
    await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  } finally {
    release.resolve();
  }
});

test("a confirmed invalid current session is cleared without restoring its draft", async ({
  page,
  backend,
}) => {
  await backend({ authUserId: accountA, authEmail: emailA });
  await seedDrafts(page, { [draftKey("clinic", accountA)]: { clinicName: firstClinic } });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 403,
      json: { error_code: "session_not_found" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );

  await page.goto("/clinic/signup");
  await expect(page.getByLabel(/^Password/)).toBeVisible();
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue("");
  expect(await sharedSession(page)).toBeNull();
});

function confirmationPath(session: ReturnType<typeof authSession>) {
  return `/login#${new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: String(session.expires_at),
    expires_in: "3600",
    token_type: "bearer",
    type: "signup",
  })}`;
}

for (const unavailable of ["readable but unwritable", "throws on read", "no Web Locks"] as const) {
  test(`${unavailable} storage permits patient login and logout in memory`, async ({
    page,
    backend,
  }) => {
    const mock = await backend({ authUserId: accountA, authEmail: emailA }, { signedIn: false });
    await page.addInitScript((fault) => {
      if (fault === "no Web Locks") {
        Object.defineProperty(navigator, "locks", { value: undefined });
        return;
      }
      if (fault === "throws on read") {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Synthetic storage read error", "SecurityError");
          },
        });
      } else {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this === localStorage)
            throw new DOMException("Synthetic storage write error", "QuotaExceededError");
          set.call(this, key, value);
        };
      }
    }, unavailable);

    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(emailA);
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: "Your profile" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(mock.callsTo("POST", "/auth/v1/logout")).toHaveLength(1);
    if (unavailable !== "throws on read") expect(await sharedSession(page)).toBeNull();
  });
}

test("without Web Locks the in-memory SDK can refresh and switch accounts in one tab", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { value: undefined });
  });

  const first = refreshedSession(accountA, emailA, "memory-login");
  const refreshed = refreshedSession(accountA, emailA, "memory-refresh");
  const second = refreshedSession(accountB, emailB, "memory-next-login");
  let login = { ...first, expires_in: 120, expires_at: Math.floor(Date.now() / 1000) + 120 };
  const cors = { "access-control-allow-origin": "*" };
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({ json: login, headers: cors }),
  );
  await page.route("**/auth/v1/token?grant_type=refresh_token", (route) =>
    route.fulfill({ json: refreshed, headers: cors }),
  );

  const signIn = async (email: string) => {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: "Your profile" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  };

  await page.goto("/login");
  await signIn(emailA);
  const verifies = (accessToken: string) =>
    page.waitForRequest(
      (request) =>
        request.url().endsWith("/auth/v1/user") &&
        request.headers()["authorization"] === `Bearer ${accessToken}`,
    );
  const verifiedRefresh = verifies(refreshed.access_token);
  await page.clock.fastForward(60_000);
  await verifiedRefresh;

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  login = second;
  const verifiedSecondAccount = verifies(second.access_token);
  await signIn(emailB);
  await verifiedSecondAccount;
  expect(await sharedSession(page)).toBeNull();
});

test("manual signup recovery uses general sign-in and returns the applicant to their draft", async ({
  page,
  backend,
}) => {
  const mock = await backend(
    {
      authUserId: accountA,
      authEmail: emailA,
      signupResponse: { status: 200, body: authSession(accountA, emailA) },
    },
    { signedIn: false },
  );
  const blockAdoption = "**/auth/v1/user";
  await page.route(blockAdoption, (route) =>
    route.fulfill({
      status: 503,
      json: { msg: "Synthetic adoption verification error" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );

  await page.goto("/clinic/signup");
  await fillSignupAccount(page);
  await fillClinic(page);
  await page.getByRole("button", { name: "Create account and submit" }).click();
  const signIn = page.getByRole("link", { name: "Sign in first" });
  await expect(signIn).toHaveAttribute("href", /^\/login\?redirect=%2Fclinic%2Fsignup$/);
  await page.unroute(blockAdoption);
  await signIn.click();
  await page.getByLabel("Email", { exact: true }).fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/clinic\/signup$/);
  await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
  expect(mock.callsTo("POST", "/rest/v1/provider_applications")).toEqual([]);
});

for (const sameField of [true, false]) {
  test(`an older tab cannot overwrite a newer draft while editing ${sameField ? "the same field" : "another field"}`, async ({
    page,
    backend,
  }) => {
    await backend({ authUserId: accountA, authEmail: emailA });
    const key = draftKey("clinic", accountA);
    await seedDrafts(page, { [key]: { clinicName: firstClinic, contactPhone: "1111111111" } });
    const other = await page.context().newPage();
    await mockBackend(other, { signedIn: false });
    try {
      await page.goto("/clinic/signup");
      await expect(page.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);
      await other.goto("/clinic/signup");
      await expect(other.getByLabel(/^Clinic name/)).toHaveValue(firstClinic);

      await page.getByLabel(/^Clinic name/).fill("Latest clinic name");
      const read = () =>
        page.evaluate((draftKey) => {
          const record = JSON.parse(localStorage.getItem(draftKey) ?? "null");
          return record?.form;
        }, key);
      await expect.poll(read).toMatchObject({ clinicName: "Latest clinic name" });
      await other
        .getByLabel(sameField ? /^Clinic name/ : /^Phone/)
        .fill(sameField ? "Obsolete tab name" : "2222222222");
      await expect(other.getByRole("alert")).toContainText("draft changed in another tab");
      await expect(other.getByRole("button", { name: "Submit application" })).toBeDisabled();
      expect(await read()).toMatchObject({
        clinicName: "Latest clinic name",
        contactPhone: "1111111111",
      });
      await other.getByRole("button", { name: "Reload saved draft" }).click();
      await expect(other.getByLabel(/^Clinic name/)).toHaveValue("Latest clinic name");
      await other.getByLabel(/^Phone/).fill("3333333333");
      await expect
        .poll(read)
        .toMatchObject({ clinicName: "Latest clinic name", contactPhone: "3333333333" });
    } finally {
      await other.close();
    }
  });
}

test("a delayed signup response cannot seed a draft after confirmation and submission cleared it", async ({
  page,
  backend,
}) => {
  await backend({}, { signedIn: false });
  const other = await page.context().newPage();
  await mockBackend(other, { signedIn: false, state: { authUserId: accountA, authEmail: emailA } });
  const started = deferred();
  const release = deferred();
  await page.route("**/auth/v1/signup*", async (route) => {
    started.resolve();
    await release.promise;
    await route.fulfill({
      json: signupUser(accountA, emailA),
      headers: { "access-control-allow-origin": "*" },
    });
  });
  const key = draftKey("clinic", accountA);
  try {
    await page.goto("/clinic/signup");
    await fillSignupAccount(page);
    await fillClinic(page);
    await page.getByRole("button", { name: "Create account and submit" }).click();
    await started.promise;
    await other.goto(confirmationPath(authSession(accountA, emailA)));
    await expect(other.getByRole("link", { name: "Your profile" })).toBeVisible();
    await other.goto("/clinic/signup");
    await fillClinic(other);
    await other.getByLabel(/^Clinic name/).fill("Newer confirmed application");
    await other.getByRole("button", { name: "Submit application" }).click();
    await expect(other.getByText("Application received")).toBeVisible();
    const read = () =>
      page.evaluate((item) => JSON.parse(localStorage.getItem(item) ?? "null"), key);
    const marker = await read();
    expect(marker).toEqual({ revision: expect.any(String) });

    // Trace completion of the older signup's actual guarded draft operation.
    await page.evaluate((item) => {
      const request = navigator.locks.request.bind(navigator.locks);
      Object.defineProperty(navigator.locks, "request", {
        configurable: true,
        value: (name: string, callback: LockGrantedCallback<unknown>) =>
          request(name, async (lock) => {
            try {
              return await callback(lock);
            } finally {
              if (name === item) sessionStorage.setItem("__lateDraftSettled", "yes");
            }
          }),
      });
    }, key);
    release.resolve();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("__lateDraftSettled")))
      .toBe("yes");
    expect(await read()).toEqual(marker);
  } finally {
    release.resolve();
    await other.close();
  }
});

for (const signsOut of [false, true]) {
  test(`A's delayed confirmation cannot replace B's later ${signsOut ? "login and sign-out" : "login"}`, async ({
    page,
    backend,
  }) => {
    await backend({}, { signedIn: false });
    const other = await page.context().newPage();
    await mockBackend(other, {
      signedIn: false,
      state: { authUserId: accountB, authEmail: emailB },
    });
    const started = deferred();
    const release = deferred();
    await seedDrafts(page, {
      [draftKey("clinic", accountA)]: { clinicName: firstClinic },
      [draftKey("clinic", accountB)]: { clinicName: "Current B clinic" },
    });
    await page.route("**/auth/v1/user", async (route) => {
      if (tokenSubject(route.request().headers()["authorization"]) !== accountA)
        return route.fallback();
      started.resolve();
      await release.promise;
      await route.fulfill({
        json: signupUser(accountA, emailA),
        headers: { "access-control-allow-origin": "*" },
      });
    });

    try {
      const confirmation = authSession(accountA, emailA);
      await page.goto(confirmationPath(confirmation));
      await started.promise;
      await other.goto("/login");
      await other.getByLabel("Email", { exact: true }).fill(emailB);
      await other.getByLabel("Password", { exact: true }).fill(testPassword);
      await other.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(other.getByRole("link", { name: "Your profile" })).toBeVisible();
      if (signsOut) {
        await other.getByRole("link", { name: "Your profile" }).click();
        await other.getByRole("button", { name: "Sign out" }).click();
        await expect(other).toHaveURL(/\/login/);
        expect(await sharedSession(page)).toBeNull();
      }
      release.resolve();
      if (signsOut)
        await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      else await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
      expect((await sharedSession(page))?.owner ?? null).toBe(signsOut ? null : accountB);
      await page.goto("/clinic/signup");
      await expect(page.getByLabel(/^Clinic name/)).toHaveValue(signsOut ? "" : "Current B clinic");
    } finally {
      release.resolve();
      await other.close();
    }
  });
}
