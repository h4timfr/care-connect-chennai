-- Provider onboarding, platform administration, and the fix for the doctor-takeover finding.
-- LOCAL ONLY — not deployed. Apply after 00052 (private.is_platform_admin, recreated below so this
-- file is self-contained) and 00053. Idempotent: safe to re-run.
--
-- Security finding closed here (release audit, 2026-10-05): any active clinic member could insert a
-- clinic_doctors link to ANY doctor (forced to 'pending') and, through doctors_update_staff, then edit
-- that doctor's public profile and consultation fee everywhere. After this migration:
--   * only platform admins create, change or delete doctor–clinic links (clinic admins can only
--     PROPOSE a brand-new doctor, which can never attach them to an existing doctor record);
--   * clinic admins edit only doctors verified at their own clinic, and never the fields that make a
--     listing trustworthy (sample flag, registration note, ratings) or the fee shared across clinics;
--   * a doctor who is not a sample and has no verified link is not publicly listed at all.
--
-- Onboarding model:
--   patient account ──(apply)──▶ provider_applications ──(platform admin approves)──▶ clinic (not a
--   sample) + clinic_admin membership for the applicant ──(clinic admin proposes doctors)──▶ pending
--   doctor ──(platform admin verifies registration)──▶ verified link: listed and bookable.
-- Every account is an ordinary Supabase Auth user; what it may do comes only from clinic_memberships
-- and user_roles, checked here by RLS and SECURITY DEFINER functions, never by the client.

-- ---------------------------------------------------------------------------------------------
-- 0. Platform-admin check (identical to 00052; RLS-bypassing so policies never recurse)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = (SELECT auth.uid()) AND role = 'platform_admin'
    );
$$;
ALTER FUNCTION private.is_platform_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1. Doctor–clinic links: platform admins only
-- ---------------------------------------------------------------------------------------------
-- Only these states are meaningful; NOT VALID keeps existing rows untouched while checking new ones.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_doctors_verification_state_check') THEN
        ALTER TABLE public.clinic_doctors
            ADD CONSTRAINT clinic_doctors_verification_state_check
            CHECK (verification_state IN ('pending', 'verified', 'rejected')) NOT VALID;
    END IF;
END $$;

DROP POLICY IF EXISTS clinic_doctors_all_staff ON public.clinic_doctors;
DROP POLICY IF EXISTS clinic_doctors_admin_all ON public.clinic_doctors;
CREATE POLICY clinic_doctors_admin_all ON public.clinic_doctors
FOR ALL TO authenticated
USING ((SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_platform_admin()));
-- clinic_doctors_read_public (SELECT, everyone) is unchanged: verification status is public info.

-- ---------------------------------------------------------------------------------------------
-- 2. Doctors: who can see and edit them
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS doctors_read_public ON public.doctors;
DROP POLICY IF EXISTS doctors_read_listed ON public.doctors;
CREATE POLICY doctors_read_listed ON public.doctors
FOR SELECT TO anon, authenticated
USING (
    is_demo
    OR id IN (
        SELECT cd.doctor_id FROM public.clinic_doctors cd
        WHERE cd.verification_state = 'verified' AND cd.active
    )
);

DROP POLICY IF EXISTS doctors_read_clinic ON public.doctors;
CREATE POLICY doctors_read_clinic ON public.doctors
FOR SELECT TO authenticated
USING (
    id IN (
        SELECT cd.doctor_id FROM public.clinic_doctors cd
        WHERE cd.clinic_id IN (SELECT private.user_clinic_ids())
    )
);

DROP POLICY IF EXISTS doctors_read_platform_admin ON public.doctors;
CREATE POLICY doctors_read_platform_admin ON public.doctors
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

DROP POLICY IF EXISTS doctors_update_staff ON public.doctors;
DROP POLICY IF EXISTS doctors_update_clinic_admin ON public.doctors;
CREATE POLICY doctors_update_clinic_admin ON public.doctors
FOR UPDATE TO authenticated
USING (
    id IN (
        SELECT cd.doctor_id FROM public.clinic_doctors cd
        WHERE cd.verification_state = 'verified' AND cd.active
          AND cd.clinic_id IN (SELECT private.user_admin_clinic_ids())
    )
)
WITH CHECK (
    id IN (
        SELECT cd.doctor_id FROM public.clinic_doctors cd
        WHERE cd.verification_state = 'verified' AND cd.active
          AND cd.clinic_id IN (SELECT private.user_admin_clinic_ids())
    )
);

DROP POLICY IF EXISTS doctors_update_platform_admin ON public.doctors;
CREATE POLICY doctors_update_platform_admin ON public.doctors
FOR UPDATE TO authenticated
USING ((SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_platform_admin()));

-- Trust fields and the cross-clinic fee are not editable by clinics.
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
           OR NEW.registration_note IS DISTINCT FROM OLD.registration_note THEN
            RAISE EXCEPTION 'Only CareConnect can change a doctor''s listing status or registration';
        END IF;
        -- The fee is shared by every clinic the doctor works at; only the doctor (or CareConnect)
        -- may change it, not one of those clinics on behalf of the others.
        IF NEW.consultation_fee IS DISTINCT FROM OLD.consultation_fee AND NOT v_self THEN
            RAISE EXCEPTION 'Only the doctor or CareConnect can change the consultation fee';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Clinics: trust fields are CareConnect's; platform admins may edit any clinic
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_clinic_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify primary key';
    END IF;
    IF NOT (SELECT private.is_platform_admin()) THEN
        IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
           OR NEW.rating IS DISTINCT FROM OLD.rating
           OR NEW.review_count IS DISTINCT FROM OLD.review_count THEN
            RAISE EXCEPTION 'Only CareConnect can change a clinic''s listing status or ratings';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS clinics_update_platform_admin ON public.clinics;
CREATE POLICY clinics_update_platform_admin ON public.clinics
FOR UPDATE TO authenticated
USING ((SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_platform_admin()));

-- ---------------------------------------------------------------------------------------------
-- 4. Schedules: clinic members manage hours only for doctors verified at their clinic
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS schedules_all_staff ON public.doctor_schedules;
DROP POLICY IF EXISTS schedules_write_staff ON public.doctor_schedules;
CREATE POLICY schedules_write_staff ON public.doctor_schedules
FOR ALL TO authenticated
-- Old rows stay removable even if the link later lost its verification.
USING (clinic_id IN (SELECT private.user_clinic_ids()))
WITH CHECK (
    clinic_id IN (SELECT private.user_clinic_ids())
    AND EXISTS (
        SELECT 1 FROM public.clinic_doctors cd
        WHERE cd.clinic_id = doctor_schedules.clinic_id
          AND cd.doctor_id = doctor_schedules.doctor_id
          AND cd.verification_state = 'verified' AND cd.active
    )
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_schedules_window_check') THEN
        ALTER TABLE public.doctor_schedules
            ADD CONSTRAINT doctor_schedules_window_check
            CHECK (start_time < end_time AND slot_minutes BETWEEN 5 AND 240) NOT VALID;
    END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Memberships and accounts: platform admins manage every clinic's team
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS membership_platform_admin ON public.clinic_memberships;
CREATE POLICY membership_platform_admin ON public.clinic_memberships
FOR ALL TO authenticated
USING ((SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_platform_admin()));

-- Platform admins need to see which account a membership belongs to (email only through the UI).
DROP POLICY IF EXISTS users_read_platform_admin ON public.users;
CREATE POLICY users_read_platform_admin ON public.users
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- ---------------------------------------------------------------------------------------------
-- 6. Provider applications
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    clinic_name TEXT NOT NULL CHECK (char_length(btrim(clinic_name)) BETWEEN 2 AND 120),
    area TEXT NOT NULL CHECK (char_length(btrim(area)) BETWEEN 2 AND 80),
    address TEXT NOT NULL CHECK (char_length(btrim(address)) BETWEEN 5 AND 300),
    contact_name TEXT NOT NULL CHECK (char_length(btrim(contact_name)) BETWEEN 2 AND 120),
    contact_role TEXT NOT NULL CHECK (contact_role IN ('owner', 'administrator', 'doctor', 'manager', 'other')),
    contact_phone TEXT NOT NULL CHECK (contact_phone ~ '^[0-9+() -]{6,30}$'),
    contact_email TEXT NOT NULL CHECK (char_length(contact_email) <= 254 AND contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    registration_details TEXT NOT NULL CHECK (char_length(btrim(registration_details)) BETWEEN 5 AND 500),
    doctor_count INTEGER CHECK (doctor_count BETWEEN 1 AND 500),
    message TEXT CHECK (char_length(message) <= 1000),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'withdrawn')),
    review_note TEXT CHECK (char_length(review_note) <= 1000),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_applications_applicant_idx ON public.provider_applications (applicant_id);
CREATE INDEX IF NOT EXISTS provider_applications_status_idx ON public.provider_applications (status, created_at);

ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

-- Applicants may only supply the application's content; the id, owner, status and review fields
-- come from defaults and the review functions below.
REVOKE ALL ON public.provider_applications FROM PUBLIC;
REVOKE ALL ON public.provider_applications FROM anon;
REVOKE ALL ON public.provider_applications FROM authenticated;
GRANT SELECT ON public.provider_applications TO authenticated;
GRANT INSERT (clinic_name, area, address, contact_name, contact_role, contact_phone, contact_email,
              registration_details, doctor_count, message)
    ON public.provider_applications TO authenticated;

DROP POLICY IF EXISTS provider_applications_insert_self ON public.provider_applications;
CREATE POLICY provider_applications_insert_self ON public.provider_applications
FOR INSERT TO authenticated
WITH CHECK (applicant_id = (SELECT auth.uid()) AND status = 'submitted');

DROP POLICY IF EXISTS provider_applications_read_self ON public.provider_applications;
CREATE POLICY provider_applications_read_self ON public.provider_applications
FOR SELECT TO authenticated
USING (applicant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS provider_applications_read_admin ON public.provider_applications;
CREATE POLICY provider_applications_read_admin ON public.provider_applications
FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()));

-- At most three open applications per account (abuse guard).
CREATE OR REPLACE FUNCTION public.check_provider_application_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT count(*) FROM public.provider_applications
        WHERE applicant_id = NEW.applicant_id AND status = 'submitted') >= 3 THEN
        RAISE EXCEPTION 'Rate Limit Exceeded: at most 3 open provider applications per account.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_provider_application_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_provider_application_insert() FROM anon;
REVOKE ALL ON FUNCTION public.check_provider_application_insert() FROM authenticated;

DROP TRIGGER IF EXISTS tr_check_provider_application_insert ON public.provider_applications;
CREATE TRIGGER tr_check_provider_application_insert
BEFORE INSERT ON public.provider_applications
FOR EACH ROW EXECUTE FUNCTION public.check_provider_application_insert();

-- The applicant can withdraw an application that has not been reviewed yet.
CREATE OR REPLACE FUNCTION public.withdraw_provider_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.provider_applications
    SET status = 'withdrawn', updated_at = now()
    WHERE id = p_application_id AND applicant_id = (SELECT auth.uid()) AND status = 'submitted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Validation Failed: that application cannot be withdrawn.' USING ERRCODE = 'P0001';
    END IF;
END;
$$;

-- Platform admin: approve (creates a real clinic + clinic_admin membership) or reject.
CREATE OR REPLACE FUNCTION public.admin_review_provider_application(
    p_application_id uuid, p_approve boolean, p_note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_app public.provider_applications;
    v_clinic_id uuid;
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

    SELECT * INTO v_app FROM public.provider_applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND OR v_app.status <> 'submitted' THEN
        RAISE EXCEPTION 'Validation Failed: that application is not awaiting review.' USING ERRCODE = 'P0001';
    END IF;

    IF p_approve THEN
        INSERT INTO public.clinics (name, address, area, phone, email, about, is_demo)
        VALUES (btrim(v_app.clinic_name), btrim(v_app.address), btrim(v_app.area),
                v_app.contact_phone, v_app.contact_email, NULL, false)
        RETURNING id INTO v_clinic_id;

        INSERT INTO public.clinic_memberships (user_id, clinic_id, role, active, invited_by)
        VALUES (v_app.applicant_id, v_clinic_id, 'clinic_admin', true, (SELECT auth.uid()))
        ON CONFLICT (user_id, clinic_id) DO UPDATE SET role = 'clinic_admin', active = true, updated_at = now();
    END IF;

    UPDATE public.provider_applications
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        review_note = NULLIF(btrim(p_note), ''),
        reviewed_by = (SELECT auth.uid()),
        reviewed_at = now(),
        clinic_id = v_clinic_id,
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('provider_application_reviewed', (SELECT auth.uid()), p_application_id,
            jsonb_build_object('approved', p_approve, 'clinic_id', v_clinic_id));
    RETURN v_clinic_id;
END;
$$;

-- Platform admin: add (or re-activate) a clinic member by the email of an existing account.
CREATE OR REPLACE FUNCTION public.admin_add_clinic_member(p_clinic_id uuid, p_email text, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_membership_id uuid;
BEGIN
    IF NOT (SELECT private.is_platform_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: platform admins only.' USING ERRCODE = '42501';
    END IF;
    IF p_role NOT IN ('clinic_staff', 'clinic_admin') THEN
        RAISE EXCEPTION 'Validation Failed: unknown clinic role.' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic_id) THEN
        RAISE EXCEPTION 'Validation Failed: clinic not found.' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email));
    IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'Validation Failed: no CareConnect account uses that email address.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.clinic_memberships (user_id, clinic_id, role, active, invited_by)
    VALUES (v_user_id, p_clinic_id, p_role::public.user_role, true, (SELECT auth.uid()))
    ON CONFLICT (user_id, clinic_id)
    DO UPDATE SET role = EXCLUDED.role, active = true, updated_at = now()
    RETURNING id INTO v_membership_id;

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('clinic_member_added', (SELECT auth.uid()), v_membership_id,
            jsonb_build_object('clinic_id', p_clinic_id, 'role', p_role));
    RETURN v_membership_id;
END;
$$;

-- Clinic admin: propose a NEW doctor for their clinic. The doctor starts unlisted (pending link) and
-- becomes visible and bookable only when a platform admin verifies the registration. This function
-- never links an existing doctor record, so it cannot be used to take over another listing.
CREATE OR REPLACE FUNCTION public.clinic_propose_doctor(
    p_clinic_id uuid,
    p_name text,
    p_specialty_id text,
    p_gender text,
    p_experience_years integer,
    p_consultation_fee numeric,
    p_qualifications text[],
    p_languages text[],
    p_registration_note text,
    p_about text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_doctor_id uuid;
BEGIN
    IF p_clinic_id IS NULL OR p_clinic_id NOT IN (SELECT private.user_admin_clinic_ids()) THEN
        RAISE EXCEPTION 'Unauthorized: only an admin of this clinic can propose doctors.' USING ERRCODE = '42501';
    END IF;
    IF char_length(btrim(coalesce(p_name, ''))) NOT BETWEEN 3 AND 120 THEN
        RAISE EXCEPTION 'Validation Failed: doctor name must be 3–120 characters.' USING ERRCODE = 'P0001';
    END IF;
    -- Keep in sync with SPECIALTIES in src/lib/format.ts.
    IF p_specialty_id IS NULL OR p_specialty_id NOT IN ('general', 'pediatrics', 'orthopedics', 'cardiology',
        'dermatology', 'gynecology', 'neurology', 'ophthalmology', 'dentistry', 'ent') THEN
        RAISE EXCEPTION 'Validation Failed: unknown specialty.' USING ERRCODE = 'P0001';
    END IF;
    IF p_gender IS NOT NULL AND p_gender NOT IN ('male', 'female', 'other') THEN
        RAISE EXCEPTION 'Validation Failed: unknown gender.' USING ERRCODE = 'P0001';
    END IF;
    IF p_experience_years IS NULL OR p_experience_years NOT BETWEEN 0 AND 70 THEN
        RAISE EXCEPTION 'Validation Failed: experience must be 0–70 years.' USING ERRCODE = 'P0001';
    END IF;
    IF p_consultation_fee IS NULL OR p_consultation_fee < 0 OR p_consultation_fee > 100000 THEN
        RAISE EXCEPTION 'Validation Failed: fee must be between 0 and 100000.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(coalesce(p_registration_note, ''))) NOT BETWEEN 5 AND 300 THEN
        RAISE EXCEPTION 'Validation Failed: registration details are required (5–300 characters).' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_about) > 1000 OR coalesce(array_length(p_qualifications, 1), 0) > 10
       OR coalesce(array_length(p_languages, 1), 0) > 10 THEN
        RAISE EXCEPTION 'Validation Failed: too much detail.' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.clinic_doctors
        WHERE clinic_id = p_clinic_id AND verification_state = 'pending') >= 10 THEN
        RAISE EXCEPTION 'Rate Limit Exceeded: this clinic already has 10 doctors awaiting verification.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.doctors (name, specialty_id, gender, experience_years, consultation_fee,
                                qualifications, languages, registration_note, about, is_demo)
    VALUES (btrim(p_name), p_specialty_id, p_gender::public.gender_type, p_experience_years,
            p_consultation_fee, coalesce(p_qualifications, '{}'), coalesce(p_languages, '{}'),
            btrim(p_registration_note), NULLIF(btrim(p_about), ''), false)
    RETURNING id INTO v_doctor_id;

    -- check_clinic_doctor_update forces 'pending' for anyone but a platform admin.
    INSERT INTO public.clinic_doctors (clinic_id, doctor_id, active, verification_state)
    VALUES (p_clinic_id, v_doctor_id, true, 'pending');

    INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('doctor_proposed', (SELECT auth.uid()), v_doctor_id, jsonb_build_object('clinic_id', p_clinic_id));
    RETURN v_doctor_id;
END;
$$;

-- Execution rights: signed-in users only (each function checks its own authorization).
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.withdraw_provider_application(uuid)',
        'public.admin_review_provider_application(uuid, boolean, text)',
        'public.admin_add_clinic_member(uuid, text, text)',
        'public.clinic_propose_doctor(uuid, text, text, text, integer, numeric, text[], text[], text, text)'
    ] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.check_doctor_update()', 'public.check_clinic_update()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    END LOOP;
END $$;
