# CARECONNECT_PUBLICATION_READINESS_REPORT

2026-11-06. **Verdict: `BLOCKED_BY_UNVERIFIED_ENVIRONMENT`.** The reviewed local application/test range is coherent and its available checks pass, subject to existing repository-wide formatting debt. A blanket publication recommendation is withheld because publication can automatically trigger an older disposable reconciliation path without the reviewed network/binding policy. Actual unsafe CI bindings on that path have not been observed; absence of verification is not a demonstrated network failure. No push, workflow dispatch, merge, deployment, hosted operation or Docker command was executed.

## Repository and ancestry

- Original root: `C:\Users\admin\Projects\care-connect-chennai`; expected branch confirmed: `claude/careconnect-frontend-repair`.
- Starting HEAD: `b86811ddabd719eb54e97e833a86b93ec3c0e85b`; clean. Available chat inventory showed only this active CareConnect chat; no concurrent writer was identified.
- Published branch and PR #2 head: `a98f652ded60d6d17545a51b0224cf8d0cde3cd0`; PR observed open and unmerged through read-only GitHub metadata.
- **17 starting unpublished commits**, not 16. The seventeenth is the final post-overnight report commit. Every parent was checked against its predecessor starting at the published base; no merge commits, missing earlier local commits, rebase, reset or other history rewrite.
- Verified new test-code HEAD: `2f963d1f94789f8f97540d5d9104d35d36b15877`. One final documentation-only commit contains these three deliverables, taking the total to **19 unpublished commits**. Its full final HEAD and final clean-tree result are recorded in the handoff and ignored local `test-artifacts/publication-final-state.json`, captured after committing; a commit cannot embed its own SHA.
- One existing stash was observed and left untouched. Existing ignored configuration, link markers, recovery backups and evidence were preserved; normal build/test outputs use existing ignored directories. No checkout/worktree/clone was created.

## Complete starting commit inventory

All 17 were reviewed in order, including their net diff and both prior handoffs. Superseded implementations remain in history and are corrected by later commits; they are not proposed as separate deployment checkpoints.

1. `d71bc784a63031ef477893a1b5a6dbd7a5b810f2` — distinguish normal healthy Postgres/rollback from failure.
2. `d13cfbc6f9a922a80232a66c92ac47f10c114c56` — initial synthetic build/manual-test isolation; later strengthened.
3. `bdb2e42f59f339c3af78f5a01bb6fcab3aff9b54` — India-date progression across viewer DST.
4. `67ff4ad3e61fa5a0c1c431b9a024a02cf992364c` — profile-query retries and recipient-specific composers.
5. `0701227ddf85f6380b410c056b1d300a86e0063e` — prefer furthest verified startup marker.
6. `ddb34ffd536b72ace237699967863b6a9a3dc4e8` — initial pending-send retention; later revision-based fix handles identical retypes.
7. `45ed0b6e2e46cfed089a806e024a9b73c94acd6f` — explicit test-server loopback host.
8. `649511f9ca901b6ed8fd4178aab1ecab829b3d66` — independent synthetic frontend CI.
9. `becd554bce08ffd213b9997614864cba4ff48a14` — original overnight evidence report.
10. `4d8cebaa309b49b49abdf351fb8e2e29a596487c` — private-file preload/discovery guard, including Nitro's implicit dotenv path.
11. `115df03fe13e61496ebd0c1028c1f0cc2adb0e82` — explicit calendar/cutoff expectations across five time zones.
12. `46f7f62c12de3d9dbac3d24ee74d2b3bd936d3fd` — explicit manual-security execution flag and test-discovery refusal.
13. `d15dd06be572d1506b69e4f502de54b7fdd81b4d` — shared revision/identity-safe composers with duplicate/unmount regressions.
14. `8d235dac877333f85b8965edcb960fe8b11b2816` — visible logout errors, keyboard-native clinic radios and deep-link time selection.
15. `af5c9b24e6de7f044d4d9ac02ad36ecf25c63d22` — narrow clinic metrics and authorized responsive coverage.
16. `4580629742ac6cd69044e63c581944d192ac917e` — strict browser-test/config TypeScript coverage and stronger manual-test isolation.
17. `b86811ddabd719eb54e97e833a86b93ec3c0e85b` — post-overnight audit report and additive correction of earlier claims.

This phase adds `2f963d1f94789f8f97540d5d9104d35d36b15877` — `test(messages): cover pending sends across logout and account switches`, changing only `tests/message-session-isolation.spec.ts`; plus the final three-document handoff commit. No application source correction was justified by the focused review.

## Diff and security review

The starting aggregate diff contains 35 files, 1,259 insertions and 98 deletions. Reviewed application/config/test changes against their consumers and the existing service gate. The two previous audit reports retain detailed defect evidence; this report does not repeat that feature audit.

- No migration, RLS, SQL grant, service configuration or package-lock change in the unpublished range. Manifest changes add test commands only. Doctor reads remain scoped RPC calls; no privileged subscriber/raw-read workaround. Auth identity/delivery assertions remain required.
- No generated build output, local credentials, original dotenv/link contents, backups, caches or unrelated project files in the range. The largest reviewed changed file version is the existing synthetic mock backend (47,335 bytes); no giant temporary payload was added.
- A bounded private-key/GitHub-token/secret-key/JWT/credentialed-Postgres-URL signature scan checked **62 changed file versions across all 17 commits**, with zero findings. This is a signature check, not a universal secret detector. New test data are synthetic. Original `.env` and project-link contents were not read.
- Synthetic tests use `.invalid` targets and block hosted Supabase HTTP/WebSockets. Existing staging-origin validation fixtures are inert strings, not active integration targets. Manual account creation is not discovered/executed by the normal suites.
- The test preload protects supported Node filesystem reads/discovery in trusted test processes. It is not a malicious-code/OS sandbox. Historical dotenv exposure uncertainty from the preceding handoff remains unresolved and is not recast as proof of no exposure.
- New frontend workflow has `contents: read`, pinned action SHAs, no secrets or deployment step, and independent synthetic checks. Other workflow permissions were not broadened. `vercel.json` disables Git deployments for this development branch; provider-side settings were not changed or independently audited.
- Existing real-service startup/binding failure handling, sanitized artifact allowlist, bounded observer teardown and owned cleanup remain intact. Classification changes do not turn failure into success. No integration assertion was made optional and no release gate was disabled.

## Publication blocker found in existing automation

`.github/workflows/staging-reconciliation-rehearsal.yml` watches `playwright.config.ts`, which this publication range changes. Its runner (`scripts/staging-reconciliation-rehearsal.mjs`) invokes plain `supabase start` and immediately proceeds to local database work. It does not invoke `verify-disposable-docker-bindings.mjs`, create the reviewed internal/loopback-default network, or verify all actual IPv4/IPv6 bindings/listeners. `.github/workflows/sql-tests.yml` also uses the older startup wrapper without that gate, although its narrower paths are not changed in this range.

This is a confirmed **verification/policy coverage gap in existing automation**, not proof of the actual bindings on a future GitHub runner and not a newly introduced RLS defect. The reviewed real-service workflow does have the mandatory gate; its earlier startup failure and all service-release requirements remain visible. A GitHub-hosted runner alone is not loopback evidence. Approval to publish must not silently waive this issue.

The smallest next implementation is to apply the existing owned-network/binding verification to every startup/restart in the older reconciliation/SQL execution paths before database/application traffic, with focused orchestration tests; do not disable their checks, duplicate the integration system, or alter Docker globally. Their operational migration/restart semantics make an unexecuted rewrite inappropriate in this focused publication review. Actual behavior then needs the separately approved dedicated Linux environment in the reproduction plan. No speculative network fix or CI retry was performed here.

## Locked toolchain and executed gates

Independently observed: Node **22.13.0**, npm **10.9.2**, Vite **8.3.5**, TypeScript **5.9.3**, Playwright **1.63.0**. Vite manifest/lock/installed versions agree; lock root dependency maps match the manifest; `npm ls --depth=0` has no dependency errors. Chromium/headless-shell revision 1243 is installed. No reinstall or version upgrade was needed. Supabase CLI is not on local PATH.

- Application TypeScript: passed (`npm run typecheck`).
- Test-code TypeScript: passed, including the new regression file (`npm run typecheck:tests`).
- ESLint: passed (`npm run lint`), including final new tests.
- Prettier on all 35 starting changed files and new files: passed. Whole-repository Prettier also executed and reported **eight pre-existing issues**, all outside the starting unpublished diff: `.claude/PR_DESCRIPTION.md`, `.github/workflows/sql-tests.yml`, `docs/authorization-matrix.md`, `docs/MIGRATION_RECOVERY_MATRIX.md`, `docs/provider-onboarding.md`, `docs/STAGING_CHANGE_WINDOW_RUNBOOK.md`, `docs/STAGING_WRITER_FREEZE_RUNBOOK.md`, `scripts/baselines/staging-00001-fingerprint.json`. No unrelated reformatting was performed.
- Safe Node units: **23 passed, 0 failed**. Script suite: **171 passed, 0 failed**, including baseline-comparator, sanitizer, ownership, network/classifier and cancellation cases.
- Complete starting mocked Chromium suite: **298 passed, 0 failed, 0 skipped, 0 flaky**, 550,454 ms. A guarded production build ran first using locked Vite 8.3.5. Evidence: ignored local `test-artifacts/publication-readiness-playwright.json`.
- New targeted pending-send regressions: **6 passed, 0 failed**, 26.5 seconds, with another guarded build. Evidence: `test-artifacts/publication-session-regressions.json`. They cover each of patient/clinic/doctor across logout and direct principal change, held requests, an old denied response, fresh composer state and no secondary submission/stale toast. A patient receives a separate synthetic conversation; shared staff access does not simulate bypassing RLS.
- Browser inventory is now **304**. Execution was the original complete 298-case run plus a separate six-case run, not a claimed single 304-case run. No application code changed between them.
- `git diff --check` and staged integrity checks: passed. During browser execution the owned server listener was `127.0.0.1:4173`; runner teardown was checked separately. No unrelated process was stopped.

All four existing workflow YAML files parsed, with `contents: read` permissions confirmed. Installed-versus-lock version checks also passed for Vite, TypeScript, Playwright and Supabase JS. The final 39-file changed/new-source signature scan had zero findings. A read-only branch fetch and remote recheck still returned the published base above.

Real migration/pgTAP/concurrency/Auth/PostgREST/Storage/Realtime and patient/clinic/doctor/administrator **real-service** browser workflows did not execute in this phase. They are blocked, not passing. Patient Auth HTTP 400 and authorized Realtime delivery remain unresolved. No amount of synthetic test success opens the release gate.

## Concrete next boundary

Use [the Linux reproduction plan](CARECONNECT_LINUX_BOOTSTRAP_REPRODUCTION_PLAN.md) for one approved private startup investigation and [the feature baseline](CARECONNECT_FEATURE_DEVELOPMENT_BASELINE.md) for continued frontend work. First close the old automatic-startup verification gap, then re-review publication and obtain explicit push approval. No current instruction authorizes a push, workflow dispatch, infrastructure provisioning, merge or deployment. The local changes remain available and all previous commits are preserved.
