BEGIN;
SELECT extensions.plan(16);

-- 1. Check RLS is enabled on critical tables
SELECT extensions.policies_are('public', 'appointments', ARRAY['appts_read_patient', 'appts_update_patient', 'appts_read_staff', 'appts_update_staff'], 'Appointments should have the expected 4 policies active');
SELECT extensions.policies_are('public', 'audit_logs', ARRAY['audit_logs_read_admin'], 'Audit logs should be locked to admin');

-- Create Fixtures
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000001', 'patientA@test.com', now(), now()),
('00000000-0000-0000-0000-000000000002', 'patientB@test.com', now(), now()),
('00000000-0000-0000-0000-000000000003', 'staffA@test.com', now(), now()),
('00000000-0000-0000-0000-000000000004', 'doctorA@test.com', now(), now()),
('00000000-0000-0000-0000-000000000009', 'adminA@test.com', now(), now());

-- (The auth triggers will have created public.users automatically)
-- Patients (Auto-created by trigger, so we UPDATE their fixtures)
UPDATE public.patients SET id = '11111111-1111-1111-1111-111111111111', full_name = 'Patient A', date_of_birth = '1990-01-01' WHERE user_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.patients SET id = '22222222-2222-2222-2222-222222222222', full_name = 'Patient B', date_of_birth = '1990-01-01' WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- Roles are now determined by memberships, so no need to update users table

-- Clinics & Doctors
INSERT INTO public.clinics (id, name, address, phone, email) VALUES 
('33333333-3333-3333-3333-333333333333', 'Clinic A', '123 Test St', '555-0100', 'a@test.com'),
('44444444-4444-4444-4444-444444444444', 'Clinic B', '456 Test St', '555-0200', 'b@test.com');

INSERT INTO public.doctors (id, user_id, name, consultation_fee) VALUES 
('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000004', 'Doctor A', 500);

INSERT INTO public.clinic_doctors (clinic_id, doctor_id) VALUES 
('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');

INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES 
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000003', 'clinic_staff'),
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000009', 'clinic_admin');

-- Appointments
INSERT INTO public.appointments (id, patient_id, clinic_id, doctor_id, date, time, status, fee) VALUES 
('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', CURRENT_DATE + 1, '10:00', 'confirmed', 500),
('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', CURRENT_DATE + 2, '10:00', 'confirmed', 500);

-- TEST A & B: Patient A visibility
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
    (SELECT count(*) FROM public.appointments),
    1::bigint,
    'Patient A should only see their own 1 appointment'
);
SELECT extensions.is(
    (SELECT id FROM public.appointments LIMIT 1),
    '66666666-6666-6666-6666-666666666666'::uuid,
    'Patient A sees exactly Patient A appointment'
);

-- TEST C: Patient A cannot modify Patient B
UPDATE public.appointments SET status = 'cancelled' WHERE id = '77777777-7777-7777-7777-777777777777';
-- (Since RLS hides it, the update affects 0 rows, so we revert to postgres role to check)
RESET ROLE;
SELECT extensions.is(
    (SELECT status FROM public.appointments WHERE id = '77777777-7777-7777-7777-777777777777'),
    'confirmed'::public.appointment_status,
    'Patient A cannot modify Patient B appointment'
);

-- TEST D & E: Staff A (Clinic A) visibility
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
    (SELECT count(*) FROM public.appointments),
    1::bigint,
    'Staff A should only see appointments for Clinic A'
);
UPDATE public.appointments SET status = 'cancelled' WHERE id = '77777777-7777-7777-7777-777777777777';
RESET ROLE;
SELECT extensions.is(
    (SELECT status FROM public.appointments WHERE id = '77777777-7777-7777-7777-777777777777'),
    'confirmed'::public.appointment_status,
    'Staff A cannot modify Clinic B appointment'
);

-- TEST F & G: Admin A (Clinic A) visibility and management
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000009", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
    (SELECT count(*) FROM public.appointments),
    1::bigint,
    'Admin A should only see appointments for Clinic A'
);
UPDATE public.appointments SET status = 'cancelled' WHERE id = '77777777-7777-7777-7777-777777777777';
RESET ROLE;
SELECT extensions.is(
    (SELECT status FROM public.appointments WHERE id = '77777777-7777-7777-7777-777777777777'),
    'confirmed'::public.appointment_status,
    'Admin A cannot modify Clinic B appointment'
);

-- TEST H: Anonymous access denied
SET LOCAL role anon;
SELECT extensions.throws_ok(
    'SELECT * FROM public.appointments',
    '42501',
    NULL,
    'Anonymous access should be strictly denied for appointments'
);
RESET ROLE;

-- TEST: Staff cannot update clinic
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL role authenticated;
UPDATE public.clinics SET name = 'Hacked Clinic' WHERE id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT extensions.is(
    (SELECT name FROM public.clinics WHERE id = '33333333-3333-3333-3333-333333333333'),
    'Clinic A'::text,
    'Normal staff cannot modify clinic details'
);

-- TEST: Admin CAN update clinic
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000009", "role": "authenticated"}';
SET LOCAL role authenticated;
UPDATE public.clinics SET name = 'Updated Clinic' WHERE id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT extensions.is(
    (SELECT name FROM public.clinics WHERE id = '33333333-3333-3333-3333-333333333333'),
    'Updated Clinic'::text,
    'Admin can modify their own clinic details'
);

-- ROLE ESCALATION TEST
-- Try to insert a user with admin metadata through the trigger
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000005', 'hacker@test.com', '{"role": "platform_admin"}', now(), now());

SELECT extensions.is(
    (SELECT count(*) FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000005'),
    0::bigint,
    'Role escalation must be prevented: hacker must have 0 global roles'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000006', 'hacker2@test.com', '{"role": "doctor"}', now(), now());
SELECT extensions.is(
    (SELECT count(*) FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000006'),
    0::bigint,
    'Role escalation (doctor) must be prevented'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000007', 'hacker3@test.com', '{"role": "clinic_admin"}', now(), now());
SELECT extensions.is(
    (SELECT count(*) FROM public.clinic_memberships WHERE user_id = '00000000-0000-0000-0000-000000000007'),
    0::bigint,
    'Role escalation (clinic_admin) must be prevented'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000008', 'hacker4@test.com', '{"role": "clinic_staff"}', now(), now());
SELECT extensions.is(
    (SELECT count(*) FROM public.clinic_memberships WHERE user_id = '00000000-0000-0000-0000-000000000008'),
    0::bigint,
    'Role escalation (clinic_staff) must be prevented'
);

SELECT * FROM extensions.finish();
ROLLBACK;
