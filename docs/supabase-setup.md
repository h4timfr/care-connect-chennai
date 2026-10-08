# Supabase Local Setup Guide

Follow these steps to run CareConnect against **your own new** Supabase project (for example a
throwaway development project). To run against the existing CareConnect project you only need step 2.

## 1. Create Supabase Project

1. Go to [database.new](https://database.new) to create a new Supabase project.
2. Wait for the database provisioning to complete.

## 2. Configure Environment Variables

1. In your local repository, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Retrieve your **Project URL** and **publishable key** from the Supabase Dashboard (Settings > API).
   Never use a secret / `service_role` key here.
3. Paste them into `.env` and restart the dev server:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

## 3. Apply Migrations

You need to apply the database schema, enums, and Row Level Security policies.

> **Only for a brand-new project you own.** Never run `db push` (or `db reset`) against the shared
> CareConnect production project; its migration history is managed separately.

1. Install the Supabase CLI if you haven't already.
2. Link your project:
   ```bash
   npx supabase link --project-ref your-project-ref
   ```
3. Push the migrations:
   ```bash
   npx supabase db push
   ```

## 4. Create Initial Test Users

1. Go to **Authentication** in the Supabase Dashboard.
2. Disable email confirmations for testing (Authentication > Providers > Email > uncheck "Confirm email").
3. Start the application locally and navigate to `/login` to create an account, or manually create a user in the Dashboard.

## 5. Run Application

Start the frontend development server:

```bash
npm run dev
```

## 6. Verification

- **Authentication**: Ensure you can sign up and sign in at `/login`.
- **Appointment Creation**: Navigate through a doctor profile, pick a slot, and book. Verify the appointment row appears in the `appointments` table in your Supabase dashboard.
- **Row Level Security**: Try fetching appointments via raw SQL or the API as an anonymous user; you should see zero rows, proving RLS is active.

## Data sources

Every screen reads from Supabase: clinics, doctors, schedules and slots, appointments,
conversations and messages. There is no mock-data fallback; empty tables show empty states.

Online booking requires a doctor–clinic link (`clinic_doctors`) that is `active` and
`verification_state = 'verified'`. Only platform admins can verify links.
