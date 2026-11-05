# CARECONNECT — Secure CI and Realtime Failure Report

**Status: release gate remains closed.** The local fixes and non-service validations pass, but the guarded disposable CI workflow has not run with these changes, so authorized Realtime delivery, unauthorized-event isolation, the four browser workflows, and CI cleanup remain unverified.

## Repository state

- Repository: `h4timfr/care-connect-chennai`
- Branch: `claude/careconnect-frontend-repair`
- Published remote HEAD at inspection: `205b303f67e7b55887de04f78e0be137eb78adf5`
- Existing local Realtime correction: `61ede1a337e85fa3f788f601fc16fed2daf70eec`
- This phase's verified CI guard commit: `75cdbfe5cc6e3bca01bc7dd30d617e1a17df9aa6`
- The branch was clean before this phase and one commit ahead of remote. After the CI guard commit it was two commits ahead; this report is a separate documentation-only follow-on commit. No published commit was rewritten.

## Run and artifact evidence

Run [41958210550](https://github.com/h4timfr/care-connect-chennai/actions/runs/41958210550) ran commit `205b303f67e7b55887de04f78e0be137eb78adf5` on `ubuntu-24.04`. Its job logs show 41 migrations, 22 pgTAP files / 493 assertions, and 9 booking concurrency scenarios passed. The real-service summary reports 67 service assertions passed, zero assertions failed, one failed integration suite, and four blocked browser workflows. Realtime/Auth shutdown and fixture cleanup passed.

The sanitized artifact was `careconnect-real-service-41958210550` (artifact `13383089782`). It records:

| Role              | Session identity         | Auth API probe                             | Realtime status                                 | Row visibility | Delivery    |
| ----------------- | ------------------------ | ------------------------------------------ | ----------------------------------------------- | -------------- | ----------- |
| patient           | matched                  | rejected, HTTP 400, sanitized code `other` | `SUBSCRIBED`, then `CLOSED`; readiness true     | not checked    | not started |
| clinic staff      | matched                  | accepted                                   | `SUBSCRIBED`, then `CLOSED`; readiness true     | not checked    | not started |
| doctor            | matched                  | accepted                                   | `SUBSCRIBED`, then `CLOSED`; readiness true     | not checked    | not started |
| unrelated patient | matched                  | accepted                                   | `SUBSCRIBED`, then `CLOSED`; readiness true     | not checked    | not started |
| anonymous         | no authenticated session | not checked                                | `CHANNEL_ERROR`, then `CLOSED`; readiness false | not checked    | not started |

The artifact also confirms the messages publication check passed. No insert or delivery wait ran, so this run provides no evidence that an authorized patient/staff row was visible or that a protected event was delivered or denied after insertion.

## Confirmed Realtime cause

The failed operation was the anonymous channel's `subscribed()` promise inside the aggregate Realtime-readiness `Promise.all`. In the published code, `subscribed(anonChannel)` used its default expected status, `SUBSCRIBED`. The anonymous channel correctly received `CHANNEL_ERROR` for authorization denial. The helper rejected that status before the readiness assertion, message insert, row-visibility checks, or delivery waits.

This is a harness expectation defect. It does not establish a Realtime publication, RLS, filter, timing, or authorized-delivery defect. The run's failure-stage field points to the preceding token-sync assertion; source inspection shows readiness was not instrumented separately in that published revision, so the stage is stale. The enclosing runner classifies the thrown Realtime error as `realtime-delivery`.

This also explains the `67 passed, 0 failed` counters: those count calls to the assertion recorder. The subscription helper threw instead of recording a failed assertion, so the test suite failed while the assertion counter stayed at zero failures. The artifact shows 30 instrumented service operations completed because that published revision did not wrap readiness in the operation timer.

The four browser workflows were blocked by this preceding integration failure. The artifact reports zero browser requests, zero browser workflows started, and four blocked; this was not an independent browser failure.

The existing local commit `61ede1a` fixes the harness condition: it expects `CHANNEL_ERROR` for anonymous, accepts it only when the sanitized reason classifies as authorization denial, and measures the readiness operation separately. Its regression tests reject unrelated channel errors. That commit also retains the strict authenticated session/Auth API check. The 400 patient Auth probe in run `41958210550` is therefore a separate unresolved risk: the failed run stopped earlier, and no evidence establishes whether that probe will still be rejected after readiness proceeds. The next run must resolve it through the existing strict check; it must not be made optional.

## Authorization and database review

No migrations, RLS policies, grants, or hosted database settings were changed.

- `00010_security_fixes.sql` publishes only `public.messages`; `016_realtime_publication.test.sql` verifies one publication, not `FOR ALL TABLES`, containing exactly that table.
- The messages read policy in `00005_fix_rls_recursion.sql` scopes reads to the patient conversation or the caller's authorized clinic IDs. Anonymous users have no table ACL.
- Doctors continue to receive conversation message details through the scoped `doctor_conversations()` RPC in `00055_doctor_portal.sql`. The integration test still asserts that a doctor cannot read raw protected messages and that unrelated-patient, anonymous, and doctor raw-table subscribers receive no unauthorized events.
- Existing patient and clinic-staff event-delivery checks remain required. The runner still checks session identity, row visibility, event matching, bounded shutdown, and fixture cleanup.

The installed lockfile dependency is `@supabase/realtime-js@2.116.0`. Its `wait: true` option holds `SUBSCRIBED` until the server confirms the Postgres Changes binding when the channel has a Postgres Changes listener; the runner configures a 10-second server wait. This supports the authorized-channel readiness check, but does not turn an anonymous authorization denial into a successful subscription.

## Docker exposure finding and CI guard

Phase 27's checkpoint established that the local Docker Desktop runtime could not demonstrate loopback-only published ports. The current repository has no tracked Phase 27 evidence containing a more specific engine/CLI trace, and this phase did not start a local stack. A read-only local version query reported Docker Engine `29.9.2`; the Supabase CLI is not installed locally.

Run `41958210550` had no Docker network/port audit step and invoked plain `supabase start`. Its logs and artifact do not record actual container `HostIp` mappings, attached networks, or host listeners. Therefore its published-port exposure cannot be retrospectively confirmed from the available run evidence.

This phase updates the existing workflow rather than creating a second integration system:

1. It creates a unique runner-owned internal bridge with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` and passes that network to the pinned Supabase CLI using `--network-id`. Docker documents this per-network binding option; Supabase documents that `--network-id` selects the supplied network instead of generating one. [Docker bridge networking](https://docs.docker.com/engine/network/drivers/bridge/), [Docker network creation](https://docs.docker.com/reference/cli/docker/network/create/), [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-start).
2. Before migrations, SQL tests, service integration requests, or browser workflows, the gate inspects the network and every running Supabase project container. It requires the isolated bridge, run-ownership label, no IPv6 network routing, the exact loopback default, and exclusive attachment to that network.
3. It validates the live `NetworkSettings.Ports` IPv4/IPv6 host mappings for every published service port. Only `127.0.0.1` and `::1` pass. It also reads `ss` listeners and fails on wildcard or non-loopback listeners for mapped ports. If Docker uses NAT without a socket listener, the verified Docker mappings remain the primary evidence.
4. The artifact records sanitized address scopes, ports, network policy, and cleanup status. It omits container IDs, arbitrary labels, and raw non-loopback IP addresses. Cleanup stops Supabase with the same network ID and removes only a network whose ID and run-ownership label match this job.

This gate has unit coverage for wildcard IPv4/IPv6, non-loopback bindings and listeners, external or IPv6-enabled networks, network-attachment mismatches, missing mappings, ambiguous listener output, and evidence sanitization. The actual gate has **not** yet run against a GitHub Docker engine. Its evidence will prove the runner's engine-reported bindings and local host listeners; it is not an independent remote scan of the Azure runner host.

## Changes in this phase

- `.github/workflows/real-service-integration.yml`: run-scoped internal loopback network, CLI network selection, live port/network/listener gate before migrations and application tests, and bounded owned-network cleanup/evidence upload.
- `scripts/verify-disposable-docker-bindings.mjs`: sanitized network and runtime inspection with fail-closed checks.
- `scripts/verify-disposable-docker-bindings.test.mjs`: targeted policy, IPv4/IPv6, listener, topology, and sanitization regression cases.
- `scripts/real-service-integration.test.mjs`: verifies workflow ordering, the safety gate, selected network, and cleanup path.

The prior unpublished commit `61ede1a` separately changes `scripts/real-service-integration.mjs` and its tests for anonymous Realtime denial classification. The migration and application authorization files remain unchanged.

## Local validation

- Focused CI/runner tests: **99 passed, 0 failed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Prettier check on all four changed implementation/test/workflow files: passed.
- `node --check` on the new gate and its test file: passed.
- `git diff --check`: passed.
- Static migration integrity: **41 migration files and 22 pgTAP files** verified.

No Docker/Supabase stack, migrations against a running database, pgTAP execution, booking concurrency, Auth/PostgREST/Storage/Realtime service calls, or browser workflow was run locally. The earlier Docker Desktop runtime did not satisfy the loopback safety condition, so no local real-service retry was attempted.

## Required CI verification and blockers

After the local commits are published through the separately authorized process, run the existing disposable workflow once and inspect its sanitized artifact. Confirm the Docker gate passes for every service port and host listener before treating any integration result as meaningful. Then require all of the following:

- patient and authorized clinic-staff message delivery;
- doctor access only through the scoped conversation RPC;
- no protected raw event to unrelated patients, anonymous clients, or doctors;
- accepted Auth API identity probes for every authenticated Realtime client, including the patient that returned HTTP 400 in run `41958210550`;
- successful migration, pgTAP, booking concurrency, Auth, PostgREST, Storage, and all four browser workflows;
- verified Realtime/Auth shutdown, owned Docker network removal, and fixture cleanup.

The CI guard and Realtime readiness correction are committed locally but have not been run in GitHub Actions. The Auth HTTP 400 has no confirmed cause. No push, PR merge, hosted Supabase operation, or deployment was performed. The release gate remains closed.
