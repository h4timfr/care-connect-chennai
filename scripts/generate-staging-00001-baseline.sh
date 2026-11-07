#!/usr/bin/env bash
# Local-only canonical DDL capture. Requires PostgreSQL 17 binaries; no remote connection.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${PG_BIN:?Set PG_BIN to PostgreSQL 17 bin directory}"
"$PG_BIN/postgres" --version | grep -Eq 'PostgreSQL\) 17[.]'
data="$(mktemp -d "${TMPDIR:-/tmp}/careconnect-00001.XXXXXX")"
mkdir "$data/socket"
"$PG_BIN/initdb" -D "$data/db" -U postgres -A trust --no-locale > "$data/init.log"
running=0
cleanup() { if [ "$running" = 1 ]; then "$PG_BIN/pg_ctl" -D "$data/db" -m fast -w stop; fi; }
trap cleanup EXIT
"$PG_BIN/pg_ctl" -D "$data/db" -l "$data/server.log" -o "-c listen_addresses='' -c unix_socket_directories=$data/socket -c port=55439" -w start
running=1
psql=("$PG_BIN/psql" -X -h "$data/socket" -p 55439 -U postgres -v ON_ERROR_STOP=1)
# Signature stub permits policy DDL resolution only; this is NOT an Auth behavior test.
"${psql[@]}" -c 'CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;'
"${psql[@]}" --single-transaction -f "$root/supabase/migrations/00001_initial_schema.sql" > "$data/apply.log"
"${psql[@]}" -At -f "$root/scripts/staging-00001-semantic.sql" > "$data/fingerprint.json"
printf 'Canonical snapshot: %s\n' "$data/fingerprint.json"
# Keep the owned local data and logs for inspection; never read a linked project or env DB URL.
