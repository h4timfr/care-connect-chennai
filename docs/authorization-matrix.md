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

- **Patient**: Can only read/insert if they are explicitly the `patient_id` on the parent conversation.
- **Staff/Doctor**: Can only read/insert if authorized on the specific clinic/doctor relationship.
