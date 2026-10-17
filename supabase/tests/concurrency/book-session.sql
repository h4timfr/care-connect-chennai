\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000001","role":"authenticated"}';

INSERT INTO public.__careconnect_booking_race_barrier (run_id, session_id)
VALUES ('f7600000-0000-4000-8000-000000000006', :'session_id');

DO $barrier$
DECLARE
  attempt integer;
BEGIN
  FOR attempt IN 1..400 LOOP
    IF (SELECT count(*) FROM public.__careconnect_booking_race_barrier
        WHERE run_id = 'f7600000-0000-4000-8000-000000000006') = 2 THEN
      RETURN;
    END IF;
    PERFORM pg_catalog.pg_sleep(0.025);
  END LOOP;
  RAISE EXCEPTION 'The two independent booking sessions did not reach the barrier.';
END;
$barrier$;

SELECT public.book_appointment(
  'f7600000-0000-4000-8000-000000000005',
  'f7600000-0000-4000-8000-000000000004',
  :'booking_date'::date,
  :'slot_time'::time,
  'Disposable concurrent booking test'
);
