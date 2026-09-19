-- 00015_atomic_toggles.sql
-- Atomic RPCs for toggling saved doctors and clinics to prevent read-modify-write race conditions.
-- Derives identity securely from auth.uid().

CREATE OR REPLACE FUNCTION public.toggle_saved_doctor(p_doctor_id UUID)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_current_ids UUID[];
    v_new_ids TEXT[];
BEGIN
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update atomically using array_remove and array_append
    -- First try to remove it. If the array doesn't change size, it wasn't there, so append it.
    UPDATE public.patients
    SET saved_doctor_ids = 
        CASE 
            WHEN p_doctor_id::TEXT = ANY(saved_doctor_ids) THEN array_remove(saved_doctor_ids, p_doctor_id::TEXT)
            ELSE array_append(COALESCE(saved_doctor_ids, ARRAY[]::TEXT[]), p_doctor_id::TEXT)
        END
    WHERE user_id = v_user_id
    RETURNING saved_doctor_ids INTO v_new_ids;

    RETURN v_new_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_saved_clinic(p_clinic_id UUID)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_current_ids UUID[];
    v_new_ids TEXT[];
BEGIN
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.patients
    SET saved_clinic_ids = 
        CASE 
            WHEN p_clinic_id::TEXT = ANY(saved_clinic_ids) THEN array_remove(saved_clinic_ids, p_clinic_id::TEXT)
            ELSE array_append(COALESCE(saved_clinic_ids, ARRAY[]::TEXT[]), p_clinic_id::TEXT)
        END
    WHERE user_id = v_user_id
    RETURNING saved_clinic_ids INTO v_new_ids;

    RETURN v_new_ids;
END;
$$;

-- Revoke execute from public
REVOKE EXECUTE ON FUNCTION public.toggle_saved_doctor(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_saved_doctor(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_saved_doctor(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.toggle_saved_clinic(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_saved_clinic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_saved_clinic(UUID) TO authenticated;
