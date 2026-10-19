-- Restrict direct clinic reads to the public discovery projection and close the
-- anonymous schedule read path left open by 00055.
-- Apply after 00058_provider_publication_read_boundary.sql.

-- Row-level security cannot hide columns. Remove inherited table-wide SELECT and
-- grant only discovery-safe columns. Clinic contact details are returned only by
-- the authorized RPCs below, never through direct PostgREST table reads.
REVOKE SELECT (phone, email) ON public.clinics FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.clinics FROM PUBLIC, anon, authenticated;
GRANT SELECT (
    id, name, address, area, lat, lng, about, specialty_ids, services, facilities,
    languages, opening_hours, fee_range, rating, review_count, is_demo, photo_tone,
    clinic_verification_state, is_published, patient_contact_permission, booking_enabled,
    created_at
) ON public.clinics TO anon, authenticated;

-- Platform admins may review full clinic records, including direct contact details.
CREATE OR REPLACE FUNCTION public.admin_list_clinics()
RETURNS SETOF public.clinics
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.*
    FROM public.clinics c
    WHERE (SELECT private.is_platform_admin())
    ORDER BY c.name;
$$;
ALTER FUNCTION public.admin_list_clinics() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_clinics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clinics() TO authenticated;

-- Clinic members may retrieve direct contact details only for their own active
-- clinic memberships. The function accepts no clinic id, preventing caller-chosen
-- cross-clinic lookups.
CREATE OR REPLACE FUNCTION public.get_my_clinic_contacts()
RETURNS TABLE(clinic_id uuid, phone text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.id, c.phone, c.email
    FROM public.clinics c
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND c.id IN (SELECT private.user_clinic_ids());
$$;
ALTER FUNCTION public.get_my_clinic_contacts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_clinic_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_clinic_contacts() TO authenticated;

-- Only the anonymous schedule policy changes here. Authenticated doctor and
-- clinic-member policies, including their restrictive active/verified guards,
-- remain intact.
DROP POLICY IF EXISTS schedules_read_public ON public.doctor_schedules;
CREATE POLICY schedules_read_public ON public.doctor_schedules
FOR SELECT TO anon
USING (private.is_public_provider_link(doctor_id, clinic_id));
