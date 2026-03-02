# Auth + Landing Status

Date: March 2, 2026  
Repo: `Suite`

## Current Auth State

- Supabase remains the identity provider.
- App auth is passwordless email-link only.
- Supported auth flows are:
  - `signin`
  - `signup`
- In-app password reset and password update UX are intentionally removed.

## Current Agent Pairing State

- Pairing/unpairing is email-verified in broker mode.
- Pair/unpair flow:
  1. `POST /api/agent/pairing-challenge`
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
  - honeypot field
  - optional Turnstile verification
  - timing floor + jitter
- Pairing challenge controls:
  - challenge TTL
  - bounded challenge store
  - user/email challenge binding
  - one-time challenge consumption
  - pairing code format validation (6 digits)
  - challenge id format validation

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
- `AUTH_EMAIL_*`
- `VITE_TURNSTILE_SITE_KEY`

Agent broker verification:
- `AGENT_GATEWAY_URL`
- `AGENT_WEBHOOK_SECRET`
- `AGENT_SESSION_*`
- `AGENT_PAIRING_CHALLENGE_TTL_SECONDS`
- `AGENT_PAIRING_CHALLENGE_MAX_ENTRIES`
- `AGENT_PAIRING_REDIRECT_PATH`

## Next Security Step

- Implement passkeys as primary auth, keep email-link as recovery fallback.
