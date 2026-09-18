BEGIN;
SELECT extensions.plan(13);

-- Check Privileges for book_appointment
-- 1. anon cannot execute
SELECT extensions.function_privs_are('public', 'book_appointment', ARRAY['uuid', 'uuid', 'date', 'time without time zone', 'text'], 'anon', ARRAY[]::text[], 'anon should have no EXECUTE privilege on book_appointment');

-- 2. authenticated can execute
SELECT extensions.function_privs_are('public', 'book_appointment', ARRAY['uuid', 'uuid', 'date', 'time without time zone', 'text'], 'authenticated', ARRAY['EXECUTE'], 'authenticated should have EXECUTE privilege on book_appointment');

-- 3. Triggers have no execute
SELECT extensions.function_privs_are('public', 'handle_new_user', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon should have no EXECUTE on handle_new_user');
SELECT extensions.function_privs_are('public', 'handle_new_user', ARRAY[]::text[], 'authenticated', ARRAY[]::text[], 'authenticated should have no EXECUTE on handle_new_user');
SELECT extensions.function_privs_are('public', 'handle_new_patient', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon should have no EXECUTE on handle_new_patient');
SELECT extensions.function_privs_are('public', 'handle_new_patient', ARRAY[]::text[], 'authenticated', ARRAY[]::text[], 'authenticated should have no EXECUTE on handle_new_patient');

-- 4. audit_logs not readable by anon
SELECT extensions.table_privs_are('public', 'audit_logs', 'anon', ARRAY[]::text[], 'anon should have no table privileges on audit_logs');

-- 5. Helper Function Privileges
SELECT extensions.function_privs_are('private', 'user_clinic_ids', ARRAY[]::text[], 'authenticated', ARRAY['EXECUTE'], 'authenticated should have EXECUTE on user_clinic_ids');
SELECT extensions.function_privs_are('private', 'user_clinic_ids', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon should have no EXECUTE on user_clinic_ids');
SELECT extensions.function_privs_are('private', 'user_admin_clinic_ids', ARRAY[]::text[], 'authenticated', ARRAY['EXECUTE'], 'authenticated should have EXECUTE on user_admin_clinic_ids');
SELECT extensions.function_privs_are('private', 'user_admin_clinic_ids', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon should have no EXECUTE on user_admin_clinic_ids');

-- 6. Helper Function Properties
SELECT extensions.is(
    (SELECT prosecdef FROM pg_proc WHERE proname = 'user_clinic_ids' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'private')),
    true,
    'user_clinic_ids must be SECURITY DEFINER'
);
SELECT extensions.is(
    (SELECT prosecdef FROM pg_proc WHERE proname = 'user_admin_clinic_ids' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'private')),
    true,
    'user_admin_clinic_ids must be SECURITY DEFINER'
);

SELECT * FROM extensions.finish();
ROLLBACK;
