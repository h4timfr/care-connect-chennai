-- 00004_revoke_function_execution.sql
-- Fixes explicitly granted EXECUTE privileges on trigger functions caused by Supabase default privileges.

-- 1. handle_new_user
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 2. handle_new_patient
REVOKE EXECUTE ON FUNCTION public.handle_new_patient() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_patient() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_patient() FROM authenticated;

-- (Postgres triggers do not require explicitly granted EXECUTE privileges for the user firing them.
-- They execute perfectly purely via the internal trigger invocation.)
