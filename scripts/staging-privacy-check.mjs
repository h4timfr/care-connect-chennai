import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://aqwzrpwiqbrykorlqwow.supabase.co";
const PRODUCTION = "bqijgbmhlwtslhrtszsj";
function readFixture(env) {
  const fixture = {
    appointmentId: env.CARECONNECT_PRIVACY_APPOINTMENT_ID,
    patientId: env.CARECONNECT_PRIVACY_PATIENT_PROFILE_ID,
    doctorId: env.CARECONNECT_PRIVACY_DOCTOR_PROFILE_ID,
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (Object.values(fixture).some((id) => typeof id !== "string" || !uuid.test(id))) {
    throw new CliFailure("invalid_fixture_ids");
  }
  return Object.fromEntries(Object.entries(fixture).map(([name, id]) => [name, id.toLowerCase()]));
}

export function validTarget(value) {
  try {
    const url = new URL(value);
    return url.hostname !== `${PRODUCTION}.supabase.co` && value === ORIGIN;
  } catch {
    return false;
  }
}

export function validKey(key) {
  if (typeof key !== "string" || key.startsWith("sb_secret_") || !key.trim()) return false;
  if (key.startsWith("sb_publishable_")) return true;
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon";
  } catch {
    return false;
  }
}

function category(status, data) {
  if (status === 403 && data?.code === "42501") return "authorization_denied";
  if (status === 401) return "authentication_error";
  return status >= 500 ? "service_error" : "unexpected_response";
}

export async function runChecks({ request, patient, doctor, fixture }) {
  const results = [];
  const add = (check, result, status, classification) =>
    results.push({ check, result, status, classification });
  if (
    !/^[0-9a-f-]{36}$/i.test(patient.id) ||
    !/^[0-9a-f-]{36}$/i.test(doctor.id) ||
    patient.id === doctor.id
  ) {
    add("patient_private_inbox", "NOT TESTED", null, "identity_unverified");
    add("doctor_unrelated_contact", "NOT TESTED", null, "identity_unverified");
    return results;
  }
  const p = await request(
    "GET",
    `/rest/v1/patients?user_id=eq.${patient.id}&select=id&limit=2`,
    patient.token,
  );
  let patientIdentityFailure;
  if (p.status !== 200) patientIdentityFailure = category(p.status, p.data);
  else if (!Array.isArray(p.data)) patientIdentityFailure = "malformed_response";
  else if (p.data.length === 0) patientIdentityFailure = "patient_profile_not_visible";
  else if (p.data.length !== 1 || typeof p.data[0]?.id !== "string")
    patientIdentityFailure = "malformed_response";
  else if (p.data[0].id !== fixture.patientId) patientIdentityFailure = "patient_profile_mismatch";
  if (patientIdentityFailure) {
    add("patient_private_inbox", "NOT TESTED", p.status, patientIdentityFailure);
    add("doctor_unrelated_contact", "NOT TESTED", null, "patient_identity_unverified");
    return results;
  }
  const inbox = await request(
    "GET",
    "/rest/v1/rpc/doctor_message_inbox?p_as_doctor=false",
    patient.token,
  );
  if (inbox.status === 200 && Array.isArray(inbox.data)) {
    if (inbox.data.some((row) => !row || typeof row.appointment_id !== "string")) {
      add("patient_private_inbox", "NOT TESTED", 200, "malformed_response");
      return results;
    }
    const exposed = inbox.data.some((row) => row?.appointment_id === fixture.appointmentId);
    add(
      "patient_private_inbox",
      exposed ? "FAIL" : "PASS",
      inbox.status,
      exposed ? "target_thread_exposed" : "target_thread_absent",
    );
  } else
    add("patient_private_inbox", "NOT TESTED", inbox.status, category(inbox.status, inbox.data));
  if (results.at(-1).result === "FAIL") return results;

  const d = await request(
    "GET",
    `/rest/v1/doctors?id=eq.${fixture.doctorId}&user_id=eq.${doctor.id}&select=id`,
    doctor.token,
  );
  if (
    d.status !== 200 ||
    !Array.isArray(d.data) ||
    d.data.length !== 1 ||
    d.data[0].id !== fixture.doctorId
  ) {
    add("doctor_unrelated_contact", "NOT TESTED", d.status, "identity_unverified");
    return results;
  }
  const appts = await request("GET", "/rest/v1/rpc/doctor_appointments", doctor.token);
  if (appts.status !== 200 || !Array.isArray(appts.data)) {
    add(
      "doctor_appointments_fields",
      "NOT TESTED",
      appts.status,
      category(appts.status, appts.data),
    );
  } else {
    const exposed = appts.data.some((row) =>
      Object.keys(row ?? {}).some((key) => /phone|email/i.test(key)),
    );
    add(
      "doctor_appointments_fields",
      exposed ? "FAIL" : "NOT TESTED",
      appts.status,
      exposed ? "contact_field_present" : "no_contact_fields_observed",
    );
    if (exposed) return results;
  }
  const contact = await request(
    "GET",
    `/rest/v1/users?id=eq.${patient.id}&select=id,email,phone`,
    doctor.token,
  );
  if (contact.status === 200 && Array.isArray(contact.data)) {
    if (contact.data.length === 0)
      add("doctor_unrelated_contact", "PASS", 200, "target_row_absent");
    else if (contact.data.some((row) => row?.email != null || row?.phone != null))
      add("doctor_unrelated_contact", "FAIL", 200, "contact_value_exposed");
    else add("doctor_unrelated_contact", "NOT TESTED", 200, "contact_values_absent_or_masked");
  } else if (category(contact.status, contact.data) === "authorization_denied") {
    add("doctor_unrelated_contact", "PASS", contact.status, "authorization_denied");
  } else
    add(
      "doctor_unrelated_contact",
      "NOT TESTED",
      contact.status,
      category(contact.status, contact.data),
    );
  return results;
}

class CliFailure extends Error {
  constructor(classification, status = null) {
    super(classification);
    this.classification = classification;
    this.status = status;
  }
}

export async function readHiddenInput(label, { input, output, signal }) {
  if (signal?.aborted || input.readableEnded || input.destroyed) throw new CliFailure("cancelled");
  if (!input.isTTY || !output.isTTY) throw new CliFailure("interactive_terminal_required");
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = createInterface({ input, output: silent, terminal: true, historySize: 0 });
  let cancel;
  let onKey;
  try {
    if (!input.isRaw) throw new CliFailure("terminal_input_error");
    const answer = await new Promise((resolve, reject) => {
      cancel = () => reject(new CliFailure("cancelled"));
      onKey = (_text, key) => {
        if (key?.ctrl && key.name === "z") cancel();
      };
      rl.once("SIGINT", cancel);
      rl.once("SIGTSTP", cancel);
      rl.once("close", cancel);
      rl.once("error", () => reject(new CliFailure("terminal_input_error")));
      input.on("keypress", onKey);
      signal?.addEventListener("abort", cancel, { once: true });
      output.write(`${label} (input hidden): `);
      rl.question(label).then(resolve, reject);
    });
    if (!answer.trim()) throw new CliFailure("empty_input");
    return answer;
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (onKey) input.removeListener("keypress", onKey);
    rl.close();
    silent.destroy();
    output.write("\n");
  }
}

function makeRequest(key, fetchRequest, signal) {
  return async (method, path, token, payload) => {
    if (
      !(method === "GET" && path.startsWith("/rest/v1/")) &&
      !(method === "POST" && path === "/auth/v1/token?grant_type=password")
    )
      throw new Error("request not allowed");
    const timeout = AbortSignal.timeout(15000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const failure = () =>
      new CliFailure(
        signal?.aborted ? "cancelled" : timeout.aborted ? "request_timeout" : "network_error",
      );
    let response;
    try {
      response = await fetchRequest(`${ORIGIN}${path}`, {
        method,
        redirect: "error",
        signal: requestSignal,
        headers: {
          apikey: key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
    } catch {
      throw failure();
    }
    let data;
    try {
      data = await response.json();
    } catch {
      if (requestSignal.aborted) throw failure();
      data = null;
    }
    return { status: response.status, data };
  };
}

export async function runCli({ env, prompt, fetchRequest, report, progress, signal }) {
  let stage = "configuration";
  try {
    if (!validTarget(env.CARECONNECT_PRIVACY_TARGET))
      throw new CliFailure("invalid_staging_target");
    const fixture = readFixture(env);
    const key = env.CARECONNECT_STAGING_ANON_KEY ?? (await prompt("Staging publishable key"));
    if (!validKey(key)) throw new CliFailure("invalid_publishable_key");
    const request = makeRequest(key, fetchRequest, signal);
    async function login(label) {
      const email = (await prompt(`${label} email`)).trim();
      const password = await prompt(`${label} password`);
      progress(`Signing in: ${label}...`);
      const result = await request("POST", "/auth/v1/token?grant_type=password", null, {
        email,
        password,
      });
      if (result.status !== 200 || !result.data?.user?.id || !result.data?.access_token)
        throw new CliFailure("authentication_failed", result.status);
      return { id: result.data.user.id, token: result.data.access_token };
    }
    stage = "patient_authentication";
    const patient = await login("Unrelated patient");
    stage = "doctor_authentication";
    const doctor = await login("QA doctor");
    stage = "privacy_checks";
    progress("Running read-only staging privacy checks...");
    const results = await runChecks({ request, patient, doctor, fixture });
    report(results);
    const required = ["patient_private_inbox", "doctor_unrelated_contact"];
    const complete = required.every((check) =>
      results.some((row) => row.check === check && row.result === "PASS"),
    );
    return complete && !results.some(({ result }) => result === "FAIL") ? 0 : 1;
  } catch (error) {
    const classification = signal?.aborted
      ? "cancelled"
      : error instanceof CliFailure
        ? error.classification
        : "unexpected_error";
    report({
      check: stage,
      result: "NOT TESTED",
      status: error instanceof CliFailure ? error.status : null,
      classification,
    });
    return classification === "cancelled" ? 130 : 1;
  }
}

function isEntryPoint(path) {
  try {
    return Boolean(
      path && realpathSync.native(path) === realpathSync.native(fileURLToPath(import.meta.url)),
    );
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1])) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  try {
    process.exitCode = await runCli({
      env: process.env,
      prompt: (label) =>
        readHiddenInput(label, {
          input: process.stdin,
          output: process.stderr.isTTY ? process.stderr : process.stdout,
          signal: controller.signal,
        }),
      fetchRequest: fetch,
      report: (result) => console.log(JSON.stringify(result, null, 2)),
      progress: (text) => console.error(text),
      signal: controller.signal,
    });
  } finally {
    process.off("SIGINT", cancel);
  }
}
