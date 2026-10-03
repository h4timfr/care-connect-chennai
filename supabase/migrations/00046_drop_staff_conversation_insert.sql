-- Product decision: clinic staff do not create conversations. Only patient-side code does (ensureConversation), and the
-- patient policy conv_insert_patient remains. Removing the staff insert policy also closes the escalation path in which
-- staff could open a conversation for ANY patient_id and then read that patient via get_clinic_patient_ids().
DROP POLICY IF EXISTS conv_insert_staff ON public.conversations;
