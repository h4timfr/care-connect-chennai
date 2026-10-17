# CareConnect SQL test execution preparation

Updated 2026-10-13. This report records local inspection and CI preparation. No
database container was started and no SQL test executed.

## Current checkout

- Branch: `claude/careconnect-frontend-repair`
- HEAD: `47067572cea9dce612db5c34c24b2c0339f83be5`
- At inspection, the branch was two commits ahead of `origin/claude/careconnect-frontend-repair`.
- Existing user changes were preserved: 10 modified tracked files and 2 untracked files, including
  `docs/overnight-engineering-report.md` and `supabase/tests/016_realtime_publication.test.sql`.
- The SQL workflow is now present at `.github/workflows/sql-tests.yml`. There is still no checked-in
  `supabase/config.toml`; the workflow creates it on the ephemeral runner with `supabase init --yes`.
- A prior temporary SQL-preparation directory was not present in the current execution environment's
  temp locations. `supabase/.temp` contains CLI/service version metadata, not the proposed migration
  copies or test-preparation README.

## Runner path prepared

The repository is public. GitHub's current runner documentation specifies that standard
`ubuntu-24.04` runners for public repositories are 4 vCPU, 16 GB RAM, and 14 GB SSD, with standard
runner usage free and unlimited for public repositories. The Supabase CLI recommends at least 7 GB
RAM for its full local stack. This is a better fit than the Windows host's previously reported
1.6 GB available RAM. Sources: [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-test-db).

GitHub reports no existing workflow runs for this branch. The repository Actions setting itself
could not be read, so whether Actions is enabled is not confirmed. The workflow added at
`.github/workflows/sql-tests.yml` runs on pushes to
`claude/careconnect-frontend-repair` when migrations, SQL tests, local Supabase config, or the
workflow itself change. It also declares `workflow_dispatch`; GitHub only exposes manual dispatch
once the workflow file exists on the repository's default branch. This push trigger provides the
first-run path from the feature branch without requiring a merge. The workflow uses a fresh local
Supabase stack, grants its token read-only contents permission, and passes no
Supabase credentials. It generates `supabase/config.toml` on the ephemeral runner with `supabase
init --yes`, starts the isolated local stack, records the local migration ledger, and runs all
`supabase/tests/*.test.sql` files including 016. The CLI is pinned to 2.117.0 (the version recorded
in the local Supabase CLI metadata); GitHub Actions are pinned to release commit SHAs. Logs are
uploaded for seven days, with local JWT/API keys and DB URLs redacted from startup output.

This workflow is prepared but **not run**. It requires the approved branch changes to be pushed and
GitHub Actions to be enabled for the repository. The repository Actions setting and actual
execution are unverified. No workflow run occurred while preparing this report.

## Migration facts and constraints

- The checked-in chain contains `00001–00023` and `00045–00059`; `00024–00044` are absent. No
  missing SQL was reconstructed. A clean local replay can only establish behavior of the available
  files, not reconcile any hosted migration ledger.
- `00008_demo_seed.sql` inserts six clinics, twelve doctors, their clinic links, and schedule rows
  using synthetic/demo content. It is part of the migration chain. The proposed workflow runs only
  on a fresh disposable runner database; it does not import `candidates-import.sql` or candidate
  records into provider tables.
- `00009_production_hardening.sql` unconditionally updates all existing clinic, doctor, user, and
  patient rows to `is_demo = true`. The source does not inspect provenance. That is only safe on a
  known-empty application schema after demo seeding; it must not be replayed over real populated
  data without a separately reviewed migration strategy.
- In `00009`, the publication-absent branch creates `supabase_realtime FOR ALL TABLES` and then
  attempts to add `public.messages` individually. PostgreSQL does not permit adding a table to an
  all-tables publication. Whether the default local stack enters this branch requires execution.
- `00010_security_fixes.sql` drops and recreates `supabase_realtime` with only `public.messages`.
  That is reproducible on an empty local test stack but removes other publication memberships on
  any environment where they exist. The workflow is strictly fresh/local and does not establish
  that the migration is safe for an existing installation.
- `00006` drops `clinic_staff`; migrations `00010–00012` still reference it in appointment trigger
  functions, and `00013` replaces those functions. The final state and migration replay remain to
  be established by database execution.
- An earlier handoff flagged a fixture collision in tests 002/004 when 00008 is present. This
  inspection found no primary-key overlap between their `e...` clinic/doctor IDs and 00008's
  `111...`/`222...`/`aaa...` demo IDs, and their fixture names also differ. The precise reported
  collision is therefore **not statically established**; other constraints or global assertions
  still need execution to resolve it.
- Test 004 now correctly labels its duplicate booking check as sequential; it does not demonstrate
  simultaneous requests. Test 016 verifies publication catalog membership only; it is not an
  authenticated Realtime confidentiality test. No genuine two-session concurrency or Realtime
  client test has been added by this preparation.
- Tests 001–016 use pgTAP. Tests requiring Auth roles/claims and Storage cannot be faithfully
  validated by a bare PostgreSQL image. The workflow keeps the Supabase Auth, Storage, and Realtime
  components in the local stack.

## Commands and actual results

- `git status --short --branch`, `git log -5 --oneline --decorate`, `git diff --stat`, `git diff`,
  and `git diff --check` — inspected; the pre-preparation `git diff --check` had no whitespace
  errors.
- `docker info`, `docker ps -a`, and `docker image ls` — **not available from this Codex execution
  environment**. Each failed at `//./pipe/dockerDesktopLinuxEngine` with “The system cannot find
  the file specified.” No retries, image pulls, or container starts were attempted. The user's
  report that Docker is healthy in normal PowerShell is not contradicted; this shell cannot reach
  that engine.
- `Get-PSDrive C` — 146.38 GiB free.
- `Get-CimInstance Win32_OperatingSystem` — blocked by execution-environment access denial; current
  RAM was not re-measured. No memory troubleshooting was attempted.
- `npm run lint` — **PASS**, exit 0.
- `npm run typecheck` — **PASS**, exit 0.
- `npx playwright test --list --reporter=line` — **PASS, discovery only**; 267 tests across 17
  files. Browser tests did not execute.
- `npm run build` with `VITE_SUPABASE_URL=https://careconnect-test.invalid` and a dummy publishable
  key — **FAIL, environment restriction**: Nitro tracing raised `EPERM` while resolving
  `node_modules/tslib/modules/index.js`. The build emitted no production deployment.
- SQL tests 001–016 — **NOT RUN**. No shared database was accessed.

## Next step

After reviewing and authorizing the branch push, the scoped push trigger will start “Isolated
CareConnect SQL tests.” The workflow will report a migration failure rather than skip or mask it.
If it fails at 00009, retain the logs and prepare a separately reviewed test-only correction before
any shared-environment migration plan. Staging and production migration histories remain
unreconciled and out of scope.

No container images or external compute resources were used during this preparation. The proposed
public GitHub runner has no runner-minute charge under GitHub's published public-repository policy;
repository Actions enablement and actual execution remain unverified. No Supabase project, Vercel
project, or Git remote was modified.
