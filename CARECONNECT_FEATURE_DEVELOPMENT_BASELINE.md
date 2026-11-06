# CARECONNECT_FEATURE_DEVELOPMENT_BASELINE

2026-11-06. Authoritative directory: `C:\Users\admin\Projects\care-connect-chennai`; branch: `claude/careconnect-frontend-repair`. This is a development handoff, not release certification. Read alongside the publication review and Linux reproduction plan.

## Architecture and extension points

- TanStack Start/React 19, Vite 8.3.5, Nitro SSR, Tailwind 4. File routes live in `src/routes`; `src/routes/__root.tsx` composes QueryClient, theme, i18n, Auth and App providers around the required Outlet. Preserve it. Generated `src/routeTree.gen.ts` is not edited manually.
- Role layouts: `src/components/layout/PatientShell.tsx`, `ClinicShell.tsx`, `DoctorShell.tsx`; administration uses `src/components/AdminGate.tsx`. Their access/error states are presentation gates. Database grants/RLS/RPCs remain the authority.
- Reusable primitives: `src/components/ui` (buttons, inputs, form/label, dialogs, alert dialogs, native selects), plus `common.tsx` loaders/errors/empty states, `PersonalDetailsCard`, `PasswordInput`, `AvatarEditor`, `ScheduleEditor`, `SlotPicker`, and `DeferredToaster`. Prefer these over parallel implementations.
- Data/cache boundaries: `src/lib/supabase/client.ts`, `auth.tsx`, `query-keys.ts`, `private-query-cache.ts`, service hooks and `src/lib/store.tsx`. Include the principal in private query/component identities; cancel/remove private queries on identity changes. Never grant authority through storage flags or user-editable metadata.
- Booking: `src/routes/book.$doctorId.tsx`, `appointments.index.tsx`, `appointments.$appointmentId.tsx`; `src/lib/supabase/appointments.ts` calls the booking RPC and handles domain errors/invalidation. `appointment-time.ts` and `format.ts` own India-local cutoff/calendar rules. UI checks cannot replace transaction/concurrency guarantees.
- Messaging: `src/routes/messages.tsx`, `clinic.messages.tsx`, `doctor.messages.tsx`; shared memory-only `src/hooks/useMessageDraft.ts`. Patient/staff reads use `messaging.ts`; doctor reads use `doctor_conversations()` through `doctor.ts`. Preserve restricted replies and never add raw doctor message SELECT to simplify UI work.
- Translation: typed keys in `src/lib/i18n/messages/en.ts`, dictionaries/language metadata in the same module tree; `useI18n()` supplies `t` and localized `fmt`. Add reviewed translations consistently, preserve interpolation and RTL behavior, and avoid viewer-local conversion of appointment dates.

## Reliable local workflow

The installed and locked environment was independently rechecked: Node 22.13.0, npm 10.9.2, Vite 8.3.5, TypeScript 5.9.3, Playwright 1.63.0. Chromium revision 1243 is installed. No dependency/lockfile change was needed.

From the original directory:

```powershell
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test:unit
node --test scripts/*.test.mjs
npx playwright test --workers=2 --reporter=list
git diff --check
```

Playwright's normal mocked configuration builds the actual production bundle, preloads `scripts/deny-local-env.mjs`, supplies the reserved synthetic Supabase target, serves only on `127.0.0.1:4173`, and tears down its own server. Keep `PLAYWRIGHT_LIVE_SMOKE` unset/`0` and `PLAYWRIGHT_BASE_URL` unset. A caller-provided server is rejected in mocked mode. Tests requiring the backend use `tests/support/fixtures.ts` and `mock-backend.ts`; unsupported requests and hosted Supabase HTTP/WebSocket attempts fail tests.

For a focused change, use the same managed server, for example `npx playwright test tests/message-session-isolation.spec.ts --workers=2 --reporter=list`. The production build runs as part of that command. Do not run a bare build/dev command in this private checkout as a purported synthetic check: default tooling intentionally supports dotenv in normal application mode. `validate:frontend` is not a substitute for guarded mocked tests. Do not use broad `tsx --test tests/*.test.ts`; the manual security script requires a separate explicit disposable-target opt-in and is excluded from normal testing.

Use Prettier on changed paths. A full-repository check currently reports eight pre-existing files listed in the publication report; do not reformat unrelated recovery/operational material opportunistically. Add regressions for changed behavior, then run the relevant checks. Install from the unchanged lock only if a real dependency mismatch recurs; no automatic upgrades are proposed.

## Tested scope and limits

The verified starting baseline is 298 mocked Chromium cases, 23 Node units and 171 script cases. It includes four role shells, booking/conflict/cancellation UI, scoped doctor RPC requests, session/cache transitions, draft edits and recipient switching, remote logout errors, native booking keyboard controls, seven responsive widths and six-language coverage. The six new pending-send/session tests extend the browser inventory to 304; their executed outcome is recorded in the publication report.

These tests drive the real bundled UI against synthetic HTTP/WebSocket responses. They verify UI behavior and selected request contracts, not RLS, real identity, database transactionality or Realtime delivery. Even an apparently authorized synthetic admin/doctor screen is not service-side authorization proof.

## Safe next work and blocked work

Patient booking explanations, existing form validation/recovery, loading/error states and accessible controls can be developed with these fixtures. Clinic schedule/appointment presentation and data-dense layouts, doctor scoped-inbox presentation, and administrator candidate/publication review UX can be extended within existing contracts. Useful next reviews are realistic long-record layouts and recoverable form errors, rather than a redesign or invented business features.

Changes that depend on actual JWT/session synchronization, patient Auth HTTP 400, Realtime readiness/delivery, Storage policies, booking concurrency or privileged database actions require the disposable integration environment first. Real-service patient, clinic-staff, doctor and administrator browser workflows remain unverified. The release gate stays closed. Publication requires explicit approval and the workflow exposure issue in the publication report to be resolved or verified safely.
