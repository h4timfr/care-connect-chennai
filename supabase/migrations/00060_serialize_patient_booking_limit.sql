-- Serialize bookings per patient before reading the active-booking count.
-- The lock is held until the caller's transaction commits or rolls back, so a
-- second request counts the first request's committed appointment.
CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id uuid, p_clinic_id uuid, p_date date, p_time time without time zone, p_reason text)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id uuid;
    v_fee numeric;
    v_appointment public.appointments;
    v_active_bookings integer;
    v_now_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
    v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    v_schedule public.doctor_schedules;
    v_start_min integer;
    v_end_min integer;
    v_req_min integer;
BEGIN
    IF p_doctor_id IS NULL OR p_clinic_id IS NULL OR p_date IS NULL OR p_time IS NULL THEN
        RAISE EXCEPTION 'Validation Failed: doctor, clinic, date and time are required.';
    END IF;
    IF length(p_reason) > 500 THEN RAISE EXCEPTION 'Validation Failed: Reason exceeds 500 characters.'; END IF;
    IF p_date < v_today THEN RAISE EXCEPTION 'Validation Failed: Cannot book appointments in the past.'; END IF;
    IF p_date > v_today + 90 THEN RAISE EXCEPTION 'Validation Failed: Booking horizon exceeds 90 days.'; END IF;

    -- auth.uid() still selects the only patient identity accepted by this RPC.
    -- Lock that patient's row before counting so concurrent requests for
    -- different doctors or slots cannot both consume the final booking places.
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE user_id = (SELECT auth.uid())
    FOR UPDATE;
    IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: only registered patients can book.' USING ERRCODE = '42501'; END IF;

    SELECT count(*) INTO v_active_bookings FROM public.appointments
    WHERE patient_id = v_patient_id AND status IN ('pending', 'confirmed');
    IF v_active_bookings >= 5 THEN RAISE EXCEPTION 'Rate Limit Exceeded: Maximum of 5 active bookings allowed per patient.'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.clinics c
        JOIN public.clinic_doctors cd ON cd.clinic_id = c.id
        JOIN public.doctors d ON d.id = cd.doctor_id
        WHERE c.id = p_clinic_id AND cd.doctor_id = p_doctor_id
          AND NOT c.is_demo AND c.clinic_verification_state = 'verified'
          AND c.is_published AND c.booking_enabled AND NOT d.is_demo
          AND cd.active AND cd.verification_state = 'verified'
    ) THEN RAISE EXCEPTION 'Validation Failed: Doctor is not currently active or verified at this clinic.'; END IF;

    SELECT * INTO v_schedule FROM public.doctor_schedules ds WHERE ds.doctor_id = p_doctor_id
      AND ds.clinic_id = p_clinic_id AND ds.day_of_week = EXTRACT(DOW FROM p_date)::integer;
    IF NOT FOUND OR v_schedule.slot_minutes IS NULL OR v_schedule.slot_minutes <= 0 THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;
    v_start_min := (EXTRACT(HOUR FROM v_schedule.start_time) * 60 + EXTRACT(MINUTE FROM v_schedule.start_time))::integer;
    v_end_min := (EXTRACT(HOUR FROM v_schedule.end_time) * 60 + EXTRACT(MINUTE FROM v_schedule.end_time))::integer;
    v_req_min := (EXTRACT(HOUR FROM p_time) * 60 + EXTRACT(MINUTE FROM p_time))::integer;
    IF EXTRACT(SECOND FROM p_time) <> 0 OR v_req_min < v_start_min
       OR v_req_min + v_schedule.slot_minutes > v_end_min
       OR (v_req_min - v_start_min) % v_schedule.slot_minutes <> 0
       OR (p_date = v_today AND p_time <= v_now_ist::time) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;
    SELECT consultation_fee INTO v_fee FROM public.doctors WHERE id = p_doctor_id;
    IF EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id = p_doctor_id AND date = p_date
               AND time = p_time AND status IN ('pending', 'confirmed', 'arrived')) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;
    INSERT INTO public.appointments (patient_id, doctor_id, clinic_id, date, time, status, reason, fee)
    VALUES (v_patient_id, p_doctor_id, p_clinic_id, p_date, p_time, 'pending', p_reason, coalesce(v_fee, 0))
    RETURNING * INTO v_appointment;
    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('appointment_booked', (SELECT auth.uid()), v_appointment.id, jsonb_build_object('doctor_id', p_doctor_id));
    RETURN v_appointment;
END;
$$;

-- Preserve the existing least-privilege RPC boundary.
REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) TO authenticated;
