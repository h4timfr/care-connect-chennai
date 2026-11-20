-- General clinic conversations already have their own patient/clinic key.
-- Keep appointment threads independent, including when two tabs open one at once.
-- A target with historical duplicates must reconcile them before applying this index.
CREATE UNIQUE INDEX conversations_one_thread_per_appointment
    ON public.conversations (appointment_id)
    WHERE kind = 'appointment' AND appointment_id IS NOT NULL;
