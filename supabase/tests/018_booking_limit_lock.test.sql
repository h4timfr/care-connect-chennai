BEGIN;
SELECT extensions.plan(1);

WITH booking_definition AS (
  SELECT pg_catalog.upper(pg_catalog.pg_get_functiondef(
    'public.book_appointment(uuid,uuid,date,time without time zone,text)'::regprocedure
  )) AS body
)
SELECT extensions.ok(
  pg_catalog.strpos(body, 'FOR UPDATE') > 0
  AND pg_catalog.strpos(body, 'FOR UPDATE') < pg_catalog.strpos(body, 'SELECT COUNT(*)'),
  'book_appointment locks the authenticated patient row before counting active bookings'
)
FROM booking_definition;

SELECT * FROM extensions.finish();
ROLLBACK;
