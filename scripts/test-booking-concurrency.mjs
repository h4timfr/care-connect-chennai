import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertLocalDatabaseUrl,
  localPsqlCommand,
  localSqlEnvironment,
  safeSqlFailure,
} from "./local-sql-test-target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseTemp = path.join(root, "supabase", ".temp");
const psql = localPsqlCommand();
const fixtures = {
  setup: path.join(root, "supabase/tests/concurrency/setup.sql"),
  session: path.join(root, "supabase/tests/concurrency/book-session.sql"),
  singleSession: path.join(root, "supabase/tests/concurrency/book-single-session.sql"),
  cancelSession: path.join(root, "supabase/tests/concurrency/cancel-session.sql"),
  publicationSession: path.join(root, "supabase/tests/concurrency/publication-session.sql"),
  scheduleUpdate: path.join(root, "supabase/tests/concurrency/schedule-update.sql"),
  cleanup: path.join(root, "supabase/tests/concurrency/cleanup.sql"),
};

function fail(message) {
  throw new Error(message);
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: localSqlEnvironment(),
  });
  if (result.error) fail(safeSqlFailure(command, null, result.error.message));
  if (!allowFailure && result.status !== 0) {
    fail(safeSqlFailure(command, result.status, result.stderr || result.stdout));
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function getLocalDatabaseUrl() {
  if (
    existsSync(path.join(supabaseTemp, "linked-project.json")) ||
    existsSync(path.join(supabaseTemp, "project-ref"))
  ) {
    fail("Refusing to run: this checkout has Supabase linked-project metadata.");
  }
  const help = run("supabase", ["status", "--help"]);
  const statusArgs = help.stdout.includes("--output")
    ? ["status", "--output", "env"]
    : help.stdout.includes("--env") && help.stdout.includes("--output-format")
      ? ["status", "--env", "--output-format", "text"]
      : fail("Installed Supabase CLI has no supported environment output for status.");
  const status = run("supabase", statusArgs);
  const dbLine = status.stdout.split(/\r?\n/).find((line) => /^DB_URL=/.test(line));
  const match = dbLine?.match(/^DB_URL=(?:"([^"]*)"|'([^']*)'|(.+))$/);
  const dbUrl = match?.[1] ?? match?.[2] ?? match?.[3]?.trim();
  if (!dbUrl) fail("Supabase CLI did not return a local DB_URL.");

  return assertLocalDatabaseUrl(dbUrl);
}

function psqlArgs(dbUrl, ...args) {
  return ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", ...args, dbUrl];
}

function query(dbUrl, sql, { allowFailure = false } = {}) {
  return run(psql, psqlArgs(dbUrl, "-At", "-c", sql), { allowFailure });
}

function assertCount(dbUrl, expected, label) {
  const result = query(
    dbUrl,
    "SELECT count(*) FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000003' AND status IN ('pending','confirmed')",
  );
  if (result.stdout.trim() !== String(expected)) {
    fail(`${label}: expected ${expected} active appointments, got ${result.stdout.trim()}.`);
  }
}

function runSqlFile(dbUrl, sqlFile, variables) {
  return new Promise((resolve, reject) => {
    const vars = Object.entries(variables).flatMap(([name, value]) => ["-v", `${name}=${value}`]);
    const child = spawn(psql, psqlArgs(dbUrl, "-f", sqlFile, ...vars), {
      cwd: root,
      windowsHide: true,
      env: localSqlEnvironment(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", () =>
      reject(new Error("psql could not start; raw SQL diagnostics were withheld.")),
    );
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function runSession(dbUrl, { bookingDate, sessionId, runId, patientUserId, slotTime, reason }) {
  return runSqlFile(dbUrl, fixtures.session, {
    booking_date: bookingDate,
    session_id: sessionId,
    run_id: runId,
    patient_user_id: patientUserId,
    doctor_id: "f7600000-0000-4000-8000-000000000005",
    clinic_id: "f7600000-0000-4000-8000-000000000004",
    slot_time: slotTime,
    reason,
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForActivity(dbUrl, sql) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = query(dbUrl, sql);
    if (result.stdout.trim() === "1") return true;
    await delay(50);
  }
  return false;
}

const dbUrl = getLocalDatabaseUrl();
const dateResult = query(dbUrl, "SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + 3)::text");
const bookingDate = dateResult.stdout.trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) fail("Could not obtain a local future booking date.");
const stateDate = query(dbUrl, `SELECT ('${bookingDate}'::date + 7)::text`).stdout.trim();
const scheduleDate = query(dbUrl, `SELECT ('${bookingDate}'::date + 14)::text`).stdout.trim();

const fixtureCollision = query(
  dbUrl,
  `SELECT (
     EXISTS (SELECT 1 FROM auth.users WHERE id IN (
       'f7600000-0000-4000-8000-000000000001', 'f7600000-0000-4000-8000-000000000002',
       'f7600000-0000-4000-8000-000000000009', 'f7600000-0000-4000-8000-00000000000a'))
     OR EXISTS (SELECT 1 FROM public.patients WHERE id IN (
       'f7600000-0000-4000-8000-000000000003', 'f7600000-0000-4000-8000-000000000007',
       'f7600000-0000-4000-8000-000000000008'))
     OR EXISTS (SELECT 1 FROM public.clinics WHERE id = 'f7600000-0000-4000-8000-000000000004')
     OR EXISTS (SELECT 1 FROM public.doctors WHERE id = 'f7600000-0000-4000-8000-000000000005')
     OR pg_catalog.to_regclass('public.__careconnect_booking_race_barrier') IS NOT NULL
     OR pg_catalog.to_regclass('public.__careconnect_booking_race_run') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.audit_logs WHERE target_id = 'f7600000-0000-4000-8000-000000000004'
       OR (actor_id IN ('f7600000-0000-4000-8000-000000000001', 'f7600000-0000-4000-8000-000000000002',
                        'f7600000-0000-4000-8000-000000000009', 'f7600000-0000-4000-8000-00000000000a')
           AND action_type IN ('clinic_publication_state_changed', 'appointment_booked', 'appointment_status_changed')))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname IN (
       'z_careconnect_booking_race_delay', 'z_careconnect_booking_race_update_delay'))
   )::integer`,
);
if (fixtureCollision.stdout.trim() !== "0") {
  fail("Refusing to run: disposable booking fixture identifiers are already present locally.");
}

let setupAttempted = false;
const setupRunId = randomUUID();
try {
  setupAttempted = true;
  run(
    psql,
    psqlArgs(
      dbUrl,
      "-f",
      fixtures.setup,
      "-v",
      `booking_date=${bookingDate}`,
      "-v",
      `run_id=${setupRunId}`,
    ),
  );
  console.log("Disposable booking fixtures created on the loopback Supabase database.");

  const patientRunId = randomUUID();
  const outcomes = await Promise.all([
    runSession(dbUrl, {
      bookingDate,
      sessionId: "patient-a",
      runId: patientRunId,
      patientUserId: "f7600000-0000-4000-8000-000000000001",
      slotTime: "11:00",
      reason: "Patient limit race",
    }),
    runSession(dbUrl, {
      bookingDate,
      sessionId: "patient-b",
      runId: patientRunId,
      patientUserId: "f7600000-0000-4000-8000-000000000001",
      slotTime: "11:30",
      reason: "Patient limit race",
    }),
  ]);
  const successes = outcomes.filter((outcome) => outcome.status === 0);
  const failures = outcomes.filter((outcome) => outcome.status !== 0);
  if (successes.length !== 1 || failures.length !== 1) {
    fail(
      `Expected one concurrent booking to succeed and one to hit the patient limit; got ${successes.length} successes and ${failures.length} failures.`,
    );
  }
  if (!/Maximum of 5 active bookings allowed per patient/i.test(failures[0].stderr)) {
    fail(
      "The losing concurrent request failed for an unexpected reason; raw SQL diagnostics were withheld.",
    );
  }
  assertCount(dbUrl, 5, "Concurrent booking limit");
  console.log(
    "PASS: independent sessions raced for different slots; exactly one was rejected at the five-booking limit.",
  );

  const winner = outcomes.findIndex((outcome) => outcome.status === 0);
  const winningSlot = winner === 0 ? "11:00" : "11:30";
  query(
    dbUrl,
    "DELETE FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000003' AND time = '09:00'",
  );
  assertCount(dbUrl, 4, "Retry fixture preparation");

  const retry = query(
    dbUrl,
    `SET ROLE authenticated; SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}'; SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${bookingDate}'::date,'${winningSlot}'::time,'Retry');`,
    { allowFailure: true },
  );
  if (retry.status === 0 || !/no longer available/i.test(retry.stderr)) {
    fail("Retrying the successful slot did not fail as an already-booked slot.");
  }
  assertCount(dbUrl, 4, "Rejected retry atomicity");
  console.log(
    "PASS: retrying the successful slot was rejected without adding another appointment.",
  );

  const rollback = query(
    dbUrl,
    `BEGIN; SET ROLE authenticated; SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}'; SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${bookingDate}'::date,'12:00'::time,'Rollback check'); ROLLBACK;`,
  );
  assertCount(dbUrl, 4, "Explicit transaction rollback");
  console.log(
    "PASS: a successful booking rolled back with its caller transaction and left no appointment.",
  );

  query(
    dbUrl,
    `SET ROLE authenticated; SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}'; SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${bookingDate}'::date,'12:00'::time,'Fill fifth place');`,
  );
  assertCount(dbUrl, 5, "Fifth booking");

  const sixth = query(
    dbUrl,
    `SET ROLE authenticated; SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}'; SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${bookingDate}'::date,'12:30'::time,'Sixth booking');`,
    { allowFailure: true },
  );
  if (
    sixth.status === 0 ||
    !/Maximum of 5 active bookings allowed per patient/i.test(sixth.stderr)
  ) {
    fail("The sixth sequential booking was not rejected by the active-booking limit.");
  }
  assertCount(dbUrl, 5, "Rejected sixth booking atomicity");
  console.log("PASS: sixth booking was rejected and did not change the committed count.");

  const sameSlotRunId = randomUUID();
  const sameSlotOutcomes = await Promise.all([
    runSession(dbUrl, {
      bookingDate,
      sessionId: "same-slot-a",
      runId: sameSlotRunId,
      patientUserId: "f7600000-0000-4000-8000-000000000009",
      slotTime: "13:00",
      reason: "Same slot race",
    }),
    runSession(dbUrl, {
      bookingDate,
      sessionId: "same-slot-b",
      runId: sameSlotRunId,
      patientUserId: "f7600000-0000-4000-8000-00000000000a",
      slotTime: "13:00",
      reason: "Same slot race",
    }),
  ]);
  const sameSlotSuccesses = sameSlotOutcomes.filter((outcome) => outcome.status === 0);
  const sameSlotFailures = sameSlotOutcomes.filter((outcome) => outcome.status !== 0);
  if (sameSlotSuccesses.length !== 1 || sameSlotFailures.length !== 1) {
    fail("Two independent patients did not produce exactly one committed same-slot booking.");
  }
  if (
    !/no longer available|duplicate key value violates unique constraint|idx_appointments_no_double_booking/i.test(
      sameSlotFailures[0].stderr,
    )
  ) {
    fail(
      "The losing same-slot request failed for a reason other than slot conflict enforcement; raw SQL diagnostics were withheld.",
    );
  }
  const sameSlotCount = query(
    dbUrl,
    `SELECT count(*) FROM public.appointments WHERE doctor_id = 'f7600000-0000-4000-8000-000000000005' AND date = '${bookingDate}' AND time = '13:00' AND status IN ('pending','confirmed','arrived')`,
  );
  if (sameSlotCount.stdout.trim() !== "1")
    fail("The same doctor/date/time slot does not have exactly one active appointment.");
  console.log(
    "PASS: independent patients raced for the same doctor slot; exactly one booking was committed.",
  );

  const cancellationRunId = randomUUID();
  const [racedBooking, racedCancellation] = await Promise.all([
    runSession(dbUrl, {
      bookingDate,
      sessionId: "cancel-race-booking",
      runId: cancellationRunId,
      patientUserId: "f7600000-0000-4000-8000-000000000001",
      slotTime: "12:30",
      reason: "Cancellation race",
    }),
    runSqlFile(dbUrl, fixtures.cancelSession, {
      booking_date: bookingDate,
      run_id: cancellationRunId,
      session_id: "cancel-race-update",
      patient_user_id: "f7600000-0000-4000-8000-000000000001",
    }),
  ]);
  if (racedCancellation.status !== 0)
    fail("The patient cancellation did not complete successfully.");
  if (
    racedBooking.status !== 0 &&
    !/Maximum of 5 active bookings allowed per patient/i.test(racedBooking.stderr)
  ) {
    fail("The booking/cancellation race failed for an unexpected reason.");
  }
  const cancelledFixture = query(
    dbUrl,
    `SELECT count(*) FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000003' AND date = '${bookingDate}' AND time = '09:30' AND status = 'cancelled'`,
  );
  if (cancelledFixture.stdout.trim() !== "1")
    fail("The expected patient cancellation was not committed.");
  const postRaceCount = query(
    dbUrl,
    "SELECT count(*) FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000003' AND status IN ('pending','confirmed')",
  );
  if (!["4", "5"].includes(postRaceCount.stdout.trim())) {
    fail("The cancellation race left an invalid active-booking count.");
  }
  if (racedBooking.status !== 0) {
    const retryAfterCancel = query(
      dbUrl,
      `SET ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}', false); SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${bookingDate}'::date,'12:30'::time,'Retry after cancellation');`,
      { allowFailure: true },
    );
    if (retryAfterCancel.status !== 0)
      fail("Retry after the cancellation committed did not succeed.");
  }
  assertCount(dbUrl, 5, "Cancellation race and retry");
  console.log("PASS: a cancellation raced a booking without exceeding the active-booking limit.");

  const stateBooking = runSqlFile(dbUrl, fixtures.singleSession, {
    patient_user_id: "f7600000-0000-4000-8000-000000000009",
    doctor_id: "f7600000-0000-4000-8000-000000000005",
    clinic_id: "f7600000-0000-4000-8000-000000000004",
    booking_date: stateDate,
    slot_time: "12:00",
    reason: "Publication serialization test",
  });
  const bookingSleeping = await waitForActivity(
    dbUrl,
    `SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name = 'careconnect-disposable-sql-test' AND state = 'active' AND wait_event = 'PgSleep' AND query LIKE '%public.book_appointment(%'`,
  );
  if (!bookingSleeping) {
    const outcome = await stateBooking;
    if (outcome.status !== 0) fail("The booking did not reach the publication-state race point.");
    fail("The test-only booking delay was not observed in pg_stat_activity.");
  }
  const disablePublication = runSqlFile(dbUrl, fixtures.publicationSession, {
    booking_enabled: "false",
  });
  const publicationBlocked = await waitForActivity(
    dbUrl,
    `SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name = 'careconnect-disposable-sql-test' AND state = 'active' AND wait_event_type = 'Lock' AND query LIKE '%admin_set_clinic_publication_state%'`,
  );
  const [stateBookingOutcome, publicationOutcome] = await Promise.all([
    stateBooking,
    disablePublication,
  ]);
  if (!publicationBlocked || stateBookingOutcome.status !== 0 || publicationOutcome.status !== 0) {
    fail("Publication-state change was not serialized around an in-flight booking.");
  }
  const publicationState = query(
    dbUrl,
    `SELECT (NOT booking_enabled)::integer FROM public.clinics WHERE id = 'f7600000-0000-4000-8000-000000000004'`,
  );
  const serializedBooking = query(
    dbUrl,
    `SELECT count(*) FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000007' AND date = '${stateDate}' AND time = '12:00' AND status = 'pending'`,
  );
  if (publicationState.stdout.trim() !== "1" || serializedBooking.stdout.trim() !== "1") {
    fail("The booking/publication transition did not commit in a valid serialized order.");
  }
  const disabledBooking = query(
    dbUrl,
    `SET ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"f7600000-0000-4000-8000-00000000000a","role":"authenticated"}', false); SELECT public.book_appointment('f7600000-0000-4000-8000-000000000005','f7600000-0000-4000-8000-000000000004','${stateDate}'::date,'12:30'::time,'Disabled publication test');`,
    { allowFailure: true },
  );
  if (
    disabledBooking.status === 0 ||
    !/not currently active or verified/i.test(disabledBooking.stderr)
  ) {
    fail("A new booking succeeded after booking was disabled.");
  }
  console.log(
    "PASS: publication-state changes waited for an in-flight booking; disabled booking was rejected.",
  );

  const publicationRestored = await runSqlFile(dbUrl, fixtures.publicationSession, {
    booking_enabled: "true",
  });
  if (publicationRestored.status !== 0)
    fail("The test fixture publication state could not be restored.");

  const scheduleBooking = runSqlFile(dbUrl, fixtures.singleSession, {
    patient_user_id: "f7600000-0000-4000-8000-00000000000a",
    doctor_id: "f7600000-0000-4000-8000-000000000005",
    clinic_id: "f7600000-0000-4000-8000-000000000004",
    booking_date: scheduleDate,
    slot_time: "12:30",
    reason: "Schedule serialization test",
  });
  const scheduleBookingSleeping = await waitForActivity(
    dbUrl,
    `SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name = 'careconnect-disposable-sql-test' AND state = 'active' AND wait_event = 'PgSleep' AND query LIKE '%public.book_appointment(%'`,
  );
  if (!scheduleBookingSleeping) {
    const outcome = await scheduleBooking;
    if (outcome.status !== 0) fail("The schedule test booking did not reach the intended request.");
    fail("The test-only schedule booking delay was not observed.");
  }
  const scheduleChange = runSqlFile(dbUrl, fixtures.scheduleUpdate, { booking_date: scheduleDate });
  const scheduleBlocked = await waitForActivity(
    dbUrl,
    `SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name = 'careconnect-disposable-sql-test' AND state = 'active' AND wait_event_type = 'Lock' AND query LIKE '%UPDATE public.doctor_schedules%'`,
  );
  const [scheduleBookingOutcome, scheduleChangeOutcome] = await Promise.all([
    scheduleBooking,
    scheduleChange,
  ]);
  if (
    !scheduleBlocked ||
    scheduleBookingOutcome.status !== 0 ||
    scheduleChangeOutcome.status === 0 ||
    !/future active appointments cannot be changed/i.test(scheduleChangeOutcome.stderr)
  ) {
    fail("A schedule change was not rejected after waiting for the in-flight booking.");
  }
  const scheduleResult = query(
    dbUrl,
    `SELECT end_time = '14:00'::time FROM public.doctor_schedules WHERE doctor_id = 'f7600000-0000-4000-8000-000000000005' AND clinic_id = 'f7600000-0000-4000-8000-000000000004' AND day_of_week = EXTRACT(DOW FROM '${scheduleDate}'::date)::integer`,
  );
  const scheduledBooking = query(
    dbUrl,
    `SELECT count(*) FROM public.appointments WHERE patient_id = 'f7600000-0000-4000-8000-000000000008' AND date = '${scheduleDate}' AND time = '12:30' AND status = 'pending'`,
  );
  if (scheduleResult.stdout.trim() !== "t" || scheduledBooking.stdout.trim() !== "1") {
    fail("Schedule edit changed the schedule or lost the concurrent booking.");
  }
  console.log(
    "PASS: a schedule edit waited for an in-flight booking and was rejected to preserve its booked slot.",
  );
} finally {
  if (setupAttempted) {
    const markerExists = query(
      dbUrl,
      "SELECT (pg_catalog.to_regclass('public.__careconnect_booking_race_run') IS NOT NULL)::integer",
    );
    if (markerExists.stdout.trim() === "1") {
      const ownsFixtures = query(
        dbUrl,
        `SELECT count(*) FROM public.__careconnect_booking_race_run WHERE run_id = '${setupRunId}'::uuid`,
      );
      if (ownsFixtures.stdout.trim() === "1") {
        run(psql, psqlArgs(dbUrl, "-f", fixtures.cleanup, "-v", `run_id=${setupRunId}`));
        console.log("Booking race fixtures cleaned for owned local run.");
      }
    }
  }
}
