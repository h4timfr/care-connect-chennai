-- A clinic administrator requests an existing profile by its UUID. The linked
-- doctor must consent before a pending relationship enters the existing review queue.
CREATE TABLE private.doctor_clinic_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    doctor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'accepted', 'declined', 'withdrawn')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.doctor_clinic_link_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.doctor_clinic_link_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX doctor_clinic_link_requests_open_pair
    ON private.doctor_clinic_link_requests (clinic_id, doctor_id, doctor_user_id)
    WHERE status IN ('requested', 'accepted');
CREATE INDEX doctor_clinic_link_requests_clinic
    ON private.doctor_clinic_link_requests (clinic_id);
CREATE INDEX doctor_clinic_link_requests_doctor_account
    ON private.doctor_clinic_link_requests (doctor_user_id);

CREATE FUNCTION private.request_doctor_clinic_link(p_clinic_id uuid, p_doctor_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_doctor_user uuid;
    v_request uuid;
BEGIN
    PERFORM 1 FROM public.clinic_memberships AS m
    JOIN public.clinics AS c ON c.id = m.clinic_id
    WHERE m.clinic_id = p_clinic_id AND m.user_id = v_user
      AND m.role = 'clinic_admin' AND m.active AND NOT c.is_demo
    FOR SHARE OF m, c;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An active clinic administrator is required.' USING ERRCODE = '42501';
    END IF;

    SELECT d.user_id INTO v_doctor_user FROM public.doctors AS d
    WHERE d.id = p_doctor_id AND NOT d.is_demo AND d.user_id IS NOT NULL
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The doctor profile is unavailable for linking.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.clinic_doctors AS cd
               WHERE cd.clinic_id = p_clinic_id AND cd.doctor_id = p_doctor_id) THEN
        RAISE EXCEPTION 'This relationship already exists.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO private.doctor_clinic_link_requests (clinic_id, doctor_id, doctor_user_id, requested_by)
    VALUES (p_clinic_id, p_doctor_id, v_doctor_user, v_user)
    -- A stale request for a former account cannot block the current doctor account.
    ON CONFLICT (clinic_id, doctor_id, doctor_user_id)
        WHERE status IN ('requested', 'accepted') DO NOTHING
    RETURNING id INTO v_request;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This relationship has already been requested.' USING ERRCODE = '23505';
    END IF;
    RETURN v_request;
END;
$$;

CREATE FUNCTION private.respond_doctor_clinic_link(p_request_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_request private.doctor_clinic_link_requests;
BEGIN
    IF p_action IS NULL OR p_action NOT IN ('accept', 'decline', 'withdraw') THEN
        RAISE EXCEPTION 'Invalid relationship action.' USING ERRCODE = '22023';
    END IF;

    SELECT r.* INTO v_request FROM private.doctor_clinic_link_requests AS r
    WHERE r.id = p_request_id AND (
        (p_action <> 'withdraw' AND r.doctor_user_id = v_user)
        OR (p_action = 'withdraw' AND r.clinic_id IN (SELECT private.user_admin_clinic_ids()))
    )
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This relationship request is unavailable.' USING ERRCODE = '42501';
    END IF;

    IF p_action <> 'withdraw' THEN
        PERFORM 1 FROM public.doctors AS d
        WHERE d.id = v_request.doctor_id AND d.user_id = v_user AND NOT d.is_demo
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This relationship request is unavailable.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_request.status <> 'requested' THEN
        RAISE EXCEPTION 'This relationship request was already answered.' USING ERRCODE = '55000';
    END IF;

    IF p_action IN ('accept', 'withdraw') THEN
        -- Recheck authority under a row lock so concurrent membership revocation
        -- cannot leave an approval based on a stale clinic administrator.
        PERFORM 1 FROM public.clinic_memberships AS m
        JOIN public.clinics AS c ON c.id = m.clinic_id
        WHERE m.clinic_id = v_request.clinic_id
          AND m.user_id = CASE WHEN p_action = 'accept' THEN v_request.requested_by ELSE v_user END
          AND m.role = 'clinic_admin' AND m.active AND NOT c.is_demo
        FOR SHARE OF m, c;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'An active clinic administrator is required.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_action = 'accept' THEN
        INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
        VALUES (v_request.clinic_id, v_request.doctor_id, true, 'pending')
        ON CONFLICT (clinic_id, doctor_id) DO NOTHING;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This relationship already exists.' USING ERRCODE = '23505';
        END IF;
    END IF;

    UPDATE private.doctor_clinic_link_requests
    SET status = CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined'
                 ELSE 'withdrawn' END
    WHERE id = v_request.id;
END;
$$;

CREATE FUNCTION private.list_doctor_clinic_link_requests(p_clinic_id uuid)
RETURNS TABLE (id uuid, clinic_name text, doctor_id uuid, doctor_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT latest.id, latest.clinic_name, latest.doctor_id, latest.doctor_name, latest.status
    FROM (
        SELECT DISTINCT ON (r.clinic_id, r.doctor_id)
            r.id, c.name AS clinic_name, r.doctor_id, r.created_at,
            CASE WHEN p_clinic_id IS NULL OR r.status = 'accepted' THEN d.name END AS doctor_name,
            CASE
                WHEN r.status <> 'accepted' THEN r.status
                WHEN cd.verification_state = 'rejected' THEN 'rejected'
                WHEN cd.active AND cd.verification_state = 'verified' THEN 'verified'
                WHEN cd.active AND cd.verification_state = 'pending' THEN 'accepted'
                ELSE 'inactive'
            END AS status
        FROM private.doctor_clinic_link_requests AS r
        JOIN public.clinics AS c ON c.id = r.clinic_id AND NOT c.is_demo
        JOIN public.doctors AS d ON d.id = r.doctor_id AND NOT d.is_demo AND d.user_id = r.doctor_user_id
        LEFT JOIN public.clinic_doctors AS cd ON cd.clinic_id = r.clinic_id AND cd.doctor_id = r.doctor_id
        WHERE (p_clinic_id IS NULL AND r.doctor_user_id = (SELECT auth.uid()))
           OR (p_clinic_id = r.clinic_id AND p_clinic_id IN (SELECT private.user_admin_clinic_ids()))
        ORDER BY r.clinic_id, r.doctor_id, r.created_at DESC, r.id
    ) AS latest
    ORDER BY (latest.status = 'requested') DESC, latest.created_at DESC, latest.id;
$$;

-- PostgREST exposes these invoker wrappers only. The implementations enforce the
-- same caller checks if invoked directly with an authenticated database role.
CREATE FUNCTION public.request_doctor_clinic_link(p_clinic_id uuid, p_doctor_id uuid)
RETURNS uuid
LANGUAGE sql SET search_path = ''
AS $$ SELECT private.request_doctor_clinic_link(p_clinic_id, p_doctor_id); $$;

CREATE FUNCTION public.respond_doctor_clinic_link(p_request_id uuid, p_action text)
RETURNS void
LANGUAGE sql SET search_path = ''
AS $$ SELECT private.respond_doctor_clinic_link(p_request_id, p_action); $$;

CREATE FUNCTION public.list_doctor_clinic_link_requests(p_clinic_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, clinic_name text, doctor_id uuid, doctor_name text, status text)
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT * FROM private.list_doctor_clinic_link_requests(p_clinic_id); $$;

DO $$
DECLARE
    v_schema text;
    v_signature text;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['private', 'public'] LOOP
        FOREACH v_signature IN ARRAY ARRAY[
            'request_doctor_clinic_link(uuid, uuid)',
            'respond_doctor_clinic_link(uuid, text)',
            'list_doctor_clinic_link_requests(uuid)'
        ] LOOP
            EXECUTE format('ALTER FUNCTION %I.%s OWNER TO postgres', v_schema, v_signature);
            EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC, anon, authenticated, service_role',
                           v_schema, v_signature);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%s TO authenticated', v_schema, v_signature);
        END LOOP;
    END LOOP;
END;
$$;
