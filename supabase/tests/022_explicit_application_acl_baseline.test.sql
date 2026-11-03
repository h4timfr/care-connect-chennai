BEGIN;
SELECT extensions.plan(12);

SELECT extensions.table_privs_are(
    'public', 'doctors', 'authenticated', ARRAY['SELECT', 'UPDATE'],
    'authenticated retains doctor profile reads and updates'
);
SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.clinic_doctors', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.clinic_doctors', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.clinic_doctors', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.clinic_doctors', 'DELETE')
    AND has_column_privilege('authenticated', 'public.clinic_doctors', 'verification_state', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.clinic_doctors', 'doctor_id', 'UPDATE'),
    'clinic-doctor updates are limited to verification_state'
);
SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.clinic_memberships', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.clinic_memberships', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.clinic_memberships', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.clinic_memberships', 'DELETE')
    AND has_column_privilege('authenticated', 'public.clinic_memberships', 'active', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.clinic_memberships', 'role', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.clinic_memberships', 'clinic_id', 'UPDATE'),
    'membership updates are limited to active status'
);
SELECT extensions.table_privs_are(
    'public', 'doctor_schedules', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'authenticated retains schedule CRUD protected by RLS'
);
SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.clinics', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'UPDATE'),
    'generic clinic and conversation updates are revoked'
);
SELECT extensions.table_privs_are(
    'public', 'conversations', 'authenticated', ARRAY['SELECT', 'INSERT'],
    'conversation creation and reads remain available'
);
SELECT extensions.table_privs_are(
    'public', 'notifications', 'authenticated', ARRAY[]::text[],
    'notifications remain RPC-only for API roles'
);
SELECT extensions.ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relname = ANY (ARRAY[
              'users', 'patients', 'clinics', 'doctors', 'clinic_doctors',
              'doctor_schedules', 'appointments', 'conversations', 'messages',
              'audit_logs', 'user_roles', 'clinic_memberships', 'notifications',
              'provider_applications', 'doctor_applications', 'candidate_facilities',
              'candidate_doctors', 'candidate_relationships', 'candidate_sources',
              'candidate_evidence', 'candidate_contacts'
          ])
          AND (
              has_table_privilege('anon', c.oid, 'MAINTAIN')
              OR has_table_privilege('authenticated', c.oid, 'MAINTAIN')
          )
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND a.grantee = 0
          AND a.privilege_type = 'MAINTAIN'
    ),
    'MAINTAIN is absent for PUBLIC, anon, and authenticated'
);
SELECT extensions.ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = 'postgres'::regrole
          AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype = 'r'
          AND a.grantee IN (
              0,
              (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
              (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
          )
    ),
    'future postgres-owned public tables have no default API or PUBLIC grants'
);
SELECT extensions.ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass)
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.patients'::regclass)
    AND NOT has_table_privilege('anon', 'public.users', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.patients', 'SELECT'),
    'users and patient rows remain protected by RLS with no anonymous table access'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'public.users'::regclass
          AND p.polname = 'users_read_self'
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth.uid%'
    )
    AND EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'public.patients'::regclass
          AND p.polname = 'patients_read_self'
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth.uid%'
    ),
    'user and patient read policies scope rows to the signed-in identity'
);
SELECT extensions.ok(
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'email' AND NOT attisdropped)
    AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'phone' AND NOT attisdropped)
    AND NOT has_table_privilege('anon', 'public.users', 'SELECT'),
    'patient contact fields are not exposed through anonymous users-table access'
);
SELECT * FROM extensions.finish();
ROLLBACK;
