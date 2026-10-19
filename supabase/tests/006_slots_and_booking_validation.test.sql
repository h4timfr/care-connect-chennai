BEGIN;
SELECT extensions.plan(26);

-- Fixtures
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000000b1', 'patient@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000b2', 'doctor1@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000b3', 'doctor2@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000b9', 'admin@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000b9', 'platform_admin');

INSERT INTO public.clinics (id, name, address, phone, email) VALUES
('20000000-0000-0000-0000-0000000000c1', 'Clinic A', '1 Test St', '555-0101', 'a@test.com'),
('20000000-0000-0000-0000-0000000000c2', 'Clinic B', '2 Test St', '555-0102', 'b@test.com');
INSERT INTO public.doctors (id, user_id, name, consultation_fee) VALUES
('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b2', 'Verified Doctor', 500),
('30000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b3', 'Unverified Doctor', 300);

-- Doctor 1 is verified at Clinic A; Doctor 2 stays 'pending' there (verification can only be set by a platform admin)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000b9", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000d1', true, 'verified'),
('20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000d2', true, 'pending');
-- 09:00-13:00 in 30 minute slots every weekday = 8 slots, for both doctors at Clinic A
INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes)
SELECT d, '20000000-0000-0000-0000-0000000000c1', dow, '09:00', '13:00', 30
FROM unnest(ARRAY['30000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d2']::uuid[]) AS d, generate_series(0, 6) AS dow;
UPDATE public.patients SET id = '10000000-0000-0000-0000-0000000000a1', full_name = 'Patient' WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
SELECT public.admin_set_clinic_publication_state(
  '20000000-0000-0000-0000-0000000000c1', 'verified', true, 'not_granted', true);

-- Function contract and ACL
SELECT extensions.has_function('public', 'get_doctor_slots', ARRAY['uuid', 'uuid', 'date'], 'clinic-aware get_doctor_slots exists');
SELECT extensions.is_definer('public', 'get_doctor_slots', ARRAY['uuid', 'uuid', 'date'], 'get_doctor_slots is SECURITY DEFINER');
SELECT extensions.function_privs_are('public', 'get_doctor_slots', ARRAY['uuid', 'uuid', 'date'], 'anon', ARRAY['EXECUTE'], 'anon can read availability (public doctor profile)');
SELECT extensions.function_privs_are('public', 'get_doctor_slots', ARRAY['uuid', 'uuid', 'date'], 'authenticated', ARRAY['EXECUTE'], 'authenticated can read availability');
SELECT extensions.function_privs_are('public', 'book_appointment', ARRAY['uuid', 'uuid', 'date', 'time without time zone', 'text'], 'anon', ARRAY[]::text[], 'anon cannot book');

-- Availability as an unauthenticated visitor
RESET request.jwt.claims;
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5)), 8, 'verified doctor at the right clinic has 8 slots');
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c2', CURRENT_DATE + 5)), 0, 'wrong clinic returns nothing');
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5)), 0, 'unverified doctor returns nothing');
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE - 2)), 0, 'past date returns nothing');
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 200)), 0, 'date beyond the 90 day horizon returns nothing');
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', NULL::uuid, CURRENT_DATE + 5)), 0, 'NULL clinic returns nothing');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000b9", "role": "authenticated"}';
SELECT public.admin_set_clinic_publication_state(
  '20000000-0000-0000-0000-0000000000c1', 'verified', false, 'not_granted', false);
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5)), 0, 'unpublished clinic reveals no availability');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000b9", "role": "authenticated"}';
SELECT public.admin_set_clinic_publication_state(
  '20000000-0000-0000-0000-0000000000c1', 'verified', true, 'not_granted', false);
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5)), 0, 'booking-disabled clinic reveals no slots');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000b9", "role": "authenticated"}';
SELECT public.admin_set_clinic_publication_state(
  '20000000-0000-0000-0000-0000000000c1', 'verified', true, 'not_granted', true);
UPDATE public.clinic_doctors SET active = false
WHERE clinic_id = '20000000-0000-0000-0000-0000000000c1'
  AND doctor_id = '30000000-0000-0000-0000-0000000000d1';
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5)), 0, 'inactive verified relationship reveals no availability');
RESET role;
UPDATE public.clinic_doctors SET active = true
WHERE clinic_id = '20000000-0000-0000-0000-0000000000c1'
  AND doctor_id = '30000000-0000-0000-0000-0000000000d1';
SET LOCAL role anon;
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '09:00', 'x') $$,
    '42501', NULL, 'anon cannot call book_appointment'
);

-- Booking validation as the patient
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '09:30', 'Check-up') $$,
    'an aligned slot inside the schedule can be booked'
);
SELECT extensions.is((SELECT count(*)::int FROM public.get_doctor_slots('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5) WHERE available), 7, 'the booked slot is now unavailable');
SELECT extensions.is((SELECT fee FROM public.appointments WHERE doctor_id = '30000000-0000-0000-0000-0000000000d1' LIMIT 1), 500::numeric, 'fee comes from the doctor profile');
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '09:30', 'again') $$,
    'P0001', 'Validation Failed: That time slot is no longer available.', 'the same slot cannot be booked twice'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '13:00', 'x') $$,
    'P0001', 'Validation Failed: That time slot is not available for this doctor.', 'a time at the end of the window is rejected'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '08:30', 'x') $$,
    'P0001', 'Validation Failed: That time slot is not available for this doctor.', 'a time before the window is rejected'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '10:10', 'x') $$,
    'P0001', 'Validation Failed: That time slot is not available for this doctor.', 'a time that is not on the slot grid is rejected'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, '10:00:30', 'x') $$,
    'P0001', 'Validation Failed: That time slot is not available for this doctor.', 'a time with non-zero seconds is rejected'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 5, NULL::time, 'x') $$,
    'P0001', 'Validation Failed: doctor, clinic, date and time are required.', 'a NULL time is rejected explicitly'
);
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('30000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 6, '10:00', 'x') $$,
    'P0001', 'Validation Failed: Doctor is not currently active or verified at this clinic.', 'an unverified doctor cannot be booked'
);

-- The audit trail is still written (read as the test owner; audit_logs is admin-only)
RESET role;
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs WHERE action_type = 'appointment_booked'), 1, 'booking wrote exactly one audit log entry');

SELECT * FROM extensions.finish();
ROLLBACK;
