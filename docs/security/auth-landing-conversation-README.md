# Auth + Landing Status

Date: March 2, 2026  
Repo: `Suite`

## Current Auth State

- Supabase remains the identity provider.
- App auth is passwordless email-link only.
- Passkey rollout is probe-gated (not yet active for enrollment/login):
  - `GET /api/auth/passkey-capability`
  - `VITE_AUTH_PASSKEY_ENABLED`
  - `AUTH_PASSKEY_ENABLED`
  - `AUTH_PASSKEY_PROVIDER`
- Passkey start handlers are available behind rollout flags:
  - `POST /api/auth/passkey/sign-in`
  - `POST /api/auth/passkey/enroll`
  - `POST /api/auth/passkey/callback/complete`
  - Current active path is external-provider redirect mode when `AUTH_PASSKEY_PROVIDER=external` and external start URLs are configured.
  - Callback completion consumes one-time state and can continue sign-in via direct magic-link URL generation (service-role available) or email-link fallback.
  - External callback completion can require signed payload verification (`AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=true` + `AUTH_PASSKEY_CALLBACK_SIGNING_SECRET`).
  - ZeroClaw bridge endpoint is available for Suite external callback wiring: `GET /suite/passkey/callback` (see `zeroclaw-main/docs/suite-passkey-bridge.md`).
  - ZeroClaw bridge supports provider JWT claim verification (`suite_claims_required=1`) before emitting Suite callback params.
- Supported auth flows are:
  - `signin`
  - `signup`
- In-app password reset and password update UX are intentionally removed.

## Current Agent Pairing State

- Pairing/unpairing is email-verified in broker mode.
- Pair/unpair flow:
  1. `POST /api/agent/pairing-challenge`
     - `pair` challenge fetches gateway pairing code server-side (no client code entry required).
  2. User opens email link
  3. `POST /api/agent/pairing-confirm`
- Legacy direct broker endpoints are blocked:
  - `POST /api/agent/pair` -> `428`
  - `POST /api/agent/unpair` -> `428`
- Session-only cleanup endpoint exists for sign-out:
  - `POST /api/agent/session/clear`
- ZeroClaw gateway supports token revocation:
  - `POST /unpair` with bearer token
  - Last-token revoke generates a fresh one-time pairing code

## Security Hardening In Place

- Frontend and backend redirect allowlist validation.
- Generic auth-email response pattern to reduce account-enumeration signal.
- Auth abuse controls on `/api/auth/email-link`:
  - throttle window
  - min-interval guard
  - temporary block
  - per-IP window + temporary block
  - honeypot field
  - optional Turnstile verification
  - timing floor + jitter
- Pairing challenge controls:
  - challenge TTL
  - bounded challenge store
  - per-user/action window + min-interval + temporary block
  - user/email challenge binding
  - one-time challenge consumption
  - invalid pairing-confirm failure block
  - pairing code format validation (6 digits)
  - challenge id format validation
- Auth-method telemetry in `activity_log`:
  - `security:auth_method:email_link:*` events for request success/failure and sign-in completion
  - passkey action namespace reserved for rollout (`security:auth_method:passkey:*`)

## Legacy Cleanup Completed

- Password-reset routes removed from app routing.
- Password-update event types removed from security event model.
- Roadmap text updated to passwordless wording.
- Broker/API docs updated to current challenge-confirm flow.
- Seed Transmittal config scrubbed of committed live credential values.

## Environment Variables In Use

Primary auth:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `AUTH_EMAIL_REDIRECT_URL`
- `AUTH_ALLOWED_REDIRECT_ORIGINS`
- `VITE_AUTH_ALLOWED_ORIGINS`
- `AUTH_PASSKEY_*`
- `AUTH_EMAIL_*`
- `VITE_TURNSTILE_SITE_KEY`

Agent broker verification:
- `AGENT_GATEWAY_URL`
- `AGENT_WEBHOOK_SECRET`
- `AGENT_SESSION_*`
- `AGENT_PAIRING_CHALLENGE_TTL_SECONDS`
- `AGENT_PAIRING_CHALLENGE_MAX_ENTRIES`
- `AGENT_PAIRING_REDIRECT_PATH`
- `AGENT_PAIRING_ACTION_*`
- `AGENT_PAIRING_CONFIRM_FAILURE_*`

## Next Security Step

- Implement passkeys as primary auth, keep email-link as recovery fallback.
