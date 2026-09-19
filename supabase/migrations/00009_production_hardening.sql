-- migration 00009_production_hardening.sql

-- 1. Explicitly revoke EXECUTE from PUBLIC on all private helpers
REVOKE EXECUTE ON FUNCTION private.user_clinic_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.user_clinic_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION private.user_clinic_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.user_admin_clinic_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.user_admin_clinic_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION private.user_admin_clinic_ids() FROM authenticated;

-- 2. Add is_demo flag for provenance
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false NOT NULL;

-- Mark existing data from seed as demo
UPDATE public.clinics SET is_demo = true;
UPDATE public.doctors SET is_demo = true;
UPDATE public.users SET is_demo = true;
UPDATE public.patients SET is_demo = true;

-- 3. Update book_appointment RPC to enforce active and verified status
CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id UUID,
    p_clinic_id UUID,
    p_date DATE,
    p_time TIME,
    p_reason TEXT
) RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_fee NUMERIC;
    v_appointment public.appointments;
    v_active_bookings INT;
BEGIN
    -- 1. Input Validation: Length
    IF length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Validation Failed: Reason exceeds 500 characters.';
    END IF;

    -- 2. Input Validation: Date Bounds
    IF p_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Validation Failed: Cannot book appointments in the past.';
    END IF;
    IF p_date > CURRENT_DATE + interval '90 days' THEN
        RAISE EXCEPTION 'Validation Failed: Booking horizon exceeds 90 days.';
    END IF;

    -- 3. Extract patient_id securely from auth.uid()
    SELECT id INTO v_patient_id FROM public.patients WHERE user_id = (SELECT auth.uid());
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only registered patients can book appointments.';
    END IF;

    -- 4. Resource Abuse Protection: Max Active Bookings
    SELECT count(*) INTO v_active_bookings
    FROM public.appointments
    WHERE patient_id = v_patient_id AND status IN ('pending', 'confirmed');

    IF v_active_bookings >= 5 THEN
        RAISE EXCEPTION 'Rate Limit Exceeded: Maximum of 5 active bookings allowed per patient.';
    END IF;

    -- 5. Verify doctor and clinic exist and are ACTIVE AND VERIFIED
    IF NOT EXISTS (
        SELECT 1 FROM public.clinic_doctors
        WHERE doctor_id = p_doctor_id
          AND clinic_id = p_clinic_id
          AND active = true
          AND verification_state = 'verified'
    ) THEN
        RAISE EXCEPTION 'Validation Failed: Doctor is not currently active or verified at this clinic.';
    END IF;

    -- 6. Lookup authoritative fee securely
    SELECT consultation_fee INTO v_fee FROM public.doctors WHERE id = p_doctor_id;
    IF v_fee IS NULL THEN
        v_fee := 0.0;
    END IF;

    -- 7. Concurrency Protection
    -- Prevent exact same date/time/doctor overlapping
    IF EXISTS (
        SELECT 1 FROM public.appointments
        WHERE doctor_id = p_doctor_id
          AND date = p_date
          AND time = p_time
          AND status IN ('pending', 'confirmed', 'arrived')
    ) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;

    -- 8. Insert the appointment safely
    INSERT INTO public.appointments (
        patient_id, doctor_id, clinic_id, date, time, status, reason, fee
    ) VALUES (
        v_patient_id, p_doctor_id, p_clinic_id, p_date, p_time, 'pending', p_reason, v_fee
    ) RETURNING * INTO v_appointment;

    -- 9. Audit Log
    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('appointment_booked', (SELECT auth.uid()), v_appointment.id, jsonb_build_object('doctor_id', p_doctor_id));

    RETURN v_appointment;
END;
$$;

-- 4. Supabase Realtime Setup for Messages
-- Enable realtime publication for messages
BEGIN;
  -- Create publication if it doesn't exist
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
    END IF;
  END
  $$;

  -- Add table to publication if not already added
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
COMMIT;
