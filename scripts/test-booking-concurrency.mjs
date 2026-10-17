import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseTemp = path.join(root, "supabase", ".temp");
const psql = process.env.PSQL_BIN || "psql";
const fixtures = {
  setup: path.join(root, "supabase/tests/concurrency/setup.sql"),
  session: path.join(root, "supabase/tests/concurrency/book-session.sql"),
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
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (!allowFailure && result.status !== 0) {
    fail(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
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

  const parsed = new URL(dbUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname !== "/postgres"
  ) {
    fail("Refusing to run: the database endpoint is not a loopback local Supabase database.");
  }
  return dbUrl;
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

function runSession(dbUrl, bookingDate, sessionId, slotTime) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      psqlArgs(
        dbUrl,
        "-f",
        fixtures.session,
        "-v",
        `booking_date=${bookingDate}`,
        "-v",
        `session_id=${sessionId}`,
        "-v",
        `slot_time=${slotTime}`,
      ),
      { cwd: root, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const dbUrl = getLocalDatabaseUrl();
const dateResult = query(dbUrl, "SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + 3)::text");
const bookingDate = dateResult.stdout.trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) fail("Could not obtain a local future booking date.");

let setupStarted = false;
try {
  setupStarted = true;
  run(psql, psqlArgs(dbUrl, "-f", fixtures.cleanup));
  run(psql, psqlArgs(dbUrl, "-f", fixtures.setup, "-v", `booking_date=${bookingDate}`));
  console.log("Disposable booking fixtures created on the loopback Supabase database.");

  const outcomes = await Promise.all([
    runSession(dbUrl, bookingDate, "session-a", "11:00"),
    runSession(dbUrl, bookingDate, "session-b", "11:30"),
  ]);
  const successes = outcomes.filter((outcome) => outcome.status === 0);
  const failures = outcomes.filter((outcome) => outcome.status !== 0);
  if (successes.length !== 1 || failures.length !== 1) {
    fail(
      `Expected one concurrent booking to succeed and one to hit the patient limit; got ${successes.length} successes and ${failures.length} failures.`,
    );
  }
  if (!/Maximum of 5 active bookings allowed per patient/i.test(failures[0].stderr)) {
    fail(`The losing concurrent request failed for an unexpected reason: ${failures[0].stderr}`);
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
} finally {
  if (setupStarted) {
    run(psql, psqlArgs(dbUrl, "-f", fixtures.cleanup));
    console.log("Disposable booking fixtures and test-only trigger were removed.");
  }
}
