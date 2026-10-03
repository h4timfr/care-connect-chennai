BEGIN;
SELECT extensions.plan(16);

-- Fixtures (inserted as the test owner; auth triggers create public.users and public.patients rows)
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000000a1', 'patientA@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000a2', 'patientB@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000a3', 'staffX@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000a4', 'doctorX@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000a5', 'patientC@test.com', now(), now());

UPDATE public.patients SET id = '10000000-0000-0000-0000-0000000000a1', full_name = 'Patient A' WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
UPDATE public.patients SET id = '10000000-0000-0000-0000-0000000000a2', full_name = 'Patient B' WHERE user_id = '00000000-0000-0000-0000-0000000000a2';
UPDATE public.patients SET id = '10000000-0000-0000-0000-0000000000a5', full_name = 'Patient C' WHERE user_id = '00000000-0000-0000-0000-0000000000a5';

INSERT INTO public.clinics (id, name, address, phone, email) VALUES
('20000000-0000-0000-0000-0000000000c1', 'Clinic X', '1 Test St', '555-0101', 'x@test.com'),
('20000000-0000-0000-0000-0000000000c2', 'Clinic Y', '2 Test St', '555-0102', 'y@test.com');
INSERT INTO public.doctors (id, user_id, name, consultation_fee) VALUES
('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a4', 'Doctor X', 400);

-- Staff X is an active member of Clinic X only
INSERT INTO public.clinic_memberships (user_id, clinic_id, role, active) VALUES
('00000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000c1', 'clinic_staff', true);
-- Patient A is linked to Clinic X through an appointment, Patient B through a conversation; Patient C through nothing
INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, fee) VALUES
('10000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', CURRENT_DATE + 10, '10:00', 'pending', 400);
INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES
('10000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000c1', 'general');

-- Helper and policy definition
SELECT extensions.policies_are('public', 'patients', ARRAY['patients_read_self', 'patients_read_staff', 'patients_update_self'], 'patients keeps exactly the three expected policies');
SELECT extensions.is(
    (SELECT roles::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'patients_read_staff'),
    '{authenticated}',
    'patients_read_staff applies to authenticated only'
);
SELECT extensions.is_definer('private', 'get_clinic_patient_ids', ARRAY[]::text[], 'get_clinic_patient_ids is SECURITY DEFINER');
SELECT extensions.function_owner_is('private', 'get_clinic_patient_ids', ARRAY[]::text[], 'postgres', 'get_clinic_patient_ids is owned by postgres');
SELECT extensions.is(
    (SELECT proconfig::text FROM pg_proc WHERE proname = 'get_clinic_patient_ids' AND pronamespace = 'private'::regnamespace),
    '{"search_path=\"\""}',
    'get_clinic_patient_ids pins an empty search_path'
);
SELECT extensions.function_privs_are('private', 'get_clinic_patient_ids', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon has no EXECUTE on get_clinic_patient_ids');
SELECT extensions.function_privs_are('private', 'get_clinic_patient_ids', ARRAY[]::text[], 'authenticated', ARRAY['EXECUTE'], 'authenticated has EXECUTE on get_clinic_patient_ids');

-- Patient A: own row only, and no 42P17 recursion
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok($$ SELECT count(*) FROM public.patients $$, 'reading patients does not recurse');
SELECT extensions.is((SELECT count(*)::int FROM public.patients), 1, 'a patient sees only their own row');
SELECT extensions.lives_ok($$ SELECT count(*) FROM public.appointments $$, 'reading appointments does not recurse');

-- Staff X: exactly the patients linked to Clinic X (A via appointment, B via conversation), never the unlinked C
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.patients WHERE full_name IN ('Patient A', 'Patient B')), 2, 'staff see patients linked by appointment and by conversation');
SELECT extensions.is((SELECT count(*)::int FROM public.patients WHERE full_name = 'Patient C'), 0, 'staff cannot see a patient with no link to their clinic');
-- Option B: staff cannot create conversations (otherwise they could link themselves to any patient)
SELECT extensions.throws_ok(
    $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('10000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-0000000000c1', 'general') $$,
    '42501', NULL, 'staff cannot insert a conversation for an arbitrary patient'
);

-- Patient C: patients keep creating their own conversations; the general-conversation unique index holds
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('10000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-0000000000c1', 'general') $$,
    'a patient can still create their own conversation'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('10000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-0000000000c1', 'general') $$,
    '23505', NULL, 'a second general conversation for the same patient and clinic is rejected'
);

-- anon has no access to patients at all
RESET role;
SET LOCAL role anon;
SELECT extensions.throws_ok($$ SELECT count(*) FROM public.patients $$, '42501', NULL, 'anon cannot read patients');

SELECT * FROM extensions.finish();
ROLLBACK;
