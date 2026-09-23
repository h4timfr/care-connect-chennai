-- Allow clinic staff to read patients who have appointments or conversations with their clinic
CREATE POLICY patients_read_staff ON public.patients FOR SELECT USING (
  id IN (
    SELECT patient_id FROM public.appointments
    WHERE clinic_id IN (SELECT private.user_clinic_ids())
  )
  OR
  id IN (
    SELECT patient_id FROM public.conversations
    WHERE clinic_id IN (SELECT private.user_clinic_ids())
  )
);
