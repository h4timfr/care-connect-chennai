BEGIN;
SELECT extensions.plan(64);

-- All fixture rows are isolated from real accounts and all state transitions use the admin RPC.
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-000000005f01', 'patient1-publication@test.com', now(), now()),
('00000000-0000-0000-0000-000000005f02', 'patient2-publication@test.com', now(), now()),
('00000000-0000-0000-0000-000000005f03', 'clinic-admin-publication@test.com', now(), now()),
('00000000-0000-0000-0000-000000005f04', 'pending-member-publication@test.com', now(), now()),
('00000000-0000-0000-0000-000000005f05', 'doctor-publication@test.com', now(), now()),
('00000000-0000-0000-0000-000000005f09', 'platform-publication@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000005f09', 'platform_admin');
UPDATE public.patients SET id = '00000000-0000-0000-0000-000000005f11'
WHERE user_id = '00000000-0000-0000-0000-000000005f01';
UPDATE public.patients SET id = '00000000-0000-0000-0000-000000005f12'
WHERE user_id = '00000000-0000-0000-0000-000000005f02';

INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-0000-0000-000000005fc1', 'Sample clinic', '1 Test Rd', '000', 'sample@test.com', true),
('00000000-0000-0000-0000-000000005fc2', 'Pending clinic', '2 Test Rd', '000', 'pending@test.com', false),
('00000000-0000-0000-0000-000000005fc3', 'Verified unpublished clinic', '3 Test Rd', '000', 'unpublished@test.com', false),
('00000000-0000-0000-0000-000000005fc4', 'No contact permission clinic', '4 Test Rd', '000', 'nocontact@test.com', false),
('00000000-0000-0000-0000-000000005fc5', 'Contactable clinic', '5 Test Rd', '000', 'contactable@test.com', false),
('00000000-0000-0000-0000-000000005fc6', 'Inactive doctor clinic', '6 Test Rd', '000', 'inactive@test.com', false),
('00000000-0000-0000-0000-000000005fc7', 'Revoked contact clinic', '7 Test Rd', '000', 'revoked@test.com', false);
SELECT extensions.is(
  (SELECT count(id)::int FROM public.clinics WHERE NOT is_demo AND clinic_verification_state = 'pending'
    AND NOT is_published AND patient_contact_permission = 'not_granted' AND NOT booking_enabled),
  6, 'all real clinic rows start pending, unpublished, non-contactable, and not bookable');
INSERT INTO public.doctors (id, name, consultation_fee, is_demo) VALUES
('00000000-0000-0000-0000-000000005fd1', 'Dr Contactable', 500, false),
('00000000-0000-0000-0000-000000005fd2', 'Dr Other clinic', 500, false),
('00000000-0000-0000-0000-000000005fd3', 'Dr Pending', 500, false),
('00000000-0000-0000-0000-000000005fd4', 'Dr Sample', 500, true);
UPDATE public.doctors SET user_id = '00000000-0000-0000-0000-000000005f05'
WHERE id = '00000000-0000-0000-0000-000000005fd2';

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f09", "role": "authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-0000-0000-000000005fc2', '00000000-0000-0000-0000-000000005fd1', true, 'verified'),
('00000000-0000-0000-0000-000000005fc3', '00000000-0000-0000-0000-000000005fd1', true, 'verified'),
('00000000-0000-0000-0000-000000005fc4', '00000000-0000-0000-0000-000000005fd1', true, 'verified'),
('00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd1', true, 'verified'),
('00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd3', true, 'pending'),
('00000000-0000-0000-0000-000000005fc6', '00000000-0000-0000-0000-000000005fd2', true, 'verified'),
('00000000-0000-0000-0000-000000005fc3', '00000000-0000-0000-0000-000000005fd2', true, 'verified'),
('00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd4', true, 'verified');
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-0000-0000-000000005fc1', '00000000-0000-0000-0000-000000005fd1', true, 'verified'),
('00000000-0000-0000-0000-000000005fc7', '00000000-0000-0000-0000-000000005fd1', true, 'verified');
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc2', 'pending', false, 'not_granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc3', 'verified', false, 'not_granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc4', 'verified', true, 'not_granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc5', 'verified', true, 'granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc6', 'verified', true, 'granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc7', 'verified', true, 'revoked', false);
INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active) VALUES
('00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005f03', 'clinic_admin', true),
('00000000-0000-0000-0000-000000005fc2', '00000000-0000-0000-0000-000000005f03', 'clinic_admin', true),
('00000000-0000-0000-0000-000000005fc2', '00000000-0000-0000-0000-000000005f04', 'clinic_admin', false);
UPDATE public.clinic_doctors SET active = false
WHERE clinic_id = '00000000-0000-0000-0000-000000005fc6'
  AND doctor_id = '00000000-0000-0000-0000-000000005fd2';
INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes) VALUES
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc1', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc2', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc3', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc4', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc5', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd3', '00000000-0000-0000-0000-000000005fc5', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd2', '00000000-0000-0000-0000-000000005fc6', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd2', '00000000-0000-0000-0000-000000005fc3', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd1', '00000000-0000-0000-0000-000000005fc7', 0, '09:00', '12:00', 30),
('00000000-0000-0000-0000-000000005fd4', '00000000-0000-0000-0000-000000005fc5', 0, '09:00', '12:00', 30);

-- Public data API reads must not return contact fields for unpublished/sample clinics or doctors
-- whose only relationship is unpublished, pending, inactive, or a sample record.
SET LOCAL role anon;
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id IN (
  '00000000-0000-0000-0000-000000005fc1', '00000000-0000-0000-0000-000000005fc2',
  '00000000-0000-0000-0000-000000005fc3', '00000000-0000-0000-0000-000000005fc4',
  '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fc6',
  '00000000-0000-0000-0000-000000005fc7')),
  4, 'public sees only verified, published, non-sample fixture clinics');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc3'),
  0, 'unpublished clinic row is not publicly visible');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc2'),
  0, 'unverified clinic row is not publicly visible');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc1'),
  0, 'demo clinic row is not publicly visible');
SELECT extensions.is(
  NOT has_column_privilege('anon', 'public.clinics', 'phone', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.clinics', 'email', 'SELECT'),
  true, 'anonymous role has no direct SELECT privilege on clinic phone or email');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc5' AND name = 'Contactable clinic'),
  1, 'anonymous user can still read public-safe fields for a contactable clinic');
SELECT extensions.throws_ok(
  $$ SELECT phone FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc5' $$,
  '42501', NULL, 'contact permission does not expose phone through the public table API');
SELECT extensions.throws_ok(
  $$ SELECT email FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc4' $$,
  '42501', NULL, 'not-granted contact permission does not expose email through the public table API');
SELECT extensions.throws_ok(
  $$ SELECT phone FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc7' $$,
  '42501', NULL, 'revoked contact permission does not expose phone through the public table API');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-000000005fd1'),
  1, 'doctor linked to a published clinic is publicly visible');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-000000005fd2'),
  0, 'doctor with no active published relationship is hidden');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-000000005fd3'),
  0, 'pending doctor relationship is hidden');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-000000005fd4'),
  0, 'sample doctor is not part of public provider state');
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors WHERE clinic_id IN (
  '00000000-0000-0000-0000-000000005fc1', '00000000-0000-0000-0000-000000005fc2',
  '00000000-0000-0000-0000-000000005fc3', '00000000-0000-0000-0000-000000005fc4',
  '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fc6',
  '00000000-0000-0000-0000-000000005fc7')),
  3, 'only verified relationships at published clinics are publicly visible');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd1' AND clinic_id = '00000000-0000-0000-0000-000000005fc5'),
  1, 'public schedule read is allowed for a published clinic and active verified real doctor');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE clinic_id = '00000000-0000-0000-0000-000000005fc1'),
  0, 'public schedule read hides a demo clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE clinic_id = '00000000-0000-0000-0000-000000005fc2'),
  0, 'public schedule read hides an unverified clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE clinic_id = '00000000-0000-0000-0000-000000005fc3'),
  0, 'public schedule read hides an unpublished clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd2' AND clinic_id = '00000000-0000-0000-0000-000000005fc6'),
  0, 'public schedule read hides an inactive doctor relationship');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd3' AND clinic_id = '00000000-0000-0000-0000-000000005fc5'),
  0, 'public schedule read hides a pending doctor relationship');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd4' AND clinic_id = '00000000-0000-0000-0000-000000005fc5'),
  0, 'public schedule read hides a sample doctor');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd1'
    AND clinic_id IN ('00000000-0000-0000-0000-000000005fc4', '00000000-0000-0000-0000-000000005fc7')),
  2, 'publication, not contact permission, controls public schedule visibility');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fff'),
  0, 'forged clinic id cannot bypass the read boundary');
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f09", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc3'),
  1, 'platform admin can inspect an unpublished clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-0000-0000-000000005fd3'),
  1, 'platform admin can inspect a pending doctor relationship');
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors WHERE clinic_id IN (
  '00000000-0000-0000-0000-000000005fc1', '00000000-0000-0000-0000-000000005fc2',
  '00000000-0000-0000-0000-000000005fc3', '00000000-0000-0000-0000-000000005fc4',
  '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fc6')),
  10, 'platform admin can inspect every fixture relationship');
SELECT extensions.is((SELECT count(*)::int FROM public.admin_list_clinics()
  WHERE id = '00000000-0000-0000-0000-000000005fc3' AND phone = '000' AND email = 'unpublished@test.com'),
  1, 'platform admin RPC retains full clinic review access including private contact fields');
SELECT extensions.throws_ok(
  $$ UPDATE public.clinics SET is_published = true WHERE id = '00000000-0000-0000-0000-000000005fc3' $$,
  '42501', NULL, 'platform admin cannot bypass state-transition RPC with direct UPDATE');
SELECT extensions.lives_ok(
  $$ SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc3', 'verified', true, 'not_granted', false) $$,
  'platform admin can publish a verified clinic through the controlled RPC');
RESET role;
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs WHERE target_id = '00000000-0000-0000-0000-000000005fc3'
  AND action_type = 'clinic_publication_state_changed'), 1, 'controlled transition creates an audit record');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f09", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc3', 'pending', true, 'not_granted', false) $$,
  '23514', NULL, 'RPC rejects publication while verification is pending');
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc3', 'verified', false, 'not_granted', false);
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f03", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc2'),
  1, 'clinic administrator can read their own unpublished clinic');
SELECT extensions.is((SELECT count(id)::int FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc3'),
  0, 'clinic administrator cannot use platform-admin visibility for another clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors WHERE clinic_id = '00000000-0000-0000-0000-000000005fc3'),
  0, 'clinic administrator cannot inspect another clinic relationships');
SELECT extensions.is((SELECT count(*)::int FROM public.get_my_clinic_contacts()
  WHERE clinic_id = '00000000-0000-0000-0000-000000005fc5' AND phone = '000' AND email = 'contactable@test.com'),
  1, 'authorized clinic member can retrieve contact details for their own clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.get_my_clinic_contacts()
  WHERE clinic_id = '00000000-0000-0000-0000-000000005fc3'),
  0, 'authorized clinic member cannot retrieve another clinic contact details');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd1' AND clinic_id = '00000000-0000-0000-0000-000000005fc5'),
  1, 'authorized clinic member retains schedule access for their clinic');
SELECT extensions.throws_ok(
  $$ UPDATE public.clinics SET is_published = true, patient_contact_permission = 'granted' WHERE id = '00000000-0000-0000-0000-000000005fc2' $$,
  '42501', NULL, 'clinic administrator reaches the legacy update policy but trigger denies protected state');
SELECT extensions.is((WITH u AS (UPDATE public.clinics SET name = 'Updated authorized clinic profile'
  WHERE id = '00000000-0000-0000-0000-000000005fc5' RETURNING 1) SELECT count(*)::int FROM u),
  1, 'permitted non-sensitive clinic profile update still works');
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f01", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((WITH u AS (UPDATE public.clinics SET is_published = true WHERE id = '00000000-0000-0000-0000-000000005fc2' RETURNING 1)
  SELECT count(*)::int FROM u), 0, 'patient has no clinic update path');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f05", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.clinic_doctors WHERE doctor_id = '00000000-0000-0000-0000-000000005fd2'),
  2, 'doctor can inspect only their own unpublished and inactive clinic links');
SELECT extensions.is((WITH u AS (UPDATE public.clinics SET booking_enabled = true WHERE id = '00000000-0000-0000-0000-000000005fc2' RETURNING 1)
  SELECT count(*)::int FROM u), 0, 'doctor has no clinic update path');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_schedules
  WHERE doctor_id = '00000000-0000-0000-0000-000000005fd2' AND clinic_id = '00000000-0000-0000-0000-000000005fc3'),
  1, 'authorized doctor retains own schedule access at an unpublished clinic');
RESET role;
INSERT INTO public.candidate_facilities (id, research_id, name, facility_type, locality, source_confidence, researched_on)
VALUES ('00000000-0000-0000-0000-000000005f71', 'CLINIC-999', 'Research candidate only', 'clinic', 'Chennai', 'high', CURRENT_DATE);
-- An already-authorized conversation remains readable after contact permission is revoked.
INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES
('00000000-0000-0000-0000-000000005f12', '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd1', 'general');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f01", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ SELECT phone FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc5' $$,
  '42501', NULL, 'patient cannot directly select clinic phone even for a contactable clinic');
SELECT extensions.is((SELECT count(*)::int FROM public.admin_list_clinics()),
  0, 'patient cannot use the platform-admin clinic review RPC');
SELECT extensions.is((SELECT count(*)::int FROM public.get_my_clinic_contacts()),
  0, 'patient without a clinic membership receives no private clinic contact details');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc1', 'general') $$,
  '42501', NULL, 'sample/demo clinic cannot receive new patient conversations');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc2', 'general') $$,
  '42501', NULL, 'pending/unverified clinic cannot receive new patient conversations');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc3', 'general') $$,
  '42501', NULL, 'verified but unpublished clinic cannot receive new patient conversations');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc4', 'general') $$,
  '42501', NULL, 'published clinic without contact permission cannot receive new patient conversations');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd3', 'general') $$,
  '42501', NULL, 'unverified doctor cannot be contacted even when clinic contact is enabled');
SELECT extensions.lives_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd1', 'general') $$,
  'published and contact-permitted real provider accepts a patient conversation');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005f71', 'general') $$,
  '42501', NULL, 'research candidate facility id is not a contactable provider');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fff', 'general') $$,
  '42501', NULL, 'forged/nonexistent clinic id is denied');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES ('00000000-0000-0000-0000-000000005f12', '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd1', 'general') $$,
  '42501', NULL, 'patient cannot create a conversation for another patient');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f03", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ UPDATE public.clinics SET patient_contact_permission = 'revoked' WHERE id = '00000000-0000-0000-0000-000000005fc5' $$,
  '42501', NULL, 'active clinic administrator passes the update policy but trigger denies protected state');
SELECT extensions.throws_ok(
  $$ UPDATE public.clinics SET booking_enabled = true WHERE id = '00000000-0000-0000-0000-000000005fc5' $$,
  '42501', NULL, 'active clinic administrator cannot directly enable booking');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f01", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.results_eq(
  $$ WITH u AS (UPDATE public.clinics SET is_published = true, patient_contact_permission = 'granted' WHERE id = '00000000-0000-0000-0000-000000005fc2' RETURNING 1) SELECT count(*)::int FROM u $$,
  $$ VALUES (0) $$, 'patient cannot self-enable publication or contact permission');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f04", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc2', 'verified', true, 'granted', false) $$,
  '42501', NULL, 'inactive/pending clinic membership cannot enable contact permission');
RESET role;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f01", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc6', '00000000-0000-0000-0000-000000005fd2', 'general') $$,
  '42501', NULL, 'inactive provider relationship cannot receive contact');
SELECT extensions.throws_ok(
  $$ INSERT INTO public.conversations (patient_id, clinic_id, doctor_id, kind) VALUES ('00000000-0000-0000-0000-000000005f11', '00000000-0000-0000-0000-000000005fc5', '00000000-0000-0000-0000-000000005fd2', 'general') $$,
  '42501', NULL, 'doctor participation at another clinic cannot authorize cross-clinic contact');
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f09", "role": "authenticated"}';
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc5', 'verified', true, 'revoked', false);
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f02", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
  (SELECT count(*)::int FROM public.conversations WHERE clinic_id = '00000000-0000-0000-0000-000000005fc5'),
  1, 'patient can still read an existing authorized conversation after contact permission is revoked');
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000005f09", "role": "authenticated"}';
SELECT public.admin_set_clinic_publication_state('00000000-0000-0000-0000-000000005fc5', 'verified', true, 'granted', false);
DELETE FROM public.users WHERE id = '00000000-0000-0000-0000-000000005f09';
SELECT extensions.is(
  (SELECT patient_contact_permission = 'granted'
       AND patient_contact_permission_by = '00000000-0000-0000-0000-000000005f09'
   FROM public.clinics WHERE id = '00000000-0000-0000-0000-000000005fc5'),
  true, 'deleting the granting account preserves the historical actor UUID and granted state');

SELECT * FROM extensions.finish();
ROLLBACK;
