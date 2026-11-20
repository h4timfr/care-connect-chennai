
#!/usr/bin/env bash
# One GitHub-hosted job owns this daemon, its namespace and its temporary state.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_API_VERSION

blocked() { printf 'Service isolation BLOCKED (%s).\n' "$stage" >&2; exit 78; }
stage=runner-identity
[[ ( $# == 7 || $# == 8 ) && "$(id -u)" == 0 && "$1" =~ ^[0-9]{1,20}-[0-9]{1,6}$ ]] || blocked
run=$1 uid=$2 gid=$3 workspace=$4 node=$5 supabase=$6 browser_cache=$7
mode=${8:-real-service}
[[ "$mode" == real-service || "$mode" == reconciliation ]] || blocked
[[ "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ && "$uid" != 0 && "${SUDO_UID:-}" == "$uid" && "${SUDO_GID:-}" == "$gid" ]] || blocked
[[ "$workspace" == "$(realpath -- "$workspace")" && "$(stat -c %u -- "$workspace")" == "$uid" ]] || blocked
for bin in "$node" "$supabase"; do
  [[ "$bin" == /* && -f "$bin" && -x "$bin" ]] || blocked
done
[[ "$browser_cache" == /* && -d "$browser_cache" ]] || blocked
stage=platform-prerequisites
[[ $(uname -s) == Linux ]] || { stage=platform-os; blocked; }
[[ $(ps -p 1 -o comm=) == systemd ]] || { stage=platform-pid1; blocked; }
for tool in docker dockerd containerd ip ss slirp4netns systemd-run systemctl setpriv timeout curl unshare mount; do
  command -v "$tool" >/dev/null || { stage="platform-command-$tool"; blocked; }
done
cli_version=$(PATH="$(dirname "$node"):$PATH" "$supabase" --version 2>/dev/null) ||
  { stage=platform-supabase-version-command; blocked; }
[[ "$cli_version" == 2.117.0 ]] || { stage=platform-supabase-version-mismatch; blocked; }
group=$(getent group "$gid" | cut -d: -f1) || { stage=platform-group-lookup; blocked; }
[[ "$group" =~ ^[a-zA-Z_][a-zA-Z_0-9-]*$ ]] || { stage=platform-group-format; blocked; }

root=$(mktemp -d /var/tmp/careconnect-ci.XXXXXXXX)
nonce=${root##*.}
ns="cc-$nonce"
project="careconnect-ci-$run"
plugin_unit="$ns-admission.service"
slirp_unit="$ns-egress.service"
daemon_unit="$ns-docker.service"
net_created=0
plugin_started=0
slirp_started=0
daemon_started=0
socket="unix://$root/engine.sock"
plugin_dir="$root/plugins"
d() { timeout 90s /usr/bin/docker --config "$root/docker-cli" --host "$socket" "$@"; }
empty_containers() {
  local ids
  ids=$(d ps -aq 2>/dev/null) && [[ -z "$ids" ]]
}

stop_owned_unit() {
  local unit=$1 state
  if systemctl stop "$unit" >/dev/null 2>&1; then return 0; fi
  # With --collect, an already dead unit may have no record left to stop.
  state=$(systemctl show --property=LoadState --value "$unit" 2>/dev/null) || return 1
  [[ "$state" == not-found ]]
}

stop_units() {
  local rc=$? cleanup_rc=0
  trap - EXIT
  set +e
  if (( daemon_started )); then stop_owned_unit "$daemon_unit" || cleanup_rc=1; fi
  if (( plugin_started )); then stop_owned_unit "$plugin_unit" || cleanup_rc=1; fi
  if (( slirp_started )); then stop_owned_unit "$slirp_unit" || cleanup_rc=1; fi
  if (( net_created )); then
    local remaining
    if ! remaining=$(ip netns pids "$ns" 2>/dev/null) || [[ -n "$remaining" ]]; then
      cleanup_rc=1
    else
      ip netns delete "$ns" >/dev/null 2>&1 || cleanup_rc=1
      [[ ! -e "/run/netns/$ns" ]] || cleanup_rc=1
    fi
  fi
  for unit in "$daemon_unit" "$plugin_unit" "$slirp_unit"; do
    if systemctl is-active --quiet "$unit"; then cleanup_rc=1; fi
  done
  if (( cleanup_rc == 0 )); then
    if [[ "$root" =~ ^/var/tmp/careconnect-ci\.[a-zA-Z0-9]{8}$ && ! -L "$root" && "$(stat -c %u -- "$root")" == 0 && "$(realpath -- "$root")" == "$root" ]]; then
      rm -rf --one-file-system -- "$root" || cleanup_rc=1
      [[ ! -e "$root" ]] || cleanup_rc=1
    else
      cleanup_rc=1
    fi
  fi
  if (( cleanup_rc )); then
    printf 'Private daemon shutdown or resource removal failed.\n' >&2
    exit 1
  fi
  printf 'Private daemon, egress process, namespace and run state removed.\n'
  exit "$rc"
}
trap stop_units EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
chmod 0711 "$root"
mkdir "$plugin_dir" "$root/docker-cli" "$root/state" "$root/home"
chmod 0700 "$plugin_dir"
chmod 0755 "$root/docker-cli"
chown "$uid:$gid" "$root/state" "$root/home"
chmod 0700 "$root/state" "$root/home"
printf 'nameserver 10.0.2.3\n' >"$root/resolv.conf"
printf '{}\n' >"$root/daemon.json"

stage=namespace
[[ ! -e "/run/netns/$ns" ]] || blocked
ip netns add "$ns" 2>/dev/null || blocked
net_created=1
ip -n "$ns" link set lo up 2>/dev/null || blocked
net_inode=$(ip netns exec "$ns" readlink /proc/self/ns/net)
[[ "$net_inode" =~ ^net:\[[0-9]+\]$ && "$net_inode" != "$(readlink /proc/self/ns/net)" ]] || blocked
# Slirp provides outbound registry access without any host port-forward API.
stage=outbound-transport
systemd-run --quiet --collect --unit="$slirp_unit" -p RuntimeMaxSec=75m -p TimeoutStopSec=15s \
  unshare --mount --propagation private slirp4netns --configure --disable-host-loopback --enable-sandbox --enable-seccomp \
  --netns-type=path "/run/netns/$ns" tap0 >/dev/null 2>&1 || blocked
slirp_started=1
for _ in {1..40}; do
  ip -n "$ns" -4 address show dev tap0 2>/dev/null | grep -Fq '10.0.2.100/24' && break
  sleep 0.25
done
[[ "$(ip -n "$ns" -o link show | awk -F': ' '{print $2}' | sort | paste -sd,)" == lo,tap0 ]] || blocked
ip -n "$ns" -4 address show dev tap0 | grep -Fq '10.0.2.100/24' || blocked
ip -n "$ns" -6 address show dev lo | grep -Fq '::1/128' || blocked
[[ -z "$(ip -n "$ns" -6 route show default)" ]] || blocked
systemctl is-active --quiet "$slirp_unit" || blocked

stage=policy-plugin
cp -- "$workspace/scripts/ci-docker-admission.mjs" "$root/admission.mjs"
systemd-run --quiet --collect --unit="$plugin_unit" -p RuntimeMaxSec=75m -p TimeoutStopSec=15s \
  -p RestrictAddressFamilies=AF_UNIX -p NoNewPrivileges=yes \
  "$node" "$root/admission.mjs" "$plugin_dir/careconnect-ci-admission.sock" \
    "$project" "$run" "$workspace" "$root" >/dev/null 2>&1 || blocked
plugin_started=1
for _ in {1..40}; do
  [[ -S "$plugin_dir/careconnect-ci-admission.sock" ]] && break
  sleep 0.25
done
if [[ ! -S "$plugin_dir/careconnect-ci-admission.sock" ]]; then
  result=$(systemctl show --property=Result --value "$plugin_unit" 2>/dev/null) || result=unavailable
  case "$result" in
    exit-code|signal|resources|timeout|unavailable) printf 'Admission unit status: %s.\n' "$result" >&2 ;;
  esac
  blocked
fi

stage=private-engine
systemd-run --quiet --collect --unit="$daemon_unit" -p RuntimeMaxSec=75m -p TimeoutStopSec=45s \
  -p KillMode=control-group \
  -p "NetworkNamespacePath=/run/netns/$ns" \
  -p "TemporaryFileSystem=/run/docker" \
  -p "BindReadOnlyPaths=$plugin_dir:/run/docker/plugins $root/resolv.conf:/etc/resolv.conf" \
  /bin/bash -ec '
    root=$1
    shift
    containerd_socket="$root/exec/containerd/containerd.sock"
    mkdir -m 0700 "$root/containerd-data" "$root/containerd-state"
    mkdir -p -m 0700 "$root/exec/containerd"
    printf "version = 2\n" >"$root/containerd.toml"
    containerd --config "$root/containerd.toml" --address "$containerd_socket" \
      --root "$root/containerd-data" --state "$root/containerd-state" &
    containerd_pid=$!
    printf "%s\n" "$containerd_pid" >"$root/containerd.pid"
    for _ in {1..40}; do
      kill -0 "$containerd_pid"
      if [[ -S "$containerd_socket" ]]; then
        exec dockerd --containerd="$containerd_socket" "$@"
      fi
      sleep 0.25
    done
    exit 78
  ' careconnect "$root" --config-file="$root/daemon.json" --host="$socket" --group="$group" \
  --data-root="$root/data" --exec-root="$root/exec" --pidfile="$root/dockerd.pid" \
  --bridge=none --ip=127.0.0.1 --host-gateway-ip=172.30.0.1 --authorization-plugin=careconnect-ci-admission \
  >/dev/null 2>&1 || blocked
daemon_started=1
for _ in {1..60}; do
  if [[ -S "$root/engine.sock" ]] && timeout 2s /usr/bin/docker --host "$socket" version --format '{{.Server.Version}}' >/dev/null 2>&1; then break; fi
  sleep 0.5
done
engine_pid=$(systemctl show --property=MainPID --value "$daemon_unit")
[[ "$engine_pid" =~ ^[1-9][0-9]*$ && "$(readlink "/proc/$engine_pid/ns/net")" == "$net_inode" ]] || blocked
containerd_pid=$(cat "$root/containerd.pid") || blocked
containerd_socket="$root/exec/containerd/containerd.sock"
[[ "$containerd_pid" =~ ^[1-9][0-9]*$ && "$(cat "/proc/$containerd_pid/comm")" == containerd ]] || blocked
[[ "$(readlink -f "/proc/$containerd_pid/exe")" == "$(readlink -f "$(command -v containerd)")" ]] || blocked
[[ "$(readlink "/proc/$containerd_pid/ns/net")" == "$net_inode" &&
   "$(readlink "/proc/$containerd_pid/ns/mnt")" == "$(readlink "/proc/$engine_pid/ns/mnt")" ]] || blocked
cmp -s "/proc/$containerd_pid/cgroup" "/proc/$engine_pid/cgroup" || blocked
[[ -S "$containerd_socket" && ! -L "$containerd_socket" && "$(stat -c %u "$containerd_socket")" == 0 ]] || blocked
tr '\0' '\n' <"/proc/$engine_pid/cmdline" | grep -Fx -- "--containerd=$containerd_socket" >/dev/null || blocked
[[ -S "$root/engine.sock" && ! -L "$root/engine.sock" && "$(stat -c %u "$root/engine.sock")" == 0 ]] || blocked
version=$(d version --format '{{.Server.Version}}' 2>/dev/null) || blocked
[[ "$version" =~ ^([0-9]+)\. && ${BASH_REMATCH[1]} -ge 28 ]] || blocked
[[ "$(d info --format '{{json .Plugins.Authorization}}' 2>/dev/null)" == '["careconnect-ci-admission"]' ]] || blocked
engine_id=$(d info --format '{{.ID}}' 2>/dev/null) || blocked
[[ "$engine_id" =~ ^[a-zA-Z0-9:.-]+$ ]] || blocked
empty_containers || blocked
volumes=$(d volume ls -q 2>/dev/null) || blocked
[[ -z "$volumes" ]] || blocked
[[ "$(d network ls --format '{{.Name}}' | sort | paste -sd,)" == host,none ]] || blocked

cd -- "$workspace"
user_phase() {
  # Mask shared Docker/containerd sockets, including pathname Unix sockets which
  # Linux network namespaces alone do not isolate. Clear supplementary groups.
  ip netns exec "$ns" unshare --mount --propagation private /bin/bash -ec '
    mount -t tmpfs -o nodev,nosuid,noexec,mode=755 tmpfs /run
    [[ ! -S /var/run/docker.sock && ! -S /run/containerd/containerd.sock ]]
    exec "$@"
  ' careconnect setpriv --reuid="$uid" --regid="$gid" --clear-groups --no-new-privs \
    env -i "PATH=$(dirname "$node"):$(dirname "$supabase"):/usr/bin:/bin" "HOME=$root/home" \
    "RUNNER_TEMP=$root/state" "TMPDIR=$root/state" DO_NOT_TRACK=1 "PLAYWRIGHT_BROWSERS_PATH=$browser_cache" \
    CI=true GITHUB_ACTIONS=true "GITHUB_RUN_ID=${run%-*}" "GITHUB_RUN_ATTEMPT=${run##*-}" \
    "DOCKER_HOST=$socket" "DOCKER_CONFIG=$root/docker-cli" "CARECONNECT_ISOLATION_ROOT=$root" \
    "CARECONNECT_DOCKER_NETWORK=$project" "CARECONNECT_DOCKER_RUN_LABEL=$run" \
    /bin/bash "$workspace/scripts/ci-real-service-phase.sh" "$1" "$mode"
}
printf '{"project":"%s","namespace":"%s","engine":"%s","policy":"careconnect-ci-admission"}\n' \
  "$project" "$net_inode" "$engine_id" >"$root/provisioned.json"
chmod 0444 "$root/provisioned.json"
stage=network-policy
user_phase prepare || blocked
empty_containers || blocked
stage=live-admission-controls
# This pinned non-Supabase canary is used before any Supabase container.
canary=docker.io/library/busybox:1.36.1
timeout 180s /usr/bin/docker --config "$root/docker-cli" --host "$socket" pull "$canary" >"$root/canary.raw" 2>&1 || blocked
for binding in '0.0.0.0:48480:8080' '10.0.2.100:48480:8080' '[::]:48480:8080'; do
  if d create --network "$project" --publish "$binding" "$canary" true >"$root/canary.raw" 2>&1; then blocked; fi
  grep -Fq 'careconnect-admission-denied' "$root/canary.raw" || blocked
  empty_containers || blocked
done
if d create --network host "$canary" true >"$root/canary.raw" 2>&1; then blocked; fi
grep -Fq 'careconnect-admission-denied' "$root/canary.raw" || blocked
empty_containers || blocked
# Same omitted-IP form used by CLI 2.117.0. Check reachability from inside
# and outside plus the actual effective socket mapping.
stage=canary-image-metadata
driver=$(d info --format '{{.Driver}}') || blocked
image_metadata=$(d image inspect --format '[{{json .RepoDigests}},{{json .Architecture}},{{json .RootFS}}]' "$canary") || blocked
printf '%s\n' "$image_metadata" | "$node" --input-type=module -e '
  import { readFileSync } from "node:fs";
  const [digests, architecture, rootfs] = JSON.parse(readFileSync(0, "utf8"));
  const digest = /^sha256:[a-f0-9]{64}$/;
  const manifests = digests.map((entry) => entry.split("@").at(-1));
  const driver = process.argv[1];
  if (!manifests.length || manifests.length > 8 || !manifests.every((value) => digest.test(value)) ||
      !["amd64", "arm64"].includes(architecture) ||
      rootfs.Type !== "layers" || !Array.isArray(rootfs.Layers) ||
      !rootfs.Layers.length || rootfs.Layers.length > 16 ||
      !rootfs.Layers.every((value) => digest.test(value))) process.exit(1);
  console.log(JSON.stringify({
    canary_manifest_digests: manifests, architecture, rootfs_layers: rootfs.Layers,
    storage_driver: ["overlay2", "overlayfs", "vfs", "fuse-overlayfs", "btrfs", "zfs"].includes(driver) ? driver : "other",
  }));
' "$driver" 2>/dev/null || blocked

stage=canary-filesystem
probe=$(d create --network "$project" -p 48480:8080 "$canary" /bin/busybox httpd -f -p 8080) || blocked
[[ "$probe" =~ ^[a-f0-9]{64}$ ]] || blocked
if ! d export --output "$root/canary.tar" "$probe" ||
   ! tar -tf "$root/canary.tar" >"$root/canary-files.raw"; then
  printf 'Canary exported filesystem: unavailable.\n'
  blocked
fi
if ! grep -Exq '(\./)?bin/busybox' "$root/canary-files.raw"; then
  printf 'Canary exported filesystem: bin/busybox absent.\n'
  blocked
fi
printf 'Canary exported filesystem: bin/busybox present.\n'
rm -- "$root/canary.tar" "$root/canary-files.raw" || blocked
stage=live-admission-controls
merged=$(d inspect --format '{{with index . "GraphDriver"}}{{with index . "Data"}}{{index . "MergedDir"}}{{end}}{{end}}' "$probe") || blocked
"$node" --input-type=module - "$root" "$engine_pid" "$probe" "$merged" "$driver" <<'JS' || blocked
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";

const [root, engine, probe, merged, driver] = process.argv.slice(2);
function read(operation, fallback) {
  try { return operation(); } catch { return fallback; }
}
const namespace = (pid) => {
  const value = read(() => readlinkSync(`/proc/${pid}/ns/mnt`), "");
  return /^mnt:\[\d+\]$/.test(value) ? value : "unavailable";
};
const mergedPath = merged.startsWith(root + "/data/overlay2/") &&
  /^[a-f0-9]+\/merged$/.test(merged.slice((root + "/data/overlay2/").length));
if (driver === "overlay2" && !mergedPath) {
  console.error("Canary overlay2 mount path could not be verified.");
  process.exit(1);
}
function rootfs(pid) {
  if (!mergedPath) return "unavailable";
  const mounts = read(() => readFileSync(`/proc/${pid}/mountinfo`, "utf8"), "");
  if (!mounts) return "unavailable";
  if (!mounts.split("\n").some((line) => line.split(" ")[4] === merged)) return "not_mounted";
  return existsSync(`/proc/${pid}/root${merged}/bin/busybox`) ? "mounted_and_visible" : "mounted_file_missing";
}
const socketType = (address) => {
  if (address === root + "/exec/containerd/containerd.sock") return "run_owned";
  if (["/run/containerd/containerd.sock", "/var/run/containerd/containerd.sock"].includes(address)) return "host_default";
  return address ? "other" : "unavailable";
};
const observations = new Map();
let verifiedShim = false;
function hostContainerd(pids) {
  const sockets = read(() => readFileSync("/proc/1/net/unix", "utf8"), "").split("\n");
  const listeners = sockets.map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[3] === "00010000" && /^\d+$/.test(fields[6]) &&
      socketType(fields[7]) === "host_default")
    .map((fields) => `socket:[${fields[6]}]`);
  return pids.find((pid) => read(() => readdirSync(`/proc/${pid}/fd`), []).slice(0, 512)
    .some((fd) => listeners.includes(read(() => readlinkSync(`/proc/${pid}/fd/${fd}`), ""))));
}
function observe() {
  const daemon = { mount: namespace(engine), canary_rootfs: rootfs(engine) };
  let containerd = { mount: "unavailable", canary_rootfs: "unavailable" };
  let shim = { mount: "unavailable", canary_rootfs: "unavailable" };
  let socket = "unavailable";
  const containerdPids = [];
  for (const pid of read(() => readdirSync("/proc"), []).filter((entry) => /^\d+$/.test(entry)).slice(0, 4096)) {
    const comm = read(() => readFileSync(`/proc/${pid}/comm`, "utf8").trim(), "");
    if (comm !== "containerd" && comm !== "containerd-shim") continue;
    if (comm === "containerd") containerdPids.push(pid);
    const args = read(() => readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0"), []);
    if (comm === "containerd" && args.includes(root + "/containerd.toml")) {
      containerd = { mount: namespace(pid), canary_rootfs: rootfs(pid) };
      if (socket === "unavailable" && existsSync(`/proc/${pid}/root${root}/exec/containerd/containerd.sock`)) {
        socket = "run_owned_listener";
      }
    }
    if (comm === "containerd-shim" && args[args.indexOf("-id") + 1] === probe) {
      shim = { mount: namespace(pid), canary_rootfs: rootfs(pid) };
      socket = socketType(args[args.indexOf("-address") + 1]);
    }
  }
  if (socket === "host_default") {
    const pid = hostContainerd(containerdPids);
    containerd = pid ? { mount: namespace(pid), canary_rootfs: rootfs(pid) }
      : { mount: "unavailable", canary_rootfs: "unavailable" };
  }
  if (socket === "run_owned" && daemon.mount !== "unavailable" &&
      daemon.mount === containerd.mount && daemon.mount === shim.mount &&
      (!mergedPath || [daemon, containerd, shim].every(({ canary_rootfs }) => canary_rootfs === "mounted_and_visible"))) {
    verifiedShim = true;
  }
  const row = JSON.stringify({ dockerd: daemon, containerd, shim, containerd_socket: socket });
  if (observations.size < 12) observations.set(row, true);
}
observe();
const child = spawn("/usr/bin/timeout", ["90s", "/usr/bin/docker",
  "--config", root + "/docker-cli", "--host", "unix://" + root + "/engine.sock",
  "start", probe], { stdio: ["ignore", "ignore", "inherit"] });
const timer = setInterval(observe, 10);
const deadline = setTimeout(() => clearInterval(timer), 3000);
child.on("close", (code) => {
  clearInterval(timer);
  clearTimeout(deadline);
  observe();
  for (const row of observations.keys()) console.log("Canary mount observation " + row);
  process.exitCode = code === 0 && verifiedShim ? 0 : 1;
});
JS
[[ "$(d port "$probe" 8080/tcp)" == 127.0.0.1:48480 ]] || blocked
if curl --noproxy '*' -sS --max-time 2 http://127.0.0.1:48480 > /dev/null 2>&1 ||
   curl --noproxy '*' -sS --max-time 2 'http://[::1]:48480' > /dev/null 2>&1; then blocked; fi
for _ in {1..12}; do
  if ip netns exec "$ns" curl --noproxy '*' -sS --max-time 2 http://127.0.0.1:48480 >/dev/null 2>&1; then break; fi
  sleep 0.25
done
ip netns exec "$ns" curl --noproxy '*' -sS --max-time 2 http://127.0.0.1:48480 >/dev/null 2>&1 || blocked
# The TAP address is the only non-loopback interface with egress before stack startup.
if ip netns exec "$ns" curl --noproxy '*' -sS --max-time 2 http://10.0.2.100:48480 >/dev/null 2>&1; then blocked; fi
d rm -f "$probe" >/dev/null 2>&1 || blocked
empty_containers || blocked

# Root controls this receipt. Child scripts recheck the actual namespace,
# target socket, Engine identity and active plugin before each service entry.
printf '{"project":"%s","namespace":"%s","engine":"%s","policy":"careconnect-ci-admission"}\n' \
  "$project" "$net_inode" "$engine_id" >"$root/verified.json"
chmod 0444 "$root/verified.json"
printf '{"status":"PASS","denied_before_create":["ipv4-wildcard","ipv4-non-loopback","ipv6-wildcard","host-network"],"published_canary":"127.0.0.1","outer_ipv4_reachable":false,"outer_ipv6_reachable":false,"tap_ipv4_reachable":false,"containers_before_supabase":0}\n' >"$root/pre-start-proof.json"
chmod 0444 "$root/pre-start-proof.json"
printf 'Pre-start Docker policy verified against four unsafe requests and one live loopback canary.\n'
stage=service-startup
rc=0
user_phase start || rc=$?
if (( rc == 0 )); then
  stage=remove-registry-egress
  # Cache the real pg_prove client before disconnecting external transport.
  if timeout 180s /usr/bin/docker --config "$root/docker-cli" --host "$socket" \
    pull public.ecr.aws/supabase/pg_prove:3.36 >"$root/pgtap-image.raw" 2>&1 &&
    systemctl stop "$slirp_unit" >/dev/null 2>&1 &&
    ! systemctl is-active --quiet "$slirp_unit" &&
    routes4=$(ip -n "$ns" -4 route show default 2>/dev/null) &&
    routes6=$(ip -n "$ns" -6 route show default 2>/dev/null) &&
    [[ -z "$routes4" && -z "$routes6" ]] && ! ip -n "$ns" link show tap0 >/dev/null 2>&1; then
    user_phase test || rc=$?
  else
    printf 'Service integration BLOCKED (cannot verify egress removal or pgTAP preload).\n' >&2
    rc=78
  fi
fi
if ! user_phase cleanup; then rc=1; fi
# CLI cleanup must leave no containers, including ones from interrupted startup.
if ! empty_containers; then
  printf 'Private stack container cleanup could not be verified.\n' >&2
  rc=1
fi
exit "$rc"
