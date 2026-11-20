
#!/usr/bin/env bash
# Runs without elevated privileges inside the private daemon's namespace.
set -euo pipefail
umask 077

network=$CARECONNECT_DOCKER_NETWORK
run_label=$CARECONNECT_DOCKER_RUN_LABEL
record="$RUNNER_TEMP/careconnect-docker-network-owned.json"
mkdir -p test-artifacts

docker_bounded() { timeout --signal=TERM --kill-after=5s 20s docker "$@"; }

remove_owned_containers() {
  local ids id mode
  ids=$(docker_bounded ps -aq --no-trunc) || return 1
  [[ -z "$ids" ]] && return 0
  while IFS= read -r id; do
    [[ "$id" =~ ^[a-f0-9]{64}$ ]] || return 1
    mode=$(docker_bounded container inspect --format '{{.HostConfig.NetworkMode}}' "$id") || return 1
    [[ "$mode" == "$network" ]] || return 1
  done <<<"$ids"
  while IFS= read -r id; do
    docker_bounded rm -f -v "$id" >/dev/null || return 1
  done <<<"$ids"
  ids=$(docker_bounded ps -aq) && [[ -z "$ids" ]]
}

case "$1" in
  prepare)
    if [[ "${2:-real-service}" == reconciliation ]]; then
      node scripts/verify-disposable-docker-bindings.mjs create "$network" "$run_label" test-artifacts/docker-network-summary.json "$record"
      exit
    fi
    test ! -e supabase/config.toml
    test ! -e supabase/.temp/linked-project.json
    test ! -e supabase/.temp/project-ref
    node scripts/real-service-integration.mjs preflight-inputs
    supabase init --yes >/dev/null 2>&1
    node scripts/real-service-integration.mjs preflight
    node scripts/startup-evidence.mjs configure "$network" supabase/config.toml
    node scripts/real-service-integration.mjs preflight
    node scripts/startup-evidence.mjs before "$network" test-artifacts/startup-images-before.json
    node scripts/verify-disposable-docker-bindings.mjs create "$network" "$run_label" test-artifacts/docker-network-summary.json "$record"
    ;;
  start)
    node scripts/service-execution-boundary.mjs
    cat "$CARECONNECT_ISOLATION_ROOT/pre-start-proof.json" > test-artifacts/docker-pre-start-proof.json
    outcome=success
    if [[ "${2:-real-service}" == reconciliation ]]; then
      code=0
      node scripts/staging-reconciliation-rehearsal.mjs --start || code=$?
      if (( code == 0 )); then
        node scripts/verify-disposable-docker-bindings.mjs verify "$network" \
          "$RUNNER_TEMP/careconnect-staging-rehearsal/repo/supabase/config.toml" \
          test-artifacts/docker-network-summary.json "$run_label" success
      fi
      exit "$code"
    fi
    if timeout --signal=TERM --kill-after=15s 25m node scripts/startup-observer.mjs run "$network" "$network"; then
      code=0
    else
      code=$?
      outcome=failure
    fi
    if read -r cli_status elapsed_ms < <(node -e 'const p = require("./test-artifacts/startup-process.json"); console.log(p.cli_exit_code ?? "unavailable", p.elapsed_ms ?? 0)'); then
      if [[ "$cli_status" == 0 ]]; then
        node scripts/real-service-integration.mjs startup-summary "$cli_status" "$elapsed_ms"
      else
        node scripts/real-service-integration.mjs startup-failure-summary "$cli_status" "$elapsed_ms"
      fi
    fi
    node scripts/startup-evidence.mjs after "$network" test-artifacts/startup-evidence.json "$network" "$outcome"
    node scripts/verify-disposable-docker-bindings.mjs verify "$network" supabase/config.toml \
      test-artifacts/docker-network-summary.json "$run_label" "$outcome"
    exit "$code"
    ;;
  test)
    node scripts/service-execution-boundary.mjs
    if [[ "${2:-real-service}" == reconciliation ]]; then
      exec timeout --signal=TERM --kill-after=15s 35m node scripts/staging-reconciliation-rehearsal.mjs --execute
    fi
    node scripts/real-service-integration.mjs verify-migrations
    node scripts/run-sql-ci-step.mjs ledger
    node scripts/run-sql-ci-step.mjs pgtap
    node scripts/run-sql-ci-step.mjs concurrency
    timeout --signal=TERM --kill-after=15s 35m node scripts/real-service-integration.mjs run
    ;;
  pgtap-run)
    node scripts/service-execution-boundary.mjs check
    shift
    (( $# > 0 ))
    for file in "$@"; do
      [[ "$file" =~ ^supabase/tests/[0-9]{3}_[a-z0-9_]+[.]test[.]sql$ && -f "$file" ]]
    done
    test_paths=()
    for file in "$@"; do test_paths+=("/tests/""${file##*/}"); done
    database="supabase_db_$network"
    db_sql() { docker_bounded exec --user postgres "$database" psql -XAtq -v ON_ERROR_STOP=1 -d postgres -c "$1"; }
    installed=$(db_sql "SELECT count(*) FROM pg_extension WHERE extname = 'pgtap'")
    [[ "$installed" == 0 || "$installed" == 1 ]]
    if [[ "$installed" == 0 ]]; then
      db_sql "CREATE EXTENSION pgtap WITH SCHEMA extensions"
    fi
    result=0
    # The pinned CLI passes label:disable for pg_prove. Run its same image on
    # the owned bridge with Engine defaults and a read-only SQL directory.
    timeout --signal=TERM --kill-after=15s 12m docker run --rm --pull never \
      --network "$network" -v "$PWD/supabase/tests:/tests:ro" -w /tests \
      -e PGHOST=db -e PGPORT=5432 -e PGUSER=postgres -e PGDATABASE=postgres -e PGPASSWORD=postgres \
      public.ecr.aws/supabase/pg_prove:3.36 pg_prove --ext .pg --ext .sql -r "${test_paths[@]}" || result=$?
    if [[ "$installed" == 0 ]]; then db_sql "DROP EXTENSION pgtap"; fi
    exit "$result"
    ;;
  cleanup)
    node scripts/service-execution-boundary.mjs check
    code=0
    if ! node scripts/startup-observer.mjs reap "$network"; then code=1; fi
    status=PASS
    if ! remove_owned_containers >"$RUNNER_TEMP/stop.raw" 2>&1; then
      code=1
      status=FAIL
    fi
    node -e 'require("fs").writeFileSync("test-artifacts/docker-stop-summary.json", JSON.stringify({status: process.argv[1]}) + "\n", {mode:0o600})' "$status"
    node scripts/verify-disposable-docker-bindings.mjs cleanup "$network" "$record" \
      test-artifacts/docker-network-cleanup-summary.json || code=1
    exit "$code"
    ;;
  *) exit 78 ;;
esac
