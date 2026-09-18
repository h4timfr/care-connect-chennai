BEGIN;
SELECT extensions.plan(12);

-- 1. Required tables exist
SELECT extensions.has_table('public', 'users', 'Table users should exist');
SELECT extensions.has_table('public', 'user_roles', 'Table user_roles should exist');
SELECT extensions.has_table('public', 'patients', 'Table patients should exist');
SELECT extensions.has_table('public', 'clinic_memberships', 'Table clinic_memberships should exist');
SELECT extensions.has_table('public', 'appointments', 'Table appointments should exist');
SELECT extensions.has_table('public', 'audit_logs', 'Table audit_logs should exist');

-- 2. Role Enum Values
SELECT extensions.has_enum('public', 'user_role', 'user_role enum should exist');
SELECT extensions.enum_has_labels('public', 'user_role', ARRAY['patient', 'doctor', 'clinic_staff', 'clinic_admin', 'platform_admin'], 'user_role should have exactly the expected roles');

-- 3. Functions and Security Definer
SELECT extensions.has_function('public', 'book_appointment', ARRAY['uuid', 'uuid', 'date', 'time without time zone', 'text'], 'book_appointment function should exist');
SELECT extensions.is_definer('public', 'book_appointment', ARRAY['uuid', 'uuid', 'date', 'time without time zone', 'text'], 'book_appointment should be SECURITY DEFINER');

SELECT extensions.has_function('public', 'handle_new_user', 'handle_new_user function should exist');
SELECT extensions.is_definer('public', 'handle_new_user', 'handle_new_user should be SECURITY DEFINER');

SELECT * FROM extensions.finish();
ROLLBACK;
