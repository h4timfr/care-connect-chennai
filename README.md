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

`tests/security.test.ts` is a manual abuse-test script. It **creates real accounts** in whichever
project `.env` points to, so it is not part of the Playwright suite — only run it against a
non-production project.

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
