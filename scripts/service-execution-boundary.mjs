import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const blockedCode = "CARECONNECT_PRE_EXPOSURE_ISOLATION_UNAVAILABLE";
class ServiceExecutionBlockedError extends Error {
  code = blockedCode;
  constructor() {
    super("Service execution blocked: pre-exposure isolation unavailable.");
  }
}

// Only the root supervisor may issue a receipt. Validate its kernel namespace
// and actual Engine capabilities at each entry; environment flags cannot grant access.
export function privateDockerIdentity(phase = "verified") {
  try {
    const env = process.env;
    const root = env.CARECONNECT_ISOLATION_ROOT;
    const run = env.GITHUB_RUN_ID + "-" + env.GITHUB_RUN_ATTEMPT;
    if (
      process.platform !== "linux" ||
      process.getuid() === 0 ||
      !root ||
      !/^\/var\/tmp\/careconnect-ci\.[A-Za-z0-9]{8}$/.test(root) ||
      !/^\d{1,20}-\d{1,6}$/.test(run) ||
      env.GITHUB_ACTIONS !== "true" ||
      env.CI !== "true" ||
      env.DOCKER_HOST !== "unix://" + root + "/engine.sock" ||
      env.DOCKER_CONFIG !== root + "/docker-cli" ||
      ["DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"].some(
        (name) => name in env,
      ) ||
      realpathSync(root) !== root
    )
      throw new Error();
    const owner = lstatSync(root);
    const engine = lstatSync(root + "/engine.sock");
    const config = lstatSync(root + "/docker-cli");
    const receiptPath = root + "/" + phase + ".json";
    const receipt = lstatSync(receiptPath);
    if (
      !owner.isDirectory() ||
      owner.uid !== 0 ||
      (owner.mode & 0o022) !== 0 ||
      !config.isDirectory() ||
      config.uid !== 0 ||
      (config.mode & 0o022) !== 0 ||
      !engine.isSocket() ||
      engine.uid !== 0 ||
      (engine.mode & 0o007) !== 0 ||
      !receipt.isFile() ||
      receipt.uid !== 0 ||
      receipt.size > 512 ||
      (receipt.mode & 0o222) !== 0
    )
      throw new Error();
    const state = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (
      state.project !== "careconnect-ci-" + run ||
      env.CARECONNECT_DOCKER_NETWORK !== state.project ||
      env.CARECONNECT_DOCKER_RUN_LABEL !== run ||
      state.policy !== "careconnect-ci-admission" ||
      state.namespace !== readlinkSync("/proc/self/ns/net") ||
      !/^[a-zA-Z0-9:.-]+$/.test(state.engine)
    )
      throw new Error();
    const info = spawnSync(
      "/usr/bin/docker",
      ["--host", env.DOCKER_HOST, "--config", env.DOCKER_CONFIG, "info", "--format", "{{json .}}"],
      { encoding: "utf8", timeout: 8000, maxBuffer: 256 * 1024 },
    );
    if (info.status !== 0 || info.error) throw new Error();
    const actual = JSON.parse(info.stdout);
    if (
      actual.ID !== state.engine ||
      actual.DockerRootDir !== root + "/data" ||
      Number(actual.ServerVersion?.split(".")[0]) < 28 ||
      !/^\d+\./.test(actual.ServerVersion ?? "") ||
      JSON.stringify(actual.Plugins?.Authorization) !== '["careconnect-ci-admission"]'
    )
      throw new Error();
    return Object.freeze({ project: state.project, run });
  } catch {
    throw new ServiceExecutionBlockedError();
  }
}

export function requireServicePreExposureIsolation() {
  return privateDockerIdentity();
}

export function serviceExecutionBlockEvidence() {
  return {
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
}

export function reportServiceExecutionBlock(error) {
  if (!(error instanceof ServiceExecutionBlockedError)) return false;
  const directory = path.resolve("test-artifacts");
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "service-execution-boundary.json"),
      `${JSON.stringify(serviceExecutionBlockEvidence(), null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    process.stderr.write(
      "Service execution BLOCKED: boundary evidence unavailable; runtime not inspected or started.\n",
    );
    process.exitCode = 78;
    return true;
  }
  process.stderr.write(
    "Service execution BLOCKED: pre-exposure isolation unavailable; runtime not inspected or started.\n",
  );
  process.exitCode = 78;
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireServicePreExposureIsolation();
    if (process.argv[2] !== "check") {
      const directory = path.resolve("test-artifacts");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        path.join(directory, "service-execution-boundary.json"),
        JSON.stringify(
          {
            schema_version: 2,
            status: "PASS",
            scope: "pre-start-admission-only",
            namespace: "private-linux",
            negative_controls: [
              "ipv4-wildcard",
              "non-loopback-ipv4",
              "ipv6-wildcard",
              "host-network",
            ],
            refused_before_creation: true,
            positive_loopback_mapping_verified: true,
            service_execution: "PENDING",
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
    }
  } catch (error) {
    if (!reportServiceExecutionBlock(error)) throw error;
  }
}
