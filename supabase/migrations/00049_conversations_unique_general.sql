-- Verified on production: index absent, 0 conversations, 0 duplicate (patient_id, clinic_id) general groups.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_patient_clinic
    ON public.conversations (patient_id, clinic_id)
    WHERE kind = 'general';
