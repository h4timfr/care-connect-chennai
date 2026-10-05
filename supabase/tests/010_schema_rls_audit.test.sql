BEGIN;
SELECT extensions.plan(7);

-- Schema-wide invariants, so a future migration can't quietly reintroduce RLS recursion (42P17),
-- an RLS-less table or an unsafe SECURITY DEFINER helper.

SELECT extensions.is(
    (SELECT coalesce(array_agg(relname::text ORDER BY relname), '{}') FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity),
    '{}'::text[], 'every public table has row level security enabled'
);
SELECT extensions.is(
    (SELECT coalesce(array_agg(p.oid::regprocedure::text ORDER BY 1), '{}') FROM pg_proc p
     WHERE p.prosecdef AND p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace)
       AND NOT coalesce(p.proconfig, '{}') && ARRAY['search_path=""', 'search_path=']),
    '{}'::text[], 'every SECURITY DEFINER function pins an empty search_path'
);
SELECT extensions.is(
    (SELECT coalesce(array_agg(p.oid::regprocedure::text ORDER BY 1), '{}') FROM pg_proc p
     WHERE p.pronamespace = 'private'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')),
    '{}'::text[], 'anon cannot execute any private helper'
);
SELECT extensions.is(
    (SELECT coalesce(array_agg(DISTINCT p.proname::text ORDER BY p.proname::text), '{}') FROM pg_proc p
     WHERE p.prosecdef AND p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')),
    ARRAY['get_doctor_slots'], 'anon can execute only the public slot lookup among definer functions'
);

-- Reading every public table as each kind of caller must never recurse. Permission errors are the
-- expected answer for anon on private tables; only 42P17 counts as a failure.
CREATE TEMP TABLE recursion_hits (who text, tbl text) ON COMMIT DROP;
GRANT INSERT ON recursion_hits TO anon, authenticated;

CREATE FUNCTION pg_temp.sweep(who text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname);
    EXCEPTION
      WHEN SQLSTATE '42P17' THEN INSERT INTO recursion_hits VALUES (who, t.relname);
      WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000001a1', 'sweep@test.com', now(), now());

SET LOCAL role anon;
SELECT pg_temp.sweep('anon');
RESET role;

SET LOCAL request.jwt.claims TO '{"role": "authenticated"}';
SET LOCAL role authenticated;
SELECT pg_temp.sweep('authenticated without user id');
RESET role;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT pg_temp.sweep('patient');
RESET role;

SELECT extensions.is((SELECT count(*)::int FROM recursion_hits WHERE who = 'anon'), 0, 'no table recurses for anon');
SELECT extensions.is((SELECT count(*)::int FROM recursion_hits WHERE who = 'authenticated without user id'), 0, 'no table recurses for a session without a user id');
SELECT extensions.is((SELECT count(*)::int FROM recursion_hits WHERE who = 'patient'), 0, 'no table recurses for a signed-in patient');

SELECT * FROM extensions.finish();
ROLLBACK;
