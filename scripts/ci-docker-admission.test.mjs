import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeDocker, createAdmissionServer, parsePolicyJson } from "./ci-docker-admission.mjs";

const policy = {
  project: "careconnect-ci-123-2",
  run: "123-2",
  workspace: "/tmp/synthetic-workspace",
  root: "/var/tmp/careconnect-ci.abcdefgh",
};
const secret = "synthetic-auth-secret-must-not-leave-request";
const create = "/v1.49/containers/create";
const network = "/v1.49/networks/create";
const request = (RequestUri, value, RequestMethod = "POST") => ({
  RequestMethod,
  RequestUri,
  RequestBody: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString(
    "base64",
  ),
});
const container = (host = {}) => ({
  Image: "synthetic:1",
  Env: ["JWT_SECRET=" + secret],
  HostConfig: {
    NetworkMode: policy.project,
    PortBindings: { "8080/tcp": [{ HostIp: "", HostPort: "48480" }] },
    ...host,
  },
});
const ownedNetwork = {
  Name: policy.project,
  Driver: "bridge",
  EnableIPv6: false,
  IPAM: {
    Driver: "default",
    Options: {},
    Config: [{ Subnet: "172.30.0.0/24", Gateway: "172.30.0.1" }],
  },
  Internal: false,
  Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
  Labels: { "com.careconnect.disposable-real-service-run": policy.run },
};

for (const address of ["0.0.0.0", "192.0.2.15", "::", "2001:db8::1", "::ffff:127.0.0.1", "*"]) {
  test("rejects unsafe " + address + " before executing a create handler", () => {
    let createCount = 0;
    if (
      authorizeDocker(
        request(
          create,
          container({
            PortBindings: { "8080/tcp": [{ HostIp: address, HostPort: "48480" }] },
          }),
        ),
        policy,
      )
    )
      createCount++;
    assert.equal(createCount, 0);
  });
}

for (const address of ["", "127.0.0.1", "::1"]) {
  test("accepts approved mapping " + (address || "implicit on approved network"), () => {
    assert.equal(
      authorizeDocker(
        request(
          create,
          container({
            PortBindings: { "8080/tcp": [{ HostIp: address, HostPort: "48480" }] },
          }),
        ),
        policy,
      ),
      true,
    );
  });
}

for (const [reason, host] of [
  ["someone else's network", { NetworkMode: "bridge" }],
  ["host network", { NetworkMode: "host" }],
  ["automatic publishing", { PublishAllPorts: true }],
  ["privileged mode", { Privileged: true }],
  ["host PID sharing", { PidMode: "host" }],
  ["host IPC sharing", { IpcMode: "host" }],
  ["host Docker socket mount", { Binds: ["/var/run/docker.sock:/var/run/docker.sock:ro"] }],
  ["unrelated volume", { Binds: ["supabase_db_other-project:/data"] }],
  ["arbitrary volume mount options", { Mounts: [{ Type: "volume", Source: "any" }] }],
  ["malformed binding", { PortBindings: { "8080/tcp": { HostIp: "::", HostPort: "48480" } } }],
  ["invalid host port", { PortBindings: { "8080/tcp": [{ HostIp: "::1", HostPort: "70000" }] } }],
]) {
  test("denies container creation with " + reason, () => {
    assert.equal(authorizeDocker(request(create, container(host)), policy), false);
  });
}

test("only the run-owned network and exact bridge options can be created", () => {
  assert.equal(authorizeDocker(request(network, ownedNetwork), policy), true);
  for (const overrides of [
    { Name: "shared" },
    { Driver: "host" },
    { Options: {} },
    {
      Options: { ...ownedNetwork.Options, "com.docker.network.bridge.gateway_mode_ipv4": "routed" },
    },
    { EnableIPv6: true },
    { Labels: {} },
    { IPAM: { Driver: "arbitrary-driver" } },
    { IPAM: { Driver: "default", Config: [] } },
    { IPAM: { Driver: "default", Config: [{ Subnet: "2001:db8::/64" }] } },
  ])
    assert.equal(
      authorizeDocker(request(network, { ...ownedNetwork, ...overrides }), policy),
      false,
    );
});

test("requests with missing policy or another run identity fail at admission", () => {
  for (const input of [null, {}, { ...policy, run: "123-1" }])
    assert.equal(authorizeDocker(request(create, container()), input), false);
});

test("missing, ambiguous or malformed Docker bodies cannot authorize a write", () => {
  assert.equal(authorizeDocker({ RequestMethod: "POST", RequestURI: create }, policy), false);
  assert.equal(authorizeDocker(request(create, '{"HostConfig":'), policy), false);
  assert.equal(
    authorizeDocker(request(create, '{"HostConfig":{},"hostconfig":{}}'), policy),
    false,
  );
  assert.throws(() => parsePolicyJson('{"a":{"B":1,"b":2}}'), { message: "ambiguous-json" });
  assert.equal(
    authorizeDocker(
      request(
        create,
        container({
          portbindings: { "81/tcp": [{ HostIp: "::", HostPort: "12345" }] },
        }),
      ),
      policy,
    ),
    false,
  );
});

test("only a private-daemon container ID can receive a root bootstrap archive", () => {
  const target = `/containers/${"a".repeat(64)}/archive`;
  assert.equal(
    authorizeDocker(request(target + "?path=%2F&noOverwriteDirNonDir=true", "", "PUT"), policy),
    true,
  );
  for (const uri of [
    target,
    target + "?path=%2Ftmp",
    target + "?path=%2F&path=%2Ftmp",
    "/containers/shared/archive?path=%2F",
  ])
    assert.equal(authorizeDocker(request(uri, "", "PUT"), policy), false);
});

test("mutable Docker control endpoints and other network attachments fail closed", () => {
  for (const endpoint of [
    "/plugins/pull",
    "/swarm/init",
    "/networks/shared/connect",
    "/containers/prune",
    "/build",
    "/containers/supabase/run",
    "/containers/%63reate",
    "/images/create?fromSrc=synthetic",
  ])
    assert.equal(authorizeDocker(request(endpoint, {}), policy), false);
  assert.equal(
    authorizeDocker(request("/containers/id/exec", { Privileged: true }), policy),
    false,
  );
  assert.equal(
    authorizeDocker(request("/containers/id/exec", { Privileged: false }), policy),
    true,
  );
});

test("Docker authorization protocol denies unsafe and malformed posts with fixed redacted responses", async () => {
  const server = createAdmissionServer(policy);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = "http://127.0.0.1:" + server.address().port;
    const post = (endpoint, payload) =>
      fetch(url + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    const activation = await post("/Plugin.Activate", "{}");
    assert.deepEqual(await activation.json(), { Implements: ["authz"] });
    const body = JSON.stringify(
      request(
        create,
        container({
          PortBindings: { "8080/tcp": [{ HostIp: "::", HostPort: "48480" }] },
        }),
      ),
    );
    for (const payload of [body, '{ "malformed": ' + secret]) {
      const result = await post("/AuthZPlugin.AuthZReq", payload);
      const fixed = await result.text();
      assert.equal(result.status, 200);
      assert.deepEqual(JSON.parse(fixed), {
        Allow: false,
        Msg: "careconnect-admission-denied",
        Err: "",
      });
      assert.ok(!fixed.includes(secret));
    }
    const valid = await post("/AuthZPlugin.AuthZReq", JSON.stringify(request(create, container())));
    assert.deepEqual(await valid.json(), { Allow: true });
  } finally {
    server.close();
  }
});

test("supervisor requires real refusal, a clean container inventory and a positive loopback control before startup", () => {
  const script = readFileSync(new URL("ci-isolated-docker.sh", import.meta.url), "utf8");
  const proof = script.indexOf('>"$root/verified.json"');
  assert.ok(proof > script.indexOf("careconnect-admission-denied"));
  assert.ok(proof > script.indexOf('d port "$probe"'));
  const create = script.indexOf("probe=$(d create");
  const snapshot = script.indexOf('d export --output "$root/canary.tar" "$probe"');
  const filesystemCheck = script.indexOf("Canary exported filesystem: bin/busybox present.");
  const start = script.indexOf('"start", probe]');
  assert.ok(create > 0 && snapshot > create && filesystemCheck > snapshot);
  assert.ok(start > filesystemCheck && proof > start);
  assert.ok(proof > script.indexOf("10.0.2.100:48480"));
  assert.ok(proof > script.indexOf("[::]:48480"));
  assert.ok(proof > script.indexOf("0.0.0.0:48480"));
  assert.ok(proof < script.indexOf("user_phase start"));
  assert.ok(
    script.indexOf('systemctl stop "$slirp_unit"', proof) < script.indexOf("user_phase test"),
  );
  assert.match(script, /empty_containers\(\)[\s\S]*?ids=\$\(d ps -aq 2>\/dev\/null\) &&/);
  assert.match(script, /if ! user_phase cleanup; then rc=1; fi/);
  assert.match(script, /trap stop_units EXIT/);
});
