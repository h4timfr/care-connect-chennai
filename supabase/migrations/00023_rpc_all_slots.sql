CREATE OR REPLACE FUNCTION public.get_doctor_slots(p_doctor_id uuid, p_date date)
RETURNS TABLE (slot_time text, available boolean)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_schedule record;
    v_start_min integer;
    v_end_min integer;
    v_curr_min integer;
    v_time time;
    v_is_booked boolean;
    v_dow integer;
BEGIN
    -- Do not return past dates
    IF p_date < CURRENT_DATE THEN
        RETURN;
    END IF;

    v_dow := EXTRACT(DOW FROM p_date)::integer;

    SELECT * INTO v_schedule
    FROM public.doctor_schedules
    WHERE doctor_id = p_doctor_id
      AND day_of_week = v_dow
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_start_min := extract(hour from v_schedule.start_time) * 60 + extract(minute from v_schedule.start_time);
    v_end_min := extract(hour from v_schedule.end_time) * 60 + extract(minute from v_schedule.end_time);
    v_curr_min := v_start_min;

    WHILE (v_curr_min + v_schedule.slot_minutes) <= v_end_min LOOP
        v_time := make_time(v_curr_min / 60, v_curr_min % 60, 0);

        SELECT EXISTS (
            SELECT 1 FROM public.appointments
            WHERE doctor_id = p_doctor_id
              AND date = p_date
              AND time = v_time
              AND status IN ('pending', 'confirmed', 'arrived')
        ) INTO v_is_booked;

        slot_time := to_char(v_time, 'HH24:MI:SS');
        available := NOT v_is_booked;

        -- Optionally, if it's today and the time is past, we can mark it as unavailable
        IF p_date = CURRENT_DATE AND v_time <= CURRENT_TIME THEN
            available := false;
        END IF;

        RETURN NEXT;

        v_curr_min := v_curr_min + v_schedule.slot_minutes;
    END LOOP;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_slots(uuid, date) TO anon, authenticated;
