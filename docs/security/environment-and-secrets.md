# Environment & Secret Hygiene

This project uses environment variables for runtime configuration and keeps secrets out of source control.

## Public vs Secret Env Values

Any variable prefixed with `VITE_` is bundled client-side and should be considered public.

Safe examples:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AGENT_GATEWAY_URL`

Do **not** place server secrets in `VITE_*` variables.

## Git Ignore Guardrails

The repository ignore rules include:

- `.env` and `.env.*` (except `.env.example`)
- certificate/key formats (`*.pem`, `*.key`, `*.p12`, etc.)
- ZeroClaw-related local secret paths (`agent-secrets/`, `*.secret`)

## Required Local Setup

1. Copy `.env.example` to `.env`
2. Fill required values
3. Never commit `.env`

## Agent Security Notes

- Pairing now uses `X-Pairing-Code` header at `/pair`
- Token revocation now uses `POST /unpair` with `Authorization: Bearer <token>`
- Brokered `/api/agent/pair` and `/api/agent/unpair` direct actions are disabled in favor of email-verified challenge flow (`/api/agent/pairing-challenge` + `/api/agent/pairing-confirm`)
- Session-only cleanup for sign-out remains available at `POST /api/agent/session/clear`
- Webhook requests include bearer auth and required `X-Webhook-Secret` by default
- `VITE_AGENT_REQUIRE_WEBHOOK_SECRET` defaults to enforced mode (`true`)
- Set `VITE_AGENT_WEBHOOK_SECRET` in app env and configure the same shared secret on the gateway
- Use localhost agent gateway by default in development
- For production, prefer the backend broker flow:
  - Set `VITE_AGENT_TRANSPORT=backend` and `VITE_AGENT_BROKER_URL=/api/agent` (this is the default transport policy)
  - Configure backend-only env vars: `AGENT_GATEWAY_URL`, `AGENT_WEBHOOK_SECRET`
  - Configure pair/unpair email verification env vars:
    - `AGENT_PAIRING_CHALLENGE_TTL_SECONDS`
    - `AGENT_PAIRING_CHALLENGE_MAX_ENTRIES`
    - `AGENT_PAIRING_REDIRECT_PATH`
    - `AGENT_PAIRING_ACTION_WINDOW_SECONDS`
    - `AGENT_PAIRING_ACTION_MAX_ATTEMPTS`
    - `AGENT_PAIRING_ACTION_MIN_INTERVAL_SECONDS`
    - `AGENT_PAIRING_ACTION_BLOCK_SECONDS`
    - `AGENT_PAIRING_CONFIRM_FAILURE_WINDOW_SECONDS`
    - `AGENT_PAIRING_CONFIRM_FAILURE_MAX_ATTEMPTS`
    - `AGENT_PAIRING_CONFIRM_FAILURE_BLOCK_SECONDS`
  - Enable Supabase auth validation with `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`
  - If your Supabase project uses new ECC JWT keys, leave `SUPABASE_JWT_SECRET` empty and rely on JWKS via `SUPABASE_URL`
  - Tokens are stored server-side; the frontend never receives the bearer token

## Auth Module Notes

- Canonical auth context/hook live in `src/auth/*`
- Legacy duplicate auth context files were removed
- New auth logic should be added in `src/auth/*` to avoid duplicate state providers

## Passwordless Auth Deployment Note

- This app runs passwordless email-link auth only (`/login` entrypoint).
- Ensure Supabase redirect URLs include exact callback URLs for each allowed origin:
  - `/login`
  - `/agent/pairing-callback`
  - `/app/settings`
- Keep `AUTH_ALLOWED_REDIRECT_ORIGINS` and `VITE_AUTH_ALLOWED_ORIGINS` aligned with real origins.
- Canonical auth architecture/runbook: `docs/security/auth-architecture-canonical.md`.
- Passkey rollout is currently probe-gated (not fully active):
  - Frontend gate: `VITE_AUTH_PASSKEY_ENABLED`
  - Backend gate: `AUTH_PASSKEY_ENABLED`
  - Backend provider selector: `AUTH_PASSKEY_PROVIDER` (`supabase`, `external`, or `first-party`)
  - First-party WebAuthn mode (`AUTH_PASSKEY_PROVIDER=first-party`) requires:
    - `SUPABASE_SERVICE_ROLE_KEY` (backend reads/writes `public.user_passkeys`)
    - `AUTH_PASSKEY_RP_ID`
    - `AUTH_PASSKEY_RP_NAME`
    - `AUTH_PASSKEY_ALLOWED_ORIGINS`
    - optional tuning:
      - `AUTH_PASSKEY_WEBAUTHN_STATE_TTL_SECONDS`
      - `AUTH_PASSKEY_WEBAUTHN_STATE_MAX_ENTRIES`
      - `AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS`
      - `AUTH_PASSKEY_REQUIRE_USER_VERIFICATION`
      - `AUTH_PASSKEY_REQUIRE_RESIDENT_KEY`
  - External provider metadata (if using `external`): `AUTH_PASSKEY_EXTERNAL_NAME`, `AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL`
  - External passkey start URLs (if using `external`):
    - `AUTH_PASSKEY_EXTERNAL_SIGNIN_URL`
    - `AUTH_PASSKEY_EXTERNAL_ENROLL_URL` (optional; falls back to sign-in URL when empty)
  - Callback state controls:
    - `AUTH_PASSKEY_CALLBACK_STATE_TTL_SECONDS`
    - `AUTH_PASSKEY_CALLBACK_STATE_MAX_ENTRIES`
  - External callback signature controls:
    - `AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK`
    - `AUTH_PASSKEY_CALLBACK_SIGNING_SECRET`
    - `AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS`
    - `AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_CLOCK_SKEW_SECONDS`
  - Gateway callback-bridge compatibility env:
    - `ZC_SUITE_PASSKEY_CALLBACK_SIGNING_SECRET`
    - `ZC_SUITE_CALLBACK_ALLOWED_ORIGINS`
    - `ZC_SUITE_PASSKEY_PROVIDER_JWT_SECRET`
    - optional strict checks: `ZC_SUITE_PASSKEY_PROVIDER_JWT_ISSUER`, `ZC_SUITE_PASSKEY_PROVIDER_JWT_AUDIENCE`
- If using Cloudflare Turnstile, set:
  - `VITE_TURNSTILE_SITE_KEY` in frontend env
  - `AUTH_EMAIL_TURNSTILE_SECRET` in backend env
- Backend abuse controls are configurable with:
  - `AUTH_EMAIL_HONEYPOT_FIELD`
  - `AUTH_EMAIL_WINDOW_SECONDS`
  - `AUTH_EMAIL_MAX_ATTEMPTS`
  - `AUTH_EMAIL_MIN_INTERVAL_SECONDS`
  - `AUTH_EMAIL_BLOCK_SECONDS`
  - `AUTH_EMAIL_IP_WINDOW_SECONDS`
  - `AUTH_EMAIL_IP_MAX_ATTEMPTS`
  - `AUTH_EMAIL_IP_BLOCK_SECONDS`
  - `AUTH_EMAIL_MIN_RESPONSE_MS`
  - `AUTH_EMAIL_RESPONSE_JITTER_MS`
  - `AUTH_EMAIL_REQUIRE_TURNSTILE`

## Backend API Key Notes

Coordinates backend calls no longer use a hardcoded fallback API key.

- `VITE_API_KEY` must be set in local env for frontend requests
- Backend server must set matching `API_KEY`
- Treat `VITE_API_KEY` as non-secret (it is exposed client-side); scope backend network access to localhost (`API_HOST=127.0.0.1`) in normal development

## Supabase Security Execution

- Apply + verify sequence is documented in `docs/security/supabase-apply-and-verify.md`
- RLS and storage SQL scripts live in `backend/supabase/`
