BEGIN;
SELECT extensions.plan(46);

-- ---- Contract: private tables, no anon access, review UI limited to review columns
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity
       AND relname IN ('candidate_facilities', 'candidate_doctors', 'candidate_relationships',
                       'candidate_sources', 'candidate_evidence', 'candidate_contacts')),
    6, 'all six candidate tables have row level security'
);
SELECT extensions.ok(
    NOT has_table_privilege('anon', 'public.candidate_facilities', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.candidate_doctors', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.candidate_relationships', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.candidate_sources', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.candidate_evidence', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.candidate_contacts', 'SELECT'),
    'anon has no access to any candidate table'
);
SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.candidate_facilities', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.candidate_doctors', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.candidate_relationships', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.candidate_sources', 'INSERT'),
    'research records are created only by the owner-run import'
);
SELECT extensions.ok(
    NOT has_column_privilege('authenticated', 'public.candidate_facilities', 'name', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.candidate_facilities', 'booking_enabled', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.candidate_doctors', 'registration_status', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.candidate_relationships', 'research_status', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.candidate_facilities', 'review_status', 'UPDATE'),
    'the review UI can change review state, never research facts or booking'
);
SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.candidate_evidence', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.candidate_evidence', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.candidate_contacts', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.candidate_contacts', 'DELETE')
    AND NOT has_column_privilege('authenticated', 'public.candidate_evidence', 'recorded_by', 'INSERT'),
    'evidence and contact logs are append-only and record the acting admin'
);

-- ---- Inserts (as the import would run) can only create fresh candidates
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_facilities (research_id, name, facility_type, locality, source_confidence, researched_on, booking_enabled)
       VALUES ('CLINIC-998', 'Test Facility Bookable', 'clinic', 'Adyar', 'high', '2026-10-01', true) $$,
    '23514', NULL, 'a candidate can never be bookable'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_facilities (research_id, name, facility_type, locality, source_confidence, researched_on, review_status)
       VALUES ('CLINIC-997', 'Test Facility Preverified', 'clinic', 'Adyar', 'high', '2026-10-01', 'verified') $$,
    'P0001', NULL, 'a candidate cannot be imported as verified'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_doctors (research_id, full_name, specialty, source_confidence, researched_on, registration_status)
       VALUES ('DOCTOR-997', 'Test Doctor Preverified', 'General Medicine', 'high', '2026-10-01', 'verified') $$,
    'P0001', NULL, 'a doctor cannot be imported with a verified registration'
);

-- Fixtures (outside RLS). a1 platform admin, s1 clinic staff, p1 patient. Synthetic test records.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000007a1', 'admin7@test.com', now(), now()),
('00000000-0000-0000-0000-0000000007a2', 'staff7@test.com', now(), now()),
('00000000-0000-0000-0000-0000000007a3', 'patient7@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000007a1', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-0000000007c1', 'Clinic Seven', '7 Road', '000', 'c7@test.com', false);
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007a2', 'clinic_admin');
INSERT INTO public.candidate_facilities (id, research_id, name, facility_type, address, locality, website, specialties, source_confidence, unresolved_issues, researched_on)
VALUES ('00000000-0000-0000-0000-0000000007f1', 'CLINIC-901', 'Test Candidate Facility', 'Multispecialty clinic', '1 Test Street', 'Adyar',
        'https://example.invalid/facility', ARRAY['General Medicine'], 'medium', ARRAY['Branch address needs confirmation'], '2026-10-01');
INSERT INTO public.candidate_doctors (id, research_id, full_name, specialty, qualifications, source_confidence, researched_on)
VALUES ('00000000-0000-0000-0000-0000000007d1', 'DOCTOR-901', 'Test Candidate Doctor', 'General Medicine', 'MBBS', 'medium', '2026-10-01');
INSERT INTO public.candidate_relationships (id, doctor_candidate_id, facility_candidate_id, research_status, confidence)
VALUES ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007f1', 'POSSIBLE_NEEDS_CONFIRMATION', 'low');
INSERT INTO public.candidate_sources (facility_candidate_id, url, source_type, supports, researched_on, confidence)
VALUES ('00000000-0000-0000-0000-0000000007f1', 'https://example.invalid/facility', 'official_facility', 'Facility name and address', '2026-10-01', 'medium');

CREATE TEMP TABLE baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.clinics) AS clinics,
       (SELECT count(*) FROM public.doctors) AS doctors,
       (SELECT count(*) FROM public.clinic_doctors) AS links,
       (SELECT count(*) FROM public.doctor_schedules) AS schedules;
GRANT SELECT ON baseline TO anon, authenticated;

SELECT extensions.is(
    (SELECT review_status || '/' || permission_status || '/' || booking_enabled::text FROM public.candidate_facilities WHERE research_id = 'CLINIC-901'),
    'candidate/unknown/false', 'imported facilities start as candidate, permission unknown, not bookable'
);
SELECT extensions.is(
    (SELECT review_status || '/' || registration_status || '/' || booking_enabled::text FROM public.candidate_doctors WHERE research_id = 'DOCTOR-901'),
    'candidate/not_verified/false', 'imported doctors start as candidate with unverified registration, not bookable'
);
SELECT extensions.is(
    (SELECT careconnect_status FROM public.candidate_relationships WHERE id = '00000000-0000-0000-0000-0000000007e1'),
    'unverified', 'researched relationships are not CareConnect-confirmed'
);

-- ---- Anonymous visitors
SET LOCAL role anon;
SELECT extensions.throws_ok($$ SELECT count(*) FROM public.candidate_facilities $$, '42501', NULL, 'anon cannot read candidates');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE name = 'Test Candidate Doctor'), 0, 'candidates never appear in public doctor listings');
SELECT extensions.is((SELECT count(*)::int FROM public.clinics WHERE name = 'Test Candidate Facility'), 0, 'candidates never appear in public clinic listings');
RESET role;

-- ---- A signed-in patient
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000007a3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_facilities), 0, 'a patient cannot read candidates');
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_sources), 0, 'a patient cannot read research sources');
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.candidate_facilities SET review_status = 'verified' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'a patient cannot change a candidate'
);
RESET role;

-- ---- Clinic staff (even a clinic admin)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000007a2", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_doctors), 0, 'clinic staff cannot read candidates');
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_relationships), 0, 'clinic staff cannot read researched relationships');
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_evidence), 0, 'clinic staff cannot read verification evidence');
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_evidence (facility_candidate_id, evidence_type, value, source) VALUES ('00000000-0000-0000-0000-0000000007f1', 'clinic_identity', 'x', 'y') $$,
    '42501', NULL, 'clinic staff cannot record evidence'
);
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.candidate_doctors SET review_status = 'under_review' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (0) $$, 'clinic staff cannot review candidates'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_facilities (research_id, name, facility_type, locality, source_confidence, researched_on) VALUES ('CLINIC-996', 'Staff Added', 'clinic', 'Adyar', 'low', '2026-10-01') $$,
    '42501', NULL, 'clinic staff cannot add candidates'
);
RESET role;

-- ---- Platform admin
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_facilities WHERE research_id = 'CLINIC-901'), 1, 'a platform admin reads candidates');
SELECT extensions.is((SELECT count(*)::int FROM public.candidate_sources WHERE facility_candidate_id = '00000000-0000-0000-0000-0000000007f1'), 1, 'a platform admin reads research sources');
SELECT extensions.results_eq(
    $$ WITH u AS (UPDATE public.candidate_facilities SET review_status = 'under_review', notes = 'Started review' WHERE research_id = 'CLINIC-901' RETURNING 1) SELECT count(*)::int FROM u $$,
    $$ VALUES (1) $$, 'a platform admin can move a candidate through review'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_facilities SET review_status = 'verified' WHERE research_id = 'CLINIC-901' $$,
    'P0001', NULL, 'a facility cannot be verified without evidence'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_facilities SET permission_status = 'granted' WHERE research_id = 'CLINIC-901' $$,
    'P0001', NULL, 'listing permission cannot be marked granted without evidence'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_doctors SET review_status = 'verified' WHERE research_id = 'DOCTOR-901' $$,
    'P0001', NULL, 'a doctor cannot be verified without identity and registration evidence'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_facilities SET name = 'Renamed' WHERE research_id = 'CLINIC-901' $$,
    '42501', NULL, 'research facts cannot be edited from the review screen'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_facilities SET booking_enabled = true WHERE research_id = 'CLINIC-901' $$,
    '42501', NULL, 'booking cannot be enabled for a candidate'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.candidate_evidence (facility_candidate_id, evidence_type, value, source, recorded_by)
       VALUES ('00000000-0000-0000-0000-0000000007f1', 'clinic_identity', 'x', 'y', '00000000-0000-0000-0000-0000000007a2') $$,
    '42501', NULL, 'evidence cannot be recorded in someone else''s name'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.candidate_evidence (facility_candidate_id, evidence_type, value, source) VALUES
       ('00000000-0000-0000-0000-0000000007f1', 'clinic_identity', 'Registration certificate seen', 'Video call with the administrator, 2026-10-05'),
       ('00000000-0000-0000-0000-0000000007f1', 'address', 'Address confirmed', 'Site visit, 2026-10-05'),
       ('00000000-0000-0000-0000-0000000007f1', 'contact_details', 'Front desk number confirmed', 'Call, 2026-10-05') $$,
    'a platform admin records verification evidence'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM public.candidate_evidence WHERE recorded_by = '00000000-0000-0000-0000-0000000007a1'),
    3, 'evidence records the acting admin'
);
SELECT extensions.lives_ok(
    $$ UPDATE public.candidate_facilities SET review_status = 'verified' WHERE research_id = 'CLINIC-901' $$,
    'a facility can be verified once the required evidence exists'
);
SELECT extensions.is(
    (SELECT booking_enabled FROM public.candidate_facilities WHERE research_id = 'CLINIC-901'),
    false, 'a verified candidate is still not bookable'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.candidate_contacts (facility_candidate_id, contacted_on, method, outcome, permission_status, notes)
       VALUES ('00000000-0000-0000-0000-0000000007f1', '2026-10-05', 'phone', 'interested', 'granted', 'Said yes on the phone') $$,
    'a platform admin logs a contact attempt'
);
SELECT extensions.is(
    (SELECT permission_status FROM public.candidate_facilities WHERE research_id = 'CLINIC-901'),
    'unknown', 'a contact note alone never grants listing permission'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.candidate_evidence (facility_candidate_id, evidence_type, value, source)
       VALUES ('00000000-0000-0000-0000-0000000007f1', 'listing_permission', 'Signed listing consent', 'Consent form CC-0001')$$,
    'listing permission evidence can be recorded'
);
SELECT extensions.lives_ok(
    $$ UPDATE public.candidate_facilities SET permission_status = 'granted' WHERE research_id = 'CLINIC-901' $$,
    'permission can be marked granted once evidenced'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_relationships SET careconnect_status = 'confirmed' WHERE id = '00000000-0000-0000-0000-0000000007e1' $$,
    'P0001', NULL, 'a relationship cannot be confirmed without evidence'
);
SELECT extensions.throws_ok(
    $$ UPDATE public.candidate_evidence SET value = 'tampered' $$,
    '42501', NULL, 'recorded evidence cannot be edited'
);
SELECT extensions.throws_ok(
    $$ DELETE FROM public.candidate_evidence $$,
    '42501', NULL, 'recorded evidence cannot be deleted'
);
RESET role;

-- ---- Nothing reached the real provider tables
SELECT extensions.ok(
    (SELECT clinics FROM baseline) = (SELECT count(*) FROM public.clinics)
    AND (SELECT doctors FROM baseline) = (SELECT count(*) FROM public.doctors)
    AND (SELECT links FROM baseline) = (SELECT count(*) FROM public.clinic_doctors)
    AND (SELECT schedules FROM baseline) = (SELECT count(*) FROM public.doctor_schedules),
    'reviewing and verifying candidates creates no clinics, doctors, links or schedules'
);
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000007a2", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
    (SELECT count(*)::int FROM private.user_clinic_ids()),
    1, 'candidate records grant clinic staff nothing beyond their own membership'
);
RESET role;
SELECT extensions.ok(
    EXISTS (SELECT 1 FROM public.audit_logs WHERE action_type = 'candidate_review_changed'
            AND metadata ->> 'research_id' = 'CLINIC-901' AND metadata ->> 'to' = 'verified'),
    'review changes are audit-logged'
);

SELECT * FROM extensions.finish();
ROLLBACK;
