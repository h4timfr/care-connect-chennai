\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object('sub', :'patient_user_id', 'role', 'authenticated')::text,
  false
);
DO $isolation$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Concurrency runner requires READ COMMITTED isolation.';
  END IF;
END;
$isolation$;
SELECT public.book_appointment(
  :'doctor_id'::uuid, :'clinic_id'::uuid,
  :'booking_date'::date, :'slot_time'::time, :'reason'
);
