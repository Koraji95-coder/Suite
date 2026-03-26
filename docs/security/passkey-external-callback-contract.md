# Suite External Passkey Callback Contract

Date: March 25, 2026  
Repo: `Suite`

This document is the Suite-side source of truth for external passkey callback wiring.

## Purpose

Suite can start passkey sign-in or enrollment through an external provider flow. After the provider completes, the callback must return enough verified context for Suite to resume auth safely.

The current Suite-native gateway implementation exposes:

- `GET /suite/passkey/callback`

That implementation detail may change later. This document describes the contract Suite expects regardless of which bridge or gateway serves it.

## Endpoint role

Use the external callback bridge as both:

- `AUTH_PASSKEY_EXTERNAL_SIGNIN_URL`
- `AUTH_PASSKEY_EXTERNAL_ENROLL_URL`

The bridge receives Suite-generated redirect parameters, validates the provider result, and redirects back to the Suite frontend with Suite callback parameters.

## Incoming query parameters

Expected Suite-generated parameters:

- `suite_intent` (`sign-in` or `enroll`)
- `suite_state` (one-time state token from the Suite backend)
- `suite_return_to` (Suite frontend URL to return to)
- `suite_callback_sig_required` (`1`/`true` when signed callback fields are required)
- `suite_claims_required` (`1`/`true` when provider JWT claims must be present)

Optional provider result parameters:

- `status` or `passkey_status` (`success` or `failed`)
- `email` or `passkey_email`
- `error` or `passkey_error`
- `provider_token` (JWT claims token; aliases: `passkey_token`, `id_token`, `jwt`)

If status is omitted, default it to `success`.

## Sign-in continuation rule

For `sign-in`, a successful callback must include a valid email identity.

If a callback claims success but does not provide a valid email, the bridge must downgrade it to:

- `passkey_status=failed`
- `passkey_error=Passkey sign-in callback did not include a valid email.`

This prevents Suite from continuing sign-in with an unbound identity.

## Redirect back to Suite

The bridge must redirect to `suite_return_to` with:

- `passkey_state`
- `passkey_intent`
- `passkey_status`
- `passkey_email` when present
- `passkey_error` when present
- `passkey_signature` and `passkey_timestamp` when signed callbacks are required

## Signed callback contract

When `suite_callback_sig_required=1`, the bridge signs the callback payload with HMAC-SHA256.

Canonical payload string:

`state + "\n" + intent + "\n" + status + "\n" + email + "\n" + error + "\n" + timestamp`

Expected output:

- lowercase hex digest in `passkey_signature`
- unix timestamp seconds in `passkey_timestamp`

Suite verifies this using:

- `AUTH_PASSKEY_CALLBACK_SIGNING_SECRET`
- `AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS`

## Provider JWT claims contract

When `suite_claims_required=1`, the bridge must validate the provider JWT and use claims as the canonical source for callback status and identity.

Expected claim mapping:

- state: `suite_state` or `state`
- intent: `suite_intent`, `intent`, or `passkey_intent`
- status: `passkey_status` or `status`
- email: `passkey_email`, `email`, `preferred_username`, or `upn`
- error: `passkey_error` or `error`

## Redirect origin allowlist

The bridge must validate `suite_return_to` against an allowlist. Use the same origin policy as Suite auth redirects:

- `AUTH_ALLOWED_REDIRECT_ORIGINS`
- local development defaults:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`

## Backend completion endpoint

The Suite backend completion step remains:

- `POST /api/auth/passkey/callback/complete`

Payload:

```json
{
  "state": "<one-time-state>",
  "status": "success",
  "email": "user@example.com",
  "intent": "sign-in",
  "signature": "<hex-hmac>",
  "timestamp": "1710000000"
}
```

Supported status values:

- `success`
- `failed`

Suite consumes callback state once, then continues sign-in or enrollment through the existing auth flow.

## Current implementation note

Today, the Suite-native gateway provides the callback bridge endpoint by default, and the isolated legacy fallback remains available only as a diagnostic escape hatch.

Use this document as the canonical Suite contract. Treat legacy bridge implementation paths as replaceable.
