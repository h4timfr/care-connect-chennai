import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { localSqlEnvironment } from "./local-sql-test-target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kinds = ["startup", "ledger", "pgtap", "concurrency"];
const checks = [
  "independent sessions raced for different slots; exactly one was rejected at the five-booking limit.",
  "independent patients raced for the same doctor slot; exactly one booking was committed.",
  "retrying the successful slot was rejected without adding another appointment.",
  "a successful booking rolled back with its caller transaction and left no appointment.",
  "sixth booking was rejected and did not change the committed count.",
  "a cancellation raced a booking without exceeding the active-booking limit.",
  "publication-state changes waited for an in-flight booking; disabled booking was rejected.",
  "a schedule edit waited for an in-flight booking and was rejected to preserve its booked slot.",
];
const diagnostics = [
  [
    /cannot connect to the docker daemon|docker.*(?:not running|unavailable)|pipe.*docker/i,
    "Docker engine unavailable.",
  ],
  [/address already in use|port is already allocated|port.*already.*use/i, "Local port conflict."],
  [
    /failed to (?:pull|fetch|download)|pull access denied|toomanyrequests|no such host|tls handshake timeout/i,
    "Image registry or network failure.",
  ],
  [/unhealthy|health check|failed to become healthy/i, "A local container did not become healthy."],
  [
    /no space left|out of memory|cannot allocate memory|oomkilled/i,
    "Runner disk or memory exhausted.",
  ],
  [/permission denied|operation not permitted/i, "Runner permission denied."],
  [/sqlstate|syntax error|migration.*failed|failed.*migration/i, "Database or migration error."],
  [
    /booking requires read committed|transaction isolation/i,
    "Booking transaction isolation requirement failed.",
  ],
  [/did not reach the barrier/i, "The booking sessions did not both reach the barrier."],
  [/expected one concurrent booking/i, "The concurrent success/rejection count was incorrect."],
  [
    /exactly one committed same-slot booking|slot conflict enforcement/i,
    "The same-slot race assertion failed.",
  ],
  [
    /cancellation race left an invalid|cancellation.*did not complete/i,
    "The cancellation race assertion failed.",
  ],
  [
    /publication-state change was not serialized|booking after booking was disabled/i,
    "The publication-state race assertion failed.",
  ],
  [
    /schedule edits were not serialized|schedule edit and booking did not commit/i,
    "The schedule race assertion failed.",
  ],
  [/unexpected reason/i, "A booking request failed for an unexpected reason."],
  [
    /not rejected|did not fail|expected \d+ active appointments/i,
    "A booking regression assertion failed.",
  ],
  [
    /refusing to run|not a loopback|linked-project metadata/i,
    "The local database safety guard refused execution.",
  ],
];

// No raw line or captured error text is returned. Even unrecognized CLI formats
// fail closed: only fixed labels, numbers and repository-owned filenames escape.
export function summarize(
  raw,
  { kind, exitCode, migrationFiles = [], testFiles = [], expectedAssertionCount },
) {
  if (!kinds.includes(kind) || !Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new Error("Invalid summary configuration.");
  }
  raw = stripVTControlCharacters(raw);
  const output = [
    `${kind}: command ${exitCode === 0 ? "succeeded" : "failed"} (exit ${exitCode}).`,
  ];
  const migrations = migrationFiles.filter(
    (file) => /^\d{5}_[a-z0-9_]+\.sql$/.test(file) && raw.includes(`Applying migration ${file}`),
  );
  if (kind === "startup" && migrations.length) {
    output.push(`Migration attempts observed: ${migrations.length}.`);
    output.push(`Last migration attempt: ${migrations.at(-1)}.`);
  }
  if (kind === "ledger") {
    const expected = migrationFiles
      .filter((file) => /^\d{5}_[a-z0-9_]+\.sql$/.test(file))
      .map((file) => file.slice(0, 5))
      .sort();
    const parsedLedger = parseMigrationLedger(raw);
    const localVersions = [...parsedLedger.localVersions].sort();
    const recordedVersions = [...parsedLedger.remoteVersions].sort();
    const localMatches = sameVersions(expected, localVersions);
    const databaseMatches = sameVersions(expected, recordedVersions);
    const ledgerMatches =
      expected.length > 0 && parsedLedger.valid && localMatches && databaseMatches;
    output.push(`Repository migration versions expected: ${expected.length}.`);
    output.push(`CLI local migration entries recognized: ${localVersions.length}.`);
    output.push(`Local database migration entries recognized: ${recordedVersions.length}.`);
    if (!parsedLedger.valid) {
      output.push("Local migration ledger format: malformed, duplicate, missing, or incomplete.");
    }
    output.push(
      `Local migration ledger gate: ${ledgerMatches ? "PASS" : "FAIL (ledger differs from repository)"}.`,
    );
    const recorded = new Set(recordedVersions);
    for (const file of migrationFiles.filter((name) => recorded.has(name.slice(0, 5)))) {
      output.push(`Local database ledger: ${file}.`);
    }
  }
  if (kind === "pgtap") {
    const knownTestFiles = testFiles.filter((file) => /^\d{3}_[a-z0-9_]+\.test\.sql$/.test(file));
    const failureSummaries = parsePgtapFailureSummaries(raw, knownTestFiles);
    const sqlErrors = parsePgtapSqlErrors(raw, knownTestFiles);
    const statuses = [];
    for (const file of knownTestFiles) {
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const status = raw.match(new RegExp(`${escaped}[ .\\t]+(not ok|ok)\\b`));
      const failureSummary = failureSummaries.get(file);
      const sqlError = sqlErrors.get(file);
      const normalizedStatus = status?.[1] ?? (sqlError ? "SQL execution error" : failureSummary?.problem ? "failed" : null);
      statuses.push(normalizedStatus);
      output.push(`${file}: ${normalizedStatus ?? "result not recognized"}.`);
      if (sqlError) {
        output.push(`SQL error location: ${file}:${sqlError.line}.`);
        output.push(`SQL error category: ${sqlError.category}.`);
        if (sqlError.sqlstate) output.push(`SQLSTATE: ${sqlError.sqlstate}.`);
      }
      if (failureSummary?.problem) {
        output.push(
          `pgTAP file summary: ${file}: tests=${failureSummary.tests}, failed=${failureSummary.failed}.`,
        );
        if (failureSummary.failedOrdinals.length) {
          output.push(
            `Failed assertion ordinals for ${file}: ${failureSummary.failedOrdinals.join(", ")}.`,
          );
        }
      }
    }
    const totalsMatches = [...raw.matchAll(/\bFiles=(\d{1,6}),\s*Tests=(\d{1,6})\b/g)];
    const totals = totalsMatches[0] ?? null;
    if (totals) {
      output.push(`pgTAP totals: ${Number(totals[1])} files, ${Number(totals[2])} assertions.`);
    }
    const resultMatches = [...raw.matchAll(/\bResult: (PASS|FAIL)\b/g)];
    const result = resultMatches[0] ?? null;
    if (result) output.push(`pgTAP reported: ${result[1]}.`);
    const failures = [...raw.matchAll(/\bnot ok (\d{1,5})\b/g)].map((match) => Number(match[1]));
    if (failures.length)
      output.push(`Failed assertion ordinals: ${[...new Set(failures)].join(", ")}.`);
    const gatePasses =
      Number.isInteger(expectedAssertionCount) &&
      statuses.length === testFiles.length &&
      statuses.length > 0 &&
      statuses.every((status) => status === "ok") &&
      totalsMatches.length === 1 &&
      Number(totals[1]) === testFiles.length &&
      Number(totals[2]) === expectedAssertionCount &&
      resultMatches.length === 1 &&
      result?.[1] === "PASS" &&
      !/\bnot ok\b/i.test(raw);
    output.push(
      `Workflow gate: ${gatePasses ? "PASS" : "FAIL (missing, failed, or inconsistent pgTAP results)"}.`,
    );
  }
  if (kind === "concurrency") {
    const outcomes = [];
    checks.forEach((check, index) => {
      outcomes.push(raw.includes(`PASS: ${check}`));
      output.push(
        `Booking regression ${index + 1}: ${outcomes[index] ? "PASS" : "not confirmed"}.`,
      );
    });
    const cleanupConfirmed = raw.includes("Booking race fixtures cleaned for owned local run.");
    output.push(`Booking fixture cleanup: ${cleanupConfirmed ? "PASS" : "not confirmed"}.`);
    output.push(
      `Workflow gate: ${outcomes.every(Boolean) && cleanupConfirmed ? "PASS" : "FAIL (booking checks or owned-fixture cleanup were not confirmed)"}.`,
    );
  }
  if (exitCode !== 0) {
    const matched = kind === "pgtap" ? [] : diagnostics.filter(([pattern]) => pattern.test(raw));
    output.push(...matched.map(([, message]) => `Diagnostic: ${message}`));
    if (!matched.length) {
      const hasPgTapDetail = output.some((line) =>
        line.startsWith("SQL error category: ") ||
        line.startsWith("pgTAP file summary: ") ||
        line.startsWith("Failed assertion ordinals"),
      );
      if (kind !== "pgtap") output.push("Diagnostic: unrecognized failure; raw output was withheld.");
      else if (!hasPgTapDetail) output.push("Diagnostic: unclassified pgTAP failure; raw output was withheld.");
    }
    const states = [
      "42501",
      "23505",
      "23503",
      "23514",
      "23502",
      "25P02",
      "P0001",
      "40001",
      "40P01",
      "42601",
      "0A000",
      "42P01",
      "42703",
    ];
    for (const state of states) {
      if (raw.includes(`SQLSTATE ${state}`) || raw.includes(`SQLSTATE: ${state}`)) {
        output.push(`SQLSTATE: ${state}.`);
      }
    }
  }
  output.push("Raw command output is confined to temporary runner storage and is not an artifact.");
  return `${output.join("\n")}\n`;
}

function sameVersions(expected, actual) {
  return (
    expected.length === actual.length &&
    expected.every((version, index) => version === actual[index])
  );
}

function normalizeLedgerCell(cell) {
  const trimmed = cell.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseMigrationLedger(raw) {
  const lines = raw.split(/\r?\n/);
  const tableLines = lines.map((line) => line.split(/[|│]/).map(normalizeLedgerCell));
  const headers = tableLines
    .map((cells, index) => ({ cells, index }))
    .filter(
      ({ cells }) =>
        cells.some((cell) => cell.toUpperCase() === "LOCAL") &&
        cells.some((cell) => cell.toUpperCase() === "REMOTE"),
    );

  if (headers.length !== 1) {
    return { localVersions: [], remoteVersions: [], valid: false };
  }

  const { cells: headerCells, index: headerIndex } = headers[0];
  const localColumn = headerCells.findIndex((cell) => cell.toUpperCase() === "LOCAL");
  const remoteColumn = headerCells.findIndex((cell) => cell.toUpperCase() === "REMOTE");
  const versionPattern = /^\d{5}$/;
  const localVersions = [];
  const remoteVersions = [];
  let valid = localColumn !== remoteColumn && localColumn >= 0 && remoteColumn >= 0;
  let rows = 0;

  for (const [offset, cells] of tableLines.slice(headerIndex + 1).entries()) {
    if (!/[|│]/.test(lines[headerIndex + offset + 1] ?? "")) continue;
    if (!cells.some((cell) => cell.length > 0)) continue;
    if (cells.length !== headerCells.length) {
      // Ignore only standalone renderer rules; any other malformed row fails closed.
      if (cells.every((cell) => /^[\s─━┄┅-]*$/.test(cell))) continue;
      valid = false;
      continue;
    }
    if (cells.every((cell) => /^[\s─━┄┅-]*$/.test(cell))) continue;

    const localVersion = cells[localColumn];
    const remoteVersion = cells[remoteColumn];
    if (!versionPattern.test(localVersion) || !versionPattern.test(remoteVersion)) {
      valid = false;
      continue;
    }
    localVersions.push(localVersion);
    remoteVersions.push(remoteVersion);
    rows += 1;
  }

  const hasDuplicates = (versions) => new Set(versions).size !== versions.length;
  if (rows === 0 || hasDuplicates(localVersions) || hasDuplicates(remoteVersions)) {
    valid = false;
  }

  return { localVersions, remoteVersions, valid };
}

function parsePgtapFailureSummaries(raw, testFiles) {
  const marker = raw.lastIndexOf("Test Summary Report");
  if (marker < 0) return new Map();

  const lines = raw.slice(marker).split(/\r?\n/);
  const headers = [];
  const headerPattern = /\(Wstat:[^\n)]*\bTests:\s*(\d{1,6})\s+Failed:\s*(\d{1,6})\)/;

  for (const [index, line] of lines.entries()) {
    const counts = line.match(headerPattern);
    if (!counts) continue;
    const file = testFiles.find((candidate) => line.includes(candidate));
    if (!file) continue;
    headers.push({ index, file, tests: Number(counts[1]), failed: Number(counts[2]) });
  }

  const summaries = new Map();
  for (const [position, header] of headers.entries()) {
    const nextHeader = headers[position + 1]?.index;
    const totalsIndex = lines.findIndex(
      (line, index) => index > header.index && /^Files=\d+,\s*Tests=\d+/.test(line),
    );
    const blockEnd = nextHeader ?? (totalsIndex >= 0 ? totalsIndex : lines.length);
    const block = lines.slice(header.index + 1, blockEnd);
    const problem =
      header.failed > 0 ||
      block.some((line) =>
        /^\s+(?:Non-zero exit status|Non-zero wait status|Parse errors):/.test(line),
      );
    const failedOrdinals = [];

    for (let index = 0; index < block.length; index += 1) {
      const first = block[index].match(/^\s+Failed tests?:\s+([0-9,\-\s]+)$/);
      if (!first) continue;
      const ranges = [first[1]];
      while (index + 1 < block.length && /^\s{16}[0-9,\-\s]+$/.test(block[index + 1])) {
        ranges.push(block[index + 1].trim());
        index += 1;
      }
      for (const token of ranges.join(",").split(",")) {
        const normalized = token.trim();
        if (/^\d{1,5}(?:-\d{1,5})?$/.test(normalized)) failedOrdinals.push(normalized);
      }
    }

    summaries.set(header.file, {
      tests: header.tests,
      failed: header.failed,
      problem,
      failedOrdinals: [...new Set(failedOrdinals)],
    });
  }

  return summaries;
}

function parsePgtapSqlErrors(raw, testFiles) {
  const errors = new Map();
  const lines = raw.split(/\r?\n/);
  for (const file of testFiles) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = lines.map((line) => ({
      line,
      match: line.match(new RegExp("(?:^|/)" + escaped + ":(\\d{1,6}):\\s*(?:ERROR|FATAL):\\s*(?:\\[([A-Z0-9]{5})\\]\\s*)?([^\\r\\n]*)", "i")),
    })).find((entry) => entry.match);
    if (!match) continue;
    const location = Number(match.match[1]);
    const rawState = match.match[2] ?? match.line.match(/\\bSQLSTATE:?\\s*([A-Z0-9]{5})\\b/i)?.[1] ?? null;
    const classified = classifyPgtapSqlError(rawState, match.match[3] ?? "");
    errors.set(file, { line: location, ...classified });
  }
  return errors;
}

function classifyPgtapSqlError(rawState, message) {
  const labels = {
    "42501": "database permission denied", "23505": "duplicate fixture key",
    "23503": "fixture foreign-key constraint failed", "23514": "fixture check constraint failed",
    "23502": "fixture required a missing value", "42601": "SQL syntax error",
    "42P01": "database relation missing", "42703": "database column missing",
    "25P02": "an earlier SQL statement aborted the test transaction",
    "0A000": "unsupported transaction setting or feature",
    "P0001": "application validation rejected a fixture operation",
  };
  if (rawState && labels[rawState]) return { category: labels[rawState], sqlstate: rawState };
  const fallback = [
    [/that time slot is no longer available|cannot book appointments in the past|booking horizon exceeds 90 days|appointment date is outside the booking window|time slot is not available for this doctor/i, "application validation rejected a fixture operation", "P0001"],
    [/duplicate key value violates unique constraint/i, "duplicate fixture key", "23505"],
    [/violates foreign key constraint/i, "fixture foreign-key constraint failed", "23503"],
    [/violates check constraint/i, "fixture check constraint failed", "23514"],
    [/violates not-null constraint/i, "fixture required a missing value", "23502"],
    [/row-level security policy|permission denied/i, "database permission denied", "42501"],
    [/syntax error/i, "SQL syntax error", "42601"],
    [/relation .* does not exist/i, "database relation missing", "42P01"],
    [/column .* does not exist/i, "database column missing", "42703"],
    [/current transaction is aborted/i, "an earlier SQL statement aborted the test transaction", "25P02"],
  ];
  const inferred = fallback.find(([pattern]) => pattern.test(message));
  if (inferred) return { category: inferred[1], sqlstate: inferred[2] };
  return { category: "unclassified database exception", sqlstate: null };
}
export function runCapturedStep({ kind, command, args, rawRoot, artifactRoot, cwd = root }) {
  if (!kinds.includes(kind) || !path.isAbsolute(rawRoot) || !path.isAbsolute(artifactRoot)) {
    throw new Error("Invalid capture configuration.");
  }
  const rawRelativeToArtifacts = path.relative(artifactRoot, rawRoot);
  if (
    rawRelativeToArtifacts === "" ||
    (!rawRelativeToArtifacts.startsWith(`..${path.sep}`) &&
      rawRelativeToArtifacts !== ".." &&
      !path.isAbsolute(rawRelativeToArtifacts))
  ) {
    throw new Error("Raw output must be outside the artifact directory.");
  }
  mkdirSync(artifactRoot, { recursive: true });
  const artifactRealRoot = realpathSync(artifactRoot);
  const rawRealRoot = realpathSync(rawRoot);
  const resolvedRelative = path.relative(artifactRealRoot, rawRealRoot);
  if (
    resolvedRelative === "" ||
    (!resolvedRelative.startsWith(`..${path.sep}`) &&
      resolvedRelative !== ".." &&
      !path.isAbsolute(resolvedRelative))
  ) {
    throw new Error("Resolved raw output directory must be outside the artifact directory.");
  }
  const rawDirectory = mkdtempSync(path.join(rawRealRoot, "careconnect-sql-"));
  const rawFile = path.join(rawDirectory, `${kind}.raw.log`);
  const descriptor = openSync(rawFile, "wx", 0o600);
  let result;
  try {
    result = spawnSync(command, args, {
      cwd,
      stdio: ["ignore", descriptor, descriptor],
      windowsHide: true,
      env: localSqlEnvironment(),
    });
  } finally {
    closeSync(descriptor);
  }
  const exitCode = result.status ?? 1;
  const testFiles = readdirSync(path.join(cwd, "supabase/tests"))
    .filter((file) => /^\d{3}_[a-z0-9_]+\.test\.sql$/.test(file))
    .sort();
  const expectedAssertionCount = testFiles.reduce((sum, file) => {
    const source = readFileSync(path.join(cwd, "supabase/tests", file), "utf8");
    const plans = [...source.matchAll(/extensions\.plan\(\s*(\d+)\s*\)/g)];
    if (plans.length !== 1) throw new Error("SQL test assertion plan is invalid.");
    const plan = Number(plans[0][1]);
    if (!Number.isSafeInteger(plan) || plan < 1)
      throw new Error("SQL test assertion plan is invalid.");
    return sum + plan;
  }, 0);
  const raw = readFileSync(rawFile, "utf8");
  const summary = summarize(raw, {
    kind,
    exitCode,
    migrationFiles: readdirSync(path.join(cwd, "supabase/migrations")).sort(),
    testFiles,
    expectedAssertionCount,
  });
  writeFileSync(path.join(artifactRoot, `${kind}.log`), summary);
  const gateFailed =
    exitCode === 0 &&
    ((kind === "ledger" && !summary.includes("Local migration ledger gate: PASS.")) ||
      (kind === "pgtap" && !summary.includes("Workflow gate: PASS.")) ||
      (kind === "concurrency" && !summary.includes("Workflow gate: PASS.")));
  return { exitCode: gateFailed ? 1 : exitCode, summary, rawFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const kind = process.argv[2];
    const commands = {
      startup: ["supabase", ["start"]],
      ledger: ["supabase", ["migration", "list", "--local"]],
      pgtap: [
        "supabase",
        [
          "test",
          "db",
          ...readdirSync(path.join(root, "supabase/tests"))
            .filter((file) => /^\d{3}_[a-z0-9_]+\.test\.sql$/.test(file))
            .sort()
            .map((file) => `supabase/tests/${file}`),
          "--local",
        ],
      ],
      concurrency: [process.execPath, ["scripts/test-booking-concurrency.mjs"]],
    };
    if (!commands[kind] || !process.env.RUNNER_TEMP) throw new Error("CI-only command.");
    const [command, args] = commands[kind];
    const result = runCapturedStep({
      kind,
      command,
      args,
      rawRoot: process.env.RUNNER_TEMP,
      artifactRoot: path.join(root, "test-artifacts"),
    });
    process.stdout.write(result.summary);
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write("SQL CI capture failed; command output was not published.\n");
    process.exitCode = 1;
  }
}
