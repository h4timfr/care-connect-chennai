BEGIN;
SELECT extensions.plan(4);

SELECT extensions.is(
  (SELECT count(*)::int FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'),
  1,
  'the application Realtime publication exists'
);

SELECT extensions.is(
  (SELECT puballtables FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'),
  false,
  'the application publication is not FOR ALL TABLES'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime'),
  1,
  'the application publication contains exactly one table'
);

SELECT extensions.is(
  (SELECT count(*)::int FROM pg_catalog.pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'messages'),
  1,
  'only public.messages is published for Realtime'
);

SELECT * FROM extensions.finish();
ROLLBACK;
