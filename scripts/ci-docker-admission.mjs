import { chmodSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const option = "com.docker.network.bridge.host_binding_ipv4";
const runLabel = "com.careconnect.disposable-real-service-run";
export const plugin = "careconnect-ci-admission";

// The Engine decodes JSON keys case-insensitively. Reject duplicated keys before
// inspecting a request, including repeated object fields that Go may merge.
export function parsePolicyJson(text) {
  const value = JSON.parse(text);
  const objects = [];
  for (const token of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"(\s*:)?|[{}]/g)) {
    if (token[0] === "{") objects.push(new Set());
    else if (token[0] === "}") objects.pop();
    else if (token[1]) {
      const key = JSON.parse(token[0].slice(0, -token[1].length)).toLowerCase();
      const keys = objects.at(-1);
      if (!keys || keys.has(key)) throw new Error("ambiguous-json");
      keys.add(key);
    }
  }
  return value;
}

const record = (v) => v && typeof v === "object" && !Array.isArray(v);
const emptyList = (v) => v == null || (Array.isArray(v) && v.length === 0);
const emptyObject = (v) => v == null || (record(v) && Object.keys(v).length === 0);
const field = (v, name) =>
  record(v)
    ? Object.entries(v).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
    : undefined;
const port = (v) =>
  typeof v === "string" && /^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

function body(request) {
  const raw = request.RequestBody;
  if (typeof raw !== "string" || raw.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw))
    throw new Error("missing-request-body");
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(raw, "base64"));
  const value = parsePolicyJson(decoded);
  if (!record(value)) throw new Error("invalid-request-body");
  return value;
}

function safeNetwork(config, policy) {
  const labels = field(config, "Labels");
  const opts = field(config, "Options");
  const ipam = field(config, "IPAM");
  const subnets = field(ipam, "Config");
  return (
    field(config, "Name") === policy.project &&
    field(config, "Driver") === "bridge" &&
    [undefined, false].includes(field(config, "Internal")) &&
    [undefined, false, null].includes(field(config, "EnableIPv6")) &&
    [undefined, false].includes(field(config, "Attachable")) &&
    [undefined, false].includes(field(config, "Ingress")) &&
    [undefined, "", "local"].includes(field(config, "Scope")) &&
    [undefined, ""].includes(field(field(config, "ConfigFrom"), "Network")) &&
    [undefined, false].includes(field(config, "ConfigOnly")) &&
    record(opts) &&
    Object.keys(opts).length === 1 &&
    opts[option] === "127.0.0.1" &&
    labels?.[runLabel] === policy.run &&
    record(ipam) &&
    Object.keys(ipam).every((key) => ["driver", "config", "options"].includes(key.toLowerCase())) &&
    [undefined, "", "default"].includes(field(ipam, "Driver")) &&
    emptyObject(field(ipam, "Options")) &&
    Array.isArray(subnets) &&
    subnets.length === 1 &&
    record(subnets[0]) &&
    Object.keys(subnets[0]).length === 2 &&
    field(subnets[0], "Subnet") === "172.30.0.0/24" &&
    field(subnets[0], "Gateway") === "172.30.0.1"
  );
}

function allowedBind(value, policy) {
  if (typeof value !== "string") return false;
  const [source, destination, mode, extra] = value.split(":");
  if (
    extra !== undefined ||
    !destination?.startsWith("/") ||
    ![undefined, "rw", "ro"].includes(mode)
  )
    return false;
  if (/^supabase_[a-z0-9_-]+$/.test(source)) return source.endsWith("_" + policy.project);
  if (!path.isAbsolute(source)) return false;
  const canonical = realpathSync(source);
  const projectPath = policy.workspace + "/supabase/";
  const runtimePath = policy.root + "/state/";
  return (
    (canonical.startsWith(projectPath) && mode === "ro") ||
    (canonical.startsWith(runtimePath) && !canonical.endsWith(".sock"))
  );
}

function safeContainer(config, policy) {
  const host = field(config, "HostConfig");
  if (!record(host) || field(host, "NetworkMode") !== policy.project) return false;
  if (
    ["Privileged", "PublishAllPorts", "OomKillDisable"].some(
      (name) => ![undefined, null, false].includes(field(host, name)),
    )
  )
    return false;
  if (
    [
      "Devices",
      "DeviceRequests",
      "DeviceCgroupRules",
      "CapAdd",
      "SecurityOpt",
      "Mounts",
      "VolumesFrom",
      "Links",
    ].some((name) => !emptyList(field(host, name)))
  )
    return false;
  if (["Sysctls", "StorageOpt", "Tmpfs"].some((name) => !emptyObject(field(host, name))))
    return false;
  if (
    ["PidMode", "UsernsMode", "UTSMode", "CgroupParent", "VolumeDriver"].some(
      (name) => ![undefined, null, ""].includes(field(host, name)),
    )
  )
    return false;
  if (
    ![undefined, "", "private"].includes(field(host, "IpcMode")) ||
    ![undefined, "", "private"].includes(field(host, "CgroupnsMode")) ||
    ![undefined, "", "runc"].includes(field(host, "Runtime"))
  )
    return false;
  const binds = field(host, "Binds");
  if (binds != null && (!Array.isArray(binds) || binds.some((bind) => !allowedBind(bind, policy))))
    return false;
  const endpoints = field(field(config, "NetworkingConfig"), "EndpointsConfig");
  if (
    endpoints != null &&
    (!record(endpoints) || Object.keys(endpoints).some((key) => key !== policy.project))
  )
    return false;
  const bindings = field(host, "PortBindings");
  if (bindings == null) return true;
  if (!record(bindings)) return false;
  for (const [key, mappings] of Object.entries(bindings)) {
    if (
      !/^\d{1,5}\/(tcp|udp)$/.test(key) ||
      !port(key.split("/")[0]) ||
      !Array.isArray(mappings) ||
      mappings.length === 0
    )
      return false;
    for (const mapping of mappings) {
      // CLI 2.117.0 omits HostIp. The policy authorizes only the single bridge
      // whose creation requires a v4 loopback default. The namespace also
      // prevents routing from the outer runner, independent of that default.
      if (
        !record(mapping) ||
        !port(field(mapping, "HostPort")) ||
        ![undefined, "", "127.0.0.1", "::1"].includes(field(mapping, "HostIp"))
      )
        return false;
    }
  }
  return true;
}

export function authorizeDocker(request, policy) {
  try {
    if (
      !policy ||
      !/^careconnect-ci-\d{1,20}-\d{1,6}$/.test(policy.project) ||
      policy.project !== "careconnect-ci-" + policy.run ||
      !policy.workspace ||
      !policy.root
    )
      return false;
    const method = field(request, "RequestMethod");
    const uri = field(request, "RequestUri");
    if (typeof uri !== "string" || !/^\/(?!\/)[^#\s]+$/.test(uri)) return false;
    const [route] = uri.split("?");
    if (route.includes("%") || route.includes("//") || route.includes("..")) return false;
    const endpoint = route.replace(/^\/v\d+\.\d+(?=\/)/, "");
    if (method === "GET" || method === "HEAD")
      return /^\/(?:_ping|version|info|events|containers(?:\/.*)?|images(?:\/.*)?|networks(?:\/.*)?|volumes(?:\/.*)?|exec\/[\w.-]+\/json)$/.test(
        endpoint,
      );
    if (method === "DELETE") return /^\/(?:containers|networks|volumes)\/[\w.-]+$/.test(endpoint);
    if (method === "PUT" && /^\/containers\/[a-f0-9]{64}\/archive$/.test(endpoint)) {
      // CLI 2.117 streams bootstrap config with docker cp before starting a
      // container. By construction, this daemon contains only this run's IDs.
      const params = new URLSearchParams(uri.split("?")[1]);
      const path = params.getAll("path");
      return (
        path.length === 1 &&
        path[0] === "/" &&
        Array.from(params).every(
          ([key, value]) =>
            key === "path" ||
            (["noOverwriteDirNonDir", "copyUIDGID"].includes(key) &&
              ["true", "false", "1", "0"].includes(value) &&
              params.getAll(key).length === 1),
        )
      );
    }
    if (method !== "POST") return false;
    if (endpoint === "/networks/create") return safeNetwork(body(request), policy);
    if (endpoint === "/containers/create") return safeContainer(body(request), policy);
    if (endpoint === "/volumes/create") {
      const config = body(request);
      return (
        /^supabase_[a-z0-9_-]+$/.test(field(config, "Name") ?? "") &&
        field(config, "Name").endsWith("_" + policy.project) &&
        [undefined, "", "local"].includes(field(config, "Driver")) &&
        emptyObject(field(config, "DriverOpts"))
      );
    }
    if (endpoint === "/images/create") {
      const params = new URLSearchParams(uri.split("?")[1]);
      return Boolean(params.get("fromImage")) && !params.has("fromSrc");
    }
    if (/^\/containers\/[\w.-]+\/exec$/.test(endpoint))
      return [undefined, false].includes(field(body(request), "Privileged"));
    return /^\/(?:containers\/[\w.-]+\/(?:start|stop|wait|kill|restart|attach)|exec\/[\w.-]+\/start)$/.test(
      endpoint,
    );
  } catch {
    return false;
  }
}

export function createAdmissionServer(policy) {
  return createServer({ requestTimeout: 10_000 }, async (req, res) => {
    let result = { Allow: false, Msg: "careconnect-admission-denied", Err: "" };
    try {
      if (req.method !== "POST") throw new Error("invalid-method");
      if (req.url === "/Plugin.Activate") {
        result = { Implements: ["authz"] };
        req.resume();
      } else if (req.url === "/AuthZPlugin.AuthZRes") {
        result = { Allow: true };
        req.resume();
      } else if (req.url === "/AuthZPlugin.AuthZReq") {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 2_000_000) throw new Error("request-too-large");
          chunks.push(chunk);
        }
        if (authorizeDocker(parsePolicyJson(Buffer.concat(chunks).toString("utf8")), policy))
          result = { Allow: true };
      }
    } catch {
      // Docker requests include environment credentials. Only fixed codes leave this process.
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [socket, project, run, workspace, root] = process.argv.slice(2);
  const server = createAdmissionServer({ project, run, workspace, root });
  server.listen(socket, () => chmodSync(socket, 0o600));
  server.on("error", () => {
    process.stderr.write("Docker admission listener failed.\n");
    process.exitCode = 1;
  });
}
