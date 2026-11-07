import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  requireServicePreExposureIsolation,
  reportServiceExecutionBlock,
  serviceExecutionBlockEvidence,
} from "./service-execution-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canary = "synthetic-private-value-never-export";
const expectedEvidence = {
  schema_version: 1,
  status: "BLOCKED",
  reason: "pre-exposure-isolation-unavailable",
  required_policy: "loopback-only-ipv4-ipv6-before-start",
  service_execution: "NOT_EXECUTED",
  binding_verification: "NOT_EVALUATED",
  resources_created_by_boundary: false,
  cleanup_performed_by_boundary: false,
  prior_runtime_state: "NOT_INSPECTED",
};
const entries = [
  ["staging-reconciliation-rehearsal.mjs", "--execute"],
  ["run-sql-ci-step.mjs", "startup"],
  ["startup-observer.mjs", "run", "careconnect-ci-123-1", "careconnect-ci-123-1"],
];

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "careconnect-exposure-boundary-"));
  const marker = path.join(directory, "unexpected-effects.txt");
  mkdirSync(path.join(directory, "supabase/.temp"), { recursive: true });
  for (const name of [".env", "supabase/.temp/project-ref", "supabase/.temp/linked-project.json"])
    writeFileSync(path.join(directory, name), canary);
  const probe = path.join(directory, "probe.mjs");
  writeFileSync(
    probe,
    `
    import fs from 'node:fs';
    import promises from 'node:fs/promises';
    import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const mark = () => fs.appendFileSync(${JSON.stringify(marker)}, 'unexpected-effect\\n');
    const deny = () => { mark(); throw new Error('unexpected runtime operation'); };
    cp.spawn = deny;
    cp.spawnSync = deny;
    cp.exec = deny;
    cp.execSync = deny;
    cp.execFile = deny;
    cp.execFileSync = deny;
    fs.mkdtempSync = deny;
    fs.cpSync = deny;
    fs.rmSync = deny;
    const privateFile = (p) => /(^|[\\\\/])\\.env(?:\\.|$)|[\\\\/]\\.temp[\\\\/](?:project-ref|linked-project\\.json)$/.test(String(p));
    for (const [object, key] of [
      [fs,'readFileSync'], [fs,'readFile'], [fs,'openSync'], [fs,'open'],
      [fs,'createReadStream'], [fs,'existsSync'], [fs,'statSync'],
      [promises,'readFile'], [promises,'open']
    ]) {
      const original = object[key];
      object[key] = function(filename, ...args) {
        if (privateFile(filename)) deny();
        return original.call(this, filename, ...args);
      };
    }
    syncBuiltinESMExports();
  `,
  );
  return {
    directory,
    probe,
    marker,
    cleanup() {
      const relative = path.relative(os.tmpdir(), directory);
      assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative));
      assert.ok(path.basename(directory).startsWith("careconnect-exposure-boundary-"));
      rmSync(directory, { recursive: true });
    },
  };
}

// These conditions cannot be reached while prevention is unsupported. This tests refusal
// before any ownership inspection, Docker operation, startup, private read or cleanup, rather
// than pretending to exercise live recovery from a network/container failure.
const scenarios = [
  ["missing ownership metadata", {}],
  ["mismatched project identity", { CARECONNECT_DOCKER_NETWORK: "unrelated-project" }],
  ["project-name collision", { CARECONNECT_PROJECT_ID: "existing-project" }],
  ["network creation failure", { CARECONNECT_RUNTIME_CLAIM: "network-create-failed" }],
  ["invalid network configuration", { CARECONNECT_RUNTIME_CLAIM: "external-bridge" }],
  ["non-loopback IPv4", { CARECONNECT_RUNTIME_CLAIM: "0.0.0.0" }],
  ["non-loopback IPv6", { CARECONNECT_RUNTIME_CLAIM: "::" }],
  ["binding inspection failure", { CARECONNECT_RUNTIME_CLAIM: "inspection-failed" }],
  ["partially started stack", { CARECONNECT_RUNTIME_CLAIM: "partial-startup" }],
  ["startup cancellation", { CARECONNECT_RUNTIME_CLAIM: "cancelled" }],
  ["cleanup failure", { CARECONNECT_RUNTIME_CLAIM: "cleanup-failed" }],
  ["unrelated Docker resource", { CARECONNECT_DOCKER_NETWORK: "video2product" }],
  ["manual dispatch", { GITHUB_EVENT_NAME: "workflow_dispatch" }],
  ["push invocation", { GITHUB_EVENT_NAME: "push" }],
  ["missing runtime prerequisites", { RUNNER_TEMP: "", CI: "", GITHUB_ACTIONS: "" }],
  ["dotenv present", { DOTENV_PRIVATE_KEY: canary }],
  ["link markers present", { SUPABASE_PROJECT_ID: canary }],
  ["secret-bearing environment", { SUPABASE_ACCESS_TOKEN: canary, DATABASE_URL: canary }],
];

for (const [name, overrides] of scenarios) {
  test(`unsupported runtime refuses ${name} before any resource access`, () => {
    const f = fixture();
    try {
      for (const [script, ...args] of entries) {
        const result = spawnSync(
          process.execPath,
          ["--import", pathToFileURL(f.probe).href, path.join(root, "scripts", script), ...args],
          {
            cwd: f.directory,
            env: {
              ...process.env,
              GITHUB_ACTIONS: "true",
              CI: "true",
              GITHUB_RUN_ID: "123",
              GITHUB_RUN_ATTEMPT: "1",
              RUNNER_TEMP: f.directory,
              CARECONNECT_ALLOW_UNSAFE_STARTUP: "1",
              CARECONNECT_PRE_EXPOSURE_VERIFIED: "1",
              ...overrides,
            },
            encoding: "utf8",
            timeout: 10000,
          },
        );
        assert.equal(result.status, 78, `${script}: ${result.stderr}`);
        assert.equal(result.stdout, "");
        assert.match(
          result.stderr,
          /^Service execution BLOCKED: pre-exposure isolation unavailable;/,
        );
        assert.doesNotMatch(
          result.stdout + result.stderr,
          /synthetic-private|unexpected runtime|video2product/,
        );
        const evidence = JSON.parse(
          readFileSync(
            path.join(f.directory, "test-artifacts/service-execution-boundary.json"),
            "utf8",
          ),
        );
        assert.deepEqual(evidence, expectedEvidence);
        assert.doesNotMatch(
          JSON.stringify(evidence),
          /synthetic-private|token|registry|password|video2product/,
        );
      }
      assert.ok(!readdirSync(f.directory).includes("unexpected-effects.txt"));
      for (const name of [
        ".env",
        "supabase/.temp/project-ref",
        "supabase/.temp/linked-project.json",
      ])
        assert.equal(readFileSync(path.join(f.directory, name), "utf8"), canary);
    } finally {
      f.cleanup();
    }
  });
}

test("post-start PASS and claimed ownership cannot authorize pre-exposure execution", () => {
  assert.throws(
    () => requireServicePreExposureIsolation({ status: "PASS", ownership: "verified" }),
    { code: "CARECONNECT_PRE_EXPOSURE_ISOLATION_UNAVAILABLE" },
  );
  assert.equal(serviceExecutionBlockEvidence().binding_verification, "NOT_EVALUATED");
  assert.deepEqual(serviceExecutionBlockEvidence(), expectedEvidence);
});

test("unrelated failures are not relabeled or swallowed as intentional blocking", () => {
  assert.equal(reportServiceExecutionBlock(new Error(canary)), false);
  assert.equal(reportServiceExecutionBlock(null), false);
  const code = "CARECONNECT_PRE_EXPOSURE_ISOLATION_UNAVAILABLE";
  assert.equal(reportServiceExecutionBlock({ code, message: canary }), false);
  assert.equal(reportServiceExecutionBlock(Object.assign(new Error(canary), { code })), false);
});

test("failure to write boundary evidence stays nonzero and hides filesystem diagnostics", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.directory, "test-artifacts"), canary);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(f.probe).href,
        path.join(root, "scripts/service-execution-boundary.mjs"),
      ],
      { cwd: f.directory, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 78);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "Service execution BLOCKED: boundary evidence unavailable; runtime not inspected or started.\n",
    );
    assert.equal(readFileSync(path.join(f.directory, "test-artifacts"), "utf8"), canary);
    assert.ok(!readdirSync(f.directory).includes("unexpected-effects.txt"));
  } finally {
    f.cleanup();
  }
});

for (const [workflow, job, firstUnsafe] of [
  [
    "staging-reconciliation-rehearsal.yml",
    "rehearsal",
    "node scripts/staging-reconciliation-rehearsal.mjs --execute",
  ],
  ["sql-tests.yml", "sql-tests", "supabase init --yes"],
  ["real-service-integration.yml", "real-service-integration", "supabase init --yes"],
]) {
  test(`${workflow}: push and manual dispatch cannot bypass the required boundary`, () => {
    const source = readFileSync(path.join(root, ".github/workflows", workflow), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    assert.match(source, /workflow_dispatch:/);
    assert.match(source, /\n  push:/);
    assert.match(source, /scripts\/service-execution-boundary\*\.mjs/);
    const body = source.slice(source.indexOf(`\n  ${job}:`) + 1).split(/\n  [\w-]+:\n/)[0];
    const boundary = body.indexOf("      - name: Require pre-exposure service isolation");
    assert.doesNotMatch(body, /^ {4}(?:if|continue-on-error):/m);
    assert.ok(boundary >= 0 && boundary < body.indexOf(firstUnsafe));
    const step = body.slice(boundary).split(/\n      - /)[0];
    assert.match(step, /\n        run: node scripts\/service-execution-boundary.mjs\n/);
    assert.doesNotMatch(step, /continue-on-error|\n\s+if:|\|\|\s*true|exit 0/);
    assert.match(body, /test-artifacts\/service-execution-boundary.json/);
    assert.doesNotMatch(
      body.slice(body.indexOf("uses: actions/upload-artifact")),
      /\.raw\.log|\n\s+\.env/,
    );
  });
}

test("direct service entry points require prevention before preflight, spawn or traffic", () => {
  for (const [file, functionName] of [
    ["staging-reconciliation-rehearsal.mjs", "main()"],
    ["startup-observer.mjs", "runStartup(projectId, networkName)"],
    ["real-service-integration.mjs", "runIntegration()"],
  ]) {
    const source = readFileSync(path.join(root, "scripts", file), "utf8").replaceAll("\r\n", "\n");
    assert.ok(
      source.includes(`async function ${functionName} {\n  requireServicePreExposureIsolation();`),
    );
    assert.match(source, /reportServiceExecutionBlock\(error\)/);
  }
  const source = readFileSync(path.join(root, "scripts/run-sql-ci-step.mjs"), "utf8");
  assert.match(
    source,
    /try \{\s+requireServicePreExposureIsolation\(\);\s+const kind = process.argv\[2\]/,
  );
});

// Exercise the existing binding helper's real CLI/error/cleanup paths with a fake
// child-process transport. No Docker process or engine is invoked by these tests.
const networkName = "careconnect-ci-123-1";
const networkId = "a".repeat(64);
const lsNetworks = ["network", "ls", "--format", "{{.Name}}"];
const createNetwork = [
  "network",
  "create",
  "--driver",
  "bridge",
  "--internal",
  "--label",
  "com.careconnect.disposable-real-service-run=123-1",
  "--opt",
  "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
  networkName,
];
const inspectNetwork = ["network", "inspect", networkId];
const ownedNetwork = {
  Name: networkName,
  Id: networkId,
  Driver: "bridge",
  Internal: true,
  EnableIPv6: false,
  Labels: { "com.careconnect.disposable-real-service-run": "123-1" },
  Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
  Containers: {},
};

for (const scenario of [
  "collision",
  "creation-failure",
  "invalid-network",
  "inspection-failure",
  "cleanup-failure",
  "unrelated-cleanup",
]) {
  test(`existing Docker guard fails closed for ${scenario} with synthetic transport`, () => {
    const f = fixture();
    try {
      const evidence = path.join(f.directory, "guard-summary.json");
      const owner = path.join(f.directory, "owned-network.json");
      const config = path.join(f.directory, "config.toml");
      writeFileSync(config, `project_id = "${networkName}"\n`);
      let args;
      let plan;
      if (scenario === "inspection-failure") {
        args = ["verify", networkName, config, evidence, "123-1", "success"];
        plan = [{ args: ["network", "inspect", networkName], status: 1, stdout: canary }];
      } else if (scenario.endsWith("cleanup") || scenario === "cleanup-failure") {
        args = ["cleanup", networkName, owner, evidence];
        writeFileSync(
          owner,
          JSON.stringify({
            id: networkId,
            name: scenario === "unrelated-cleanup" ? "video2product" : networkName,
            run_label: "123-1",
          }),
        );
        plan =
          scenario === "unrelated-cleanup"
            ? []
            : [
                {
                  args: [
                    "network",
                    "ls",
                    "--no-trunc",
                    "--filter",
                    `id=${networkId}`,
                    "--format",
                    "{{.ID}}",
                  ],
                  status: 0,
                  stdout: networkId,
                },
                { args: inspectNetwork, status: 0, stdout: JSON.stringify([ownedNetwork]) },
                { args: ["network", "rm", networkId], status: 1, stdout: canary },
              ];
      } else {
        args = ["create", networkName, "123-1", evidence, owner];
        plan = [
          { args: lsNetworks, status: 0, stdout: scenario === "collision" ? networkName : "" },
        ];
        if (scenario !== "collision")
          plan.push({
            args: createNetwork,
            status: scenario === "creation-failure" ? 1 : 0,
            stdout: scenario === "creation-failure" ? canary : networkId,
          });
        if (scenario === "invalid-network")
          plan.push({
            args: inspectNetwork,
            status: 0,
            stdout: JSON.stringify([{ ...ownedNetwork, Internal: false }]),
          });
      }
      const trace = path.join(f.directory, "transport-trace.json");
      const fake = path.join(f.directory, "fake-docker.mjs");
      writeFileSync(
        fake,
        `
        import fs from 'node:fs';
        import cp from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const plan = ${JSON.stringify(plan)};
        const seen = [];
        cp.spawnSync = (command, args) => {
          seen.push({command,args});
          fs.writeFileSync(${JSON.stringify(trace)}, JSON.stringify(seen));
          const expected = plan[seen.length - 1];
          if (command !== 'docker' || !expected || JSON.stringify(args) !== JSON.stringify(expected.args))
            throw new Error('unexpected synthetic command');
          return {status:expected.status, stdout:expected.stdout, stderr:''};
        };
        syncBuiltinESMExports();
      `,
      );
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(fake).href,
          path.join(root, "scripts/verify-disposable-docker-bindings.mjs"),
          ...args,
        ],
        { cwd: f.directory, encoding: "utf8", timeout: 10000 },
      );
      assert.notEqual(result.status, 0);
      const calls = readdirSync(f.directory).includes("transport-trace.json")
        ? JSON.parse(readFileSync(trace, "utf8"))
        : [];
      assert.deepEqual(
        calls,
        plan.map((item) => ({ command: "docker", args: item.args })),
      );
      const summary = JSON.parse(readFileSync(evidence, "utf8"));
      assert.equal(summary.status, "FAIL");
      assert.doesNotMatch(
        JSON.stringify(summary) + result.stdout + result.stderr,
        /synthetic-private|video2product/,
      );
    } finally {
      f.cleanup();
    }
  });
}
