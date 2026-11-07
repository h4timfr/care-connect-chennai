import assert from "node:assert/strict";

import test from "node:test";

import {
  assertLocalDatabaseUrl,
  assertWslDisposableDatabaseUrl,
  localPsqlCommand,
  localSqlEnvironment,
  safeSqlFailure,
} from "./local-sql-test-target.mjs";

test("accept only the explicitly named WSL disposable database target", () => {
  const url = "postgresql://postgres@127.0.0.1:55439/careconnect_concurrency_a1b2c3d4e5f6";
  assert.equal(assertWslDisposableDatabaseUrl(url), url);
});

for (const url of [
  "postgresql://postgres@127.0.0.1:54322/careconnect_concurrency_a1b2c3d4e5f6",
  "postgresql://postgres@127.0.0.1:55439/postgres",
  "postgresql://postgres:password@127.0.0.1:55439/careconnect_concurrency_a1b2c3d4e5f6",
  "postgresql://postgres@db.remote.invalid:55439/careconnect_concurrency_a1b2c3d4e5f6",
  "postgresql://postgres@127.0.0.1:55439/careconnect_concurrency_a1b2c3d4e5f6?host=remote.invalid",
]) {
  test("reject non-owned WSL database target", () => {
    assert.throws(() => assertWslDisposableDatabaseUrl(url), /^Error: Refusing to run:/);
  });
}

for (const host of ["127.0.0.1", "[::1]"]) {
  test(`accept explicit local ${host} database`, () => {
    const url = `postgresql://postgres:local-test-only@${host}:54322/postgres`;

    assert.equal(assertLocalDatabaseUrl(url), url);
  });
}

for (const url of [
  "postgresql://postgres@db.remote.invalid:5432/postgres",

  "https://localhost/postgres",

  "postgresql://postgres@localhost:54322/postgres",

  "postgresql://postgres@127.0.0.1/postgres",

  "postgresql://postgres@127.0.0.1:5432/postgres",

  "postgresql://postgres@127.0.0.1:54323/postgres",

  "postgresql://postgres@127.0.0.1:54322/other",

  "postgresql://postgres@127.0.0.1:54322/postgres?host=db.remote.invalid",

  "postgresql://postgres@127.0.0.1:54322/postgres?hostaddr=192.0.2.1",

  "postgresql://postgres@127.0.0.1:54322/postgres?service=shared",

  "postgresql://postgres@127.0.0.1:54322/postgres?options=-c%20role%3Dpostgres",

  "postgresql://postgres@127.0.0.1:54322/postgres#unexpected",

  "not-a-url-SYNTHETIC_PASSWORD",
]) {
  test(`reject routing/parameter override case ${[...url].length}: ${url.includes("?") ? "query" : "authority or path"}`, () => {
    assert.throws(
      () => assertLocalDatabaseUrl(url),

      (error) => {
        assert.match(error.message, /^Refusing to run:/);

        assert.ok(!error.message.includes(url));

        assert.ok(!error.message.includes("SYNTHETIC_PASSWORD"));

        return true;
      },
    );
  });
}

test("remove inherited libpq defaults without changing the caller environment", () => {
  const source = {
    PATH: "test-path",

    SYSTEMROOT: "test-root",

    PGHOSTADDR: "192.0.2.1",

    PGSERVICE: "shared",

    PGSERVICEFILE: "shared-config",

    PGOPTIONS: "-c default_transaction_isolation=repeatable_read",

    PGPASSWORD: "synthetic-password",

    PSQL_BIN: "connect-to-remote-db",

    pgHost: "db.remote.invalid",

    PGDATABASE: "shared",
  };

  const result = localSqlEnvironment(source);

  assert.equal(result.PATH, source.PATH);

  assert.equal(result.SYSTEMROOT, source.SYSTEMROOT);

  assert.deepEqual(
    Object.keys(result)

      .filter((key) => /^PG/i.test(key))

      .sort(),

    ["PGAPPNAME", "PGCONNECT_TIMEOUT"],
  );

  assert.equal(result.PGCONNECT_TIMEOUT, "10");

  assert.equal(source.PGSERVICE, "shared");
});

test("do not allow an inherited psql executable override", () => {
  assert.equal(localPsqlCommand(), process.platform === "linux" ? "/usr/bin/psql" : "psql");
  assert.equal(localPsqlCommand("linux"), "/usr/bin/psql");

  assert.equal(localSqlEnvironment({ PSQL_BIN: "connect-to-remote-db" }).PSQL_BIN, undefined);
});

test("direct SQL failure messages withhold connection details and allow only known SQLSTATEs", () => {
  const canary = "postgresql://postgres:SYNTHETIC_PASSWORD@db.remote.invalid:5432/postgres";
  const message = safeSqlFailure("psql", 1, `connection failed ${canary} SQLSTATE 42601`);
  assert.match(message, /psql exit 1/);
  assert.match(message, /SQLSTATE 42601/);
  assert.match(message, /diagnostics were withheld/);
  assert.ok(!message.includes(canary));
  assert.ok(!message.includes("SYNTHETIC_PASSWORD"));
  assert.doesNotMatch(safeSqlFailure("psql", 1, `${canary} SQLSTATE 99999`), /99999|SYNTHETIC/);
  assert.match(safeSqlFailure("psql", null, canary), /could not start/);
});
