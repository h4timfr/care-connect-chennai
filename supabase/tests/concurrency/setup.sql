\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE public.__careconnect_booking_race_run (
  run_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
INSERT INTO public.__careconnect_booking_race_run (run_id) VALUES (:'run_id'::uuid);

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('f7600000-0000-4000-8000-000000000001', 'booking-race-patient@careconnect.invalid', now(), now()),
  ('f7600000-0000-4000-8000-000000000002', 'booking-race-admin@careconnect.invalid', now(), now()),
  ('f7600000-0000-4000-8000-000000000009', 'booking-race-patient-b@careconnect.invalid', now(), now()),
  ('f7600000-0000-4000-8000-00000000000a', 'booking-race-patient-c@careconnect.invalid', now(), now());

UPDATE public.patients
SET id = 'f7600000-0000-4000-8000-000000000003', full_name = 'Disposable Booking Race Patient'
WHERE user_id = 'f7600000-0000-4000-8000-000000000001';
UPDATE public.patients SET id = 'f7600000-0000-4000-8000-000000000007'
WHERE user_id = 'f7600000-0000-4000-8000-000000000009';
UPDATE public.patients SET id = 'f7600000-0000-4000-8000-000000000008'
WHERE user_id = 'f7600000-0000-4000-8000-00000000000a';

INSERT INTO public.user_roles (user_id, role)
VALUES ('f7600000-0000-4000-8000-000000000002', 'platform_admin');

INSERT INTO public.clinics (id, name, address, phone, email)
VALUES ('f7600000-0000-4000-8000-000000000004', 'Disposable Booking Race Clinic',
        'Local test fixture', '0000000001', 'booking-race-clinic@careconnect.invalid');

INSERT INTO public.doctors (id, name, consultation_fee)
VALUES ('f7600000-0000-4000-8000-000000000005', 'Disposable Booking Race Doctor', 500);

SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
VALUES ('f7600000-0000-4000-8000-000000000004', 'f7600000-0000-4000-8000-000000000005', true, 'verified');
RESET request.jwt.claims;

INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes)
SELECT 'f7600000-0000-4000-8000-000000000005', 'f7600000-0000-4000-8000-000000000004',
       dow, '09:00', '14:00', 30
FROM generate_series(0, 6) AS dow;

SET request.jwt.claims = '{"sub":"f7600000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT public.admin_set_clinic_publication_state(
  'f7600000-0000-4000-8000-000000000004', 'verified', true, 'not_granted', true
);
RESET request.jwt.claims;

INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, reason, fee)
SELECT 'f7600000-0000-4000-8000-000000000003',
       'f7600000-0000-4000-8000-000000000005',
       'f7600000-0000-4000-8000-000000000004',
       :'booking_date'::date,
       seeded.slot::time,
       'confirmed',
       'Disposable concurrency fixture',
       500
FROM (VALUES ('09:00'), ('09:30'), ('10:00'), ('10:30')) AS seeded(slot);

CREATE TABLE public.__careconnect_booking_race_barrier (
  run_id uuid NOT NULL,
  session_id text NOT NULL,
  PRIMARY KEY (run_id, session_id)
);
GRANT SELECT, INSERT ON public.__careconnect_booking_race_barrier TO authenticated;

CREATE FUNCTION public.__careconnect_booking_race_delay()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.patient_id IN (
    'f7600000-0000-4000-8000-000000000003'::uuid,
    'f7600000-0000-4000-8000-000000000007'::uuid,
    'f7600000-0000-4000-8000-000000000008'::uuid
  ) THEN
    PERFORM pg_catalog.pg_sleep(2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_careconnect_booking_race_delay
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.__careconnect_booking_race_delay();

CREATE FUNCTION public.__careconnect_booking_race_update_delay()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.patient_id = 'f7600000-0000-4000-8000-000000000003'::uuid
     AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_catalog.pg_sleep(1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_careconnect_booking_race_update_delay
BEFORE UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.__careconnect_booking_race_update_delay();

COMMIT;
