-- 1. Restore EXECUTE for authenticated so RLS works
GRANT EXECUTE ON FUNCTION private.user_clinic_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_admin_clinic_ids() TO authenticated;

-- 2. Restrict supabase_realtime publication
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE public.messages;
-- 3. Booking concurrency fix
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_idx
ON public.appointments (doctor_id, clinic_id, date, time)
WHERE status NOT IN ('cancelled', 'completed');
-- 4. Appointment State Machine and Mass Assignment Protection
CREATE OR REPLACE FUNCTION public.check_appointment_update()
RETURNS TRIGGER AS $$
DECLARE
    v_is_patient BOOLEAN;
    v_is_staff BOOLEAN;
BEGIN
    -- Check if user is the patient
    v_is_patient := EXISTS (
        SELECT 1 FROM public.patients
        WHERE id = NEW.patient_id AND user_id = auth.uid()
    );

    -- Check if user is staff of this clinic
    v_is_staff := EXISTS (
        SELECT 1 FROM public.clinic_staff
        WHERE clinic_id = NEW.clinic_id AND user_id = auth.uid()
    );

    IF v_is_patient THEN
        -- Patient cannot change fee, clinic, doctor, patient
        IF NEW.fee != OLD.fee OR NEW.clinic_id != OLD.clinic_id OR NEW.doctor_id != OLD.doctor_id OR NEW.patient_id != OLD.patient_id THEN
            RAISE EXCEPTION 'Patients cannot modify core appointment details';
        END IF;

        -- Patient can only cancel or reschedule
        IF NEW.status != OLD.status AND NEW.status != 'cancelled' THEN
            RAISE EXCEPTION 'Patients can only cancel appointments';
        END IF;
    ELSIF v_is_staff THEN
        -- Staff cannot change clinic or patient
        IF NEW.clinic_id != OLD.clinic_id OR NEW.patient_id != OLD.patient_id THEN
            RAISE EXCEPTION 'Staff cannot reassign appointments to other clinics or patients';
        END IF;

        -- Allowed status transitions for staff
        IF NEW.status != OLD.status AND NEW.status NOT IN ('cancelled', 'confirmed', 'arrived', 'completed') THEN
            RAISE EXCEPTION 'Invalid status transition';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_appointment_update ON public.appointments;
CREATE TRIGGER tr_check_appointment_update
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.check_appointment_update();
-- 5. Drop vulnerable direct INSERT policy for appointments
-- Patients must use the book_appointment RPC to enforce business rules
DROP POLICY IF EXISTS appts_insert_patient ON public.appointments;

-- Clinic staff might need to insert appointments for walk-in patients directly
-- Let's check if there is an insert policy for staff
