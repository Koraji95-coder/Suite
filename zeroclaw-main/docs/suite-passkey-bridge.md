# Suite Passkey Bridge

Date: March 2, 2026

This document describes the ZeroClaw gateway endpoint that bridges Suite's external passkey redirect flow.

## Endpoint

- `GET /suite/passkey/callback`

Use this endpoint as both:

- `AUTH_PASSKEY_EXTERNAL_SIGNIN_URL`
- `AUTH_PASSKEY_EXTERNAL_ENROLL_URL`

in the Suite backend.

## Incoming Query Parameters

Expected from Suite redirect start handlers:

- `suite_intent` (`sign-in` or `enroll`)
- `suite_state` (one-time state token from Suite backend)
- `suite_return_to` (Suite frontend URL to redirect back to)
- `suite_callback_sig_required` (`1`/`true` to require signed callback)
- `suite_claims_required` (`1`/`true` to require provider JWT claims token)

Optional provider outcome params:

- `status` or `passkey_status` (`success` or `failed`)
- `email` or `passkey_email`
- `error` or `passkey_error`
- `provider_token` (JWT claims token; aliases: `passkey_token`, `id_token`, `jwt`)

If omitted, status defaults to `success`.

Important for Suite sign-in continuation:

- `sign-in` callbacks must include a valid email claim (`email`/`passkey_email`).
- Without email, gateway converts the callback to failed status so Suite does not continue with an unbound identity.

When `suite_claims_required=1`, gateway requires a valid provider JWT token and uses JWT claims as the canonical source for `status`/`email`/`error`.

## Redirect Behavior

Gateway validates and redirects to `suite_return_to` with:

- `passkey_state`
- `passkey_intent`
- `passkey_status`
- `passkey_email` (when present)
- `passkey_error` (when present)
- `passkey_signature` + `passkey_timestamp` (when signed callbacks are required)

For `sign-in`, if a `success` callback lacks a valid email, gateway automatically downgrades to:

- `passkey_status=failed`
- `passkey_error=Passkey sign-in callback did not include a valid email.`

## Signature Contract

When `suite_callback_sig_required=1`, gateway signs callback fields with HMAC-SHA256.

Signing secret env var lookup order:

1. `ZC_SUITE_PASSKEY_CALLBACK_SIGNING_SECRET`
2. `AUTH_PASSKEY_CALLBACK_SIGNING_SECRET`
3. `SUITE_PASSKEY_CALLBACK_SIGNING_SECRET`

Canonical payload string:

`state + "\n" + intent + "\n" + status + "\n" + email + "\n" + error + "\n" + timestamp`

Signature output:

- lowercase hex digest (`passkey_signature`)
- unix timestamp seconds (`passkey_timestamp`)

## Provider JWT Claims Contract

When `suite_claims_required=1`, gateway validates HS256 JWT token and reads claims.

Required runtime secret:

- `ZC_SUITE_PASSKEY_PROVIDER_JWT_SECRET`
  (fallback keys: `SUITE_PASSKEY_PROVIDER_JWT_SECRET`, `AUTH_PASSKEY_EXTERNAL_PROVIDER_JWT_SECRET`)

Optional validation env vars:

- `ZC_SUITE_PASSKEY_PROVIDER_JWT_ISSUER`
- `ZC_SUITE_PASSKEY_PROVIDER_JWT_AUDIENCE`
- `ZC_SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_EXP` (default `true`)
- `ZC_SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_STATE` (default `true`)
- `ZC_SUITE_PASSKEY_PROVIDER_JWT_CLOCK_SKEW_SECONDS` (default `60`)

Expected claim mapping:

- state: `suite_state` (or `state`)
- intent: `suite_intent` (or `intent`, `passkey_intent`)
- status: `passkey_status` (or `status`)
- email: `passkey_email` (or `email`, `preferred_username`, `upn`)
- error: `passkey_error` (or `error`)

## Redirect Origin Allowlist

Gateway validates `suite_return_to` origin against:

1. `ZC_SUITE_CALLBACK_ALLOWED_ORIGINS` (comma-separated), else
2. `AUTH_ALLOWED_REDIRECT_ORIGINS`, else
3. defaults:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`

## Example

Suite backend `.env`:

```env
AUTH_PASSKEY_PROVIDER=external
AUTH_PASSKEY_EXTERNAL_SIGNIN_URL=http://127.0.0.1:42617/suite/passkey/callback
AUTH_PASSKEY_EXTERNAL_ENROLL_URL=http://127.0.0.1:42617/suite/passkey/callback
AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=true
AUTH_PASSKEY_CALLBACK_SIGNING_SECRET=replace-with-shared-secret
```

ZeroClaw gateway environment:

```env
ZC_SUITE_PASSKEY_CALLBACK_SIGNING_SECRET=replace-with-shared-secret
ZC_SUITE_CALLBACK_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```
