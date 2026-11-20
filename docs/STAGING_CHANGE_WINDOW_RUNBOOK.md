# Staging change window: operational gate
Date: 2026-10-19 UTC. Verdict: **BLOCKED**. No hosted write or freeze is authorized by this document.

## Executed evidence
- Source before this documentation/tooling commit: 75962a1d0298eb3d7b3f65b1c663ef145bab9240; PR #2 open.
- Existing isolated validation: [39212447344](https://github.com/h4timfr/care-connect-chennai/actions/runs/39212447344), source 34b8863: 479 assertions, recovery A–J, nine concurrency scenarios, 267 mocked browser tests. Not rerun here.
- Fresh hosted staging identity: careconnect-staging / aqwzrpwiqbrykorlqwow, ACTIVE_HEALTHY, PostgreSQL 17.11; only 20261009041700 / 00001_initial_schema.
- Auth/application/provider/appointment/message and Storage bucket/object aggregate counts remain zero. Empty non-all-tables supabase_realtime publication; candidate table absent.
- Supabase CLI 2.117.0 installed in npm cache and dump help inspected. Official PGDG PostgreSQL 17.11 portable server, pg_dump, pg_restore and psql extracted in a temporary WSL directory. No system database service installed.
- Docker Desktop launch attempted; Linux-engine pipe stayed unavailable. Native PostgreSQL worked.
- Actual canonical 00001 executed in a fresh socket-only local PostgreSQL 17.11 cluster. Cluster stopped afterward. No shared database used.
- Actual hosted dump/restore NOT EXECUTED: staging DB credential unavailable in checked environment variables and standard credential files. MCP SQL access does not supply a pg_dump credential. No dump files/hashes exist.

## Canonical semantic artifact
scripts/baselines/staging-00001-fingerprint.json is effective PostgreSQL catalog output, not a hash of migration SQL.
Generate with PG_BIN pointing to PostgreSQL 17 binaries and scripts/generate-staging-00001-baseline.sh.
The generator uses an explicit auth.uid signature stub solely for policy DDL resolution. It does not reproduce Supabase Auth behavior or managed bootstrap.
Use scripts/staging-00001-semantic.sql on the verified staging target with SELECT-only authorization; save metadata privately.
Compare with node scripts/compare-staging-baseline.mjs EXPECTED.json OBSERVED.json. Any missing category or difference exits nonzero.

Executed source/local comparison:
| Category | Result |
| --- | --- |
| Schemas, enums, tables/owners/RLS, columns/defaults | MATCH |
| Constraints, indexes, policies/roles/expressions | MATCH |
| Public/private functions and triggers; column grants | MATCH |
| Relation grants | DIFFERENCE: canonical 80 entries; hosted 200, with anon/authenticated/service_role grants in addition to postgres |
| Realtime publication | DIFFERENCE: 00001 creates none; hosted has an empty managed supabase_realtime publication |

The two differences represent external Supabase bootstrap state. They are not suppressed or accepted as equivalent.
Full baseline verdict: MISMATCH pending explicit review of managed grants/publication prerequisites.
The snapshot scope excludes managed auth/storage definitions, schema ACLs and default ACLs; full managed-platform recovery remains unproven.

## Vercel access evidence
Authenticated connector user: h4timfr. Team listing returned empty.
Explicit team scope returned 403; exact project-ID reads WITHOUT that filter succeeded through the same authorized connector.
Project: care-connect-chennai / prj_VKP1w3zbEtpFsHJ1uhwnlanXgxoe.
Read-only environment metadata confirms VITE_SUPABASE_TARGET, VITE_SUPABASE_STAGING_URL and VITE_SUPABASE_STAGING_PUBLISHABLE_KEY exist for preview.
No values were decrypted/read. Their actual backend target is therefore not proven.
Branch deployments are visible; latest observed READY deployment is commit 2412bac4e070126101e9f0e34385f2c98dd83bcb, not current source. Target field is null.
Repository vercel.json disables automatic deployments for this branch. Existing deployments remain potential callers.
403 workaround is legitimate exact-project access, not permission modification; root cause of explicit-team rejection remains unknown.

## Writer register and future freeze
| Channel | Classification | Missing evidence / required future control |
| --- | --- | --- |
| Browser/mobile/old Preview clients | UNKNOWN | Establish actual staging callers; block new requests and existing sessions under separate approval |
| Preview | UNKNOWN | Variable metadata known; actual target and old deployment callers need owner confirmation |
| Production deployment | UNKNOWN / out of scope | Never inspect or change it in this staging operation |
| Reviewed SQL GitHub workflow | KNOWN READ-ONLY relative to staging | Unlinked disposable local stack, no remote credential use |
| Service-role integrations/webhooks/external jobs | UNKNOWN | Named owners, stop/retry controls and rejection evidence |
| Edge Functions | KNOWN ABSENT at prior read-only inventory | Repeat listing immediately before window |
| pg_cron / pg_net | UNKNOWN overall | Job/queue catalogs absent; managed workers visible; external jobs not excluded |
| MCP/CLI/Dashboard/developer machines | UNKNOWN writer access outside this session | Exclude all operators except named migration operator; this session used SELECT only |
| Direct Postgres/poolers | UNKNOWN | Four idle clients previously observed; identify owners and in-flight transactions without exposing query content |
| Auth/REST/GraphQL/Storage/Realtime | UNKNOWN | Approved API restrictions plus existing-session/socket and trusted-key rejection probes |

Writer inventory remains INCOMPLETE. No freeze was applied.

## Ordered future window (separate human approval required)
1. PRE-FLIGHT: verify current source, integrity manifest, exact staging identity, operator and recovery owner.
2. WRITER FREEZE: resolve every UNKNOWN; approve channel-specific controls; apply only to staging.
3. FREEZE VERIFICATION: independently test rejected writes, stale sessions/sockets, trusted channels and active transactions.
4. FRESH LOGICAL BACKUP: use protected staging-only credential injection; include schema/data/roles/history and separately establish managed Auth/Storage coverage. No dumps in Git or Actions artifacts.
5. Restore actual export to fresh owned LOCAL target, fail on any error, compare all security/schema/data/ledger categories. Record private hashes/sizes/RPO/RTO. No hosted physical restore is claimed.
6. BASELINE RECHECK: exact timestamp ledger, zero/approved counts, reviewed semantic artifact and managed prerequisite differences; stop on drift.
7. MIGRATION-HISTORY NORMALIZATION: review exact hosted invocation separately. Local rehearsal alone does not authorize remote repair.
8. EXACT 39-MIGRATION DRY RUN: require 00002–00023 then 00045–00061. Never include-all, invent 00024–00044, or infer global 00055 deployment status.
9. MIGRATION: one named operator, explicit human approval, sanitized output, stop on error. No hosted command was run in this sprint.
10. POST-MIGRATION SCHEMA/SECURITY: require 40 ledger entries AND matching effective definitions/grants/RLS/triggers; ledger alone is insufficient.
11. STORAGE API TEST: dedicated authorized identities; actual upload/read/replace/delete isolation.
12. REALTIME CONFIDENTIALITY TEST: independent authenticated clients and unauthorized-delivery checks.
13. BOOKING TEST: controlled staging identities and verified eligible providers; no fictional shared data without approval.
14. PREVIEW TEST: verify real runtime backend target and auth/authorization behavior with no secret printing.
15. UNFREEZE: separate written approval, resume channels one at a time, monitor queues and errors.
16. ROLLBACK: only reviewed actual recovery artifact/path with named owner; never production or blind schema reset.

## 00009 emergency procedure
Migration 00009 contains an internal COMMIT.
If failure occurs around 00009:
STOP.
KEEP WRITERS FROZEN.
DO NOT BLIND RETRY.
DO NOT MARK 00009 APPLIED.
DO NOT FABRICATE HISTORY.
DO NOT AUTOMATICALLY UNFREEZE.
Inspect actual ledger, schema, is_demo classification, booking function and Realtime publication.
If exact state cannot be proven, use the approved recovery path or separately reviewed reconciliation.

## Immediate external prerequisite
Provide a staging-only PostgreSQL connection credential via a protected local environment/secret store, never chat or repository.
Native PostgreSQL 17 tools can then capture the actual export without Docker. Capture/restore coverage must still be reviewed.
