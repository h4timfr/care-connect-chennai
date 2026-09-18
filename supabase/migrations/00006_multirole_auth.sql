-- migration 00006_multirole_auth.sql

-- 1. Global Roles Table
CREATE TABLE public.user_roles (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
-- Platform admins can read all, users can read their own
CREATE POLICY user_roles_read_self ON public.user_roles FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY user_roles_read_admin ON public.user_roles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'platform_admin')
);

-- Migrate any existing global roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.users WHERE role IN ('platform_admin');

-- Rewrite policies dependent on users.role BEFORE dropping
DROP POLICY IF EXISTS audit_logs_read_admin ON public.audit_logs;
CREATE POLICY audit_logs_read_admin ON public.audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'platform_admin')
);

-- Remove role from public.users
ALTER TABLE public.users DROP COLUMN role;

-- 2. Clinic Memberships
CREATE TABLE public.clinic_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    role user_role NOT NULL CHECK (role IN ('clinic_staff', 'clinic_admin')),
    active BOOLEAN DEFAULT true NOT NULL,
    invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(user_id, clinic_id)
);
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;

-- Migrate data from clinic_staff
INSERT INTO public.clinic_memberships (user_id, clinic_id, role, active)
SELECT user_id, clinic_id, CASE WHEN is_admin THEN 'clinic_admin'::user_role ELSE 'clinic_staff'::user_role END, true
FROM public.clinic_staff;

-- Drop old clinic_staff table
DROP TABLE public.clinic_staff;

-- Update RLS Helpers
CREATE OR REPLACE FUNCTION private.user_clinic_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
    SELECT clinic_id 
    FROM public.clinic_memberships 
    WHERE user_id = (SELECT auth.uid()) AND active = true;
$$;

CREATE OR REPLACE FUNCTION private.user_admin_clinic_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
    SELECT clinic_id 
    FROM public.clinic_memberships 
    WHERE user_id = (SELECT auth.uid()) AND role = 'clinic_admin' AND active = true;
$$;

-- 3. Doctor-Clinic Enhancements
ALTER TABLE public.clinic_doctors ADD COLUMN active BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE public.clinic_doctors ADD COLUMN verification_state TEXT DEFAULT 'pending' NOT NULL;
ALTER TABLE public.clinic_doctors ADD COLUMN started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL;
ALTER TABLE public.clinic_doctors ADD COLUMN ended_at TIMESTAMP WITH TIME ZONE;

-- 4. Triggers
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    new.id, 
    new.email, 
    new.created_at, 
    new.updated_at
  );
  
  -- If metadata contains role platform_admin, we could insert, but let's avoid escalation.
  -- Only allow patient by default. Wait, we don't need user_roles for patient.
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_patient() 
RETURNS trigger AS $$
BEGIN
  -- Every user gets a patient profile
  INSERT INTO public.patients (user_id, full_name)
  VALUES (new.id, COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = new.id), 'New Patient'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. Restore clinic_memberships RLS (since CASCADE dropped staff policies)
CREATE POLICY membership_read_clinic ON public.clinic_memberships FOR SELECT USING (
    clinic_id IN (SELECT private.user_clinic_ids())
);
CREATE POLICY membership_all_admin ON public.clinic_memberships USING (
    clinic_id IN (SELECT private.user_admin_clinic_ids())
);

-- Note: The CASCADE on dropping clinic_staff might have dropped some views or foreign keys if they existed, but
-- there were no FKs referencing clinic_staff. The helpers were dependent, but functions aren't dropped by CASCADE on a table in Postgres unless they take the table as a type.
