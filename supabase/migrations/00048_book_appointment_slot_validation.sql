-- Forward correction to the LIVE book_appointment body (identical protections, plus IST dates and slot-window/alignment checks).
-- Signature, return type, SECURITY DEFINER, search_path and ACL are unchanged.
CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id uuid, p_clinic_id uuid, p_date date, p_time time without time zone, p_reason text)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_patient_id UUID;
    v_fee NUMERIC;
    v_appointment public.appointments;
    v_active_bookings INT;
    v_now_ist TIMESTAMP := (now() AT TIME ZONE 'Asia/Kolkata');
    v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    v_schedule public.doctor_schedules;
    v_start_min INT;
    v_end_min INT;
    v_req_min INT;
BEGIN
    -- 0. Required arguments (NULLs would otherwise slip through the comparisons below)
    IF p_doctor_id IS NULL OR p_clinic_id IS NULL OR p_date IS NULL OR p_time IS NULL THEN
        RAISE EXCEPTION 'Validation Failed: doctor, clinic, date and time are required.';
    END IF;

    -- 1. Input Validation: Length
    IF length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Validation Failed: Reason exceeds 500 characters.';
    END IF;

    -- 2. Input Validation: Date Bounds (Asia/Kolkata)
    IF p_date < v_today THEN
        RAISE EXCEPTION 'Validation Failed: Cannot book appointments in the past.';
    END IF;
    IF p_date > v_today + 90 THEN
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

    -- 5b. Slot validation against the clinic-specific schedule (same rules as get_doctor_slots)
    SELECT * INTO v_schedule
    FROM public.doctor_schedules ds
    WHERE ds.doctor_id = p_doctor_id
      AND ds.clinic_id = p_clinic_id
      AND ds.day_of_week = EXTRACT(DOW FROM p_date)::integer;

    IF NOT FOUND OR v_schedule.slot_minutes IS NULL OR v_schedule.slot_minutes <= 0 THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;

    v_start_min := (EXTRACT(HOUR FROM v_schedule.start_time) * 60 + EXTRACT(MINUTE FROM v_schedule.start_time))::int;
    v_end_min   := (EXTRACT(HOUR FROM v_schedule.end_time)   * 60 + EXTRACT(MINUTE FROM v_schedule.end_time))::int;
    v_req_min   := (EXTRACT(HOUR FROM p_time) * 60 + EXTRACT(MINUTE FROM p_time))::int;

    IF EXTRACT(SECOND FROM p_time) <> 0
       OR v_req_min < v_start_min
       OR v_req_min + v_schedule.slot_minutes > v_end_min
       OR (v_req_min - v_start_min) % v_schedule.slot_minutes <> 0 THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;

    IF p_date = v_today AND p_time <= v_now_ist::time THEN
        RAISE EXCEPTION 'Validation Failed: Cannot book appointments in the past.';
    END IF;

    -- 6. Lookup authoritative fee securely
    SELECT consultation_fee INTO v_fee FROM public.doctors WHERE id = p_doctor_id;
    IF v_fee IS NULL THEN
        v_fee := 0.0;
    END IF;

    -- 7. Concurrency Protection
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
$function$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) TO authenticated;
