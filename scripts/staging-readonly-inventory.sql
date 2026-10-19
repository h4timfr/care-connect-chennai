-- Reviewed metadata/aggregate-only inventory for the known 00001-or-later baseline.
-- No connection string, automatic execution, custom function invocation or row data.
-- Verify careconnect-staging in the control plane BEFORE selecting the connection.
-- A missing relation/permission is a stop, never an instruction to create objects.
SELECT pg_catalog.jsonb_build_object(
  'ledger', (SELECT COALESCE(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations),
  'counts', jsonb_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'app_users', (SELECT count(*) FROM public.users),
    'patients', (SELECT count(*) FROM public.patients),
    'clinics', (SELECT count(*) FROM public.clinics),
    'doctors', (SELECT count(*) FROM public.doctors),
    'relationships', (SELECT count(*) FROM public.clinic_doctors),
    'schedules', (SELECT count(*) FROM public.doctor_schedules),
    'appointments', (SELECT count(*) FROM public.appointments),
    'conversations', (SELECT count(*) FROM public.conversations),
    'messages', (SELECT count(*) FROM public.messages),
    'storage_buckets', (SELECT count(*) FROM storage.buckets),
    'storage_objects', (SELECT count(*) FROM storage.objects)),
  'relations', (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname,
      'rls', c.relrowsecurity, 'forced_rls', c.relforcerowsecurity,
      'owner', pg_catalog.pg_get_userbyid(c.relowner), 'acl', c.relacl) ORDER BY n.nspname, c.relname)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private', 'storage') AND c.relkind IN ('r', 'p', 'v')),
  'policies', (SELECT jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename,
      'name', policyname, 'roles', roles, 'command', cmd, 'permissive', permissive,
      'using_hash', md5(COALESCE(qual, '')), 'check_hash', md5(COALESCE(with_check, '')))
      ORDER BY schemaname, tablename, policyname)
    FROM pg_catalog.pg_policies WHERE schemaname IN ('public', 'private', 'storage')),
  'functions', (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', p.proname,
      'arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'security_settings', (SELECT jsonb_agg(setting) FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%' OR setting LIKE 'row_security=%'),
      'acl', p.proacl,
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'definition_hash', md5(pg_catalog.pg_get_functiondef(p.oid)))
      ORDER BY n.nspname, p.proname, p.oid)
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND p.prokind IN ('f', 'p')),
  'column_grants', (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname,
      'column', a.attname, 'acl', a.attacl) ORDER BY n.nspname, c.relname, a.attnum)
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private') AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
  'default_grants', (SELECT jsonb_agg(jsonb_build_object('role', pg_catalog.pg_get_userbyid(d.defaclrole),
      'schema', n.nspname, 'type', d.defaclobjtype, 'acl', d.defaclacl) ORDER BY d.oid)
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace),
  'publications', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', pubname, 'all_tables', puballtables,
      'insert', pubinsert, 'update', pubupdate, 'delete', pubdelete, 'truncate', pubtruncate) ORDER BY pubname), '[]'::jsonb)
    FROM pg_catalog.pg_publication),
  'publication_members', (SELECT COALESCE(jsonb_agg(jsonb_build_object('publication', pubname,
      'schema', schemaname, 'table', tablename) ORDER BY pubname, schemaname, tablename), '[]'::jsonb)
    FROM pg_catalog.pg_publication_tables),
  'extensions', (SELECT jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) ORDER BY extname)
    FROM pg_catalog.pg_extension),
  'sessions', (SELECT jsonb_agg(row_to_json(s)) FROM (
      SELECT backend_type, state, count(*) AS count FROM pg_catalog.pg_stat_activity
      WHERE datname = current_database() GROUP BY backend_type, state ORDER BY backend_type, state) s),
  'cron_job_catalog_present', pg_catalog.to_regclass('cron.job') IS NOT NULL,
  'subscriptions', (SELECT count(*) FROM pg_catalog.pg_subscription WHERE subdbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
) AS readiness_metadata;
