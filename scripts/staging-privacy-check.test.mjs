import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  validTarget,
  validKey,
  runChecks,
  readHiddenInput,
  runCli,
} from "./staging-privacy-check.mjs";

const patient = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token: "patient-test" };
const doctor = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", token: "doctor-test" };
const target = "00000000-0000-4000-8000-000000000001";
const patientProfile = { id: "00000000-0000-4000-8000-000000000002" };
const fixture = {
  appointmentId: target,
  patientId: patientProfile.id,
  doctorId: "00000000-0000-4000-8000-000000000003",
};
const fixtureEnv = {
  CARECONNECT_PRIVACY_APPOINTMENT_ID: fixture.appointmentId,
  CARECONNECT_PRIVACY_PATIENT_PROFILE_ID: fixture.patientId,
  CARECONNECT_PRIVACY_DOCTOR_PROFILE_ID: fixture.doctorId,
};

const patientLookup = `/rest/v1/patients?user_id=eq.${patient.id}&select=id&limit=2`;
function fake(inbox, contacts) {
  return async (method, path, token) => {
    assert.equal(method, "GET");
    if (path === patientLookup) {
      assert.equal(token, patient.token);
      return { status: 200, data: [patientProfile] };
    }
    if (path.includes("doctor_message_inbox")) return inbox;
    if (path.includes("/doctors?")) return { status: 200, data: [{ id: fixture.doctorId }] };
    if (path.includes("doctor_appointments")) return { status: 200, data: [] };
    if (path.includes("/users?")) return contacts;
    throw new Error("unexpected request");
  };
}
test("staging origin and publishable keys are required", () => {
  assert.equal(validTarget("https://aqwzrpwiqbrykorlqwow.supabase.co"), true);
  assert.equal(validTarget("https://bqijgbmhlwtslhrtszsj.supabase.co"), false);
  assert.equal(validTarget("https://aqwzrpwiqbrykorlqwow.supabase.co/"), false);
  assert.equal(validKey("sb_secret_example"), false);
  assert.equal(validKey("sb_publishable_example"), true);
});
test("empty inbox and inaccessible target row pass", async () => {
  const results = await runChecks({
    fixture,
    patient,
    doctor,
    request: fake({ status: 200, data: [] }, { status: 200, data: [] }),
  });
  assert.equal(results[0].result, "PASS");
  assert.equal(results.at(-1).result, "PASS");
});
test("patient identity gates both probes and distinguishes a mismatch from no visible profile", async () => {
  const otherProfile = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
  for (const [status, data, classification] of [
    [200, [otherProfile], "patient_profile_mismatch"],
    [200, [], "patient_profile_not_visible"],
    [200, [null], "malformed_response"],
    [200, [patientProfile, otherProfile], "malformed_response"],
    [403, { code: "42501", message: "private-test-value" }, "authorization_denied"],
  ]) {
    const calls = [];
    const results = await runChecks({
      fixture,
      patient,
      doctor,
      request: async (method, path, token) => {
        calls.push([method, path, token]);
        return { status, data };
      },
    });
    assert.deepEqual(calls, [["GET", patientLookup, patient.token]]);
    assert.deepEqual(results, [
      { check: "patient_private_inbox", result: "NOT TESTED", status, classification },
      {
        check: "doctor_unrelated_contact",
        result: "NOT TESTED",
        status: null,
        classification: "patient_identity_unverified",
      },
    ]);
  }
});
test("thread exposure fails and stops before contact probes", async () => {
  const results = await runChecks({
    fixture,
    patient,
    doctor,
    request: fake({ status: 200, data: [{ appointment_id: target }] }, null),
  });
  assert.deepEqual(
    results.map((x) => x.result),
    ["FAIL"],
  );
});
test("contact exposure fails without returning values", async () => {
  const results = await runChecks({
    fixture,
    patient,
    doctor,
    request: fake(
      { status: 200, data: [] },
      { status: 200, data: [{ email: "sensitive", phone: null }] },
    ),
  });
  assert.equal(results.at(-1).result, "FAIL");
  assert.equal(JSON.stringify(results).includes("sensitive"), false);
});
test("ambiguous denial and malformed inbox do not pass", async () => {
  for (const inbox of [
    { status: 403, data: { code: "42501" } },
    { status: 200, data: [{}] },
  ]) {
    const results = await runChecks({
      fixture,
      patient,
      doctor,
      request: fake(inbox, { status: 500, data: null }),
    });
    assert.equal(results[0].result, "NOT TESTED");
  }
});

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = (value) => {
    input.isRaw = value;
  };
  let text = "";
  const output = {
    isTTY: true,
    write: (chunk) => {
      text += chunk;
    },
  };
  return { input, output, text: () => text };
}

test(
  "each hidden prompt renders before input and never echoes the answer",
  { timeout: 1000 },
  async () => {
    const streams = terminal();
    for (const label of ["Staging publishable key", "QA doctor email", "QA doctor password"]) {
      const read = readHiddenInput(label, streams);
      assert.ok(streams.text().endsWith(`${label} (input hidden): `));
      for (const chunk of ["mock-value", "\x7f", "X", "\r\n"]) streams.input.write(chunk);
      assert.equal(await read, "mock-valuX");
      assert.equal(streams.input.isRaw, false);
    }
    assert.doesNotMatch(streams.text(), /mock-valu/);
  },
);

test(
  "Ctrl+C, Ctrl+Z and closed input settle the prompt and restore terminal mode",
  { timeout: 1000 },
  async () => {
    for (const cancel of [
      (input) => input.write("partial\x03"),
      (input) => input.write("partial\x1a"),
      (input) => {
        input.write("partial");
        input.end();
      },
    ]) {
      const streams = terminal();
      const read = readHiddenInput("Password", streams);
      cancel(streams.input);
      await assert.rejects(read, { message: "cancelled" });
      assert.equal(streams.input.isRaw, false);
      assert.equal(streams.input.listenerCount("keypress"), 0);
      assert.doesNotMatch(streams.text(), /partial/);
    }
  },
);

const staging = "https://aqwzrpwiqbrykorlqwow.supabase.co";
function mockCli(overrides = {}) {
  const reports = [];
  const options = {
    env: { ...fixtureEnv, CARECONNECT_PRIVACY_TARGET: staging },
    prompt: async (label) =>
      label === "Staging publishable key" ? "sb_publishable_mock" : "private-test-value",
    fetchRequest: async () => {
      throw new Error("private-test-value");
    },
    report: (value) => reports.push(value),
    progress: (value) => reports.push(value),
    ...overrides,
  };
  return { options, reports };
}

test("invoking the entry point without a terminal prints a safe error and exits", () => {
  const entry = fileURLToPath(new URL("./staging-privacy-check.mjs", import.meta.url));
  const { status, stdout, stderr } = spawnSync(process.execPath, [entry], {
    env: {
      ...process.env,
      ...fixtureEnv,
      CARECONNECT_PRIVACY_TARGET: staging,
      CARECONNECT_STAGING_ANON_KEY: "sb_publishable_mock",
    },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(status, 1);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).classification, "interactive_terminal_required");
  assert.doesNotMatch(stdout, /sb_publishable_mock/);
});

test("rejects a non-staging target before prompting or fetching", async () => {
  const { options, reports } = mockCli({
    env: { CARECONNECT_PRIVACY_TARGET: "https://bqijgbmhlwtslhrtszsj.supabase.co" },
    prompt: () => assert.fail("must not prompt"),
    fetchRequest: () => assert.fail("must not fetch"),
  });
  assert.equal(await runCli(options), 1);
  assert.equal(reports[0].classification, "invalid_staging_target");
});

test("Auth and network failures report only safe status and classification", async () => {
  for (const [fetchRequest, classification, status] of [
    [
      async () => new Response(JSON.stringify({ message: "private-test-value" }), { status: 429 }),
      "authentication_failed",
      429,
    ],
    [
      async () => {
        throw new Error("private-test-value");
      },
      "network_error",
      null,
    ],
  ]) {
    const { options, reports } = mockCli({ fetchRequest });
    assert.equal(await runCli(options), 1);
    assert.deepEqual(reports.at(-1), {
      check: "patient_authentication",
      result: "NOT TESTED",
      status,
      classification,
    });
    assert.doesNotMatch(JSON.stringify(reports), /private-test-value|sb_publishable_mock/);
  }
});

test("cancelling an in-flight Auth request returns 130 without progressing", async () => {
  const controller = new AbortController();
  const { options, reports } = mockCli({
    signal: controller.signal,
    fetchRequest: async (_url, { signal }) => {
      controller.abort();
      signal.throwIfAborted();
    },
  });
  assert.equal(await runCli(options), 130);
  assert.equal(reports.at(-1).classification, "cancelled");
  assert.equal(reports.at(-1).check, "patient_authentication");
});

test("CLI reports mocked privacy outcomes and exits nonzero for an incomplete check", async () => {
  for (const status of [200, 500]) {
    let logins = 0;
    const request = fake({ status: 200, data: [] }, { status, data: [] });
    const { options, reports } = mockCli({
      fetchRequest: async (url, { method, redirect, headers }) => {
        assert.equal(new URL(url).origin, staging);
        assert.equal(redirect, "error");
        if (url === `${staging}/auth/v1/token?grant_type=password` && method === "POST") {
          const session = [patient, doctor][logins++];
          return Response.json({ user: { id: session.id }, access_token: session.token });
        }
        const { data, status } = await request(
          method,
          url.slice(staging.length),
          headers.Authorization?.slice("Bearer ".length),
        );
        return Response.json(data, { status });
      },
    });
    assert.equal(await runCli(options), status === 200 ? 0 : 1);
    assert.equal(logins, 2);
    assert.equal(reports.at(-1).at(-1).result, status === 200 ? "PASS" : "NOT TESTED");
    assert.doesNotMatch(JSON.stringify(reports), /patient-test|doctor-test/);
  }
});

test("missing and malformed fixture IDs fail before authentication", async () => {
  for (const id of [undefined, "not-a-uuid"]) {
    const { options, reports } = mockCli({
      env: {
        ...fixtureEnv,
        CARECONNECT_PRIVACY_TARGET: staging,
        CARECONNECT_PRIVACY_APPOINTMENT_ID: id,
      },
      prompt: () => assert.fail("must not prompt"),
      fetchRequest: () => assert.fail("must not fetch"),
    });
    assert.equal(await runCli(options), 1);
    assert.equal(reports[0].classification, "invalid_fixture_ids");
  }
});
