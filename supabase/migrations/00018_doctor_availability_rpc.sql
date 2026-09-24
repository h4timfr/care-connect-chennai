CREATE OR REPLACE FUNCTION public.get_doctor_availability(p_doctor_id uuid, p_date date)
RETURNS TABLE (available_time text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_schedule record;
    v_start_min integer;
    v_end_min integer;
    v_bstart_min integer;
    v_bend_min integer;
    v_curr_min integer;
    v_time time;
    v_is_booked boolean;
BEGIN
    -- Get schedule
    SELECT * INTO v_schedule FROM public.doctor_schedules WHERE doctor_id = p_doctor_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Check unavailable dates
    IF p_date::text = ANY(v_schedule.unavailable_dates) THEN
        RETURN;
    END IF;

    -- Check working days
    IF NOT (to_char(p_date, 'Dy') = ANY(v_schedule.working_days)) THEN
        RETURN;
    END IF;

    -- Convert times to minutes for iteration
    v_start_min := extract(hour from v_schedule.working_hours_start) * 60 + extract(minute from v_schedule.working_hours_start);
    v_end_min := extract(hour from v_schedule.working_hours_end) * 60 + extract(minute from v_schedule.working_hours_end);
    v_bstart_min := extract(hour from v_schedule.break_period_start) * 60 + extract(minute from v_schedule.break_period_start);
    v_bend_min := extract(hour from v_schedule.break_period_end) * 60 + extract(minute from v_schedule.break_period_end);

    v_curr_min := v_start_min;

    WHILE v_curr_min < v_end_min LOOP
        IF v_curr_min >= v_bstart_min AND v_curr_min < v_bend_min THEN
            v_curr_min := v_curr_min + v_schedule.slot_minutes;
            CONTINUE;
        END IF;

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
END;
$$;
