-- Doctor portal and doctor applications. LOCAL ONLY — not deployed. Apply after 00052, 00053 and
-- 00054. Idempotent: safe to re-run.
--
-- Identity model (unchanged auth): an account is a doctor only when a platform admin has linked it
-- to a doctors row (doctors.user_id), which happens solely through admin_review_doctor_application.
-- Visiting the doctor portal, applying, or being proposed by a clinic grants nothing. user_id can be
-- changed only by a platform admin (check_doctor_update, 00054 and below).
--
-- What a linked doctor may do:
--   * read their own doctors row (even before any clinic link is verified) and edit their profile
--     text, languages, qualifications, experience and fee — never their name, specialty, registration,
--     sample flag or ratings;
--   * read their own appointments through doctor_appointments(): appointment fields plus the
--     patient's NAME only (no access to patients rows at all);
--   * set opening hours, and read/reply to conversations about them, only at clinics where their
--     link is verified and active. Pending links grant nothing.

-- ---------------------------------------------------------------------------------------------
-- 1. Helpers (RLS-bypassing so policies never recurse)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.my_doctor_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT id FROM public.doctors WHERE user_id = (SELECT auth.uid());
$$;

-- Conversations about the signed-in doctor, at clinics where their link is verified and active.
CREATE OR REPLACE FUNCTION private.my_doctor_conversation_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.id
    FROM public.conversations c
    JOIN public.clinic_doctors cd ON cd.clinic_id = c.clinic_id AND cd.doctor_id = c.doctor_id
    WHERE c.doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = (SELECT auth.uid()))
      AND cd.verification_state = 'verified' AND cd.active;
$$;

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['private.my_doctor_ids()', 'private.my_doctor_conversation_ids()'] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2. The doctor's own record
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS doctors_read_self ON public.doctors;
CREATE POLICY doctors_read_self ON public.doctors
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Recreated for authenticated only, with an explicit WITH CHECK (00001 applied it to every role).
DROP POLICY IF EXISTS doctors_update_self ON public.doctors;
CREATE POLICY doctors_update_self ON public.doctors
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 00054's rules plus: a doctor's name and specialty are tied to their verified registration, so
-- only CareConnect changes them.
CREATE OR REPLACE FUNCTION public.check_doctor_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin boolean := (SELECT private.is_platform_admin());
    v_self boolean := OLD.user_id IS NOT NULL AND OLD.user_id = (SELECT auth.uid());
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify primary key';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT v_admin THEN
        RAISE EXCEPTION 'Cannot reassign doctor user_id';
    END IF;
    IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.review_count IS DISTINCT FROM OLD.review_count THEN
        RAISE EXCEPTION 'Cannot modify calculated rating fields';
    END IF;
    IF NOT v_admin THEN
        IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
           OR NEW.registration_note IS DISTINCT FROM OLD.registration_note
           OR NEW.name IS DISTINCT FROM OLD.name
           OR NEW.specialty_id IS DISTINCT FROM OLD.specialty_id THEN
            RAISE EXCEPTION 'Only CareConnect can change a doctor''s name, specialty, registration or listing status';
        END IF;
        IF NEW.consultation_fee IS DISTINCT FROM OLD.consultation_fee AND NOT v_self THEN
            RAISE EXCEPTION 'Only the doctor or CareConnect can change the consultation fee';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_doctor_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_doctor_update() FROM anon;

-- ---------------------------------------------------------------------------------------------
-- 3. Opening hours: the doctor, at clinics where their link is verified
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS schedules_write_doctor ON public.doctor_schedules;
CREATE POLICY schedules_write_doctor ON public.doctor_schedules
FOR ALL TO authenticated
USING (doctor_id IN (SELECT private.my_doctor_ids()))
WITH CHECK (
    doctor_id IN (SELECT private.my_doctor_ids())
    AND EXISTS (
        SELECT 1 FROM public.clinic_doctors cd
        WHERE cd.clinic_id = doctor_schedules.clinic_id
          AND cd.doctor_id = doctor_schedules.doctor_id
          AND cd.verification_state = 'verified' AND cd.active
    )
);

-- ---------------------------------------------------------------------------------------------
-- 4. Appointments and conversations, minimised to what a doctor needs
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctor_appointments()
RETURNS TABLE (
    id uuid,
    clinic_id uuid,
    clinic_name text,
    date date,
    "time" time,
    status public.appointment_status,
    reason text,
    patient_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT a.id, a.clinic_id, c.name, a.date, a.time, a.status, a.reason, p.full_name
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    JOIN public.patients p ON p.id = a.patient_id
    WHERE a.doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = (SELECT auth.uid()))
    ORDER BY a.date DESC, a.time DESC
    LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.doctor_conversations()
RETURNS TABLE (
    id uuid,
    clinic_id uuid,
    clinic_name text,
    patient_name text,
    created_at timestamptz,
    messages jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.id, c.clinic_id, cl.name, p.full_name, c.created_at,
        coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', m.id,
                'body', m.body,
                'created_at', m.created_at,
                'from', CASE
                    WHEN m.sender_id = (SELECT auth.uid()) THEN 'you'
                    WHEN m.sender_id = p.user_id THEN 'patient'
                    ELSE 'clinic' END
            ) ORDER BY m.created_at)
            FROM public.messages m WHERE m.conversation_id = c.id
        ), '[]'::jsonb)
    FROM public.conversations c
    JOIN public.clinics cl ON cl.id = c.clinic_id
    JOIN public.patients p ON p.id = c.patient_id
    WHERE c.id IN (SELECT private.my_doctor_conversation_ids())
    ORDER BY c.created_at DESC
    LIMIT 200;
$$;

-- A doctor replies in conversations about them at clinics where they are verified.
DROP POLICY IF EXISTS msg_insert_doctor ON public.messages;
CREATE POLICY msg_insert_doctor ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND conversation_id IN (SELECT private.my_doctor_conversation_ids())
);

-- ---------------------------------------------------------------------------------------------
-- 5. Doctor applications
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 3 AND 120),
    -- Keep in sync with SPECIALTIES in src/lib/format.ts.
    specialty_id TEXT NOT NULL CHECK (specialty_id IN ('general', 'pediatrics', 'orthopedics', 'cardiology',
        'dermatology', 'gynecology', 'neurology', 'ophthalmology', 'dentistry', 'ent')),
    qualifications TEXT NOT NULL CHECK (char_length(btrim(qualifications)) BETWEEN 2 AND 300),
    registration_council TEXT NOT NULL CHECK (char_length(btrim(registration_council)) BETWEEN 2 AND 80),
    registration_number TEXT NOT NULL CHECK (char_length(btrim(registration_number)) BETWEEN 2 AND 40),
    experience_years INTEGER NOT NULL CHECK (experience_years BETWEEN 0 AND 70),
    consultation_fee NUMERIC CHECK (consultation_fee BETWEEN 0 AND 100000),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    clinic_note TEXT CHECK (char_length(clinic_note) <= 200),
    contact_phone TEXT NOT NULL CHECK (contact_phone ~ '^[0-9+() -]{6,30}$'),
    contact_email TEXT NOT NULL CHECK (char_length(contact_email) <= 254 AND contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    message TEXT CHECK (char_length(message) <= 1000),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'withdrawn')),
    review_note TEXT CHECK (char_length(review_note) <= 1000),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctor_applications_applicant_idx ON public.doctor_applications (applicant_id);
CREATE INDEX IF NOT EXISTS doctor_applications_status_idx ON public.doctor_applications (status, created_at);

ALTER TABLE public.doctor_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.doctor_applications FROM PUBLIC;
REVOKE ALL ON public.doctor_applications FROM anon;
REVOKE ALL ON public.doctor_applications FROM authenticated;
GRANT SELECT ON public.doctor_applications TO authenticated;
GRANT INSERT (full_name, specialty_id, qualifications, registration_council, registration_number,
              experience_years, consultation_fee, clinic_id, clinic_note, contact_phone, contact_email, message)
    ON public.doctor_applications TO authenticated;

DROP POLICY IF EXISTS doctor_applications_insert_self ON public.doctor_applications;
CREATE POLICY doctor_applications_insert_self ON public.doctor_applications
FOR INSERT TO authenticated
WITH CHECK (applicant_id = (SELECT auth.uid()) AND status = 'submitted');

DROP POLICY IF EXISTS doctor_applications_read_self ON public.doctor_applications;
CREATE POLICY doctor_applications_read_self ON public.doctor_applications
FOR SELECT TO authenticated
USING (applicant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS doctor_applications_read_admin ON public.doctor_applications;
CREATE POLICY doctor_applications_read_admin ON public.doctor_applications
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- At most two open applications per account, and none once the account is already a doctor.
CREATE OR REPLACE FUNCTION public.check_doctor_application_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.doctors WHERE user_id = NEW.applicant_id) THEN
        RAISE EXCEPTION 'Validation Failed: this account is already linked to a doctor profile.'
            USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.doctor_applications
        WHERE applicant_id = NEW.applicant_id AND status = 'submitted') >= 2 THEN
        RAISE EXCEPTION 'Rate Limit Exceeded: at most 2 open doctor applications per account.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_doctor_application_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_doctor_application_insert() FROM anon;
REVOKE ALL ON FUNCTION public.check_doctor_application_insert() FROM authenticated;

DROP TRIGGER IF EXISTS tr_check_doctor_application_insert ON public.doctor_applications;
CREATE TRIGGER tr_check_doctor_application_insert
BEFORE INSERT ON public.doctor_applications
FOR EACH ROW EXECUTE FUNCTION public.check_doctor_application_insert();

CREATE OR REPLACE FUNCTION public.withdraw_doctor_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.doctor_applications
    SET status = 'withdrawn', updated_at = now()
    WHERE id = p_application_id AND applicant_id = (SELECT auth.uid()) AND status = 'submitted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation Failed: that application cannot be withdrawn.' USING ERRCODE = 'P0001';
    END IF;
END;
$$;

-- Platform admin: approve or reject. Approval links the applicant's account to a doctor profile —
-- a new one (not a sample, no verified link) or an existing unclaimed, non-sample one the admin
-- has matched — and, if the applicant named a clinic, adds a PENDING link there. Verification of
-- that link stays a separate admin step (Doctor verification).
CREATE OR REPLACE FUNCTION public.admin_review_doctor_application(
    p_application_id uuid, p_approve boolean, p_note text, p_existing_doctor_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_app public.doctor_applications;
    v_doctor_id uuid;
BEGIN
    IF NOT (SELECT private.is_platform_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: platform admins only.' USING ERRCODE = '42501';
    END IF;
    IF p_approve IS NULL THEN
        RAISE EXCEPTION 'Validation Failed: a decision is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_note) > 1000 THEN
        RAISE EXCEPTION 'Validation Failed: note exceeds 1000 characters.' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_app FROM public.doctor_applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND OR v_app.status <> 'submitted' THEN
        RAISE EXCEPTION 'Validation Failed: that application is not awaiting review.' USING ERRCODE = 'P0001';
    END IF;

    IF p_approve THEN
        IF EXISTS (SELECT 1 FROM public.doctors WHERE user_id = v_app.applicant_id) THEN
            RAISE EXCEPTION 'Validation Failed: this account is already linked to a doctor profile.' USING ERRCODE = 'P0001';
        END IF;
        IF p_existing_doctor_id IS NOT NULL THEN
            UPDATE public.doctors SET user_id = v_app.applicant_id
            WHERE id = p_existing_doctor_id AND user_id IS NULL AND NOT is_demo
            RETURNING id INTO v_doctor_id;
            IF v_doctor_id IS NULL THEN
                RAISE EXCEPTION 'Validation Failed: that doctor profile is a sample or already claimed.' USING ERRCODE = 'P0001';
            END IF;
        ELSE
            INSERT INTO public.doctors (user_id, name, specialty_id, experience_years, consultation_fee,
                                        qualifications, registration_note, is_demo)
            VALUES (v_app.applicant_id, btrim(v_app.full_name), v_app.specialty_id, v_app.experience_years,
                    coalesce(v_app.consultation_fee, 0),
                    ARRAY(SELECT btrim(q) FROM unnest(string_to_array(v_app.qualifications, ',')) q WHERE btrim(q) <> ''),
                    btrim(v_app.registration_council) || ' ' || btrim(v_app.registration_number), false)
            RETURNING id INTO v_doctor_id;
        END IF;

        IF v_app.clinic_id IS NOT NULL THEN
            INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
            VALUES (v_app.clinic_id, v_doctor_id, true, 'pending')
            ON CONFLICT (clinic_id, doctor_id) DO NOTHING;
        END IF;
    END IF;

    UPDATE public.doctor_applications
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        review_note = NULLIF(btrim(p_note), ''),
        reviewed_by = (SELECT auth.uid()),
        reviewed_at = now(),
        doctor_id = v_doctor_id,
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('doctor_application_reviewed', (SELECT auth.uid()), p_application_id,
            jsonb_build_object('approved', p_approve, 'doctor_id', v_doctor_id,
                               'linked_existing', p_existing_doctor_id IS NOT NULL));
    RETURN v_doctor_id;
END;
$$;

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.doctor_appointments()',
        'public.doctor_conversations()',
        'public.withdraw_doctor_application(uuid)',
        'public.admin_review_doctor_application(uuid, boolean, text, uuid)'
    ] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
END $$;
