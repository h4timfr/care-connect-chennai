import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCapturedStep, summarize } from "./run-sql-ci-step.mjs";

// Synthetic canaries only; no credential or endpoint is copied from a real log.
const canaries = [
  "sb_publishable_SYNTHETIC_CANARY",
  "sb_secret_SYNTHETIC_CANARY",
  "eyJhbGciOiJIUzI1NiJ9.SYNTHETIC_CANARY.signature",
  "SYNTHETIC_PASSWORD",
  "postgresql://postgres:SYNTHETIC_PASSWORD@127.0.0.1:54322/postgres",
  "http://127.0.0.1:54321",
  "SYNTHETIC_S3_ACCESS",
  "SYNTHETIC_S3_SECRET",
];
const table = `
╭──────────────────────────────╮
│ Publishable key │ ${canaries[0]} │
│ Secret key      │ ${canaries[1]} │
│ JWT secret      │ ${canaries[2]} │
│ Password        │ ${canaries[3]} │
│ Database URL    │ ${canaries[4]} │
│ API URL         │ ${canaries[5]} │
│ S3 Access Key   │ ${canaries[6]} │
│ S3 Secret Key   │ ${canaries[7]} │
╰──────────────────────────────╯
${canaries.map((value) => `UNFAMILIAR_KEY=${value}`).join("\n")}
`;
const migrationFiles = ["00001_initial_schema.sql", "00060_serialize_patient_booking_limit.sql"];
const testFiles = [
  "017_public_catalog_schema_contract.test.sql",
  "018_booking_limit_lock.test.sql",
];
const safe = (summary) => {
  for (const canary of canaries)
    assert.ok(!summary.includes(canary), "raw canary escaped into summary");
  assert.doesNotMatch(
    summary,
    /(?:https?|postgres(?:ql)?):\/\/|eyJ|sb_(?:publishable|secret)_|::error::/,
  );
};

test("startup drops Unicode tables, legacy labels, ANSI escapes and unknown formats", () => {
  const raw = `${table}\n\u001b[31mJWT secret: ${canaries[2]}\u001b[0m\nApplying migration 00001_initial_schema.sql...\nApplying migration 00060_serialize_patient_booking_limit.sql...\n::error::${canaries[1]}`;
  const summary = summarize(raw, { kind: "startup", exitCode: 0, migrationFiles });
  safe(summary);
  assert.match(summary, /startup: command succeeded \(exit 0\)/);
  assert.match(summary, /Migration attempts observed: 2/);
  assert.match(summary, /Last migration attempt: 00060_serialize_patient_booking_limit.sql/);
  assert.doesNotMatch(summary, /Publishable|UNFAMILIAR|\u001b|::error::/);
});

test("startup failures expose fixed diagnostic labels, known SQLSTATE and migration only", () => {
  const summary = summarize(
    `Applying migration 00060_serialize_patient_booking_limit.sql...\nERROR syntax error SQLSTATE 42601 ${canaries.join(" ")}`,
    { kind: "startup", exitCode: 1, migrationFiles },
  );
  safe(summary);
  assert.match(summary, /command failed \(exit 1\)/);
  assert.match(summary, /Database or migration error/);
  assert.match(summary, /SQLSTATE: 42601/);
});

for (const [raw, expected] of [
  ["Cannot connect to the Docker daemon", "Docker engine unavailable"],
  ["port is already allocated", "Local port conflict"],
  ["failed to pull image", "Image registry or network failure"],
  ["container unhealthy", "did not become healthy"],
  ["no space left on device", "disk or memory exhausted"],
  ["permission denied", "permission denied"],
  ["unknown new error format", "unrecognized failure"],
]) {
  test(`failure category: ${expected}`, () => {
    const summary = summarize(`${raw}: ${table}`, { kind: "startup", exitCode: 125 });
    safe(summary);
    assert.ok(summary.includes(expected));
  });
}

test("ledger reconstructs only repository migration names", () => {
  const summary = summarize(
    [
      "  LOCAL      │     REMOTE     │     TIME (UTC)",
      `  \u001b[32m\`00001\`\u001b[0m   │   \`00001\`        │ \`00001\``,
      "  `00060`     │   `00060`        │ `00060`",
    ].join("\n"),
    { kind: "ledger", exitCode: 0, migrationFiles },
  );
  safe(summary);
  assert.match(summary, /CLI local migration entries recognized: 2/);
  assert.match(summary, /database migration entries recognized: 2/);
  assert.match(summary, /Local migration ledger gate: PASS/);
  assert.match(summary, /Local database ledger: 00001_initial_schema.sql/);
  assert.match(summary, /Local database ledger: 00060_serialize_patient_booking_limit.sql/);
});

test("ledger compares database versions from REMOTE, not the repository LOCAL column", () => {
  const summary = summarize(
    [
      "  LOCAL      │     REMOTE     │     TIME (UTC)",
      "  `00001`     │   `00001`        │ `00001`",
      "  `00060`     │   `00059`        │ `00059`",
    ].join("\n"),
    { kind: "ledger", exitCode: 0, migrationFiles },
  );
  safe(summary);
  assert.match(summary, /CLI local migration entries recognized: 2/);
  assert.match(summary, /database migration entries recognized: 2/);
  assert.match(summary, /Local database ledger: 00001_initial_schema.sql/);
  assert.doesNotMatch(summary, /Local database ledger: 00060_serialize_patient_booking_limit.sql/);
  assert.match(summary, /Local migration ledger gate: FAIL/);
});

test("ledger fails closed for duplicate, malformed, incomplete, or unexpected versions", () => {
  const header = "LOCAL │ REMOTE │ TIME (UTC)";
  const invalidTables = [
    `${header}\n\`00001\` │ \`00001\` │ \`00001\`\n\`00060\` │ \`00001\` │ \`00001\``,
    `${header}\n\`00001\` │ \`00001\` │ \`00001\`\n\`00060\` │ \`BAD\` │ \`00060\``,
    `${header}\n\`00001\` │ \`00001\` │ \`00001\``,
    `${header}\n\`00001\` │ \`00001\` │ \`00001\`\n\`00059\` │ \`00059\` │ \`00059\``,
  ];

  for (const raw of invalidTables) {
    const summary = summarize(raw, { kind: "ledger", exitCode: 0, migrationFiles });
    safe(summary);
    assert.match(summary, /Local migration ledger gate: FAIL/);
  }
});

test("the executable wrapper converts a zero-exit migration-ledger mismatch into a failing step", () => {
  const migrationFiles = readdirSync("supabase/migrations").sort();
  const localOnly = [
    "LOCAL | REMOTE | TIME (UTC)",
    ...migrationFiles.map((file) => ` ${file.slice(0, 5)} | |`),
  ].join("\n");
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-ledger-gate-test-"));
  try {
    const result = runCapturedStep({
      kind: "ledger",
      command: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(localOnly)});process.exit(0)`],
      rawRoot: temp,
      artifactRoot: path.join(temp, "artifacts"),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.summary, /Local migration ledger gate: FAIL/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("pgTAP summaries retain results/counts without assertion descriptions or arbitrary SQL", () => {
  const raw = `./supabase/tests/${testFiles[0]} .. ok ${canaries[0]}\n./supabase/tests/${testFiles[1]} .. not ok\nnot ok 1 - ${canaries[1]}\npsql:supabase/tests/${testFiles[1]}:17: ERROR: ${canaries[4]}\nFiles=18, Tests=439, 1 wallclock secs\nResult: FAIL\n${table}`;
  const summary = summarize(raw, {
    kind: "pgtap",
    exitCode: 1,
    testFiles,
    expectedAssertionCount: 7,
  });
  safe(summary);
  assert.match(summary, /017_public_catalog_schema_contract.test.sql: ok/);
  assert.ok(summary.includes("018_booking_limit_lock.test.sql: not ok"));
  assert.match(summary, /18 files, 439 assertions/);
  assert.match(summary, /Failed assertion ordinals: 1/);
  assert.match(summary, /SQL error location: 018_booking_limit_lock.test.sql:17/);
  assert.match(summary, /Workflow gate: FAIL/);
});

test("pgTAP harness failure summaries expose only known file counts and assertion ordinals", () => {
  const raw = [
    `./supabase/tests/${testFiles[0]} .. `,
    "Failed 1/1 subtests",
    `psql:${testFiles[1]}:84: ERROR: ${canaries[4]}`,
    "",
    "Test Summary Report",
    "-------------------",
    `./supabase/tests/${testFiles[0]} (Wstat: 0 Tests: 1 Failed: 1)`,
    "  Failed test:  1",
    `./supabase/tests/${testFiles[1]} (Wstat: 768 Tests: 9 Failed: 0)`,
    "  Non-zero exit status: 3",
    "  Parse errors: No plan found in TAP output",
    "Files=2, Tests=10",
    "Result: FAIL",
    table,
  ].join("\n");
  const summary = summarize(raw, {
    kind: "pgtap",
    exitCode: 1,
    testFiles,
    expectedAssertionCount: 10,
  });
  safe(summary);
  assert.match(summary, /017_public_catalog_schema_contract\.test\.sql: failed/);
  assert.match(summary, /017_public_catalog_schema_contract\.test\.sql: tests=1, failed=1/);
  assert.match(
    summary,
    /Failed assertion ordinals for 017_public_catalog_schema_contract\.test\.sql: 1/,
  );
  assert.match(summary, /018_booking_limit_lock\.test\.sql: failed/);
  assert.match(summary, /018_booking_limit_lock\.test\.sql: tests=9, failed=0/);
  assert.doesNotMatch(summary, /No plan found|Non-zero exit status|SYNTHETIC_PASSWORD/);
});

test("pgTAP SQL errors expose SQLSTATE and fixed labels, never raw database messages", () => {
  const files = [
    "012_doctor_portal.test.sql",
    "014_portal_authorization_matrix.test.sql",
    "019_branch_schedule_overlap.test.sql",
  ];
  const raw = [
    "psql:supabase/tests/" + files[0] + ":78: ERROR: [P0001] application validation message " + canaries[1],
    "psql:supabase/tests/" + files[1] + ":49: ERROR: [23505] duplicate key value violates unique constraint " + canaries[4],
    "psql:supabase/tests/" + files[2] + ":84: ERROR: [99999] unknown database message " + canaries[5],
    "Files=3, Tests=12",
    "Result: FAIL",
  ].join("\n");
  const summary = summarize(raw, { kind: "pgtap", exitCode: 1, testFiles: files, expectedAssertionCount: 12 });
  safe(summary);
  assert.ok(summary.includes("012_doctor_portal.test.sql: SQL execution error."));
  assert.ok(summary.includes("SQL error location: 012_doctor_portal.test.sql:78."));
  assert.ok(summary.includes("SQL error category: application validation rejected a fixture operation."));
  assert.ok(summary.includes("SQLSTATE: P0001."));
  assert.ok(summary.includes("SQL error category: duplicate fixture key."));
  assert.ok(summary.includes("SQLSTATE: 23505."));
  assert.ok(summary.includes("SQL error category: unclassified database exception."));
  assert.doesNotMatch(summary, /application validation message|duplicate key value|unknown database message|SYNTHETIC_CANARY/);
  assert.ok(summary.includes("Workflow gate: FAIL"));
});
test("pgTAP SQL errors expose known files, line numbers and fixed categories only", () => {
  const files = [
    "012_doctor_portal.test.sql",
    "014_portal_authorization_matrix.test.sql",
    "019_branch_schedule_overlap.test.sql",
  ];
  const raw = [
    "psql:supabase/tests/" + files[0] + ":78: ERROR: That time slot is no longer available. " + canaries[1],
    "psql:supabase/tests/" + files[1] + ":49: ERROR: duplicate key value violates unique constraint " + canaries[4],
    "psql:supabase/tests/" + files[2] + ":84: ERROR: " + canaries[5],
    "Files=20, Tests=359",
    "Result: FAIL",
  ].join("\n");
  const summary = summarize(raw, { kind: "pgtap", exitCode: 1, testFiles: files, expectedAssertionCount: 460 });
  safe(summary);
  assert.ok(summary.includes("012_doctor_portal.test.sql: SQL execution error."));
  assert.ok(summary.includes("014_portal_authorization_matrix.test.sql: SQL execution error."));
  assert.ok(summary.includes("019_branch_schedule_overlap.test.sql: SQL execution error."));
  assert.ok(summary.includes("SQL error location: 012_doctor_portal.test.sql:78"));
  assert.ok(summary.includes("SQL error location: 014_portal_authorization_matrix.test.sql:49"));
  assert.ok(summary.includes("SQL error location: 019_branch_schedule_overlap.test.sql:84"));
  assert.ok(summary.includes("SQL error category: application validation rejected a fixture operation."));
  assert.ok(summary.includes("SQLSTATE: P0001."));
  assert.match(summary, /duplicate fixture key/);
  assert.ok(summary.includes("SQLSTATE: 23505."));
  assert.match(summary, /unclassified database exception/);
  assert.match(summary, /Workflow gate: FAIL/);
  assert.doesNotMatch(summary, /That time slot is no longer available|duplicate key value|SYNTHETIC_CANARY/);
});
test("unrecognized output never invents a test result", () => {
  const summary = summarize(table, {
    kind: "pgtap",
    exitCode: 1,
    testFiles,
    expectedAssertionCount: 7,
  });
  safe(summary);
  assert.match(summary, /result not recognized/);
  assert.doesNotMatch(summary, /reported: PASS/);
  assert.match(summary, /Workflow gate: FAIL/);
});

test("pgTAP gate accepts only every expected passing file and exact assertion totals", () => {
  const summary = summarize(
    `./supabase/tests/${testFiles[0]} .. ok\n./supabase/tests/${testFiles[1]} .. ok\nFiles=2, Tests=7\nResult: PASS`,
    { kind: "pgtap", exitCode: 0, testFiles, expectedAssertionCount: 7 },
  );
  assert.match(summary, /Workflow gate: PASS/);
});

test("a zero-exit pgTAP FAIL, omitted file, or inconsistent count fails closed", () => {
  for (const raw of [
    `./supabase/tests/${testFiles[0]} .. ok\n./supabase/tests/${testFiles[1]} .. not ok\nFiles=2, Tests=7\nResult: FAIL`,
    `./supabase/tests/${testFiles[0]} .. ok\nFiles=1, Tests=7\nResult: PASS`,
    `./supabase/tests/${testFiles[0]} .. ok\n./supabase/tests/${testFiles[1]} .. ok\nFiles=2, Tests=6\nResult: PASS`,
    `./supabase/tests/${testFiles[0]} .. ok\n./supabase/tests/${testFiles[1]} .. ok\nFiles=2, Tests=7`,
  ]) {
    const summary = summarize(raw, {
      kind: "pgtap",
      exitCode: 0,
      testFiles,
      expectedAssertionCount: 7,
    });
    assert.match(summary, /Workflow gate: FAIL/);
  }
});

test("the executable wrapper converts a zero-exit pgTAP failure into a failing step", () => {
  const testDirectory = path.resolve("supabase/tests");
  const allFiles = readdirSync(testDirectory)
    .filter((file) => /^\d{3}_[a-z0-9_]+\.test\.sql$/.test(file))
    .sort();
  const planTotal = allFiles.reduce((sum, file) => {
    const source = readFileSync(path.join(testDirectory, file), "utf8");
    return sum + Number(source.match(/extensions\.plan\(\s*(\d+)\s*\)/)?.[1] ?? 0);
  }, 0);
  const falseGreen = [
    ...allFiles.map((file) => `./supabase/tests/${file} .. ok`),
    `Files=${allFiles.length}, Tests=${planTotal}`,
    "Result: FAIL",
  ].join("\n");
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-pgtap-gate-test-"));
  try {
    const result = runCapturedStep({
      kind: "pgtap",
      command: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(falseGreen)});process.exit(0)`],
      rawRoot: temp,
      artifactRoot: path.join(temp, "artifacts"),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.summary, /Workflow gate: FAIL/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("concurrency output is matched against fixed known checks", () => {
  const summary = summarize(
    `PASS: independent sessions raced for different slots; exactly one was rejected at the five-booking limit.\nPASS: a successful booking rolled back with its caller transaction and left no appointment.\nPASS: ${canaries[1]}\n${table}`,
    { kind: "concurrency", exitCode: 1 },
  );
  safe(summary);
  assert.match(summary, /regression 1: PASS/);
  assert.match(summary, /regression 2: not confirmed/);
  assert.match(summary, /regression 3: not confirmed/);
  assert.match(summary, /regression 4: PASS/);
  assert.match(summary, /command failed/);
});

test("a zero-exit concurrency command fails when any required check is absent", () => {
  const summary = summarize(
    "PASS: independent sessions raced for different slots; exactly one was rejected at the five-booking limit.",
    { kind: "concurrency", exitCode: 0 },
  );
  assert.match(summary, /Workflow gate: FAIL/);
});

test("concurrency gate passes only when every independent regression is explicitly confirmed", () => {
  const raw = [
    "independent sessions raced for different slots; exactly one was rejected at the five-booking limit.",
    "independent patients raced for the same doctor slot; exactly one booking was committed.",
    "retrying the successful slot was rejected without adding another appointment.",
    "a successful booking rolled back with its caller transaction and left no appointment.",
    "sixth booking was rejected and did not change the committed count.",
    "a cancellation raced a booking without exceeding the active-booking limit.",
    "publication-state changes waited for an in-flight booking; disabled booking was rejected.",
    "a schedule edit waited for an in-flight booking and was rejected to preserve its booked slot.",
  ]
    .map((check) => `PASS: ${check}`)
    .join("\n");
  const summary = summarize(`${raw}\nBooking race fixtures cleaned for owned local run.`, {
    kind: "concurrency",
    exitCode: 0,
  });
  assert.match(summary, /Workflow gate: PASS/);
});

test("concurrency gate fails closed when owned fixture cleanup is unconfirmed", () => {
  const raw = [
    "independent sessions raced for different slots; exactly one was rejected at the five-booking limit.",
    "independent patients raced for the same doctor slot; exactly one booking was committed.",
    "retrying the successful slot was rejected without adding another appointment.",
    "a successful booking rolled back with its caller transaction and left no appointment.",
    "sixth booking was rejected and did not change the committed count.",
    "a cancellation raced a booking without exceeding the active-booking limit.",
    "publication-state changes waited for an in-flight booking; disabled booking was rejected.",
    "a schedule edit waited for an in-flight booking and was rejected to preserve its booked slot.",
  ]
    .map((check) => `PASS: ${check}`)
    .join("\n");
  const summary = summarize(raw, { kind: "concurrency", exitCode: 0 });
  assert.match(summary, /Booking fixture cleanup: not confirmed/);
  assert.match(summary, /Workflow gate: FAIL/);
});

test("untrusted filenames and invalid inputs cannot become output", () => {
  const summary = summarize(table, {
    kind: "pgtap",
    exitCode: 1,
    testFiles: [canaries[4], `018_${canaries[1]}.test.sql`],
  });
  safe(summary);
  assert.throws(() => summarize(table, { kind: "unknown", exitCode: 1 }));
  assert.throws(() => summarize(table, { kind: "startup", exitCode: canaries[0] }));
});

for (const code of [0, 23]) {
  test(`real child capture preserves exit ${code}, keeps raw temporary and artifact sanitized`, () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-ci-capture-test-"));
    try {
      const artifactRoot = path.join(temp, "artifacts");
      const result = runCapturedStep({
        kind: "startup",
        command: process.execPath,
        args: [
          "-e",
          `process.stdout.write(${JSON.stringify(table)});process.stderr.write('syntax error SQLSTATE 42601');process.exit(${code})`,
        ],
        rawRoot: temp,
        artifactRoot,
      });
      assert.equal(result.exitCode, code);
      assert.equal(readFileSync(result.rawFile, "utf8").includes(canaries[1]), true);
      assert.deepEqual(readdirSync(artifactRoot), ["startup.log"]);
      assert.equal(readFileSync(path.join(artifactRoot, "startup.log"), "utf8"), result.summary);
      safe(result.summary);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}

test("raw output cannot be placed in the artifact tree", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-ci-path-test-"));
  try {
    for (const rawRoot of [temp, path.join(temp, "raw")]) {
      assert.throws(
        () =>
          runCapturedStep({
            kind: "startup",
            command: process.execPath,
            args: [],
            rawRoot,
            artifactRoot: temp,
          }),
        /outside the artifact directory/,
      );
    }
    assert.deepEqual(readdirSync(temp), []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("resolved symlink paths cannot place raw output inside the artifact tree", (t) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-ci-symlink-test-"));
  try {
    const rawRoot = path.join(temp, "raw");
    const artifactAlias = path.join(temp, "artifact-alias");
    mkdirSync(rawRoot);
    try {
      symlinkSync(rawRoot, artifactAlias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
        t.skip(`symlink creation is unavailable in this environment (${error.code})`);
        return;
      }
      throw error;
    }
    assert.throws(
      () =>
        runCapturedStep({
          kind: "startup",
          command: process.execPath,
          args: [],
          rawRoot,
          artifactRoot: artifactAlias,
        }),
      /Resolved raw output directory must be outside the artifact directory/,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("an executable that cannot start still fails without exposing its error text", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "careconnect-ci-spawn-test-"));
  try {
    const result = runCapturedStep({
      kind: "startup",
      command: path.join(temp, canaries[1]),
      args: [],
      rawRoot: temp,
      artifactRoot: path.join(temp, "artifacts"),
    });
    assert.equal(result.exitCode, 1);
    safe(result.summary);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
