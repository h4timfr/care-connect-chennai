# CareConnect

CareConnect helps patients in Chennai find doctors and clinics, book appointments and message
their clinic. Clinic staff use the clinic portal to manage appointments and reply to patients.

## Stack

- React 19, TypeScript, Vite, TanStack Start / Router / Query, Tailwind CSS
- Supabase: Postgres with row-level security, Auth, RPCs and Realtime

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:8080
```

### Environment

| Variable                        | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Project URL, e.g. `https://<project-ref>.supabase.co`               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's **publishable** (anon) key. Safe to ship to browsers. |

`VITE_SUPABASE_ANON_KEY` is still accepted as a legacy name for the publishable key.

- Never put a secret / `service_role` key in a `VITE_` variable — it would be bundled into the
  browser build. The client refuses to start with one.
- `.env` is git-ignored. Restart the dev server after changing it.
- If the variables are missing, the app shows a configuration error banner instead of calling a
  placeholder backend.

## Scripts

| Command               | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `npm run dev`         | Start the dev server                                           |
| `npm run build`       | Production build                                               |
| `npm run lint`        | ESLint + Prettier checks                                       |
| `npx tsc --noEmit`    | Type check                                                     |
| `npx playwright test` | Browser tests in `tests/*.spec.ts` (builds and serves the app) |

`npm install` uses `package-lock.json`, which is the maintained lockfile. `bun.lock` is kept for the
Lovable pipeline and was regenerated with the TanStack Start upgrade.

## Tests

`npx playwright test` builds the app for Node and serves the production build on port 4173, and
**reuses any server already listening there** — make sure it is CareConnect. To test a specific
server, set `PLAYWRIGHT_BASE_URL` (e.g. `http://localhost:8080` for `npm run dev`, or a production
build started with `PORT=4273 node .output/server/index.mjs`).

| File                                                       | Backend                                     | Covers                                                                    |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `tests/app.spec.ts`                                        | the project in `.env` — **read-only** calls | public pages, search, sign-in errors, headers, CSP                        |
| `tests/signed-in.spec.ts`                                  | fully mocked (`tests/support/mock-backend`) | profile, booking, cancelling, messages, clinic portal                     |
| `tests/responsive.spec.ts`                                 | fully mocked                                | every page at 375 / 390 / 768 / 1280 px                                   |
| `tests/localization.spec.ts`                               | fully mocked                                | language choice, persistence, RTL, every page in every language, greeting |
| `tests/profile-photo.spec.ts`                              | fully mocked                                | upload, validation, failure, removal, unavailable storage                 |
| `tests/portal-and-booking.spec.ts`                         | fully mocked                                | booking availability, clinic portal visibility and roles                  |
| `tests/i18n.spec.ts`, `format.spec.ts`, `redirect.spec.ts` | none                                        | dictionaries, formatting, open-redirect validation                        |

The mocked suites answer every Supabase request in the test process, so signed-in flows are tested
without accounts or data in any real project. The mock reports any request it does not recognise.

SQL tests in `supabase/tests/` (pgTAP, `supabase test db`) cover grants, RLS, booking rules, the
`user_roles`/`audit_logs` policies (008), avatar storage policies (009) and a schema-wide audit
(010: RLS on every table, no 42P17 for any caller, definer functions pin `search_path`).

`tests/security.test.ts` is a manual abuse-test script. It **creates real accounts** in whichever
project `.env` points to, so it is excluded from the Playwright suite and refuses to run unless
`SECURITY_TEST_CONFIRM_HOST` is set to that project's host. Only run it against a non-production
project.

## Project layout

```
src/
  routes/              file-based routes (patient app, /login, /clinic/* portal)
  components/          shared UI (cards, slot picker, layout shells, shadcn/ui in ui/)
  lib/supabase/        Supabase client, queries, mutations, error keys, avatar storage
  lib/i18n/            languages, dictionaries (messages/*.ts), formatting, server-side detection
  lib/store.tsx        app-wide data context built on TanStack Query
supabase/
  migrations/          database migrations
  tests/               SQL security tests
docs/                  architecture, authorization and security notes
```

## Data and security model

- The database is the source of truth. The UI never falls back to bundled sample data.
- Public listings (`clinics`, `doctors`, `clinic_doctors`, `doctor_schedules`) are readable
  before sign-in; everything else is protected by RLS.
- Appointments are created only through the `book_appointment` RPC, which derives the patient
  from the session, validates the slot against the clinic schedule and sets the fee. Available
  slots come from `get_doctor_slots(doctor, clinic, date)`.
- Online booking is offered only for doctor–clinic links that are `active` and
  `verification_state = 'verified'`; other links show the clinic's phone number instead.
- Listings flagged `is_demo` in the database are labelled "Sample listing" in the UI.
- Patient profiles (`public.users` → `public.patients`) are created by database triggers on
  sign-up; the browser never inserts them.
- Profile photos live in the private `avatars` Storage bucket (migration 00053), one object per
  account at `<auth user id>/avatar`, readable and writable only by that account, served through
  short-lived signed URLs. Photos are cropped and re-encoded in the browser before upload, which
  also strips camera metadata.
- The clinic portal is offered only to accounts with an active `clinic_memberships` row; the UI
  shows the member's role, but every clinic read and write is still enforced by RLS.

## Languages

The UI is available in English, Hindi, Urdu (right-to-left), Malayalam, Tamil and Telugu
(`src/lib/i18n`). Every string is a typed key in `messages/en.ts`; the other dictionaries must
translate every key with the same `{placeholders}` (checked by TypeScript and `tests/i18n.spec.ts`).
Doctor and clinic data from the database is shown as stored.

The language comes from the `cc_lang` cookie, else the browser's `Accept-Language`, and is resolved
during server rendering, so pages arrive already translated. Choosing a language also stores it in
localStorage and, for signed-in patients, in `patients.preferred_language`; that saved preference
applies when the patient signs in.

See [docs/](docs/) for details. This repository is connected to Lovable; see
[AGENTS.md](AGENTS.md) before rewriting git history.

## Security headers

The production server (Nitro, `nitro.config.ts`) sends a Content-Security-Policy that limits
scripts, styles and connections to the app itself, Google Fonts and the configured Supabase
project, plus `X-Frame-Options: DENY`, `nosniff`, HSTS and a strict referrer policy.
`'unsafe-inline'` is still required for scripts (TanStack Start emits per-request inline hydration
data) and styles (Radix UI positions popovers with inline styles); removing it needs nonce support.

## Auth redirect URLs

Confirmation emails return to `/login` and password-reset emails to `/reset-password` on the site
that sent them. Add both URLs for every deployed origin (and `http://localhost:8080` for local
development) under **Authentication → URL Configuration → Redirect URLs** in Supabase; otherwise
Supabase falls back to the project's Site URL.

## Known limitations

These need backend or operational changes and are intentionally **not** worked around in the UI:

- **No doctor–clinic link is verified yet** (`clinic_doctors.verification_state = 'pending'`), so
  online booking is unavailable for every doctor until a platform admin verifies them.
- **All current clinics and doctors are sample records** (`is_demo = true`). They are labelled
  "Sample listing" and their seeded ratings are hidden.
- **Every read of `audit_logs` and `user_roles` fails with `42P17`** (infinite recursion) in
  production, for anonymous callers, signed-in users and platform admins alike: the admin read
  policies from migration 00006 query `user_roles` from inside a `user_roles` policy. No rows are
  exposed: anon holds no privilege on either table (Postgres expands RLS policies before it checks
  table privileges, so the recursion error surfaces first). Only the `/admin` role check reads
  `user_roles`, and it fails closed (no access) on this error. Migration
  `00052_user_roles_audit_logs_rls_fix.sql` (tested by `supabase/tests/008_*` and `010_*`) fixes it
  but **has not been deployed**.
- **Profile photos need migration `00053_avatars_storage.sql`**, which **has not been deployed**.
  Until it is, the profile page says photos aren't available yet and shows initials.
- **Provider onboarding needs migration `00054_provider_onboarding.sql`**, which **has not been
  deployed** (pgTAP `011_*` written, not yet run). It covers clinic applications, the `/admin`
  console and doctor proposals. Until it is deployed those screens say so and grant nothing.
  00054 also closes the release-audit finding that clinic staff can attach any doctor to their
  clinic and edit that doctor's profile and fee. **Until it is deployed, give clinic memberships
  only to fully trusted people.** See [docs/provider-onboarding.md](docs/provider-onboarding.md).
- **The doctor portal and doctor applications need migration `00055_doctor_portal.sql`**, which
  **has not been deployed** (pgTAP `012_*`). Until it is, no account is linked to a doctor, so
  `/doctor` shows "Doctor access isn't enabled" and doctor applications say they aren't open yet.
- **Provider-candidate review needs migration `00056_provider_candidates.sql`**, which **has not
  been deployed** (pgTAP `013_*`). Research candidates live in their own private tables, are
  visible only to platform admins at `/admin/providers`, and are never listed or bookable. **No
  research catalogue has been imported:** `research/chennai-provider-candidates.json` holds the
  2026-10-06 research workbook (100 facilities, 399 doctors, 418 relationships, 0 registrations
  verified), and `candidates-import.sql` is generated from it but not run anywhere. See
  [research/README.md](research/README.md).
- **Page titles** (`<title>`) are in English; page content follows the chosen language.
- The clinic conversation list embeds `patients.user_id` to tell patient messages from clinic
  replies. Clinic staff can already read that column under RLS; hiding it needs a backend change
  (for example a `sender_role` column on `messages`).
- **Unread message counts are not maintained** by any trigger or RPC, so the UI does not show
  unread badges.
- The conversations query loads every message of every conversation; it should be paginated
  before message volume grows.
- `src/lib/database.types.ts` was updated by hand for the clinic-aware `get_doctor_slots`
  overload (migration 00047); regenerate it with `supabase gen types` when CLI access is available.
