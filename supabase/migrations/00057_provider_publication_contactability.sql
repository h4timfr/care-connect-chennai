-- Separates provider verification, public publication, patient contact permission, and booking.
-- All existing rows start denied. Candidate research remains in candidate_* and is not eligible.

ALTER TABLE public.clinics
    ADD COLUMN IF NOT EXISTS clinic_verification_state text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS patient_contact_permission text NOT NULL DEFAULT 'not_granted',
    ADD COLUMN IF NOT EXISTS patient_contact_permission_at timestamptz,
    ADD COLUMN IF NOT EXISTS patient_contact_permission_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_verification_state_check') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_verification_state_check
            CHECK (clinic_verification_state IN ('pending', 'verified', 'rejected')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_contact_permission_check') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_contact_permission_check
            CHECK (patient_contact_permission IN ('not_granted', 'granted', 'revoked')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_publication_state_check') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_publication_state_check CHECK (
            (NOT is_published AND NOT booking_enabled)
            OR (clinic_verification_state = 'verified' AND NOT is_demo)
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_contact_permission_audit_check') THEN
        ALTER TABLE public.clinics ADD CONSTRAINT clinics_contact_permission_audit_check CHECK (
            patient_contact_permission <> 'granted'
            OR (patient_contact_permission_at IS NOT NULL AND patient_contact_permission_by IS NOT NULL)
        ) NOT VALID;
    END IF;
END $$;

-- SECURITY DEFINER helpers avoid relying on public SELECT RLS for the authorization decision.
CREATE OR REPLACE FUNCTION private.clinic_patient_contactable(p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.clinics c
        JOIN public.clinic_doctors cd ON cd.clinic_id = c.id
        JOIN public.doctors d ON d.id = cd.doctor_id
        WHERE c.id = p_clinic_id
          AND NOT c.is_demo
          AND c.clinic_verification_state = 'verified'
          AND c.is_published
          AND c.patient_contact_permission = 'granted'
          AND cd.active
          AND cd.verification_state = 'verified'
          AND NOT d.is_demo
    );
$$;
ALTER FUNCTION private.clinic_patient_contactable(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.clinic_patient_contactable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.clinic_patient_contactable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.patient_can_start_conversation(
    p_clinic_id uuid, p_patient_id uuid, p_doctor_id uuid, p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        p_patient_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = p_patient_id AND p.user_id = (SELECT auth.uid())
        )
        AND private.clinic_patient_contactable(p_clinic_id)
        AND (
            (p_doctor_id IS NULL AND EXISTS (
                SELECT 1 FROM public.clinic_doctors cd
                JOIN public.doctors d ON d.id = cd.doctor_id
                WHERE cd.clinic_id = p_clinic_id AND cd.active
                  AND cd.verification_state = 'verified' AND NOT d.is_demo
            ))
            OR (p_doctor_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.clinic_doctors cd
                JOIN public.doctors d ON d.id = cd.doctor_id
                WHERE cd.clinic_id = p_clinic_id AND cd.doctor_id = p_doctor_id
                  AND cd.active AND cd.verification_state = 'verified' AND NOT d.is_demo
            ))
        )
        AND (
            p_appointment_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.appointments a
                WHERE a.id = p_appointment_id AND a.patient_id = p_patient_id
                  AND a.clinic_id = p_clinic_id AND a.doctor_id = p_doctor_id
            )
        );
$$;
ALTER FUNCTION private.patient_can_start_conversation(uuid, uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.patient_can_start_conversation(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.patient_can_start_conversation(uuid, uuid, uuid, uuid) TO authenticated;

-- Preserve conversation SELECT/UPDATE policies. Only the patient INSERT boundary changes.
DROP POLICY IF EXISTS conv_insert_patient ON public.conversations;
CREATE POLICY conv_insert_patient ON public.conversations
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.patient_can_start_conversation(clinic_id, patient_id, doctor_id, appointment_id)));

-- Direct table writes cannot set or change trust/capability state, even if another permissive policy
-- is added later. The platform-admin RPC below is the only supported state transition.
CREATE OR REPLACE FUNCTION public.check_clinic_publication_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF (NEW.clinic_verification_state, NEW.is_published, NEW.patient_contact_permission,
            NEW.patient_contact_permission_at, NEW.patient_contact_permission_by, NEW.booking_enabled)
           IS DISTINCT FROM
           ('pending'::text, false, 'not_granted'::text, NULL::timestamptz, NULL::uuid, false)
           AND NOT (SELECT private.is_platform_admin()) THEN
            RAISE EXCEPTION 'Only CareConnect platform admins can create clinics with reviewed publication or patient-permission state.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.clinic_verification_state, NEW.is_published, NEW.patient_contact_permission,
            NEW.patient_contact_permission_at, NEW.patient_contact_permission_by, NEW.booking_enabled)
           IS DISTINCT FROM
           (OLD.clinic_verification_state, OLD.is_published, OLD.patient_contact_permission,
            OLD.patient_contact_permission_at, OLD.patient_contact_permission_by, OLD.booking_enabled)
           AND NOT (SELECT private.is_platform_admin()) THEN
            RAISE EXCEPTION 'Only CareConnect platform admins can change clinic publication or patient permissions.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    IF NEW.is_published OR NEW.booking_enabled THEN
        IF NEW.is_demo OR NEW.clinic_verification_state <> 'verified' THEN
            RAISE EXCEPTION 'A clinic must be real and verified before publication or booking is enabled.'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.patient_contact_permission = 'granted'
       AND (NEW.is_demo OR NEW.clinic_verification_state <> 'verified' OR NOT NEW.is_published) THEN
        RAISE EXCEPTION 'Patient contact permission requires a verified, published clinic.'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_clinic_publication_update() FROM PUBLIC, anon;
ALTER FUNCTION public.check_clinic_publication_update() OWNER TO postgres;
DROP TRIGGER IF EXISTS clinic_publication_update_guard ON public.clinics;
CREATE TRIGGER clinic_publication_update_guard
BEFORE INSERT OR UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.check_clinic_publication_update();

CREATE OR REPLACE FUNCTION public.admin_set_clinic_publication_state(
    p_clinic_id uuid,
    p_verification_state text,
    p_is_published boolean,
    p_contact_permission text,
    p_booking_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clinic public.clinics;
BEGIN
    IF NOT (SELECT private.is_platform_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: platform admins only.' USING ERRCODE = '42501';
    END IF;
    IF p_verification_state NOT IN ('pending', 'verified', 'rejected')
       OR p_contact_permission NOT IN ('not_granted', 'granted', 'revoked')
       OR p_is_published IS NULL OR p_booking_enabled IS NULL THEN
        RAISE EXCEPTION 'Validation Failed: invalid provider publication state.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_clinic FROM public.clinics WHERE id = p_clinic_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation Failed: clinic not found.' USING ERRCODE = 'P0001';
    END IF;
    IF v_clinic.is_demo THEN
        RAISE EXCEPTION 'Sample clinics cannot be published, contacted, or bookable.' USING ERRCODE = '23514';
    END IF;
    IF (p_is_published OR p_booking_enabled OR p_contact_permission = 'granted')
       AND p_verification_state <> 'verified' THEN
        RAISE EXCEPTION 'Verification is required before publication, contact, or booking.' USING ERRCODE = '23514';
    END IF;
    IF (p_contact_permission = 'granted' OR p_booking_enabled) AND NOT p_is_published THEN
        RAISE EXCEPTION 'Publication is required before patient contact or booking.' USING ERRCODE = '23514';
    END IF;
    IF (p_contact_permission = 'granted' OR p_booking_enabled) AND NOT EXISTS (
        SELECT 1 FROM public.clinic_doctors cd
        JOIN public.doctors d ON d.id = cd.doctor_id
        WHERE cd.clinic_id = p_clinic_id AND cd.active
          AND cd.verification_state = 'verified' AND NOT d.is_demo
    ) THEN
        RAISE EXCEPTION 'A real, verified, active doctor relationship is required.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.clinics
    SET clinic_verification_state = p_verification_state,
        is_published = p_is_published,
        patient_contact_permission = p_contact_permission,
        patient_contact_permission_at = CASE
            WHEN p_contact_permission = 'granted' THEN now()
            WHEN p_contact_permission IS DISTINCT FROM v_clinic.patient_contact_permission THEN now()
            ELSE v_clinic.patient_contact_permission_at END,
        patient_contact_permission_by = CASE
            WHEN p_contact_permission = 'granted' THEN (SELECT auth.uid())
            WHEN p_contact_permission IS DISTINCT FROM v_clinic.patient_contact_permission THEN (SELECT auth.uid())
            ELSE v_clinic.patient_contact_permission_by END,
        booking_enabled = p_booking_enabled
    WHERE id = p_clinic_id;

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('clinic_publication_state_changed', (SELECT auth.uid()), p_clinic_id,
            jsonb_build_object('verification_state', p_verification_state, 'is_published', p_is_published,
                               'patient_contact_permission', p_contact_permission,
                               'booking_enabled', p_booking_enabled));
END;
$$;
ALTER FUNCTION public.admin_set_clinic_publication_state(uuid, text, boolean, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_set_clinic_publication_state(uuid, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_clinic_publication_state(uuid, text, boolean, text, boolean) TO authenticated;

-- Existing booking and slot RPCs now require the independent booking capability. The legacy
-- two-argument get_doctor_slots overload is intentionally untouched; app booking uses the clinic-aware overload.
CREATE OR REPLACE FUNCTION public.get_doctor_slots(p_doctor_id uuid, p_clinic_id uuid, p_date date)
RETURNS TABLE(slot_time text, available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
    v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    v_schedule public.doctor_schedules;
    v_start_min integer;
    v_end_min integer;
    v_curr_min integer;
    v_time time;
    v_is_booked boolean;
BEGIN
    IF p_date < v_today OR p_date > v_today + 90 OR NOT EXISTS (
        SELECT 1 FROM public.clinics c
        JOIN public.clinic_doctors cd ON cd.clinic_id = c.id
        JOIN public.doctors d ON d.id = cd.doctor_id
        WHERE c.id = p_clinic_id AND cd.doctor_id = p_doctor_id
          AND NOT c.is_demo AND c.clinic_verification_state = 'verified'
          AND c.is_published AND c.booking_enabled AND NOT d.is_demo
          AND cd.active AND cd.verification_state = 'verified'
    ) THEN RETURN; END IF;

    SELECT * INTO v_schedule FROM public.doctor_schedules ds
    WHERE ds.doctor_id = p_doctor_id AND ds.clinic_id = p_clinic_id
      AND ds.day_of_week = EXTRACT(DOW FROM p_date)::integer;
    IF NOT FOUND OR v_schedule.slot_minutes IS NULL OR v_schedule.slot_minutes <= 0 THEN RETURN; END IF;

    v_start_min := (EXTRACT(HOUR FROM v_schedule.start_time) * 60 + EXTRACT(MINUTE FROM v_schedule.start_time))::integer;
    v_end_min := (EXTRACT(HOUR FROM v_schedule.end_time) * 60 + EXTRACT(MINUTE FROM v_schedule.end_time))::integer;
    v_curr_min := v_start_min;
    WHILE v_curr_min + v_schedule.slot_minutes <= v_end_min LOOP
        v_time := make_time(v_curr_min / 60, v_curr_min % 60, 0);
        SELECT EXISTS (SELECT 1 FROM public.appointments a WHERE a.doctor_id = p_doctor_id
            AND a.date = p_date AND a.time = v_time AND a.status IN ('pending', 'confirmed', 'arrived')) INTO v_is_booked;
        slot_time := to_char(v_time, 'HH24:MI:SS');
        available := NOT v_is_booked;
        IF p_date = v_today AND v_time <= v_now_ist::time THEN available := false; END IF;
        RETURN NEXT;
        v_curr_min := v_curr_min + v_schedule.slot_minutes;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_slots(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_slots(uuid, uuid, date) TO anon, authenticated;

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
    SELECT id INTO v_patient_id FROM public.patients WHERE user_id = (SELECT auth.uid());
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
REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, date, time without time zone, text) TO authenticated;
