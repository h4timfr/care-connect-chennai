-- Enforce the publication boundary for patient-facing reads and make reviewed state RPC-only.
-- Apply after 00057_provider_publication_contactability.sql.

-- A narrow SECURITY DEFINER predicate avoids RLS recursion between doctors and clinic_doctors.
-- It returns only whether this exact relationship is public; it exposes no provider data.
CREATE OR REPLACE FUNCTION private.is_public_provider_link(p_doctor_id uuid, p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.clinic_doctors cd
        JOIN public.clinics c ON c.id = cd.clinic_id
        JOIN public.doctors d ON d.id = cd.doctor_id
        WHERE cd.doctor_id = p_doctor_id
          AND cd.clinic_id = p_clinic_id
          AND cd.active
          AND cd.verification_state = 'verified'
          AND NOT c.is_demo
          AND c.clinic_verification_state = 'verified'
          AND c.is_published
          AND NOT d.is_demo
    );
$$;
ALTER FUNCTION private.is_public_provider_link(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_public_provider_link(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_public_provider_link(uuid, uuid) TO anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

-- Public clinic reads are limited to verified, published, non-sample clinics. Authorized clinic
-- members and platform admins retain their separate review/management visibility.
DROP POLICY IF EXISTS clinics_read_public ON public.clinics;
DROP POLICY IF EXISTS clinics_read_published ON public.clinics;
CREATE POLICY clinics_read_published ON public.clinics
FOR SELECT TO anon, authenticated
USING (
    NOT is_demo
    AND clinic_verification_state = 'verified'
    AND is_published
);

DROP POLICY IF EXISTS clinics_read_member ON public.clinics;
CREATE POLICY clinics_read_member ON public.clinics
FOR SELECT TO authenticated
USING (id IN (SELECT private.user_clinic_ids()));

DROP POLICY IF EXISTS clinics_read_platform_admin ON public.clinics;
CREATE POLICY clinics_read_platform_admin ON public.clinics
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- Doctors are public only through a real active verified link at a published clinic. Team and
-- platform-admin policies remain separate so those users can complete authorized review work.
DROP POLICY IF EXISTS doctors_read_listed ON public.doctors;
CREATE POLICY doctors_read_listed ON public.doctors
FOR SELECT TO anon, authenticated
USING (
    NOT is_demo
    AND EXISTS (
        SELECT 1
        FROM public.clinic_doctors cd
        WHERE cd.doctor_id = doctors.id
          AND private.is_public_provider_link(cd.doctor_id, cd.clinic_id)
    )
);

-- The old clinic-team policy is retained, scoped to the caller's active clinic memberships.
DROP POLICY IF EXISTS doctors_read_clinic ON public.doctors;
CREATE POLICY doctors_read_clinic ON public.doctors
FOR SELECT TO authenticated
USING (
    id IN (
        SELECT cd.doctor_id FROM public.clinic_doctors cd
        WHERE cd.clinic_id IN (SELECT private.user_clinic_ids())
    )
);

DROP POLICY IF EXISTS doctors_read_platform_admin ON public.doctors;
CREATE POLICY doctors_read_platform_admin ON public.doctors
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- Relationship rows are public only when the exact linked doctor and clinic are eligible. Clinic
-- members may inspect relationships at their own clinic; admins may inspect all for review.
DROP POLICY IF EXISTS clinic_doctors_read_public ON public.clinic_doctors;
DROP POLICY IF EXISTS clinic_doctors_read_published ON public.clinic_doctors;
CREATE POLICY clinic_doctors_read_published ON public.clinic_doctors
FOR SELECT TO anon, authenticated
USING (private.is_public_provider_link(doctor_id, clinic_id));

DROP POLICY IF EXISTS clinic_doctors_read_clinic ON public.clinic_doctors;
CREATE POLICY clinic_doctors_read_clinic ON public.clinic_doctors
FOR SELECT TO authenticated
USING (clinic_id IN (SELECT private.user_clinic_ids()));

DROP POLICY IF EXISTS clinic_doctors_read_doctor_self ON public.clinic_doctors;
CREATE POLICY clinic_doctors_read_doctor_self ON public.clinic_doctors
FOR SELECT TO authenticated
USING (doctor_id IN (SELECT private.my_doctor_ids()));

-- 00057's trigger was SECURITY DEFINER, which made current_user appear privileged even for a
-- direct authenticated UPDATE. An invoker trigger sees authenticated on direct REST writes and
-- postgres only while the approved SECURITY DEFINER transition RPC performs its UPDATE.
CREATE OR REPLACE FUNCTION public.check_clinic_publication_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_trusted_transition boolean := current_user = 'postgres'
        AND (SELECT private.is_platform_admin());
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF (NEW.clinic_verification_state, NEW.is_published, NEW.patient_contact_permission,
            NEW.patient_contact_permission_at, NEW.patient_contact_permission_by, NEW.booking_enabled)
           IS DISTINCT FROM
           ('pending'::text, false, 'not_granted'::text, NULL::timestamptz, NULL::uuid, false)
           AND NOT v_trusted_transition THEN
            RAISE EXCEPTION 'Reviewed clinic state must be set through the platform-admin workflow.'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF (NEW.clinic_verification_state, NEW.is_published, NEW.patient_contact_permission,
            NEW.patient_contact_permission_at, NEW.patient_contact_permission_by, NEW.booking_enabled)
           IS DISTINCT FROM
           (OLD.clinic_verification_state, OLD.is_published, OLD.patient_contact_permission,
            OLD.patient_contact_permission_at, OLD.patient_contact_permission_by, OLD.booking_enabled)
           AND NOT v_trusted_transition THEN
            RAISE EXCEPTION 'Reviewed clinic state must be changed through the platform-admin workflow.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.is_published OR NEW.booking_enabled THEN
        IF NEW.is_demo OR NEW.clinic_verification_state <> 'verified' THEN
            RAISE EXCEPTION 'A clinic must be real and verified before publication or booking is enabled.'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.patient_contact_permission = 'granted'
       AND (NEW.is_demo OR NEW.clinic_verification_state <> 'verified' OR NOT NEW.is_published) THEN
        RAISE EXCEPTION 'Patient contact permission requires a verified, published clinic.'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION public.check_clinic_publication_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_clinic_publication_update() FROM PUBLIC, anon, authenticated;

-- Retain the granting actor as an immutable audit snapshot instead of nulling it on account removal.
ALTER TABLE public.clinics
    DROP CONSTRAINT IF EXISTS clinics_patient_contact_permission_by_fkey;
COMMENT ON COLUMN public.clinics.patient_contact_permission_by IS
    'Immutable user UUID snapshot of the actor who last changed contact permission; intentionally not a foreign key so account deletion cannot erase attribution.';

-- No source, UI, test, or documentation caller uses the legacy overload. It leaks schedule-derived
-- availability without clinic publication/booking checks, so remove the function and its grants.
DROP FUNCTION IF EXISTS public.get_doctor_slots(uuid, date);
