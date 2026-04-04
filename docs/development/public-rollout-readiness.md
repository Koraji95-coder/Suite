# Public Rollout Readiness

Use this checklist before exposing the app to non-dev users.

## 1) Environment Configuration

- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for the target environment.
- [ ] `VITE_COORDINATES_BACKEND_URL` targets the intended backend host.
- [ ] `VITE_API_KEY` is rotated from the default dev placeholder.
- [ ] `VITE_DEV_ADMIN_EMAIL` / `VITE_DEV_ADMIN_EMAILS` are set only for development workflows.
- [ ] If CAPTCHA is enabled, `VITE_TURNSTILE_SITE_KEY` and `AUTH_EMAIL_TURNSTILE_SECRET` are set for the same site.

## 2) Supabase Auth Settings

In Supabase project settings:

- [ ] Site URL is set to the production app origin.
- [ ] Redirect URLs include the production login URL path (`/login`) and development URLs as needed.
- [ ] Email templates for magic link / OTP use the correct domain and branding.
- [ ] Row Level Security is enabled for all user-facing tables.

## 3) Security Verification

- [ ] `.env` files and secret material are excluded by git ignore rules.
- [ ] No hardcoded keys or fallback secrets remain in frontend code.
- [ ] External passkey callback signing is configured when external provider mode is enabled.
- [ ] Suite does not expose retired local-agent or gateway features.
- [ ] Browser-exposed env values (`VITE_*`) contain no server-only secrets.
- [ ] The tracked Supabase migration chain has been applied and verified (`supabase/migrations/*`).
- [ ] If using hosted SQL Editor fallback, the compatibility SQL copies have also been applied in order (`supabase/consolidated_migration.sql`, `backend/supabase/rls_hardening.sql`, `backend/supabase/storage_policies.sql`).
- [ ] Passwordless auth abuse controls are tuned in backend env (`AUTH_EMAIL_*`).
- [ ] CAPTCHA enforcement mode is explicitly set (`AUTH_EMAIL_REQUIRE_TURNSTILE`).

## 4) Auth Flow Validation

Run manual smoke checks:

- [ ] Sign up with a new user and confirm onboarding path.
- [ ] Sign in email-link request succeeds with generic success response.
- [ ] Login link opens app and establishes session.
- [ ] Repeated requests from same IP/email are throttled without leaking account details.
- [ ] CAPTCHA challenge appears on login/signup and invalid tokens are rejected with generic responses.
- [ ] No password reset/password update UI is exposed to end users.
- [ ] Session invalidation works after sign out and global sign out.
- [ ] Passkey callback bridge works end-to-end when external provider mode is enabled.

## 5) Build and Lint Gate

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Known large-chunk warnings are accepted or mitigated with code-splitting.

## 6) Operational Readiness

- [ ] Error logging destination is configured and monitored.
- [ ] Backend API hosts are reachable from deployed frontend.
- [ ] Team has documented rollback procedure for bad releases.
- [ ] Docs in `docs/` reflect current environment and auth behavior.
