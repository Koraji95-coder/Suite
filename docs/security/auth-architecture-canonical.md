# Suite Auth Architecture (Canonical)

This is the canonical auth reference for Suite after agent retirement.

## System Boundaries

- Identity and session authority: Supabase Auth.
- Product auth orchestrator: Suite frontend plus Suite backend `/api/auth/*` helpers.
- Supported auth surfaces: passwordless email-link login and passkey rollout helpers.
- Office owns local agent, chat, and orchestration work outside this repo.

## End-To-End Flows

### Email-link login

1. Frontend calls `POST /api/auth/email-link`.
2. Backend requests the Supabase email link with an approved redirect.
3. User opens the link on `/login` or `/signup`.
4. Frontend consumes the Supabase session from the URL and rehydrates auth state.

### Passkey continuation

1. Frontend queries `GET /api/auth/passkey-capability`.
2. If enabled, frontend starts passkey sign-in or enrollment through:
   - `POST /api/auth/passkey/sign-in`
   - `POST /api/auth/passkey/enroll`
3. External-provider callbacks complete through:
   - `POST /api/auth/passkey/callback/complete`
   - `GET /suite/passkey/callback` when external bridge mode is configured

## Redirect Rules

Supabase redirect allowlists must include exact paths for each allowed origin:

- `/login`
- `/signup`
- `/app/settings`

Backend redirect selection order remains:

`client_redirect_to` -> `AUTH_EMAIL_REDIRECT_URL` -> request `Origin` -> request `Referer`

If allowlist validation rejects all candidates, redirect building fails and auth start returns an error.

## Runtime State

- Supabase remains the source of truth for identity.
- Passkey callback state is short-lived backend state.
- Backend restarts invalidate pending passkey callback state and require the user to restart that passkey flow.

## Failure Matrix

| Case | HTTP | Behavior |
|---|---:|---|
| Callback state expired | 400/410 | Restart the passkey flow |
| Redirect allowlist rejection | 400/5xx | Fix origin config and retry |
| Supabase email throttle | 429 | Wait for provider cooldown |
| Backend auth-provider timeout | 503 | Retry after provider recovers |

## Security Notes

- Keep `AUTH_ALLOWED_REDIRECT_ORIGINS` and `VITE_AUTH_ALLOWED_ORIGINS` aligned.
- Keep signed passkey callback verification enabled when external provider mode is active.
- Do not reintroduce pairing, broker, or gateway-side auth flows into Suite.
