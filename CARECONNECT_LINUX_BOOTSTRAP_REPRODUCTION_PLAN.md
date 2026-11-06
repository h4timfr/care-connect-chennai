# CARECONNECT_LINUX_BOOTSTRAP_REPRODUCTION_PLAN

2026-11-06. **Specification only; no Docker, Linux VM, Supabase startup, image pull or hosted project operation was executed in this phase.** Do not execute this on the Windows/shared Video2Product engine.

## Required runtime and present blocker

Use one separately approved ephemeral Ubuntu 24.04 x86-64 VM with a dedicated Docker engine and private operator console/SSH. It may serve as a one-job GitHub Actions runner, with genuine run ID/attempt values, then be destroyed. No shared Docker socket, remote Docker context, host filesystem mounts, hosted Supabase credentials, `.env`, project links or cloud instance credentials may enter the job. No public inbound service access; private operator access is the only ingress. VM perimeter controls supplement actual loopback checks and never substitute for them.

Budget 4 vCPU, 8 GiB RAM and at least 30 GiB free disk before preparing images, plus a 50 GiB system disk. This is a conservative provisioning budget, not a measured image-download size. Confirm the actual engine backing-store space, memory and image sizes before downloading; stop if insufficient. Existing Windows free space is not evidence of VM/Docker capacity.

No such approved, privately inspectable Linux runtime is connected to this session. The local Supabase CLI is not on PATH; the Windows/shared engine is explicitly excluded. Merely having GitHub Actions available does not demonstrate binding behavior or private access to raw output before runner disposal.

## Source-verified failure window

CLI tag `v2.117.0` resolves through its annotated tag to commit `21db855916f2c2b12f61cde923a27094b8528b23`. Review the [native startup handler](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/commands/start/start.handler.ts), [database startup](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/start-database.ts), [fresh setup](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/db-setup.ts), and retained [Go database implementation](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/internal/db/start/start.go). The tag contains both implementations; do not silently use the older repository path or assume every implementation detail is identical. Record the installed release binary's version and checksum privately.

The relevant order is:

1. Validate fresh/unlinked configuration, resolve enabled service images, ensure the selected network, check existing database volume, create/start Postgres, and await its health check.
2. On a fresh volume, establish a **host-facing database session** using the configured hostname and published database port. The health probe runs inside the container; it does not establish host connectivity. The native path retries dial errors; the retained Go path uses its configured connection timeout.
3. Emit the schema-initialization marker, resolve setup inputs/JWKS, then on PostgreSQL 15+ execute enabled one-shot jobs sequentially: Realtime, Storage, Auth. Each may perform lazy image resolution, joins the selected network and connects to Postgres through its container identity. A cached default-image candidate does not prove this later operation succeeded.
4. Apply remaining bootstrap database/webhook/API-privilege setup, vault values and optional local roles; only afterward apply project migrations/seeds and write branch state. Native and retained Go setup details differ; inspect the exact failed operation rather than inferring it from a generic marker.
5. Failure/interruption invokes project-scoped rollback. Subsequent kill, clean exit and destroy events can be consequences. A normal start or healthy-then-rollback is not independent evidence of Postgres startup failure.

Earlier sanitized evidence reported healthy Postgres and zero CareConnect migrations. That narrows the window but does not distinguish the host session, schema/job/image/setup operations. Missing raw errors remain the blocker. The custom internal bridge could affect host publishing/routing or service DNS/connectivity, but that is a hypothesis. Its `internal` flag does not itself prove that communication between members is broken. The Docker daemon's registry access is distinct from a service container's network egress.

## Reviewed runtime inputs and preflight

Transfer only an exact reviewed tracked-source bundle from the original commit, without a `.git` directory. This is disposable runtime input, not a development checkout. Include `package.json`/`package-lock.json`, the existing real-service runner and its imported scripts/integrity manifest, startup evidence/observer/binding scripts and tests, all 41 migrations and 22 SQL test files. Using all tracked `scripts/` as reviewed runtime input avoids omitting transitive imports; exclude credentials, local evidence, caches, build output, backups, `.env*`, `.temp` and link markers. Do not copy the original local configuration. For subsequent full service/browser execution, include reviewed `src`, tests, public assets and build configs only after startup diagnosis is understood.

Before **any container creation**, the operator must verify VM identity/ownership, dedicated engine endpoint/context, empty or entirely accounted-for container/network/volume inventory, absence of Video2Product, free resources, private log storage permissions, and no hosted secrets. Confirm no occupied ports in the freshly generated CLI configuration. Stop on ambiguity. Do not fake CI context variables to bypass existing runner-only guards.

Install the official CLI 2.117.0 release after checksum verification, Node 22 and `/usr/bin/psql`; use the lockfile (`npm ci`, no dependency upgrade). Inspect `supabase --help`, `supabase start --help`, and `supabase stop --help` privately to confirm flags. Initialize fresh configuration with `supabase init --yes`, retaining default enabled services for the first reproduction. No remote login/link operation is needed.

In a genuine approved one-job Actions environment, reuse the existing ownership/network controls:

```bash
set -euo pipefail
umask 077
export CARECONNECT_DOCKER_NETWORK="careconnect-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
export CARECONNECT_DOCKER_RUN_LABEL="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
mkdir -p test-artifacts
node scripts/real-service-integration.mjs preflight
node scripts/startup-evidence.mjs configure "$CARECONNECT_DOCKER_NETWORK" supabase/config.toml
node scripts/startup-evidence.mjs before "$CARECONNECT_DOCKER_NETWORK" test-artifacts/startup-images-before.json
node scripts/verify-disposable-docker-bindings.mjs create \
  "$CARECONNECT_DOCKER_NETWORK" "$CARECONNECT_DOCKER_RUN_LABEL" \
  test-artifacts/docker-network-summary.json "$RUNNER_TEMP/careconnect-docker-network-owned.json"
```

Network creation must verify internal bridge, IPv6 direct routing disabled, exact run label and `host_binding_ipv4=127.0.0.1`. A collision aborts; never adopt existing resources.

## Demonstrate actual binding before Supabase startup

On this dedicated VM only, use the pinned Postgres image as a short-lived **sleep-only canary**: uniquely named `supabase_db_<project>`, exact project/run labels, expected network, no user mounts, and the same unspecified-HostIp publish syntax used by the CLI. This canary exposes no application process. Prepare that pinned image only after storage approval/preflight. Capture its exact returned container ID privately and validate its name, both labels and sole network attachment before every inspection/removal.

Register owned-resource cleanup before creating the canary. After the private operator selects the reviewed pinned Postgres image into `POSTGRES_IMAGE`, the canary command shape is:

```bash
canary_name="supabase_db_${CARECONNECT_DOCKER_NETWORK}"
docker create --name "$canary_name" \
  --label "com.supabase.cli.project=$CARECONNECT_DOCKER_NETWORK" \
  --label "com.careconnect.disposable-real-service-run=$CARECONNECT_DOCKER_RUN_LABEL" \
  --network "$CARECONNECT_DOCKER_NETWORK" --publish 54322:5432 \
  --entrypoint /bin/sh "$POSTGRES_IMAGE" -c 'sleep 120' \
  >"$RUNNER_TEMP/careconnect-canary-id.private"
```

Validate the returned ID/labels/name/network, then start that exact container. Invoke the existing `verify-disposable-docker-bindings.mjs verify <network> supabase/config.toml test-artifacts/docker-canary-summary.json <run-label> success`. This separate canary evidence must never be presented as successful Supabase startup. Check every actual IPv4/IPv6 mapping and relevant `ss -H -lnut` listener. Empty/unknown HostIp, wildcard/non-loopback mappings, ambiguous listener parsing, extra attachments or an unowned resource fail closed. Network defaults and a firewall alone are insufficient. If unsafe, remove only this positively identified sleep canary and its own anonymous volumes, stop, and destroy the approved VM; do not start Supabase or try arbitrary network changes.

After a pass, remove only the canary by its verified ID (including anonymous volumes created for it), verify its absence and an empty owned network, and verify that no other project container/volume appeared. Keep the positively identified owned network and startup ownership markers; do not rerun the initial no-network collision check against that deliberately existing network. The same actual-binding gate must run again on the real stack; a canary is not proof that future containers cannot override HostIp. This procedure is specified, **not executed/validated here**.

## One focused startup and private inspection

Use the existing bounded observer once; it already runs the exact command `supabase --debug --network-id <network> start`. Do not add another observer or new signature framework.

```bash
if timeout --signal=TERM --kill-after=15s 600s \
  node scripts/startup-observer.mjs run "$CARECONNECT_DOCKER_NETWORK" "$CARECONNECT_DOCKER_NETWORK"; then
  observer_status=0
else
  observer_status=$?
fi
```

Preserve the actual CLI status from `test-artifacts/startup-process.json` separately from the observer/timeout status. The existing raw debug file is `$RUNNER_TEMP/careconnect-supabase-start.raw.log`, created exclusively with mode 0600 and bounded at 32 MiB. Read it only through the private operator console/editor before teardown/VM destruction. Do not `cat`, upload, paste or put it into an Actions step summary. Do not route it through a remote assistant/tool output. If truncated or unavailable, record that limit and stop rather than inventing a category.

Review the first causal error **before rollback**, then map it to the source operation: host dial/auth/session; schema SQL; lazy image resolution; Realtime/Storage/Auth one-shot setup; Docker creation/attachment; or post-job database setup. Record only a manually reviewed category, service alias, numeric exit/status/SQLSTATE where available, and operation name. Do not export connection strings, commands containing secret arguments, JWTs, environment values, payloads or raw Docker metadata. One-shot job stdout may be discarded by the CLI; debug stderr and the outer error may still be insufficient. Removed containers cannot be inspected afterward. If that occurs, the next step is a separately scoped private reproduction of the identified job, not another general observer.

Before cleanup, run the existing sanitized `startup-evidence.mjs after` with the actual startup outcome. Run the binding verifier with `success` only if startup succeeded; failure/cancellation is `NOT_EVALUATED — stack unavailable`, never a pass. No migration-ledger query, API fixture request, Auth/Realtime test or browser workflow runs on startup/gate failure. Supabase's own fresh startup may apply migrations internally after bootstrap; the gate precedes all separate integration-runner traffic.

## Bounded cleanup and failure handling

Register EXIT/INT/TERM handling before startup and an Actions `always()` cleanup step. Keep a private start-attempted marker, reap only the observer whose marker and `/proc` command line match this project, then run bounded `supabase --network-id <network> stop --no-backup` from this fresh runtime configuration (180 seconds plus 15-second kill grace). Its output remains private.

The CLI can roll back with **exact project-label-scoped** container/volume/network cleanup. The project identity must therefore be unique and nonempty, with a verified clear baseline. Never substitute an empty project label or run Docker-wide prune. Any additional removal requires exact ID, project label, reviewed service/name and sole expected-network ownership; never infer ownership from a loose name prefix. Remove the custom network only via the existing ownership marker/label/ID checks and only when empty. Verify no run-owned containers/volumes/networks remain. On mismatch, preserve private evidence and stop cleanup rather than touching another resource. For an owned disposable VM, destruction after reviewed evidence retention is the final containment backstop if process termination bypasses traps.

The experiment ends after one privately reviewed startup. A confirmed correction gets its own regression and one affected rerun. Only after startup and binding verification pass should the existing workflow execute migration integrity/ledger, pgTAP, booking concurrency, real Auth/PostgREST/Storage/Realtime and all four browser workflows. No automatic repeat loop, service-role subscriber workaround, RLS change or timeout increase is part of this plan.
