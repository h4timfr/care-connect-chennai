-- 1. Create Private Schema
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- 2. Create Helpers
CREATE OR REPLACE FUNCTION private.user_clinic_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
    SELECT clinic_id 
    FROM public.clinic_staff 
    WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.user_admin_clinic_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
    SELECT clinic_id 
    FROM public.clinic_staff 
    WHERE user_id = (SELECT auth.uid()) AND is_admin = true;
$$;

-- 3. Set Ownership and Privileges
ALTER FUNCTION private.user_clinic_ids() OWNER TO postgres;
ALTER FUNCTION private.user_admin_clinic_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.user_clinic_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_clinic_ids() FROM anon;
GRANT EXECUTE ON FUNCTION private.user_clinic_ids() TO authenticated;

REVOKE ALL ON FUNCTION private.user_admin_clinic_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_admin_clinic_ids() FROM anon;
GRANT EXECUTE ON FUNCTION private.user_admin_clinic_ids() TO authenticated;

-- 4. Rewrite Policies
-- Clinics
DROP POLICY IF EXISTS clinics_update_admin ON public.clinics;
CREATE POLICY clinics_update_admin ON public.clinics FOR UPDATE USING (
    id IN (SELECT private.user_admin_clinic_ids())
);

-- Clinic Staff
DROP POLICY IF EXISTS staff_read_clinic ON public.clinic_staff;
CREATE POLICY staff_read_clinic ON public.clinic_staff FOR SELECT USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

DROP POLICY IF EXISTS staff_all_admin ON public.clinic_staff;
CREATE POLICY staff_all_admin ON public.clinic_staff USING (
    clinic_id IN (SELECT private.user_admin_clinic_ids())
);

-- Doctors
DROP POLICY IF EXISTS doctors_update_staff ON public.doctors;
CREATE POLICY doctors_update_staff ON public.doctors FOR UPDATE USING (
    id IN (
        SELECT doctor_id FROM public.clinic_doctors 
        WHERE clinic_id IN (SELECT private.user_clinic_ids())
    )
);

-- Clinic Doctors
DROP POLICY IF EXISTS clinic_doctors_all_staff ON public.clinic_doctors;
CREATE POLICY clinic_doctors_all_staff ON public.clinic_doctors USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

-- Doctor Schedules
DROP POLICY IF EXISTS schedules_all_staff ON public.doctor_schedules;
CREATE POLICY schedules_all_staff ON public.doctor_schedules USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

-- Appointments
DROP POLICY IF EXISTS appts_read_staff ON public.appointments;
CREATE POLICY appts_read_staff ON public.appointments FOR SELECT USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

DROP POLICY IF EXISTS appts_update_staff ON public.appointments;
CREATE POLICY appts_update_staff ON public.appointments FOR UPDATE USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

-- Conversations
DROP POLICY IF EXISTS conv_read_staff ON public.conversations;
CREATE POLICY conv_read_staff ON public.conversations FOR SELECT USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);

DROP POLICY IF EXISTS conv_insert_staff ON public.conversations;
CREATE POLICY conv_insert_staff ON public.conversations FOR INSERT WITH CHECK (
    clinic_id IN (SELECT private.user_clinic_ids())
);

-- Messages
DROP POLICY IF EXISTS msg_insert_participant ON public.messages;
CREATE POLICY msg_insert_participant ON public.messages FOR INSERT WITH CHECK (
    sender_id = (SELECT auth.uid()) AND
    (
        conversation_id IN (
            SELECT id FROM public.conversations WHERE patient_id IN (SELECT id FROM public.patients WHERE user_id = (SELECT auth.uid()))
        )
        OR
        conversation_id IN (
            SELECT id FROM public.conversations WHERE clinic_id IN (SELECT private.user_clinic_ids())
        )
    )
);

DROP POLICY IF EXISTS msg_read_participant ON public.messages;
CREATE POLICY msg_read_participant ON public.messages FOR SELECT USING (
    (
        conversation_id IN (
            SELECT id FROM public.conversations WHERE patient_id IN (SELECT id FROM public.patients WHERE user_id = (SELECT auth.uid()))
        )
    )
    OR
    (
        conversation_id IN (
            SELECT id FROM public.conversations WHERE clinic_id IN (SELECT private.user_clinic_ids())
        )
    )
);
