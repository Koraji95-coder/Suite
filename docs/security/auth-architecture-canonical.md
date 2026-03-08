# Suite Auth Architecture (Canonical)

This is the canonical auth reference for Suite, including frontend, backend broker, and ZeroClaw boundaries.

## 1) System Boundaries

- Identity/session authority: Supabase Auth (email-link session + JWT access token).
- Product auth orchestrator: Suite backend (`/api/auth/*`, `/api/agent/*`).
- Agent execution transport: ZeroClaw gateway.
- Pairing source of truth in broker mode: Suite backend session/challenge state.

ZeroClaw does **not** decide Supabase redirect behavior for pairing emails. Redirect selection is built in Suite backend before any ZeroClaw token exchange.

## 2) End-to-End Flows

### 2.1 Login (email link)

1. Frontend calls `POST /api/auth/email-link`.
2. Backend requests Supabase OTP email with `email_redirect_to`.
3. User clicks email link.
4. Frontend consumes Supabase session from URL and rehydrates auth context.

### 2.2 Broker Pairing (pair/unpair)

1. Frontend calls `POST /api/agent/pairing-challenge` with `action=pair|unpair`.
2. Backend validates Supabase user + abuse controls.
3. For `pair`, backend fetches one-time gateway pairing code server-side.
4. Backend stores one-time challenge (user/email bound, TTL).
5. Backend sends Supabase email link to callback path with `agent_action` + `agent_challenge`.
6. Frontend callback page confirms via `POST /api/agent/pairing-confirm`.
7. Backend:
   - `pair`: exchanges stored code with ZeroClaw, sets broker session cookie.
   - `unpair`: revokes token and clears broker session cookie.

## 3) Redirect Determinism Rules

### 3.1 Supabase allowlist policy (required)

For each dev origin you use (`http://localhost:5173` and `http://127.0.0.1:5173`), add exact callback URLs:

- `/login`
- `/agent/pairing-callback`
- `/app/settings`

Do not rely on root or broad wildcards for broker pairing verification.

### 3.2 Backend redirect selection order

`client_redirect_to` -> `AUTH_EMAIL_REDIRECT_URL` -> request `Origin` -> request `Referer`.

If allowlist validation rejects all candidates, redirect build fails and pairing email request returns an error. Backend logs include request correlation details.

## 4) Runtime State and Restart Semantics

- Pairing challenges are in-memory backend state.
- Broker agent sessions are in-memory backend state.
- Backend restart invalidates pending pairing challenges and active broker session records.

Operational result:
- If user clicks an old verification link after backend restart, confirm returns expired/invalid and user must request a new link.

## 5) Request/Response Trace Samples

### 5.1 Pair challenge request

`POST /api/agent/pairing-challenge`

```json
{
  "action": "pair",
  "redirect_to": "http://localhost:5173/login",
  "redirect_path": "/login"
}
```

Success (`202`):

```json
{
  "ok": true,
  "action": "pair",
  "message": "Verification link sent to your email.",
  "expires_at": "2026-03-08T00:00:00Z",
  "requestId": "agent-..."
}
```

### 5.2 Pair confirm request

`POST /api/agent/pairing-confirm`

```json
{
  "challenge_id": "..."
}
```

Success (`200`):

```json
{
  "paired": true,
  "verified": true,
  "action": "pair",
  "requestId": "agent-..."
}
```

## 6) Failure Matrix

| Case | HTTP | Behavior |
|---|---:|---|
| Challenge link expired | 410 | Request new verification link |
| Wrong signed-in user/email | 403 | Sign in to matching account, then retry |
| Invalid challenge | 400 | Request new link |
| Local abuse cooldown | 429 | Respect `Retry-After` / `retry_after_seconds` |
| Supabase email throttle | 429 | Wait for provider cooldown, then resend |
| Redirect build failure | 400/5xx | Fix allowlist/redirect config and retry |
| Backend restart before confirm | 400/410 | Request a new link (old challenge invalid) |

## 7) 429 Layering and Troubleshooting

429s can come from different layers:

- Frontend cooldown state (UI guard).
- Suite backend abuse controls (`reason`, `retry_after_seconds`).
- Supabase SMTP/auth email limits (provider-level throttling).
- Flask limiter defaults.

Raising Flask limits alone will not bypass Supabase provider throttles.

## 8) ZeroClaw Auth Boundary (Verified)

ZeroClaw handles:

- Pairing code exchange (`/pair`).
- Bearer-token revocation (`/unpair`).
- Bearer enforcement for gateway calls.

ZeroClaw does not:

- Send Supabase email links.
- Build Supabase `email_redirect_to`.
- Decide pairing callback destinations for Suite.
