BEGIN;
SELECT extensions.plan(6);

-- The public catalog queries in src/lib/supabase/queries.ts require these
-- columns. Report the exact missing names when a database is only partly
-- migrated, before a Preview deployment starts returning REST 400s.
SELECT extensions.is(
  (SELECT COALESCE(string_agg(required.column_name, ', ' ORDER BY required.column_name), '')
   FROM unnest(ARRAY[
     'id', 'name', 'address', 'area', 'about', 'specialty_ids', 'services',
     'facilities', 'languages', 'opening_hours', 'fee_range', 'rating',
     'review_count', 'is_demo', 'clinic_verification_state', 'is_published',
     'patient_contact_permission', 'booking_enabled'
   ]) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns AS actual
     WHERE actual.table_schema = 'public'
       AND actual.table_name = 'clinics'
       AND actual.column_name = required.column_name
   )),
  '',
  'public.clinics has every column selected by the public catalog query'
);

SELECT extensions.is(
  (SELECT COALESCE(string_agg(required.column_name, ', ' ORDER BY required.column_name), '')
   FROM unnest(ARRAY[
     'id', 'name', 'gender', 'experience_years', 'consultation_fee', 'about',
     'specialty_id', 'qualifications', 'languages', 'services', 'rating',
     'review_count', 'registration_note', 'is_demo'
   ]) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns AS actual
     WHERE actual.table_schema = 'public'
       AND actual.table_name = 'doctors'
       AND actual.column_name = required.column_name
   )),
  '',
  'public.doctors has every column selected by the public catalog query'
);

SELECT extensions.is(
  (SELECT COALESCE(string_agg(required.column_name, ', ' ORDER BY required.column_name), '')
   FROM unnest(ARRAY['clinic_id', 'doctor_id', 'active', 'verification_state'])
     AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns AS actual
     WHERE actual.table_schema = 'public'
       AND actual.table_name = 'clinic_doctors'
       AND actual.column_name = required.column_name
   )),
  '',
  'public.clinic_doctors has every column needed by the nested doctor query'
);

-- PostgREST's nested clinic_doctors!inner(..., clinics!inner(...)) selection
-- requires foreign keys from the link table to both embedded parents.
SELECT extensions.is(
  (SELECT count(*)::int FROM pg_constraint AS fk
   WHERE fk.conrelid = 'public.clinic_doctors'::regclass
     AND fk.contype = 'f'
     AND fk.confrelid IN ('public.clinics'::regclass, 'public.doctors'::regclass)),
  2,
  'clinic_doctors has foreign keys to clinics and doctors for nested public reads'
);

-- Exercise the selected columns and joins as the anonymous database role.
-- Test 015 separately proves positive and forbidden row visibility with fixtures;
-- these checks catch missing grants and policy recursion even with no catalog rows.
SET LOCAL role anon;
SELECT extensions.lives_ok(
  $$ SELECT id, name, address, area, about, specialty_ids, services, facilities,
            languages, opening_hours, fee_range, rating, review_count, is_demo,
            clinic_verification_state, is_published, patient_contact_permission,
            booking_enabled
     FROM public.clinics
     WHERE clinic_verification_state = 'verified' AND is_published AND NOT is_demo $$,
  'anonymous public clinic projection executes with final grants and RLS'
);
SELECT extensions.lives_ok(
  $$ SELECT d.id, d.name, d.gender, d.experience_years, d.consultation_fee,
            d.about, d.specialty_id, d.qualifications, d.languages, d.services,
            d.rating, d.review_count, d.registration_note, d.is_demo,
            cd.clinic_id, cd.active, cd.verification_state,
            c.clinic_verification_state, c.is_published,
            c.patient_contact_permission, c.booking_enabled
     FROM public.doctors AS d
     JOIN public.clinic_doctors AS cd ON cd.doctor_id = d.id
     JOIN public.clinics AS c ON c.id = cd.clinic_id
     WHERE NOT d.is_demo AND cd.active AND cd.verification_state = 'verified'
       AND c.clinic_verification_state = 'verified' AND c.is_published $$,
  'anonymous nested doctor projection executes with final grants and RLS'
);
RESET role;

SELECT * FROM extensions.finish();
ROLLBACK;
