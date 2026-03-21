# Auth Hardening Follow-Up

This note records auth work that was intentionally left out of the dead-UI cleanup and local-artifact pruning tranche.

## Required follow-up

1. Close the fail-open auth redirect path.
   - Reject caller-controlled `redirectTo` values when `AUTH_ALLOWED_REDIRECT_ORIGINS` is empty instead of accepting the first normalized origin.
   - Keep email-link login, passkey continuation, and agent pairing redirects on an explicit allowlist.

2. Make broker transport the safe frontend default.
   - Treat an unset `VITE_AGENT_TRANSPORT` as backend/broker mode.
   - Keep direct transport as an explicit troubleshooting opt-in rather than an env-omission fallback.

3. Make the broker session cookie secure-by-default.
   - Default `AGENT_SESSION_SECURE` to `true` when the app is running behind HTTPS.
   - Preserve localhost HTTP developer ergonomics with an explicit local override instead of a globally insecure default.

## Current local state

- `.env` currently sets `VITE_AGENT_TRANSPORT=backend`.
- `.env` currently sets `AUTH_ALLOWED_REDIRECT_ORIGINS`.
- `.env` currently sets `AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=true`.
- `.env` still sets `AGENT_SESSION_SECURE=false`, which is acceptable for local HTTP but should not remain the deployment default.
