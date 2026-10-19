import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
  assertLocalDatabaseUrl,
  localPsqlCommand,
  localSqlEnvironment,
} from "./local-sql-test-target.mjs";
import { summarize } from "./run-sql-ci-step.mjs";

export const targetVersions = [
  ...Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(5, "0")),
  ...Array.from({ length: 17 }, (_, i) => String(i + 45).padStart(5, "0")),
];
export const aliasFile = "20261009041700_00001_initial_schema.sql";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function check(condition) {
  if (!condition) throw new Error("Rehearsal invariant failed; raw details withheld.");
}

export function validateInventory(files) {
  const sql = files.filter((f) => f.endsWith(".sql")).sort();
  check(sql.length === 40);
  check(
    sql.every((f, i) => /^\d{5}_[a-z0-9_]+\.sql$/.test(f) && f.slice(0, 5) === targetVersions[i]),
  );
  return sql;
}

export function pendingVersions(applied) {
  check(new Set(applied).size === applied.length);
  check(applied.every((v) => targetVersions.includes(v)));
  return targetVersions.filter((v) => !applied.includes(v));
}

export function normalizeDump(source) {
  return source
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^-- (?:Dumped|Started|Completed)\b/.test(line) && !/^\\(?:un)?restrict\b/.test(line),
    )
    .join("\n");
}

export function verifyPinnedCliVersion(raw) {
  const versions = stripVTControlCharacters(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(line));
  check(versions.length === 1 && versions[0] === "2.117.0");
}

export function verifyMigrationContents(originals, manifest) {
  check(manifest.format === 1 && manifest.migrations.length === targetVersions.length);
  check(originals.size === manifest.migrations.length);
  for (const [index, entry] of manifest.migrations.entries()) {
    check(entry.version === targetVersions[index]);
    check(entry.file.startsWith(`${entry.version}_`));
    const source = originals.get(entry.file);
    check(typeof source === "string");
    // Git checkouts can use CRLF. No other whitespace or SQL normalization.
    const digest = createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
    check(digest === entry.sha256_lf);
  }
}

export function restoreFailureLabels(raw) {
  const patterns = [
    [/permission denied|must be (?:owner|superuser)|only superuser/i, "permission-or-ownership"],
    [/already exists/i, "object-already-exists"],
    [/does not exist|not found/i, "missing-object-or-role"],
    [/extension.*(?:not available|not installed)|could not open extension/i, "missing-extension"],
    [
      /can only be loaded in database|can only create extension in database/i,
      "database-specific-extension",
    ],
    [/unsupported version|unsupported.*archive|input file.*not.*valid archive/i, "archive-format"],
    [/unrecognized configuration parameter/i, "server-setting-incompatibility"],
    [/event trigger/i, "event-trigger-context"],
    [/cannot drop.*required by|depend.*on it/i, "dependent-object"],
    [/cannot drop.*extension|extension.*requires it/i, "extension-owned-object"],
    [/query failed|could not execute query/i, "restore-sql-failed"],
    [/connection.*(?:closed|refused)|terminating connection/i, "connection-failed"],
  ];
  const labels = patterns.filter(([pattern]) => pattern.test(raw)).map(([, label]) => label);
  return labels.length ? labels : ["unrecognized-restore-failure"];
}

export function assertNoRemoteEnvironment(env) {
  for (const [key, value] of Object.entries(env)) {
    if (/^(?:SUPABASE_|VITE_SUPABASE_|DATABASE_URL$|DOTENV_PRIVATE_KEY)/i.test(key)) check(!value);
  }
}

export function assertOutsideCheckout(checkout, raw) {
  const relative = path.relative(realpathSync(checkout), realpathSync(raw));
  check(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

export function assertCliArguments(args) {
  const prefix = args.slice(0, 2).join(" ");
  const known = ["init", "start", "status", "stop", "--version"];
  check(known.includes(args[0]) || ["db push", "db reset", "migration repair"].includes(prefix));
  check(!args.some((v) => ["--linked", "--db-url", "--project-ref", "--include-all"].includes(v)));
  if (["db push", "db reset", "migration repair"].includes(prefix) && !args.includes("--help")) {
    check(args.includes("--local"));
  }
}

async function main() {
  check(process.platform === "linux" && process.argv.slice(2).join(" ") === "--execute");
  check(process.env.RUNNER_TEMP && path.isAbsolute(process.env.RUNNER_TEMP));
  assertNoRemoteEnvironment(process.env);
  assertOutsideCheckout(root, process.env.RUNNER_TEMP);
  check(!readdirSync(root).some((f) => /^\.env(?:\.|$)/.test(f) && f !== ".env.example"));
  check(!existsSync(path.join(root, "supabase/.temp/project-ref")));
  check(!existsSync(path.join(root, "supabase/.temp/linked-project.json")));
  const files = validateInventory(readdirSync(path.join(root, "supabase/migrations")));
  const testFiles = readdirSync(path.join(root, "supabase/tests"))
    .filter((f) => f.endsWith(".test.sql"))
    .sort();
  check(
    testFiles.length === 21 &&
      testFiles.every((f, i) => f.startsWith(`${String(i + 1).padStart(3, "0")}_`)),
  );
  const privateRoot = mkdtempSync(
    path.join(process.env.RUNNER_TEMP, "careconnect-staging-rehearsal-"),
  );
  const work = path.join(privateRoot, "repo");
  const artifacts = path.join(root, "test-artifacts");
  mkdirSync(artifacts, { recursive: true });
  mkdirSync(work);
  cpSync(path.join(root, "scripts"), path.join(work, "scripts"), { recursive: true });
  cpSync(path.join(root, "supabase/tests"), path.join(work, "supabase/tests"), { recursive: true });
  const migrations = path.join(work, "supabase/migrations");
  mkdirSync(migrations);
  const originals = new Map(
    files.map((f) => [f, readFileSync(path.join(root, "supabase/migrations", f), "utf8")]),
  );
  verifyMigrationContents(
    originals,
    JSON.parse(readFileSync(path.join(root, "scripts/migration-integrity.json"), "utf8")),
  );
  const projectId = `careconnect-rehearsal-${randomUUID().slice(0, 8)}`;
  const container = `supabase_db_${projectId}`;
  const restoreDatabase = `cc_restore_${randomUUID().replaceAll("-", "")}`;
  let databaseUrl;
  let stage = "preflight";
  let firstFailureStage;
  let rawIndex = 0;
  let startAttempted = false;
  let success = false;
  const progress = [];
  function report(line) {
    // Callers supply fixed labels, counts, or known repository filenames only.
    progress.push(line);
    writeFileSync(path.join(artifacts, "staging-reconciliation.log"), `${progress.join("\n")}\n`, {
      mode: 0o600,
    });
    process.stdout.write(`${line}\n`);
  }
  function capture(command, args, label, env = localSqlEnvironment(), mayFail = false) {
    stage = label;
    const rawPath = path.join(privateRoot, `${++rawIndex}.raw.log`);
    const fd = openSync(rawPath, "wx", 0o600);
    let result;
    try {
      result = spawnSync(command, args, {
        cwd: work,
        stdio: ["ignore", fd, fd],
        env,
        windowsHide: true,
        timeout: label === "local-start" ? 15 * 60_000 : 10 * 60_000,
        killSignal: "SIGKILL",
      });
    } finally {
      closeSync(fd);
    }
    const status = result.status ?? 1;
    const raw = readFileSync(rawPath, "utf8");
    if (!mayFail && status !== 0) {
      firstFailureStage ??= label;
      report(`Command failure at fixed stage ${label}.`);
      if (label === "restore-disposable-baseline") {
        for (const category of restoreFailureLabels(raw))
          report(`Restore diagnostic: ${category}.`);
      }
      const safe = summarize(raw, { kind: "startup", exitCode: status, migrationFiles: files });
      writeFileSync(path.join(artifacts, "rehearsal-failure.log"), safe, { mode: 0o600 });
      process.stdout.write(safe);
      check(false);
    }
    return { status, raw };
  }
  function assertOwnedWorkspace() {
    check(!existsSync(path.join(work, "supabase/.temp/project-ref")));
    check(!existsSync(path.join(work, "supabase/.temp/linked-project.json")));
    check(
      readFileSync(path.join(work, "supabase/config.toml"), "utf8").match(
        /^project_id\s*=\s*"([^"]+)"/m,
      )?.[1] === projectId,
    );
  }
  function assertDatabase() {
    assertOwnedWorkspace();
    assertLocalDatabaseUrl(databaseUrl);
    const names = capture(
      "docker",
      ["ps", "--filter", "publish=54322", "--format", "{{.Names}}"],
      "target-ownership",
    ).raw.trim();
    check(names === container);
  }
  function cli(args, label, mayFail = false) {
    assertCliArguments(args);
    if (existsSync(path.join(work, "supabase/config.toml"))) assertOwnedWorkspace();
    if (args[0] === "db" || args[0] === "migration") {
      if (!args.includes("--help")) assertDatabase();
    }
    return capture("supabase", args, label, localSqlEnvironment(), mayFail);
  }
  function sql(statement, label = "catalog-check", database = "postgres") {
    assertDatabase();
    check(database === "postgres" || database === restoreDatabase);
    const url = new URL(databaseUrl);
    const env = {
      ...localSqlEnvironment(),
      PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: database,
    };
    return capture(
      localPsqlCommand("linux"),
      ["-X", "--no-psqlrc", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement],
      label,
      env,
    ).raw.trim();
  }
  function expectSql(statement, value, label) {
    check(sql(statement, label) === value);
  }
  function ledger() {
    return JSON.parse(
      sql(
        "SELECT COALESCE(json_agg(json_build_object('version',version,'name',name) ORDER BY version),'[]'::json) FROM supabase_migrations.schema_migrations;",
        "ledger-read",
      ),
    );
  }
  function expectLedger(versions, alias = false) {
    const rows = ledger();
    check(JSON.stringify(rows.map((r) => r.version)) === JSON.stringify(versions));
    check(
      rows.every(
        (r) =>
          r.name ===
          (alias
            ? "00001_initial_schema"
            : files.find((f) => f.startsWith(`${r.version}_`))?.slice(6, -4)),
      ),
    );
  }
  function snapshot(database = "postgres") {
    assertDatabase();
    check(database === "postgres" || database === restoreDatabase);
    const schema = capture(
      "docker",
      ["exec", container, "pg_dump", "-U", "postgres", "--schema-only", database],
      "snapshot-schema",
    ).raw;
    const data = capture(
      "docker",
      [
        "exec",
        container,
        "pg_dump",
        "-U",
        "postgres",
        "--data-only",
        "--schema=public",
        "--schema=auth",
        "--schema=storage",
        database,
      ],
      "snapshot-data",
    ).raw;
    // Ownership/ACLs are intentionally retained. Only ledger DATA is omitted;
    // schema-only dumps still cover its definition, ACLs and ownership.
    const roles = sql(
      "SELECT json_agg(row_to_json(r) ORDER BY rolname) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolconfig FROM pg_catalog.pg_roles) r;",
      "snapshot-role-attributes",
    );
    const members = sql(
      "SELECT COALESCE(json_agg(row_to_json(m) ORDER BY roleid,member),'[]'::json) FROM (SELECT roleid,member,grantor,admin_option FROM pg_catalog.pg_auth_members) m;",
      "snapshot-role-membership",
    );
    const pub = sql(
      "SELECT COALESCE(json_agg(row_to_json(p) ORDER BY pubname),'[]'::json) FROM (SELECT pubname,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate FROM pg_catalog.pg_publication) p;",
      "snapshot-publication",
      database,
    );
    return createHash("sha256")
      .update([normalizeDump(schema), normalizeDump(data), roles, members, pub].join("\n"))
      .digest("hex");
  }
  function selectFiles(wanted) {
    for (const file of readdirSync(migrations)) {
      check(files.includes(file) || file === aliasFile);
      rmSync(path.join(migrations, file));
    }
    for (const file of wanted)
      writeFileSync(
        path.join(migrations, file),
        originals.get(file === aliasFile ? files[0] : file),
      );
  }
  function statusUrl() {
    const raw = cli(["status", "--output", "env"], "local-status").raw;
    const line = raw.split(/\r?\n/).find((l) => /^DB_URL=/.test(l));
    const match = line?.match(/^DB_URL=(?:"([^"]*)"|'([^']*)'|(.+))$/);
    databaseUrl = assertLocalDatabaseUrl(match?.[1] ?? match?.[2] ?? match?.[3]?.trim());
    assertDatabase();
  }
  function baseline() {
    selectFiles([aliasFile]);
    cli(["db", "reset", "--local", "--no-seed"], "baseline-reset");
    expectLedger(["20261009041700"], true);
    expectSql(
      "SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.users)+(SELECT count(*) FROM public.patients)+(SELECT count(*) FROM public.clinics)+(SELECT count(*) FROM public.clinic_staff)+(SELECT count(*) FROM public.doctors)+(SELECT count(*) FROM public.clinic_doctors)+(SELECT count(*) FROM public.doctor_schedules)+(SELECT count(*) FROM public.appointments)+(SELECT count(*) FROM public.conversations)+(SELECT count(*) FROM public.messages)+(SELECT count(*) FROM storage.buckets)+(SELECT count(*) FROM storage.objects);",
      "0",
      "baseline-empty",
    );
    // Assert rather than replace the Supabase-managed initial publication.
    expectSql(
      "SELECT count(*) FROM pg_catalog.pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables AND pubinsert AND pubupdate AND pubdelete AND pubtruncate;",
      "1",
      "baseline-publication",
    );
    expectSql(
      "SELECT count(*) FROM pg_catalog.pg_publication_tables WHERE pubname='supabase_realtime';",
      "0",
      "baseline-publication-empty",
    );
    report(
      "Baseline PASS: exact timestamp version/name; empty application/Auth/Storage; existing empty Realtime publication.",
    );
  }
  function restoreBaseline() {
    const before = snapshot();
    const backup = `/tmp/${restoreDatabase}.dump`;
    assertDatabase();
    capture(
      "docker",
      ["exec", container, "pg_dump", "-U", "postgres", "-Fc", "-f", backup, "postgres"],
      "backup-disposable-baseline",
    );
    capture(
      "docker",
      ["exec", container, "createdb", "-U", "postgres", "--template=template0", restoreDatabase],
      "create-owned-restore-database",
    );
    try {
      capture(
        "docker",
        [
          "exec",
          container,
          "pg_restore",
          "-U",
          "postgres",
          "--clean",
          "--if-exists",
          "--exit-on-error",
          "--single-transaction",
          "--dbname",
          restoreDatabase,
          backup,
        ],
        "restore-disposable-baseline",
      );
      check(snapshot(restoreDatabase) === before);
      check(
        sql(
          "SELECT version || '/' || name FROM supabase_migrations.schema_migrations;",
          "restore-ledger-check",
          restoreDatabase,
        ) === "20261009041700/00001_initial_schema",
      );
      check(snapshot() === before);
      report(
        "Restore PASS: disposable empty timestamp baseline restored into a separate same-cluster database; schema/data/owners/grants/publication/ledger matched. Hosted backup remains unverified.",
      );
    } finally {
      assertDatabase();
      capture(
        "docker",
        ["exec", container, "dropdb", "-U", "postgres", restoreDatabase],
        "drop-owned-restore-database",
      );
      capture("docker", ["exec", container, "rm", "--", backup], "remove-owned-disposable-backup");
    }
  }
  function normalize(injectFailure) {
    const before = snapshot();
    selectFiles([files[0]]);
    cli(
      ["migration", "repair", "20261009041700", "--status", "reverted", "--local"],
      "normalize-remove-alias",
    );
    expectLedger([]);
    check(snapshot() === before);
    if (injectFailure) {
      check(
        cli(
          ["migration", "repair", "00001", "--status", "invalid", "--local"],
          "normalization-injected-failure",
          true,
        ).status !== 0,
      );
      expectLedger([]);
      check(snapshot() === before);
      report(
        "Recovery A PASS: interrupted normalization leaves empty ledger and unchanged schema/data/ACLs; reviewed canonical repair follows.",
      );
    }
    cli(
      ["migration", "repair", "00001", "--status", "applied", "--local"],
      "normalize-add-canonical",
    );
    expectLedger(["00001"]);
    check(snapshot() === before);
    const actualPending = JSON.parse(
      sql(
        `WITH expected(version) AS (VALUES ${targetVersions.map((v) => `('${v}')`).join(",")}) SELECT json_agg(version ORDER BY version) FROM expected WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version=expected.version);`,
        "pending-versions",
      ),
    );
    check(JSON.stringify(actualPending) === JSON.stringify(pendingVersions(["00001"])));
    report(
      "Normalization PASS: schema/data/ownership/grants unchanged; exactly 39 pending versions (00002–00023, 00045–00061).",
    );
  }
  function push(file, mayFail = false) {
    const result = cli(["db", "push", "--local", "--yes"], `apply-${file.slice(0, 5)}`, mayFail);
    if (!mayFail) {
      // CLI progress includes ANSI styling. Ledger is the authoritative gate.
      const plain = result.raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
      check(plain.includes(file));
      expectLedger(targetVersions.slice(0, targetVersions.indexOf(file.slice(0, 5)) + 1));
    }
    return result;
  }
  function asyncPush(label) {
    assertDatabase();
    const rawPath = path.join(privateRoot, `${++rawIndex}.raw.log`);
    const fd = openSync(rawPath, "wx", 0o600);
    // Independent CLI process/connection. Output never reaches public logs.
    return new Promise((resolve) => {
      const child = spawn("supabase", ["db", "push", "--local", "--yes"], {
        cwd: work,
        env: localSqlEnvironment(),
        stdio: ["ignore", fd, fd],
        timeout: 90_000,
        killSignal: "SIGKILL",
      });
      child.on("error", () => {});
      child.on("close", (code) => {
        closeSync(fd);
        resolve({ status: code ?? 1, label });
      });
    });
  }
  async function waitForProbe() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const pid = sql(
        "SELECT pid FROM pg_catalog.pg_stat_activity WHERE pid <> pg_backend_pid() AND datname=current_database() AND state='active' AND wait_event='PgSleep' AND query LIKE '%careconnect_fault_probe%' ORDER BY pid;",
        "fault-probe-observer",
      );
      if (/^[0-9]+$/.test(pid)) return Number(pid);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    check(false);
  }
  async function runnerFaults(applied, file) {
    stage = "extended-runner-faults";
    selectFiles([...applied, file]);
    const before = snapshot();
    const versions = applied.map((f) => f.slice(0, 5));

    // Fail the real runner's ledger INSERT, not a stand-in insert statement.
    sql(
      "CREATE FUNCTION public.__cc_reject_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'disposable ledger fault'; END $$; CREATE TRIGGER __cc_reject_ledger BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.__cc_reject_ledger();",
      "fault-ledger-setup",
    );
    const withTrigger = snapshot();
    check(push(file, true).status !== 0);
    expectLedger(versions);
    check(snapshot() === withTrigger);
    sql(
      "DROP TRIGGER __cc_reject_ledger ON supabase_migrations.schema_migrations; DROP FUNCTION public.__cc_reject_ledger();",
      "fault-ledger-cleanup",
    );
    check(snapshot() === before);
    report(
      "Recovery F PASS: actual ledger-write rejection rolls back transactional migration effects.",
    );

    // The delay is test-only, after real DDL but before the CLI ledger insert.
    writeFileSync(
      path.join(migrations, file),
      `${originals.get(file)}\nSELECT pg_catalog.pg_sleep(20) /* careconnect_fault_probe */;\n`,
    );
    const interrupted = asyncPush("connection-interruption");
    const pid = await waitForProbe();
    expectSql(
      `SELECT pg_catalog.pg_terminate_backend(${pid})::text;`,
      "true",
      "terminate-owned-migration-session",
    );
    check((await interrupted).status !== 0);
    expectLedger(versions);
    check(snapshot() === before);
    report(
      "Recovery G PASS: terminated migration connection leaves ledger/schema/data/ACLs unchanged.",
    );

    const first = asyncPush("competing-migration-first");
    await waitForProbe();
    const second = asyncPush("competing-migration-second");
    const outcomes = await Promise.all([first, second]);
    // This non-idempotent ALTER migration must have one winner and one failure.
    check(outcomes.filter((outcome) => outcome.status === 0).length === 1);
    expectLedger([...versions, file.slice(0, 5)]);
    expectSql(
      "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='clinics' AND column_name='specialty_ids';",
      "1",
      "concurrent-migration-effect",
    );
    report(
      "Recovery H PASS: competing independent CLI attempts produced one winner and one failure; operator serialization remains mandatory.",
    );

    // Simulate lost acknowledgement only AFTER verifying a real successful ledger write.
    const committed = snapshot();
    writeFileSync(path.join(migrations, file), originals.get(file));
    cli(["db", "push", "--local", "--yes"], "after-ledger-noop");
    expectLedger([...versions, file.slice(0, 5)]);
    check(snapshot() === committed);
    report(
      "Recovery I PASS: recorded migration is not replayed after lost acknowledgement; schema remains unchanged.",
    );

    sql("CREATE TABLE public.__cc_schema_drift_probe(id integer);", "drift-probe-setup");
    check(snapshot() !== committed);
    sql("DROP TABLE public.__cc_schema_drift_probe;", "drift-probe-cleanup");
    check(snapshot() === committed);
    report("Recovery J PASS: unchanged migration ledger does not conceal injected schema drift.");
  }
  function injectedAtomicFailure(file, applied, caseLabel, prefix = false) {
    selectFiles([...applied, file]);
    const before = snapshot();
    const source = originals.get(file);
    writeFileSync(
      path.join(migrations, file),
      prefix ? `SELECT 1 / 0;\n${source}` : `${source}\nSELECT 1 / 0;\n`,
    );
    check(push(file, true).status !== 0);
    expectLedger(applied.map((f) => f.slice(0, 5)));
    check(snapshot() === before);
    writeFileSync(path.join(migrations, file), source);
    report(
      `Recovery ${caseLabel} PASS: injected failure leaves ledger/schema/data/ownership/grants unchanged; original migration restored before retry.`,
    );
  }
  function checkpoint(version) {
    if (version === "00006") {
      expectSql(
        "SELECT (to_regclass('public.user_roles') IS NOT NULL AND to_regclass('public.clinic_memberships') IS NOT NULL AND to_regclass('public.clinic_staff') IS NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role'))::text;",
        "true",
        "checkpoint-00006-objects",
      );
      expectSql(
        "SELECT (SELECT count(*) FROM public.users)+(SELECT count(*) FROM public.patients)+(SELECT count(*) FROM public.user_roles)+(SELECT count(*) FROM public.clinic_memberships)+(SELECT count(*) FROM auth.users);",
        "0",
        "checkpoint-00006-empty",
      );
    }
    if (version === "00008") {
      expectSql(
        "SELECT (SELECT count(*) FROM public.clinics)||'|'||(SELECT count(*) FROM public.doctors)||'|'||(SELECT count(*) FROM public.clinic_doctors)||'|'||(SELECT count(*) FROM public.doctor_schedules)||'|'||(SELECT count(*) FROM auth.users)||'|'||(SELECT count(*) FROM public.users)||'|'||(SELECT count(*) FROM public.patients);",
        "6|12|12|64|0|0|0",
        "checkpoint-00008-counts",
      );
      // Exact identity sets, branch links and every recurring schedule tuple.
      const clinicIds = Array.from(
        { length: 6 },
        (_, i) =>
          String(i + 1).repeat(8) +
          "-" +
          String(i + 1).repeat(4) +
          "-" +
          String(i + 1).repeat(4) +
          "-" +
          String(i + 1).repeat(4) +
          "-" +
          String(i + 1).repeat(12),
      );
      const doctorIds = Array.from(
        { length: 12 },
        (_, i) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(i + 1).padStart(12, "a")}`,
      );
      expectSql(
        "SELECT string_agg(id::text,',' ORDER BY id) FROM public.clinics;",
        clinicIds.join(","),
        "checkpoint-00008-clinic-identities",
      );
      expectSql(
        "SELECT string_agg(id::text,',' ORDER BY id) FROM public.doctors;",
        [...doctorIds].sort().join(","),
        "checkpoint-00008-doctor-identities",
      );
      const branches = [1, 2, 4, 3, 5, 3, 3, 4, 6, 6, 1, 2];
      const tuples = doctorIds.map(
        (id, i) =>
          `('${id}'::uuid,'${clinicIds[branches[i] - 1]}'::uuid,${[0, 3, 6, 9].includes(i) ? 6 : 5},'${i % 2 === 0 ? "09:00" : "10:00"}'::time,'${i % 2 === 0 ? "20:30" : "19:00"}'::time)`,
      );
      expectSql(
        `WITH expected(doctor_id,clinic_id,days,start_time,end_time) AS (VALUES ${tuples.join(",")}), schedules AS (SELECT e.doctor_id,e.clinic_id,g.day_of_week,e.start_time,e.end_time,30 AS slot_minutes FROM expected e CROSS JOIN LATERAL generate_series(1,e.days) g(day_of_week)), drift AS ((SELECT doctor_id,clinic_id FROM expected EXCEPT SELECT doctor_id,clinic_id FROM public.clinic_doctors) UNION ALL (SELECT doctor_id,clinic_id FROM public.clinic_doctors EXCEPT SELECT doctor_id,clinic_id FROM expected)) SELECT (NOT EXISTS (SELECT 1 FROM drift) AND NOT EXISTS ((SELECT * FROM schedules EXCEPT SELECT doctor_id,clinic_id,day_of_week,start_time,end_time,slot_minutes FROM public.doctor_schedules) UNION ALL (SELECT doctor_id,clinic_id,day_of_week,start_time,end_time,slot_minutes FROM public.doctor_schedules EXCEPT SELECT * FROM schedules)))::text;`,
        "true",
        "checkpoint-00008-links-schedules",
      );
    }
    if (version === "00009") {
      expectSql(
        "SELECT (SELECT count(*) FROM public.clinics WHERE is_demo)||'|'||(SELECT count(*) FROM public.doctors WHERE is_demo)||'|'||(SELECT count(*) FROM public.clinics WHERE NOT is_demo)||'|'||(SELECT count(*) FROM public.doctors WHERE NOT is_demo)||'|'||(SELECT count(*) FROM public.users)||'|'||(SELECT count(*) FROM public.patients);",
        "6|12|0|0|0|0",
        "checkpoint-00009-demo",
      );
    }
    if (["00009", "00010"].includes(version)) {
      expectSql(
        "SELECT string_agg(schemaname||'.'||tablename,',' ORDER BY schemaname,tablename) FROM pg_catalog.pg_publication_tables WHERE pubname='supabase_realtime';",
        "public.messages",
        "checkpoint-realtime-members",
      );
      expectSql(
        "SELECT count(*) FROM pg_catalog.pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables;",
        "1",
        "checkpoint-realtime-not-all",
      );
    }
    if (version === "00013") {
      expectSql(
        "SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE c.relname='idx_appointments_no_double_booking' AND i.indisvalid AND i.indisunique;",
        "1",
        "checkpoint-00013-index",
      );
      expectSql(
        "SELECT count(*) FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgname IN ('tr_check_appointment_update','tr_check_doctor_update','tr_check_clinic_doctor_update','tr_check_conversation_update');",
        "4",
        "checkpoint-00013-triggers",
      );
    }
    if (version === "00053") {
      expectSql(
        "SELECT count(*) FROM storage.buckets WHERE id='avatars' AND NOT public AND file_size_limit=1048576 AND allowed_mime_types @> ARRAY['image/webp','image/jpeg','image/png']::text[];",
        "1",
        "checkpoint-00053-private-bucket",
      );
      expectSql(
        "SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('avatars_select_own','avatars_insert_own','avatars_update_own','avatars_delete_own') AND roles=ARRAY['authenticated']::name[];",
        "4",
        "checkpoint-00053-policies",
      );
    }
    if (["00057", "00058", "00059"].includes(version)) {
      expectSql(
        "SELECT count(*) FROM public.clinics WHERE is_demo AND clinic_verification_state='pending' AND NOT is_published AND patient_contact_permission='not_granted' AND NOT booking_enabled;",
        "6",
        "checkpoint-provider-defaults",
      );
      expectSql(
        "SELECT (to_regprocedure('public.admin_set_clinic_publication_state(uuid,text,boolean,text,boolean)') IS NOT NULL AND to_regprocedure('public.book_appointment(uuid,uuid,date,time without time zone,text)') IS NOT NULL AND to_regprocedure('public.get_doctor_slots(uuid,uuid,date)') IS NOT NULL)::text;",
        "true",
        "checkpoint-provider-rpcs",
      );
    }
    if (version === "00059") {
      expectSql(
        "SELECT (NOT has_table_privilege('anon','public.clinics','SELECT') AND has_column_privilege('anon','public.clinics','id','SELECT') AND NOT has_column_privilege('anon','public.clinics','phone','SELECT') AND NOT has_column_privilege('authenticated','public.clinics','email','SELECT'))::text;",
        "true",
        "checkpoint-public-column-grants",
      );
    }
    if (["00060", "00061"].includes(version)) {
      expectSql(
        "SELECT (pg_get_functiondef('public.book_appointment(uuid,uuid,date,time without time zone,text)'::regprocedure) ~* 'FOR UPDATE' AND NOT has_function_privilege('anon','public.book_appointment(uuid,uuid,date,time without time zone,text)','EXECUTE'))::text;",
        "true",
        "checkpoint-booking-lock-and-grant",
      );
    }
    report(`Migration checkpoint PASS: ${files.find((f) => f.startsWith(`${version}_`))}.`);
  }
  try {
    verifyPinnedCliVersion(cli(["--version"], "cli-version").raw);
    report(
      "Migration integrity PASS: all 40 filenames and LF-normalized source hashes match the reviewed manifest.",
    );
    for (const args of [
      ["db", "push", "--help"],
      ["db", "reset", "--help"],
      ["migration", "repair", "--help"],
    ]) {
      check(cli(args, "cli-supported-flags").raw.includes("--local"));
    }
    check(
      capture(
        "docker",
        ["ps", "--filter", "name=supabase_", "--format", "{{.Names}}"],
        "existing-container-check",
      ).raw.trim() === "",
    );
    cli(["init", "--yes"], "local-init");
    const configPath = path.join(work, "supabase/config.toml");
    writeFileSync(
      configPath,
      readFileSync(configPath, "utf8").replace(
        /^project_id\s*=\s*"[^"]+"/m,
        `project_id = "${projectId}"`,
      ),
    );
    selectFiles([aliasFile]);
    startAttempted = true;
    cli(["start"], "local-start");
    statusUrl();
    baseline();
    restoreBaseline();
    normalize(true);

    // Establish actual CLI atomicity when 00009 commits internally, then rebuild
    // ONLY this disposable stack. No historical source or hosted ledger changes.
    let applied = [files[0]];
    for (const file of files.slice(1, 8)) {
      if (file.startsWith("00007_")) {
        await runnerFaults(applied, file);
        applied.push(file);
        continue;
      }
      selectFiles([...applied, file]);
      push(file);
      applied.push(file);
    }
    checkpoint("00008");
    const nine = files.find((f) => f.startsWith("00009_"));
    selectFiles([...applied, nine]);
    const preNine = snapshot();
    writeFileSync(path.join(migrations, nine), `${originals.get(nine)}\nSELECT 1 / 0;\n`);
    check(push(nine, true).status !== 0);
    expectLedger(applied.map((f) => f.slice(0, 5)));
    const changed = snapshot() !== preNine;
    if (changed) checkpoint("00009");
    report(
      changed
        ? "00009 post-COMMIT failure: partial schema/data committed without ledger row; inspect/restore required, never blind retry. Disposable baseline will be rebuilt."
        : "00009 post-COMMIT failure: complete rollback verified on pinned CLI; disposable baseline will still be rebuilt.",
    );
    baseline();
    normalize(false);

    applied = [files[0]];
    for (const file of files.slice(1)) {
      const version = file.slice(0, 5);
      if (version === "00049")
        expectSql(
          "SELECT count(*) FROM (SELECT patient_id,clinic_id FROM public.conversations WHERE kind='general' GROUP BY patient_id,clinic_id HAVING count(*)>1) duplicates;",
          "0",
          "before-00049-duplicates",
        );
      if (version === "00007") injectedAtomicFailure(file, applied, "B");
      if (version === "00009") injectedAtomicFailure(file, applied, "C", true);
      if (version === "00010") injectedAtomicFailure(file, applied, "D");
      if (version === "00061") injectedAtomicFailure(file, applied, "E");
      selectFiles([...applied, file]);
      push(file);
      applied.push(file);
      checkpoint(version);
    }
    expectLedger(targetVersions);
    for (const kind of ["ledger", "pgtap", "concurrency"]) {
      assertDatabase();
      // Existing helper writes only allow-listed summaries; raw output is private.
      capture(process.execPath, ["scripts/run-sql-ci-step.mjs", kind], `final-${kind}`);
      const summary = readFileSync(path.join(work, "test-artifacts", `${kind}.log`), "utf8");
      check(
        summary.includes(
          kind === "ledger" ? "Local migration ledger gate: PASS." : "Workflow gate: PASS.",
        ),
      );
      writeFileSync(path.join(artifacts, `${kind}.log`), summary, { mode: 0o600 });
      process.stdout.write(summary);
    }
    expectSql(
      "SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.users)+(SELECT count(*) FROM public.patients)+(SELECT count(*) FROM public.appointments)+(SELECT count(*) FROM public.conversations)+(SELECT count(*) FROM public.messages)+(SELECT count(*) FROM storage.objects)+(SELECT count(*) FROM public.candidate_facilities)+(SELECT count(*) FROM public.candidate_doctors)+(SELECT count(*) FROM public.candidate_relationships)+(SELECT count(*) FROM public.candidate_sources)+(SELECT count(*) FROM public.candidate_evidence)+(SELECT count(*) FROM public.candidate_contacts);",
      "0",
      "final-fixture-cleanup",
    );
    checkpoint("00008");
    checkpoint("00009");
    checkpoint("00059");
    success = true;
    report(
      "Staging-state rehearsal PASS: exact normalization, 39 pending migrations, all SQL plans, eight concurrency checks, owned fixture cleanup and recovery cases A–J.",
    );
  } catch {
    report(
      `Staging-state rehearsal FAIL at fixed stage ${firstFailureStage ?? stage}; raw CLI/SQL diagnostics withheld.`,
    );
    process.exitCode = 1;
  } finally {
    if (startAttempted) {
      const stopped = cli(["stop", "--no-backup"], "owned-stack-stop", true);
      if (stopped.status !== 0) {
        report("Owned disposable stack cleanup FAIL; runner teardown required.");
        process.exitCode = 1;
      } else report("Owned disposable stack cleanup PASS.");
    }
    // Resolved target is checked before recursive deletion; no other workspaces.
    const relative = path.relative(
      realpathSync(process.env.RUNNER_TEMP),
      realpathSync(privateRoot),
    );
    check(
      !relative.startsWith("..") &&
        !path.isAbsolute(relative) &&
        relative.startsWith("careconnect-staging-rehearsal-"),
    );
    rmSync(privateRoot, { recursive: true, force: true });
    if (!success) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(" ") === "--help") {
    process.stdout.write(
      "Linux disposable runner only: node scripts/staging-reconciliation-rehearsal.mjs --execute\nRequires Docker, pinned Supabase CLI 2.117.0, /usr/bin/psql and RUNNER_TEMP outside the checkout. No linked/hosted credentials.\n",
    );
  } else
    main().catch(() => {
      process.stderr.write("Rehearsal preflight/cleanup failed; raw diagnostics withheld.\n");
      process.exitCode = 1;
    });
}
