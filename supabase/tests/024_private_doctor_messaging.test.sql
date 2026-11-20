BEGIN;
SELECT extensions.plan(33);

-- Booked patient, assigned doctor, unrelated patient, unrelated doctor, and Terra staff.
INSERT INTO auth.users (id, email, created_at, updated_at)
SELECT ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'private-message-test-' || i || '@example.invalid', now(), now()
FROM generate_series(6501, 6507) AS i;
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-4000-8000-000000006506', 'platform_admin');
UPDATE public.users SET phone = '0000006501' WHERE id = '00000000-0000-4000-8000-000000006501';
INSERT INTO public.clinics (id, name, address, phone, email, is_demo)
VALUES ('00000000-0000-4000-8000-000000006511', 'Test Clinic', 'Test Road', '000000', 'clinic@example.invalid', false);
INSERT INTO public.doctors (id, user_id, name, consultation_fee, is_demo) VALUES
('00000000-0000-4000-8000-000000006521', '00000000-0000-4000-8000-000000006502', 'Assigned Doctor', 500, false),
('00000000-0000-4000-8000-000000006522', '00000000-0000-4000-8000-000000006504', 'Other Doctor', 500, false);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006506","role":"authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state) VALUES
('00000000-0000-4000-8000-000000006511', '00000000-0000-4000-8000-000000006521', true, 'verified'),
('00000000-0000-4000-8000-000000006511', '00000000-0000-4000-8000-000000006522', true, 'verified');
RESET request.jwt.claims;
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-4000-8000-000000006511', '00000000-0000-4000-8000-000000006505', 'clinic_admin'),
('00000000-0000-4000-8000-000000006511', '00000000-0000-4000-8000-000000006507', 'clinic_staff');
INSERT INTO public.appointments (id, patient_id, doctor_id, clinic_id, date, time, status)
SELECT '00000000-0000-4000-8000-000000006531', id,
       '00000000-0000-4000-8000-000000006521', '00000000-0000-4000-8000-000000006511',
       (now() AT TIME ZONE 'Asia/Kolkata')::date + 1, '11:00', 'confirmed'
FROM public.patients WHERE user_id = '00000000-0000-4000-8000-000000006501';
INSERT INTO public.conversations (id, patient_id, doctor_id, clinic_id, kind, appointment_id)
SELECT '00000000-0000-4000-8000-000000006541', patient_id, doctor_id, clinic_id, 'appointment', id
FROM public.appointments WHERE id = '00000000-0000-4000-8000-000000006531';

SELECT extensions.ok(NOT has_function_privilege('anon', 'public.doctor_message_inbox(boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.send_doctor_message(uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.open_doctor_message_thread(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.can_message_assigned_doctor(uuid)', 'EXECUTE'),
  'all private messaging endpoints exclude anonymous callers');
SELECT extensions.ok(NOT has_table_privilege('authenticated', 'private.doctor_messages', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'private.doctor_message_threads', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'private.doctor_message_appointments', 'SELECT'),
  'clients have no direct access to private data or eligibility view');
SELECT extensions.is((SELECT count(*)::int FROM pg_publication_tables WHERE schemaname = 'private'
  AND tablename IN ('doctor_messages', 'doctor_message_threads')), 0, 'private data is not published');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006501","role":"authenticated"}';
SELECT extensions.ok(public.can_message_assigned_doctor('00000000-0000-4000-8000-000000006531'), 'booked patient is eligible');
SELECT extensions.is(public.open_doctor_message_thread('00000000-0000-4000-8000-000000006531'),
  '00000000-0000-4000-8000-000000006531'::uuid, 'opens a separate thread for this appointment');
SELECT extensions.is(public.open_doctor_message_thread('00000000-0000-4000-8000-000000006531'),
  '00000000-0000-4000-8000-000000006531'::uuid, 'another open reuses the same identifier');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)), 1, 'patient has one private thread');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'patient cannot use the doctor-side scope');
SELECT extensions.lives_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006551', 'Patient test message') $$, 'patient sends a private message');
SELECT extensions.lives_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006551', 'Patient test message') $$, 'same request can be safely retried');
SELECT extensions.throws_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006552', E'\n\t') $$, '23514', NULL, 'whitespace messages are rejected');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006502","role":"authenticated"}';
SELECT extensions.is((SELECT messages->0->>'sender' FROM public.doctor_message_inbox(true)),
  'patient', 'assigned doctor can see the patient message with its actual sender');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)), 0, 'doctor cannot use the patient-side scope');
SELECT extensions.is((SELECT count(*)::int FROM public.users WHERE id = '00000000-0000-4000-8000-000000006501'
  AND phone IS NOT NULL AND email IS NOT NULL), 0, 'assigned doctor cannot read the booked patient contact row');
SELECT extensions.ok((SELECT NOT (to_jsonb(i) ?| ARRAY['phone','email','patient_phone','patient_email'])
  FROM public.doctor_message_inbox(true) i), 'private inbox does not project contact fields');
SELECT extensions.lives_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006552', 'Doctor test reply') $$, 'assigned doctor can reply');
SELECT extensions.throws_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006551', 'Patient test message') $$, '23505', NULL, 'doctor cannot claim a patient message ID');
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_conversations()), 1, 'legacy doctor inbox still lists only its clinic thread');
SELECT extensions.is((SELECT jsonb_array_length(messages) FROM public.doctor_conversations()), 0, 'legacy RPC cannot surface private messages');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006501","role":"authenticated"}';
SELECT extensions.is((SELECT jsonb_array_length(messages) FROM public.doctor_message_inbox(false)), 2, 'both messages persist and retry did not duplicate');
SELECT extensions.is((SELECT messages->1->>'sender' FROM public.doctor_message_inbox(false)), 'doctor', 'patient sees the doctor sender');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006503","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)), 0, 'unrelated patient cannot list the thread');
SELECT extensions.throws_ok($$ SELECT public.open_doctor_message_thread('00000000-0000-4000-8000-000000006531') $$,
  '42501', NULL, 'unrelated patient cannot open the thread by appointment ID');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006504","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'other verified doctor at the same clinic cannot read the thread');
SELECT extensions.throws_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006553', 'Other doctor') $$, '42501', NULL, 'other doctor cannot reply');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006505","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)) +
  (SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'clinic admin cannot read either private inbox');
SELECT extensions.throws_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006553', 'Clinic admin') $$, '42501', NULL, 'clinic admin cannot reply privately');
SELECT extensions.is((SELECT count(*)::int FROM public.conversations WHERE id = '00000000-0000-4000-8000-000000006541'),
  1, 'clinic retains its ordinary appointment conversation');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006507","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)) +
  (SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'clinic staff cannot read either private inbox');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006506","role":"authenticated"}';
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(false)) +
  (SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'platform admin role does not grant private inbox access');

RESET ROLE;
UPDATE public.appointments SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000006531';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006502","role":"authenticated"}';
SELECT extensions.is((SELECT can_send FROM public.doctor_message_inbox(true)), false, 'cancelled thread remains readable but closed');
SELECT extensions.throws_ok($$ SELECT public.send_doctor_message('00000000-0000-4000-8000-000000006531',
  '00000000-0000-4000-8000-000000006553', 'After cancellation') $$, '42501', NULL, 'cancelled thread rejects new writes');
RESET ROLE;
UPDATE public.clinic_doctors SET active = false WHERE doctor_id = '00000000-0000-4000-8000-000000006521';
SET LOCAL ROLE authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.doctor_message_inbox(true)), 0, 'revoked clinic link removes private inbox access');

SELECT * FROM extensions.finish();
ROLLBACK;
