# CareConnect: Booking Architecture

The booking engine relies exclusively on PostgreSQL RPC functions (`book_appointment`) rather than raw `INSERT` queries from the client.

## Security Boundaries

### 1. Client Layer

The client is responsible only for passing non-trusted inputs:

- `doctorId` (uuid)
- `clinicId` (uuid)
- `date` (string)
- `time` (string)
- `reason` (string)

The frontend **never** passes `patientId`, `status`, or `fee`.

### 2. Database RPC (`book_appointment`)

1. **Identity Resolution:** Extracts `auth.uid()` and maps it to the `patient_id`. Aborts if the user isn't a registered patient.
2. **Entity Validation:** Confirms `doctor_id` works at `clinic_id`.
3. **Fee Calculation:** Reads `consultation_fee` from the `doctors` table securely on the backend.
4. **Concurrency:** Relies on `idx_appointments_no_double_booking` to gracefully throw a Postgres unique constraint exception (`23505`) if another transaction grabs the exact slot simultaneously.
5. **Auditing:** Emits a record to `audit_logs` before returning the confirmed `appointment`.
