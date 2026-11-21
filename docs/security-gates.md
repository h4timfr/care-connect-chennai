# Automated security gates

The security worktree starts at the live baseline `366ef27d728b623233cc414adeb4d558085fd8a4`. **PASS** cites an existing scoped control or prior evidence. **FIXED** means this branch adds an enforceable control or corrects a confirmed gap.

## Enforcement

- **Security gates** runs on pull requests, pushes to the connected branch and manual dispatch. The pinned Gitleaks image scans the tracked snapshot and the checked-out commit’s full reachable history. CI logs contain fixed failure summaries and do not publish scan reports. The only credential exceptions are for the public key format, known loopback fixture passwords and exact synthetic canaries.
- Install Gitleaks 8.30.1 and pre-commit on developer machines, then run `pre-commit install`. The hook checks staged content and the tracked private-file policy. CI provides centralized enforcement after integration.
- The Vercel build checks its final public output for private paths, source maps and recognized privileged credentials. Existing synthetic Preview and Production bundle tests still check cross-target and confidential canaries.
- `npm audit --audit-level=high` audits direct and transitive lockfile dependencies. Findings at High or Critical severity fail CI. A registry or tool failure also fails the step. Moderate findings remain visible for triage.

For private triage, run `gitleaks dir --redact=100 --no-banner --ignore-gitleaks-allow --config .gitleaks.toml .` on a clean checkout without local credentials. Use `gitleaks git --log-opts=HEAD --redact=100 --no-banner --ignore-gitleaks-allow --config .gitleaks.toml .` for ancestry. Keep any working notes private and use exact synthetic exceptions only.

## Findings and operator-owned controls

- The previous build had no final public-output rejection gate. Controlled fixtures demonstrated the newly enforced rejection of credential files, recognized privileged values and source maps. This is a build control gap. The scan did not establish a production leak.
- Medium severity. The prior application error logger expanded exception messages, stacks and causes and could log an exception captured during another request. Application-owned production error paths now emit fixed event messages. Synthetic tests confirm exception details are excluded and explicit development diagnostics still work. Hosted and framework-owned log handling remain unverified.
- A passive live check returned HTTP 200 for Home and its sampled entry JavaScript. Home included CSP, HSTS, nosniff, frame denial and a referrer policy. The entry had no source map reference or header and its corresponding map returned HTTP 404.
- The integration lockfile audit reported zero High or Critical and seven Moderate entries. One advisory affects `minimatch` through glob expansion. npm also lists six packages on that dependency chain. They are `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, and `typescript-eslint`. The lockfile was retained for reviewed dependency remediation. [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- Production database SSL Enforcement was previously verified on both pooler legs. The documented external pooler is intentionally reachable for operators. Review [database network restrictions](https://supabase.com/docs/guides/platform/network-restrictions) for the exact approved egress paths. The public HTTPS Data API depends on grants and RLS and remains available for the application.
- Supabase provides [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [bot protection](https://supabase.com/docs/guides/auth/auth-captcha) and [MFA](https://supabase.com/docs/guides/auth/auth-mfa). Check current project settings with the owner. Enrollment, recovery and role-scoped enforcement for admin, clinic and doctor accounts require separate approval. Confirm plan limits before relying on paid log drains, Vercel managed WAF features, or an IPv4 add-on.
- The repository-level scans, build gate and existing encrypted backup workflow do not need Supabase paid features. Supabase scheduled backups and log drains are paid features. Until separately approved, use the existing backup procedure and review the provider logs available on the current plan. [Supabase plan details](https://supabase.com/pricing)
- Required GitHub status checks, protected branch review, incident alert routing and production provider settings are operator-controlled. Require the always-running `security-gates` job and check `frontend-quality` when the paths trigger it. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## 70-check inventory

|   # | Check                       | Status          | Evidence or gap                                                                                                                               |
| --: | --------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Exposed DB credentials      | FIXED           | Tracked-path, connection-string and browser bundle gates. No historical credential finding on the scanned branch.                             |
|   2 | Public .env files           | FIXED           | Public artifact gate rejects dotenv files, including templates.                                                                               |
|   3 | Hardcoded secrets           | FIXED           | Gitleaks default and project-specific rules run in CI and pre-commit.                                                                         |
|   4 | Weak auth                   | ACTION REQUIRED | Auth password policy and privileged-account MFA need owner review.                                                                            |
|   5 | Missing Authz check         | PASS            | PostgreSQL authorization matrix and RPC tests cover existing protected operations.                                                            |
|   6 | Cross user access           | PASS            | Patient isolation and message session tests cover cross-account reads.                                                                        |
|   7 | Open DB permissions         | PASS            | Schema-wide public RLS and explicit ACL regression tests.                                                                                     |
|   8 | Cloud service misconfig     | NOT VERIFIED    | Managed environment settings require a separate inventory.                                                                                    |
|   9 | Unprotected admin route     | PASS            | Database publication RPCs require platform-admin authorization.                                                                               |
|  10 | Exposed prod debug tools    | NOT VERIFIED    | No hosted debug tooling review in this change.                                                                                                |
|  11 | Logs leak secrets           | FIXED           | App-owned production error logs emit fixed messages. Hosted and framework log handling remain unverified.                                      |
|  12 | Verbose prod errors         | PASS            | Application error mapping and server fallback suppress internal details in responses.                                                         |
|  13 | Secrets in git              | FIXED           | Gitleaks scans the tracked snapshot and branch ancestry with findings suppressed in CI output.                                                |
|  14 | Secrets in JS               | FIXED           | Production public-artifact gate and synthetic cross-environment bundle checks.                                                                |
|  15 | Client-only security        | PASS            | Database RLS and RPC roles enforce the covered UI boundaries.                                                                                 |
|  16 | Input validation            | PASS            | Form, booking and error-path regressions cover application inputs.                                                                            |
|  17 | SQL injection               | PASS            | Parameterized client calls and existing discovery and SQL input tests cover reviewed paths.                                                   |
|  18 | NoSQL injection             | NOT APPLICABLE  | No NoSQL backend.                                                                                                                             |
|  19 | XSS                         | NOT VERIFIED    | React rendering and CSP are in place. A complete browser input-to-output review was outside this change.                                      |
|  20 | CSRF                        | PASS            | Start installs server-function CSRF middleware. Reviewed browser Data API writes use explicit authorization headers.                           |
|  21 | Insecure file uploads       | PASS            | Avatar storage regression tests enforce file limits and ownership.                                                                            |
|  22 | Path traversal              | NOT VERIFIED    | Storage ownership tests exist. Path normalization across all upload paths was not reverified.                                                 |
|  23 | SSRF                        | NOT VERIFIED    | A complete inventory of server-side outbound URLs was not performed.                                                                          |
|  24 | Broken password reset       | PASS            | Mocked recovery, invalid and expired session tests exist. Hosted delivery depends on Auth configuration.                                      |
|  25 | Weak session mgmt           | PASS            | Logout, expiry and user-switch isolation tests cover client behavior. Hosted token lifetimes are unverified.                                  |
|  26 | JWT secrets                 | FIXED           | Public bundle gate rejects legacy service-role JWTs and modern server keys.                                                                   |
|  27 | Permissive CORS             | NOT VERIFIED    | Hosted CORS and API grants remain distinct controls. CORS behavior was not exhaustively tested.                                               |
|  28 | Rate limits                 | ACTION REQUIRED | Database booking and provider request caps exist. Confirm hosted Auth limits and messaging abuse controls.                                    |
|  29 | Exposed environments        | NOT VERIFIED    | Hosted Preview and internal environment inventories are outside the local gate.                                                               |
|  30 | Default credentials         | PASS            | Existing environment guards pin approved endpoints. Loopback fixtures are narrowly recognized by the scanner.                                 |
|  31 | Unsigned webhooks           | NOT APPLICABLE  | No application webhook consumer identified.                                                                                                   |
|  32 | FE Payment checks           | NOT APPLICABLE  | No payment integration.                                                                                                                       |
|  33 | IDOR / BOLA                 | PASS            | Existing patient and staff tenant isolation tests exercise mismatched resource ownership.                                                     |
|  34 | APIs + user input           | PASS            | Existing validation and role boundary tests cover reviewed RPCs.                                                                              |
|  35 | Exposed logs                | NOT VERIFIED    | Hosted access permissions and retention were not inspected.                                                                                   |
|  36 | Exposed source maps         | FIXED           | Artifact gate rejects files and references. The sampled live entry map returned HTTP 404.                                                      |
|  37 | Vulnerable dependencies     | FIXED           | High and Critical advisories block npm audit. Seven Moderate entries remain.                                                                  |
|  38 | Malicious packages          | ACTION REQUIRED | Locked installs and immutable CI actions are in place. Package provenance review remains useful for dependency changes.                       |
|  39 | Prompt injection            | NOT APPLICABLE  | No application AI surface identified.                                                                                                         |
|  40 | Unpermissioned AI access    | NOT APPLICABLE  | No application AI access.                                                                                                                     |
|  41 | Excessive DB permissions    | PASS            | Explicit ACL, definer grants, and public catalogue tests exist.                                                                               |
|  42 | Missing audit logs          | PASS            | Database audit tables and their authorization policies have regression coverage.                                                              |
|  43 | No security monitoring      | ACTION REQUIRED | Configure incident alert owners and validate delivery using an approved provider plan.                                                        |
|  44 | No backups/restore          | PASS            | Existing encrypted archive and isolated partial restore evidence. Managed Vault and hosted hooks were excluded from that rehearsal.           |
|  45 | Exposed internal dashboards | NOT VERIFIED    | Review managed dashboards and team access separately.                                                                                         |
|  46 | Missing security headers    | PASS            | Nitro config emits CSP, HSTS, nosniff, frame denial and referrer policy.                                                                      |
|  47 | Insecure cookie settings    | NOT VERIFIED    | The app sets a SameSite=Lax language preference and stores Supabase sessions in the browser. Managed cookies remain unverified.                |
|  48 | Unencrypted data            | PASS            | Previous supervised production check verified hostname validation and same-session database TLS. Hosted at-rest controls were not reverified. |
|  49 | Poor tenant isolation       | PASS            | Patient, clinic and doctor tenant-boundary regression suites exist.                                                                           |
|  50 | Unreviewed code             | ACTION REQUIRED | Require review and the security checks in GitHub branch rules.                                                                                |
|  51 | Mass assignment             | PASS            | Existing privileged profile and publication boundaries are covered by ACL and role tests.                                                     |
|  52 | Command injection           | NOT APPLICABLE  | No browser-facing shell execution path identified.                                                                                            |
|  53 | Insecure deserialisation    | NOT VERIFIED    | No dedicated review beyond existing typed request validation.                                                                                 |
|  54 | Misconfigured OAuth         | NOT VERIFIED    | Production provider and redirect configuration requires owner review.                                                                         |
|  55 | No MFA                      | ACTION REQUIRED | Enroll admin, clinic and doctor users and test recovery before staged assurance enforcement.                                                  |
|  56 | Account Enumeration         | PASS            | Recovery uses a generic UI response and mocked regression coverage. Hosted behavior remains unverified.                                       |
|  57 | Business logic abuse        | PASS            | Existing booking caps and scheduling and publication checks enforce covered rules.                                                            |
|  58 | Race conditions             | PASS            | Existing concurrency and serialization tests cover booking and related writers.                                                               |
|  59 | Webhook replay              | NOT APPLICABLE  | No application webhook consumer identified.                                                                                                   |
|  60 | Insecure CI/CD              | FIXED           | Read-only security workflow, full branch ancestry, staged hook and Vercel artifact gate.                                                      |
|  61 | Untrusted build actions     | PASS            | Existing action pins retained. Gitleaks image pinned by digest.                                                                               |
|  62 | Unpinned build dependencies | PASS            | npm lockfile and pinned Action commits. Node 22 tracks patch updates by design.                                                               |
|  63 | Checks fail open            | FIXED           | Security scanner and artifact gate fail the job on findings or scanner and input failures.                                                    |
|  64 | Missing timeouts            | PASS            | Scanner, CI, database release and focused builds have relevant timeouts. Client timeout coverage was not exhaustively reviewed.               |
|  65 | Sensitive info leak         | FIXED           | Public artifact gates and app-owned production error logging cover inspected paths. Hosted log exposure remains unverified.                    |
|  66 | Invalid AI output           | NOT APPLICABLE  | No application AI output.                                                                                                                     |
|  67 | Excessive AI permissions    | NOT APPLICABLE  | No application AI permissions.                                                                                                                |
|  68 | Sensitive browser storage   | ACTION REQUIRED | SDK uses browser session persistence. Review storage and XSS threat model before changing authentication architecture.                        |
|  69 | Open redirects              | PASS            | Local-only redirect validation and existing negative tests.                                                                                   |
|  70 | Unsecured endpoints         | NOT VERIFIED    | Existing authorization suites cover listed boundaries. A broader hosted endpoint audit was outside this change.                               |
