\set ON_ERROR_STOP on
SELECT EXISTS (
  SELECT 1 FROM public.__careconnect_booking_race_run WHERE run_id = :'run_id'::uuid
) AS owns_fixture \gset
\if :owns_fixture
BEGIN;
DROP TRIGGER IF EXISTS z_careconnect_booking_race_delay ON public.appointments;
DROP TRIGGER IF EXISTS z_careconnect_booking_race_update_delay ON public.appointments;
DROP FUNCTION IF EXISTS public.__careconnect_booking_race_delay();
DROP FUNCTION IF EXISTS public.__careconnect_booking_race_update_delay();
DROP TABLE IF EXISTS public.__careconnect_booking_race_barrier;
DELETE FROM public.appointments
WHERE clinic_id = 'f7600000-0000-4000-8000-000000000004'
   OR patient_id IN ('f7600000-0000-4000-8000-000000000003',
                     'f7600000-0000-4000-8000-000000000007',
                     'f7600000-0000-4000-8000-000000000008');
DELETE FROM public.audit_logs
WHERE target_id = 'f7600000-0000-4000-8000-000000000004'
   OR (actor_id = 'f7600000-0000-4000-8000-000000000002'
       AND action_type = 'clinic_publication_state_changed')
   OR (actor_id IN ('f7600000-0000-4000-8000-000000000001',
                    'f7600000-0000-4000-8000-000000000009',
                    'f7600000-0000-4000-8000-00000000000a')
       AND action_type IN ('appointment_booked', 'appointment_status_changed'));
DROP TABLE public.__careconnect_booking_race_run;
DELETE FROM public.clinics WHERE id = 'f7600000-0000-4000-8000-000000000004';
DELETE FROM public.doctors WHERE id = 'f7600000-0000-4000-8000-000000000005';
DELETE FROM auth.users
WHERE id IN ('f7600000-0000-4000-8000-000000000001', 'f7600000-0000-4000-8000-000000000002',
             'f7600000-0000-4000-8000-000000000009', 'f7600000-0000-4000-8000-00000000000a');
COMMIT;
\echo Booking race fixtures cleaned for owned local run.
\else
\echo Booking race cleanup skipped because the fixture run id does not match.
\endif
