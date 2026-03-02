# Auth Readiness Checklist

Date: March 2, 2026  
Repo: `Suite`

## Already in place

- Passwordless email-link auth (`signin` + `signup`) via backend `POST /api/auth/email-link`
- Redirect origin allowlist on frontend + backend
- Generic auth email responses to reduce account-enumeration signal
- Auth anti-abuse controls:
  - email+IP fingerprint window/min-interval/block
  - per-IP window/block
  - honeypot field
  - optional Turnstile verification
  - response timing floor + jitter
- Agent pairing challenge-confirm flow with one-time challenge consumption
- Agent pairing anti-abuse controls:
  - challenge TTL + max store size
  - per-user/action window/min-interval/block
  - invalid confirm-attempt window/block
  - `Retry-After` response metadata when throttled
- Direct broker pair/unpair actions disabled (`428`)
- Passkey capability probe endpoint exists:
  - `GET /api/auth/passkey-capability`
  - rollout gated by `VITE_AUTH_PASSKEY_ENABLED` + `AUTH_PASSKEY_ENABLED`
- Passkey start handlers exist behind rollout flags:
  - `POST /api/auth/passkey/sign-in`
  - `POST /api/auth/passkey/enroll`
  - `POST /api/auth/passkey/callback/complete`
  - external provider redirect path is active when `AUTH_PASSKEY_PROVIDER=external` and external start URLs are configured
  - one-time callback state is enforced server-side (TTL + consume-once)
  - optional required callback signing for external providers (`AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=true`)
  - callback signature freshness checks (`AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS`, clock-skew guard)
  - ZeroClaw bridge endpoint emits signed callback fields for Suite:
    - `GET /suite/passkey/callback`
    - docs: `zeroclaw-main/docs/suite-passkey-bridge.md`
  - provider JWT claims can be required (`suite_claims_required=1`) so callback status/email are claim-backed, not query-backed
- Auth method telemetry is active for email-link flows (`security:auth_method:*` in `activity_log`)
  - reference: `docs/security/auth-telemetry.md`

## Remaining before "auth complete"

1. Passkey provider path
- Decide implementation path:
  - Supabase-native WebAuthn/passkeys if enabled in your project + chosen SDK path
  - or external passkey IdP with Supabase for data auth
- Current workspace note: installed `@supabase/supabase-js` is `2.57.4`; passkey/WebAuthn is not exposed as a first-class client auth flow in this repo today.
- Finalize account-linking policy after external redirect.
- Add passkey list/revoke UX and recovery UX.

2. Auth method telemetry expansion
- Add dashboard/alerts for passkey completion vs failure rates and spike detection.
- Add alerting thresholds for enrollment/revocation and auth-failure spikes.

3. Recovery and lockout policy
- Define lost-device recovery policy.
- Define admin/operator workflow for secure recovery without passwords.

4. Test matrix completion
- Desktop/mobile passkey enrollment + login
- synced-device login
- fallback email-link recovery
- revoke credential effect and session behavior

## Suggested next implementation step

1. Add passkey credential management UI (list/revoke) and recovery policy UX.
2. Finalize account-linking policy and production runbook for external provider operations.
