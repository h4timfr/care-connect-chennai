# Staging writer freeze — approval required

Status on 2026-10-19: **NOT FROZEN**. No hosted control was changed. Staging metadata was read under explicit read-only authorization. A quiet database, zero rows, disabled signup, disabled Preview deployment, or one removed API key is insufficient evidence of a freeze.

Target must be confirmed by control-plane identity as `careconnect-staging`, ref `aqwzrpwiqbrykorlqwow`. Never derive the target from an inherited CLI link or from a hostname typed from memory. Production is excluded. Do not run the disposable rehearsal script against hosted infrastructure.

## Required writer register

For each channel record owner, exact supported control, approver, change time, independent rejection evidence, and reversal procedure. Keep identifiers and credentials in restricted operator records, not this repository or CI artifacts.

| Channel | Required evidence before migration |
| --- | --- |
| Browser and mobile clients, old Preview builds | All staging callers inventoried; rejected application requests using each modern publishable key and legacy anon path, with anonymous and existing-session contexts |
| Auth signup, token refresh, existing user sessions | Supported staging-only restrictions confirmed by actual rejection tests; disabling signup alone does not block existing sessions or database writes |
| PostgREST and GraphQL | New and existing authenticated request paths blocked; test permissions do not authorize mutation probes on hosted data |
| Storage | Upload, replace and delete writer paths controlled; metadata-only SQL inspection does not demonstrate API rejection |
| Realtime | Existing channels disconnected under approval; reconnects rejected; changing a public key does not prove existing sockets were closed |
| Secret and legacy service-role integrations | Every backend/Edge Function/webhook owner stops its writer; public-key restrictions do not cover these credentials |
| Direct Postgres and transaction/session poolers | Identify connection owners and control both new connections and existing transactions; active-transaction census repeated after restrictions |
| pg_cron, pg_net and external scheduled jobs | Inventory actual jobs, retries, queues and in-flight requests without printing commands/URLs/secrets; absence of `cron.job` does not establish absence of external jobs |
| Dashboard, CLI, MCP, CI, support/operator accounts | One designated migration operator; other privileged writers explicitly excluded for the maintenance window |

Current read-only observation: four idle client connections, one active inspection connection, pg_cron launcher and pg_net worker were visible. `cron.job` was absent and neither extension was listed as installed. These processes are not evidence of an application job, nor proof that no writer exists. No query text, connection address, credential or patient content was read.

## Ordered operation for a separately approved window

1. Obtain written authorization naming project, source SHA, immutable migration hashes, operator, time window, controls, restore destination, recovery owner and unfreeze authority. No blanket approval from this document.
2. Verify project identity, Vercel staging variable selection and all writer owners. Current Vercel team visibility is unverified after the prior 403; obtain legitimate project/team read permission, never substitute credentials.
3. Apply only the separately approved supported controls. Do not improvise network, Auth, key or database settings. Do not alter production-scoped variables.
4. Independently verify rejection of all writer paths, including stale sessions and trusted channels. Any uncertain path means STOP before `00002`. Intermediate role/booking/trigger states are unsafe for untrusted traffic.
5. Run the reviewed metadata-only inventory in `scripts/staging-readonly-inventory.sql`. Record role/RLS/function/grant/publication fingerprints and aggregate counts privately. Require the exact one-entry timestamp baseline, no application/Auth/Storage rows, existing empty publication and approved schema equivalence. A SELECT snapshot does not freeze subsequent writes.
6. Complete the backup/restore runbook and preserve pre-window evidence off the source tree. Reconfirm there are no in-flight unaccounted writers.
7. One operator performs only the separately approved normalization and one-migration-at-a-time plan. Capture sanitized status and exact ledger checkpoints; no credentials or raw SQL diagnostics in public logs. Stop on any unexpected state. Use the recovery matrix, especially the `00009` internal-COMMIT hazard.
8. Keep the freeze through all final authorization/grant/booking checks. Do not import candidates or enable demo providers. Hosted smoke tests need their own approved identities/data and write scope.
9. Obtain **written unfreeze approval** after evidence review. Restore channels deliberately; verify intended staging URL/key selection, stale sessions and pending work. No automatic unfreeze in `finally`, timeout handling, or failure recovery.

The [Supabase API-key guide](https://supabase.com/docs/guides/getting-started/api-keys) describes separate modern and legacy key paths. Account for each; changing one does not establish a comprehensive freeze.
