-- migration 00007_schema_extensions.sql

-- 1. Extend Clinics
ALTER TABLE public.clinics ADD COLUMN specialty_ids TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.clinics ADD COLUMN services TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.clinics ADD COLUMN facilities TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.clinics ADD COLUMN languages TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.clinics ADD COLUMN opening_hours JSONB DEFAULT '[]'::JSONB;
ALTER TABLE public.clinics ADD COLUMN fee_range NUMERIC[] DEFAULT '{0,0}'::NUMERIC[];
ALTER TABLE public.clinics ADD COLUMN rating NUMERIC DEFAULT 0.0;
ALTER TABLE public.clinics ADD COLUMN review_count INTEGER DEFAULT 0;
ALTER TABLE public.clinics ADD COLUMN photo_tone TEXT;

-- 2. Extend Doctors
ALTER TABLE public.doctors ADD COLUMN specialty_id TEXT;
ALTER TABLE public.doctors ADD COLUMN qualifications TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.doctors ADD COLUMN languages TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.doctors ADD COLUMN services TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.doctors ADD COLUMN rating NUMERIC DEFAULT 0.0;
ALTER TABLE public.doctors ADD COLUMN review_count INTEGER DEFAULT 0;
ALTER TABLE public.doctors ADD COLUMN registration_note TEXT;

-- 3. Extend Patients
ALTER TABLE public.patients ADD COLUMN preferred_language TEXT;
ALTER TABLE public.patients ADD COLUMN area TEXT;
ALTER TABLE public.patients ADD COLUMN saved_doctor_ids UUID[] DEFAULT '{}'::UUID[];
ALTER TABLE public.patients ADD COLUMN saved_clinic_ids UUID[] DEFAULT '{}'::UUID[];

-- 4. Unread messages for Conversations
ALTER TABLE public.conversations ADD COLUMN unread_for_patient INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE public.conversations ADD COLUMN unread_for_clinic INTEGER DEFAULT 0 NOT NULL;

-- 5. Notifications
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read_self ON public.notifications FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_self ON public.notifications FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_insert_self ON public.notifications FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

