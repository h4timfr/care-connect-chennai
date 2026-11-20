\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"f7600000-0000-4000-8000-000000000002","role":"authenticated"}',
  false
);
UPDATE public.doctors SET consultation_fee = 650
WHERE id = 'f7600000-0000-4000-8000-000000000005';
