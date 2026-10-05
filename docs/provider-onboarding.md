# Provider onboarding and administration

How real clinics and doctors join CareConnect, who can do what, and what still has to happen in
production. The database is the security boundary throughout: the UI only decides what to show.

## Accounts and roles

There is **one** account system: Supabase Auth. Patients, clinic staff and platform administrators
all sign in the same way. What an account may do comes only from rows the database checks:

| Capability                                                      | Granted by                                              | Checked by                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Patient features                                                | every account (a `patients` row is created on sign-up)  | RLS on patients, appointments, conversations, messages             |
| Clinic portal (staff)                                           | `clinic_memberships` row, `active`, role `clinic_staff` | RLS via `private.user_clinic_ids()`                                |
| Clinic admin (propose doctors, edit verified doctors' profiles) | membership with role `clinic_admin`                     | RLS via `private.user_admin_clinic_ids()`, `clinic_propose_doctor` |
| Platform admin (approve clinics, verify doctors, manage teams)  | `user_roles` row `platform_admin`, assigned out of band | `private.is_platform_admin()` in RLS and every admin function      |

"Patient sign in" and "Clinic & provider sign in" (`/login?portal=clinic`) are the same login. The
clinic entrance only changes the wording and lands on `/clinic`, which shows **No clinic access**
unless the database returns an active membership. `/admin` shows **No admin access** unless the
role check succeeds and returns `platform_admin`. If the check fails for any reason it grants nothing.

## The onboarding flow

1. **Apply** (`/providers` → `/providers/apply`, signed in): the applicant gives the clinic's name,
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
   registration, for example with TNMC or NMC. Only now is the doctor publicly listed.
5. **Clinic sets opening hours** (`/clinic/doctors` → Edit hours), allowed only for doctors verified
   at that clinic. Once hours exist, patients can book. `book_appointment` re-checks verification,
   the schedule window and slot alignment on every booking.
6. **Teams**: platform admins add members by the email of an existing account (`/admin` → Clinic
   teams), choosing staff or admin, and can deactivate or reactivate members.

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
- **Listings:** only sample doctors and doctors with a verified, active link are publicly listed.
  Clinic members still see their own clinic's pending doctors.
- **Schedules:** can only be written for doctors verified at that clinic.

**Until 00054 is deployed the vulnerability remains in production.** Do not give clinic
memberships to anyone you do not fully trust before then.

## What is ready and what needs the database update

| Part                                                            | Status                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Password visibility, select contrast, redesign, mobile fixes    | Frontend only. Ready.                                                        |
| `/providers` information page, clinic sign-in entrance          | Frontend only. Ready.                                                        |
| Clinic portal: doctor verification status, opening hours editor | Works now (existing policies); after 00054 it is limited to verified doctors |
| `/providers/apply` applications                                 | **Needs 00054.** Until then it says applications aren't open yet.            |
| Proposing doctors                                               | **Needs 00054.** Until then it says the update isn't deployed.               |
| `/admin` console                                                | **Needs 00052 and 00054.** Until then it fails closed.                       |

## Deploying (manual, by the database owner)

Nothing here is applied automatically.

1. Apply in order to a **staging** project first: `00052`, `00053`, `00054`.
2. Run the pgTAP suite there, including `008`, `009`, `010` and `011_provider_onboarding`. 011 was
   written alongside 00054 but has **not been executed yet**: no local Supabase stack was available.
3. Apply the same migrations to production.
4. Grant the first platform admin from the SQL editor, as the database owner:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<auth user id of the administrator>', 'platform_admin');
   ```
5. Sign in as that account and open `https://careconnect.studio/admin`.

## Sample listings

The current clinics and doctors are sample records (`is_demo = true`). They are labelled "Sample
listing" everywhere, their ratings are hidden, and their links are pending, so they can't be
booked. Rules:

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
