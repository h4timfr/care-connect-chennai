import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const blockedCode = "CARECONNECT_PRE_EXPOSURE_ISOLATION_UNAVAILABLE";
class ServiceExecutionBlockedError extends Error {
  code = blockedCode;
  constructor() {
    super("Service execution blocked: pre-exposure isolation unavailable.");
  }
}

// CLI 2.117.0 does not explicitly bind every published service port in this integration.
// A network default plus inspection after startup cannot prove pre-exposure prevention.
// Intentionally no environment toggle, claimed ownership, or post-start PASS can bypass this.
// Enable execution only after implementing and verifying enforcement BEFORE container start.
// A supported replacement also needs exact engine/project/resource ownership and later binding checks.
export function requireServicePreExposureIsolation() {
  throw new ServiceExecutionBlockedError();
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
  } catch (error) {
    if (!reportServiceExecutionBlock(error)) throw error;
  }
}
