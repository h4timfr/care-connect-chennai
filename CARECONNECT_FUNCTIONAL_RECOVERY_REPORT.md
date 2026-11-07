# CARECONNECT_FUNCTIONAL_RECOVERY_REPORT

The release gate remains closed. Two reproducible frontend defects were repaired and validated with synthetic data; real-backend workflows were not executed in this phase.

## Repairs

- A doctor profile save invalidated the public catalogue but not the separately cached filtered doctor search. After editing a fee and returning to a previous search within its one-minute freshness window, the result showed the old fee and made no new request. Profile updates now invalidate the filtered search as well. The browser regression reproduced the missing request before the change and verifies a refreshed result afterward.
- The Supabase client called the existing target resolver without its Vercel environment argument. In a synthetic Preview build with a Production target, it accepted the configuration instead of reporting the existing Preview guard error. The client now passes `VITE_VERCEL_ENV`; a separate guarded bundled-browser regression failed before the fix and passed afterward. This guard depends on Vercel exposing the Vite-prefixed system environment variable; the connected project's effective setting is unverified.

Implementation commit: `95930cea01a446fa42a45a5fdc3e8f00384da929`. Changed source and tests: `src/lib/supabase/client.ts`, `src/lib/supabase/doctor.ts`, `tests/functional-recovery.spec.ts`, and `tests/vercel-preview-config.spec.ts`. No API, RLS, grant, migration, or hosted configuration was changed.

## Functionality evidence matrix

All classifications below are **synthetic UI evidence only** for the named workflows, with real-service verification blocked. The mocks do not prove backend RLS, RPC, delivery, or service availability.

- Patient: registration/authentication, profile setup and recovery, discovery and doctor detail, availability, booking and cancellation, and messaging have mocked-browser coverage.
- Clinic: membership/access, dashboard, appointment visibility and status changes, calendar, doctor schedules, and messaging have mocked-browser coverage.
- Doctor: profile linkage and editing, appointment dashboard/details, schedule management, scoped conversations and replies have mocked-browser coverage. Actual scoped RPC enforcement remains unverified here.
- Administrator: role gate, clinic and team management, candidate review, and publication controls have mocked-browser coverage. Actual privilege enforcement remains unverified here.

The prior disposable real-service run recorded 41 migrations, 493 pgTAP assertions, nine concurrency scenarios, and 67 service assertions passing before its integration failure. Its patient Auth `getUser(token)` probe returned HTTP 400 with sanitized code `other`; the cause is not available. The same run did not reach row visibility, message insertion or delivery, and all four real browser workflows were blocked. A later startup run reported healthy Postgres followed by rollback before project migrations; the underlying bootstrap exception was not retained in available sanitized evidence. Neither issue is diagnosed or fixed by the changes above.

## Validation

- Complete mocked Chromium: **342 passed, one intentionally skipped**. The skipped Preview-context case requires a separate build and **passed separately** with reserved synthetic URL/key values.
- Adjacent clinic, doctor, and discovery browser tests: **43 passed**.
- Safe unit tests: **23 passed**; script tests: **202 passed**.
- Application and test TypeScript, ESLint, relevant Prettier, guarded synthetic production build, and `git diff --check`: passed. Node `22.13.0`; dependencies unchanged.
- The Preview regression is a separate explicit invocation, not exercised by the ordinary mocked-suite build. Add an appropriately guarded separate CI invocation before relying on it as continuous coverage.

## Remaining blockers

1. Real integration requires an independently owned disposable Linux runtime that can demonstrate pre-creation loopback-only IPv4/IPv6 publication enforcement and run-owned cleanup. The existing exit-78 guard must remain in place until that capability is established. No such runner was available for this task. Then privately inspect the actual bootstrap failure and rerun migrations, SQL/security, Auth, PostgREST, Storage, Realtime, and the four real browser workflows.
2. Investigate the patient Auth 400 and authorized/unauthorized Realtime delivery in that safe environment; neither can be inferred from the sanitized record.
3. Vercel reports Vite and Node 24, while local validation used the Nitro `node-server` preset on Node 22. Package engines support Node 24, but Vercel SSR output, deep-link routing, callback allowlists, effective system-variable exposure, and Preview/Production settings are unverified. Login and reset callbacks use `/login` and `/reset-password` on the current origin. No hosted credentials were inspected.
4. The tracked branch rule suppresses Vercel Git deployments, but historical Git-sourced deployment evidence leaves the precise trigger unresolved. Confirm effective deployment suppression before any publication. PR #2 remains open and unmerged.

No push, merge, deployment, Docker operation, hosted Supabase access, private configuration access, or destructive Git action was performed.
