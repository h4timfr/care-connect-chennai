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

`npm install` uses `package-lock.json`, which is the maintained lockfile. `bun.lock` dates from the
original Lovable template and is out of date (see [Known limitations](#known-limitations)).

## Tests

`npx playwright test` builds the app for Node and serves the production build on port 4173.
Set `PLAYWRIGHT_BASE_URL=http://localhost:8080` to run against `npm run dev` instead.

| File                       | Backend                                     | Covers                                                |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `tests/app.spec.ts`        | the project in `.env` — **read-only** calls | public pages, search, sign-in errors, headers, CSP    |
| `tests/signed-in.spec.ts`  | fully mocked (`tests/support/mock-backend`) | profile, booking, cancelling, messages, clinic portal |
| `tests/responsive.spec.ts` | fully mocked                                | every page at 375 / 390 / 768 / 1280 px               |
| `tests/redirect.spec.ts`   | none                                        | open-redirect validation                              |

The mocked suites answer every Supabase request in the test process, so signed-in flows are tested
without accounts or data in any real project. The mock reports any request it does not recognise.

`tests/security.test.ts` is a manual abuse-test script. It **creates real accounts** in whichever
project `.env` points to, so it is excluded from the Playwright suite and refuses to run unless
`SECURITY_TEST_CONFIRM_HOST` is set to that project's host. Only run it against a non-production
project.

## Project layout

```
src/
  routes/              file-based routes (patient app, /login, /clinic/* portal)
  components/          shared UI (cards, slot picker, layout shells, shadcn/ui in ui/)
  lib/supabase/        Supabase client, queries, mutations, error messages
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
- **Unread message counts are not maintained** by any trigger or RPC, so the UI does not show
  unread badges.
- The conversations query loads every message of every conversation; it should be paginated
  before message volume grows.
- `src/lib/database.types.ts` was updated by hand for the clinic-aware `get_doctor_slots`
  overload (migration 00047); regenerate it with `supabase gen types` when CLI access is available.
- `bun.lock` does not match `package.json`. Regenerate it with Bun, or remove it if the Lovable
  pipeline does not need it.
