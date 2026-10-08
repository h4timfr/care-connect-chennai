BEGIN;
SELECT extensions.plan(8);

-- Create Fixtures
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000001', 'patientA@test.com', now(), now()),
('00000000-0000-0000-0000-000000000004', 'doctorA@test.com', now(), now());

-- Patients (Auto-created by trigger, so we UPDATE their fixtures)
UPDATE public.patients SET id = 'e1111111-1111-1111-1111-111111111111', full_name = 'Patient A', date_of_birth = '1990-01-01' WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Roles are now determined by tables, so no need to update users.role

INSERT INTO public.clinics (id, name, address, phone, email) VALUES 
('e3333333-3333-3333-3333-333333333333', 'Clinic A', '123 Test St', '555-0100', 'a@test.com'),
('e4444444-4444-4444-4444-444444444444', 'Clinic B', '456 Test St', '555-0200', 'b@test.com');

INSERT INTO public.doctors (id, user_id, name, consultation_fee) VALUES 
('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000004', 'Doctor A', 500);

-- Verification state can only be set by a platform admin (check_clinic_doctor_update forces 'pending' otherwise),
-- so the fixture is created while authenticated as one.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-000000000009', 'adminA@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-000000000009', 'platform_admin');

-- Doctor A is active and verified at Clinic A only, with a 09:00-17:00 / 30 minute schedule on every weekday
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000009", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES 
('e3333333-3333-3333-3333-333333333333', 'e5555555-5555-5555-5555-555555555555', true, 'verified');

INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes)
SELECT 'e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', dow, '09:00', '17:00', 30
FROM generate_series(0, 6) AS dow;
SELECT public.admin_set_clinic_publication_state(
  'e3333333-3333-3333-3333-333333333333', 'verified', true, 'not_granted', true);

-- Authenticate as Patient A
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL role authenticated;

-- Test: Past date rejected
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', '2010-01-01', '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Cannot book appointments in the past.',
    'Booking in the past should fail'
);

-- Test: >90 day date rejected
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 100, '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Booking horizon exceeds 90 days.',
    'Booking too far in the future should fail'
);

-- Test: Oversized reason rejected
SELECT extensions.throws_ok(
    format($$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', '%s') $$, repeat('A', 600)),
    'P0001',
    'Validation Failed: Reason exceeds 500 characters.',
    'Oversized payload should fail'
);

-- Test: Unrelated doctor/clinic rejected (Doctor A does not work at Clinic B)
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e4444444-4444-4444-4444-444444444444', CURRENT_DATE + 1, '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Doctor is not currently active or verified at this clinic.',
    'Forged clinic relationship should fail'
);

-- Test: Successful Booking & Fee Authentication
SELECT extensions.lives_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', 'Reason') $$,
    'Valid booking should succeed'
);

SELECT extensions.is(
    (SELECT fee FROM public.appointments WHERE patient_id = 'e1111111-1111-1111-1111-111111111111' LIMIT 1),
    500::numeric,
    'Fee should be strictly derived from doctor profile, ignoring client'
);

-- Test: Double Booking is rejected (the RPC pre-check raises first; the unique index is the race-time backstop)
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', 'Parallel attempt') $$,
    'P0001',
    'Validation Failed: That time slot is no longer available.',
    'Double booking should be rejected'
);

-- Test: 5 Active Bookings Limit
SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 2, '10:00', 'Reason');
SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 3, '10:00', 'Reason');
SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 4, '10:00', 'Reason');
SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 5, '10:00', 'Reason');

SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', CURRENT_DATE + 6, '10:00', 'Reason') $$,
    'P0001',
    'Rate Limit Exceeded: Maximum of 5 active bookings allowed per patient.',
    '6th active booking should fail'
);

SELECT * FROM extensions.finish();
ROLLBACK;
