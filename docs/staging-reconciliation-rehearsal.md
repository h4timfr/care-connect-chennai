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

This document describes a disposable local rehearsal for the staging history shape. It is not evidence that the rehearsal ran, that a hosted migration is safe, or that staging is frozen.

The repository contains 40 migrations: `00001–00023` and `00045–00061`. Staging's only recorded row is `20261009041700 / 00001_initial_schema`; that row's effects were independently compared with repository migration `00001`. The proposed canonical ledger must contain `00001` and the exact pending set `00002–00023, 00045–00061` (39 versions). There are no repository migrations `00024–00044`; do not invent or mark any as applied.

The disposable rehearsal starts from repository `00001`, zero application/Auth and Storage rows, and an existing empty `supabase_realtime` publication. It uses a temporary copy of the repository, a unique local Supabase project ID, explicit `--local` CLI operations, a loopback-only database URL guard, and no hosted credentials. Reconciliation operations use `supabase migration repair --local`; according to the [Supabase migration documentation](https://supabase.com/docs/guides/deployment/database-migrations), repair changes the history table only and does not apply or revert migration SQL. Schema/data snapshots exclude only migration-history rows.

## Demo-seed disposition

**Decision: KEEP DEMO FIXTURES IN STAGING.** This is the preferred truthful migration path, subject to execution of the disposable state-specific rehearsal and final SQL suite.

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

Migration `00009_production_hardening.sql` adds `is_demo` and marks the rows existing at that point. On the empty baseline with no client writes, this classifies the six clinics and twelve doctors from `00008`; users and patients remain empty. The later state transitions reject publishing a demo clinic, public reads require a non-demo verified published clinic and an active verified relationship, the slot RPC requires eligible provider state, and the final booking RPC rejects demo/unverified/unpublished/unbookable providers. The public frontend query also filters `is_demo = false`. These are static findings; the newly added test `021_demo_seed_publication_boundary.test.sql` and complete staging-state replay have not executed.

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

## Failure stop and recovery rules

The items below are required operator behavior, not results of executed failure injection. No migration failure-recovery scenario has yet run against PostgreSQL.

| Failure point                 | State to verify before any retry                                                                                                                                                                                                            | Safe default                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| During history normalization  | Exact `schema_migrations` rows; compare schema and data snapshots with the pre-normalization baseline. `migration repair` is history-only by documented contract.                                                                           | Keep traffic frozen. Do not push migrations until the ledger is exactly either the known timestamp alias or canonical `00001`; repeat only the specific reviewed local-equivalent repair step.                     |
| Before `00008`                | Last recorded version; inspect schema/catalog drift and whether the failed migration left effects without a ledger row.                                                                                                                     | Stop. Do not use `migration repair` to conceal drift. Restore the pre-window backup if effects are partial or unclear; otherwise apply a reviewed forward correction after rehearsal.                              |
| After `00008`, before `00009` | Ledger and exact IDs/counts/row values of all four seed tables. `ON CONFLICT DO NOTHING` does not prove a partially inserted fixture set is complete.                                                                                       | Keep public/Auth traffic frozen. Do not retry blindly. Restore the pre-window backup if fixture state is incomplete or ambiguous.                                                                                  |
| After `00009`, before `00010` | Ledger, all effects before its internal `BEGIN`, Realtime publication flags/members, provider flags, and seeded row state. `00009` contains an internal `BEGIN`/`COMMIT`; do not assume that equals the CLI migration transaction boundary. | Keep traffic frozen. Do not rerun or repair history until the actual schema and publication state are understood; prefer restore from the pre-window backup if partial effects cannot be proven safe.              |
| In any later migration        | Last ledger row plus catalog/schema/data diff against the recorded pre-window backup.                                                                                                                                                       | Stop all writes and clients. Do not mark the failed migration applied. Restore from backup when atomicity or partial state is uncertain; resume only after a disposable reproduction validates the exact recovery. |

Before the real window, run each failure injection in a separate disposable database, record schema/ledger/data effects, and prove retry or restore. The normal isolated migration suite is not a substitute for those failure cases.

## Release gate

Do not migrate staging until the rehearsal executes and confirms timestamp normalization, the exact 39 pending versions, each checkpoint through `00061`, all pgTAP files `001–021` with the exact planned total, the eight two-session booking scenarios, fixture rollback/cleanup, final demo visibility/booking boundaries, and the failure-recovery cases. Then separately verify the staging-specific maintenance freeze with trusted channels accounted for. Production remains out of scope.
