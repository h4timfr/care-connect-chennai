-- ADDITIVE: new clinic-aware slots RPC. The legacy get_doctor_slots(uuid, date) is intentionally left in place.
CREATE OR REPLACE FUNCTION public.get_doctor_slots(p_doctor_id uuid, p_clinic_id uuid, p_date date)
RETURNS TABLE(slot_time text, available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now_ist   timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
    v_today     date      := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    v_schedule  public.doctor_schedules;
    v_start_min integer;
    v_end_min   integer;
    v_curr_min  integer;
    v_time      time;
    v_is_booked boolean;
BEGIN
    -- Same window the booking RPC enforces
    IF p_date < v_today OR p_date > v_today + 90 THEN
        RETURN;
    END IF;

    -- The doctor must be active AND verified at THIS clinic
    IF NOT EXISTS (
        SELECT 1 FROM public.clinic_doctors cd
        WHERE cd.doctor_id = p_doctor_id
          AND cd.clinic_id = p_clinic_id
          AND cd.active = true
          AND cd.verification_state = 'verified'
    ) THEN
        RETURN;
    END IF;

    -- Clinic-specific schedule for that weekday (UNIQUE (doctor_id, clinic_id, day_of_week))
    SELECT * INTO v_schedule
    FROM public.doctor_schedules ds
    WHERE ds.doctor_id = p_doctor_id
      AND ds.clinic_id = p_clinic_id
      AND ds.day_of_week = EXTRACT(DOW FROM p_date)::integer;

    IF NOT FOUND OR v_schedule.slot_minutes IS NULL OR v_schedule.slot_minutes <= 0 THEN
        RETURN;
    END IF;

    v_start_min := (EXTRACT(HOUR FROM v_schedule.start_time) * 60 + EXTRACT(MINUTE FROM v_schedule.start_time))::integer;
    v_end_min   := (EXTRACT(HOUR FROM v_schedule.end_time)   * 60 + EXTRACT(MINUTE FROM v_schedule.end_time))::integer;
    v_curr_min  := v_start_min;

    WHILE v_curr_min + v_schedule.slot_minutes <= v_end_min LOOP
        v_time := make_time(v_curr_min / 60, v_curr_min % 60, 0);

        -- Doctor-level check, matching idx_appointments_no_double_booking (doctor_id, date, time)
        SELECT EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.doctor_id = p_doctor_id
              AND a.date = p_date
              AND a.time = v_time
              AND a.status IN ('pending', 'confirmed', 'arrived')
        ) INTO v_is_booked;

        slot_time := to_char(v_time, 'HH24:MI:SS');
        available := NOT v_is_booked;

        IF p_date = v_today AND v_time <= v_now_ist::time THEN
            available := false;
        END IF;

        RETURN NEXT;
        v_curr_min := v_curr_min + v_schedule.slot_minutes;
    END LOOP;
END;
$$;

-- Explicit ACL. Slot availability is shown on the public doctor profile before login, so anon is intentionally included.
-- The function exposes only slot_time / available, and only for an active + verified doctor/clinic pair.
REVOKE ALL ON FUNCTION public.get_doctor_slots(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_slots(uuid, uuid, date) TO anon, authenticated;
