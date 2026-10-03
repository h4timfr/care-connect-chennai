-- URGENT: break the 42P17 recursion between patients_read_staff and the appointments/conversations policies.
-- The helper runs as its owner (postgres, RLS-bypassing), so the patients policy no longer re-enters RLS.
-- Staff scope is unchanged: only patients linked to the caller's active clinic memberships through appointments or
-- conversations. patients_read_self and patients_update_self are not touched.
-- Hardening: the policy is explicitly FOR SELECT TO authenticated (the earlier recursive policy applied to every role).
CREATE OR REPLACE FUNCTION private.get_clinic_patient_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT patient_id FROM public.appointments
    WHERE clinic_id IN (SELECT private.user_clinic_ids())
    UNION
    SELECT patient_id FROM public.conversations
    WHERE clinic_id IN (SELECT private.user_clinic_ids());
END;
$$;

ALTER FUNCTION private.get_clinic_patient_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.get_clinic_patient_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_clinic_patient_ids() FROM anon;
GRANT EXECUTE ON FUNCTION private.get_clinic_patient_ids() TO authenticated;

DROP POLICY IF EXISTS patients_read_staff ON public.patients;

CREATE POLICY patients_read_staff ON public.patients
FOR SELECT TO authenticated
USING (
    id IN (SELECT private.get_clinic_patient_ids())
);
