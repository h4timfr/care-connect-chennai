\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA IF NOT EXISTS careconnect_ci;
CREATE TABLE IF NOT EXISTS careconnect_ci.real_service_runs (
  owner_token uuid PRIMARY KEY,
  run_label text NOT NULL UNIQUE CHECK (run_label ~ '^careconnect-real-service-[a-z0-9-]+$'),
  user_ids uuid[] NOT NULL,
  clinic_ids uuid[] NOT NULL,
  doctor_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO careconnect_ci.real_service_runs
  (owner_token, run_label, user_ids, clinic_ids, doctor_ids)
VALUES
  (:'owner_token'::uuid, :'run_label',
   ARRAY[:'patient_id'::uuid, :'other_patient_id'::uuid, :'doctor_user_id'::uuid,
         :'clinic_staff_id'::uuid, :'clinic_admin_id'::uuid, :'platform_admin_id'::uuid,
         :'clinic_applicant_id'::uuid, :'doctor_applicant_id'::uuid, :'unauthorized_id'::uuid],
   ARRAY[:'clinic_id'::uuid], ARRAY[:'doctor_id'::uuid]);

INSERT INTO public.clinics (
  id, name, address, area, phone, email, about, specialty_ids,
  services, facilities, languages, fee_range, is_demo
) VALUES (
  :'clinic_id'::uuid, :'clinic_name', 'Synthetic integration fixture address',
  'Integration Test', '+91 9000000000', :'clinic_email',
  'Synthetic CI fixture; not a real provider.', ARRAY['general']::text[],
  ARRAY['Integration verification']::text[], ARRAY['Test fixture']::text[],
  ARRAY['English']::text[], ARRAY[100, 100]::numeric[], false
);

INSERT INTO public.doctors (
  id, user_id, name, gender, experience_years, consultation_fee, about,
  specialty_id, qualifications, languages, services, is_demo
) VALUES (
  :'doctor_id'::uuid, :'doctor_user_id'::uuid,
  'Synthetic CI Doctor', 'other', 1, 100,
  'Synthetic integration fixture; not a real provider.', 'general',
  ARRAY['Synthetic test only']::text[], ARRAY['English']::text[],
  ARRAY['Integration verification']::text[], false
);

INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
VALUES (:'clinic_id'::uuid, :'doctor_id'::uuid, true, 'verified');

INSERT INTO public.doctor_schedules (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_minutes)
SELECT :'doctor_id'::uuid, :'clinic_id'::uuid, day, '08:00', '20:00', 30
FROM generate_series(0, 6) AS day;

INSERT INTO public.clinic_memberships (user_id, clinic_id, role, active)
VALUES
  (:'clinic_staff_id'::uuid, :'clinic_id'::uuid, 'clinic_staff', true),
  (:'clinic_admin_id'::uuid, :'clinic_id'::uuid, 'clinic_admin', true);

INSERT INTO public.user_roles (user_id, role)
VALUES (:'platform_admin_id'::uuid, 'platform_admin');

UPDATE public.patients SET full_name = 'Synthetic CI Patient'
WHERE user_id = :'patient_id'::uuid;
UPDATE public.patients SET full_name = 'Synthetic CI Other Patient'
WHERE user_id = :'other_patient_id'::uuid;

COMMIT;
