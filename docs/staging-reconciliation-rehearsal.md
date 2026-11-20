# Staging migration reconciliation rehearsal

## Exact execution procedure

The dedicated workflow runs `node scripts/staging-reconciliation-rehearsal.mjs --execute` on an Ubuntu disposable Actions runner with Supabase CLI **2.117.0**, Docker, `/usr/bin/psql`, and `RUNNER_TEMP` outside the checkout. It refuses hosted environment configuration, linked-project metadata, non-loopback database URLs, unexpected migrations, existing Supabase containers, and unexpected port ownership. No local Windows stack or hosted project is used.

The initial migration is an unchanged temporary copy named `20261009041700_00001_initial_schema.sql`. Actual execution records the exact observed staging version/name; it is not a fabricated applied ledger entry. After checking the empty baseline, the script replaces that temporary filename with canonical `00001_initial_schema.sql` and uses:

```sh
supabase migration repair 20261009041700 --status reverted --local
supabase migration repair 00001 --status applied --local
```

The matching canonical file must exist when the second command runs: the pinned CLI reads it to obtain the name and statements. History repair does not execute those statements. Full schema dumps retain ownership and grants; application/Auth/Storage data dumps, role attributes/memberships and publication flags are fingerprinted before/after each repair. Only migration-ledger data is excluded. Pending versions are queried against the actual ledger and must equal the exact 39 repository versions.

Each subsequent `supabase db push --local --yes` sees only the already-applied files plus one next original migration in the temporary directory. The script verifies the ledger version **and name** after every file. All original source migrations remain unchanged. It checks intermediate boundaries at 00006, 00008, 00009, 00010, 00013, before 00049, 00053, 00057–00059 and 00060–00061, then runs all 21 pgTAP files (479 planned assertions), all eight concurrency scenarios, and fixture cleanup.

Failure injections change disposable copies only: invalid second normalization command (A), error appended to 00007 (B), error prefixed to 00009 after 00008 (C), error appended to 00010 (D), and error appended to 00061 (E). For B–E an exact unchanged snapshot and ledger are required before retrying the restored original. A separate error appended **after 00009's internal COMMIT** establishes whether the pinned runner can leave committed effects without history; this experiment always rebuilds the owned disposable baseline before the final complete replay. It never repairs a partially executed migration as applied.

Raw output is private to runner temp and is never uploaded. Only fixed checkpoint labels, known filenames and existing allow-listed ledger/pgTAP/concurrency summaries are artifacts. Failure summaries remain nonzero and suppress raw SQL diagnostics. Only the uniquely owned stack is stopped. No other project is stopped or deleted.

## Publishing without a Vercel deployment

`vercel.json` sets `git.deploymentEnabled["claude/careconnect-frontend-repair"] = false`. This is the [documented branch-specific Vercel Git deployment control](https://vercel.com/docs/project-configuration/git-configuration). It suppresses automatic Git deployments for the testing branch while permitting Actions to run; other branches remain at Vercel's default, including `main`. It changes no hosted setting or environment variable. Do not remove the guard or manually deploy as part of the rehearsal. The resulting commit's Actions and deployment statuses must be checked after publishing.

Current rehearsal results must be read from the exact commit's Actions run. A workflow/script being present or its unit tests passing does not establish PostgreSQL, migration-history, or hosted behavior.

## Scope and current evidence

**Successful database rehearsal:** [run 39150803643](https://github.com/h4timfr/care-connect-chennai/actions/runs/39150803643), database job on `e980d488bf58eb712da8104808fec022a807a3a2`, completed successfully. It reproduced the exact timestamp ledger baseline twice, normalized to canonical `00001` with unchanged schema/data/ownership/grants, queried the exact 39 pending versions, applied all of them including `00008`, verified all checkpoints and the final 40-entry ledger, passed 21 pgTAP files / 479 assertions, passed all eight concurrency scenarios, and verified zero residual Auth/app users, patients, appointments, conversations, messages, Storage objects and research candidates. The exact six demo clinics, twelve demo doctors, twelve links and 64 schedules remained. Cases A–E and the separate 00009 post-COMMIT failure/rebuild ran successfully; the owned stack was stopped. Every entry in the downloaded successful artifact (four allow-listed summaries only) was inspected without exposing raw diagnostics or connection details. [Clean-stack run 39150803654](https://github.com/h4timfr/care-connect-chennai/actions/runs/39150803654) also passed on that same SHA.

The same run's frontend job completed successfully: lint, typecheck, build, 10/10 Supabase configuration tests and **267/267 complete mocked Chromium tests** (7.1 minutes), including the existing language/RTL, phone, provider, portal and booking coverage. Rehearsal/guard/sanitizer unit checks passed **62/62**. The focused local formatting suite passed 6/6. These results cover the isolated remote/worktree source at `e980d488…`, not the user's preserved 19 modified and four untracked files in the stale original checkout. No database test or browser result is attributed to those unpublished edits.

Three normal commits were published to the existing branch: `4d6db8dec5bd4f2a40ce0fadbbc84fad3eadf160`, `30e73325ba3c01c8e904c1e84dddfc9e2a44e709` and `e980d488bf58eb712da8104808fec022a807a3a2`. This final evidence-only runbook update remains local so the published HEAD stays exactly the tested SHA. The original checkout was never edited, reset, stashed or staged by this rehearsal.

Exact published manifest (nine paths; no deployment migrations changed):

- `.github/workflows/staging-reconciliation-rehearsal.yml` (new)
- `docs/staging-reconciliation-rehearsal.md` (new; final evidence supplement remains local)
- `scripts/staging-reconciliation-rehearsal.mjs` (new)
- `scripts/staging-reconciliation-rehearsal.test.mjs` (new)
- `scripts/test-booking-concurrency.mjs` (owned-profile collision guard)
- `supabase/tests/021_demo_seed_publication_boundary.test.sql` (new, 18 assertions)
- `supabase/tests/concurrency/cleanup.sql` (owned-profile deletion and verification)
- `tests/format.spec.ts` (observed Hindi month variants and weekday assertion)
- `vercel.json` (exact branch-specific Git deployment guard)

Vercel verification limit: the properly scoped deployment-list request returned **403 forbidden**; no installed CLI fallback was available, and no authentication/settings were changed. Earlier unscoped empty lists are not proof that no team deployment exists. GitHub reports no Vercel commit-status entry for `e980d488…`; the source guard disables this branch's Git deployments by documented configuration. No deployment command was issued. The earlier `2412bac4…` Preview was READY by its GitHub status, but its runtime and any post-push team deployment inventory remain independently unverified. PR #2 remains open; its body still contains historical 116-test/audit claims, which must not be presented as this run's results. No npm audit was run here.

Execution record (2026-10-18): starting remote HEAD was `2412bac4e070126101e9f0e34385f2c98dd83bcb`, PR #2 open. [Clean-stack run 39149639187](https://github.com/h4timfr/care-connect-chennai/actions/runs/39149639187) passed on `4d6db8dec5bd4f2a40ce0fadbbc84fad3eadf160`: 40 migrations, 21 files / 479 assertions and all eight concurrency checks. All four downloaded artifact entries were inspected for credential/endpoint patterns and contained only the allow-listed summaries. Local lint, typecheck, build and 10 Supabase configuration tests passed; rehearsal/guard/sanitizer unit tests passed 62/62 after fixing the CLI update-notice version check.

[Staging-state run 39149866209](https://github.com/h4timfr/care-connect-chennai/actions/runs/39149866209) on `30e73325ba3c01c8e904c1e84dddfc9e2a44e709` executed normalization, all 39 pending migrations, all 479 SQL assertions, all eight races, and cases A–E successfully, but **failed the stricter final zero-residual-data gate**. It is not a successful overall rehearsal. The schema has no `public.users.id → auth.users.id` foreign key: existing concurrency cleanup deleted Auth identities without deleting their app profiles/patients/roles. The narrow fixture correction explicitly removes only the four owned app-profile UUIDs, rejects a pre-existing owned profile, and asserts no owned Auth/profile/patient residue before committing cleanup. The successful rerun above validates that fixture correction; it changes no application migration or hosted account-deletion behavior.

That run's complete mocked Chromium job had **266 passed, 1 failed**, with no product interaction failure: `tests/format.spec.ts` hardcoded the older ICU Hindi spelling of October, while hosted Node returned the other observed Hindi spelling. The narrow assertion correction accepts exactly those two Hindi forms and additionally requires the Hindi weekday; invalid-date and English checks remain. The successful full rerun above validates the correction. No application locale strings or formatter implementation changed.

This document describes a disposable local rehearsal for the staging history shape. Only the explicitly linked execution results are evidence of runs; none establishes hosted migration safety or an operational staging freeze.

The repository contains 40 migrations: `00001–00023` and `00045–00061`. Staging's only recorded row is `20261009041700 / 00001_initial_schema`; that row's effects were independently compared with repository migration `00001`. The proposed canonical ledger must contain `00001` and the exact pending set `00002–00023, 00045–00061` (39 versions). There are no repository migrations `00024–00044`; do not invent or mark any as applied.

The established historical reconciliation identifies `00024–00044` as excluded local forensic work, not missing deployment placeholders. The checked-in `00055_doctor_portal.sql` still has a `LOCAL ONLY` header: a file/header is never proof of hosted deployment. This rehearsal executes its current bytes only on a proven `00001` baseline with no `00055` ledger entry, after `00052–00054`; it does not prove that an environment with an existing `00055` record has these effects. Any future hosted execution must recheck the ledger **and** effective objects. A different/shared applied `00055` requires its own forward-only reconciliation. Production ledger/effective schema remain outside this task.

The disposable rehearsal starts from repository `00001`, zero application/Auth and Storage rows, and an existing empty `supabase_realtime` publication. It uses a temporary copy of the repository, a unique local Supabase project ID, explicit `--local` CLI operations, a loopback-only database URL guard, and no hosted credentials. Reconciliation operations use `supabase migration repair --local`; according to the [Supabase migration documentation](https://supabase.com/docs/guides/deployment/database-migrations), repair changes the history table only and does not apply or revert migration SQL. Schema/data snapshots exclude only migration-history rows.

## Demo-seed disposition

**Decision: KEEP DEMO FIXTURES IN STAGING.** Executed demo-isolation assertions, the full chain and final fixture cleanup support this truthful path. The separately authorized staging freeze remains required. Do not clear demo flags or perform cleanup merely to make staging appear empty.

Migration `00008_demo_seed.sql` inserts six clinics, twelve doctors, twelve clinic-doctor links, and 64 schedules. It touches only `public.clinics`, `public.doctors`, `public.clinic_doctors`, and `public.doctor_schedules`; the clinic and doctor identifiers are deterministic, the email values use `.demo` addresses, and the phone values are synthetic seed values. It does not insert Auth users, app users, or patients and does not import candidate records.

Exact seed inventory from that migration:

| Clinic ID                              | Clinic                           | Phone            | Email                       |
| -------------------------------------- | -------------------------------- | ---------------- | --------------------------- |
| `11111111-1111-1111-1111-111111111111` | Little Steps Clinic              | +91 44 4000 1201 | hello@littlesteps.demo      |
| `22222222-2222-2222-2222-222222222222` | Anna Nagar Ortho & Physio Centre | +91 44 4000 2204 | care@annanagarortho.demo    |
| `33333333-3333-3333-3333-333333333333` | Velachery Family Health Point    | +91 44 4000 3310 | front.desk@vfhp.demo        |
| `44444444-4444-4444-4444-444444444444` | T. Nagar Skin & Smile Studio     | +91 44 4000 4488 | appointments@skinsmile.demo |
| `55555555-5555-5555-5555-555555555555` | Nungambakkam Women's Care        | +91 44 4000 5519 | reception@nwcare.demo       |
| `66666666-6666-6666-6666-666666666666` | OMR Neuro & Eye Clinic           | +91 44 4000 6627 | desk@omrneuroeye.demo       |

Doctor fixtures:

| Doctor ID                              | Name                    |
| -------------------------------------- | ----------------------- |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1` | Dr. Ananya Rao          |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2` | Dr. Karthik Subramanian |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3` | Dr. Meera Krishnan      |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4` | Dr. Rajesh Kumar        |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5` | Dr. Priya Venkatesh     |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6` | Dr. Faizal Ahmed        |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7` | Dr. Lakshmi Narayanan   |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8` | Dr. Sanjay Iyer         |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9` | Dr. Divya Shankar       |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10` | Dr. Arun Prakash        |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11` | Dr. Nithya Balaji       |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12` | Dr. Vignesh Mohan       |

The 12 links are clinic IDs `1111…`→doctor `…aaa1`, `2222…`→`…aaa2`, `4444…`→`…aaa3`, `3333…`→`…aaa4`, `5555…`→`…aaa5`, `3333…`→`…aaa6`, `3333…`→`…aaa7`, `4444…`→`…aaa8`, `6666…`→`…aaa9`, `6666…`→`…aa10`, `1111…`→`…aa11`, and `2222…`→`…aa12`; all are inserted with migration defaults. The 64 schedules are limited to these same branches, all use 30-minute slots, and cover `day_of_week` values 1–6: doctors 1, 4, 7, and 10 have six days; doctors 2, 3, 5, 6, 8, 9, 11, and 12 have five days. Start/end times are the values in the migration (`09:00–20:30` or `10:00–19:00`); no other tables are written by `00008`.

Odd-numbered doctor fixtures use `09:00–20:30`; even-numbered ones use `10:00–19:00`. These day/time/branch tuples enumerate all 64 recurring rows and are compared as exact sets in the rehearsal. The link and schedule primary-key UUIDs are generated by schema defaults, not deterministic identities supplied by `00008`; the deterministic fingerprints are the branch/doctor and complete recurring schedule tuples. Synthetic fees, ratings, counts, profile descriptions and contacts remain solely the historical demo fixture values, never real-provider evidence.

Frontend trace: `/discover` uses `useClinicSearch` / `useDoctorSearch`; catalog lists use `useClinics` / `useDoctors`. Clinic predicates require `is_demo = false`, verified clinic state and publication; `publicDoctorQuery` also requires a non-demo doctor and an active verified relationship at a verified published clinic. Both detail routes resolve IDs through that same public catalog (`clinicById` / `doctorById` in `src/lib/store.tsx`). These frontend predicates supplement the database RLS, safe column grants and slot/booking RPC checks; candidate tables are not queried for public discovery.

Migration `00009_production_hardening.sql` adds `is_demo` and marks the rows existing at that point. On the empty baseline with no client writes, this classifies the six clinics and twelve doctors from `00008`; users and patients remain empty. The later state transitions reject publishing a demo clinic, public reads require a non-demo verified published clinic and an active verified relationship, the slot RPC requires eligible provider state, and the final booking RPC rejects demo/unverified/unpublished/unbookable providers. The public frontend query also filters `is_demo = false`. Test `021_demo_seed_publication_boundary.test.sql` executed successfully in both linked isolated runs; the 30e7332 staging-state replay reached the final schema and passed SQL/concurrency but failed its later fixture-residue gate, as recorded above.

Do not skip `00008`, mark it applied without execution, clear `is_demo`, or add a broad cleanup migration. If the final isolated regression fails, stop and investigate before considering any exact-ID cleanup; cleanup is not currently justified.

## Required maintenance freeze

No freeze control has been changed or operationally verified for this staging project. A future migration window must inventory and control every route below before any migration starts:

- Public publishable keys and the legacy anon key, including deployed Preview clients.
- Secret/service-role keys and server-side integrations.
- Direct Postgres clients, poolers, and scheduled jobs.
- Vercel Preview/staging deployments and any externally hosted clients.
- Supabase Auth signup/session clients and Realtime clients.
- Supabase Dashboard users, CLI users, and MCP/operator access.

Disabling public keys can stop ordinary browser clients but does not stop holders of secret keys, direct database clients, privileged Dashboard sessions, or operator tools. Each remaining trusted channel needs an identified owner and a maintenance-window restriction. No inventory or connectivity test has established that for this project.

**Freeze status: `FREEZE PLAN INCOMPLETE`.**

The [official API-key documentation](https://supabase.com/docs/guides/getting-started/api-keys) distinguishes application API keys from user JWTs and notes that creating modern keys does not revoke legacy keys. Therefore removing only one Preview publishable key is insufficient. This task has neither retrieved key values nor changed any key/configuration. Actual staging key inventory/status, legacy-key enablement, integration owners, direct database writers, operator access and active Realtime connections remain unverified.

For a separately approved staging maintenance window:

1. Record metadata-only key names/types/status and every authorized writer/owner, including Dashboard, CLI, MCP, poolers/direct clients, backend integrations and jobs. Do not put key values in reports.
2. Stop those writers under their owners' control. Remove/disable every public application key and the legacy anon path using supported staging-only controls; account separately for secret/service-role access. Do not assume this terminates existing Realtime connections or disables direct Postgres access.
3. Demonstrate rejection of anonymous **and stale-session** Auth, PostgREST, Storage and Realtime calls; disconnect existing channels and verify reconnects fail. Verify every remaining administrative writer is explicitly restricted for the window. If any channel remains unaccounted for, stop before migration 00002.
4. Recheck staging baseline/ledger/data after the freeze, take the reviewed pre-window backup, and use exactly one trusted operator channel for normalization and migrations. Keep the freeze throughout all intermediate vulnerable states and security validation.
5. Only after validation, restore/rotate public credentials, update the staging-specific Preview variables under separate authorization, restore writers deliberately, and perform staging client/API smoke checks. No production variable needs changing for this staging operation.

This is an approval-bound operational procedure, not evidence that those controls exist or have worked. Hosted Storage API deletion/replace behavior, authenticated Realtime delivery/confidentiality, actual Preview runtime and real provider booking remain separate validations.

## Failure stop and recovery rules

Run 39149866209 executed the injected cases A–E. B (00007), C (error before 00009), D (00010) and E (00061) retained identical ledger/schema/data/ownership/grants and then successfully applied the original restored migration. A left an empty ledger after alias removal and rejected the invalid second step without other changes; canonical repair recovered it. These observations apply to these exact injected errors on CLI 2.117.0, not arbitrary failures or hosted environments.

The separate error appended after 00009's internal COMMIT **did leave committed effects without a 00009 ledger row**: six demo clinics, twelve demo doctors, no users/patients and the messages publication were verified. The owned disposable database was rebuilt from the exact timestamp baseline, then normalized and replayed again. Therefore **never blindly replay 00009 or mark it applied after a failure**. Hosted recovery requires full inspection and, where partial effects remain, restoration from the reviewed pre-window backup under separate approval; a disposable reset is not a hosted recovery procedure.

| Failure point                 | State to verify before any retry                                                                                                                                                                                                            | Safe default                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| During history normalization  | Exact `schema_migrations` rows; compare schema and data snapshots with the pre-normalization baseline. `migration repair` is history-only by documented contract.                                                                           | Keep traffic frozen. Do not push migrations until the ledger is exactly either the known timestamp alias or canonical `00001`; repeat only the specific reviewed local-equivalent repair step.                     |
| Before `00008`                | Last recorded version; inspect schema/catalog drift and whether the failed migration left effects without a ledger row.                                                                                                                     | Stop. Do not use `migration repair` to conceal drift. Restore the pre-window backup if effects are partial or unclear; otherwise apply a reviewed forward correction after rehearsal.                              |
| After `00008`, before `00009` | Ledger and exact IDs/counts/row values of all four seed tables. `ON CONFLICT DO NOTHING` does not prove a partially inserted fixture set is complete.                                                                                       | Keep public/Auth traffic frozen. Do not retry blindly. Restore the pre-window backup if fixture state is incomplete or ambiguous.                                                                                  |
| After `00009`, before `00010` | Ledger, all effects before its internal `BEGIN`, Realtime publication flags/members, provider flags, and seeded row state. `00009` contains an internal `BEGIN`/`COMMIT`; do not assume that equals the CLI migration transaction boundary. | Keep traffic frozen. Do not rerun or repair history until the actual schema and publication state are understood; prefer restore from the pre-window backup if partial effects cannot be proven safe.              |
| In any later migration        | Last ledger row plus catalog/schema/data diff against the recorded pre-window backup.                                                                                                                                                       | Stop all writes and clients. Do not mark the failed migration applied. Restore from backup when atomicity or partial state is uncertain; resume only after a disposable reproduction validates the exact recovery. |

Before the real window, retain the exact successful rehearsal evidence and verify a staging-specific backup/restore procedure. The injected rollback cases prove controlled retry only when their unchanged-state checks pass; they do not justify retrying an unknown SQL failure. The normal isolated migration suite is not a substitute for these failure cases.

## Release gate

Disposable rehearsal gates passed on `e980d488…`; they do not authorize hosted operations. Before any separately approved staging migration, verify the staging-specific maintenance freeze across every writer, recheck the live baseline/ledger after that freeze, establish the pre-window backup/restore procedure, and obtain explicit hosted-operation approval. Hosted Storage API, authenticated Realtime confidentiality and actual provider/client smoke tests remain outstanding. Production remains completely outside this task.

Historical classification at the time of the earlier evidence: **KEEP DEMO FIXTURES IN STAGING**; **FREEZE PLAN INCOMPLETE**; **READY FOR STAGING REHEARSAL**. Superseding result: the final local recovery/restore rehearsal passed at source `34b8863fb06f8ffd78165396137ddb00a9e6e821`; see below. This does not establish a hosted writer freeze or authorize a hosted staging migration.

## Final disposable rehearsal — 2026-10-19

[GitHub Actions run 39212447344](https://github.com/h4timfr/care-connect-chennai/actions/runs/39212447344), exact source SHA `34b8863fb06f8ffd78165396137ddb00a9e6e821`, completed successfully. The migration manifest verified all 40 checked-in files by hash. The staging-shaped timestamp baseline was reproduced and normalized with 39 pending migrations; all 40 ledger entries were verified after replay.

The fresh-target logical restore passed in the same disposable Supabase/PostgreSQL cluster, with schema, data, owner, grant, publication and ledger fingerprints equal and source unchanged. The earlier `--clean` probe's DROP POLICY missing-object failure remains documented; the actual fresh-target restore uses no `--clean` and the pre-existing local `supabase_admin` superuser after checking `rolsuper`. No hosted backup or restore was attempted.

Recovery fault cases A–J passed. The independent `00009` post-COMMIT injection again demonstrated committed partial effects without a `00009` history row; the owned stack was rebuilt and replayed. This confirms why hosted recovery must stop for explicit reconciliation instead of retrying blindly or fabricating a ledger entry.

The runner applied the exact 39 pending repository migrations; SQL tests 001–021 passed (**21 files, 479 assertions**); all nine independent-session booking scenarios passed; owned fixture cleanup and disposable stack cleanup passed. The paired frontend job passed lint, typecheck, production build, Supabase configuration tests and the complete mocked Chromium suite (**267 passed**). These results do not validate hosted Storage API behavior, authenticated Realtime confidentiality, Preview runtime, or real-provider booking.

The uploaded artifact contained only allow-listed summaries; present entries were inspected in memory for unexpected paths and credential/URL patterns. No SQL dump or raw CLI output was included. Final status is **READY_FOR_HOSTED_READ_ONLY_VERIFICATION**, not ready for a hosted migration. Writer freeze, staging-specific backup/restore, post-freeze schema reconciliation, legitimate Vercel visibility, and explicit migration approval remain open.
