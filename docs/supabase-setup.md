# Supabase Local Setup Guide

Follow these steps to transition the application from using mock data to your own real Supabase backend.

## 1. Create Supabase Project

1. Go to [database.new](https://database.new) to create a new Supabase project.
2. Wait for the database provisioning to complete.

## 2. Configure Environment Variables

1. In your local repository, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Retrieve your **Project URL** and **anon public key** from the Supabase Dashboard (Settings > API).
3. Paste them into `.env`:
   ```env
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-anon-key"
   ```

## 3. Apply Migrations

You need to apply the database schema, enums, and Row Level Security policies.

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

## Current Migration Status

The application is undergoing an incremental migration to Supabase.

- **Real Supabase**: Authentication (`/login`), Appointments (Booking, Fetching, Cancelling).
- **Mock Data**: Clinics, Doctors, Conversations, Messages, Schedules.

These mock domains will continue to function seamlessly through the UI while the backend rollout progresses.
