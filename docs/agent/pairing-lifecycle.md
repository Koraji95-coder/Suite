# Agent Pairing Lifecycle (Canonical)

This is the canonical operator runbook for broker-first pairing in Suite.
For full auth architecture (Supabase + broker + ZeroClaw boundaries), see:
`docs/security/auth-architecture-canonical.md`.

## Defaults

- Transport default: `VITE_AGENT_TRANSPORT=backend`
- Pairing email redirect path default: `/login`
- `/login` forwards to `/agent/pairing-callback` when pairing params are present.
- Supabase allowlist should include exact callback URLs for both dev origins:
  - `http://localhost:5173/login`
  - `http://localhost:5173/agent/pairing-callback`
  - `http://localhost:5173/app/settings`
  - `http://127.0.0.1:5173/login`
  - `http://127.0.0.1:5173/agent/pairing-callback`
  - `http://127.0.0.1:5173/app/settings`
- Broker pairing policy:
  - `pair` requires email verification
  - `unpair` requires email verification
- Direct broker endpoints are disabled:
  - `POST /api/agent/pair` -> `428`
  - `POST /api/agent/unpair` -> `428`

## Lifecycle Diagram

```text
User (signed in) -> POST /api/agent/pairing-challenge { action: pair|unpair }
Backend -> validates user + abuse controls
Backend (pair only) -> requests one-time gateway pairing code server-side
Backend -> stores one-time challenge (user/email bound, TTL)
Backend -> sends Supabase email link to /login with { agent_action, agent_challenge }
User -> opens email link in app
Frontend (callback page) -> POST /api/agent/pairing-confirm { challenge_id }
Backend -> consumes challenge once, validates user/email match
Backend -> executes action:
  pair: exchanges stored code with gateway, sets broker session cookie
  unpair: revokes gateway token, clears broker session cookie
Frontend -> refreshes session status and shows pairing completion screen
```

## Operator Runbook

1. Pair this device.
- In Settings -> Agent pairing, click `Pair this device`.
- User receives verification email.
- User opens the link.
- Frontend auto-confirms and status changes to `Paired`.

2. Unpair this device.
- Click `Unpair this device`.
- User receives verification email.
- User opens the link.
- Frontend auto-confirms and status changes to `Not paired`.

3. Resend verification.
- If a link is lost or expired, click `Resend verification`.
- App resends the most recent action type (`pair` or `unpair`).

## Failure and Recovery

1. Link expired.
- `POST /api/agent/pairing-confirm` returns `410`.
- User requests a fresh verification link from Settings.

2. User mismatch or wrong account.
- `POST /api/agent/pairing-confirm` returns `403`.
- User must sign in with the email that requested verification.

3. Abuse throttle/block.
- Endpoints may return `429` with `retry_after_seconds` + `Retry-After`.
- Wait for cooldown and retry.

4. Gateway unavailable.
- Pair challenge can fail before email send if gateway pairing code request fails.
- Verify gateway health and broker env (`AGENT_GATEWAY_URL`, `AGENT_WEBHOOK_SECRET`).

## API Reference (Pairing Only)

- `POST /api/agent/pairing-challenge`
  - Request: `{ "action": "pair" | "unpair" }`
  - Response: `202` accepted with verification email message
- `POST /api/agent/pairing-confirm`
  - Request: `{ "challenge_id": "<id from email link>" }`
  - Response:
    - Pair success: `{ paired: true, verified: true, action: "pair", ... }`
    - Unpair success: `{ paired: false, verified: true, action: "unpair", ... }`
- `GET /api/agent/session`
  - Response: `{ paired: boolean, expires_at?: string }`
- `POST /api/agent/session/clear`
  - Local sign-out cleanup path for broker session cookie
