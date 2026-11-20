# Staging backup and restore — approval required

Status: hosted backup capture and restore **NOT EXECUTED**. No hosted backup is claimed restorable. The same-cluster disposable logical restore passed in run 39212447344; it does not validate hosted backup or restore readiness.

## What the disposable experiment can prove

After reproducing empty `00001` plus the timestamp ledger, the rehearsal uses the owned container's matching `pg_dump` to make a custom-format backup. It creates a uniquely named database in that same disposable cluster from `template0`. The first `--clean --if-exists` probe reproduces the observed missing-object failure at a DROP POLICY operation; this is not the recommended fresh-target restore. The owned empty target is recreated, then the actual restore uses `pg_restore --exit-on-error --single-transaction` without `--clean`. It requires identical schema/data/owner/grant/publication fingerprints and exact ledger identity, and checks that the original database stayed unchanged. Finally it removes only its own restore database and dump. No backup contents are uploaded.

The clean probe's DROP POLICY missing-object failure and diagnostic run `2dcceb0`'s ALTER ownership/SET ROLE failure were both resolved without suppressing restore errors. Source `34b8863` requires the already-existing `supabase_admin` role to have `rolsuper=true` and uses it only through `docker exec` in the uniquely owned disposable container. The final restore passed while retaining ownership/ACL restoration. It does not grant privileges, strip ownership/ACLs, or create a hosted administrator. Never infer that this local administrator is available on hosted Supabase.

This tests logical database restore mechanics with existing global roles, installed extension binaries and the same PostgreSQL cluster. It does **not** test restoration of cluster roles/passwords, separate-host configuration, encryption roots, service configuration, Storage object bytes, active Realtime subscriptions, external jobs, hosted backup retention or a real staging recovery point. Empty local Auth/Storage data cannot validate recovery of nonempty hosted data.

## Required hosted evidence before approving migrations

1. Confirm staging identity and writer freeze using the companion runbook. The observed baseline has only `20261009041700 / 00001_initial_schema`; recheck after the freeze.
2. Select an operator-approved capture mechanism appropriate to the actual staging plan, PostgreSQL version and managed roles/extensions. Confirm availability and cost without enabling a paid feature. The rehearsal's same-cluster restore is not an approved hosted restore command.
3. Include schema, table and column grants, ownership, RLS, function definitions/ACLs/search paths, triggers, indexes, types, sequences, extensions, ledger **data**, Auth metadata, Storage metadata, publication definitions and application data. Inventory roles and externally managed configuration separately; never export key values into source control.
4. Determine whether Storage object bytes exist. Database backups cover metadata, not Storage file bytes. If any exist, define separately approved byte backup and integrity checks. Revalidate even if the previous count was zero.
5. Store encrypted backup material in an authorized restricted destination outside Git/Actions artifacts. Record hashes, capture time, tool/server versions, intended source identity, retention, owner and restoration instructions. A successful dump exit is only capture evidence.
6. Obtain authorization for a suitable disposable **restore target**, compatible managed prerequisites and any hosted-data handling. Restore the actual captured backup, compare ledger/schema/data/grants/roles and execute approved access checks. Record elapsed recovery time and exceptions. Do not create a cloud project or incur costs without approval.
7. Require a successful restore review before the migration window. Define acceptable recovery point/time and who can approve an actual restore or forward correction. Keep writers frozen on failure.

## Failure decisions

- Before a migration commits: retry only after evidence shows exact pre-step state and the original error has been understood.
- Ledger row present but acknowledgement lost: inspect actual ledger and effects; do not replay blindly.
- `00009` effects committed with no ledger row: **STOP**. Do not synthesize history, automatically repair, drop the managed publication, or rerun blanket demo classification. Inspect all effects and obtain approval for the reviewed restore or a separately rehearsed reconciliation.
- Unknown drift, concurrent writer, or failed restore: keep the freeze; escalate to the designated operator. Do not fall back to production or drop/rebuild hosted schemas.

Official references checked 2026-10-19: [Database backups](https://supabase.com/docs/guides/platform/backups), [backup and restore with CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). The latter documents additional managed prerequisites; copying example commands is not authorization to run them here.
