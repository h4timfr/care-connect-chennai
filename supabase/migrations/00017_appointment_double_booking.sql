-- 1. Prevent Overlapping Appointments
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS TRIGGER AS $$
DECLARE
    v_slot_minutes INTEGER;
    v_new_start TIMESTAMP;
    v_new_end TIMESTAMP;
BEGIN
    -- Obtain transaction-level advisory lock to serialize inserts/updates for this doctor & date.
    -- This prevents race conditions where two concurrent transactions both see an empty slot and insert.
    PERFORM pg_advisory_xact_lock(
        hashtext(NEW.doctor_id::text),
        hashtext(NEW.date::text)
    );

    -- Only check active appointments
    IF NEW.status NOT IN ('pending', 'confirmed', 'arrived') THEN
        RETURN NEW;
    END IF;

    -- Get doctor's slot minutes from schedule, default to 30 if not found
    SELECT slot_minutes INTO v_slot_minutes
    FROM public.doctor_schedules
    WHERE doctor_id = NEW.doctor_id
      AND day_of_week = EXTRACT(DOW FROM NEW.date)::INTEGER
    LIMIT 1;
    
    IF v_slot_minutes IS NULL THEN
        v_slot_minutes := 30;
    END IF;

    v_new_start := NEW.date + NEW.time;
    v_new_end := v_new_start + (v_slot_minutes || ' minutes')::interval;

    IF EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.doctor_id = NEW.doctor_id
          AND a.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND a.status IN ('pending', 'confirmed', 'arrived')
          AND a.date = NEW.date
          AND (a.date + a.time) < v_new_end
          AND (a.date + a.time + (
              COALESCE((
                  SELECT slot_minutes FROM public.doctor_schedules s
                  WHERE s.doctor_id = a.doctor_id
                    AND s.day_of_week = EXTRACT(DOW FROM a.date)::INTEGER
                  LIMIT 1
              ), 30) || ' minutes'
          )::interval) > v_new_start
    ) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_check_appointment_overlap ON public.appointments;
CREATE TRIGGER trg_check_appointment_overlap
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.check_appointment_overlap();
