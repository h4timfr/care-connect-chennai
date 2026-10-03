-- 1. Rewrite get_doctor_availability to match the actual doctor_schedules schema
CREATE OR REPLACE FUNCTION public.get_doctor_availability(p_doctor_id uuid, p_date date)
RETURNS TABLE (available_time text)
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
    -- Do not return availability for past dates
    IF p_date < CURRENT_DATE THEN
        RETURN;
    END IF;

    -- Extract day of week (0=Sunday, 6=Saturday)
    v_dow := EXTRACT(DOW FROM p_date)::integer;

    -- Get schedule for the specific day
    SELECT * INTO v_schedule
    FROM public.doctor_schedules
    WHERE doctor_id = p_doctor_id
      AND day_of_week = v_dow
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Convert times to minutes for iteration
    v_start_min := extract(hour from v_schedule.start_time) * 60 + extract(minute from v_schedule.start_time);
    v_end_min := extract(hour from v_schedule.end_time) * 60 + extract(minute from v_schedule.end_time);

    v_curr_min := v_start_min;

    WHILE (v_curr_min + v_schedule.slot_minutes) <= v_end_min LOOP
        v_time := make_time(v_curr_min / 60, v_curr_min % 60, 0);

        -- Check if booked
        SELECT EXISTS (
            SELECT 1 FROM public.appointments
            WHERE doctor_id = p_doctor_id
              AND date = p_date
              AND time = v_time
              AND status IN ('pending', 'confirmed', 'arrived')
        ) INTO v_is_booked;

        IF NOT v_is_booked THEN
            available_time := to_char(v_time, 'HH24:MI:SS');
            RETURN NEXT;
        END IF;

        v_curr_min := v_curr_min + v_schedule.slot_minutes;
    END LOOP;

    RETURN;
END;
$$;

-- Ensure execution is restricted to authenticated users
REVOKE EXECUTE ON FUNCTION public.get_doctor_availability(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_doctor_availability(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid, date) TO authenticated;
