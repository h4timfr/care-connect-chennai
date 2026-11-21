BEGIN;
SELECT extensions.plan(30);

-- Exact deterministic rows inserted by 00008.  The full clean/staging-state replay
-- must preserve these only as demo data; no candidate import is part of this job.
SELECT extensions.is(
  (SELECT count(*)::int FROM public.clinics WHERE id = ANY (ARRAY[
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666'
  ]::uuid[])),
  6, 'all six exact migration 00008 clinic IDs exist'
);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.clinics WHERE id = ANY (ARRAY[
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666'
  ]::uuid[]) AND is_demo),
  6, 'all six migration 00008 clinics remain explicitly classified as demo'
);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.clinics WHERE id = ANY (ARRAY[
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666'
  ]::uuid[]) AND clinic_verification_state = 'pending' AND NOT is_published
      AND patient_contact_permission = 'not_granted' AND NOT booking_enabled),
  6, 'all demo clinics retain denied verification, publication, contact and booking states'
);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.doctors WHERE id = ANY (ARRAY[
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12'
  ]::uuid[])),
  12, 'all twelve exact migration 00008 doctor IDs exist'
);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.doctors WHERE id = ANY (ARRAY[
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12'
  ]::uuid[]) AND is_demo),
  12, 'all twelve migration 00008 doctors remain explicitly classified as demo'
);
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors), 12,
  'migration 00008 created exactly twelve clinic-doctor relationships');
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors WHERE verification_state = 'pending'), 12,
  'all seeded relationships remain pending and unverified');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules), 64,
  'migration 00008 created exactly sixty-four schedules');
SELECT extensions.is(
  (SELECT count(*)::int FROM public.candidate_facilities)
    + (SELECT count(*)::int FROM public.candidate_doctors)
    + (SELECT count(*)::int FROM public.candidate_relationships)
    + (SELECT count(*)::int FROM public.candidate_sources)
    + (SELECT count(*)::int FROM public.candidate_evidence)
    + (SELECT count(*)::int FROM public.candidate_contacts),
  0, 'seeded providers were not copied into the isolated research-candidate catalogue'
);

SET LOCAL role anon;
SELECT extensions.is(
  (SELECT count(id)::int FROM public.clinics WHERE id::text LIKE '11111111-%' OR id::text LIKE '22222222-%'
     OR id::text LIKE '33333333-%' OR id::text LIKE '44444444-%' OR id::text LIKE '55555555-%'
     OR id::text LIKE '66666666-%'),
  0, 'anonymous public clinic discovery hides every migration 00008 clinic'
);
SELECT extensions.is(
  (SELECT count(id)::int FROM public.doctors WHERE id::text LIKE 'aaaaaaaa-%'),
  0, 'anonymous public doctor discovery hides every migration 00008 doctor'
);
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors), 0,
  'anonymous public reads hide every demo clinic-doctor relationship');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules), 0,
  'anonymous public reads hide every schedule belonging to demo providers');
SELECT extensions.is(
  (SELECT count(*)::int FROM public.get_doctor_slots(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111',
    (current_date + 7))),
  0, 'the public slot RPC returns no availability for a demo provider'
);
RESET role;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-0000000021e1', 'demo-boundary-admin@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-0000000021e2', 'demo-boundary-patient@test.invalid', now(), now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-0000000021e1', 'platform_admin');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000021e1","role":"authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ SELECT public.admin_set_clinic_publication_state(
       '11111111-1111-1111-1111-111111111111', 'verified', true, 'not_granted', true) $$,
  '23514', 'Sample clinics cannot be published, contacted, or bookable.',
  'even the authorized admin transition rejects publishing a seeded demo clinic'
);
SELECT extensions.is(
  (SELECT count(id)::int FROM public.clinics WHERE id = '11111111-1111-1111-1111-111111111111'
    AND is_demo AND clinic_verification_state = 'pending' AND NOT is_published AND NOT booking_enabled),
  1, 'the rejected admin transition leaves the demo clinic unpublished and unbookable'
);
RESET role;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000021e2","role":"authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ SELECT public.book_appointment(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111',
       (current_date + 7), '09:00', 'demo boundary regression') $$,
  'P0001', 'Validation Failed: Doctor is not currently active or verified at this clinic.',
  'an authenticated patient cannot book a demo provider through the final booking RPC'
);
SELECT extensions.is(
  (SELECT count(*)::int FROM public.appointments a
   JOIN public.patients p ON p.id = a.patient_id
   WHERE p.user_id = '00000000-0000-0000-0000-0000000021e2'),
  0, 'the rejected demo booking creates no appointment'
);
RESET role;
RESET request.jwt.claims;

-- These transaction-scoped fixtures model a pending demo doctor and an unrelated doctor.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-0000000021e3', 'linked-demo@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-0000000021e4', 'other-doctor@test.invalid', now(), now());
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
  ('00000000-0000-0000-0000-0000000021c1', 'Clinic For Unrelated Doctor', 'Test Road',
   '000000', 'clinic@test.invalid', false);
INSERT INTO public.doctors (id, user_id, name, consultation_fee, is_demo) VALUES
  ('00000000-0000-0000-0000-0000000021d1', '00000000-0000-0000-0000-0000000021e3',
   'Linked Demo Doctor', 500, true),
  ('00000000-0000-0000-0000-0000000021d2', '00000000-0000-0000-0000-0000000021e4',
   'Unrelated Doctor', 500, false);
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000021d1', true, 'pending'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000021d1', false, 'pending'),
  ('00000000-0000-0000-0000-0000000021c1', '00000000-0000-0000-0000-0000000021d1', false, 'pending'),
  ('00000000-0000-0000-0000-0000000021c1', '00000000-0000-0000-0000-0000000021d2', true, 'pending'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000021d2', false, 'pending');

SET LOCAL role anon;
SELECT extensions.throws_ok($$ SELECT * FROM public.my_linked_clinic_names() $$,
  '42501', NULL, 'anonymous callers cannot invoke the linked clinic lookup');
SELECT extensions.throws_ok($$ SELECT * FROM public.admin_demo_doctor_links() $$,
  '42501', NULL, 'anonymous callers cannot invoke the demo review lookup');
RESET role;

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000021e3","role":"authenticated"}';
SELECT extensions.is(
  (SELECT count(*)::int FROM public.clinic_doctors AS cd
   LEFT JOIN public.clinics AS c ON c.id = cd.clinic_id
   WHERE cd.doctor_id = '00000000-0000-0000-0000-0000000021d1' AND cd.active
     AND cd.verification_state = 'pending' AND c.name IS NULL),
  1, 'the pending relationship is visible while the original embedded clinic row stays hidden'
);
SELECT extensions.results_eq(
  $$ SELECT * FROM public.my_linked_clinic_names() $$,
  $$ VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'Little Steps Clinic'::text) $$,
  'the linked doctor sees only the ID and name of their active clinic'
);
SELECT extensions.is((SELECT count(*)::int FROM public.admin_demo_doctor_links()), 0,
  'the linked doctor cannot list demo relationships through the admin lookup');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000021e4","role":"authenticated"}';
SELECT extensions.results_eq(
  $$ SELECT * FROM public.my_linked_clinic_names() $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000021c1'::uuid, 'Clinic For Unrelated Doctor'::text) $$,
  'another doctor sees only their own active clinic and no inactive demo clinic');
SELECT extensions.throws_ok(
  $$ SELECT email FROM public.clinics WHERE id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', NULL, 'another doctor cannot read the demo clinic contact field');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000021e1","role":"authenticated"}';
SELECT extensions.results_eq(
  $$ SELECT doctor_name, clinic_name, verification_state, active
     FROM public.admin_demo_doctor_links()
     WHERE doctor_id = '00000000-0000-0000-0000-0000000021d1'
        OR clinic_id = '00000000-0000-0000-0000-0000000021c1'
     ORDER BY active DESC, clinic_name $$,
  $$ VALUES ('Linked Demo Doctor'::text, 'Little Steps Clinic'::text, 'pending'::text, true),
            ('Linked Demo Doctor'::text, 'Anna Nagar Ortho & Physio Centre'::text, 'pending'::text, false),
            ('Linked Demo Doctor'::text, 'Clinic For Unrelated Doctor'::text, 'pending'::text, false) $$,
  'the admin sees demo names and statuses, including inactive links, and no genuine relationship'
);
SELECT extensions.throws_ok(
  $$ UPDATE public.clinic_doctors SET verification_state = 'verified'
     WHERE clinic_id = '11111111-1111-1111-1111-111111111111'
       AND doctor_id = '00000000-0000-0000-0000-0000000021d2' $$,
  '23514', 'Test and demo relationships cannot be verified.',
  'the admin write path cannot verify a link involving a demo clinic');
SELECT extensions.throws_ok(
  $$ UPDATE public.clinic_doctors SET verification_state = 'verified'
     WHERE clinic_id = '00000000-0000-0000-0000-0000000021c1'
       AND doctor_id = '00000000-0000-0000-0000-0000000021d1' $$,
  '23514', 'Test and demo relationships cannot be verified.',
  'the admin write path cannot verify a link involving a demo doctor');
SELECT extensions.lives_ok(
  $$ UPDATE public.clinic_doctors SET verification_state = 'verified'
     WHERE clinic_id = '00000000-0000-0000-0000-0000000021c1'
       AND doctor_id = '00000000-0000-0000-0000-0000000021d2' $$,
  'the existing admin verification path still verifies genuine relationships');
SELECT extensions.is(
  (SELECT verification_state FROM public.clinic_doctors
   WHERE clinic_id = '00000000-0000-0000-0000-0000000021c1'
     AND doctor_id = '00000000-0000-0000-0000-0000000021d2'),
  'verified', 'the genuine relationship retains its saved verification state');
RESET role;
RESET request.jwt.claims;

SELECT * FROM extensions.finish();
ROLLBACK;
