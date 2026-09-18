BEGIN;
SELECT extensions.plan(8);

-- Create Fixtures
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000001', 'patientA@test.com', now(), now()),
('00000000-0000-0000-0000-000000000004', 'doctorA@test.com', now(), now());

-- Patients (Auto-created by trigger, so we UPDATE their fixtures)
UPDATE public.patients SET id = '11111111-1111-1111-1111-111111111111', full_name = 'Patient A', date_of_birth = '1990-01-01' WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Roles are now determined by tables, so no need to update users.role

INSERT INTO public.clinics (id, name, address, phone, email) VALUES 
('33333333-3333-3333-3333-333333333333', 'Clinic A', '123 Test St', '555-0100', 'a@test.com'),
('44444444-4444-4444-4444-444444444444', 'Clinic B', '456 Test St', '555-0200', 'b@test.com');

INSERT INTO public.doctors (id, user_id, name, consultation_fee) VALUES 
('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000004', 'Doctor A', 500);

INSERT INTO public.clinic_doctors (clinic_id, doctor_id) VALUES 
('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');

-- Authenticate as Patient A
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL role authenticated;

-- Test: Past date rejected
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '2010-01-01', '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Cannot book appointments in the past.',
    'Booking in the past should fail'
);

-- Test: >90 day date rejected
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 100, '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Booking horizon exceeds 90 days.',
    'Booking too far in the future should fail'
);

-- Test: Oversized reason rejected
SELECT extensions.throws_ok(
    format($$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', '%s') $$, repeat('A', 600)),
    'P0001',
    'Validation Failed: Reason exceeds 500 characters.',
    'Oversized payload should fail'
);

-- Test: Unrelated doctor/clinic rejected (Doctor A does not work at Clinic B)
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', CURRENT_DATE + 1, '10:00', 'Reason') $$,
    'P0001',
    'Validation Failed: Doctor does not operate at this clinic.',
    'Forged clinic relationship should fail'
);

-- Test: Successful Booking & Fee Authentication
SELECT extensions.lives_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', 'Reason') $$,
    'Valid booking should succeed'
);

SELECT extensions.is(
    (SELECT fee FROM public.appointments WHERE patient_id = '11111111-1111-1111-1111-111111111111' LIMIT 1),
    500::numeric,
    'Fee should be strictly derived from doctor profile, ignoring client'
);

-- Test: Double Booking (Concurrency constraint)
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 1, '10:00', 'Parallel attempt') $$,
    '23505',
    NULL,
    'Double booking should throw Postgres Unique Constraint violation'
);

-- Test: 5 Active Bookings Limit
SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 2, '10:00', 'Reason');
SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 3, '10:00', 'Reason');
SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 4, '10:00', 'Reason');
SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 5, '10:00', 'Reason');

SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', CURRENT_DATE + 6, '10:00', 'Reason') $$,
    'P0001',
    'Rate Limit Exceeded: Maximum of 5 active bookings allowed per patient.',
    '6th active booking should fail'
);

SELECT * FROM extensions.finish();
ROLLBACK;
