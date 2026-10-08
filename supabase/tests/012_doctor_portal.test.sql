BEGIN;
SELECT extensions.plan(65);

-- Contract
SELECT extensions.ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.doctor_applications'::regclass),
    'doctor_applications has row level security'
);
SELECT extensions.ok(
    NOT has_function_privilege('anon', 'public.doctor_appointments()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.doctor_conversations()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.admin_review_doctor_application(uuid, boolean, text, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'private.my_doctor_ids()', 'EXECUTE'),
    'anon cannot execute the doctor portal functions'
);
SELECT extensions.ok(
    NOT has_column_privilege('authenticated', 'public.doctor_applications', 'status', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.doctor_applications', 'applicant_id', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.doctor_applications', 'doctor_id', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.doctor_applications', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.doctor_applications', 'DELETE'),
    'applicants cannot set the owner, status or resulting doctor, or edit/delete applications'
);

-- Fixtures (outside RLS). Accounts: a1 platform admin, d1 doctor (verified at C1, pending at C2),
-- d2 another doctor (verified at C1), d3 a doctor with only a pending link, p1/p2 patients,
-- x1/x2 applicants.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000006a1', 'admin6@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006d1', 'doc1@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006d2', 'doc2@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006d3', 'doc3@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006d4', 'doc4@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006e1', 'pat1@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006e2', 'pat2@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006f1', 'app1@test.com', now(), now()),
('00000000-0000-0000-0000-0000000006f2', 'app2@test.com', now(), now());
UPDATE public.patients SET full_name = 'Patient One' WHERE user_id = '00000000-0000-0000-0000-0000000006e1';
UPDATE public.patients SET full_name = 'Patient Two' WHERE user_id = '00000000-0000-0000-0000-0000000006e2';
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000006a1', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-0000000006c1', 'Clinic Six One', '1 Road', '000', 'c61@test.com', false),
('00000000-0000-0000-0000-0000000006c2', 'Clinic Six Two', '2 Road', '000', 'c62@test.com', false);
INSERT INTO public.doctors (id, user_id, name, specialty_id, consultation_fee, is_demo, registration_note) VALUES
('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006d1', 'Dr Six One', 'general', 500, false, 'TNMC 1'),
('00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006d2', 'Dr Six Two', 'general', 500, false, 'TNMC 2'),
('00000000-0000-0000-0000-0000000006b3', '00000000-0000-0000-0000-0000000006d3', 'Dr Six Three', 'general', 500, false, 'TNMC 3'),
('00000000-0000-0000-0000-0000000006b4', '00000000-0000-0000-0000-0000000006d4', 'Dr Six Four', 'general', 500, false, 'TNMC 4'),
('00000000-0000-0000-0000-0000000006b9', NULL, 'Dr Sample Six', 'general', 500, true, NULL);
-- Only a platform admin may store 'verified' (check_clinic_doctor_update downgrades anyone else).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b1', true, 'verified'),
('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006b1', true, 'pending'),
('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b2', true, 'verified'),
('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006b2', false, 'verified'),
('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006b3', true, 'pending'),
('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b4', true, 'verified'),
('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006b4', true, 'pending');
RESET request.jwt.claims;
-- A linked doctor can also be clinic staff; that role must not bypass doctor-specific scheduling.
INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active) VALUES
('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006d4', 'clinic_staff', true),
('00000000-0000-0000-0000-0000000006c2', '00000000-0000-0000-0000-0000000006d4', 'clinic_staff', true);
-- Existing rows must remain protected if a relationship becomes pending or inactive.
INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES
('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c1', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c2', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006c1', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006c2', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-0000000006b4', '00000000-0000-0000-0000-0000000006c2', 0, '09:00', '12:00', 30);
INSERT INTO public.appointments (id, patient_id, clinic_id, doctor_id, date, time, status, fee) VALUES
('00000000-0000-0000-0000-000000000611',
 (SELECT id FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e1'),
 '00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b1', '2099-02-02', '10:00', 'pending', 500),
('00000000-0000-0000-0000-000000000612',
 (SELECT id FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e1'),
 '00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b2', '2099-02-02', '10:00', 'pending', 500);
INSERT INTO public.conversations (id, clinic_id, patient_id, doctor_id, kind) VALUES
('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-0000000006c1',
 (SELECT id FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e1'), '00000000-0000-0000-0000-0000000006b1', 'general'),
('00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-0000000006c2',
 (SELECT id FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e1'), '00000000-0000-0000-0000-0000000006b1', 'general'),
('00000000-0000-0000-0000-000000000623', '00000000-0000-0000-0000-0000000006c1',
 (SELECT id FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e2'), '00000000-0000-0000-0000-0000000006b2', 'general');
INSERT INTO public.messages (conversation_id, sender_id, body) VALUES
('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-0000000006e1', 'Hello doctor');

-- A patient gets nothing from the doctor portal
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006e1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_appointments()), 0, 'a patient has no doctor appointments');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_conversations()), 0, 'a patient has no doctor conversations');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c1', 3, '09:00', '12:00', 30) $$,
    '42501', NULL, 'a patient cannot set a doctor''s hours'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET user_id = '00000000-0000-0000-0000-0000000006e1' WHERE id = '00000000-0000-0000-0000-0000000006b9' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a patient cannot claim a doctor profile'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'x' WHERE id = '00000000-0000-0000-0000-0000000006b1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a patient cannot edit a doctor'
);
RESET role;

-- Doctor d1
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006d1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_appointments()), 1, 'a doctor sees only their own appointments');
SELECT extensions.is((SELECT patient_name FROM public.doctor_appointments() LIMIT 1), 'Patient One', 'appointments carry the patient''s name');
SELECT extensions.is(
    (SELECT count(*)::int FROM public.patients WHERE user_id = '00000000-0000-0000-0000-0000000006e1'),
    0, 'a doctor cannot read patient records'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM public.appointments WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1'),
    0, 'a doctor has no direct read access to the appointments table'
);
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_conversations()), 1, 'a doctor sees only conversations about them at verified clinics');
SELECT extensions.is(
    (SELECT messages -> 0 ->> 'from' FROM public.doctor_conversations() LIMIT 1),
    'patient', 'message senders are labelled without exposing account ids'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-0000000006d1', 'Hello, how can I help?') $$,
    'a doctor can reply in their conversation'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ('00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-0000000006d1', 'x') $$,
    '42501', NULL, 'a doctor cannot post at a clinic where they are only pending'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ('00000000-0000-0000-0000-000000000623', '00000000-0000-0000-0000-0000000006d1', 'x') $$,
    '42501', NULL, 'a doctor cannot post in another doctor''s conversation'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-0000000006e1', 'spoofed') $$,
    '42501', NULL, 'a doctor cannot post as the patient'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'Family physician' WHERE id = '00000000-0000-0000-0000-0000000006b1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'a doctor can edit their own profile text'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET consultation_fee = 650 WHERE id = '00000000-0000-0000-0000-0000000006b1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'a doctor can change their own fee'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctors SET name = 'Dr Someone Else' WHERE id = '00000000-0000-0000-0000-0000000006b1' $$,
    'P0001', NULL, 'a doctor cannot rename themselves'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctors SET registration_note = 'fake' WHERE id = '00000000-0000-0000-0000-0000000006b1' $$,
    'P0001', NULL, 'a doctor cannot change their registration'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctors SET user_id = '00000000-0000-0000-0000-0000000006d2' WHERE id = '00000000-0000-0000-0000-0000000006b1' $$,
    'P0001', NULL, 'a doctor cannot hand their profile to another account'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'x' WHERE id = '00000000-0000-0000-0000-0000000006b2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a doctor cannot edit another doctor'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c1', 3, '09:00', '12:00', 30) $$,
    'a doctor can set hours at a clinic where they are verified'
);
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1'), 2, 'doctor can select own verified schedules');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c2'), 0, 'doctor cannot select pending clinic schedule');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2'), 0, 'doctor cannot select another doctor schedule');
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctor_schedules SET end_time = '13:00' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' AND day_of_week = 3 RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'doctor can update own verified schedule'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctor_schedules SET clinic_id = '00000000-0000-0000-0000-0000000006c2' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' AND day_of_week = 3 $$,
    '42501', NULL, 'doctor cannot move a verified schedule into a pending clinic'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctor_schedules SET end_time = '13:00' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'doctor cannot update an existing pending schedule'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c2' RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (0) $$, 'doctor cannot delete an existing pending schedule'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctor_schedules SET end_time = '13:00' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'doctor cannot update another doctor schedule'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (0) $$, 'doctor cannot delete another doctor schedule'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' AND day_of_week = 3 RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (1) $$, 'doctor can delete own verified schedule'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c2', 3, '09:00', '12:00', 30) $$,
    '42501', NULL, 'a doctor cannot set hours where they are only pending'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006c1', 4, '09:00', '12:00', 30) $$,
    '42501', NULL, 'a doctor cannot set another doctor''s hours'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, contact_phone, contact_email)
       VALUES ('Dr Six One', 'general', 'MBBS', 'TNMC', '1', 5, '9840000000', 'doc1@test.com') $$,
    'P0001', NULL, 'an account already linked to a doctor cannot apply again'
);
RESET role;

-- Doctor d2: verified at C1, inactive at C2.
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006d2", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2' AND clinic_id = '00000000-0000-0000-0000-0000000006c2'), 0, 'inactive link cannot select its schedule');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006c2', 3, '09:00', '12:00', 30) $$,
    '42501', NULL, 'inactive link cannot insert schedules'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctor_schedules SET end_time = '13:00' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2' AND clinic_id = '00000000-0000-0000-0000-0000000006c2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'inactive link cannot update schedules'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b2' AND clinic_id = '00000000-0000-0000-0000-0000000006c2' RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (0) $$, 'inactive link cannot delete schedules'
);
RESET role;

-- Doctor d4 is also staff at both clinics. Staff's permissive policy must not widen doctor rights.
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006d4", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1'), 0, 'dual-role doctor cannot select another doctor schedule as staff');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006c1', 5, '09:00', '12:00', 30) $$,
    '42501', NULL, 'dual-role doctor cannot insert another doctor schedule as staff'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctor_schedules SET end_time = '13:00' WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'dual-role doctor cannot update another doctor schedule as staff'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b1' AND clinic_id = '00000000-0000-0000-0000-0000000006c1' RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (0) $$, 'dual-role doctor cannot delete another doctor schedule as staff'
);
SELECT extensions.results_eq(
    $$ WITH d AS (DELETE FROM public.doctor_schedules WHERE doctor_id = '00000000-0000-0000-0000-0000000006b4' AND clinic_id = '00000000-0000-0000-0000-0000000006c2' RETURNING 1) SELECT count(*)::int FROM d $$,
    $$ VALUES (0) $$, 'dual-role doctor cannot delete own pending schedule as staff'
);
RESET role;

-- A doctor whose only clinic link is pending
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006d3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000006b3'), 1, 'a pending doctor can see their own (unlisted) profile');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000006b3', '00000000-0000-0000-0000-0000000006c2', 1, '09:00', '12:00', 30) $$,
    '42501', NULL, 'a pending link grants no scheduling'
);
RESET role;
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000006b3'), 0, 'a pending doctor is not publicly listed');
RESET role;

-- Applicant x1
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006f1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, consultation_fee, clinic_id, contact_phone, contact_email)
       VALUES ('Dr New Applicant', 'pediatrics', 'MBBS, MD', 'TNMC', '777777', 9, 700, '00000000-0000-0000-0000-0000000006c1', '+91 98400 00000', 'app1@test.com') $$,
    'a signed-in user can apply as a doctor'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, contact_phone, contact_email, status)
       VALUES ('Dr Self Approved', 'general', 'MBBS', 'TNMC', '1', 1, '9840000000', 'app1@test.com', 'approved') $$,
    '42501', NULL, 'an applicant cannot approve themselves'
);
INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, contact_phone, contact_email)
VALUES ('Dr New Applicant', 'pediatrics', 'MBBS', 'TNMC', '777778', 9, '9840000000', 'app1@test.com');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, contact_phone, contact_email)
       VALUES ('Dr New Applicant', 'pediatrics', 'MBBS', 'TNMC', '777779', 9, '9840000000', 'app1@test.com') $$,
    'P0001', NULL, 'at most two open doctor applications'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_doctor_application((SELECT id FROM public.doctor_applications LIMIT 1), true, NULL, NULL) $$,
    '42501', NULL, 'an applicant cannot review their own application'
);
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_applications), 2, 'an applicant sees only their own applications');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_appointments()), 0, 'an applicant is not a doctor yet');
RESET role;

-- Applicant x2 (for the sample-profile guard)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006f2", "role": "authenticated"}';
SET LOCAL role authenticated;
INSERT INTO public.doctor_applications (full_name, specialty_id, qualifications, registration_council, registration_number, experience_years, contact_phone, contact_email)
VALUES ('Dr Second Applicant', 'general', 'MBBS', 'TNMC', '888888', 3, '9840000000', 'app2@test.com');
RESET role;

-- Platform admin
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_applications), 3, 'a platform admin sees every doctor application');
SELECT extensions.lives_ok(
    $$ SELECT public.admin_review_doctor_application((SELECT id FROM public.doctor_applications WHERE registration_number = '777777'), true, 'Registration confirmed', NULL) $$,
    'a platform admin can approve a doctor application'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_doctor_application((SELECT id FROM public.doctor_applications WHERE registration_number = '777777'), false, NULL, NULL) $$,
    'P0001', NULL, 'an application can only be reviewed once'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_doctor_application((SELECT id FROM public.doctor_applications WHERE registration_number = '777778'), true, NULL, NULL) $$,
    'P0001', NULL, 'an account cannot be linked to a second doctor profile'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_doctor_application((SELECT id FROM public.doctor_applications WHERE registration_number = '888888'), true, NULL, '00000000-0000-0000-0000-0000000006b9') $$,
    'P0001', NULL, 'a sample doctor profile can never be claimed'
);
RESET role;

-- Results of the approval
SELECT extensions.ok(
    EXISTS (SELECT 1 FROM public.doctors WHERE user_id = '00000000-0000-0000-0000-0000000006f1' AND NOT is_demo AND name = 'Dr New Applicant'),
    'approval links the applicant to a new, non-sample doctor profile'
);
SELECT extensions.is(
    (SELECT cd.verification_state FROM public.clinic_doctors cd JOIN public.doctors d ON d.id = cd.doctor_id
     WHERE d.user_id = '00000000-0000-0000-0000-0000000006f1' AND cd.clinic_id = '00000000-0000-0000-0000-0000000006c1'),
    'pending', 'the named clinic link starts pending, not verified'
);
SELECT extensions.is(
    (SELECT registration_note FROM public.doctors WHERE user_id = '00000000-0000-0000-0000-0000000006f1'),
    'TNMC 777777', 'the registration is recorded from the application'
);
SET LOCAL role anon;
SELECT extensions.is(
    (SELECT count(*)::int FROM public.doctors WHERE name = 'Dr New Applicant'),
    0, 'a newly approved doctor is not listed until a clinic link is verified'
);
RESET role;

SELECT * FROM extensions.finish();
ROLLBACK;
