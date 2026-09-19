-- 00014_audit_logging_hardening.sql

-- 1. Add audit logging to check_appointment_update
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

    -- Audit Logging for status changes
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES (
            'appointment_status_changed',
            v_uid,
            NEW.id,
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
        );
    END IF;

    RETURN NEW;
END;
$body$;

-- Ensure trigger has no public execute access
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM authenticated;


-- 2. Add audit logging to check_clinic_doctor_update
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

    -- Audit Logging for verification state changes
    IF TG_OP = 'UPDATE' AND NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES (
            'clinic_doctor_verification_changed',
            (SELECT auth.uid()),
            NEW.doctor_id,
            jsonb_build_object(
                'clinic_id', NEW.clinic_id,
                'old_state', OLD.verification_state,
                'new_state', NEW.verification_state
            )
        );
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES (
            'clinic_doctor_created',
            (SELECT auth.uid()),
            NEW.doctor_id,
            jsonb_build_object(
                'clinic_id', NEW.clinic_id,
                'state', NEW.verification_state
            )
        );
    END IF;

    RETURN NEW;
END;
$body$;

REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_clinic_doctor_update() FROM authenticated;
