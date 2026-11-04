\set ON_ERROR_STOP on
BEGIN;

-- psql expands variables in this statement (but not in dollar-quoted PL/pgSQL).
-- Snapshot precisely one run marker before any fixture deletion.
CREATE TEMP TABLE runner_owned ON COMMIT DROP AS
SELECT r.owner_token, r.run_label, r.user_ids,
       r.clinic_ids || COALESCE((
         SELECT array_agg(p.clinic_id) FROM public.provider_applications p
         WHERE p.applicant_id = ANY(r.user_ids) AND p.clinic_id IS NOT NULL
       ), ARRAY[]::uuid[]) AS clinic_ids,
       r.doctor_ids || COALESCE((
         SELECT array_agg(d.doctor_id) FROM public.doctor_applications d
         WHERE d.applicant_id = ANY(r.user_ids) AND d.doctor_id IS NOT NULL
       ), ARRAY[]::uuid[]) AS doctor_ids
FROM careconnect_ci.real_service_runs r
WHERE r.owner_token = :'owner_token'::uuid
  AND r.run_label = :'run_label';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_temp.runner_owned) <> 1 THEN
    RAISE EXCEPTION 'runner ownership marker did not match exactly one row';
  END IF;
END;
$$;

DELETE FROM public.conversations c
USING pg_temp.runner_owned o
WHERE c.clinic_id = ANY(o.clinic_ids)
   OR c.patient_id IN (SELECT p.id FROM public.patients p WHERE p.user_id = ANY(o.user_ids));

DELETE FROM public.appointments a
USING pg_temp.runner_owned o
WHERE a.clinic_id = ANY(o.clinic_ids)
   OR a.doctor_id = ANY(o.doctor_ids)
   OR a.patient_id IN (SELECT p.id FROM public.patients p WHERE p.user_id = ANY(o.user_ids));

DELETE FROM public.audit_logs a
USING pg_temp.runner_owned o
WHERE a.actor_id = ANY(o.user_ids)
   OR a.target_id = ANY(o.clinic_ids)
   OR a.target_id = ANY(o.doctor_ids);

DELETE FROM public.notifications n
USING pg_temp.runner_owned o
WHERE n.user_id = ANY(o.user_ids);

DELETE FROM public.provider_applications p
USING pg_temp.runner_owned o
WHERE p.applicant_id = ANY(o.user_ids);

DELETE FROM public.doctor_applications d
USING pg_temp.runner_owned o
WHERE d.applicant_id = ANY(o.user_ids);

DELETE FROM public.doctor_schedules s
USING pg_temp.runner_owned o
WHERE s.clinic_id = ANY(o.clinic_ids) OR s.doctor_id = ANY(o.doctor_ids);

DELETE FROM public.clinic_doctors cd
USING pg_temp.runner_owned o
WHERE cd.clinic_id = ANY(o.clinic_ids) OR cd.doctor_id = ANY(o.doctor_ids);

DELETE FROM public.clinic_memberships cm
USING pg_temp.runner_owned o
WHERE cm.user_id = ANY(o.user_ids) OR cm.clinic_id = ANY(o.clinic_ids);

DELETE FROM public.user_roles ur
USING pg_temp.runner_owned o
WHERE ur.user_id = ANY(o.user_ids);

DELETE FROM public.doctors d
USING pg_temp.runner_owned o
WHERE d.id = ANY(o.doctor_ids);

DELETE FROM public.clinics c
USING pg_temp.runner_owned o
WHERE c.id = ANY(o.clinic_ids);

DO $$
DECLARE
  run record;
BEGIN
  SELECT * INTO STRICT run FROM pg_temp.runner_owned;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE clinic_id = ANY(run.clinic_ids) OR doctor_id = ANY(run.doctor_ids)
             OR patient_id IN (SELECT id FROM public.patients WHERE user_id = ANY(run.user_ids)))
     OR EXISTS (SELECT 1 FROM public.conversations WHERE clinic_id = ANY(run.clinic_ids)
                OR patient_id IN (SELECT id FROM public.patients WHERE user_id = ANY(run.user_ids)))
     OR EXISTS (SELECT 1 FROM public.doctor_schedules WHERE clinic_id = ANY(run.clinic_ids) OR doctor_id = ANY(run.doctor_ids))
     OR EXISTS (SELECT 1 FROM public.clinic_doctors WHERE clinic_id = ANY(run.clinic_ids) OR doctor_id = ANY(run.doctor_ids))
     OR EXISTS (SELECT 1 FROM public.clinic_memberships WHERE clinic_id = ANY(run.clinic_ids) OR user_id = ANY(run.user_ids))
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = ANY(run.user_ids))
     OR EXISTS (SELECT 1 FROM public.doctors WHERE id = ANY(run.doctor_ids))
     OR EXISTS (SELECT 1 FROM public.clinics WHERE id = ANY(run.clinic_ids)) THEN
    RAISE EXCEPTION 'owned application fixture cleanup did not reach zero';
  END IF;
END;
$$;

DELETE FROM careconnect_ci.real_service_runs r
USING pg_temp.runner_owned o
WHERE r.owner_token = o.owner_token AND r.run_label = o.run_label;

COMMIT;
