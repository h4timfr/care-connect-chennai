-- Grants are the outer layer; RLS stays the inner one. Every REVOKE below is either
--  (a) a privilege RLS cannot restrict (TRUNCATE / REFERENCES / TRIGGER), or
--  (b) a grant with NO matching RLS policy for that command (dead grant), or
--  (c) anon access to a table pre-login browsing does not read.
-- Kept deliberately: authenticated DML on clinic_doctors, doctor_schedules, clinic_memberships (FOR ALL staff/admin policies),
-- and on tables where a policy of that command exists.

-- (c) anonymous browsing reads exactly: clinics, doctors, clinic_doctors (embedded in doctors), doctor_schedules
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.clinics, public.doctors, public.clinic_doctors, public.doctor_schedules TO anon;

-- (a)
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- (b) no INSERT/DELETE policies exist on these (rows are created by RPCs / definer triggers)
REVOKE INSERT, DELETE ON public.appointments, public.patients, public.users, public.clinics, public.doctors FROM authenticated;
-- no UPDATE/DELETE policy on messages; no DELETE policy on conversations/notifications
REVOKE UPDATE, DELETE ON public.messages FROM authenticated;
REVOKE DELETE ON public.conversations, public.notifications FROM authenticated;
-- read-only tables (SELECT policies only)
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs, public.user_roles FROM authenticated;
