\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object('sub', :'patient_user_id', 'role', 'authenticated')::text,
  false
);
SELECT pg_catalog.set_config('careconnect.booking_race_run_id', :'run_id', false);

DO $isolation$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Concurrency runner requires READ COMMITTED isolation.';
  END IF;
END;
$isolation$;

INSERT INTO public.__careconnect_booking_race_barrier (run_id, session_id)
VALUES (:'run_id'::uuid, :'session_id');

DO $barrier$
DECLARE
  attempt integer;
BEGIN
  FOR attempt IN 1..400 LOOP
    IF (SELECT count(*) FROM public.__careconnect_booking_race_barrier
        WHERE run_id = pg_catalog.current_setting('careconnect.booking_race_run_id')::uuid) = 2 THEN
      RETURN;
    END IF;
    PERFORM pg_catalog.pg_sleep(0.025);
  END LOOP;
  RAISE EXCEPTION 'The two independent booking sessions did not reach the barrier.';
END;
$barrier$;

SELECT public.book_appointment(
  :'doctor_id'::uuid,
  :'clinic_id'::uuid,
  :'booking_date'::date,
  :'slot_time'::time,
  :'reason'
);
