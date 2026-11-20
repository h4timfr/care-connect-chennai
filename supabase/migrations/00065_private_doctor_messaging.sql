-- Private appointment threads are separate from clinic conversations and their Realtime publication.
CREATE TABLE private.doctor_message_threads (
    appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
    patient_user_id uuid NOT NULL,
    doctor_user_id uuid NOT NULL,
    CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX doctor_message_threads_patient ON private.doctor_message_threads (patient_user_id);
CREATE INDEX doctor_message_threads_doctor ON private.doctor_message_threads (doctor_user_id);

CREATE TABLE private.doctor_messages (
    appointment_id uuid NOT NULL REFERENCES private.doctor_message_threads(appointment_id) ON DELETE CASCADE,
    id uuid NOT NULL,
    sender text NOT NULL CHECK (sender IN ('patient', 'doctor')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND body ~ '[^[:space:]]'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (appointment_id, id)
);

ALTER TABLE private.doctor_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.doctor_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.doctor_message_threads, private.doctor_messages
    FROM PUBLIC, anon, authenticated, service_role;

-- Recheck the assignment and verified relationship on every call. A thread is bound to
-- the two original accounts, so relinking a provider account cannot transfer history.
CREATE VIEW private.doctor_message_appointments AS
SELECT a.id, a.date, a.clinic_id, c.name AS clinic_name,
       p.id AS patient_id, p.full_name AS patient_name, p.user_id AS patient_user_id,
       d.name AS doctor_name, d.user_id AS doctor_user_id,
       a.status IN ('pending', 'confirmed', 'arrived') AS can_send
FROM public.appointments a
JOIN public.patients p ON p.id = a.patient_id
JOIN public.doctors d ON d.id = a.doctor_id
JOIN public.clinics c ON c.id = a.clinic_id
JOIN public.clinic_doctors cd ON cd.clinic_id = a.clinic_id AND cd.doctor_id = a.doctor_id
WHERE cd.active AND cd.verification_state = 'verified'
  AND NOT c.is_demo AND NOT d.is_demo AND p.user_id <> d.user_id;

REVOKE ALL ON private.doctor_message_appointments FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.can_message_assigned_doctor(p_appointment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT FROM private.doctor_message_appointments a
        LEFT JOIN private.doctor_message_threads t ON t.appointment_id = a.id
        WHERE a.id = p_appointment_id AND a.patient_user_id = (SELECT auth.uid()) AND a.can_send
          AND (t.appointment_id IS NULL OR
               (t.patient_user_id, t.doctor_user_id) = (a.patient_user_id, a.doctor_user_id))
    );
$$;

CREATE FUNCTION private.open_doctor_message_thread(p_appointment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    appointment private.doctor_message_appointments;
BEGIN
    SELECT * INTO appointment FROM private.doctor_message_appointments a
    WHERE a.id = p_appointment_id AND a.patient_user_id = (SELECT auth.uid()) AND a.can_send
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor messaging is unavailable for this appointment.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO private.doctor_message_threads (appointment_id, patient_user_id, doctor_user_id)
    VALUES (appointment.id, appointment.patient_user_id, appointment.doctor_user_id)
    ON CONFLICT (appointment_id) DO NOTHING;

    IF NOT FOUND AND NOT EXISTS (
        SELECT FROM private.doctor_message_threads t WHERE t.appointment_id = appointment.id
          AND (t.patient_user_id, t.doctor_user_id) = (appointment.patient_user_id, appointment.doctor_user_id)
    ) THEN
        RAISE EXCEPTION 'Doctor messaging is unavailable for this appointment.' USING ERRCODE = '42501';
    END IF;
    RETURN appointment.id;
END;
$$;

CREATE FUNCTION private.send_doctor_message(p_appointment_id uuid, p_message_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    caller uuid := auth.uid();
    message_sender text;
    writable boolean;
BEGIN
    SELECT CASE WHEN a.patient_user_id = caller THEN 'patient' ELSE 'doctor' END, a.can_send
    INTO message_sender, writable
    FROM private.doctor_message_appointments a
    JOIN private.doctor_message_threads t ON t.appointment_id = a.id
      AND (t.patient_user_id, t.doctor_user_id) = (a.patient_user_id, a.doctor_user_id)
    WHERE a.id = p_appointment_id AND caller IN (t.patient_user_id, t.doctor_user_id)
    FOR SHARE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor conversation is unavailable.' USING ERRCODE = '42501';
    END IF;

    IF writable THEN
        INSERT INTO private.doctor_messages (appointment_id, id, sender, body)
        VALUES (p_appointment_id, p_message_id, message_sender, p_body)
        ON CONFLICT (appointment_id, id) DO NOTHING;
        IF FOUND THEN RETURN; END IF;
    END IF;

    -- Accept only an exact retry of the original write, including after the appointment closes.
    IF EXISTS (
        SELECT FROM private.doctor_messages m WHERE m.appointment_id = p_appointment_id
          AND m.id = p_message_id AND m.sender = message_sender AND m.body = p_body
    ) THEN RETURN; END IF;
    IF NOT writable THEN
        RAISE EXCEPTION 'Doctor conversation is closed to new messages.' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Message identifier already used.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION private.doctor_message_inbox(p_as_doctor boolean)
RETURNS TABLE (
    appointment_id uuid, appointment_date date, clinic_id uuid, clinic_name text, patient_id uuid,
    patient_name text, doctor_name text, can_send boolean, messages jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT a.id, a.date, a.clinic_id, a.clinic_name, a.patient_id, a.patient_name, a.doctor_name, a.can_send,
           coalesce((
               SELECT jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender,
                   'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at, m.id)
               FROM private.doctor_messages m WHERE m.appointment_id = t.appointment_id
           ), '[]'::jsonb)
    FROM private.doctor_message_threads t
    JOIN private.doctor_message_appointments a ON a.id = t.appointment_id
      AND (a.patient_user_id, a.doctor_user_id) = (t.patient_user_id, t.doctor_user_id)
    WHERE (p_as_doctor AND t.doctor_user_id = (SELECT auth.uid()))
       OR (NOT p_as_doctor AND t.patient_user_id = (SELECT auth.uid()));
$$;

CREATE FUNCTION public.can_message_assigned_doctor(p_appointment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.can_message_assigned_doctor(p_appointment_id);
$$;

CREATE FUNCTION public.open_doctor_message_thread(p_appointment_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.open_doctor_message_thread(p_appointment_id);
$$;

CREATE FUNCTION public.send_doctor_message(p_appointment_id uuid, p_message_id uuid, p_body text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.send_doctor_message(p_appointment_id, p_message_id, p_body);
$$;

CREATE FUNCTION public.doctor_message_inbox(p_as_doctor boolean)
RETURNS TABLE (
    appointment_id uuid, appointment_date date, clinic_id uuid, clinic_name text, patient_id uuid,
    patient_name text, doctor_name text, can_send boolean, messages jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT * FROM private.doctor_message_inbox(p_as_doctor);
$$;

DO $$
DECLARE
    target_schema text;
    signature text;
BEGIN
    FOREACH target_schema IN ARRAY ARRAY['public', 'private'] LOOP
        FOREACH signature IN ARRAY ARRAY['can_message_assigned_doctor(uuid)',
            'open_doctor_message_thread(uuid)', 'send_doctor_message(uuid,uuid,text)',
            'doctor_message_inbox(boolean)'] LOOP
            EXECUTE format('ALTER FUNCTION %I.%s OWNER TO postgres', target_schema, signature);
            EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC, anon, authenticated, service_role',
                target_schema, signature);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%s TO authenticated', target_schema, signature);
        END LOOP;
    END LOOP;
END;
$$;
