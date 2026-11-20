-- Explicit post-00061 application ACL baseline.
-- RLS remains responsible for row access; grants below only expose operations
-- backed by current application policies and callers.

GRANT SELECT, UPDATE ON public.doctors TO authenticated;
GRANT SELECT ON public.clinic_doctors, public.clinic_memberships
    TO authenticated;

REVOKE INSERT, UPDATE, DELETE
    ON public.clinic_doctors, public.clinic_memberships
    FROM authenticated;
GRANT UPDATE (verification_state) ON public.clinic_doctors
    TO authenticated;
GRANT UPDATE (active) ON public.clinic_memberships
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.doctor_schedules TO authenticated;

REVOKE UPDATE ON public.clinics, public.conversations
    FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.notifications
    FROM authenticated;

REVOKE MAINTAIN ON
    public.users, public.patients, public.clinics, public.doctors,
    public.clinic_doctors, public.doctor_schedules, public.appointments,
    public.conversations, public.messages, public.audit_logs,
    public.user_roles, public.clinic_memberships, public.notifications,
    public.provider_applications, public.doctor_applications,
    public.candidate_facilities, public.candidate_doctors,
    public.candidate_relationships, public.candidate_sources,
    public.candidate_evidence, public.candidate_contacts
    FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
        REFERENCES, TRIGGER, MAINTAIN
    ON TABLES FROM PUBLIC, anon, authenticated;
