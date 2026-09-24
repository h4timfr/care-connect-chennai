CREATE OR REPLACE FUNCTION public.check_doctor_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent altering primary key
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify primary key';
    END IF;

    -- user_id is immutable for everyone to prevent profile theft.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Cannot reassign doctor user_id';
    END IF;

    -- Block assignment of rating and review_count
    IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.review_count IS DISTINCT FROM OLD.review_count THEN
        RAISE EXCEPTION 'Cannot modify calculated rating fields';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
