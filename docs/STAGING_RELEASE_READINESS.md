# CareConnect staging release readiness

Date: 2026-10-19 (Asia/Calcutta). Starting reviewed source: `e980d488bf58eb712da8104808fec022a807a3a2`, existing PR #2 / `claude/careconnect-frontend-repair`.

Current verdict: **READY_FOR_HOSTED_READ_ONLY_VERIFICATION**. The isolated restore and fault-injection run now passes, so an operator can proceed with the next read-only hosted verification steps. This does **not** authorize a hosted migration. The original checkout at `baa49df2a76a9ef3fb9e3357b5372e9999fbad03` retains its 19 modified and four untracked files; CI validates the isolated published source, not those unpublished edits.

## Executed baseline evidence

- [Staging-shaped rehearsal 39150803643](https://github.com/h4timfr/care-connect-chennai/actions/runs/39150803643) and [clean stack 39150803654](https://github.com/h4timfr/care-connect-chennai/actions/runs/39150803654) passed on `e980d488`: canonical normalization preserving schema/data/grants; exact 39 pending migrations and 40 final ledger entries; SQL 001–021, 479 assertions; eight independent-session booking scenarios; cleanup; recovery A–E; 267 mocked Chromium tests.
- Current local helper tests passed **66/66**, and `npm run test:supabase-config` passed **10/10**. The final-source CI job in run 39212447344 also passed lint, typecheck, production build and whitespace checks. YAML validation used installed `js-yaml`; the initially requested `yaml` package was absent, and none was installed to replace it.
- First new [run 39179179429](https://github.com/h4timfr/care-connect-chennai/actions/runs/39179179429), source `b00e8cdca5628b34b966b70e03ceadfaa0da1ff9`, failed during the new restore experiment, before SQL/concurrency. Cleanup succeeded. It is not a database validation pass. The initial sanitized diagnostic could not identify the cause and cleanup overwrote the stage label; `03f35850824cac97ae114df283ed5dce0718f385` adds fixed error categories and preserves the first failing command stage.

## Hosted read-only observations this sprint

Additional executed evidence: [clean stack 39211320826](https://github.com/h4timfr/care-connect-chennai/actions/runs/39211320826), exact source `6322f66fc5c9658529c2898dc902b1fc6d4bb00e`, passed: 40 migration attempts and matching ledger entries; SQL 001–021, 479 assertions; all nine booking regression checks; owned fixture cleanup. Lint, typecheck, build and whitespace job passed. Its four artifact entries (`startup.log`, `ledger.log`, `pgtap.log`, `concurrency.log`) were inspected in memory for unexpected filenames and credential/URL patterns; none matched. No raw logs or backup were present.

Run 39211320842's database job failed during restore, and its browser job was canceled by the next checkpoint. Diagnostic source `2dcceb0af00a8c35babc9a258ebe5c601992d3e5` identified an ALTER ownership/SET ROLE requirement. The final [rehearsal 39212447344](https://github.com/h4timfr/care-connect-chennai/actions/runs/39212447344) passed restore, recovery A–J, all SQL tests and all nine booking checks. Its matching frontend job also passed lint, typecheck, production build, configuration tests and all 267 mocked Chromium tests. Source `34b8863fb06f8ffd78165396137ddb00a9e6e821` requires the already-existing local administrator only within the owned disposable container; it does not grant roles or authorize any hosted restore.

Control plane confirmed `careconnect-staging` / `aqwzrpwiqbrykorlqwow`, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003. A single aggregate/catalog SELECT confirmed:

- Exact sole ledger entry `20261009041700 / 00001_initial_schema`.
- Zero Auth users, application users/patients, clinics, doctors, links, schedules, appointments, conversations, messages, Storage buckets and objects.
- `supabase_realtime` exists, not FOR ALL TABLES, all four event flags enabled, no members.
- No candidate tables and no `cron.job` relation. Installed extension versions: pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1.
- Session aggregate showed one active inspection client, four idle clients, a pg_cron launcher and pg_net worker. These are not classified as application writers without owner/configuration evidence.

No patient rows, message content, connection addresses or query text were read. A preliminary multi-statement inspection returned only one result set, so it was not used as ledger/count evidence; the combined JSON SELECT above supplies the observations. No hosted configuration or database writes occurred. This snapshot is not a writer freeze and must be repeated after an approved freeze.

## Gates that remain open

1. **Writer freeze:** control inventory, every modern/legacy public and trusted writer path, stale sessions/sockets, existing connections and privileged operators remain unverified. Use [freeze runbook](STAGING_WRITER_FREEZE_RUNBOOK.md).
2. **Actual hosted backup/restore:** no hosted capture or restore executed. A same-cluster disposable experiment is not a real staging recovery point. Use [backup runbook](STAGING_BACKUP_RESTORE_RUNBOOK.md).
3. **Exact schema reconciliation after freeze:** ledger identity is not complete schema equivalence. Review actual policies/functions/grants/owners and source hashes, especially locally edited historical 00055 and absent 00024–44 on unknown environments. Use [recovery matrix](MIGRATION_RECOVERY_MATRIX.md).
4. **Explicit migration/unfreeze approvals:** one named operator, scoped window and recovery policy; separate written unfreeze approval after checks. No automatic history repair for ambiguous 00009.
5. **Hosted integration evidence:** Storage API replace/delete, independent authenticated Realtime delivery/confidentiality, real Preview runtime and real-provider booking remain unverified. Publication membership and SQL policy tests are narrower evidence.
6. **Vercel visibility:** the explicitly scoped project/team read-only deployment inventory returned HTTP 403 again on 2026-10-19. No installed `vercel` CLI was available for the mapped fallback. Obtain legitimate team/project read access; do not bypass protection or assume reauthentication alone resolves authorization. Branch Git deployment remains disabled by `vercel.json`; no deployment commands were issued.

## Product/security scope

Existing SQL covers patient/clinic/doctor/admin authorization, candidate isolation, publication/contact/booking separation, schedule guards, protected state and identity, grants, Storage policy/protect_delete and demo isolation. The expected retained fixtures remain six demo clinics, twelve demo doctors, twelve pending relationships and 64 schedules. They cannot become approved providers through research import or UI decoration.

Booking scenarios cover patient cap, same slot, successful-slot retry rejection, rollback, sixth request, cancellation vs booking, publication vs booking, schedule edit vs booking and doctor-fee update vs booking. The fee test preserves the already booked fee, rejects stale occupied-slot availability and uses the new fee on subsequent booking. `00061` rejects unsupported transaction isolation and mass-assignment rescheduling. No rescheduling RPC is implemented; no reschedule race is claimed tested. Request retries reject duplicates rather than providing an idempotency-key response. Realtime authenticated delivery and Storage API behavior need explicit integration checks; publication membership and SQL policy tests do not supply those checks.

## Human approval sequence

The ninth executed booking regression adds an independently blocked doctor-fee update, preserves the committed appointment's old fee, rejects the previously advertised occupied slot, and verifies that a subsequent booking uses the new authoritative fee. It does not constitute hosted provider or payment validation.

Next action: arrange authorized **read-only** hosted staging verification, then obtain operator evidence for writer freeze and backup procedures. Vercel's scoped inventory still returns 403 and needs legitimate team/project access. Only after those gates should anyone request migration approval. Keep production outside that authorization. This source/test campaign does not itself approve hosted changes.
