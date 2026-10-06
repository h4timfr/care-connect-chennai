BEGIN;
SELECT extensions.plan(30);

-- Portal security acceptance, enforced by RLS (the frontend's route guards are only UX):
--   a patient cannot reach clinic or doctor data or make themselves a provider;
--   clinic members cannot reach another clinic, attach arbitrary doctors, edit doctors through a
--   pending link, or raise their own access;
--   a doctor cannot reach another doctor's data or arbitrary patients, or change verification.
-- Requires migrations 00052-00055 (doctor portal, onboarding).

-- Fixtures (as the migration owner).  Users: e1/e2 patients, e3 staff at clinic A, e4 admin at
-- clinic A, e5 staff at clinic B, e6 doctor (verified at A), e7 doctor (verified at B),
-- e9 platform admin.  Doctor P is pending at clinic A and has no account.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000014e1', 'p1@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e2', 'p2@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e3', 'staffa@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e4', 'admina@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e5', 'staffb@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e6', 'doca@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e7', 'docb@test.com', now(), now()),
('00000000-0000-0000-0000-0000000014e9', 'platform@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000014e9', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-0000000014c1', 'Matrix Clinic A', '1 A Road', '000', 'a@test.com', false),
('00000000-0000-0000-0000-0000000014c2', 'Matrix Clinic B', '2 B Road', '000', 'b@test.com', false);
INSERT INTO public.doctors (id, name, consultation_fee, is_demo, user_id) VALUES
('00000000-0000-0000-0000-0000000014d1', 'Dr Matrix A', 500, false, '00000000-0000-0000-0000-0000000014e6'),
('00000000-0000-0000-0000-0000000014d2', 'Dr Matrix B', 500, false, '00000000-0000-0000-0000-0000000014e7'),
('00000000-0000-0000-0000-0000000014d3', 'Dr Matrix Pending', 500, false, NULL);
-- Only a platform admin may set verification (check_clinic_doctor_update downgrades anyone else).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000014e9", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014d1', true, 'verified'),
('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014d2', true, 'verified'),
('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014d3', true, 'pending');
RESET request.jwt.claims;
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014e3', 'clinic_staff'),
('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014e4', 'clinic_admin'),
('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014e5', 'clinic_staff');
-- Patient rows come from the sign-up triggers; give them known ids for the fixtures below.
UPDATE public.patients SET id = '00000000-0000-0000-0000-0000000014f1' WHERE user_id = '00000000-0000-0000-0000-0000000014e1';
UPDATE public.patients SET id = '00000000-0000-0000-0000-0000000014f2' WHERE user_id = '00000000-0000-0000-0000-0000000014e2';
INSERT INTO public.appointments (id, patient_id, doctor_id, clinic_id, date, time, status, fee) VALUES
('00000000-0000-0000-0000-0000000014a1', '00000000-0000-0000-0000-0000000014f1', '00000000-0000-0000-0000-0000000014d1', '00000000-0000-0000-0000-0000000014c1', CURRENT_DATE + 3, '10:00', 'confirmed', 500),
('00000000-0000-0000-0000-0000000014a2', '00000000-0000-0000-0000-0000000014f2', '00000000-0000-0000-0000-0000000014d2', '00000000-0000-0000-0000-0000000014c2', CURRENT_DATE + 3, '11:00', 'confirmed', 500);
INSERT INTO public.conversations (id, patient_id, clinic_id, doctor_id, kind) VALUES
('00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014f1', '00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014d1', 'general'),
('00000000-0000-0000-0000-0000000014b2', '00000000-0000-0000-0000-0000000014f2', '00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014d2', 'general');

-- ---- PATIENT (e1)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000014e1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_memberships), 0, 'patient: sees no clinic memberships');
SELECT extensions.is((SELECT count(*)::int FROM public.appointments), 1, 'patient: sees only their own appointment');
SELECT extensions.is((SELECT count(*)::int FROM public.conversations WHERE clinic_id = '00000000-0000-0000-0000-0000000014c2'), 0, 'patient: sees no other patient''s conversation');
SELECT extensions.is((SELECT count(*)::int FROM public.patients WHERE id = '00000000-0000-0000-0000-0000000014f2'), 0, 'patient: cannot read another patient');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014e1', 'clinic_admin') $$,
    '42501', NULL, 'patient: cannot make themselves a clinic member by inserting a membership'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES ('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014d3', true, 'verified') $$,
    '42501', NULL, 'patient: cannot create a doctor–clinic link'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET user_id = '00000000-0000-0000-0000-0000000014e1' WHERE id = '00000000-0000-0000-0000-0000000014d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'patient: cannot claim an unlinked doctor profile'
);
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000014d3'), 0, 'patient: cannot see a pending, unlisted doctor');
RESET role;

-- ---- CLINIC STAFF at A (e3)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000014e3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.appointments WHERE clinic_id = '00000000-0000-0000-0000-0000000014c2'), 0, 'clinic staff: sees no appointments of another clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.appointments WHERE clinic_id = '00000000-0000-0000-0000-0000000014c1'), 1, 'clinic staff: sees their own clinic''s appointment');
SELECT extensions.is((SELECT count(*)::int FROM public.conversations WHERE clinic_id = '00000000-0000-0000-0000-0000000014c2'), 0, 'clinic staff: sees no conversations of another clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = '00000000-0000-0000-0000-0000000014c2'), 0, 'clinic staff: sees no memberships of another clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.patients WHERE id = '00000000-0000-0000-0000-0000000014f2'), 0, 'clinic staff: cannot read a patient with no link to their clinic');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES ('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014e3', 'clinic_staff') $$,
    '42501', NULL, 'clinic staff: cannot join another clinic'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.clinic_memberships SET role = 'clinic_admin' WHERE user_id = '00000000-0000-0000-0000-0000000014e3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic staff: cannot promote themselves to clinic admin'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014d2', true, 'pending') $$,
    '42501', NULL, 'clinic staff: cannot attach an arbitrary doctor'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'edited' WHERE id = '00000000-0000-0000-0000-0000000014d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic staff: cannot edit a doctor through a pending link'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'edited' WHERE id = '00000000-0000-0000-0000-0000000014d2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic staff: cannot edit another clinic''s doctor'
);
RESET role;

-- ---- CLINIC ADMIN at A (e4)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000014e4", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES ('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014e4', 'clinic_admin') $$,
    '42501', NULL, 'clinic admin: cannot grant themselves access to another clinic'
);
-- The admin can see the row, so the policy's check on the new row rejects it (not a silent 0).
SELECT extensions.throws_ok(
    $$ UPDATE public.clinic_memberships SET clinic_id = '00000000-0000-0000-0000-0000000014c2' WHERE user_id = '00000000-0000-0000-0000-0000000014e3' $$,
    '42501', NULL, 'clinic admin: cannot move a membership to another clinic'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'edited' WHERE id = '00000000-0000-0000-0000-0000000014d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic admin: cannot edit a doctor whose link is still pending'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.clinic_doctors SET verification_state = 'verified' WHERE doctor_id = '00000000-0000-0000-0000-0000000014d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic admin: cannot verify a doctor link'
);
RESET role;

-- ---- DOCTOR verified at A (e6)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000014e6", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.appointments WHERE doctor_id = '00000000-0000-0000-0000-0000000014d2'), 0, 'doctor: sees no appointments of another doctor');
SELECT extensions.is((SELECT count(*)::int FROM public.patients WHERE id = '00000000-0000-0000-0000-0000000014f2'), 0, 'doctor: cannot read an arbitrary patient');
SELECT extensions.is((SELECT count(*)::int FROM public.conversations WHERE doctor_id = '00000000-0000-0000-0000-0000000014d2'), 0, 'doctor: sees no conversations about another doctor');
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'hijacked' WHERE id = '00000000-0000-0000-0000-0000000014d2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'doctor: cannot edit another doctor''s profile'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.clinic_doctors SET verification_state = 'verified' WHERE doctor_id = '00000000-0000-0000-0000-0000000014d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'doctor: cannot change any link''s verification'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014e6', 'clinic_admin') $$,
    '42501', NULL, 'doctor: cannot make themselves a clinic member'
);
RESET role;

-- ---- Nothing above changed anything (checked as the owner)
SELECT extensions.ok(
    (SELECT verification_state = 'pending' FROM public.clinic_doctors WHERE doctor_id = '00000000-0000-0000-0000-0000000014d3')
    AND (SELECT user_id IS NULL AND about IS NULL FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000014d3')
    AND (SELECT about IS NULL FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000014d2'),
    'no doctor or link was changed by the attempts above'
);
SELECT extensions.ok(
    (SELECT count(*) FROM public.clinic_memberships WHERE user_id IN ('00000000-0000-0000-0000-0000000014e1', '00000000-0000-0000-0000-0000000014e6')) = 0
    AND (SELECT role FROM public.clinic_memberships WHERE user_id = '00000000-0000-0000-0000-0000000014e3') = 'clinic_staff'
    AND (SELECT clinic_id FROM public.clinic_memberships WHERE user_id = '00000000-0000-0000-0000-0000000014e3') = '00000000-0000-0000-0000-0000000014c1',
    'no membership was created, promoted or moved by the attempts above'
);

SELECT * FROM extensions.finish();
ROLLBACK;
