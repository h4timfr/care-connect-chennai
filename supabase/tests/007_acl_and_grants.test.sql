BEGIN;
SELECT extensions.plan(31);

-- Trigger/internal functions are not callable by API roles (trigger firing does not need EXECUTE)
SELECT extensions.function_privs_are('public', 'check_appointment_overlap', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon has no EXECUTE on check_appointment_overlap');
SELECT extensions.function_privs_are('public', 'check_appointment_overlap', ARRAY[]::text[], 'authenticated', ARRAY[]::text[], 'authenticated has no EXECUTE on check_appointment_overlap');
SELECT extensions.function_privs_are('public', 'check_clinic_update', ARRAY[]::text[], 'anon', ARRAY[]::text[], 'anon has no EXECUTE on check_clinic_update');
SELECT extensions.function_privs_are('public', 'check_clinic_update', ARRAY[]::text[], 'authenticated', ARRAY[]::text[], 'authenticated has no EXECUTE on check_clinic_update');
-- get_doctor_availability is superseded; this assertion stays valid after the function is dropped
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_proc WHERE proname = 'get_doctor_availability' AND pronamespace = 'public'::regnamespace
       AND (has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))),
    0, 'no client role can execute get_doctor_availability'
);

-- anon: read-only access to the four tables behind public browsing, nothing else
SELECT extensions.table_privs_are('public', 'clinics', 'anon', ARRAY['SELECT'], 'anon reads clinics');
SELECT extensions.table_privs_are('public', 'doctors', 'anon', ARRAY['SELECT'], 'anon reads doctors');
SELECT extensions.table_privs_are('public', 'clinic_doctors', 'anon', ARRAY['SELECT'], 'anon reads clinic_doctors');
SELECT extensions.table_privs_are('public', 'doctor_schedules', 'anon', ARRAY['SELECT'], 'anon reads doctor_schedules');
SELECT extensions.table_privs_are('public', 'patients', 'anon', ARRAY[]::text[], 'anon has no access to patients');
SELECT extensions.table_privs_are('public', 'appointments', 'anon', ARRAY[]::text[], 'anon has no access to appointments');
SELECT extensions.table_privs_are('public', 'conversations', 'anon', ARRAY[]::text[], 'anon has no access to conversations');
SELECT extensions.table_privs_are('public', 'messages', 'anon', ARRAY[]::text[], 'anon has no access to messages');
SELECT extensions.table_privs_are('public', 'notifications', 'anon', ARRAY[]::text[], 'anon has no access to notifications');
SELECT extensions.table_privs_are('public', 'clinic_memberships', 'anon', ARRAY[]::text[], 'anon has no access to clinic_memberships');
SELECT extensions.table_privs_are('public', 'users', 'anon', ARRAY[]::text[], 'anon has no access to users');
SELECT extensions.table_privs_are('public', 'user_roles', 'anon', ARRAY[]::text[], 'anon has no access to user_roles');
SELECT extensions.table_privs_are('public', 'audit_logs', 'anon', ARRAY[]::text[], 'anon has no access to audit_logs');

-- authenticated: only the operations that have an RLS policy behind them (never TRUNCATE / REFERENCES / TRIGGER)
SELECT extensions.table_privs_are('public', 'clinics', 'authenticated', ARRAY['SELECT', 'UPDATE'], 'authenticated on clinics');
SELECT extensions.table_privs_are('public', 'doctors', 'authenticated', ARRAY['SELECT', 'UPDATE'], 'authenticated on doctors');
SELECT extensions.table_privs_are('public', 'clinic_doctors', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated on clinic_doctors');
SELECT extensions.table_privs_are('public', 'doctor_schedules', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated on doctor_schedules');
SELECT extensions.table_privs_are('public', 'clinic_memberships', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated on clinic_memberships');
SELECT extensions.table_privs_are('public', 'patients', 'authenticated', ARRAY['SELECT', 'UPDATE'], 'authenticated on patients');
SELECT extensions.table_privs_are('public', 'users', 'authenticated', ARRAY['SELECT', 'UPDATE'], 'authenticated on users');
SELECT extensions.table_privs_are('public', 'appointments', 'authenticated', ARRAY['SELECT', 'UPDATE'], 'authenticated on appointments (bookings go through book_appointment)');
SELECT extensions.table_privs_are('public', 'conversations', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE'], 'authenticated on conversations');
SELECT extensions.table_privs_are('public', 'messages', 'authenticated', ARRAY['SELECT', 'INSERT'], 'authenticated on messages');
SELECT extensions.table_privs_are('public', 'notifications', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE'], 'authenticated on notifications');
SELECT extensions.table_privs_are('public', 'audit_logs', 'authenticated', ARRAY['SELECT'], 'authenticated on audit_logs');
SELECT extensions.table_privs_are('public', 'user_roles', 'authenticated', ARRAY['SELECT'], 'authenticated on user_roles');

SELECT * FROM extensions.finish();
ROLLBACK;
