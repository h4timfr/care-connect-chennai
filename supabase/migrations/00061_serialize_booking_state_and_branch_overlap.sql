-- Preserve booking invariants while provider state and branch schedules can change.
-- Forward-only correction: do not rewrite the deployed historical overlap trigger or 00060.

CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_slot_minutes integer;
    v_new_start timestamp;
    v_new_end timestamp;
    v_now_ist timestamp;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(NEW.doctor_id::text),
        pg_catalog.hashtext(NEW.date::text)
    );

    IF NEW.status NOT IN ('pending', 'confirmed', 'arrived') THEN
        RETURN NEW;
    END IF;

    -- Recheck the time window after the doctor/date advisory lock. A request
    -- can wait on this lock long enough for its earlier validation to go stale.
    v_now_ist := pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata';
    IF NEW.date < v_now_ist::date
       OR NEW.date > v_now_ist::date + 90
       OR (NEW.date = v_now_ist::date AND NEW.time <= v_now_ist::time) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;

    SELECT ds.slot_minutes INTO v_slot_minutes
    FROM public.doctor_schedules AS ds
    WHERE ds.doctor_id = NEW.doctor_id
      AND ds.clinic_id = NEW.clinic_id
      AND ds.day_of_week = EXTRACT(DOW FROM NEW.date)::integer;
    IF v_slot_minutes IS NULL THEN
        v_slot_minutes := 30;
    END IF;

    v_new_start := NEW.date + NEW.time;
    v_new_end := v_new_start + (v_slot_minutes || ' minutes')::interval;

    IF EXISTS (
        SELECT 1
        FROM public.appointments AS a
        WHERE a.doctor_id = NEW.doctor_id
          AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND a.status IN ('pending', 'confirmed', 'arrived')
          AND a.date = NEW.date
          AND (a.date + a.time) < v_new_end
          AND (
              a.date + a.time + (
                  COALESCE((
                      SELECT ds.slot_minutes
                      FROM public.doctor_schedules AS ds
                      WHERE ds.doctor_id = a.doctor_id
                        AND ds.clinic_id = a.clinic_id
                        AND ds.day_of_week = EXTRACT(DOW FROM a.date)::integer
                  ), 30) || ' minutes'
              )::interval
          ) > v_new_start
    ) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id uuid,
    p_clinic_id uuid,
    p_date date,
    p_time time without time zone,
    p_reason text
)
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
    v_now_ist timestamp;
    v_today date;
    v_schedule public.doctor_schedules;
    v_start_min integer;
    v_end_min integer;
    v_req_min integer;
BEGIN
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Booking requires READ COMMITTED transaction isolation.'
            USING ERRCODE = '0A000';
    END IF;
    v_now_ist := pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata';
    v_today := v_now_ist::date;
    IF p_doctor_id IS NULL OR p_clinic_id IS NULL OR p_date IS NULL OR p_time IS NULL THEN
        RAISE EXCEPTION 'Validation Failed: doctor, clinic, date and time are required.';
    END IF;
    IF pg_catalog.length(p_reason) > 500 THEN
        RAISE EXCEPTION 'Validation Failed: Reason exceeds 500 characters.';
    END IF;
    IF p_date < v_today THEN
        RAISE EXCEPTION 'Validation Failed: Cannot book appointments in the past.';
    END IF;
    IF p_date > v_today + 90 THEN
        RAISE EXCEPTION 'Validation Failed: Booking horizon exceeds 90 days.';
    END IF;

    -- auth.uid() is still the only accepted patient identity. Under the enforced
    -- READ COMMITTED isolation, the count statement after a lock wait sees commits.
    SELECT p.id INTO v_patient_id
    FROM public.patients AS p
    WHERE p.user_id = (SELECT auth.uid())
    FOR UPDATE;
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: only registered patients can book.' USING ERRCODE = '42501';
    END IF;

    SELECT pg_catalog.count(*) INTO v_active_bookings
    FROM public.appointments AS a
    WHERE a.patient_id = v_patient_id AND a.status IN ('pending', 'confirmed');
    IF v_active_bookings >= 5 THEN
        RAISE EXCEPTION 'Rate Limit Exceeded: Maximum of 5 active bookings allowed per patient.';
    END IF;

    -- Hold eligibility rows through the insert. The admin publication RPC and
    -- clinic/doctor-link updates must serialize before or after this booking.
    PERFORM 1
    FROM public.clinics AS c
    JOIN public.clinic_doctors AS cd ON cd.clinic_id = c.id
    JOIN public.doctors AS d ON d.id = cd.doctor_id
    WHERE c.id = p_clinic_id
      AND cd.doctor_id = p_doctor_id
      AND NOT c.is_demo
      AND c.clinic_verification_state = 'verified'
      AND c.is_published
      AND c.booking_enabled
      AND NOT d.is_demo
      AND cd.active
      AND cd.verification_state = 'verified'
    FOR SHARE OF c, cd, d;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation Failed: Doctor is not currently active or verified at this clinic.';
    END IF;

    -- Prevent schedule edits/deletion after this request validates its slot.
    SELECT ds.* INTO v_schedule
    FROM public.doctor_schedules AS ds
    WHERE ds.doctor_id = p_doctor_id
      AND ds.clinic_id = p_clinic_id
      AND ds.day_of_week = EXTRACT(DOW FROM p_date)::integer
    FOR SHARE;
    IF NOT FOUND OR v_schedule.slot_minutes IS NULL OR v_schedule.slot_minutes <= 0 THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;

    -- The patient and schedule locks above may have blocked. Validate against
    -- wall-clock India time after acquiring them, not the transaction start.
    v_now_ist := pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata';
    v_today := v_now_ist::date;
    IF p_date < v_today OR p_date > v_today + 90 THEN
        RAISE EXCEPTION 'Validation Failed: Appointment date is outside the booking window.';
    END IF;

    v_start_min := (EXTRACT(HOUR FROM v_schedule.start_time) * 60
        + EXTRACT(MINUTE FROM v_schedule.start_time))::integer;
    v_end_min := (EXTRACT(HOUR FROM v_schedule.end_time) * 60
        + EXTRACT(MINUTE FROM v_schedule.end_time))::integer;
    v_req_min := (EXTRACT(HOUR FROM p_time) * 60 + EXTRACT(MINUTE FROM p_time))::integer;
    IF EXTRACT(SECOND FROM p_time) <> 0
       OR v_req_min < v_start_min
       OR v_req_min + v_schedule.slot_minutes > v_end_min
       OR (v_req_min - v_start_min) % v_schedule.slot_minutes <> 0
       OR (p_date = v_today AND p_time <= v_now_ist::time) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is not available for this doctor.';
    END IF;

    SELECT d.consultation_fee INTO v_fee
    FROM public.doctors AS d
    WHERE d.id = p_doctor_id;
    IF EXISTS (
        SELECT 1 FROM public.appointments AS a
        WHERE a.doctor_id = p_doctor_id
          AND a.date = p_date
          AND a.time = p_time
          AND a.status IN ('pending', 'confirmed', 'arrived')
    ) THEN
        RAISE EXCEPTION 'Validation Failed: That time slot is no longer available.';
    END IF;

    INSERT INTO public.appointments
        (patient_id, doctor_id, clinic_id, date, time, status, reason, fee)
    VALUES
        (v_patient_id, p_doctor_id, p_clinic_id, p_date, p_time, 'pending', p_reason, COALESCE(v_fee, 0))
    RETURNING * INTO v_appointment;

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('appointment_booked', (SELECT auth.uid()), v_appointment.id,
            pg_catalog.jsonb_build_object('doctor_id', p_doctor_id));
    RETURN v_appointment;
END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text)
    TO authenticated;

-- A recurring schedule edit must not reinterpret the duration/bounds of an
-- already-booked future appointment. Operators can edit it after those visits
-- have elapsed or been cancelled.
CREATE OR REPLACE FUNCTION public.prevent_schedule_change_with_future_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.doctor_id IS NOT DISTINCT FROM NEW.doctor_id
           AND OLD.clinic_id IS NOT DISTINCT FROM NEW.clinic_id
           AND OLD.day_of_week IS NOT DISTINCT FROM NEW.day_of_week
           AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
           AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time
           AND OLD.slot_minutes IS NOT DISTINCT FROM NEW.slot_minutes THEN
            RETURN NEW;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.appointments AS a
        WHERE a.doctor_id = OLD.doctor_id
          AND a.clinic_id = OLD.clinic_id
          AND EXTRACT(DOW FROM a.date)::integer = OLD.day_of_week
          AND a.date >= v_today
          AND a.status IN ('pending', 'confirmed', 'arrived')
    ) THEN
        RAISE EXCEPTION 'Validation Failed: A schedule with future active appointments cannot be changed.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_schedule_change_with_future_bookings
BEFORE UPDATE OR DELETE ON public.doctor_schedules
FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_change_with_future_bookings();

REVOKE EXECUTE ON FUNCTION public.prevent_schedule_change_with_future_bookings()
    FROM PUBLIC, anon, authenticated;

-- Keep the patient's database cancellation rule aligned with the patient UI.
CREATE OR REPLACE FUNCTION public.check_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_patient boolean;
    v_is_staff boolean;
    v_uid uuid;
BEGIN
    v_uid := (SELECT auth.uid());
    v_is_patient := EXISTS (
        SELECT 1 FROM public.patients AS p
        WHERE p.id = NEW.patient_id AND p.user_id = v_uid
    );
    v_is_staff := EXISTS (
        SELECT 1 FROM public.clinic_memberships AS cm
        WHERE cm.clinic_id = NEW.clinic_id AND cm.user_id = v_uid AND cm.active = true
    );

    IF v_is_patient THEN
        IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
           OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
           OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
           OR NEW.fee IS DISTINCT FROM OLD.fee
           OR NEW.date IS DISTINCT FROM OLD.date
           OR NEW.time IS DISTINCT FROM OLD.time
           OR NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Patients cannot modify core appointment details';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status <> 'cancelled' THEN
                RAISE EXCEPTION 'Patients can only cancel appointments';
            ELSIF OLD.status NOT IN ('pending', 'confirmed') THEN
                RAISE EXCEPTION 'Patients may cancel only pending or confirmed appointments.';
            ELSIF OLD.date + OLD.time <= (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Kolkata') THEN
                RAISE EXCEPTION 'Patients cannot cancel appointments in the past.';
            END IF;
        END IF;
    ELSIF v_is_staff THEN
        IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
           OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
           OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
           OR NEW.fee IS DISTINCT FROM OLD.fee
           OR NEW.date IS DISTINCT FROM OLD.date
           OR NEW.time IS DISTINCT FROM OLD.time
           OR NEW.reason IS DISTINCT FROM OLD.reason THEN
            RAISE EXCEPTION 'Staff cannot mass-assign scheduling details';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.status = 'pending' AND NEW.status NOT IN ('confirmed', 'cancelled') THEN
                RAISE EXCEPTION 'Pending appointments can only be confirmed or cancelled';
            ELSIF OLD.status = 'confirmed' AND NEW.status NOT IN ('arrived', 'cancelled') THEN
                RAISE EXCEPTION 'Confirmed appointments can only be marked arrived or cancelled';
            ELSIF OLD.status = 'arrived' AND NEW.status <> 'completed' THEN
                RAISE EXCEPTION 'Arrived appointments can only be marked completed';
            ELSIF OLD.status IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Terminal states cannot be modified';
            END IF;
        END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES ('appointment_status_changed', v_uid, NEW.id,
                pg_catalog.jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_appointment_update() FROM PUBLIC, anon, authenticated;
