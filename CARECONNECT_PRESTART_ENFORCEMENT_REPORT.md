# CARECONNECT_PRESTART_ENFORCEMENT_REPORT

2026-11-06. **Verdict: `BLOCKED_BY_INFRASTRUCTURE_SAFETY`. No enforcement replacement was enabled.** The user confirmed that no independently owned disposable Linux Docker runner is available. The existing exit-78 boundary remains byte-for-byte unchanged. No real Docker startup, binding verification or Supabase bootstrap occurred.

## State and result

Authoritative root: `C:\Users\admin\Projects\care-connect-chennai`; branch: `claude/careconnect-frontend-repair`. Starting HEAD `697d0ecd1c08a32108d6ecbba54508700db72d3b` was clean. All 20 unpublished commits form a linear chain from verified remote base `a98f652ded60d6d17545a51b0224cf8d0cde3cd0`; none was amended, reset or otherwise rewritten. Only this CareConnect chat was active in the available inventory.

This phase changes **only this report**. Its documentation-only local commit SHA is recorded in the final handoff; the resulting unpublished count is 21. There is no new functional fix or admission-controller implementation to mistake for demonstrated runtime enforcement.

Local metadata showed Windows execution, SSH/WSL executables and Ubuntu/docker-desktop WSL distributions. Distribution names do not attest an independently owned engine, safe network or private diagnostic environment. No distribution was started and no Docker engine/resource inventory was queried. No infrastructure was installed, no images were pulled, and Docker Desktop/Video2Product were untouched. The original `.env` and existing Supabase link-marker contents were not read or changed.

## Exact problem and pinned CLI findings

The current block concerns **unproven pre-start publication enforcement**. It is separate from the earlier bootstrap failure after healthy Postgres; that underlying private error remains unavailable. Neither the internal bridge nor image preparation is established as the cause of that bootstrap failure.

Reviewed the actual `v2.117.0` source, including the native TypeScript startup path and retained Go counterpart. The tagged source commit previously resolved to `21db855916f2c2b12f61cde923a27094b8528b23`. The following is a source-derived API-operation map, **not an observed HTTP trace from an executed binary**. The API-version prefix is negotiated by the Docker client.

| Operation                       | Pinned implementation / Engine operation                                                                                                           | Security implication                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network/volume preparation      | Inspect or create the selected network and named volumes; logical `GET /networks/...`, `POST /networks/create`, volume inspection/creation         | Reusing an existing name is not an ownership lease; validate exact run identity and engine before adoption                                                                          |
| Long-running container creation | Native code builds `docker create`; equivalent `POST /containers/create`. Go directly calls ContainerCreate                                        | Enforcement must act before Docker accepts an unsafe publication, not after events announce creation/start                                                                          |
| PortBindings                    | The port formatter emits host-port/container-port pairs; the Postgres spec sets a numeric host port without a host address. Go leaves HostIp unset | The request delegates omitted-address behavior to Docker; it does not explicitly request 127.0.0.1 for each mapping                                                                 |
| Network attachment              | Native create arguments carry the chosen network and aliases; Go constructs HostConfig.NetworkMode / NetworkingConfig                              | Reject host/container networking, wrong/additional networks and unowned identities in any future admission design                                                                   |
| Secret setup and start          | Native flow may copy secret files into the created container, then calls `docker start`; logical archive upload and `POST /containers/{id}/start`  | A complete boundary must handle these operations privately and prevent starting unadmitted existing containers                                                                      |
| Restart                         | Postgres has `unless-stopped`; Go sets the same restart policy                                                                                     | Daemon-driven restarts need not traverse a new client create request. The original admitted binding/network configuration must remain safe and immutable under later API operations |
| One-shot setup                  | Fresh PG15+ setup runs enabled Realtime, Storage and Auth jobs sequentially, with lazy image resolution and the selected network                   | Portless jobs are valid only when their network/identity/privileges are authorized; omitting PortBindings is not universally erroneous for a genuinely unpublished job              |
| Failure/stop cleanup            | Container stop/removal and project-label-scoped container/volume/network pruning                                                                   | Empty, forged or adopted project identities must never broaden cleanup; partial failure is not permission to prune the engine                                                       |

Primary source: [create argument builder](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/docker-create-args.ts), [create/copy/start lifecycle](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/container-lifecycle.ts), [Postgres spec](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/postgres.service.ts), [setup jobs](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/db-setup.ts), [scoped cleanup](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-docker-remove-all.ts), and [Go Docker helper](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/internal/utils/docker.go).

The native path also provisions Vector with access to a Docker endpoint/socket for log collection. A replacement that protects only the CLI connection while leaving another unfiltered daemon socket reachable would not establish exclusive admission. A read-only socket mount is not a Docker API authorization policy. This is an architectural constraint, not a claim that Vector made an unsafe request. [Pinned Vector implementation](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/commands/start/services/vector.service.ts).

## Candidate evaluation and selected boundary

**A — Native per-network/per-container controls:** Docker documents a bridge default that supplies a host address when publishing omits one. That is useful prevention for qualifying requests on a verified engine/network; it is not a rule rejecting an explicitly requested wildcard. Explicit localhost publishing is supported. The documented older-than-28.0.0 localhost-reachability caveat also makes engine version relevant. An internal bridge is a separate control and does not prove host publication is safe. Native defaults alone therefore do not satisfy the requested adversarial wildcard-rejection contract, nor demonstrate behavior on the unavailable target runtime. [Docker bridge defaults](https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address), [port publishing](https://docs.docker.com/engine/network/port-publishing/).

**B — Dedicated isolated Linux engine:** This is the preferred prerequisite for verification and containment, not permission to allow wildcard bindings. It still needs enforced loopback publication and negative-request tests. The user explicitly answered **“No dedicated Linux runner available.”** Reusing Docker Desktop, the docker-desktop WSL distribution, or an unverified Ubuntu-to-Docker route would violate the requested isolation. No such attempt occurred.

**C — Controlled API admission:** A complete implementation would need exclusive daemon access; a default-deny API surface; consistent JSON decoding; validation of identity, attachments, ports, privileges/mounts, restart/update and cleanup; bounded handling of transport failure and cancellation; and private request/response handling. Docker's authorization interface can reject requests before processing, but its documented gRPC, streaming/upgrade and body-visibility limitations matter. A handwritten create-only proxy or PATH shim would not cover the full privilege/bypass surface. It also could not simply reject every omitted HostIp while claiming compatibility with this unmodified CLI. No proxy/plugin/listener, daemon configuration or privileged transport was introduced. [Docker authorization model and limitations](https://docs.docker.com/engine/extend/plugins_authorization/).

**Selected current architecture:** retain the existing mandatory fail-closed boundary. No candidate has been demonstrated to meet all requirements in the available environment. This follows the request's explicit fallback; it does not claim the primary startup-enablement objective was achieved.

## Validation actually executed

- Full script suite: **202 passed, 0 failed, 0 skipped**. Evidence: ignored `test-artifacts/prestart-review-script-tests.tap.log`.
- Safe unit suite: **23 passed, 0 failed**.
- Application TypeScript and test-code TypeScript: passed.
- ESLint: passed.
- Production build: passed using locked **Vite 8.3.5**, synthetic `.invalid` Supabase values, `CARECONNECT_ISOLATED_TEST=1`, the private-file-denial Node preload and Node-server preset. Hosted-target selector variables were removed only in the build child environment. No frontend server or real service was started. Existing non-fatal tsconfig-paths/plugin timing warnings remain.
- Relevant formatting and full unpublished diff integrity: recorded after report formatting. No application source or dependency changed; a full UI audit/browser rerun was not needed or claimed.
- Reviewed all 20 unpublished commits for ancestry and scanned **76 changed file versions**, with zero private-key/token/JWT signatures. Net diff: 48 files; largest changed file version 81,602 bytes, the pre-existing real-service runner. No tracked generated output, test artifact, node_modules, migration or package-lock change appeared. A bounded signature scan does not prove absence of every possible secret.

**New regression tests: none.** There is no new functioning admission mechanism to test. Existing runtime-assessment fixtures and exit-78 refusal tests were rerun, but they are not relabeled as pre-start enforcement tests. In particular, safe-create acceptance, real wildcard/missing-binding rejection before Docker acceptance, wrong-network/project/unowned rejection by an installed enforcer, Docker API error/partial-start/cancellation/cleanup behavior under that enforcer, and exclusive-access/no-environment-bypass proof remain **not executed against a replacement**. Creating a toy allow/deny function disconnected from the pinned CLI would not close this evidence gap.

## Runtime and integration status

| Required observation                                             | Result this phase                   |
| ---------------------------------------------------------------- | ----------------------------------- |
| Replacement enforcement deployed/demonstrated                    | No                                  |
| Real Docker container creation/startup                           | No                                  |
| Actual IPv4/IPv6 binding safety verified                         | No; not evaluated                   |
| Supabase bootstrap success/private underlying error              | Not attempted; unresolved           |
| Migration ledger, pgTAP, booking concurrency                     | Not executed against real services  |
| Auth identity, PostgREST, Storage, Realtime delivery             | Not executed against real services  |
| Patient, clinic, doctor, administrator service browser workflows | All unexecuted; release gate closed |

All four workflows match the unpublished range and expose manual dispatch. The three service jobs retain their unconditional required exit-78 boundary; their integration assertions remain intact. Independent static/mock frontend jobs remain available. Permissions remain `contents: read`; no deployment behavior was introduced. A future approved push would not make service checks green by itself.

## Exact missing prerequisite and next action

Provide a separately approved, independently owned disposable Linux Docker environment with private operator access, no hosted credentials or shared Docker socket, sufficient resources, and the ability to install/verify **exclusive pre-creation enforcement**. Then choose native controls only if they can meet the actual request contract; otherwise review a complete scoped admission design before deploying it. Do not waive binding or ownership requirements to fit the runtime.

Before changing `requireServicePreExposureIsolation`, demonstrate safe accepted requests plus denied wildcard IPv4/IPv6, missing required publication data, wrong network/project and unowned targets; failures/cancellation/cleanup must stay bounded and owned. Confirm setup-job compatibility and all daemon access paths. Verify actual bindings afterward as a second control. Only then run the ordered Supabase/migration/security/browser stages and inspect the exact private bootstrap error if startup fails. No further generalized observer is proposed.

No GitHub push, PR merge, deployment, hosted Supabase operation, destructive Git operation, worktree/clone creation, Docker-wide cleanup or Video2Product modification occurred. Publication remains **`BLOCKED_BY_INFRASTRUCTURE_SAFETY`**.
