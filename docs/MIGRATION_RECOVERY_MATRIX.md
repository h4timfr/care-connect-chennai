# Migration integrity and recovery matrix

Reviewed source baseline: `e980d488bf58eb712da8104808fec022a807a3a2`. `scripts/migration-integrity.json` pins all 40 exact filenames and SHA-256 values after CRLF-to-LF conversion only. It is an integrity manifest, **not** a migration ledger or proof of hosted deployment. The rehearsal rejects missing, extra, renamed or changed source files. A future intentional migration requires explicit manifest and inventory review.

Order is `00001–00023`, then `00045–00061`. No placeholder or guessed SQL is supplied for `00024–00044`. Clean and staging-shaped local execution proved this checked-in chain can bootstrap the tested application schema; it does not reconcile an unknown environment's missing historical versions. No production comparison was performed.

## Per-migration effects and prerequisites

Every row depends on the preceding canonical chain as well as its highlighted prerequisites. All except `00009` have no top-level internal transaction boundary in the reviewed source. Function-body `BEGIN/END` is not a transaction command. Default recovery for **every** row is stop and inspect ledger plus effects; the table does not authorize blind retries. `CREATE OR REPLACE`, `IF NOT EXISTS`, or a header saying idempotent cannot prove complete replay safety.

| Version | Required objects / main effects | Replay and security concern |
| --- | --- | --- |
| 00001 | Managed Auth functions/roles; creates enums, users/patients/providers, schedules, appointments, conversations/messages, indexes/RLS | Non-idempotent base; broad initial public policies are temporary. Timestamp alias must be proven equivalent before canonical repair. |
| 00002 | 00001 users/appointments; consent fields, audit_logs, Auth/profile triggers, booking RPC, removes direct patient INSERT | Signup accepts user metadata role until 00003. Non-idempotent columns/triggers; traffic must already be frozen. |
| 00003 | 00002 triggers/audit/booking; forces patient signup, hardens RPC and grants | Replaces early definitions; no exposure interval allowed, even if next migration is quick. |
| 00004 | 00002 profile trigger functions | Revokes inherited client EXECUTE; does not disable trigger invocation. |
| 00005 | clinic_staff and original participant policies | Adds private SECURITY DEFINER membership helpers, replaces recursive RLS; review helper owner/ACL. |
| 00006 | users.role, clinic_staff, 00005 helpers | Copies roles/memberships, drops old role column and clinic_staff; adds link verification and rewrites signup. Data-transforming and destructive; not a generic retry. |
| 00007 | 00006 application tables | Adds provider/patient presentation columns and notifications/RLS; non-idempotent ALTER/TABLE/POLICY. Used for transactional fault cases. |
| 00008 | 00007 columns, clinics/doctors/links/schedules | Inserts exact 6/12/12/64 synthetic fixtures. Conflict tolerance does not prove complete seed equivalence. No Auth/users/patients created. |
| 00009 | 00006 link state/helpers, 00002 audit; existing empty managed publication | Blanket is_demo classification, booking replacement, internal BEGIN/COMMIT and ADD messages. Missing/all-tables/already-member publication is not the tested baseline. Post-COMMIT failure can preserve effects without history. |
| 00010 | 00009 helpers/publication | Restores helper EXECUTE, **drops/recreates publication**, adds duplicate-slot index and update trigger; trigger still refers to removed clinic_staff. No clients until later fixes. |
| 00011 | 00010 appointment trigger | Replaces validation/ACL; intermediate trigger is superseded and must not be used as final authorization evidence. |
| 00012 | 00011 appointment trigger | Further mass-assignment restrictions; superseded by 00013. |
| 00013 | clinic_memberships, appointments and conversation/doctor/link tables | Fixes dropped-table reference; replaces indexes, guards doctor identity/link verification, conversation updates. Duplicate active appointments must be absent. |
| 00014 | audit_logs and 00013 guards | Adds status/link audit events, hardens trigger EXECUTE; final appointment body later replaced. |
| 00015 | patients saved-ID arrays from 00007 | Auth-bound atomic save toggles with ACLs; no client-supplied patient identity. |
| 00016 | membership/appointment/conversation relationships | Staff patient SELECT policy; recursive path later corrected by 00045. |
| 00017 | schedules and appointments | Adds overlap trigger/advisory lock; final duration handling replaced by 00061. |
| 00018 | schedules, appointments | Availability function references obsolete schedule fields; replaced in 00021 before use. |
| 00019 | doctors and identity trigger from 00013 | Protects primary key/user linkage/rating fields; later admin linkage handled in 00054/55. |
| 00020 | clinics | Adds primary-key update guard. |
| 00021 | actual recurring schedule columns from 00001 | Corrects availability function field assumptions; later ACL removes client execution. |
| 00022 | availability signature from 00021 | Grants anonymous availability access; intentionally superseded by later ACL cleanup. |
| 00023 | schedules and appointments | Adds legacy two-argument slot RPC; later removed by 00058. |
| 00045 | 00016 patient policy, memberships and participant tables | Replaces recursive patient staff policy with private helper and explicit authenticated SELECT. No missing 00024–44 object is required on the verified clean chain. |
| 00046 | conversation policy from 00005 | Drops staff conversation INSERT; patients initiate conversations. |
| 00047 | link verification, recurring schedule and appointment state | Adds clinic-aware slot overload and explicit anon/authenticated execution. |
| 00048 | booking signature/audit/patient/link/schedule | IST slot-window and alignment validation; final RPC supplied by 00061. |
| 00049 | conversations kind/patient/clinic | Unique general-conversation index; stop on duplicate groups, never delete conversations to force it through. |
| 00050 | accumulated function signatures | Revokes client EXECUTE for internal/trigger/obsolete availability functions. |
| 00051 | existing public tables and RLS | Removes broad anonymous grants and dangerous authenticated TRUNCATE/TRIGGER/etc.; retained discovery SELECT later narrowed to columns. |
| 00052 | user_roles/audit_logs from 00006/02 | Private admin predicate breaks policy recursion; authenticated review remains scoped. |
| 00053 | managed storage.buckets/objects, Auth UID and authenticated role | Upserts private avatars bucket and owner-only policies. Upsert can change existing bucket configuration; managed protect_delete behavior must remain. |
| 00054 | 00052 admin predicate, provider/link/member state | Application/onboarding review, guarded doctor/link writes and admin RPCs; pending links must not grant doctor editing. |
| 00055 | 00052–54 helpers, doctor user linkage and memberships | Doctor application/portal RPCs and restrictive active/verified schedule policies. Header LOCAL ONLY is not deployment evidence. Do not replay over a differently deployed 00055 on the strength of an idempotency claim. |
| 00056 | admin predicate and reviewed provider workflow | Six isolated candidate/evidence/contact tables, RLS/grants/guards; no candidate-to-provider import. |
| 00057 | provider/admin guards and booking/slots | Deny-default verification/publication/contact/booking states, protected admin transition, conversation INSERT gate. State update trigger corrected in 00058. |
| 00058 | 00057 capabilities and admin predicates | Publication-scoped reads, invoker state trigger, immutable contact actor snapshot; drops legacy slot overload. |
| 00059 | 00058 publication predicates and 00055 schedule guards | Column-only public clinic projection, privileged contact RPCs, public schedule boundary. RLS alone cannot hide contact columns. |
| 00060 | final booking eligibility, patient rows and active bookings | Per-patient row lock serializes five-booking limit; later RPC adds eligibility/schedule locking. |
| 00061 | 00060 booking, overlap trigger, schedules and update guard | READ COMMITTED requirement, locked eligibility/schedule/doctor-date, branch duration overlap, prevents edits invalidating future bookings; non-idempotent new schedule trigger. |

## Fault cases and decisions

Final execution evidence: [run 39212447344](https://github.com/h4timfr/care-connect-chennai/actions/runs/39212447344), exact source `34b8863fb06f8ffd78165396137ddb00a9e6e821`, passed the same-cluster fresh-target restore and **all cases A–J**, then rebuilt the owned baseline and replayed the full chain. The separate `00009` post-COMMIT test again confirmed partial committed effects can remain without a ledger row. Each injection and cleanup succeeded on the disposable CLI 2.117.0 stack; none changes the hosted recovery rule: inspect exact effects and stop for operator approval when state is ambiguous. A unit test or static matrix alone is not execution evidence.

| Case | Injected/observed condition | Required decision |
| --- | --- | --- |
| Preflight | Source hash/version/target mismatch, before database write | Stop; correct the reviewed inputs. No history repair. |
| A | Alias removed, invalid second repair fails, ledger empty | Verify full schema/data/ACL fingerprint is unchanged; complete only the approved canonical normalization. No general replay. |
| B/C/D/E | Error in 00007 / before 00009 / end of 00010 / end of 00061 | Require unchanged ledger AND schema/data/roles/grants before retrying original source. Previous controlled cases passed. |
| F | Real CLI ledger INSERT rejected by a disposable trigger after transactional DDL | Verify rollback with the trigger still present; remove only owned injection, verify pre-state again. Not a hosted trigger change. |
| G | Terminate the exact observed disposable migration backend during delayed 00007, before history | Await failed CLI, verify rollback and no history row. Network failure with unknown commit point remains ambiguous. |
| H | Two independent CLI processes apply the same pending non-idempotent 00007 | Require one winner, one failure, one ledger row and expected effects. This tests collision behavior; it does not license concurrent migration operators. |
| I | Successful recorded migration, then simulated lost acknowledgement/no-op retry | Require exact ledger plus unchanged schema. Do not interpret absence of client output as rollback. |
| J | Add/drop a disposable schema probe without changing the ledger | Snapshot comparison must detect drift; ledger equality alone is insufficient. |
| 00009 post-COMMIT | SQL effects committed, appended error before CLI history insert | **Manual reconciliation / operator approval required.** Never auto-repair, mark applied or blind retry. Disposable test rebuilds its owned baseline; hosted reset is prohibited. |
| Partial chain | Any known checkpoint before 00061 | Keep all writers frozen. Later fixes do not protect earlier live states. |
| Unknown/interrupt during recovery | Operator stops after any recovery step | Re-inventory actual ledger/schema/data/ACLs. Do not assume previously planned or started steps completed. |

## Limits

Snapshots cover schema, application/Auth/Storage data, owners/grants, role attributes/memberships and publications; they intentionally exclude ledger **data** for normalization comparisons, so ledger identity is verified separately. No database API acts on this matrix. Hashes are integrity signals, not an automated semantic SQL audit. ACL/default-privilege differences, nonempty Auth/provider records, changed publication membership or managed extensions invalidate the clean staging assumptions.

The pinned [CLI migration implementation](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/migration/file.go) appends history recording after migration statements. The executable local rehearsal, rather than a generic transaction assumption, is the evidence for each observed failure case. Hosted recovery requires the writer-freeze and backup/restore approval gates.
