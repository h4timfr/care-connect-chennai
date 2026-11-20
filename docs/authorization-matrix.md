# CareConnect: Authorization Matrix

## 1. Roles

- **Patient**: Standard consumer, default upon sign-up.
- **Doctor**: Medical professional, created by clinic admins.
- **Clinic Staff**: Operational personnel.
- **Clinic Admin**: Can manage staff and doctors within their specific clinic.
- **Platform Admin**: Superuser.

## 2. Row Level Security Policies

### Users & Patients

- Accounts can read and update their own profile. Active clinic members can read patient rows
  linked to their clinics through appointments or conversations. The clinic UI requests patient
  names for appointments, and names and account IDs for messaging and sender labeling. This
  patient-row policy also permits staff to read linked patients' demographic fields at the API.
- Phone and email are stored on `users`. A clinic booking or message does not grant read access to
  another user's `users` row. That table has separate self and platform-admin read policies.

### Appointments

- **Patient**: Can only `SELECT` where `patient_id` matches their own profile.
- **Staff/Admin**: Can only `SELECT/UPDATE` where `clinic_id` matches the `clinic_staff` relationship linked to their `auth.uid()`.

### Conversations & Messages

- **Patient**: Can read only conversations explicitly assigned to their `patient_id`. New
  conversations additionally require a non-sample, verified, published clinic with explicit
  patient-contact permission, plus a real active verified doctor–clinic relationship. A supplied
  appointment must match the same patient, clinic and doctor. Existing participant reads remain
  available after future contact is revoked.
- **Clinic members**: Active membership permits reading and replying in that clinic's
  conversations. The participant policies require the authenticated sender's own account ID.
- **Doctors**: Read via `doctor_conversations()` for their own active, verified clinic
  relationships and conversations assigned to them. The RPC returns the patient's name,
  message text and sender labels, without patient phone, email or sender account IDs. Doctors
  can insert a reply under a scoped policy. The doctor role alone does not grant direct message
  reads or Postgres Changes delivery.
- **Identity and consent**: Patients are identified by name in the authorized clinic and doctor
  inboxes. Message bodies can contain sensitive information and are stored with a sender account
  ID. Patient-contact permission governs starting a conversation, separately from booking and
  existing participant access. A platform-admin role alone does not grant inbox participation.

### Provider publication and capabilities

- Clinic verification, directory publication, patient-contact permission and booking enablement
  are separate `clinics` states. All default to denied; only a platform-admin transition may change
  them. Sample clinics cannot be enabled.
- Slot discovery and booking each check explicit booking enablement plus verified, published,
  non-sample clinic and active verified, non-sample doctor relationship.
- Candidate research records are isolated in `candidate_*`; they do not participate in listing,
  patient messaging or booking authorization.
