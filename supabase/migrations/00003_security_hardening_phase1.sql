-- 1. ELIMINATE SIGNUP ROLE ESCALATION
-- Recreate the trigger function to forcefully ignore client metadata for role.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- We explicitly hardcode 'patient' here. 
  -- No user_metadata can override this during public signup.
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    new.id, 
    new.email, 
    'patient'::public.user_role,
    new.created_at, 
    new.updated_at
  );
  RETURN new;
END;
$$;

-- 2. HARDEN BOOK_APPOINTMENT RPC
-- We replace the function, adding SECURITY DEFINER, search_path, explicit schemas, 
-- and rigorous input validation.
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
    SELECT id INTO v_patient_id FROM public.patients WHERE user_id = auth.uid();
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

    -- 5. Verify doctor and clinic exist and are active
    IF NOT EXISTS (
        SELECT 1 FROM public.clinic_doctors 
        WHERE doctor_id = p_doctor_id AND clinic_id = p_clinic_id
    ) THEN
        RAISE EXCEPTION 'Validation Failed: Doctor does not operate at this clinic.';
    END IF;

    -- 6. Lookup authoritative fee securely
    SELECT consultation_fee INTO v_fee FROM public.doctors WHERE id = p_doctor_id;
    IF v_fee IS NULL THEN
        v_fee := 0.0;
    END IF;

    -- 7. Insert the appointment safely
    INSERT INTO public.appointments (
        patient_id, doctor_id, clinic_id, date, time, status, reason, fee
    ) VALUES (
        v_patient_id, p_doctor_id, p_clinic_id, p_date, p_time, 'pending', p_reason, v_fee
    ) RETURNING * INTO v_appointment;

    -- 8. Audit Log
    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('appointment_booked', auth.uid(), v_appointment.id, jsonb_build_object('doctor_id', p_doctor_id));

    RETURN v_appointment;
END;
$$;

-- 3. DATABASE PRIVILEGES / FUNCTION EXECUTE REVIEW

-- Revoke all execute privileges by default on the RPC
REVOKE EXECUTE ON FUNCTION public.book_appointment(UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.book_appointment(UUID, UUID, DATE, TIME, TEXT) FROM anon;

-- Grant only to authenticated users
GRANT EXECUTE ON FUNCTION public.book_appointment(UUID, UUID, DATE, TIME, TEXT) TO authenticated;

-- Ensure triggers have no public execute access
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_patient() FROM PUBLIC;

-- Revoke all table access from anon where it shouldn't exist
REVOKE ALL ON public.audit_logs FROM PUBLIC;
REVOKE ALL ON public.audit_logs FROM anon;
-- Grant audit logs only to authenticated if RLS is enabled (platform_admin will be handled by RLS)
GRANT SELECT ON public.audit_logs TO authenticated;

REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE ALL ON public.messages FROM anon;
GRANT SELECT, INSERT ON public.messages TO authenticated;

REVOKE ALL ON public.conversations FROM PUBLIC;
REVOKE ALL ON public.conversations FROM anon;
GRANT SELECT, INSERT ON public.conversations TO authenticated;

REVOKE ALL ON public.appointments FROM PUBLIC;
REVOKE ALL ON public.appointments FROM anon;
GRANT SELECT, UPDATE ON public.appointments TO authenticated; -- Insert is handled via RPC

REVOKE ALL ON public.patients FROM PUBLIC;
REVOKE ALL ON public.patients FROM anon;
GRANT SELECT, UPDATE ON public.patients TO authenticated;

-- Users table is only for authenticated access
REVOKE ALL ON public.users FROM PUBLIC;
REVOKE ALL ON public.users FROM anon;
GRANT SELECT, UPDATE ON public.users TO authenticated;
