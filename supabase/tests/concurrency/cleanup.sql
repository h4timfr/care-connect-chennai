\set ON_ERROR_STOP on
BEGIN;
DROP TRIGGER IF EXISTS z_careconnect_booking_race_delay ON public.appointments;
DROP FUNCTION IF EXISTS public.__careconnect_booking_race_delay();
DROP TABLE IF EXISTS public.__careconnect_booking_race_barrier;
DELETE FROM public.audit_logs
WHERE target_id = 'f7600000-0000-4000-8000-000000000004'
   OR (actor_id = 'f7600000-0000-4000-8000-000000000002'
       AND action_type = 'clinic_publication_state_changed')
   OR (actor_id = 'f7600000-0000-4000-8000-000000000001'
       AND action_type = 'appointment_booked'
       AND metadata ->> 'doctor_id' = 'f7600000-0000-4000-8000-000000000005');
DELETE FROM public.clinics WHERE id = 'f7600000-0000-4000-8000-000000000004';
DELETE FROM public.doctors WHERE id = 'f7600000-0000-4000-8000-000000000005';
DELETE FROM auth.users
WHERE id IN ('f7600000-0000-4000-8000-000000000001', 'f7600000-0000-4000-8000-000000000002');
COMMIT;
