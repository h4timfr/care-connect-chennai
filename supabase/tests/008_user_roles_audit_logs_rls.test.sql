BEGIN;
SELECT extensions.plan(26);

-- Contract: the read policies are authenticated-only and check platform admin through a definer helper,
-- never by querying user_roles from inside a policy (that is what recursed with 42P17)
SELECT extensions.policies_are('public', 'user_roles', ARRAY['user_roles_read_self', 'user_roles_read_admin'], 'user_roles keeps exactly the self and admin read policies');
SELECT extensions.policies_are('public', 'audit_logs', ARRAY['audit_logs_read_admin'], 'audit_logs keeps exactly the admin read policy');
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('user_roles', 'audit_logs') AND roles <> ARRAY['authenticated']::name[]),
    0, 'user_roles and audit_logs policies apply only to authenticated'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND (coalesce(qual, '') ~ 'user_roles' OR coalesce(with_check, '') ~ 'user_roles')),
    0, 'no RLS policy queries user_roles directly'
);
SELECT extensions.is_definer('private', 'is_platform_admin', ARRAY[]::text[], 'is_platform_admin is SECURITY DEFINER');
SELECT extensions.function_owner_is('private', 'is_platform_admin', ARRAY[]::text[], 'postgres', 'is_platform_admin is owned by postgres');
SELECT extensions.function_privs_are('private', 'is_platform_admin', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon cannot execute is_platform_admin');
SELECT extensions.function_privs_are('private', 'is_platform_admin', ARRAY[]::text[], 'authenticated', ARRAY['EXECUTE'], 'authenticated can execute is_platform_admin');

-- Fixtures: a patient, a clinic staff member and a platform admin (roles are assigned out of band, as in production)
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000000e1', 'patient@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000e2', 'staff@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000e3', 'admin@test.com', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES
('00000000-0000-0000-0000-0000000000e1', 'patient'),
('00000000-0000-0000-0000-0000000000e2', 'clinic_staff'),
('00000000-0000-0000-0000-0000000000e3', 'platform_admin');
INSERT INTO public.audit_logs (action_type, actor_id, metadata) VALUES
('test_event', '00000000-0000-0000-0000-0000000000e1', '{}'),
('test_event', '00000000-0000-0000-0000-0000000000e2', '{}');
DO $$
BEGIN
    PERFORM set_config('test.user_roles_total', (SELECT count(*) FROM public.user_roles)::text, true);
    PERFORM set_config('test.audit_logs_total', (SELECT count(*) FROM public.audit_logs)::text, true);
END $$;

-- anon: a clean permission error, not a recursion error
SET LOCAL role anon;
SELECT extensions.throws_ok($$ SELECT count(*) FROM public.user_roles $$, '42501', NULL, 'anon is denied user_roles with 42501');
SELECT extensions.throws_ok($$ SELECT count(*) FROM public.audit_logs $$, '42501', NULL, 'anon is denied audit_logs with 42501');
RESET role;

-- Patient: reads only their own role, sees no audit rows, cannot write either table
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok($$ SELECT count(*) FROM public.user_roles $$, 'reading user_roles does not recurse');
SELECT extensions.is((SELECT array_agg(role::text) FROM public.user_roles), ARRAY['patient'], 'a patient sees only their own role row');
SELECT extensions.lives_ok($$ SELECT count(*) FROM public.audit_logs $$, 'reading audit_logs does not recurse');
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs), 0, 'a patient sees no audit rows');
SELECT extensions.is(private.is_platform_admin(), false, 'a patient is not a platform admin');
SELECT extensions.throws_ok($$ INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000e1', 'platform_admin') $$, '42501', NULL, 'a patient cannot grant themselves platform_admin');
SELECT extensions.throws_ok($$ UPDATE public.user_roles SET role = 'platform_admin' WHERE user_id = '00000000-0000-0000-0000-0000000000e1' $$, '42501', NULL, 'a patient cannot change their role');
SELECT extensions.throws_ok($$ INSERT INTO public.audit_logs (action_type) VALUES ('forged') $$, '42501', NULL, 'a patient cannot write audit rows');
SELECT extensions.throws_ok($$ DELETE FROM public.audit_logs $$, '42501', NULL, 'a patient cannot delete audit rows');
RESET role;

-- Clinic staff: same as any non-admin
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT array_agg(role::text) FROM public.user_roles), ARRAY['clinic_staff'], 'staff see only their own role row');
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs), 0, 'staff see no audit rows');
RESET role;

-- Platform admin: reads every role row and the whole audit trail
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.user_roles), current_setting('test.user_roles_total')::int, 'a platform admin reads all role rows');
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs), current_setting('test.audit_logs_total')::int, 'a platform admin reads the whole audit trail');
SELECT extensions.is(private.is_platform_admin(), true, 'is_platform_admin recognises the admin');
RESET role;

-- Authenticated role without a user id: nothing visible, no error
SET LOCAL request.jwt.claims TO '{"role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM public.user_roles), 0, 'no user id sees no role rows');
SELECT extensions.is((SELECT count(*)::int FROM public.audit_logs), 0, 'no user id sees no audit rows');
RESET role;

SELECT * FROM extensions.finish();
ROLLBACK;
