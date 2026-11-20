DO $realtime_readiness$
DECLARE
  messages_oid oid := 'public.messages'::regclass::oid;
  replica_identity "char";
BEGIN
  IF current_setting('wal_level') <> 'logical' THEN
    RAISE EXCEPTION 'Realtime requires logical WAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
      AND pubinsert
  ) THEN
    RAISE EXCEPTION 'supabase_realtime publication is missing INSERT support';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    RAISE EXCEPTION 'public.messages is not in supabase_realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index
    WHERE indrelid = messages_oid
      AND indisprimary
  ) THEN
    RAISE EXCEPTION 'public.messages has no primary key for default replica identity';
  END IF;

  SELECT relreplident INTO replica_identity
  FROM pg_catalog.pg_class
  WHERE oid = messages_oid;

  IF replica_identity = 'n' THEN
    RAISE EXCEPTION 'public.messages disables replica identity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid = messages_oid
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'public.messages row-level security is disabled';
  END IF;
END
$realtime_readiness$;
