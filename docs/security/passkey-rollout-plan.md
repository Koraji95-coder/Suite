# Passkey Rollout Plan

Date: March 2, 2026  
Repo: `Suite`

## Current State

- Auth is passwordless email-link only (`signin` + `signup` via `/api/auth/email-link`).
- In-app password reset/update flows are removed.
- Redirect handling is allowlisted on both frontend and backend.
- Backend auth endpoint includes anti-abuse controls (`AUTH_EMAIL_*` env vars).

## Why This Plan Exists

Passkeys are the target primary login method, but rollout should avoid lockout risk and preserve operational stability.

## Capability Check (Current Workspace)

`@supabase/auth-js` in this workspace exposes OTP/password flows and TOTP/phone MFA APIs.  
Passkey-specific client methods are not currently present in the installed SDK surface, so passkey rollout should be staged and validated against your selected identity-provider path.

## Target Auth Model

1. Passkey as primary sign-in.
2. Email-link as fallback and account recovery.
3. Same redirect allowlist + abuse controls remain in place.

## Implementation Phases

## Phase 1: Provider Path Decision

Choose one path:

- Path A: Supabase-native passkeys (if available in your project/auth tier and SDK path).
- Path B: External passkey-capable IdP (OIDC/SAML) and keep Supabase for app data authorization.

Exit criteria:

- Provider supports registration, authentication, revocation, and recovery flows.
- Operational logging and audit events can be captured.
- Provider callback contract is signed and verified server-side (HMAC/JWT claim verification).

## Phase 2: Data + Policy Layer

- Add user auth-method tracking (e.g., passkey enrolled, enrolled_at, last_used_at).
- Define policy for minimum factors (at least one passkey OR email-link fallback).
- Add admin-safe recovery policy (lost device / passkey reset).

Exit criteria:

- No account can become irrecoverable.
- Account recovery does not rely on passwords.

## Phase 3: UX Integration

- Add “Enroll passkey” in Account settings.
- Add “Use passkey” primary action on login, with email-link fallback.
- Add passkey management UI: list, rename, revoke credentials.

Exit criteria:

- New user can sign up, enroll passkey, sign in with passkey, and recover with email-link fallback.

## Phase 4: Progressive Enforcement

- Start with optional passkeys.
- Promote passkey to primary for users with enrolled credentials.
- Optionally enforce passkey for privileged/admin roles.

Exit criteria:

- Support tickets and auth failure rate are acceptable.
- Abuse metrics remain stable or improved.

## Phase 5: Hardening and Monitoring

- Log auth method used (`email_link`, `passkey`) per event.
- Alert on abnormal enrollment/revocation spikes.
- Keep rate limits and anti-automation controls on all auth entry points.

Exit criteria:

- Production auth posture is measurable and auditable.

## Minimum Testing Matrix

- Enroll passkey on desktop + mobile.
- Sign in with passkey on same device and synced-device.
- Fallback to email-link when passkey unavailable.
- Lost-device recovery path.
- Revoke credential and verify immediate effect.
- Redirect and origin allowlist behavior under all auth callbacks.
