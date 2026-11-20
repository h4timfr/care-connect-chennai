import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStartupOutcome,
  assessDockerRuntime,
  parseSsListeners,
} from "./verify-disposable-docker-bindings.mjs";

const networkName = "careconnect-run-123-1";
const runLabel = "123-1";
const projectId = "care-connect-chennai";
const networkId = "a".repeat(64);
const containerId = "b".repeat(64);

test("startup failure or cancellation cannot pass the binding gate", () => {
  const assessment = { status: "PASS", published_ports: [] };
  for (const outcome of ["failure", "cancelled"]) {
    assert.deepEqual(applyStartupOutcome(assessment, outcome), {
      ...assessment,
      status: "NOT_EVALUATED",
      reason: "stack-unavailable",
    });
  }
  assert.equal(applyStartupOutcome(assessment, "success").status, "PASS");
  assert.equal(applyStartupOutcome(assessment, undefined).status, "FAIL");
});

function runtime({ hostIps = ["127.0.0.1"], listeners = [] } = {}) {
  const network = {
    Name: networkName,
    Id: networkId,
    Driver: "bridge",
    Internal: true,
    EnableIPv6: false,
    Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
    Labels: { "com.careconnect.disposable-real-service-run": runLabel },
    Containers: { [containerId]: { Name: "redacted" } },
  };
  const container = {
    Id: containerId,
    Config: { Labels: { "com.supabase.cli.project": projectId } },
    State: { Running: true },
    HostConfig: {
      NetworkMode: networkName,
      PortBindings: { "5432/tcp": [{ HostIp: "", HostPort: "54322" }] },
    },
    NetworkSettings: {
      Networks: { [networkName]: { NetworkID: networkId } },
      Ports: {
        "5432/tcp": hostIps.map((HostIp) => ({ HostIp, HostPort: "54322" })),
      },
    },
  };
  return {
    network,
    expectedNetworkName: networkName,
    expectedRunLabel: runLabel,
    projectId,
    containers: [container],
    listeners,
  };
}

test("accepts a private internal bridge with loopback-only published ports", () => {
  const result = assessDockerRuntime(
    runtime({
      listeners: [{ protocol: "tcp", address: "127.0.0.1", port: 54322 }],
    }),
  );

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.failure_codes, []);
  assert.equal(result.network.internal, true);
  assert.deepEqual(result.published_ports, [
    {
      container_port: "5432/tcp",
      protocol: "tcp",
      host_address_scope: "loopback-v4",
      host_port: 54322,
    },
  ]);
});

test("rejects wildcard IPv4 and IPv6 published port bindings", () => {
  for (const hostIp of ["0.0.0.0", "::"]) {
    const result = assessDockerRuntime(runtime({ hostIps: [hostIp] }));
    assert.equal(result.status, "FAIL", hostIp);
    assert.ok(result.failure_codes.includes("published-port-not-loopback-bound"), hostIp);
  }
});

test("rejects any non-loopback or unspecified host address", () => {
  for (const hostIp of ["", "192.0.2.10", "2001:db8::1"]) {
    const result = assessDockerRuntime(runtime({ hostIps: [hostIp] }));
    assert.equal(result.status, "FAIL", JSON.stringify(hostIp));
  }
});

test("accepts only IPv4 and IPv6 loopback host listeners for published ports", () => {
  for (const address of ["0.0.0.0", "::", "192.0.2.10", "2001:db8::1"]) {
    const result = assessDockerRuntime(
      runtime({ listeners: [{ protocol: "tcp", address, port: 54322 }] }),
    );
    assert.equal(result.status, "FAIL", address);
    assert.ok(result.failure_codes.includes("published-port-host-listener-not-loopback"));
  }
});

test("accepts no host socket listener when Docker uses NAT port forwarding", () => {
  const result = assessDockerRuntime(runtime());
  assert.equal(result.status, "PASS");
  assert.equal(result.host_listener_check.inspected, true);
  assert.equal(result.host_listener_check.matching_listener_count, 0);
});

test("fails closed for an external network, missing default, or disabled ownership label", () => {
  const state = runtime();
  state.network.Internal = false;
  state.network.Options["com.docker.network.bridge.host_binding_ipv4"] = "0.0.0.0";
  state.network.Labels["com.careconnect.disposable-real-service-run"] = "other-run";
  const result = assessDockerRuntime(state);

  assert.equal(result.status, "FAIL");
  assert.ok(result.failure_codes.includes("network-not-internal"));
  assert.ok(result.failure_codes.includes("network-loopback-default-missing"));
  assert.ok(result.failure_codes.includes("network-run-ownership-mismatch"));
});

test("fails closed if the isolated bridge unexpectedly enables IPv6", () => {
  const state = runtime();
  state.network.EnableIPv6 = true;
  const result = assessDockerRuntime(state);

  assert.equal(result.status, "FAIL");
  assert.ok(result.failure_codes.includes("network-ipv6-direct-routing-enabled"));
});

test("fails if any Supabase project container is outside the isolated network", () => {
  const state = runtime();
  state.containers[0].HostConfig.NetworkMode = "host";
  state.containers[0].NetworkSettings.Networks = {
    [networkName]: { NetworkID: "c".repeat(64) },
  };
  state.network.Containers = {};
  const result = assessDockerRuntime(state);

  assert.equal(result.status, "FAIL");
  assert.ok(result.failure_codes.includes("supabase-container-network-mode-mismatch"));
  assert.ok(result.failure_codes.includes("supabase-container-network-mismatch"));
  assert.ok(result.failure_codes.includes("network-contains-unexpected-containers"));
});

test("fails when no Supabase containers or published ports are verified", () => {
  const state = runtime();
  state.containers = [];
  state.network.Containers = {};
  const result = assessDockerRuntime(state);

  assert.equal(result.status, "FAIL");
  assert.ok(result.failure_codes.includes("supabase-project-containers-not-found"));
  assert.ok(result.failure_codes.includes("no-published-service-ports"));
});

test("parses IPv4, IPv6, and wildcard listeners and rejects ambiguous output", () => {
  assert.deepEqual(
    parseSsListeners(
      [
        "tcp LISTEN 0 4096 127.0.0.1:54322 0.0.0.0:*",
        "tcp LISTEN 0 4096 [::1]:54322 [::]:*",
        "tcp LISTEN 0 4096 0.0.0.0:54322 0.0.0.0:*",
        "udp UNCONN 0 0 [::]:54323 [::]:*",
      ].join("\n"),
    ),
    {
      listeners: [
        { protocol: "tcp", address: "127.0.0.1", port: 54322 },
        { protocol: "tcp", address: "::1", port: 54322 },
        { protocol: "tcp", address: "0.0.0.0", port: 54322 },
        { protocol: "udp", address: "::", port: 54323 },
      ],
      malformedLines: 0,
    },
  );
  assert.deepEqual(parseSsListeners("unexpected listener format"), {
    listeners: [],
    malformedLines: 1,
  });
});

test("sanitized network evidence omits container identifiers and arbitrary labels", () => {
  const result = assessDockerRuntime(runtime({ hostIps: ["192.0.2.10"] }));
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(networkId), false);
  assert.equal(serialized.includes(containerId), false);
  assert.equal(serialized.includes("redacted"), false);
  assert.equal(serialized.includes("192.0.2.10"), false);
  assert.match(serialized, /non-loopback-v4/);
});
