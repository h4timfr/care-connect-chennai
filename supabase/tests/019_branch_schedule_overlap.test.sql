BEGIN;
SELECT extensions.plan(12);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
('00000000-0000-0000-0000-0000000019e1', 'branch-overlap@test.invalid', now(), now()),
('00000000-0000-0000-0000-0000000019e2', 'branch-overlap-staff@test.invalid', now(), now());
UPDATE public.patients
SET id = '00000000-0000-0000-0000-0000000019f1', full_name = 'Branch Overlap Fixture'
WHERE user_id = '00000000-0000-0000-0000-0000000019e1';

INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-0000000019c1', 'Overlap Clinic A', 'Test', '0000000001', 'branch-a@test.invalid', false),
('00000000-0000-0000-0000-0000000019c2', 'Overlap Clinic B', 'Test', '0000000002', 'branch-b@test.invalid', false);
INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
VALUES ('00000000-0000-0000-0000-0000000019c1', '00000000-0000-0000-0000-0000000019e2', 'clinic_staff');
INSERT INTO public.doctors (id, name, consultation_fee, is_demo)
VALUES ('00000000-0000-0000-0000-0000000019d1', 'Branch Overlap Doctor', 500, false);

-- Insert B first with a short duration, then A with a longer duration. A lookup
-- that ignores clinic_id and selects the first matching row would miss the two
-- overlaps asserted below.
INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES
('00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c2', EXTRACT(DOW FROM CURRENT_DATE + 7)::integer, '09:00', '17:00', 15),
('00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c1', EXTRACT(DOW FROM CURRENT_DATE + 7)::integer, '09:00', '17:00', 60);

SELECT extensions.lives_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c1', CURRENT_DATE + 7, '09:00', 'confirmed', 500) $$,
    'an appointment can be inserted at branch A'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c2', CURRENT_DATE + 7, '09:30', 'confirmed', 500) $$,
    'P0001', 'Validation Failed: That time slot is no longer available.',
    'the longer existing branch-A duration prevents an overlapping branch-B booking'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.appointments WHERE clinic_id = '00000000-0000-0000-0000-0000000019c2' AND date = CURRENT_DATE + 7 AND time = '09:30'),
    0,
    'the rejected cross-branch overlap was not inserted'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c2', CURRENT_DATE + 7, '11:00', 'confirmed', 500) $$,
    'a separate branch-B appointment can be inserted'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c1', CURRENT_DATE + 7, '10:30', 'confirmed', 500) $$,
    'P0001', 'Validation Failed: That time slot is no longer available.',
    'the longer new branch-A duration prevents an overlap with branch B'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.appointments WHERE clinic_id = '00000000-0000-0000-0000-0000000019c1' AND date = CURRENT_DATE + 7 AND time = '10:30'),
    0,
    'the second rejected cross-branch overlap was not inserted'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c1', CURRENT_DATE + 7, '11:30', 'confirmed', 500) $$,
    'a short branch-B appointment ending at 11:15 does not block branch A at 11:30'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
       VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1', '00000000-0000-0000-0000-0000000019c2', CURRENT_DATE + 7, '10:00', 'confirmed', 500) $$,
    'appointments at an exact non-overlapping branch boundary remain allowed'
);

SELECT extensions.throws_ok(
    $$ UPDATE public.doctor_schedules SET slot_minutes = 30
       WHERE doctor_id = '00000000-0000-0000-0000-0000000019d1'
         AND clinic_id = '00000000-0000-0000-0000-0000000019c1' $$,
    'P0001', 'Validation Failed: A schedule with future active appointments cannot be changed.',
    'a schedule duration cannot reinterpret an existing future appointment'
);
SELECT extensions.throws_ok(
    $$ DELETE FROM public.doctor_schedules
       WHERE doctor_id = '00000000-0000-0000-0000-0000000019d1'
         AND clinic_id = '00000000-0000-0000-0000-0000000019c2' $$,
    'P0001', 'Validation Failed: A schedule with future active appointments cannot be changed.',
    'a schedule with future active appointments cannot be deleted'
);

INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee)
VALUES ('00000000-0000-0000-0000-0000000019f1', '00000000-0000-0000-0000-0000000019d1',
        '00000000-0000-0000-0000-0000000019c1',
        (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date, '00:00', 'confirmed', 500);

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000019e2","role":"authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ UPDATE public.appointments SET status = 'arrived'
       WHERE patient_id = '00000000-0000-0000-0000-0000000019f1'
         AND date = (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
         AND time = '00:00' $$,
    'clinic staff can mark an elapsed confirmed appointment arrived'
);
RESET role;
RESET request.jwt.claims;
UPDATE public.appointments
SET status = 'confirmed'
WHERE patient_id = '00000000-0000-0000-0000-0000000019f1'
  AND date = (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
  AND time = '00:00';

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000019e1","role":"authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
    $$ UPDATE public.appointments SET status = 'cancelled'
       WHERE patient_id = '00000000-0000-0000-0000-0000000019f1'
         AND date = (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
         AND time = '00:00' $$,
    'P0001', 'Patients cannot cancel appointments in the past.',
    'a patient cannot cancel an elapsed appointment later on the same day'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM extensions.finish();
ROLLBACK;
