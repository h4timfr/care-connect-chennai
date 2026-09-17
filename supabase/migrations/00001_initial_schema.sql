-- Phase 3: Enums / Status Model

CREATE TYPE user_role AS ENUM (
    'patient',
    'doctor',
    'clinic_staff',
    'clinic_admin',
    'platform_admin'
);

CREATE TYPE appointment_status AS ENUM (
    'pending',
    'confirmed',
    'arrived',
    'completed',
    'cancelled'
);

CREATE TYPE gender_type AS ENUM (
    'male',
    'female',
    'other'
);

CREATE TYPE conversation_kind AS ENUM (
    'appointment',
    'general'
);

-- Phase 2: Database Migration (Tables)

-- USERS Table
-- Tied to Supabase Auth UUID (auth.users) via user_id conceptually, but we store our custom data here.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE, -- Can link to auth.users if needed
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    role user_role NOT NULL DEFAULT 'patient',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- PATIENTS Table
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    gender gender_type,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- CLINICS Table
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    area TEXT,
    lat NUMERIC,
    lng NUMERIC,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    about TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- CLINIC STAFF Table
CREATE TABLE clinic_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(user_id, clinic_id)
);

-- DOCTORS Table
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    gender gender_type,
    experience_years INTEGER NOT NULL DEFAULT 0,
    consultation_fee NUMERIC NOT NULL DEFAULT 0.0,
    about TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- CLINIC DOCTORS (Many to Many)
CREATE TABLE clinic_doctors (
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    PRIMARY KEY (clinic_id, doctor_id)
);

-- DOCTOR SCHEDULES
CREATE TABLE doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(doctor_id, clinic_id, day_of_week)
);

-- APPOINTMENTS Table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status appointment_status NOT NULL DEFAULT 'pending',
    reason TEXT,
    fee NUMERIC NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- PHASE 5: APPOINTMENT CONCURRENCY
-- Partial unique index to prevent double bookings only for active states
CREATE UNIQUE INDEX idx_appointments_no_double_booking 
ON appointments (doctor_id, date, time) 
WHERE status IN ('pending', 'confirmed');

-- CONVERSATIONS Table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    kind conversation_kind NOT NULL DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- MESSAGES Table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- PHASE 6: ROW LEVEL SECURITY (RLS) Configuration

-- Enable RLS on all user-owned/private tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Note: 'clinics' might be public read, but restricted write. We will enable RLS and allow public reads.
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user ID in RLS policies if linking directly to auth.uid()
-- Assuming auth_id matches auth.uid(), we can use: (SELECT id FROM users WHERE auth_id = auth.uid())
-- Or we just assume `users.id` IS `auth.uid()` for simplicity. We will assume users.id = auth.uid() in Supabase.
-- So we can use auth.uid() directly for users.id.

-- 1. USERS
-- Users can read and update their own profile
CREATE POLICY users_read_self ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update_self ON users FOR UPDATE USING (id = auth.uid());

-- 2. PATIENTS
-- Patients can read and update their own profile
CREATE POLICY patients_read_self ON patients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY patients_update_self ON patients FOR UPDATE USING (user_id = auth.uid());

-- 3. CLINICS
-- Public can read clinics
CREATE POLICY clinics_read_public ON clinics FOR SELECT USING (true);
-- Clinic admins can update their clinic
CREATE POLICY clinics_update_admin ON clinics FOR UPDATE USING (
    id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid() AND is_admin = true)
);

-- 4. CLINIC STAFF
-- Staff can read themselves and other staff in their clinic
CREATE POLICY staff_read_clinic ON clinic_staff FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);
-- Clinic admins can manage staff in their clinic
CREATE POLICY staff_all_admin ON clinic_staff USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid() AND is_admin = true)
);

-- 5. DOCTORS
-- Public can read doctors
CREATE POLICY doctors_read_public ON doctors FOR SELECT USING (true);
-- Doctors can update their own profile
CREATE POLICY doctors_update_self ON doctors FOR UPDATE USING (user_id = auth.uid());
-- Clinic staff can update doctors linked to their clinic
CREATE POLICY doctors_update_staff ON doctors FOR UPDATE USING (
    id IN (
        SELECT doctor_id FROM clinic_doctors 
        WHERE clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
    )
);

-- 6. CLINIC DOCTORS (Junction)
-- Public can read
CREATE POLICY clinic_doctors_read_public ON clinic_doctors FOR SELECT USING (true);
-- Clinic staff can manage
CREATE POLICY clinic_doctors_all_staff ON clinic_doctors USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);

-- 7. DOCTOR SCHEDULES
-- Public can read schedules
CREATE POLICY schedules_read_public ON doctor_schedules FOR SELECT USING (true);
-- Clinic staff can manage schedules for their clinic
CREATE POLICY schedules_all_staff ON doctor_schedules USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);

-- 8. APPOINTMENTS
-- Patients can read their own appointments
CREATE POLICY appts_read_patient ON appointments FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
);
-- Patients can create their own appointments
CREATE POLICY appts_insert_patient ON appointments FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
);
-- Patients can update their own appointments (e.g. to cancel)
CREATE POLICY appts_update_patient ON appointments FOR UPDATE USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
);
-- Clinic staff can read and update appointments in their clinic
CREATE POLICY appts_read_staff ON appointments FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);
CREATE POLICY appts_update_staff ON appointments FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);

-- 9. CONVERSATIONS
-- Patients can read conversations they are part of
CREATE POLICY conv_read_patient ON conversations FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
);
-- Patients can create conversations they are part of
CREATE POLICY conv_insert_patient ON conversations FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
);
-- Clinic staff can read conversations in their clinic
CREATE POLICY conv_read_staff ON conversations FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);
-- Clinic staff can create conversations for their clinic
CREATE POLICY conv_insert_staff ON conversations FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
);

-- 10. MESSAGES
-- Senders can insert messages if they have access to the conversation
CREATE POLICY msg_insert_participant ON messages FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    (
        -- Sender is the patient
        conversation_id IN (
            SELECT id FROM conversations WHERE patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
        )
        OR
        -- Sender is clinic staff
        conversation_id IN (
            SELECT id FROM conversations WHERE clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
        )
    )
);
-- Users can read messages if they have access to the conversation
CREATE POLICY msg_read_participant ON messages FOR SELECT USING (
    (
        -- Reader is the patient
        conversation_id IN (
            SELECT id FROM conversations WHERE patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
        )
    )
    OR
    (
        -- Reader is clinic staff
        conversation_id IN (
            SELECT id FROM conversations WHERE clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())
        )
    )
);
