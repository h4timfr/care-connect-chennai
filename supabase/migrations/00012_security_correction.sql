-- 00012_security_correction.sql
-- 1. Harden check_appointment_update() with STRICT restrictions on patient AND staff updates
-- and secure SEARCH_PATH.

CREATE OR REPLACE FUNCTION public.check_appointment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
        SELECT 1 FROM public.clinic_staff
        WHERE clinic_id = NEW.clinic_id AND user_id = v_uid
    );

    IF v_is_patient THEN
        -- Patient cannot change any core or scheduling field
        IF NEW.clinic_id != OLD.clinic_id OR
           NEW.doctor_id != OLD.doctor_id OR
           NEW.patient_id != OLD.patient_id OR
           NEW.fee != OLD.fee OR
           NEW.date != OLD.date OR
           NEW.time != OLD.time OR
           NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Patients cannot modify core appointment details';
        END IF;

        -- Patient can only cancel appointments
        IF NEW.status != OLD.status AND NEW.status != 'cancelled' THEN
            RAISE EXCEPTION 'Patients can only cancel appointments';
        END IF;

    ELSIF v_is_staff THEN
        -- Staff cannot change clinic, patient, fee, doctor, date, time, or reason
        IF NEW.clinic_id != OLD.clinic_id OR
           NEW.patient_id != OLD.patient_id OR
           NEW.fee != OLD.fee OR
           NEW.doctor_id != OLD.doctor_id OR
           NEW.date != OLD.date OR
           NEW.time != OLD.time OR
           NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Staff cannot modify core appointment scheduling details';
        END IF;

        -- Allowed status transitions for staff
        IF NEW.status != OLD.status THEN
            IF OLD.status = 'pending' AND NEW.status NOT IN ('confirmed', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition from pending';
            ELSIF OLD.status = 'confirmed' AND NEW.status NOT IN ('arrived', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition from confirmed';
            ELSIF OLD.status = 'arrived' AND NEW.status != 'completed' THEN
                RAISE EXCEPTION 'Invalid status transition from arrived';
            ELSIF OLD.status IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Cannot change status of a completed or cancelled appointment';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
