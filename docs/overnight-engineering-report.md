# CareConnect engineering handoff

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
