-- Private provider-candidate review pipeline. LOCAL ONLY — not deployed. Apply after 00052–00055.
-- Idempotent: safe to re-run.
--
-- Research candidates (public-web research about Chennai facilities and doctors) are NOT CareConnect
-- providers. They live in their own tables, separate from clinics / doctors / clinic_doctors:
--   * readable and writable only by platform admins (RLS through private.is_platform_admin());
--   * never referenced by any policy or function that decides listings, bookings or provider access,
--     so nothing here can list a provider, enable booking or grant clinic/doctor privileges;
--   * booking_enabled is fixed to false by a CHECK constraint;
--   * every row is created in status 'candidate' and can be marked 'verified' (or permission 'granted')
--     only by a platform admin, and only once the required verification evidence has been recorded.
-- Research facts (names, addresses, sources) change only through the owner-run import; the review UI
-- can change only review state and notes (column-level grants). Evidence and contact logs are
-- append-only and record the acting admin from auth.uid().
--
-- Becoming a real provider still goes through the existing flow: clinic application / doctor
-- application → platform-admin approval → verified clinic_doctors link (migrations 00054 / 00055).

-- ---------------------------------------------------------------------------------------------
-- 1. Candidate facilities and doctors
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Research identifier from the catalogue (CLINIC-001 …), not a CareConnect id.
    research_id TEXT NOT NULL UNIQUE CHECK (research_id ~ '^CLINIC-[0-9]{3}$'),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 200),
    facility_type TEXT NOT NULL CHECK (char_length(btrim(facility_type)) BETWEEN 2 AND 80),
    address TEXT CHECK (char_length(address) <= 500),
    locality TEXT NOT NULL CHECK (char_length(btrim(locality)) BETWEEN 2 AND 80),
    website TEXT CHECK (website ~ '^https?://[^[:space:]]+$' AND char_length(website) <= 500),
    specialties TEXT[] NOT NULL DEFAULT '{}',
    source_confidence TEXT NOT NULL CHECK (source_confidence IN ('high', 'medium', 'low')),
    unresolved_issues TEXT[] NOT NULL DEFAULT '{}',
    researched_on DATE NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'candidate' CHECK (review_status IN (
        'candidate', 'under_review', 'contact_pending', 'contacted', 'verification_pending', 'verified', 'rejected')),
    permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('unknown', 'requested', 'granted', 'denied')),
    booking_enabled BOOLEAN NOT NULL DEFAULT false CHECK (booking_enabled = false),
    notes TEXT CHECK (char_length(notes) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidate_doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_id TEXT NOT NULL UNIQUE CHECK (research_id ~ '^DOCTOR-[0-9]{3}$'),
    full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 3 AND 200),
    specialty TEXT NOT NULL CHECK (char_length(btrim(specialty)) BETWEEN 2 AND 120),
    qualifications TEXT CHECK (char_length(qualifications) <= 500),
    -- Public registration details exactly as found in research, if any (never invented).
    registration_info TEXT CHECK (char_length(registration_info) <= 300),
    -- 'verified' only after CareConnect itself checked the register (doctor_registration evidence).
    registration_status TEXT NOT NULL DEFAULT 'not_verified'
        CHECK (registration_status IN ('not_verified', 'public_listing_seen', 'verified')),
    source_confidence TEXT NOT NULL CHECK (source_confidence IN ('high', 'medium', 'low')),
    unresolved_issues TEXT[] NOT NULL DEFAULT '{}',
    researched_on DATE NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'candidate' CHECK (review_status IN (
        'candidate', 'under_review', 'contact_pending', 'contacted', 'verification_pending', 'verified', 'rejected')),
    permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('unknown', 'requested', 'granted', 'denied')),
    booking_enabled BOOLEAN NOT NULL DEFAULT false CHECK (booking_enabled = false),
    notes TEXT CHECK (char_length(notes) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------------------------
-- 2. Researched doctor–facility relationships
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_candidate_id UUID NOT NULL REFERENCES public.candidate_doctors(id) ON DELETE CASCADE,
    facility_candidate_id UUID NOT NULL REFERENCES public.candidate_facilities(id) ON DELETE CASCADE,
    -- Exactly as the research classified it; never upgraded by CareConnect.
    research_status TEXT NOT NULL CHECK (research_status IN ('CONFIRMED_PUBLIC', 'POSSIBLE_NEEDS_CONFIRMATION')),
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    unresolved_issues TEXT[] NOT NULL DEFAULT '{}',
    -- CareConnect's own conclusion, separate from the research classification.
    careconnect_status TEXT NOT NULL DEFAULT 'unverified' CHECK (careconnect_status IN ('unverified', 'confirmed', 'rejected')),
    notes TEXT CHECK (char_length(notes) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (doctor_candidate_id, facility_candidate_id)
);

-- ---------------------------------------------------------------------------------------------
-- 3. Sources (research provenance), verification evidence and contact log
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_candidate_id UUID REFERENCES public.candidate_facilities(id) ON DELETE CASCADE,
    doctor_candidate_id UUID REFERENCES public.candidate_doctors(id) ON DELETE CASCADE,
    relationship_id UUID REFERENCES public.candidate_relationships(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (url ~ '^https?://[^[:space:]]+$' AND char_length(url) <= 1000),
    source_type TEXT NOT NULL CHECK (source_type IN (
        'official_facility', 'official_institution', 'government_registry', 'directory', 'news', 'other')),
    supports TEXT NOT NULL CHECK (char_length(btrim(supports)) BETWEEN 2 AND 500),
    researched_on DATE NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    origin TEXT NOT NULL DEFAULT 'research' CHECK (origin IN ('research', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(facility_candidate_id, doctor_candidate_id, relationship_id) = 1)
);

CREATE TABLE IF NOT EXISTS public.candidate_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_candidate_id UUID REFERENCES public.candidate_facilities(id) ON DELETE CASCADE,
    doctor_candidate_id UUID REFERENCES public.candidate_doctors(id) ON DELETE CASCADE,
    relationship_id UUID REFERENCES public.candidate_relationships(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'provider_identity', 'clinic_identity', 'doctor_registration', 'doctor_clinic_relationship',
        'address', 'contact_details', 'listing_permission', 'appointment_arrangement')),
    value TEXT NOT NULL CHECK (char_length(btrim(value)) BETWEEN 2 AND 2000),
    source TEXT NOT NULL CHECK (char_length(btrim(source)) BETWEEN 2 AND 1000),
    recorded_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(facility_candidate_id, doctor_candidate_id, relationship_id) = 1)
);

CREATE TABLE IF NOT EXISTS public.candidate_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_candidate_id UUID REFERENCES public.candidate_facilities(id) ON DELETE CASCADE,
    doctor_candidate_id UUID REFERENCES public.candidate_doctors(id) ON DELETE CASCADE,
    contacted_on DATE NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('phone', 'email', 'in_person', 'website_form', 'other')),
    outcome TEXT NOT NULL CHECK (outcome IN ('no_response', 'reached', 'interested', 'declined', 'follow_up', 'wrong_contact')),
    permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('unknown', 'requested', 'granted', 'denied')),
    notes TEXT CHECK (char_length(notes) <= 2000),
    recorded_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(facility_candidate_id, doctor_candidate_id) = 1)
);

CREATE INDEX IF NOT EXISTS candidate_relationships_doctor_idx ON public.candidate_relationships (doctor_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_relationships_facility_idx ON public.candidate_relationships (facility_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_sources_facility_idx ON public.candidate_sources (facility_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_sources_doctor_idx ON public.candidate_sources (doctor_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_sources_relationship_idx ON public.candidate_sources (relationship_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_facility_idx ON public.candidate_evidence (facility_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_doctor_idx ON public.candidate_evidence (doctor_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_relationship_idx ON public.candidate_evidence (relationship_id);
CREATE INDEX IF NOT EXISTS candidate_contacts_facility_idx ON public.candidate_contacts (facility_candidate_id);
CREATE INDEX IF NOT EXISTS candidate_contacts_doctor_idx ON public.candidate_contacts (doctor_candidate_id);

-- ---------------------------------------------------------------------------------------------
-- 4. Privileges: nothing for anon; for signed-in users only what RLS then limits to platform admins
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['candidate_facilities', 'candidate_doctors', 'candidate_relationships',
                             'candidate_sources', 'candidate_evidence', 'candidate_contacts'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_admin', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()))',
                       t || '_read_admin', t);
    END LOOP;
END $$;

-- Review state only; research facts are not editable from the review UI.
GRANT UPDATE (review_status, permission_status, notes) ON public.candidate_facilities TO authenticated;
GRANT UPDATE (review_status, permission_status, notes) ON public.candidate_doctors TO authenticated;
GRANT UPDATE (careconnect_status, notes) ON public.candidate_relationships TO authenticated;
-- Append-only logs; the acting admin and time come from defaults.
GRANT INSERT (facility_candidate_id, doctor_candidate_id, relationship_id, evidence_type, value, source)
    ON public.candidate_evidence TO authenticated;
GRANT INSERT (facility_candidate_id, doctor_candidate_id, contacted_on, method, outcome, permission_status, notes)
    ON public.candidate_contacts TO authenticated;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['candidate_facilities', 'candidate_doctors', 'candidate_relationships'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_admin', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT private.is_platform_admin())) WITH CHECK ((SELECT private.is_platform_admin()))',
                       t || '_update_admin', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['candidate_evidence', 'candidate_contacts'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_admin', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_platform_admin()) AND recorded_by = (SELECT auth.uid()))',
                       t || '_insert_admin', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Workflow guards
-- ---------------------------------------------------------------------------------------------
-- New candidates always start at the beginning, whoever inserts them (including the import).
CREATE OR REPLACE FUNCTION public.check_candidate_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.review_status <> 'candidate' OR NEW.permission_status <> 'unknown' THEN
        RAISE EXCEPTION 'Validation Failed: new candidates start as candidate with unknown permission.' USING ERRCODE = 'P0001';
    END IF;
    -- Nested on purpose: PL/pgSQL resolves NEW.registration_status while planning the whole
    -- condition, and candidate_facilities has no such column.
    IF TG_TABLE_NAME = 'candidate_doctors' THEN
        IF NEW.registration_status = 'verified' THEN
            RAISE EXCEPTION 'Validation Failed: registration can only be verified by CareConnect after import.' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Verification and permission need recorded evidence; nothing becomes verified implicitly.
CREATE OR REPLACE FUNCTION public.check_candidate_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_needed text[];
    v_missing text[];
BEGIN
    NEW.updated_at := now();
    IF NEW.review_status = 'verified' AND OLD.review_status IS DISTINCT FROM 'verified' THEN
        v_needed := CASE TG_TABLE_NAME
            WHEN 'candidate_facilities' THEN ARRAY['clinic_identity', 'address', 'contact_details']
            ELSE ARRAY['provider_identity', 'doctor_registration'] END;
        SELECT array_agg(n) INTO v_missing FROM unnest(v_needed) n
        WHERE NOT EXISTS (
            SELECT 1 FROM public.candidate_evidence e
            WHERE e.evidence_type = n
              AND (CASE TG_TABLE_NAME WHEN 'candidate_facilities' THEN e.facility_candidate_id ELSE e.doctor_candidate_id END) = NEW.id
        );
        IF v_missing IS NOT NULL THEN
            RAISE EXCEPTION 'Validation Failed: verification needs evidence of %.', array_to_string(v_missing, ', ')
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    IF NEW.permission_status = 'granted' AND OLD.permission_status IS DISTINCT FROM 'granted' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.candidate_evidence e
            WHERE e.evidence_type = 'listing_permission'
              AND (CASE TG_TABLE_NAME WHEN 'candidate_facilities' THEN e.facility_candidate_id ELSE e.doctor_candidate_id END) = NEW.id
        ) THEN
            RAISE EXCEPTION 'Validation Failed: permission can only be marked granted with listing_permission evidence.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    IF TG_TABLE_NAME = 'candidate_doctors' THEN
        IF NEW.registration_status = 'verified' AND OLD.registration_status IS DISTINCT FROM 'verified' THEN
            RAISE EXCEPTION 'Validation Failed: CareConnect registration checks are recorded as doctor_registration evidence.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    IF NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.permission_status IS DISTINCT FROM OLD.permission_status THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES ('candidate_review_changed', (SELECT auth.uid()), NEW.id,
                jsonb_build_object('table', TG_TABLE_NAME, 'research_id', NEW.research_id,
                                   'from', OLD.review_status, 'to', NEW.review_status,
                                   'permission_from', OLD.permission_status, 'permission_to', NEW.permission_status));
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_candidate_relationship_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.careconnect_status = 'confirmed' AND OLD.careconnect_status IS DISTINCT FROM 'confirmed'
       AND NOT EXISTS (SELECT 1 FROM public.candidate_evidence e
                       WHERE e.relationship_id = NEW.id AND e.evidence_type = 'doctor_clinic_relationship') THEN
        RAISE EXCEPTION 'Validation Failed: confirming a relationship needs doctor_clinic_relationship evidence.'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.careconnect_status IS DISTINCT FROM OLD.careconnect_status THEN
        INSERT INTO public.audit_logs (action_type, actor_id, target_id, metadata)
        VALUES ('candidate_relationship_changed', (SELECT auth.uid()), NEW.id,
                jsonb_build_object('from', OLD.careconnect_status, 'to', NEW.careconnect_status));
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['candidate_facilities', 'candidate_doctors'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_check_candidate_insert ON public.%I', t);
        EXECUTE format('CREATE TRIGGER tr_check_candidate_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.check_candidate_insert()', t);
        EXECUTE format('DROP TRIGGER IF EXISTS tr_check_candidate_update ON public.%I', t);
        EXECUTE format('CREATE TRIGGER tr_check_candidate_update BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.check_candidate_update()', t);
    END LOOP;
END $$;
DROP TRIGGER IF EXISTS tr_check_candidate_relationship_update ON public.candidate_relationships;
CREATE TRIGGER tr_check_candidate_relationship_update
BEFORE UPDATE ON public.candidate_relationships
FOR EACH ROW EXECUTE FUNCTION public.check_candidate_relationship_update();

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public.check_candidate_insert()', 'public.check_candidate_update()',
                             'public.check_candidate_relationship_update()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    END LOOP;
END $$;
