-- Expose only the names of clinics where the signed-in doctor has an active link.
-- The clinic row and its private fields retain their existing RLS policies.
CREATE FUNCTION private.my_linked_clinic_names()
RETURNS TABLE (clinic_id uuid, clinic_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT c.id, c.name
    FROM public.clinics AS c
    WHERE EXISTS (
        SELECT 1 FROM public.clinic_doctors AS cd
        WHERE cd.clinic_id = c.id AND cd.active
          AND cd.doctor_id IN (SELECT private.my_doctor_ids())
    );
$$;

CREATE FUNCTION public.my_linked_clinic_names()
RETURNS TABLE (clinic_id uuid, clinic_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM private.my_linked_clinic_names(); $$;

ALTER FUNCTION private.my_linked_clinic_names() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.my_linked_clinic_names() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_linked_clinic_names() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.my_linked_clinic_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_linked_clinic_names() TO authenticated;

-- The existing admin read policies apply. The role predicate also excludes clinic members
-- and doctors who can read some of the same rows through their own separate policies.
CREATE FUNCTION public.admin_demo_doctor_links()
RETURNS TABLE (
    clinic_id uuid, clinic_name text, doctor_id uuid, doctor_name text,
    verification_state text, active boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    SELECT c.id, c.name, d.id, d.name, cd.verification_state, cd.active
    FROM public.clinic_doctors AS cd
    JOIN public.clinics AS c ON c.id = cd.clinic_id
    JOIN public.doctors AS d ON d.id = cd.doctor_id
    WHERE (SELECT private.is_platform_admin()) AND (c.is_demo OR d.is_demo)
    ORDER BY d.name, c.name, d.id, c.id;
$$;

REVOKE ALL ON FUNCTION public.admin_demo_doctor_links() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_demo_doctor_links() TO authenticated;

-- Reject verification of demo links even if someone uses the existing admin write path.
CREATE FUNCTION private.reject_demo_link_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.clinics AS c WHERE c.id = NEW.clinic_id AND c.is_demo)
       OR EXISTS (SELECT 1 FROM public.doctors AS d WHERE d.id = NEW.doctor_id AND d.is_demo) THEN
        RAISE EXCEPTION 'Test and demo relationships cannot be verified.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION private.reject_demo_link_verification() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.reject_demo_link_verification() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER tr_check_demo_link_verification
BEFORE INSERT OR UPDATE OF verification_state ON public.clinic_doctors
FOR EACH ROW WHEN (NEW.verification_state = 'verified')
EXECUTE FUNCTION private.reject_demo_link_verification();
