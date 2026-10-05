BEGIN;
SELECT extensions.plan(38);

-- Contract
SELECT extensions.ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.provider_applications'::regclass),
    'provider_applications has row level security'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clinic_doctors' AND policyname = 'clinic_doctors_all_staff'),
    0, 'clinic staff no longer have a write policy on clinic_doctors'
);
SELECT extensions.ok(
    NOT has_function_privilege('anon', 'public.admin_review_provider_application(uuid, boolean, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.clinic_propose_doctor(uuid, text, text, text, integer, numeric, text[], text[], text, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.admin_add_clinic_member(uuid, text, text)', 'EXECUTE'),
    'anon cannot execute the onboarding functions'
);
SELECT extensions.ok(
    NOT has_column_privilege('authenticated', 'public.provider_applications', 'status', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.provider_applications', 'applicant_id', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.provider_applications', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.provider_applications', 'DELETE'),
    'applicants cannot set the owner or status, or edit/delete applications directly'
);

-- Fixtures (as the migration owner, outside RLS):
--   a1 platform admin, a2 clinic admin of C1, a3 clinic staff of C1, a4 applicant, a5 unrelated user.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000005a1', 'platform@test.com', now(), now()),
('00000000-0000-0000-0000-0000000005a2', 'clinicadmin@test.com', now(), now()),
('00000000-0000-0000-0000-0000000005a3', 'staff@test.com', now(), now()),
('00000000-0000-0000-0000-0000000005a4', 'applicant@test.com', now(), now()),
('00000000-0000-0000-0000-0000000005a5', 'other@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000005a1', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-0000000005c1', 'Clinic One', '1 Road', '000', 'c1@test.com', false),
('00000000-0000-0000-0000-0000000005c2', 'Clinic Two', '2 Road', '000', 'c2@test.com', false);
INSERT INTO public.doctors (id, name, consultation_fee, is_demo) VALUES
('00000000-0000-0000-0000-0000000005d1', 'Dr Verified', 500, false),
('00000000-0000-0000-0000-0000000005d2', 'Dr Pending', 500, false),
('00000000-0000-0000-0000-0000000005d3', 'Dr Elsewhere', 700, false);
-- Only a platform admin may set verification (check_clinic_doctor_update downgrades anyone else).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005d1', true, 'verified'),
('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005d2', true, 'pending'),
('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005d3', true, 'verified');
RESET request.jwt.claims;
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005a2', 'clinic_admin'),
('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005a3', 'clinic_staff');

-- Anonymous visitors: only sample or verified doctors are listed
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000005d1'), 1, 'a verified doctor is publicly listed');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000005d2'), 0, 'an unverified, non-sample doctor is not publicly listed');
RESET role;

-- Clinic staff (not an admin) of C1: the takeover path is closed
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
    $$ INSERT INTO public.clinic_doctors (clinic_id, doctor_id) VALUES ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005d3') $$,
    '42501', NULL, 'clinic staff cannot link another clinic''s doctor to their clinic'
);
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000005d2'), 1, 'clinic members still see their own clinic''s pending doctor');
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'hijacked' WHERE id = '00000000-0000-0000-0000-0000000005d3' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic staff cannot edit a doctor at another clinic'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'edited' WHERE id = '00000000-0000-0000-0000-0000000005d1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'non-admin staff cannot edit even their own clinic''s doctor'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000005c1', 1, '09:00', '12:00', 30) $$,
    '42501', NULL, 'staff cannot open hours for an unverified doctor'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005c1', 1, '09:00', '12:00', 30) $$,
    'staff can set hours for a doctor verified at their clinic'
);
SELECT extensions.throws_ok(
    $$ SELECT public.clinic_propose_doctor('00000000-0000-0000-0000-0000000005c1', 'Dr New', 'general', NULL, 5, 400, '{}', '{}', 'TNMC 12345', NULL) $$,
    '42501', NULL, 'only clinic admins can propose doctors'
);
RESET role;

-- Clinic admin of C1
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a2", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'Updated bio' WHERE id = '00000000-0000-0000-0000-0000000005d1' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'a clinic admin can edit the profile of a doctor verified at their clinic'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctors SET is_demo = true WHERE id = '00000000-0000-0000-0000-0000000005d1' $$,
    'P0001', NULL, 'a clinic admin cannot change a doctor''s sample status'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.doctors SET consultation_fee = 1 WHERE id = '00000000-0000-0000-0000-0000000005d1' $$,
    'P0001', NULL, 'a clinic admin cannot change the fee shared across clinics'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.doctors SET about = 'x' WHERE id = '00000000-0000-0000-0000-0000000005d2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a clinic admin cannot edit a doctor who is still pending'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.clinic_doctors SET verification_state = 'verified' WHERE doctor_id = '00000000-0000-0000-0000-0000000005d2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a clinic admin cannot verify their own doctor'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.clinics SET is_demo = true WHERE id = '00000000-0000-0000-0000-0000000005c1' $$,
    'P0001', NULL, 'a clinic admin cannot change their clinic''s sample status'
);
SELECT extensions.lives_ok(
    $$ SELECT public.clinic_propose_doctor('00000000-0000-0000-0000-0000000005c1', 'Dr Proposed', 'pediatrics', 'female', 8, 600, ARRAY['MBBS'], ARRAY['Tamil'], 'TNMC 55555', NULL) $$,
    'a clinic admin can propose a new doctor'
);
SELECT extensions.throws_ok(
    $$ SELECT public.clinic_propose_doctor('00000000-0000-0000-0000-0000000005c2', 'Dr Sneaky', 'general', NULL, 1, 100, '{}', '{}', 'TNMC 1', NULL) $$,
    '42501', NULL, 'a clinic admin cannot propose doctors for another clinic'
);
SELECT extensions.throws_ok(
    $$ SELECT public.clinic_propose_doctor('00000000-0000-0000-0000-0000000005c1', 'Dr Bad Specialty', 'astrology', NULL, 1, 100, '{}', '{}', 'TNMC 2', NULL) $$,
    'P0001', NULL, 'proposals are validated server-side'
);
RESET role;
SELECT extensions.is(
    (SELECT verification_state FROM public.clinic_doctors cd JOIN public.doctors d ON d.id = cd.doctor_id WHERE d.name = 'Dr Proposed'),
    'pending', 'a proposed doctor starts pending'
);

-- Applicant
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a4", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ INSERT INTO public.provider_applications (clinic_name, area, address, contact_name, contact_role, contact_phone, contact_email, registration_details)
       VALUES ('Real Health Clinic', 'Adyar', '12 Main Road, Adyar', 'A Applicant', 'owner', '+91 98400 00000', 'applicant@test.com', 'TN CE Act reg. 2026/123') $$,
    'a signed-in user can apply'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.provider_applications (clinic_name, area, address, contact_name, contact_role, contact_phone, contact_email, registration_details, status)
       VALUES ('Self Approved', 'Adyar', '12 Main Road', 'A Applicant', 'owner', '+91 98400 00000', 'applicant@test.com', 'reg 1', 'approved') $$,
    '42501', NULL, 'an applicant cannot approve their own application'
);
SELECT extensions.is((SELECT count(*)::int FROM public.provider_applications), 1, 'an applicant sees their own application');
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_provider_application((SELECT id FROM public.provider_applications LIMIT 1), true, NULL) $$,
    '42501', NULL, 'an applicant cannot review applications'
);
INSERT INTO public.provider_applications (clinic_name, area, address, contact_name, contact_role, contact_phone, contact_email, registration_details)
VALUES ('Second Clinic', 'OMR', '1 OMR Road', 'A Applicant', 'owner', '9840000000', 'applicant@test.com', 'reg 22222'),
       ('Third Clinic', 'OMR', '2 OMR Road', 'A Applicant', 'owner', '9840000000', 'applicant@test.com', 'reg 33333');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.provider_applications (clinic_name, area, address, contact_name, contact_role, contact_phone, contact_email, registration_details)
       VALUES ('Fourth Clinic', 'OMR', '3 OMR Road', 'A Applicant', 'owner', '9840000000', 'applicant@test.com', 'reg 44444') $$,
    'P0001', NULL, 'at most three open applications per account'
);
RESET role;

-- An unrelated user sees nothing
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a5", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.provider_applications), 0, 'other users cannot read someone else''s application');
RESET role;

-- Platform admin
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.provider_applications), 3, 'a platform admin sees every application');
SELECT extensions.lives_ok(
    $$ SELECT public.admin_review_provider_application((SELECT id FROM public.provider_applications WHERE clinic_name = 'Real Health Clinic'), true, 'Registration checked') $$,
    'a platform admin can approve an application'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_review_provider_application((SELECT id FROM public.provider_applications WHERE clinic_name = 'Real Health Clinic'), false, NULL) $$,
    'P0001', NULL, 'an application can only be reviewed once'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.clinic_doctors SET verification_state = 'verified' WHERE doctor_id = '00000000-0000-0000-0000-0000000005d2' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'a platform admin can verify a doctor–clinic link'
);
SELECT extensions.lives_ok(
    $$ SELECT public.admin_add_clinic_member('00000000-0000-0000-0000-0000000005c2', 'OTHER@test.com', 'clinic_staff') $$,
    'a platform admin can add a member by email (case-insensitive)'
);
SELECT extensions.throws_ok(
    $$ SELECT public.admin_add_clinic_member('00000000-0000-0000-0000-0000000005c2', 'nobody@test.com', 'clinic_staff') $$,
    'P0001', NULL, 'adding an unknown email fails clearly'
);
RESET role;

-- Results of the admin actions
SELECT extensions.ok(
    EXISTS (SELECT 1 FROM public.clinic_memberships m JOIN public.provider_applications a ON a.clinic_id = m.clinic_id
            WHERE a.clinic_name = 'Real Health Clinic' AND m.user_id = '00000000-0000-0000-0000-0000000005a4'
              AND m.role = 'clinic_admin' AND m.active),
    'approval makes the applicant the admin of the new clinic'
);
SELECT extensions.is(
    (SELECT c.is_demo FROM public.clinics c JOIN public.provider_applications a ON a.clinic_id = c.id WHERE a.clinic_name = 'Real Health Clinic'),
    false, 'an approved clinic is not a sample listing'
);
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-0000000005d2'), 1, 'a doctor becomes publicly listed once verified');
RESET role;

SELECT * FROM extensions.finish();
ROLLBACK;
