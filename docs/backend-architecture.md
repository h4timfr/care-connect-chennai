# CareConnect Backend Architecture Blueprint

This document outlines the proposed relational database architecture, security model, and migration strategy required to move CareConnect from local mock state to a PostgreSQL/Supabase backend.

## 1. Domain Model Audit Findings

Our inspection of the current `lib/types.ts` and `data/mock.ts` revealed several areas that need restructuring for a relational database:

- **Normalization:** `User`, `Patient`, and `ClinicStaff` models are currently blended or duplicated (e.g., `Appointment` storing `patientName` and `patientPhone`). These should be normalized. Appointments should `JOIN` patients for details.
- **Many-to-Many Relationships:** `Clinic.specialtyIds`, `Clinic.services`, and `Clinic.languages` should be junction tables rather than string arrays to allow complex querying and filtering. Doctors should also support many-to-many relationships with clinics, rather than a strict 1:N foreign key, as doctors often consult at multiple facilities.
- **Data Types:** Times are currently strings (`"17:30"`). They should be stored using standard Postgres `time` types, and `date` should use `date`.
- **Missing Foreign Keys:** `Message` uses a string `sender` ("patient" | "clinic"). This needs to be a foreign key to a generic `User` table to track _which_ clinic staff member sent a message.

## 2. Proposed Database Schema

### Users & Roles

- **`users`**
  - `id` (UUID, PK)
  - `role` (Enum: `patient`, `doctor`, `clinic_admin`, `clinic_staff`, `platform_admin`)
  - `email`, `phone` (Unique)
  - `created_at`, `updated_at`

### Entities

- **`patients`**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK to `users`, Unique)
  - `full_name`, `date_of_birth`, `gender`

- **`clinics`**
  - `id` (UUID, PK)
  - `name`, `address`, `lat`, `lng`, `phone`, `email`
  - `created_at`

- **`clinic_staff`**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK to `users`)
  - `clinic_id` (UUID, FK to `clinics`)
  - `role` (Enum: `admin`, `receptionist`)

- **`doctors`**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK to `users`, Nullable)
  - `name`, `gender`, `experience_years`, `consultation_fee`

- **`clinic_doctors`** (Junction)
  - `clinic_id` (UUID, FK), `doctor_id` (UUID, FK)

### Scheduling & Appointments

- **`doctor_schedules`**
  - `id` (UUID, PK)
  - `doctor_id` (UUID, FK)
  - `clinic_id` (UUID, FK)
  - `day_of_week` (Int 0-6)
  - `start_time`, `end_time`, `slot_minutes`

- **`appointments`**
  - `id` (UUID, PK)
  - `patient_id` (UUID, FK to `patients`)
  - `doctor_id` (UUID, FK to `doctors`)
  - `clinic_id` (UUID, FK to `clinics`)
  - `date` (Date), `time` (Time)
  - `status` (Enum: `pending`, `confirmed`, `arrived`, `completed`, `cancelled`)
  - `reason` (Text)
  - **Constraints:** Unique index on `(doctor_id, date, time)` where `status IN ('confirmed', 'pending')` to prevent double-booking.

### Messaging

- **`conversations`**
  - `id` (UUID, PK)
  - `clinic_id` (UUID, FK)
  - `patient_id` (UUID, FK)
  - `appointment_id` (UUID, FK, Nullable)

- **`messages`**
  - `id` (UUID, PK)
  - `conversation_id` (UUID, FK)
  - `sender_id` (UUID, FK to `users`)
  - `body` (Text), `created_at` (Timestamp)

## 3. Role & Access Model

- **Patient:** Can view public doctors/clinics. Can Create/Read/Update their own appointments. Can send messages in their own conversations.
- **Clinic Staff:** Can view/manage all appointments, doctors, and messages belonging to their specific `clinic_id`. Cannot modify clinic global settings.
- **Clinic Admin:** Has all staff privileges + can modify clinic profile, global settings, and add/remove doctors or staff.
- **Platform Admin:** Full access to all tables.

## 4. Security Model (Row Level Security - RLS)

Once migrated to Supabase, we will enforce strict RLS policies:

1. **Appointments:**
   - `SELECT`, `UPDATE` for Patients where `auth.uid() = patients.user_id`.
   - `SELECT`, `UPDATE` for Staff where `clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid())`.
2. **Conversations:**
   - Patients can only access where `patient_id = auth.uid()`.
   - Clinic staff can only access where `clinic_id = their_clinic_id`.
3. **Messages:**
   - Insert allowed only if the user has read access to the parent `conversation_id`.
4. **Users:**
   - Users can only update their own profile row.

## 5. Appointment Concurrency Strategy

The current mock implementation calculates availability using a deterministic hash function. Moving to Postgres, we must prevent race conditions (two patients booking the same slot at the exact same millisecond).

- **Solution:** Add a `UNIQUE` partial index on the `appointments` table: `CREATE UNIQUE INDEX no_double_booking ON appointments (doctor_id, date, time) WHERE status IN ('pending', 'confirmed');`
- **Result:** If a race condition occurs, Postgres will reject the second transaction with a unique constraint violation, which the frontend will catch and present as a "Slot no longer available" error.

## 6. Service Boundaries & Frontend Performance

**Current State:**
The application relies on a single monolithic `useApp()` Context that holds all arrays (appointments, doctors, messages). Any mutation (like sending a message) causes the entire context to recreate, triggering a full re-render of every subscribed component.

**Future Architecture (React Query):**
We will break `useApp()` into domain-specific hooks powered by `@tanstack/react-query`:

- `useAuth()` (Supabase Auth)
- `useAppointments(patientId)` (Fetches only relevant appointments)
- `useClinicAppointments(clinicId)`
- `useConversations()`
- `useDoctorSearch(filters)`

_Actionable UI Refactor:_ Components should stop extracting everything from `useApp()`. The transition will involve replacing `const { appointments } = useApp()` with `const { data: appointments } = useAppointments()`.

## 7. Secrets & Environment Audit

- **Audit Results:** The repository is clean. No hardcoded API keys, tokens, or Supabase URLs exist in the codebase.
- **`.gitignore` Check:** `.env`, `*.local`, and `.dev.vars` are correctly ignored.
- **Next Steps:** We will create `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when the backend phase begins.
