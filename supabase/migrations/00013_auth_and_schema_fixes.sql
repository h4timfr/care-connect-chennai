-- 00013_auth_and_schema_fixes.sql

-- 1. Fix broken appointment update trigger which references dropped clinic_staff table
-- Also restore precise state machine and use IS DISTINCT FROM for null-safety.
CREATE OR REPLACE FUNCTION public.check_appointment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
    v_is_patient BOOLEAN;
    v_is_staff BOOLEAN;
    v_uid UUID;
BEGIN
    v_uid := (SELECT auth.uid());

    -- Check if user is the patient
    v_is_patient := EXISTS (
        SELECT 1 FROM public.patients
        WHERE id = NEW.patient_id AND user_id = v_uid
    );

    -- Check if user is staff of this clinic
    v_is_staff := EXISTS (
        SELECT 1 FROM public.clinic_memberships
        WHERE clinic_id = NEW.clinic_id AND user_id = v_uid AND active = true
    );

    IF v_is_patient THEN
        IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR
           NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
           NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
           NEW.fee IS DISTINCT FROM OLD.fee OR
           NEW.date IS DISTINCT FROM OLD.date OR
           NEW.time IS DISTINCT FROM OLD.time OR
           NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Patients cannot modify core appointment details';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status != 'cancelled' THEN
                RAISE EXCEPTION 'Patients can only cancel appointments';
            ELSIF OLD.status IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Cannot cancel terminal appointments';
            END IF;
        END IF;
    ELSIF v_is_staff THEN
        IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR
           NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
           NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
           NEW.fee IS DISTINCT FROM OLD.fee OR
           NEW.date IS DISTINCT FROM OLD.date OR
           NEW.time IS DISTINCT FROM OLD.time OR
           NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Staff cannot mass-assign scheduling details';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.status = 'pending' AND NEW.status NOT IN ('confirmed', 'cancelled') THEN
                RAISE EXCEPTION 'Pending appointments can only be confirmed or cancelled';
            ELSIF OLD.status = 'confirmed' AND NEW.status NOT IN ('arrived', 'cancelled') THEN
                RAISE EXCEPTION 'Confirmed appointments can only be marked arrived or cancelled';
            ELSIF OLD.status = 'arrived' AND NEW.status != 'completed' THEN
                RAISE EXCEPTION 'Arrived appointments can only be marked completed';
            ELSIF OLD.status IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Terminal states cannot be modified';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$body$;

-- Ensure trigger has no public execute access
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM authenticated;


-- 2. Consolidate Double-Booking Indexes
DROP INDEX IF EXISTS public.appointments_active_slot_idx;
DROP INDEX IF EXISTS public.idx_appointments_no_double_booking;

CREATE UNIQUE INDEX idx_appointments_no_double_booking
ON public.appointments (doctor_id, date, time)
WHERE status IN ('pending', 'confirmed', 'arrived');


-- 3. Prevent Doctors Table Mass Assignment (user_id theft)
CREATE OR REPLACE FUNCTION public.check_doctor_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
    -- user_id is immutable for everyone to prevent profile theft.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Cannot reassign doctor user_id';
    END IF;

    -- Block assignment of rating and review_count
    IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.review_count IS DISTINCT FROM OLD.review_count THEN
        RAISE EXCEPTION 'Cannot modify calculated rating fields';
    END IF;

    RETURN NEW;
END;
$body$;

REVOKE EXECUTE ON FUNCTION public.check_doctor_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_doctor_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_doctor_update() FROM authenticated;

DROP TRIGGER IF EXISTS tr_check_doctor_update ON public.doctors;
CREATE TRIGGER tr_check_doctor_update
    BEFORE UPDATE ON public.doctors
    FOR EACH ROW
    EXECUTE FUNCTION public.check_doctor_update();


-- 4. Prevent Clinic Staff from Self-Verifying Doctors
CREATE OR REPLACE FUNCTION public.check_clinic_doctor_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
    v_is_platform_admin BOOLEAN;
BEGIN
    v_is_platform_admin := EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = (SELECT auth.uid()) AND role = 'platform_admin'
    );

    IF TG_OP = 'UPDATE' THEN
        -- Prevent stealing an existing verified relationship by changing the doctor_id or clinic_id
        IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
            RAISE EXCEPTION 'Cannot reassign clinic_id or doctor_id of an existing relationship';
        END IF;
    END IF;

    IF NOT v_is_platform_admin THEN
        IF TG_OP = 'INSERT' AND NEW.verification_state IS DISTINCT FROM 'pending' THEN
            NEW.verification_state := 'pending';
        ELSIF TG_OP = 'UPDATE' AND NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
            RAISE EXCEPTION 'Only platform admins can change verification state';
        END IF;
    END IF;

    RETURN NEW;
END;
$body$;

REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM authenticated;

DROP TRIGGER IF EXISTS tr_check_clinic_doctor_update ON public.clinic_doctors;
CREATE TRIGGER tr_check_clinic_doctor_update
    BEFORE INSERT OR UPDATE ON public.clinic_doctors
    FOR EACH ROW
    EXECUTE FUNCTION public.check_clinic_doctor_update();


-- 5. Fix Conversations missing UPDATE policy and Mass Assignment
DROP POLICY IF EXISTS conv_update_participant ON public.conversations;
CREATE POLICY conv_update_participant ON public.conversations FOR UPDATE USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = (SELECT auth.uid()))
    OR
    clinic_id IN (SELECT private.user_clinic_ids())
);

CREATE OR REPLACE FUNCTION public.check_conversation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
    v_is_patient BOOLEAN;
    v_is_staff BOOLEAN;
    v_uid UUID;
BEGIN
    v_uid := (SELECT auth.uid());

    -- Check if user is the patient
    v_is_patient := EXISTS (
        SELECT 1 FROM public.patients
        WHERE id = NEW.patient_id AND user_id = v_uid
    );

    -- Check if user is staff of this clinic
    v_is_staff := EXISTS (
        SELECT 1 FROM public.clinic_memberships
        WHERE clinic_id = NEW.clinic_id AND user_id = v_uid AND active = true
    );

    -- Only allow changing unread counts. All other fields are immutable.
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR
       NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
       NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
       NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR
       NEW.kind IS DISTINCT FROM OLD.kind OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Cannot reassign conversation core fields';
    END IF;

    IF v_is_patient THEN
        IF NEW.unread_for_clinic IS DISTINCT FROM OLD.unread_for_clinic THEN
            RAISE EXCEPTION 'Patients cannot modify clinic unread counts';
        END IF;
    ELSIF v_is_staff THEN
        IF NEW.unread_for_patient IS DISTINCT FROM OLD.unread_for_patient THEN
            RAISE EXCEPTION 'Staff cannot modify patient unread counts';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized conversation update';
    END IF;

    RETURN NEW;
END;
$body$;

REVOKE EXECUTE ON FUNCTION public.check_conversation_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_conversation_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_conversation_update() FROM authenticated;

DROP TRIGGER IF EXISTS tr_check_conversation_update ON public.conversations;
CREATE TRIGGER tr_check_conversation_update
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.check_conversation_update();
