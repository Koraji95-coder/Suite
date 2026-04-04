# Environment & Secret Hygiene

This project uses environment variables for runtime configuration and keeps secrets out of source control.

## Public Vs Secret Env Values

Any variable prefixed with `VITE_` is bundled client-side and must be treated as public.

Safe examples:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_KEY`
- `VITE_AUTH_ALLOWED_ORIGINS`

Do not place server secrets in `VITE_*` variables.

## Git Ignore Guardrails

The repository ignore rules include:

- `.env` and `.env.*` (except `.env.example`)
- certificate and key formats (`*.pem`, `*.key`, `*.p12`, and similar)
- local-only secret scratch files such as `*.secret`

## Required Local Setup

1. Copy `.env.example` to `.env`.
2. Fill only the values needed for this workstation.
3. Never commit `.env`.

## Auth Notes

- Canonical auth modules live in `src/auth/*`.
- Supported auth paths in Suite are email-link login plus the current passkey rollout surfaces.
- Exact Supabase redirect URLs should include:
  - `/login`
  - `/signup`
  - `/app/settings`
- Keep `AUTH_ALLOWED_REDIRECT_ORIGINS` and `VITE_AUTH_ALLOWED_ORIGINS` aligned with real origins.
- Canonical auth architecture lives in `docs/security/auth-architecture-canonical.md`.

## Passkey Env Notes

Passkey rollout remains probe-gated:

- Frontend gate: `VITE_AUTH_PASSKEY_ENABLED`
- Backend gate: `AUTH_PASSKEY_ENABLED`
- Backend provider selector: `AUTH_PASSKEY_PROVIDER`

First-party WebAuthn mode requires the normal `AUTH_PASSKEY_*` settings for RP ID, RP name, allowed origins, timeout, verification policy, and resident-key policy.

External-provider mode uses:

- `AUTH_PASSKEY_EXTERNAL_NAME`
- `AUTH_PASSKEY_EXTERNAL_SIGNIN_URL`
- `AUTH_PASSKEY_EXTERNAL_ENROLL_URL`
- `AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL`
- `AUTH_PASSKEY_CALLBACK_*`

See `docs/security/passkey-external-callback-contract.md` for the callback payload contract.

## Abuse-Control And Captcha Env Notes

If using Cloudflare Turnstile, configure:

- `VITE_TURNSTILE_SITE_KEY`
- `AUTH_EMAIL_TURNSTILE_SECRET`

Backend email-link abuse controls use `AUTH_EMAIL_*` settings for honeypot, throttling, block windows, and response timing.

## Backend API Key Notes

Coordinates backend calls no longer use a hardcoded fallback API key.

- `VITE_API_KEY` must be set in local env for frontend requests.
- Backend must set matching `API_KEY`.
- Treat `VITE_API_KEY` as public and keep the backend loopback-bound in normal development.

## Supabase Security Execution

- Apply and verify sequence: `docs/security/supabase-apply-and-verify.md`
- SQL hardening assets: `backend/supabase/*`
- Generated database contract: `src/supabase/database.ts`
