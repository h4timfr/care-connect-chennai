# CareConnect: Authorization Matrix

## 1. Roles

- **Patient**: Standard consumer, default upon sign-up.
- **Doctor**: Medical professional, created by clinic admins.
- **Clinic Staff**: Operational personnel.
- **Clinic Admin**: Can manage staff and doctors within their specific clinic.
- **Platform Admin**: Superuser.

## 2. Row Level Security Policies

### Users & Patients

- **Read/Update**: `auth.uid() = id` / `user_id`. Cannot read other users.

### Appointments

- **Patient**: Can only `SELECT` where `patient_id` matches their own profile.
- **Staff/Admin**: Can only `SELECT/UPDATE` where `clinic_id` matches the `clinic_staff` relationship linked to their `auth.uid()`.

### Conversations & Messages

- **Patient**: Can read only conversations explicitly assigned to their `patient_id`. New
  conversations additionally require a non-sample, verified, published clinic with explicit
  patient-contact permission, plus a real active verified doctor–clinic relationship. A supplied
  appointment must match the same patient, clinic and doctor. Existing participant reads remain
  available after future contact is revoked.
- **Staff/Doctor**: Can only read/insert if authorized on the specific clinic/doctor relationship.

### Provider publication and capabilities

- Clinic verification, directory publication, patient-contact permission and booking enablement
  are separate `clinics` states. All default to denied; only a platform-admin transition may change
  them. Sample clinics cannot be enabled.
- Slot discovery and booking each check explicit booking enablement plus verified, published,
  non-sample clinic and active verified, non-sample doctor relationship.
- Candidate research records are isolated in `candidate_*`; they do not participate in listing,
  patient messaging or booking authorization.
