CREATE OR REPLACE FUNCTION public.check_clinic_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent altering primary key
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify primary key';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_check_clinic_update ON public.clinics;
CREATE TRIGGER trg_check_clinic_update
    BEFORE UPDATE ON public.clinics
    FOR EACH ROW
    EXECUTE FUNCTION public.check_clinic_update();
