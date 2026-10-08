# Provider onboarding and administration

How real clinics and doctors join CareConnect, who can do what, and what still has to happen in
production. The database is the security boundary throughout: the UI only decides what to show.

## Accounts and roles

There is **one** account system: Supabase Auth. Patients, clinic staff and platform administrators
all sign in the same way. What an account may do comes only from rows the database checks:

| Capability                                                      | Granted by                                                                                   | Checked by                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Patient features                                                | every account (a `patients` row is created on sign-up)                                       | RLS on patients, appointments, conversations, messages                       |
| Clinic portal (staff)                                           | `clinic_memberships` row, `active`, role `clinic_staff`                                      | RLS via `private.user_clinic_ids()`                                          |
| Clinic admin (propose doctors, edit verified doctors' profiles) | membership with role `clinic_admin`                                                          | RLS via `private.user_admin_clinic_ids()`, `clinic_propose_doctor`           |
| Platform admin (approve clinics, verify doctors, manage teams)  | `user_roles` row `platform_admin`, assigned out of band                                      | `private.is_platform_admin()` in RLS and every admin function                |
| Doctor portal (00055)                                           | `doctors.user_id` = the account, set only by a platform admin approving a doctor application | `private.my_doctor_ids()`, `doctor_appointments()`, `doctor_conversations()` |

## Three entrances, one account system

| Entrance          | Sign in         | Register                         | Portal      | Opens only when                                               |
| ----------------- | --------------- | -------------------------------- | ----------- | ------------------------------------------------------------- |
| Patient (primary) | `/login`        | `/login?signup=true` (`/signup`) | patient app | signed in                                                     |
| Clinic            | `/clinic/login` | `/clinic/signup`                 | `/clinic/*` | the database returns an active `clinic_memberships` row       |
| Doctor            | `/doctor/login` | `/doctor/signup`                 | `/doctor/*` | the account is linked to a doctor profile (`doctors.user_id`) |

All three use the same Supabase Auth sign-in. Signing in is authentication only: after it, the
clinic and doctor sign-in pages ask the database for the account's membership or doctor link and
open the portal only if it exists. Otherwise they show **Clinic/Doctor access isn't enabled for
this account** and reveal no clinic or doctor data. Signed-out visits to `/clinic/*` and
`/doctor/*` go to the matching sign-in page. `/admin` shows **No admin access** unless the role
check returns `platform_admin`. Every check fails closed, and nothing the browser stores (URL,
local storage, cookies) can grant access: the queries are scoped to `auth.uid()` in the database.

Registering as a clinic or doctor creates (or uses) an ordinary account and submits an
**application**. It never creates a trusted clinic, a membership or a doctor link by itself.

## The onboarding flow

1. **Apply** (`/clinic/signup`, which creates the account first if needed): the applicant gives the clinic's name,
   area, address and registration details, and their own name, role, phone and email. They may
   only insert these content columns; owner and status come from defaults. Each account can have
   at most 3 open applications.
2. **Platform admin reviews** (`/admin` → Clinic applications). Before approving, check the
   registration with the issuing authority and speak to the contact person. Approving runs
   `admin_review_provider_application`, which in one transaction:
   - creates the clinic, not marked as a sample;
   - makes the applicant its `clinic_admin`;
   - records the decision and an audit log entry.
3. **Clinic admin proposes doctors** (`/clinic/doctors` → Propose a doctor) with their medical
   council registration. `clinic_propose_doctor` creates a **new** doctor with a **pending** link.
   It can never attach an existing doctor record.
4. **Platform admin verifies the doctor** (`/admin` → Doctor verification) after checking the
   registration, for example with TNMC or NMC. A verified doctor–clinic link alone does not publish
   the clinic, allow patient messages, or enable booking.
5. **Platform admin controls provider capabilities** (`/admin` → Provider publishing), separately:
   verify the clinic, publish its directory listing, grant patient-contact permission only after
   confirming clinic consent, and enable online booking only when that booking process is live.
   New clinics start pending, unpublished, non-contactable, and not bookable. Samples cannot be
   enabled. Clinic users and patients cannot change these states.
6. **Clinic sets opening hours** (`/clinic/doctors` → Edit hours), allowed only for doctors verified
   at that clinic. Hours alone do not enable booking. `get_doctor_slots` and `book_appointment`
   re-check clinic verification, publication, the independent booking flag, the active verified
   non-sample doctor relationship, and the schedule on every request. Only the clinic-aware
   `get_doctor_slots(uuid, uuid, date)` overload remains; migration 00058 removes the legacy
   two-argument RPC because it could reveal availability without the clinic publication state.
7. **Teams**: platform admins add members by the email of an existing account (`/admin` → Clinic
   teams), choosing staff or admin, and can deactivate or reactivate members.

## Doctor onboarding and the doctor portal (migration 00055)

1. **Apply** (`/doctor/signup`): name, specialty, qualifications, medical council and registration
   number, experience, an optional fee, an optional clinic already on CareConnect (or a free-text
   note), phone and email. Applicants insert content columns only; at most 2 open applications, and
   none once the account is already a doctor.
2. **Platform admin reviews** (`/admin` → Doctor applications) after confirming the registration
   with the medical council. `admin_review_doctor_application` links the applicant's account to a new,
   non-sample doctor profile, or to an existing **unclaimed, non-sample** profile when the admin
   passes `p_existing_doctor_id` (not exposed in the UI yet). Any named clinic gets a **pending**
   link. It refuses sample profiles and accounts that are already linked.
3. **Platform admin verifies the clinic link** (`/admin` → Doctor verification), exactly as for
   clinic-proposed doctors. Until then the doctor is unlisted and unbookable.
4. **Doctor portal** (`/doctor`):
   - **Dashboard:** clinic links and their status, plus upcoming appointments.
   - **Appointments:** via `doctor_appointments()`, which returns appointment fields plus the patient's
     **name only**. Doctors have no read access to patient records or the appointments table.
   - **Schedule:** opening hours, only at clinics where the link is verified and active.
   - **Messages:** read and reply in conversations about this doctor, at verified clinics only.
   - **Profile:** the doctor edits their text, languages, qualifications, experience and their own
     fee. Name, specialty, registration and sample status are CareConnect's.

Pending links grant nothing: no hours, no messages and no listing. Appointment status changes stay
with the clinic.

## Security fix included (migration 00054)

The release audit found that any active clinic member could link **any** doctor to their clinic
(as pending) and then, through `doctors_update_staff`, edit that doctor's public profile and the
consultation fee used for bookings at every clinic. 00054:

- **Doctor–clinic links:** removes the staff write policy on `clinic_doctors`; only platform admins
  create, change or delete links.
- **Doctor edits:** limits them to clinic **admins**, and only for doctors **verified** at their own
  clinic.
- **Doctor trust fields:** `is_demo`, `registration_note`, ratings and the cross-clinic fee can't be
  changed by clinics. The fee can be changed only by the doctor's own account or a platform admin.
- **Clinic trust fields:** `is_demo` and ratings can't be changed by clinic admins.
- **Listings:** 00054 by itself still allows sample doctors and verified active links to be read.
  Migration 00058 supersedes that policy: public reads require a real doctor linked through an
  active verified relationship to a verified, published real clinic. Clinic members retain access
  to their own clinic's pending doctors.
- **Schedules:** can only be written for doctors verified at that clinic.

**Until 00054 is deployed the vulnerability remains in production.** Do not give clinic
memberships to anyone you do not fully trust before then.

## Publication, patient contact and booking (migration 00057)

These are distinct states on `clinics`, all default-deny:

- `clinic_verification_state`: `pending`, `verified` or `rejected`;
- `is_published`: separate permission for directory publication;
- `patient_contact_permission`: `not_granted`, `granted` or `revoked`, with the platform-admin
  actor and timestamp recorded when it changes;
- `booking_enabled`: separate online-appointment capability.

The patient conversation INSERT policy checks ownership, clinic verification/publication, explicit
contact permission, a real active verified doctor–clinic relationship, and any supplied
appointment's patient/clinic/doctor match. Existing participant read policies are unchanged, so
revoking future contact does not erase access to an already-authorized conversation. Candidate
tables are outside the check and are not valid clinic IDs.

Migrations 00057–00059 and SQL tests 006, 010 and 015 are local/reviewable only. They have not been
validated on hosted Supabase or deployed. Migration 00059 is required for the final provider
publication/read/contact/schedule boundaries: it restricts direct clinic reads to safe columns,
provides authorized contact-detail RPCs, and limits anonymous schedule reads to published provider
links. The shared migration history and live schema must be reconciled before any deployment.
Migration 00058 makes provider publication database-enforced, forces protected clinic state through
the audited SECURITY DEFINER RPC, preserves permission-actor UUIDs as historical snapshots, and
removes the legacy `get_doctor_slots(uuid, date)` overload.

## What is ready and what needs the database update

| Part                                                             | Status                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Password visibility, select contrast, redesign, mobile fixes     | Frontend only. Ready.                                                                                        |
| `/providers` information page, clinic sign-in entrance           | Frontend only. Ready.                                                                                        |
| Clinic portal: doctor verification status, opening hours editor  | Works now (existing policies); after 00054 it is limited to verified doctors                                 |
| `/clinic/signup` clinic applications                             | **Needs 00054.** Until then it says applications aren't open yet.                                            |
| Proposing doctors                                                | **Needs 00054.** Until then it says the update isn't deployed.                                               |
| `/admin` console                                                 | **Needs 00052, 00054, 00057, 00058 and 00059.** Until then it fails closed or reports publication controls unavailable. |
| `/clinic/login`, `/doctor/login`, provider entrances on `/login` | Frontend only. Ready (authorization uses existing tables).                                                   |
| Doctor applications in `/admin`                                  | **Needs 00055.** Until then the tab says the update isn't deployed.                                          |
| `/doctor/signup` (doctor applications)                           | **Needs 00055.** Until then it says applications aren't open.                                                |
| Doctor portal (`/doctor/*`)                                      | **Needs 00055.** Before it no account is linked to a doctor, so everyone sees "Doctor access isn't enabled". |
| Provider-candidate review (`/admin/providers`)                   | **Needs 00056.** Until then it says the update isn't deployed. Empty until research is imported.             |

## Deploying (manual, by the database owner)

Nothing here is applied automatically.

1. Establish and verify the complete shared migration history and live schema before applying
   anything. The intended local sequence is `00052` → `00053` → `00054` → `00055` → `00056` →
   `00057` → `00058` → `00059`. Validate the applicable pending changes on **staging**, including
   00059. Do not blindly run `db push` or reapply a migration based only on its local file.
   Migration 00055 has local edits; reconcile whether it was already applied elsewhere and compare
   its deployed definition before deciding whether a forward migration is needed.
2. Run the SQL/security suite on staging through test `015` (suite `001`–`015`), including test
   015 against the schema after 00059. No hosted Supabase validation is claimed here. Earlier
   PGlite results cover only their stated migration/test inputs; the recorded 00055 replay is not
   evidence of its shared deployment status or permission to reapply it.
3. Do not deploy to production until its actual shared migration records and live schema—including
   historical migrations absent from this repository—have been reconciled, staging validation is
   complete, and production deployment is explicitly approved. Staging success does not authorize
   production execution.
4. Grant the first platform admin from the SQL editor, as the database owner, only in the approved
   target environment:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<auth user id of the administrator>', 'platform_admin');
   ```
5. Sign in as that account and open `https://careconnect.studio/admin`.

## Provider-candidate research (migration 00056)

Public-web research about Chennai facilities and doctors is kept **apart from real providers**:

- **Separate tables:** `candidate_facilities`, `candidate_doctors`, `candidate_relationships`,
  `candidate_sources`, `candidate_evidence` and `candidate_contacts`. Nothing in them creates
  or changes `clinics`, `doctors`, `clinic_doctors`, schedules or appointments.
- **Platform admins only:** RLS lets only `private.is_platform_admin()` read them. Patients, clinic
  staff, doctors and anonymous visitors see nothing.
- **Never bookable:** `booking_enabled` is constrained to `false`.
- **Review workflow:** `candidate → under_review → contact_pending → contacted →
verification_pending → verified / rejected`. Admins can change only review status, permission
  status and notes. The database refuses:
  - `verified` until identity evidence is recorded (facility: clinic identity, address, contact
    details; doctor: provider identity, registration);
  - permission `granted` until listing-permission evidence is recorded;
  - a confirmed doctor–facility link until relationship evidence is recorded.
- **Audit trail:** evidence and contact logs are append-only and record who added them. Every review
  change is written to `audit_logs`.
- **Research is not CareConnect's conclusion:** a relationship keeps its research classification
  (`CONFIRMED_PUBLIC` / `POSSIBLE_NEEDS_CONFIRMATION`) separately from CareConnect's own decision.

A verified candidate is still **not** a provider. Onboarding a real provider remains the
application → approval → proposed doctor → verified link flow above.

The private research catalogue contains 100 facilities, 399 doctors, 418 relationships and 917
sources. Its generated import is a separate owner-run SQL action; see
[research/README.md](../research/README.md). The catalogue never becomes patient-facing provider
data by import alone.

## Sample listings

The current clinics and doctors are sample records (`is_demo = true`). They are labelled "Sample
listing" everywhere, their ratings are hidden, and clinics default to unpublished,
non-contactable and not bookable, so they cannot be messaged or booked. Rules:

- **Never verify a sample doctor.** The admin console hides sample links from the verification queue.
- **Never edit a sample row into a "real" provider.** Real providers enter only through an approved
  application and a proposed doctor.
- **Retire them once real providers are live.** When at least one approved clinic has a verified
  doctor with opening hours:
  1. Ship a migration that removes `is_demo` from the public read policy (`doctors_read_listed`)
     and filters `is_demo` clinics out of discovery.
  2. Set every sample `clinic_doctors` row to `active = false`.
  3. Delete sample rows only after confirming no conversations reference them. Conversations
     with sample clinics can exist; appointments can't, because sample doctors were never bookable.

## Real-world information still required

The software is ready to collect and verify these, but CareConnect has to obtain them:

- For each clinic: its registration under the Clinical Establishments Act (or the state
  equivalent), and a verified contact person.
- For each doctor: a medical council registration number (TNMC / NMC) checked with the council,
  qualifications, specialty and fee.
- Provider terms of service and a data-processing agreement: patient messages and appointment
  data are personal data under the DPDP Act. These documents are not part of this codebase.
