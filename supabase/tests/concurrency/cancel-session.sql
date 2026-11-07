\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object('sub', :'patient_user_id', 'role', 'authenticated')::text,
  false
);
SELECT pg_catalog.set_config('careconnect.booking_race_run_id', :'run_id', false);
INSERT INTO public.__careconnect_booking_race_barrier (run_id, session_id)
VALUES (:'run_id'::uuid, :'session_id');
DO $barrier$
DECLARE attempt integer;
BEGIN
  FOR attempt IN 1..400 LOOP
    IF (SELECT count(*) FROM public.__careconnect_booking_race_barrier
        WHERE run_id = pg_catalog.current_setting('careconnect.booking_race_run_id')::uuid) = 2 THEN RETURN; END IF;
    PERFORM pg_catalog.pg_sleep(0.025);
  END LOOP;
  RAISE EXCEPTION 'The cancellation and booking sessions did not reach the barrier.';
END;
$barrier$;
UPDATE public.appointments
SET status = 'cancelled'
WHERE patient_id = 'f7600000-0000-4000-8000-000000000003'
  AND date = :'booking_date'::date AND time = '09:30' AND status = 'confirmed';
