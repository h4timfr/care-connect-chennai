\set ON_ERROR_STOP on
UPDATE public.doctor_schedules
SET end_time = '13:45'
WHERE doctor_id = 'f7600000-0000-4000-8000-000000000005'
  AND clinic_id = 'f7600000-0000-4000-8000-000000000004'
  AND day_of_week = EXTRACT(DOW FROM :'booking_date'::date)::integer;
