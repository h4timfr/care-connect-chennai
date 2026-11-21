-- The legacy table has no caller-supplied sender role: the thread patient's user
-- ID defines a patient send, even when that account also has a staff role.
CREATE FUNCTION private.can_insert_clinic_message(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.conversations c
        JOIN public.patients p ON p.id = c.patient_id
        WHERE c.id = p_conversation_id
          AND p.user_id = (SELECT auth.uid())
          AND NOT private.clinic_patient_contactable(c.clinic_id)
    );
$$;

ALTER FUNCTION private.can_insert_clinic_message(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_insert_clinic_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_insert_clinic_message(uuid) TO authenticated;

-- Existing permissive policies continue to require an authorized sender and
-- sender_id = auth.uid(). The patient condition applies to every insert path.
CREATE POLICY msg_patient_requires_contactable_clinic ON public.messages
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (private.can_insert_clinic_message(conversation_id));

-- Expose only the name and messaging state for the caller's own clinic threads.
-- The private implementation can see historical clinics hidden by catalogue RLS.
CREATE FUNCTION private.patient_conversation_clinics(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid, clinic_name text, clinic_state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.id, cl.name,
        CASE
            WHEN cl.is_demo OR cl.clinic_verification_state <> 'verified' OR NOT cl.is_published
                THEN 'unavailable'
            WHEN private.clinic_patient_contactable(cl.id) THEN 'open'
            ELSE 'closed'
        END
    FROM public.conversations c
    JOIN public.patients p ON p.id = c.patient_id
    JOIN public.clinics cl ON cl.id = c.clinic_id
    WHERE p.user_id = (SELECT auth.uid())
      AND c.id = ANY(p_conversation_ids);
$$;

ALTER FUNCTION private.patient_conversation_clinics(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.patient_conversation_clinics(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.patient_conversation_clinics(uuid[]) TO authenticated;

CREATE FUNCTION public.patient_conversation_clinics(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid, clinic_name text, clinic_state text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT * FROM private.patient_conversation_clinics(p_conversation_ids);
$$;

REVOKE ALL ON FUNCTION public.patient_conversation_clinics(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_conversation_clinics(uuid[]) TO authenticated;
