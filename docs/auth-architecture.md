# Authentication Architecture

## 1. Supabase Auth

The application relies entirely on Supabase Auth for identity management.

- **Login/Signup:** Handled via `@supabase/supabase-js`.
- **User Metadata:** Client-side user metadata (e.g., `role`) is intentionally ignored by the database to prevent privilege escalation.

## 2. Database Triggers

- **`handle_new_user`:** Automatically mirrors `auth.users` insertions into `public.users`. It forcibly assigns `role = 'patient'`.
- **`handle_new_patient`:** Automatically creates a `public.patients` profile when a new patient registers.

## 3. Session State

React Context (`AuthProvider`) subscribes to `supabase.auth.onAuthStateChange`.
There are no client-side role overrides or mock fallbacks. If `useAuth().session` drops, the user is forcefully navigated away from protected routes.
