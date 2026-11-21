BEGIN;
SELECT extensions.plan(23);

-- Patient, unrelated patient, assigned clinic staff, other clinic staff, platform
-- admin, and doctor with a verified link to the open clinic only.
INSERT INTO auth.users (id, email, created_at, updated_at)
SELECT ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'historical-messaging-' || i || '@example.invalid', now(), now()
FROM generate_series(6601, 6606) AS i;
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-4000-8000-000000006605', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-4000-8000-000000006611', 'Historical Clinic', 'Synthetic Road', '000001', 'private@example.invalid', false),
('00000000-0000-4000-8000-000000006612', 'Sample Clinic', 'Synthetic Road', '000002', 'sample@example.invalid', true),
('00000000-0000-4000-8000-000000006613', 'Pending Clinic', 'Synthetic Road', '000003', 'pending@example.invalid', false),
('00000000-0000-4000-8000-000000006614', 'Closed Clinic', 'Synthetic Road', '000004', 'closed@example.invalid', false),
('00000000-0000-4000-8000-000000006615', 'Open Clinic', 'Synthetic Road', '000005', 'open@example.invalid', false);
INSERT INTO public.doctors (id, user_id, name, consultation_fee, is_demo)
VALUES ('00000000-0000-4000-8000-000000006621', '00000000-0000-4000-8000-000000006606', 'Synthetic Doctor', 500, false);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006605","role":"authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
SELECT id, '00000000-0000-4000-8000-000000006621', true, 'verified'
FROM public.clinics WHERE id IN ('00000000-0000-4000-8000-000000006614', '00000000-0000-4000-8000-000000006615');
SELECT public.admin_set_clinic_publication_state('00000000-0000-4000-8000-000000006611', 'verified', false, 'not_granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-4000-8000-000000006614', 'verified', true, 'not_granted', false);
SELECT public.admin_set_clinic_publication_state('00000000-0000-4000-8000-000000006615', 'verified', true, 'granted', false);
RESET request.jwt.claims;
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-4000-8000-000000006611', '00000000-0000-4000-8000-000000006603', 'clinic_staff'),
('00000000-0000-4000-8000-000000006615', '00000000-0000-4000-8000-000000006604', 'clinic_admin'),
('00000000-0000-4000-8000-000000006611', '00000000-0000-4000-8000-000000006601', 'clinic_staff');
INSERT INTO public.conversations (id, clinic_id, patient_id, kind)
SELECT ('00000000-0000-4000-8000-' || lpad((i + 20)::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, p.id, 'general'
FROM public.patients p CROSS JOIN generate_series(6611, 6615) AS i
WHERE p.user_id = '00000000-0000-4000-8000-000000006601';
INSERT INTO public.messages (conversation_id, sender_id, body)
VALUES ('00000000-0000-4000-8000-000000006631', '00000000-0000-4000-8000-000000006603', 'Historical synthetic reply');

SELECT extensions.ok(NOT has_function_privilege('anon', 'public.patient_conversation_clinics(uuid[])', 'EXECUTE'),
  'anonymous callers cannot execute the lookup');
SELECT extensions.ok(NOT has_table_privilege('authenticated', 'public.messages', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.messages', 'DELETE'), 'clients cannot rewrite or delete messages');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006601","role":"authenticated"}';
SELECT extensions.is((SELECT body FROM public.messages WHERE conversation_id = '00000000-0000-4000-8000-000000006631'),
  'Historical synthetic reply', 'the owner can read historical messages');
SELECT extensions.is((SELECT row_to_json(r)::jsonb FROM public.patient_conversation_clinics(
  ARRAY['00000000-0000-4000-8000-000000006631']::uuid[]) r),
  '{"conversation_id":"00000000-0000-4000-8000-000000006631","clinic_name":"Historical Clinic","clinic_state":"unavailable"}'::jsonb,
  'the lookup returns exactly the real name and unavailable status without private clinic fields');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006631','00000000-0000-4000-8000-000000006601','Blocked') $$,
  '42501', NULL, 'unpublished clinic cannot receive a patient message even from a dual-role account');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006632','00000000-0000-4000-8000-000000006601','Blocked') $$,
  '42501', NULL, 'demo clinic cannot receive a patient message');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006633','00000000-0000-4000-8000-000000006601','Blocked') $$,
  '42501', NULL, 'unverified clinic cannot receive a patient message');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006634','00000000-0000-4000-8000-000000006601','Blocked') $$,
  '42501', NULL, 'published clinic without contact permission cannot receive a patient message');
SELECT extensions.is((SELECT clinic_state FROM public.patient_conversation_clinics(
  ARRAY['00000000-0000-4000-8000-000000006634']::uuid[])), 'closed', 'public clinic without contact permission is closed');
SELECT extensions.lives_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006635','00000000-0000-4000-8000-000000006601','Allowed') $$,
  'verified published clinic with contact permission receives the patient message');
SELECT extensions.is((SELECT clinic_state FROM public.patient_conversation_clinics(
  ARRAY['00000000-0000-4000-8000-000000006635']::uuid[])), 'open', 'the lookup agrees with the successful write');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006631','00000000-0000-4000-8000-000000006603','Spoofed') $$,
  '42501', NULL, 'the thread owner cannot impersonate clinic staff');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006602","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.patient_conversation_clinics(
  ARRAY['00000000-0000-4000-8000-000000006631']::uuid[])), 0, 'another patient cannot resolve the historical clinic name');
SELECT extensions.is((SELECT count(*)::int FROM public.conversations WHERE id = '00000000-0000-4000-8000-000000006631'),
  0, 'another patient cannot read the historical conversation');
SELECT extensions.is((SELECT count(*)::int FROM public.messages WHERE conversation_id = '00000000-0000-4000-8000-000000006631'),
  0, 'another patient cannot read the historical messages');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006635','00000000-0000-4000-8000-000000006602','Wrong patient') $$,
  '42501', NULL, 'a contactable clinic is insufficient to send into another patient thread');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006603","role":"authenticated"}';
SELECT extensions.lives_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006631','00000000-0000-4000-8000-000000006603','Clinic can still reply') $$,
  'the clinic keeps its authorized reply path after unpublication');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006604","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.messages WHERE conversation_id = '00000000-0000-4000-8000-000000006631'),
  0, 'other clinic staff cannot read the historical messages');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006631','00000000-0000-4000-8000-000000006604','Wrong clinic') $$,
  '42501', NULL, 'other clinic staff cannot reply');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006606","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.messages WHERE conversation_id = '00000000-0000-4000-8000-000000006631'),
  0, 'a doctor without access cannot read the historical messages');
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006631','00000000-0000-4000-8000-000000006606','Wrong doctor') $$,
  '42501', NULL, 'a doctor without access cannot reply');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006605","role":"authenticated"}';
SELECT public.admin_set_clinic_publication_state('00000000-0000-4000-8000-000000006615', 'verified', true, 'revoked', false);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006601","role":"authenticated"}';
SELECT extensions.throws_ok($$ INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ('00000000-0000-4000-8000-000000006635','00000000-0000-4000-8000-000000006601','After revocation') $$,
  '42501', NULL, 'revocation closes an existing thread to new messages');
SELECT extensions.is((SELECT body FROM public.messages WHERE conversation_id = '00000000-0000-4000-8000-000000006635'),
  'Allowed', 'revocation preserves the previously delivered message');

SELECT * FROM extensions.finish();
ROLLBACK;
