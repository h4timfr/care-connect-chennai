-- Break the 42P17 recursion in the user_roles / audit_logs read policies (from 00006).
-- user_roles_read_admin queried public.user_roles from inside a user_roles policy, and audit_logs_read_admin
-- queried user_roles too, so every SELECT on either table (anon, patients, staff and real platform admins alike)
-- failed with "infinite recursion detected in policy for relation user_roles". No rows were exposed, but admins
-- could not read the audit trail and users could not read their own roles.
-- The platform-admin check now runs in a SECURITY DEFINER helper owned by postgres (RLS-bypassing, like the
-- 00045 fix), so policy expansion never re-enters user_roles. Access is unchanged in intent:
--   user_roles: a signed-in user reads their own rows; a platform admin reads all rows.
--   audit_logs: only a platform admin reads; rows are still written only by SECURITY DEFINER functions.
-- Hardening: the policies are now FOR SELECT TO authenticated (they applied to every role, which is why anon
-- reached the recursion before its missing table privilege), so anon now gets a clean 42501.
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = (SELECT auth.uid()) AND role = 'platform_admin'
    );
$$;

ALTER FUNCTION private.is_platform_admin() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS user_roles_read_self ON public.user_roles;
CREATE POLICY user_roles_read_self ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_roles_read_admin ON public.user_roles;
CREATE POLICY user_roles_read_admin ON public.user_roles
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

DROP POLICY IF EXISTS audit_logs_read_admin ON public.audit_logs;
CREATE POLICY audit_logs_read_admin ON public.audit_logs
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- Grants are already in this state (00003 / 00051); restated so the end state does not depend on history.
REVOKE ALL ON public.user_roles, public.audit_logs FROM PUBLIC;
REVOKE ALL ON public.user_roles, public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles, public.audit_logs FROM authenticated;
GRANT SELECT ON public.user_roles, public.audit_logs TO authenticated;
