# Auth + Landing Conversation README

Date: March 2, 2026  
Repo: `Suite`

## Why This File Exists
This summarizes our conversation about:
- Landing page layout cleanup
- Sign-in/get-started UX
- Supabase auth direction
- Security best practices
- Passwordless + passkey strategy

## Key Decisions
1. Keep Supabase as the auth provider.
2. Do not expose backend secrets in frontend env vars (`VITE_*`).
3. Move toward passwordless email-link flow now, with passkeys as next-step primary auth.
4. Remove mid-hero "Create account / Resume session" buttons from landing.
5. Keep auth-related abuse controls and reduce account-enumeration signals.

## What Was Implemented

### Landing Page
- Removed mid-page auth CTA buttons.
- Kept auth actions in top nav.
- Moved `Privacy` and `Roadmap` into top navigation.

Changed file:
- `src/routes/LandingPage.tsx`

### Frontend Auth Flow
- `Login` now requests a sign-in email link.
- `Signup` now requests a get-started email link.
- `Forgot Password` now requests reset link through backend endpoint.
- Auth context switched from password-based calls to email-link request flow.

Changed files:
- `src/auth/AuthContext.tsx`
- `src/routes/LoginPage.tsx`
- `src/routes/SignupPage.tsx`
- `src/routes/ForgotPasswordPage.tsx`
- `src/auth/emailAuthApi.ts` (new)

### Redirect Hardening
- Added client-side allowed-origin checks for auth redirect handling.

Changed file:
- `src/auth/authRedirect.ts`

### Backend Email Auth Endpoint (Still Supabase)
- Added backend endpoint for email-link requests:
  - `POST /api/auth/email-link`
- Endpoint forwards to Supabase Auth APIs server-side.
- Includes input validation + rate limiting + generic response pattern.

Changed file:
- `backend/api_server.py`

## Security Notes From Conversation
1. Supabase is still the auth system.
2. Frontend should only use public Supabase values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Server-side secrets stay backend-only:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET` (if used)
4. Keep strict redirect allowlists in both frontend and backend.
5. Keep generic success text for email auth to reduce account-enumeration leakage.
6. Keep rate limits and anti-automation controls on auth endpoints.

## Environment Variables Added/Updated
Updated template:
- `.env.example`

Added/clarified:
- `VITE_AUTH_ALLOWED_ORIGINS`
- `AUTH_EMAIL_REDIRECT_URL`
- `AUTH_ALLOWED_REDIRECT_ORIGINS`

Note:
- Local `.env` was populated with blank placeholders for Supabase/auth values.

## Validation Performed
- `npm.cmd run typecheck` passed
- `npm.cmd run build` passed
- `python -m py_compile backend/api_server.py` passed

## Passkeys Summary (For Later)
Passkeys (WebAuthn/FIDO2) use public/private key cryptography:
- Private key stays on user device (or secure synced credential store).
- Server stores public key.
- Login is challenge-response (phishing-resistant).

Recommended target model:
1. Passkey primary sign-in.
2. Email link fallback/recovery.
3. Supabase remains identity provider.

## Suggested Next Steps
1. Fill real Supabase values in `.env`.
2. Configure Supabase Auth redirect URLs for your actual app origins.
3. Verify email templates + sender domain setup (SPF/DKIM/DMARC).
4. Test flows end-to-end:
   - Get started
   - Sign in link
   - Forgot/reset password
5. Add passkey-first flow after email-link baseline is stable.
