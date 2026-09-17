-- PHASE 5: FOUNDATION HARDENING & PRIVACY

-- 1. Redefine the user_role enum (if it was created previously, we technically can't DROP ENUM easily without CASCADE, 
-- but we can alter the columns and drop the old enum if we are careful. Since this is an early migration, 
-- let's just use the existing one but update the schema rules around it).
-- The existing ENUM is: 'patient', 'doctor', 'clinic_staff', 'clinic_admin', 'platform_admin'
-- We will enforce that 'clinic_admin' and 'clinic_staff' define platform-level grouping, but the actual 
-- clinic relationship determines access.

-- 2. PRIVACY & CONSENT COLUMNS
ALTER TABLE users ADD COLUMN privacy_policy_version TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN consent_timestamp TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN data_deletion_requested BOOLEAN DEFAULT FALSE;

-- 3. AUDIT LOGGING
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_id UUID,
    ip_address TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- Only platform_admin can read audit logs. No one can update/delete. 
-- Inserts are done via secure postgres functions.
CREATE POLICY audit_logs_read_admin ON audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'platform_admin')
);

-- 4. IDENTITY SYNCHRONIZATION FIX
-- Previously, `users.id` was defaulting to a random UUID. It MUST match `auth.uid()`.
-- We will alter the `users` table to enforce this.
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
-- If there are any existing mock rows that don't map to auth.users, they would break here.
-- Assuming this is a fresh DB.

-- Trigger to create a public.users row when auth.users is created.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    new.id, 
    new.email, 
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'patient'::user_role),
    new.created_at, 
    new.updated_at
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger to create a patient profile automatically when a user with role 'patient' is created.
CREATE OR REPLACE FUNCTION public.handle_new_patient() 
RETURNS trigger AS $$
BEGIN
  IF new.role = 'patient' THEN
    INSERT INTO public.patients (user_id, full_name)
    VALUES (new.id, COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = new.id), 'New Patient'));
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_public_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_patient();

-- 5. SECURE APPOINTMENT BOOKING (RPC)
-- Deny direct INSERT to standard users to prevent spoofing
DROP POLICY IF EXISTS appts_insert_patient ON appointments;

CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id UUID,
    p_clinic_id UUID,
    p_date DATE,
    p_time TIME,
    p_reason TEXT
) RETURNS appointments AS $$
DECLARE
    v_patient_id UUID;
    v_fee NUMERIC;
    v_appointment appointments;
BEGIN
    -- 1. Extract patient_id securely from auth.uid()
    SELECT id INTO v_patient_id FROM patients WHERE user_id = auth.uid();
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only registered patients can book appointments.';
    END IF;

    -- 2. Verify doctor and clinic exist and are active (placeholder for active flags)
    IF NOT EXISTS (
        SELECT 1 FROM clinic_doctors 
        WHERE doctor_id = p_doctor_id AND clinic_id = p_clinic_id
    ) THEN
        RAISE EXCEPTION 'Validation Failed: Doctor does not operate at this clinic.';
    END IF;

    -- 3. Lookup authoritative fee
    SELECT consultation_fee INTO v_fee FROM doctors WHERE id = p_doctor_id;
    IF v_fee IS NULL THEN
        v_fee := 0.0;
    END IF;

    -- 4. Double-booking check is handled by the unique index: idx_appointments_no_double_booking
    
    -- 5. Insert
    INSERT INTO appointments (
        patient_id, doctor_id, clinic_id, date, time, status, reason, fee
    ) VALUES (
        v_patient_id, p_doctor_id, p_clinic_id, p_date, p_time, 'pending', p_reason, v_fee
    ) RETURNING * INTO v_appointment;

    -- 6. Audit Log
    INSERT INTO audit_logs (action_type, actor_id, target_id, metadata)
    VALUES ('appointment_booked', auth.uid(), v_appointment.id, jsonb_build_object('doctor_id', p_doctor_id));

    RETURN v_appointment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Patients can now only use the RPC to book, not raw INSERT.
-- (We dropped `appts_insert_patient` earlier).

-- 6. MESSAGING ENFORCEMENT
-- The original policy `msg_insert_participant` enforces `sender_id = auth.uid()`, which is good.
-- But wait, `sender_id` references `users(id)`. And `users(id)` is now strictly `auth.uid()`.
-- This is already secure, no schema changes needed, just verified.

