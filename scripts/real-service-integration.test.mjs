import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertLoopbackUrl,
  assertLocalProjectRefMatchesConfig,
  authenticatedRealtimeAuthChecksPass,
  classifyStartupFailure,
  classifyRealtimeChannelError,
  closeAuthResources,
  closeRealtimeResources,
  collectRealtimeDeliveries,
  prepareRealtimeAuth,
  recordRealtimePayload,
  realtimePostgresChangesOptions,
  sanitizeRealtimeDiagnostics,
  sanitizeStartupProcess,
  countOwnedRecords,
  matchesCanonicalDisposableBaseline,
  removeUnseededApplicationUsers,
  rejectRemoteConfiguration,
  safeFailureCategory,
  safeSqlState,
  spawnSyncBounded,
  summarizeBrowserWorkflows,
  subscribed,
  verifyRepositoryIntegrity,
} from "./real-service-integration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("startup process evidence accepts only bounded numeric exit and duration values", () => {
  assert.deepEqual(sanitizeStartupProcess("42", "93200"), { cli_exit_code: 42, elapsed_ms: 93200 });
  assert.deepEqual(sanitizeStartupProcess("256", "5400001"), {
    cli_exit_code: null,
    elapsed_ms: null,
  });
  assert.deepEqual(sanitizeStartupProcess("private-token", "-1"), {
    cli_exit_code: null,
    elapsed_ms: null,
  });
});

test("startup diagnostics distinguish failure signatures without exposing raw output", () => {
  const secret = "synthetic-private-token";
  const result = classifyStartupFailure(
    `Pulling image ${secret}\nfailed to pull image: no such host ${secret}`,
  );
  assert.deepEqual(result.categories, ["image-pull", "dns-resolution"]);
  assert.equal(result.image_pull_output_observed, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(classifyStartupFailure("Pulling image\nnetwork initialized").categories, [
    "unclassified",
  ]);
  assert.deepEqual(classifyStartupFailure("unknown flag: --network-id").categories, [
    "cli-network-flag-rejected",
  ]);
  assert.deepEqual(
    classifyStartupFailure("failed to connect container to network: network test not found")
      .categories,
    ["network-attachment"],
  );
  assert.deepEqual(classifyStartupFailure("bind: address already in use").categories, [
    "port-binding",
  ]);
});

test("only the expected loopback Supabase API endpoint is accepted", () => {
  assert.equal(assertLoopbackUrl("http://127.0.0.1:54321", 54321).port, "54321");
  assert.throws(() => assertLoopbackUrl("https://project.supabase.co", 54321), /refusing/);
  assert.throws(() => assertLoopbackUrl("http://127.0.0.1:54322", 54321), /refusing/);
  assert.throws(
    () => assertLoopbackUrl("http://127.0.0.1:54321/?target=remote", 54321),
    /refusing/,
  );
  assert.throws(() => assertLoopbackUrl("http://user:pass@127.0.0.1:54321", 54321), /refusing/);
});

test("Realtime cleanup tears down channels and disconnects sockets after unsubscribe hangs", async () => {
  const calls = [];
  const resource = {
    client: {
      realtime: {
        async disconnect() {
          calls.push("disconnect");
          return "ok";
        },
      },
    },
    channel: {
      unsubscribe() {
        calls.push("unsubscribe");
        return new Promise(() => {});
      },
      teardown() {
        calls.push("teardown");
      },
    },
    state: {
      pending: new Set([
        {
          cancel() {
            calls.push("cancel pending wait");
          },
        },
      ]),
    },
  };
  const started = Date.now();

  const result = await closeRealtimeResources([resource], 30);

  assert.ok(Date.now() - started < 2_000, "shutdown is bounded");
  assert.deepEqual(calls, ["cancel pending wait", "unsubscribe", "teardown", "disconnect"]);
  assert.equal(result.unsubscribe_failures, 1);
  assert.equal(result.teardown_failures, 0);
  assert.equal(result.disconnect_failures, 0);
  assert.equal(result.verified, false);
});

test("Realtime auth is synchronized from the current authenticated session before channel joins", async () => {
  const calls = [];
  const client = {
    auth: {
      async getSession() {
        calls.push("get session");
        return {
          data: {
            session: {
              access_token: "synthetic-session-token",
              user: { id: "synthetic-user-id" },
            },
          },
          error: null,
        };
      },
      async getUser(token) {
        calls.push(`validate auth:${token}`);
        return { data: { user: { id: "synthetic-user-id" } }, error: null };
      },
    },
    realtime: {
      async setAuth(token) {
        calls.push(`set auth:${token}`);
      },
    },
  };

  const diagnostics = {
    auth: {},
  };
  assert.equal(await prepareRealtimeAuth(client, "synthetic-user-id", diagnostics), true);
  assert.deepEqual(calls, [
    "get session",
    "validate auth:synthetic-session-token",
    "set auth:synthetic-session-token",
  ]);
  assert.deepEqual(diagnostics.auth, {
    mode: "authenticated",
    sessionPresent: true,
    sessionIdentityMatched: true,
    authApiCheck: "accepted",
    authApiStatus: null,
    authApiErrorCode: "none",
    realtimeAuthSet: true,
  });
});

test("Realtime auth refuses a missing session without configuring a channel", async () => {
  let configured = false;
  const client = {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
    realtime: {
      async setAuth() {
        configured = true;
      },
    },
  };

  await assert.rejects(
    prepareRealtimeAuth(client, "synthetic-user-id"),
    /authentication is unavailable/,
  );
  assert.equal(configured, false);
});

test("Realtime auth fails closed when the session identity differs from the intended user", async () => {
  let authApiCalled = false;
  let realtimeAuthSet = false;
  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: "synthetic-session-token",
              user: { id: "other-user-id" },
            },
          },
          error: null,
        };
      },
      async getUser() {
        authApiCalled = true;
        return { data: { user: { id: "other-user-id" } }, error: null };
      },
    },
    realtime: {
      async setAuth() {
        realtimeAuthSet = true;
      },
    },
  };
  const diagnostics = { auth: {} };

  await assert.rejects(
    prepareRealtimeAuth(client, "expected-user-id", diagnostics),
    /session identity could not be verified/,
  );
  assert.equal(authApiCalled, false);
  assert.equal(realtimeAuthSet, false);
  assert.equal(diagnostics.auth.sessionIdentityMatched, false);
});

test("Auth API validation rejection is recorded without blocking Realtime diagnostics", async () => {
  let realtimeAuthSet = false;
  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: "synthetic-session-token",
              user: { id: "synthetic-user-id" },
            },
          },
          error: null,
        };
      },
      async getUser() {
        return {
          data: { user: null },
          error: { status: 401, code: "session_not_found", message: "private server detail" },
        };
      },
    },
    realtime: {
      async setAuth(token) {
        assert.equal(token, "synthetic-session-token");
        realtimeAuthSet = true;
      },
    },
  };
  const diagnostics = { auth: {} };

  assert.equal(await prepareRealtimeAuth(client, "synthetic-user-id", diagnostics), true);
  assert.equal(realtimeAuthSet, true);
  assert.deepEqual(diagnostics.auth, {
    mode: "authenticated",
    sessionPresent: true,
    sessionIdentityMatched: true,
    authApiCheck: "rejected",
    authApiStatus: 401,
    authApiErrorCode: "session_not_found",
    realtimeAuthSet: true,
  });
});

test("an Auth API rejection remains a failed Realtime identity check", () => {
  const authenticated = [
    {
      auth: {
        mode: "authenticated",
        sessionIdentityMatched: true,
        authApiCheck: "accepted",
        realtimeAuthSet: true,
      },
    },
    {
      auth: {
        mode: "authenticated",
        sessionIdentityMatched: true,
        authApiCheck: "rejected",
        realtimeAuthSet: true,
      },
    },
    { auth: { mode: "anonymous", authApiCheck: "not-checked" } },
  ];

  assert.equal(authenticatedRealtimeAuthChecksPass(authenticated), false);
  authenticated[1].auth.authApiCheck = "accepted";
  assert.equal(authenticatedRealtimeAuthChecksPass(authenticated), true);
});

test("Realtime delivery outcomes identify each subscriber without short-circuiting", async () => {
  const outcomes = await collectRealtimeDeliveries([
    Promise.resolve(true),
    Promise.reject(new Error("private transport details")),
  ]);

  assert.deepEqual(outcomes, [true, false]);
});

test("Postgres Changes readiness waits for server-side subscription confirmation", () => {
  assert.deepEqual(realtimePostgresChangesOptions(), {
    config: {
      postgres_changes_options: { wait: true, timeout: 10_000 },
    },
  });
});

test("Realtime readiness accepts only authenticated subscriptions and an anonymous auth denial", async () => {
  const makeState = (subscribe) => ({
    pending: new Set(),
    channel: { subscribe },
    diagnostics: { subscription: { statuses: [], errorKinds: [], ready: false } },
  });
  const unauthorized = new Error("Unauthorized");

  const patient = makeState((callback) => callback("SUBSCRIBED"));
  assert.equal(await subscribed(patient), true);
  assert.equal(patient.diagnostics.subscription.ready, true);

  const anonymous = makeState((callback) => callback("CHANNEL_ERROR", unauthorized));
  assert.equal(await subscribed(anonymous, { expectedStatus: "CHANNEL_ERROR" }), true);
  assert.deepEqual(anonymous.diagnostics.subscription, {
    statuses: ["CHANNEL_ERROR"],
    errorKinds: ["authorization-denied"],
    ready: false,
  });

  const anonymousTransportFailure = makeState((callback) =>
    callback("CHANNEL_ERROR", new Error("private transport detail")),
  );
  await assert.rejects(
    subscribed(anonymousTransportFailure, { expectedStatus: "CHANNEL_ERROR" }),
    /not denied by authorization/,
  );
  assert.deepEqual(anonymousTransportFailure.diagnostics.subscription.errorKinds, ["transport"]);
  assert.equal(
    classifyRealtimeChannelError(new Error("binding mismatch between server and client bindings")),
    "binding-mismatch",
  );
  assert.equal(
    classifyRealtimeChannelError(new Error("PostgresChangesSubscribeTimeout")),
    "timeout",
  );
});

test("Realtime payload diagnostics distinguish arrival, matching fields, and expected message safely", () => {
  let delivered = false;
  const state = {
    conversationId: "synthetic-conversation-id",
    delivered: [],
    pending: new Set([
      {
        body: "private synthetic body",
        deliver() {
          delivered = true;
        },
      },
    ]),
    diagnostics: {
      delivery: {
        eventCount: 0,
        payloadFieldsPresent: false,
        conversationFilterMatched: false,
        expectedMessageMatched: false,
        waitOutcome: "not-started",
      },
    },
  };

  recordRealtimePayload(state, {
    new: {
      id: "synthetic-message-id",
      conversation_id: "synthetic-conversation-id",
      sender_id: "synthetic-user-id",
      body: "private synthetic body",
    },
  });

  assert.equal(delivered, true);
  assert.deepEqual(state.diagnostics.delivery, {
    eventCount: 1,
    payloadFieldsPresent: true,
    conversationFilterMatched: true,
    expectedMessageMatched: true,
    waitOutcome: "not-started",
  });
  const sanitized = sanitizeRealtimeDiagnostics([
    {
      role: "patient",
      auth: {
        mode: "authenticated",
        sessionPresent: true,
        sessionIdentityMatched: true,
        authApiCheck: "rejected",
        authApiStatus: 401,
        authApiErrorCode: "session_not_found",
        realtimeAuthSet: true,
        token: "private token",
      },
      subscription: {
        statuses: ["SUBSCRIBED", "private error text"],
        errorKinds: ["authorization-denied", "private error text"],
        ready: true,
        error: "private error",
      },
      rowVisibility: { checked: true, visible: true, rowCount: 1, row: "private payload" },
      delivery: state.diagnostics.delivery,
      body: "private synthetic body",
    },
  ]);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(
    serialized,
    /private token|private error|private payload|private synthetic body/,
  );
  assert.match(serialized, /"statuses":\["SUBSCRIBED","OTHER"\]/);
  assert.match(serialized, /"errorKinds":\["authorization-denied","other"\]/);
});

test("Realtime authorization assertion failures are not misclassified as Auth failures", () => {
  assert.equal(
    safeFailureCategory(
      new Error("integration assertion failed: Realtime authorized patient message delivery"),
    ),
    "realtime-delivery",
  );
  assert.equal(
    safeFailureCategory(new Error("integration assertion failed: authorized patient access")),
    "service-assertion",
  );
});

test("Auth cleanup stops refresh timers and disposes clients after signout hangs", async () => {
  const calls = [];
  const client = {
    auth: {
      signOut() {
        calls.push("signout");
        return new Promise(() => {});
      },
      async stopAutoRefresh() {
        calls.push("stop refresh");
      },
      async dispose() {
        calls.push("dispose");
      },
    },
  };
  const started = Date.now();

  const result = await closeAuthResources([client], 20);

  assert.ok(Date.now() - started < 2_000, "Auth shutdown is bounded");
  assert.deepEqual(calls, ["signout", "stop refresh", "dispose"]);
  assert.equal(result.failures, 1);
  assert.equal(result.verified, false);
});

test("bounded child execution terminates a hanging process", () => {
  const started = Date.now();
  const result = spawnSyncBounded(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    timeoutMs: 150,
    encoding: "utf8",
  });

  assert.equal(result.status, null);
  assert.equal(result.error?.code, "ETIMEDOUT");
  assert.ok(Date.now() - started < 5_000, "child process timeout returns promptly");
});

test("runtime accepts only the local CLI marker matching the unlinked project config", () => {
  const config = 'project_id = "careconnect"\n';
  assert.doesNotThrow(() => assertLocalProjectRefMatchesConfig(config, "careconnect\n"));
  assert.doesNotThrow(() => assertLocalProjectRefMatchesConfig(config, null));
  assert.throws(
    () => assertLocalProjectRefMatchesConfig(config, "hosted-project-ref"),
    /does not match/,
  );
  assert.throws(() => assertLocalProjectRefMatchesConfig('project_id = ""', "careconnect"));
});

test("hosted project variables and linked metadata fail closed without echoing values", () => {
  assert.throws(
    () => rejectRemoteConfiguration({ SUPABASE_URL: "https://secret-project.supabase.co" }),
    /environment variables/,
  );
  assert.throws(
    () => rejectRemoteConfiguration({ DATABASE_URL: "postgres://private" }),
    /environment variables/,
  );
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "careconnect-linked-marker-"));
  const marker = path.join(tempDir, "linked-project.json");
  writeFileSync(marker, "synthetic-link-marker");
  try {
    assert.throws(() => rejectRemoteConfiguration({}, [marker]), /metadata exists/);
  } finally {
    unlinkSync(marker);
    rmdirSync(tempDir);
  }
});

test("repository migration and SQL test inventories match the integrity manifest", () => {
  const result = verifyRepositoryIntegrity();
  assert.equal(result.files.length, 41);
  assert.equal(result.files.at(-1)?.slice(0, 5), "00062");
  assert.equal(result.tests.length, 22);
});

test("real-service startup accepts only the exact canonical disposable baseline", () => {
  const baseline = {
    users: 0,
    patients: 0,
    appointments: 0,
    conversations: 0,
    messages: 0,
    clinic_memberships: 0,
    clinic_doctors: 12,
    doctor_schedules: 64,
    doctors: 12,
    clinics: 6,
    audit_logs: 0,
    notifications: 0,
    provider_applications: 0,
    doctor_applications: 0,
    user_roles: 0,
    auth_users: 0,
    storage_objects: 0,
  };
  assert.equal(matchesCanonicalDisposableBaseline(baseline), true);
  for (const table of Object.keys(baseline)) {
    assert.equal(
      matchesCanonicalDisposableBaseline({ ...baseline, [table]: baseline[table] + 1 }),
      false,
      `${table} must match its exact canonical baseline`,
    );
  }
  assert.equal(matchesCanonicalDisposableBaseline({ ...baseline, users: null }), false);
  assert.equal(matchesCanonicalDisposableBaseline({ clinics: 6 }), false);
});

test("ownership cleanup counts composite-key links without assuming an id column", async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        select(columns, options) {
          calls.push({ table, columns, options });
          return {
            in(column, values) {
              calls.push({ column, values });
              return Promise.resolve({ count: 0, error: null });
            },
          };
        },
      };
    },
  };

  assert.equal(await countOwnedRecords(admin, "clinic_doctors", "clinic_id", ["owned-id"]), 0);
  assert.deepEqual(calls, [
    { table: "clinic_doctors", columns: "*", options: { count: "exact", head: true } },
    { column: "clinic_id", values: ["owned-id"] },
  ]);
});

test("Auth session refresh is checked before password recovery can terminate the session", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  const refresh = runner.indexOf('measure("auth.session_refresh"');
  const recovery = runner.indexOf('measure("auth.password_recovery_request"');
  assert.ok(refresh >= 0 && recovery > refresh);
});

test("anonymous patient profile access accepts an explicit ACL rejection", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  assert.match(
    runner,
    /await expectDenied\(\s*createClient\(creds\.url, creds\.anonKey\)\.from\("patients"\)\.select\("id"\)\.limit\(1\),\s*"anonymous patient data request is denied"/,
  );
});

test("integration failure diagnostics expose only a validated SQLSTATE", () => {
  assert.equal(safeSqlState({ code: "42501", message: "private detail" }), "42501");
  assert.equal(safeSqlState({ code: "not-a-state", message: "private detail" }), null);
  assert.equal(safeSqlState(new Error("private detail")), null);
});

test("pre-seed cleanup deletes application profiles only for valid run Auth IDs", async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        delete() {
          return {
            in(column, ids) {
              calls.push({ table, column, ids });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const ownedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  assert.equal(await removeUnseededApplicationUsers(admin, [ownedId, ownedId]), true);
  assert.deepEqual(calls, [{ table: "users", column: "id", ids: [ownedId] }]);
  assert.equal(await removeUnseededApplicationUsers(admin, ["not-an-auth-id"]), false);
  assert.equal(calls.length, 1);
});

test("real-service fixtures use reserved synthetic identities and explicit ownership keys", () => {
  const seed = readFileSync(path.join(root, "tests/real-service/seed-owned-fixtures.sql"), "utf8");
  const cleanup = readFileSync(
    path.join(root, "tests/real-service/cleanup-owned-fixtures.sql"),
    "utf8",
  );
  assert.match(seed, /careconnect_ci\.real_service_runs/);
  assert.match(seed, /:'owner_token'::uuid/);
  assert.match(seed, /Synthetic CI fixture/);
  assert.match(cleanup, /runner ownership marker did not match exactly one row/);
  assert.match(cleanup, /pg_temp\.runner_owned/);
  assert.match(cleanup, /DELETE FROM public\.users[\s\S]*?WHERE u\.id = ANY\(o\.user_ids\)/);
  assert.match(cleanup, /public\.patients WHERE user_id = ANY\(run\.user_ids\)/);
  assert.doesNotMatch(cleanup, /:\x27owner_token\x27[^\n]*\$\$/);
});

test("verified clinic-doctor fixture uses the synthetic admin identity in transaction scope", () => {
  const seed = readFileSync(path.join(root, "tests/real-service/seed-owned-fixtures.sql"), "utf8");
  const role = seed.indexOf("INSERT INTO public.user_roles (user_id, role)");
  const subject = seed.indexOf("request.jwt.claim.sub");
  const roleClaim = seed.indexOf("request.jwt.claim.role");
  const claims = seed.indexOf("request.jwt.claims");
  const relationship = seed.indexOf("INSERT INTO public.clinic_doctors");
  assert.ok(
    role >= 0 &&
      role < subject &&
      subject < roleClaim &&
      roleClaim < claims &&
      claims < relationship,
  );
  assert.match(seed, /set_config\([\s\S]*?request\.jwt\.claim\.sub[\s\S]*?true\)/);
  assert.match(seed, /set_config\([\s\S]*?request\.jwt\.claim\.role[\s\S]*?true\)/);
  assert.match(seed, /set_config\([\s\S]*?request\.jwt\.claims[\s\S]*?true\)/);
  assert.match(seed, /SELECT auth\.uid\(\)[\s\S]*?role = 'platform_admin'/);
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  assert.match(runner, /postgrest\.synthetic_provider_relationship/);
  assert.match(
    runner,
    /synthetic provider relationship remains verified after authorized fixture seeding/,
  );
});

test("provider discovery checks schedules under their intended anonymous RLS role", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  assert.match(runner, /authenticated patient cannot read published schedules directly/);
  assert.match(runner, /const publicDiscovery = createClient\(creds\.url, creds\.anonKey\)/);
  assert.match(runner, /anonymous role reads schedules for a published provider/);
});

test("clinic membership integration distinguishes Auth identity, fixture state, and RLS access", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  assert.match(runner, /clinic staff Auth identity matches its synthetic fixture/);
  assert.match(runner, /service role confirms the synthetic active clinic membership fixture/);
  assert.match(runner, /clinic staff scope RPC returns its assigned clinic/);
  assert.match(runner, /\.eq\("user_id", users\["clinic-staff"\]\.id\)/);
  assert.match(runner, /clinic staff reads its active membership \(\$\{membershipResponse/);
});

test("the workflow provisions only local Supabase services and never links a remote project", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  const dockerGate = readFileSync(
    path.join(root, "scripts/verify-disposable-docker-bindings.mjs"),
    "utf8",
  );
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /version:\s*2\.117\.0/);
  assert.match(workflow, /supabase --network-id "\$CARECONNECT_DOCKER_NETWORK" start/);
  assert.match(dockerGate, /com\.docker\.network\.bridge\.host_binding_ipv4/);
  assert.match(dockerGate, /127\.0\.0\.1/);
  assert.match(dockerGate, /"--internal"/);
  assert.match(dockerGate, /"::1"/);
  assert.match(workflow, /docker-bindings\.mjs verify/);
  assert.match(workflow, /"\$\{\{ steps\.start_supabase\.outcome \}\}"/);
  const bindingGate = workflow.indexOf(
    "Verify actual Docker bindings before application service requests",
  );
  const migrations = workflow.indexOf("Verify migration ledger and reviewed SQL integrity");
  const integration = workflow.indexOf(
    "Exercise real Auth, PostgREST, Storage, Realtime, and browser workflows",
  );
  assert.ok(bindingGate >= 0 && bindingGate < migrations && bindingGate < integration);
  assert.match(
    workflow,
    /Verify actual Docker bindings before application service requests\s+if: \$\{\{ always\(\) && steps\.start_supabase\.outcome != 'skipped' \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /supabase\s+(?:link|db\s+push|migration\s+up\s+--linked|db\s+reset\s+--linked)/,
  );
  assert.match(workflow, /supabase --network-id "\$CARECONNECT_DOCKER_NETWORK" stop --no-backup/);
  assert.match(workflow, /docker-network-cleanup-summary\.json/);
});

test("Realtime checks follow the message RLS contract and close bounded runner resources", () => {
  const runner = readFileSync(path.join(root, "scripts/real-service-integration.mjs"), "utf8");
  const readiness = readFileSync(
    path.join(root, "tests/real-service/assert-realtime-readiness.sql"),
    "utf8",
  );
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );

  assert.match(readiness, /current_setting\('wal_level'\) <> 'logical'/);
  assert.match(readiness, /pubname = 'supabase_realtime'[\s\S]*?AND pubinsert/);
  assert.match(readiness, /schemaname = 'public'[\s\S]*?tablename = 'messages'/);
  assert.match(readiness, /indisprimary/);
  assert.match(readiness, /relrowsecurity/);
  assert.match(runner, /prepareRealtimeAuth\(client, expectedUserId, state\.diagnostics\)/);
  assert.match(runner, /client\.auth\.getUser\(token\)/);
  assert.match(
    runner,
    /\.channel\(`careconnect-ci-\$\{randomUUID\(\)\}`, realtimePostgresChangesOptions\(\)\)/,
  );
  assert.match(runner, /Realtime patient can SELECT the inserted message under its JWT/);
  assert.match(runner, /Realtime clinic staff can SELECT the inserted message under its JWT/);
  assert.match(runner, /realtime_diagnostics: sanitizeRealtimeDiagnostics\(realtimeDiagnostics\)/);
  assert.match(runner, /collectRealtimeDeliveries\(\[receivedByPatient, receivedByClinic\]\)/);
  assert.match(runner, /Realtime authorized patient message delivery \(patient=/);
  assert.match(runner, /Realtime authorized doctor reply delivery \(patient=/);
  assert.match(
    runner,
    /realtimeChannel\(\s*clients\["clinic-staff"\],\s*"clinic_staff",\s*conversationId,/,
  );
  assert.match(runner, /doctor cannot read protected raw messages outside the scoped inbox RPC/);
  assert.match(runner, /doctor receives the patient message through the assigned-conversation RPC/);
  assert.match(runner, /noInsert\(doctorChannel, patientMessage\)/);
  assert.match(
    runner,
    /unrelated, anonymous, and doctor raw-table subscribers receive no unauthorized events/,
  );
  assert.match(runner, /finally \{\s*\/\/ Close WebSockets before fixture cleanup/);
  assert.match(runner, /closeAuthResources\(\[\.\.\.authClients\]\)/);
  assert.match(runner, /client\.auth\.stopAutoRefresh\(\)/);
  assert.match(runner, /client\.auth\.dispose\(\)/);
  assert.match(runner, /timeoutMs: 15 \* 60 \* 1000/);
  assert.match(workflow, /Exercise real Auth,[\s\S]*?timeout-minutes: 35/);
  assert.match(
    workflow,
    /Stop the disposable Supabase stack\s+if: always\(\)[\s\S]*?timeout-minutes: 5/,
  );
  assert.match(
    workflow,
    /timeout --signal=TERM --kill-after=15s 180s supabase --network-id "\$CARECONNECT_DOCKER_NETWORK" stop/,
  );
  assert.match(
    workflow,
    /Upload sanitized integration evidence\s+if: always\(\)[\s\S]*?timeout-minutes: 5/,
  );
});

test("browser evidence counts test cases, assertions, and observed HTTP operations separately", () => {
  const summary = summarizeBrowserWorkflows([
    {
      name: "patient",
      status: "PASS",
      assertions: [{ name: "patient booking is confirmed", status: "PASS" }],
      http_requests: 8,
      request_failures: 0,
    },
    {
      name: "clinic",
      status: "FAIL",
      assertions: [{ name: "clinic can see appointment", status: "FAIL" }],
      http_requests: 5,
      request_failures: 1,
    },
    {
      name: "doctor",
      status: "BLOCKED",
      assertions: [],
      http_requests: 0,
      request_failures: 0,
    },
    {
      name: "administrator",
      status: "PASS",
      assertions: [{ name: "admin publication change succeeds", status: "PASS" }],
      http_requests: 6,
      request_failures: 0,
    },
  ]);

  assert.deepEqual(summary.test_cases, { total: 4, passed: 2, failed: 1, blocked: 1 });
  assert.deepEqual(summary.workflow_counts, { passed: 2, failed: 1, blocked: 1 });
  assert.deepEqual(
    {
      total: summary.assertions.total,
      passed: summary.assertions.passed,
      failed: summary.assertions.failed,
    },
    { total: 3, passed: 2, failed: 1 },
  );
  assert.deepEqual(summary.service_operations, {
    kind: "observed browser HTTP requests",
    observed: 19,
    failed: 1,
  });
});

test("browser workflow scenarios use UI actions and run independently", () => {
  const spec = readFileSync(path.join(root, "tests/real-service/workflows.spec.ts"), "utf8");
  const config = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
  for (const title of [
    "patient books and cancels an appointment through the interface",
    "clinic staff sees the created appointment in the clinic portal",
    "doctor sees the appointment, receives a patient message, and replies in the portals",
    "administrator reviews the clinic and changes publication through the interface",
  ]) {
    assert.ok(spec.includes(`test("${title}"`), `missing independent scenario: ${title}`);
  }
  assert.doesNotMatch(spec, /createClient|fetch\(|page\.request\.|\.rpc\(/);
  assert.match(spec, /getByRole\("button", \{ name: "Request appointment" \}\)/);
  assert.match(spec, /getByRole\("button", \{ name: "Send reply" \}\)/);
  assert.match(spec, /getByRole\("tab", \{ name: "Provider publishing" \}\)/);
  assert.ok(config.includes('"**/real-service/**"'));
});

test("real-service workflow triggers cover every imported project runtime dependency", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/real-service-integration.yml"),
    "utf8",
  );
  for (const pathFilter of [
    "scripts/staging-reconciliation-rehearsal.mjs",
    "scripts/staging-reconciliation-rehearsal.test.mjs",
    "scripts/run-sql-ci-step*.mjs",
    "scripts/local-sql-test-target*.mjs",
    "vite.config.ts",
    "nitro.config.ts",
    "src/**",
    "package-lock.json",
  ]) {
    assert.ok(workflow.includes(`- "${pathFilter}"`), `missing CI path filter: ${pathFilter}`);
  }
  assert.match(workflow, /test-artifacts\/browser-workflow-summary\.json/);
  assert.doesNotMatch(workflow, /browser-flow-summary\.json/);
  const rehearsal = readFileSync(
    path.join(root, ".github/workflows/staging-reconciliation-rehearsal.yml"),
    "utf8",
  );
  for (const pathFilter of [
    "playwright.config.ts",
    "tests/deferred-toast.spec.ts",
    "src/components/DeferredToaster.tsx",
  ]) {
    assert.ok(
      rehearsal.includes(`- "${pathFilter}"`),
      `missing mocked suite path filter: ${pathFilter}`,
    );
  }
});

test("generated integration artifacts and build output stay outside proposed commits", () => {
  const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^test-artifacts\/$/m);
  assert.match(ignore, /^\.output$/m);
  assert.match(ignore, /^\.wrangler\/$/m);
});
