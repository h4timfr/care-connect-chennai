# Security Checklist

## 1. Authentication

- [x] Prevent Role Escalation via Signup (Hardcode 'patient' in `handle_new_user` trigger).
- [x] Ensure `users.id` strictly inherits from `auth.users.id`.
- [ ] Implement CAPTCHA for signup/login (Planned).
- [ ] Multi-Factor Authentication (MFA) for Staff/Admin (Planned).

## 2. Authorization (RLS & RPC)

- [x] RLS enabled on all sensitive tables (`patients`, `appointments`, `messages`, `users`).
- [x] `book_appointment` RPC secured with `SECURITY DEFINER` and `search_path = ''`.
- [x] `book_appointment` verifies patient identity via `auth.uid()`.
- [x] RPC EXECUTE privileges revoked from `PUBLIC` and `anon`.

## 3. Rate Limiting & Abuse

- [x] Max active bookings constraint implemented (Max 5 active per patient).
- [x] Oversized payload rejection (`p_reason` max 500 chars).
- [x] Time travel booking rejection (`p_date` bounded).
- [ ] Messaging rate limits (Planned).
- [ ] Application-layer / Edge-layer IP rate limits (Planned).

## 4. Browser Security & Secrets

- [x] `.env` securely ignored.
- [x] No `SERVICE_ROLE` keys exposed to Vite.
- [x] Security headers injected via Nitro (`X-Frame-Options`, `Content-Security-Policy`).
