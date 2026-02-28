# Public Rollout Readiness

Use this checklist before exposing the app to non-dev users.

## 1) Environment Configuration

- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for the target environment.
- [ ] `VITE_AGENT_GATEWAY_URL` points to the intended gateway (or agent features are disabled by product decision).
- [ ] `VITE_AGENT_WEBHOOK_SECRET` is set and matches the gateway secret.
- [ ] `VITE_AGENT_REQUIRE_WEBHOOK_SECRET=true` in production.
- [ ] `VITE_COORDINATES_BACKEND_URL` targets the intended backend host.
- [ ] `VITE_API_KEY` is rotated from the default dev placeholder.
- [ ] `VITE_DEV_ADMIN_EMAIL` / `VITE_DEV_ADMIN_EMAILS` are set only for development workflows.

## 2) Supabase Auth Settings

In Supabase project settings:

- [ ] Site URL is set to the production app origin.
- [ ] Redirect URLs include the production reset URL path (`/reset-password`) and development URLs as needed.
- [ ] Email templates for password recovery use the correct domain and branding.
- [ ] Row Level Security is enabled for all user-facing tables.

## 3) Security Verification

- [ ] `.env` files and secret material are excluded by git ignore rules.
- [ ] No hardcoded keys or fallback secrets remain in frontend code.
- [ ] Agent pairing uses `X-Pairing-Code` and webhook requests enforce auth headers.
- [ ] Browser-exposed env values (`VITE_*`) contain no server-only secrets.
- [ ] Supabase RLS script has been applied and verified (`backend/supabase/rls_hardening.sql`).
- [ ] Supabase storage policies are applied (`backend/supabase/storage_policies.sql`).

## 4) Auth Flow Validation

Run manual smoke checks:

- [ ] Sign up with a new user and confirm onboarding path.
- [ ] Log in with valid and invalid credentials.
- [ ] Forgot password sends recovery email.
- [ ] Reset password page accepts recovery session and updates password.
- [ ] Session invalidation works after password reset (re-login required).

## 5) Build and Lint Gate

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Known large-chunk warnings are accepted or mitigated with code-splitting.

## 6) Operational Readiness

- [ ] Error logging destination is configured and monitored.
- [ ] Backend API hosts are reachable from deployed frontend.
- [ ] Team has documented rollback procedure for bad releases.
- [ ] Docs in `docs/` reflect current environment and auth behavior.
