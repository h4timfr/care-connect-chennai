\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object('sub', 'f7600000-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  false
);
SELECT public.admin_set_clinic_publication_state(
  'f7600000-0000-4000-8000-000000000004', 'verified', true, 'not_granted', :'booking_enabled'::boolean
);
