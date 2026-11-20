# CareConnect engineering handoff

## 2026-10-19 isolated hardening checkpoint

This dated section supersedes the current-status claims in the historical 2026-10-12 record below. That record is retained as history, not evidence that today's SQL or browser suites remain unexecuted.

Scope: existing PR #2 and `claude/careconnect-frontend-repair`. Reviewed starting source `e980d488bf58eb712da8104808fec022a807a3a2`. Work uses the existing isolated worktree; the original checkout remains at `baa49df2a76a9ef3fb9e3357b5372e9999fbad03` with all 19 modified and four untracked files preserved. Those unpublished files are not validated by the isolated CI source.

### Changes and reasons

- Added an exact 40-file LF-normalized SHA-256 migration manifest. Filename/ledger equality alone cannot detect changed SQL.
- Added real-runner fault injections for ledger-write failure, connection termination during transactional DDL, competing migration processes, recorded-commit retry and ledger-preserving schema drift. Historical migration files remain intact; injected copies exist only in runner-owned temporary directories.
- Added a full logical-backup restore experiment in a uniquely named database inside the disposable container, with ownership/ACL/data/publication/ledger comparisons. This does not claim a hosted staging backup is restorable.
- Preserved the first failed command stage through cleanup and added fixed allow-listed diagnostic categories. Raw output and backup bytes never enter artifacts.
- Added a ninth independent-session booking scenario: doctor fee update waits for booking, committed fee is preserved, stale occupied-slot selection fails, subsequent booking uses the new authoritative fee. No new application behavior or historical migration was needed.
- Added a metadata-only staging inventory SELECT and operator runbooks for writer freeze, backup/restore and all 40 migrations' recovery requirements.

### Executed evidence and failures

- [Clean-stack run 39211320826](https://github.com/h4timfr/care-connect-chennai/actions/runs/39211320826), exact source `6322f66fc5c9658529c2898dc902b1fc6d4bb00e`: 40 migration attempts; exact 40-entry ledger; SQL 001–021 **479 assertions passed**; booking regressions **9/9 passed**; owned fixture cleanup passed. Lint, typecheck, build and whitespace gates passed.
- The clean-stack ZIP contained exactly `startup.log`, `ledger.log`, `pgtap.log`, `concurrency.log`. In-memory filename and credential/URL-pattern checks passed. No raw log, dump or connection file was uploaded.
- New restore attempts initially failed. [Run 39179515315](https://github.com/h4timfr/care-connect-chennai/actions/runs/39179515315) identified a missing-object failure; [run 39211320842](https://github.com/h4timfr/care-connect-chennai/actions/runs/39211320842) reproduced it at DROP POLICY with `--clean` on an empty target, then failed the separate fresh-target restore. [Run 39211960489](https://github.com/h4timfr/care-connect-chennai/actions/runs/39211960489) identified that fresh-target failure as an ALTER ownership/SET ROLE privilege requirement.
- The correction passed in [run 39212447344](https://github.com/h4timfr/care-connect-chennai/actions/runs/39212447344), exact source `34b8863fb06f8ffd78165396137ddb00a9e6e821`: fresh restore without `--clean`, using existing `supabase_admin` solely inside the disposable local container after verifying its superuser attribute. Ownership/ACLs remained checked; no role grant or ignored error was added. The restored fingerprints and ledger matched and the source remained unchanged.
- Local commands executed: `node --test --test-reporter=dot scripts/staging-reconciliation-rehearsal.test.mjs scripts/local-sql-test-target.test.mjs scripts/run-sql-ci-step.test.mjs` (**66 passed**); `npm run lint` (**passed**); `npm run typecheck` (**passed**); prior same-sprint `npm run build` (**passed**, reserved invalid build configuration), `npm run test:supabase-config` (**10 passed**); scoped Prettier and `git diff --check` (**passed**). No local Docker/SQL stack was started.
- The same run's frontend job passed lint, typecheck, production build, configuration tests and the complete mocked Chromium suite (**267 passed**). This does not verify hosted Preview or real-provider transactions.
- The successful rehearsal artifact contained only five allow-listed summary filenames. Present entries passed in-memory filename and credential/URL-pattern checks. No raw CLI output or dump was uploaded.

### Hosted observations and boundaries

Staging-only catalog/aggregate SELECTs confirmed `careconnect-staging`, the sole `20261009041700 / 00001_initial_schema` ledger entry, zero application/Auth/Storage rows, and an existing empty non-all-tables Realtime publication. No patient/message content was read. The prepared inventory query also returned 18 relations, 26 policies and zero public/private functions. Metadata is a point-in-time observation, not a writer freeze or hosted equivalence proof.

The scoped Vercel deployment read again returned HTTP 403; no installed CLI fallback was available. Hosted Preview remains unverified. No production access, hosted writes, freeze, backup capture, migrations, deployment or merge occurred. Normal source pushes are authorized; branch Git deployment remains disabled in the existing `vercel.json`.

Migration 00009's internal COMMIT can leave committed effects with no history row. Never blindly retry or synthesize history. Missing 00024–00044 filenames are not invented. The local 00055 contents are hash-pinned for this clean rehearsal, not assumed deployed elsewhere. Hosted migration remains gated on a verified writer freeze, exact post-freeze baseline reconciliation, actual backup/restore evidence and explicit approval.

See [release readiness](STAGING_RELEASE_READINESS.md), [writer freeze](STAGING_WRITER_FREEZE_RUNBOOK.md), [backup/restore](STAGING_BACKUP_RESTORE_RUNBOOK.md), and [migration recovery matrix](MIGRATION_RECOVERY_MATRIX.md) for the current decision and approval gates. Hosted Storage API operations, authenticated Realtime delivery/confidentiality and real-provider booking are not validated by these SQL or mocked browser results.

## Historical record — 2026-10-12

Updated 2026-10-12. This is a read-only deployment status plus local validation record; no hosted database or remote Git action was performed.

## Executive status

**NOT READY for release.** The current checkout includes the cache-key commit and local in-progress frontend edits. TypeScript and lint pass on the final inspected tree. Production build and browser tests are blocked by Windows `EPERM`; SQL tests were not run. Current staging is still only the initial schema and cannot support the current application.

## Verified environment

- Repository: `C:\Users\admin\Projects\care-connect-chennai`
- Branch: `claude/careconnect-frontend-repair`
- HEAD: `8b29d907b39db617a83385356ff554985bd4a53b` (`Fix patient appointment cache key`), one commit ahead of its origin tracking branch.
- At the first status check, existing working-tree edits were present in `src/lib/store.tsx`, `src/lib/supabase/queries.ts`, `src/routes/clinic.profile.tsx`, `src/routes/messages.tsx`, and four Playwright specs. The shared working tree changed during this session; at final status, the remaining pre-existing code/test edits are in `src/lib/supabase/queries.ts`, `src/routes/clinic.profile.tsx`, and four Playwright specs. They were preserved. No source-code fix from this session remains. No commit, push, PR, merge, or deployment occurred.
- Node `v22.13.0`, npm `10.9.2`, Playwright `1.63.0`; lockfiles include `package-lock.json` and `bun.lock`.
- `.env` key names only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Values were not printed or recorded. `supabase`, `psql`, `pg_prove`, `initdb`, `pg_ctl`, and Docker CLI are unavailable. `supabase/config.toml` is absent.

## Local validation

- `npm run lint` — **PASS**, no errors or warnings on the final inspected tree.
- `npx tsc --noEmit --incremental false` — **PASS**.
- `git diff --check` — **PASS**; Git printed only line-ending conversion warnings for existing edited files.
- `npx playwright test --list --reporter=line` — **PASS, discovery only**; 267 tests in 17 files.
- Playwright execution — **BLOCKED**. A run against a local Vite server and the reserved `.invalid` backend could not launch Chromium (`browserType.launch: spawn EPERM`). No test case reached the application.
- Production build, attempted through Playwright’s configured web server — **BLOCKED**. Nitro file tracing failed with `EPERM: operation not permitted, readlink 'C:\Users\admin'`.
- The failed build may have refreshed ignored `.output` artifacts; the folder existed before the attempt. No tracked generated artifact is included in Git status.
- SQL tests `001–015` — **NOT RUN**. No local database/CLI/test runner is available. `tests/security.test.ts` was not run because it creates real accounts.

## Database evidence

- Supabase project listing positively identified staging as `careconnect-staging`, ref `aqwzrpwiqbrykorlqwow`, healthy, PostgreSQL 17.11. Production ref was visible in the listing but was not queried.
- Staging migration ledger: only `20261009041700 / 00001_initial_schema`.
- Staging has the ten initial application tables; RLS is enabled, but `anon` and `authenticated` have no direct table privileges on those tables. Metadata checks found none of the inspected application RPCs, no private schema, no application triggers or public views, no avatar bucket, no app tables in `supabase_realtime`, and no pgTAP extension.
- These were metadata-only queries. No row data was read and staging received no writes. Production schema and ledger remain **UNKNOWN**.

## Material migration/security findings

- `supabase/migrations/00009_production_hardening.sql` marks every existing clinic, doctor, user, and patient row as demo. It is safe only if all rows at that point are seed/demo records; that is unknown for production. Do not replay against populated data without proving the precondition.
- In the same migration, if `supabase_realtime` is absent, it creates a `FOR ALL TABLES` publication and then adds `public.messages`. PostgreSQL disallows adding one table to a `FOR ALL TABLES` publication, so this is a conditional replay failure. Supabase’s usual existing publication takes a different code path; clean replay must test both states.
- `00006` drops `clinic_staff`, while `00010–00012` define appointment-trigger functions that still reference it; `00013` replaces those functions. The full order and final definitions must be validated by replay.
- `00017` has an advisory transaction lock for doctor/date overlap checks. Existing booking SQL tests check duplicate booking sequentially, not simultaneous requests; concurrent safety remains **unverified**.
- `00054` and `00057` add `NOT VALID` constraints. They enforce future inserts/updates but do not prove old rows valid until validation.
- The local history contains 38 SQL migrations: `00001–00023`, `00045–00059`. The `00024–00044` gap was previously confirmed absent in checked history. Do not invent missing migrations or edit applied history.
- Staging’s timestamp version differs from local prefix `00001`; matching SQL does not reconcile ledger identifiers. A future push could consider local `00001` unapplied. Exact current CLI behavior is unverified; do not run push or repair to investigate.
- Working-tree frontend edits separate clinic contacts into `get_my_clinic_contacts`, update message loading around a newly created conversation, and adjust mocked tests. They were not fully validated because browser launch is blocked.

## Release blockers and next action

1. Use a disposable local Supabase/PostgreSQL environment with a compatible CLI and pgTAP. Do not create a hosted branch or incur cloud costs as part of this handoff.
2. Clean-replay migrations in both publication states; validate the demo-row precondition; run SQL tests `001–015`.
3. Add/run true concurrent-booking, appointment-transition, and Realtime-confidentiality tests.
4. Resolve the staging ledger/schema mismatch with a reviewed, non-mutating plan before any staging migration. Production remains out of scope until separately authorized and positively identified.
5. Re-run the mocked Playwright suite and production build in an environment that permits Chromium and Nitro tracing.

No production or shared staging modifications were made. No credentials or real patient data were accessed or recorded.
