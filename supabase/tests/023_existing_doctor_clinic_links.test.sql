BEGIN;
SELECT extensions.plan(38);

INSERT INTO auth.users (id, email, created_at, updated_at)
SELECT ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'clinic-link-test-' || i || '@example.invalid', now(), now()
FROM generate_series(6301, 6306) AS i;
-- 6301 clinic admin, 6302 staff, 6303 target doctor, 6304 unrelated doctor,
-- 6305 platform admin, 6306 patient.
INSERT INTO public.user_roles (user_id, role) VALUES
('00000000-0000-4000-8000-000000006305', 'platform_admin');
INSERT INTO public.clinics (id, name, address, phone, email, is_demo) VALUES
('00000000-0000-4000-8000-000000006311', 'Requesting test clinic', 'Test Road', '000000', 'one@example.invalid', false),
('00000000-0000-4000-8000-000000006312', 'Other test clinic', 'Test Road', '000000', 'two@example.invalid', false);
INSERT INTO public.doctors (id, user_id, name, consultation_fee, is_demo) VALUES
('00000000-0000-4000-8000-000000006321', '00000000-0000-4000-8000-000000006303', 'Test Existing Doctor', 500, false),
('00000000-0000-4000-8000-000000006322', '00000000-0000-4000-8000-000000006304', 'Test Other Doctor', 500, false),
('00000000-0000-4000-8000-000000006323', NULL, 'Test Unclaimed Doctor', 500, false);
INSERT INTO public.clinic_memberships (clinic_id, user_id, role) VALUES
('00000000-0000-4000-8000-000000006311', '00000000-0000-4000-8000-000000006301', 'clinic_admin'),
('00000000-0000-4000-8000-000000006311', '00000000-0000-4000-8000-000000006302', 'clinic_staff');
INSERT INTO public.appointments (id, patient_id, doctor_id, clinic_id, date, time)
SELECT '00000000-0000-4000-8000-000000006331', id,
       '00000000-0000-4000-8000-000000006321', '00000000-0000-4000-8000-000000006312',
       (now() AT TIME ZONE 'Asia/Kolkata')::date + 14, '11:00'
FROM public.patients WHERE user_id = '00000000-0000-4000-8000-000000006306';

SELECT extensions.ok(
    NOT has_function_privilege('anon', 'public.request_doctor_clinic_link(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.respond_doctor_clinic_link(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.list_doctor_clinic_link_requests(uuid)', 'EXECUTE')
    AND NOT has_table_privilege('authenticated', 'private.doctor_clinic_link_requests', 'SELECT,INSERT,UPDATE,DELETE'),
    'anonymous RPC access and direct request-table access remain denied'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006302","role":"authenticated"}';
SELECT extensions.throws_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321') $$,
    '42501', NULL, 'clinic staff cannot initiate a request'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.throws_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006312','00000000-0000-4000-8000-000000006321') $$,
    '42501', NULL, 'a clinic admin cannot act for another clinic'
);
SELECT extensions.throws_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006323') $$,
    '22023', NULL, 'an unclaimed profile cannot receive a request'
);
SELECT extensions.lives_ok(
    $$ SELECT set_config('cc.link_request', public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321')::text, true) $$,
    'an active clinic administrator can request the existing profile'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM public.clinic_doctors WHERE doctor_id = '00000000-0000-4000-8000-000000006321'),
    0, 'a request alone creates no relationship'
);
SELECT extensions.ok(
    (SELECT status = 'requested' AND doctor_name IS NULL FROM public.list_doctor_clinic_link_requests('00000000-0000-4000-8000-000000006311')),
    'clinic can track its request without gaining access to the doctor name'
);
SELECT extensions.throws_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321') $$,
    '23505', NULL, 'duplicate open requests are denied'
);
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'accept') $$,
    '42501', NULL, 'requesting clinic administrator cannot supply doctor consent'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006304","role":"authenticated"}';
SELECT extensions.is(
    (SELECT count(*)::int FROM public.list_doctor_clinic_link_requests()),
    0, 'another doctor cannot see the request'
);
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'accept') $$,
    '42501', NULL, 'another doctor cannot respond even with the request ID'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006302","role":"authenticated"}';
SELECT extensions.is(
    (SELECT count(*)::int FROM public.list_doctor_clinic_link_requests('00000000-0000-4000-8000-000000006311')),
    0, 'clinic staff cannot read the administrator request queue'
);
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'withdraw') $$,
    '42501', NULL, 'clinic staff cannot withdraw an administrator request'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006303","role":"authenticated"}';
SELECT extensions.is(
    (SELECT clinic_name FROM public.list_doctor_clinic_link_requests()),
    'Requesting test clinic', 'doctor can see the requesting clinic'
);

RESET ROLE;
UPDATE public.clinic_memberships SET active = false
WHERE user_id = '00000000-0000-4000-8000-000000006301';
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'accept') $$,
    '42501', NULL, 'acceptance rechecks the requesting administrator membership'
);
RESET ROLE;
UPDATE public.clinic_memberships SET active = true
WHERE user_id = '00000000-0000-4000-8000-000000006301';
SET LOCAL ROLE authenticated;
SELECT extensions.lives_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'decline') $$,
    'the target doctor can decline'
);
SELECT extensions.is(
    (SELECT status FROM public.list_doctor_clinic_link_requests()),
    'declined', 'declined status is visible to the doctor'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.lives_ok(
    $$ SELECT set_config('cc.link_request', public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321')::text, true) $$,
    'a new request after decline gets a new consent decision'
);
SELECT extensions.lives_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'withdraw') $$,
    'an active clinic admin can withdraw an open request'
);
SELECT extensions.lives_ok(
    $$ SELECT set_config('cc.link_request', public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321')::text, true) $$,
    'a withdrawn request does not block a new one'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006303","role":"authenticated"}';
SELECT extensions.lives_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'accept') $$,
    'the linked doctor can consent'
);
SELECT extensions.is(
    (SELECT verification_state FROM public.clinic_doctors WHERE doctor_id = '00000000-0000-4000-8000-000000006321'),
    'pending', 'acceptance adds only a pending relationship'
);
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.link_request')::uuid,'accept') $$,
    '55000', NULL, 'an already accepted request cannot be replayed'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time)
       VALUES ('00000000-0000-4000-8000-000000006321','00000000-0000-4000-8000-000000006311',1,'10:00','10:30') $$,
    '42501', NULL, 'an accepted link still cannot be scheduled before verification'
);
SET LOCAL ROLE anon;
SELECT extensions.is(
    (SELECT count(*)::int FROM public.doctors WHERE id = '00000000-0000-4000-8000-000000006321'),
    0, 'the pending relationship does not make the doctor public'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.throws_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006321') $$,
    '23505', NULL, 'a relationship already in review cannot be replaced'
);
SELECT extensions.results_eq(
    $$ WITH changed AS (UPDATE public.clinic_doctors SET verification_state = 'verified'
       WHERE doctor_id = '00000000-0000-4000-8000-000000006321' RETURNING doctor_id)
       SELECT count(*)::int FROM changed $$,
    $$ VALUES (0) $$, 'a clinic admin cannot verify the relationship'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006305","role":"authenticated"}';
SELECT extensions.results_eq(
    $$ WITH changed AS (UPDATE public.clinic_doctors SET verification_state = 'verified'
       WHERE clinic_id = '00000000-0000-4000-8000-000000006311'
         AND doctor_id = '00000000-0000-4000-8000-000000006321' RETURNING doctor_id)
       SELECT count(*)::int FROM changed $$,
    $$ VALUES (1) $$, 'the existing platform administrator review can verify the accepted relationship'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.ok(
    (SELECT status = 'verified' AND doctor_name = 'Test Existing Doctor'
     FROM public.list_doctor_clinic_link_requests('00000000-0000-4000-8000-000000006311')),
    'clinic tracking reflects live verification and exposes the now-linked doctor name'
);
SELECT extensions.lives_ok(
    $$ INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time)
       VALUES ('00000000-0000-4000-8000-000000006321','00000000-0000-4000-8000-000000006311',
       extract(dow FROM (now() AT TIME ZONE 'Asia/Kolkata')::date + 2)::int,'10:00','10:30') $$,
    'a verified relationship can be scheduled under existing RLS'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006306","role":"authenticated"}';
SELECT extensions.throws_ok(
    $$ SELECT public.book_appointment('00000000-0000-4000-8000-000000006321','00000000-0000-4000-8000-000000006311',
       (now() AT TIME ZONE 'Asia/Kolkata')::date + 2,'10:00', 'Test only') $$,
    'P0001', NULL, 'verification and scheduling alone do not bypass publication or booking gates'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006305","role":"authenticated"}';
SELECT public.admin_set_clinic_publication_state('00000000-0000-4000-8000-000000006311','verified',true,'not_granted',true);
SET LOCAL ROLE anon;
SELECT extensions.is(
    (SELECT count(*)::int FROM public.get_doctor_slots('00000000-0000-4000-8000-000000006321',
       '00000000-0000-4000-8000-000000006311',(now() AT TIME ZONE 'Asia/Kolkata')::date + 2) WHERE available),
    1, 'the real slot RPC exposes the scheduled slot after publication'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006306","role":"authenticated"}';
SELECT extensions.is(
    (public.book_appointment('00000000-0000-4000-8000-000000006321','00000000-0000-4000-8000-000000006311',
       (now() AT TIME ZONE 'Asia/Kolkata')::date + 2,'10:00','Test only')).status::text,
    'pending', 'patient can book once the normal publication controls are satisfied'
);
RESET ROLE;
SELECT extensions.ok(
    (SELECT user_id = '00000000-0000-4000-8000-000000006303' FROM public.doctors
     WHERE id = '00000000-0000-4000-8000-000000006321')
    AND (SELECT doctor_id = '00000000-0000-4000-8000-000000006321'
         AND clinic_id = '00000000-0000-4000-8000-000000006312' FROM public.appointments
         WHERE id = '00000000-0000-4000-8000-000000006331'),
    'doctor identity and prior appointment stay intact'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.lives_ok(
    $$ SELECT set_config('cc.former_request', public.request_doctor_clinic_link(
       '00000000-0000-4000-8000-000000006311','00000000-0000-4000-8000-000000006322')::text, true) $$,
    'a different doctor can receive an independent request'
);
RESET ROLE;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006305","role":"authenticated"}';
UPDATE public.doctors SET user_id = '00000000-0000-4000-8000-000000006306'
WHERE id = '00000000-0000-4000-8000-000000006322';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006304","role":"authenticated"}';
SELECT extensions.throws_ok(
    $$ SELECT public.respond_doctor_clinic_link(current_setting('cc.former_request')::uuid, 'accept') $$,
    '42501', NULL, 'the former doctor account cannot consent to the stale request'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006301","role":"authenticated"}';
SELECT extensions.lives_ok(
    $$ SELECT public.request_doctor_clinic_link('00000000-0000-4000-8000-000000006311',
       '00000000-0000-4000-8000-000000006322') $$,
    'a stale request does not block a new request for the current doctor account'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000006306","role":"authenticated"}';
SELECT extensions.is(
    (SELECT count(*)::int FROM public.list_doctor_clinic_link_requests() WHERE status = 'requested'),
    1, 'the current doctor sees only the request made for their account'
);
RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
