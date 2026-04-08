from __future__ import annotations

import hashlib
import logging
import re
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List

from flask import Blueprint, g, jsonify, request
from ..response_helpers import make_error_response
from flask_limiter import Limiter


def create_auth_passkey_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    deps: Dict[str, Any],
) -> Blueprint:
    """Create /api/auth passkey route group blueprint."""
    bp = Blueprint("auth_passkey_api", __name__, url_prefix="/api/auth")

    _logger = logger or logging.getLogger(__name__)

    DEFAULT_PASSKEY_REDIRECT_PATH = "/login"
    ALLOWED_REDIRECT_PATHS = {
        "/login",
        "/signup",
        "/app/settings",
    }
    AUTH_PASSKEY_RP_ID = deps.get("AUTH_PASSKEY_RP_ID", "")
    AUTH_PASSKEY_RP_NAME = deps.get("AUTH_PASSKEY_RP_NAME", "")
    AUTH_PASSKEY_REQUIRE_USER_VERIFICATION = bool(
        deps.get("AUTH_PASSKEY_REQUIRE_USER_VERIFICATION", False)
    )
    AUTH_PASSKEY_REQUIRE_RESIDENT_KEY = bool(deps.get("AUTH_PASSKEY_REQUIRE_RESIDENT_KEY", False))
    AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS = int(deps.get("AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS", 60000))
    SUPABASE_SERVICE_ROLE_KEY = str(deps.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    WEBAUTHN_AVAILABLE = bool(deps.get("WEBAUTHN_AVAILABLE", False))

    PASSKEY_CALLBACK_STATE_PATTERN = deps.get(
        "PASSKEY_CALLBACK_STATE_PATTERN",
        re.compile(r"^[A-Za-z0-9_-]{8,128}$"),
    )
    PASSKEY_CREDENTIAL_ID_PATTERN = deps.get(
        "PASSKEY_CREDENTIAL_ID_PATTERN",
        re.compile(r"^[A-Za-z0-9_-]+$"),
    )
    PASSKEY_CALLBACK_STATES = deps.get("PASSKEY_CALLBACK_STATES", {})
    PASSKEY_CALLBACK_STATES_LOCK = deps.get("PASSKEY_CALLBACK_STATES_LOCK", threading.Lock())

    _auth_passkey_capability = deps.get(
        "_auth_passkey_capability",
        lambda: {
            "enabled": False,
            "provider": "supabase",
            "provider_label": "Supabase",
            "handlers_ready": False,
            "next_step": "Configure passkey provider.",
        },
    )
    _get_request_ip = deps.get("_get_request_ip", lambda: "unknown")
    _resolve_passkey_webauthn_expected_origin = deps.get(
        "_resolve_passkey_webauthn_expected_origin",
        lambda: (None, "missing-origin"),
    )
    _is_valid_webauthn_rp_id_for_origin = deps.get(
        "_is_valid_webauthn_rp_id_for_origin",
        lambda _rp_id, _origin: False,
    )
    _options_to_json_dict = deps.get("_options_to_json_dict", lambda _opts: {})
    _create_passkey_webauthn_state = deps.get(
        "_create_passkey_webauthn_state",
        lambda **_kwargs: ("", 0.0),
    )
    _create_passkey_callback_state = deps.get(
        "_create_passkey_callback_state",
        lambda **_kwargs: ("", 0.0),
    )
    _build_external_passkey_redirect = deps.get(
        "_build_external_passkey_redirect",
        lambda _intent, _state, _redirect: None,
    )
    _get_supabase_user_id = deps.get("_get_supabase_user_id", lambda _user: None)
    _get_supabase_user_email = deps.get("_get_supabase_user_email", lambda _user: None)
    _fetch_active_passkeys_for_user_id = deps.get(
        "_fetch_active_passkeys_for_user_id",
        lambda _user_id: [],
    )
    _normalize_passkey_transports = deps.get(
        "_normalize_passkey_transports",
        lambda _value: [],
    )
    _consume_passkey_webauthn_state = deps.get(
        "_consume_passkey_webauthn_state",
        lambda _state_token, _expected_intent: (None, "invalid"),
    )
    _extract_passkey_credential_id = deps.get(
        "_extract_passkey_credential_id",
        lambda _payload: "",
    )
    _fetch_active_passkey_by_credential_id = deps.get(
        "_fetch_active_passkey_by_credential_id",
        lambda _credential_id: None,
    )
    _is_valid_email = deps.get("_is_valid_email", lambda value: bool(value and "@" in value))
    _update_user_passkey_row = deps.get(
        "_update_user_passkey_row",
        lambda _passkey_id, _payload: (True, None, 200),
    )
    _generate_supabase_magic_link_url = deps.get(
        "_generate_supabase_magic_link_url",
        lambda _email, **_kwargs: "",
    )
    _send_supabase_email_link = deps.get("_send_supabase_email_link", lambda *_args, **_kwargs: None)
    _normalize_passkey_friendly_name = deps.get(
        "_normalize_passkey_friendly_name",
        lambda value: str(value or "").strip(),
    )
    _coerce_webauthn_enum_value = deps.get(
        "_coerce_webauthn_enum_value",
        lambda value: str(value or ""),
    )
    _insert_user_passkey_row = deps.get(
        "_insert_user_passkey_row",
        lambda _row: ({}, None, 201),
    )
    _build_auth_redirect_url = deps.get(
        "_build_auth_redirect_url",
        lambda _path, _client_redirect_to="": None,
    )
    _get_passkey_callback_state = deps.get(
        "_get_passkey_callback_state",
        lambda _state: (None, "invalid"),
    )
    _verify_passkey_callback_signature = deps.get(
        "_verify_passkey_callback_signature",
        lambda **_kwargs: (False, "not-configured"),
    )
    _consume_passkey_callback_state = deps.get(
        "_consume_passkey_callback_state",
        lambda _state: (None, "invalid"),
    )

    generate_authentication_options = deps.get("generate_authentication_options")
    generate_registration_options = deps.get("generate_registration_options")
    verify_authentication_response = deps.get("verify_authentication_response")
    verify_registration_response = deps.get("verify_registration_response")
    base64url_to_bytes = deps.get("base64url_to_bytes")
    bytes_to_base64url = deps.get("bytes_to_base64url")
    UserVerificationRequirement = deps.get("UserVerificationRequirement")
    ResidentKeyRequirement = deps.get("ResidentKeyRequirement")
    PublicKeyCredentialDescriptor = deps.get("PublicKeyCredentialDescriptor")
    AuthenticatorSelectionCriteria = deps.get("AuthenticatorSelectionCriteria")
    AuthenticatorTransport = deps.get("AuthenticatorTransport")

    @bp.route("/passkey-capability", methods=["GET"])
    @limiter.limit("60 per hour")
    def api_auth_passkey_capability():
        """Expose passkey rollout capability status for frontend gating."""
        payload = _auth_passkey_capability()
        return (
            jsonify(
                {
                    "ok": True,
                    "passkey": payload,
                    "server_time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
            ),
            200,
        )

    @bp.route("/passkey/sign-in", methods=["POST"])
    @limiter.limit("20 per hour")
    def api_auth_passkey_sign_in():
        """Start a passkey sign-in flow."""
        payload = request.get_json(silent=True) if request.is_json else {}
        payload = payload or {}
        client_redirect_to = str(payload.get("redirectTo") or payload.get("redirect_to") or "").strip()
        requested_redirect_path = str(
            payload.get("redirectPath") or payload.get("redirect_path") or ""
        ).strip()
        redirect_path = requested_redirect_path if requested_redirect_path in ALLOWED_REDIRECT_PATHS else DEFAULT_PASSKEY_REDIRECT_PATH
        client_ip = _get_request_ip()

        capability = _auth_passkey_capability()
        if not capability.get("enabled"):
            return make_error_response("Passkey sign-in is disabled.", code="passkey-disabled", status=503)

        if not capability.get("handlers_ready"):
            return (
                jsonify(
                    {
                        "error": "Passkey sign-in is not available for the configured provider.",
                        "code": "passkey-provider-unavailable",
                        "provider": capability.get("provider"),
                        "next_step": capability.get("next_step"),
                    }
                ),
                501,
            )

        if capability.get("provider") == "first-party":
            expected_origin, origin_reason = _resolve_passkey_webauthn_expected_origin()
            if not expected_origin:
                return (
                    jsonify(
                        {
                            "error": "Passkey origin is not allowed or could not be resolved.",
                            "code": "passkey-origin-invalid",
                            "reason": origin_reason,
                        }
                    ),
                    503,
                )

            if not _is_valid_webauthn_rp_id_for_origin(AUTH_PASSKEY_RP_ID, expected_origin):
                return (
                    jsonify(
                        {
                            "error": "Passkey RP ID does not match this origin.",
                            "code": "passkey-rp-mismatch",
                            "rp_id": AUTH_PASSKEY_RP_ID,
                            "origin": expected_origin,
                        }
                    ),
                    503,
                )

            if not WEBAUTHN_AVAILABLE or generate_authentication_options is None:
                return (
                    jsonify(
                        {
                            "error": "WebAuthn server dependency is unavailable.",
                            "code": "passkey-webauthn-unavailable",
                        }
                    ),
                    503,
                )

            user_verification = (
                UserVerificationRequirement.REQUIRED
                if AUTH_PASSKEY_REQUIRE_USER_VERIFICATION
                else UserVerificationRequirement.PREFERRED
            )
            try:
                authentication_options = generate_authentication_options(
                    rp_id=AUTH_PASSKEY_RP_ID,
                    user_verification=user_verification,
                    timeout=AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS,
                )
                public_key_options = _options_to_json_dict(authentication_options)
                challenge = str(public_key_options.get("challenge") or "").strip()
            except Exception as exc:
                _logger.exception("Failed to generate passkey sign-in options: %s", exc)
                return (
                    jsonify(
                        {
                            "error": "Unable to generate passkey sign-in options.",
                            "code": "passkey-options-generation-failed",
                        }
                    ),
                    500,
                )

            if not challenge:
                return (
                    jsonify(
                        {
                            "error": "Generated passkey options were missing challenge.",
                            "code": "passkey-options-invalid",
                        }
                    ),
                    500,
                )

            state_token, expires_at = _create_passkey_webauthn_state(
                intent="sign-in",
                challenge=challenge,
                expected_origin=expected_origin,
                client_ip=client_ip,
                client_redirect_to=client_redirect_to,
            )

            return (
                jsonify(
                    {
                        "ok": True,
                        "method": "passkey",
                        "mode": "webauthn",
                        "provider": capability.get("provider"),
                        "provider_label": capability.get("provider_label"),
                        "state": state_token,
                        "state_expires_at": datetime.fromtimestamp(
                            expires_at, tz=timezone.utc
                        ).isoformat().replace("+00:00", "Z"),
                        "public_key": public_key_options,
                        "message": "Complete passkey verification on this device.",
                    }
                ),
                200,
            )

        state_token, expires_at = _create_passkey_callback_state(
            intent="sign-in",
            client_ip=client_ip,
            client_redirect_to=client_redirect_to,
        )
        redirect_url = _build_external_passkey_redirect(
            "sign-in",
            state_token,
            client_redirect_to,
        )
        if not redirect_url:
            with PASSKEY_CALLBACK_STATES_LOCK:
                PASSKEY_CALLBACK_STATES.pop(state_token, None)
            return (
                jsonify(
                    {
                        "error": "Passkey sign-in provider URL is invalid or missing.",
                        "code": "passkey-config-invalid",
                    }
                ),
                503,
            )

        return (
            jsonify(
                {
                    "ok": True,
                    "method": "passkey",
                    "mode": "redirect",
                    "provider": capability.get("provider"),
                    "provider_label": capability.get("provider_label"),
                    "state": state_token,
                    "state_expires_at": datetime.fromtimestamp(
                        expires_at, tz=timezone.utc
                    ).isoformat().replace("+00:00", "Z"),
                    "redirect_url": redirect_url,
                    "message": "Continue passkey sign-in with your identity provider.",
                }
            ),
            200,
        )

    @bp.route("/passkey/enroll", methods=["POST"])
    @require_supabase_user
    @limiter.limit("20 per hour")
    def api_auth_passkey_enroll():
        """Start a passkey enrollment flow for an authenticated user."""
        payload = request.get_json(silent=True) if request.is_json else {}
        payload = payload or {}
        client_redirect_to = str(payload.get("redirectTo") or payload.get("redirect_to") or "").strip()
        client_ip = _get_request_ip()

        user = getattr(g, "supabase_user", {}) or {}
        user_id = _get_supabase_user_id(user) or ""
        user_email = _get_supabase_user_email(user) or ""

        capability = _auth_passkey_capability()
        if not capability.get("enabled"):
            return make_error_response("Passkey enrollment is disabled.", code="passkey-disabled", status=503)

        if not capability.get("handlers_ready"):
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment is not available for the configured provider.",
                        "code": "passkey-provider-unavailable",
                        "provider": capability.get("provider"),
                        "next_step": capability.get("next_step"),
                    }
                ),
                501,
            )

        if capability.get("provider") == "first-party":
            if not user_id or not user_email:
                return (
                    jsonify(
                        {
                            "error": "Authenticated user context is incomplete.",
                            "code": "passkey-user-context-missing",
                        }
                    ),
                    401,
                )

            expected_origin, origin_reason = _resolve_passkey_webauthn_expected_origin()
            if not expected_origin:
                return (
                    jsonify(
                        {
                            "error": "Passkey origin is not allowed or could not be resolved.",
                            "code": "passkey-origin-invalid",
                            "reason": origin_reason,
                        }
                    ),
                    503,
                )

            if not _is_valid_webauthn_rp_id_for_origin(AUTH_PASSKEY_RP_ID, expected_origin):
                return (
                    jsonify(
                        {
                            "error": "Passkey RP ID does not match this origin.",
                            "code": "passkey-rp-mismatch",
                            "rp_id": AUTH_PASSKEY_RP_ID,
                            "origin": expected_origin,
                        }
                    ),
                    503,
                )

            if (
                not WEBAUTHN_AVAILABLE
                or generate_registration_options is None
                or PublicKeyCredentialDescriptor is None
                or AuthenticatorSelectionCriteria is None
                or ResidentKeyRequirement is None
                or UserVerificationRequirement is None
            ):
                return (
                    jsonify(
                        {
                            "error": "WebAuthn server dependency is unavailable.",
                            "code": "passkey-webauthn-unavailable",
                        }
                    ),
                    503,
                )

            existing_passkeys = _fetch_active_passkeys_for_user_id(user_id)
            exclude_credentials: List[Any] = []
            for row in existing_passkeys:
                credential_id = str(row.get("credential_id") or "").strip()
                if not PASSKEY_CREDENTIAL_ID_PATTERN.match(credential_id):
                    continue

                try:
                    descriptor_kwargs: Dict[str, Any] = {
                        "id": base64url_to_bytes(credential_id),
                    }
                    transports_raw = _normalize_passkey_transports(row.get("transports"))
                    if transports_raw and AuthenticatorTransport is not None:
                        parsed_transports: List[Any] = []
                        for transport in transports_raw:
                            try:
                                parsed_transports.append(AuthenticatorTransport(transport))
                            except Exception:
                                continue
                        if parsed_transports:
                            descriptor_kwargs["transports"] = parsed_transports

                    exclude_credentials.append(PublicKeyCredentialDescriptor(**descriptor_kwargs))
                except Exception:
                    continue

            user_verification = (
                UserVerificationRequirement.REQUIRED
                if AUTH_PASSKEY_REQUIRE_USER_VERIFICATION
                else UserVerificationRequirement.PREFERRED
            )
            resident_key = (
                ResidentKeyRequirement.REQUIRED
                if AUTH_PASSKEY_REQUIRE_RESIDENT_KEY
                else ResidentKeyRequirement.PREFERRED
            )

            try:
                registration_options = generate_registration_options(
                    rp_id=AUTH_PASSKEY_RP_ID,
                    rp_name=AUTH_PASSKEY_RP_NAME,
                    user_id=user_id.encode("utf-8"),
                    user_name=user_email,
                    user_display_name=user_email,
                    timeout=AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS,
                    exclude_credentials=exclude_credentials,
                    authenticator_selection=AuthenticatorSelectionCriteria(
                        resident_key=resident_key,
                        user_verification=user_verification,
                    ),
                )
                public_key_options = _options_to_json_dict(registration_options)
                challenge = str(public_key_options.get("challenge") or "").strip()
            except Exception as exc:
                _logger.exception("Failed to generate passkey enrollment options: %s", exc)
                return (
                    jsonify(
                        {
                            "error": "Unable to generate passkey enrollment options.",
                            "code": "passkey-options-generation-failed",
                        }
                    ),
                    500,
                )

            if not challenge:
                return (
                    jsonify(
                        {
                            "error": "Generated passkey options were missing challenge.",
                            "code": "passkey-options-invalid",
                        }
                    ),
                    500,
                )

            state_token, expires_at = _create_passkey_webauthn_state(
                intent="enroll",
                challenge=challenge,
                expected_origin=expected_origin,
                client_ip=client_ip,
                client_redirect_to=client_redirect_to,
                user_id=user_id,
                email=user_email,
            )

            return (
                jsonify(
                    {
                        "ok": True,
                        "method": "passkey",
                        "mode": "webauthn",
                        "provider": capability.get("provider"),
                        "provider_label": capability.get("provider_label"),
                        "state": state_token,
                        "state_expires_at": datetime.fromtimestamp(
                            expires_at, tz=timezone.utc
                        ).isoformat().replace("+00:00", "Z"),
                        "public_key": public_key_options,
                        "message": "Complete passkey enrollment on this device.",
                    }
                ),
                200,
            )

        state_token, expires_at = _create_passkey_callback_state(
            intent="enroll",
            client_ip=client_ip,
            client_redirect_to=client_redirect_to,
            user_id=user_id,
            email=user_email,
        )
        redirect_url = _build_external_passkey_redirect(
            "enroll",
            state_token,
            client_redirect_to,
        )
        if not redirect_url:
            with PASSKEY_CALLBACK_STATES_LOCK:
                PASSKEY_CALLBACK_STATES.pop(state_token, None)
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment provider URL is invalid or missing.",
                        "code": "passkey-config-invalid",
                    }
                ),
                503,
            )

        return (
            jsonify(
                {
                    "ok": True,
                    "method": "passkey",
                    "mode": "redirect",
                    "provider": capability.get("provider"),
                    "provider_label": capability.get("provider_label"),
                    "state": state_token,
                    "state_expires_at": datetime.fromtimestamp(
                        expires_at, tz=timezone.utc
                    ).isoformat().replace("+00:00", "Z"),
                    "redirect_url": redirect_url,
                    "message": "Continue passkey enrollment with your identity provider.",
                }
            ),
            200,
        )

    @bp.route("/passkey/auth/verify", methods=["POST"])
    @limiter.limit("40 per hour")
    def api_auth_passkey_auth_verify():
        """Verify a first-party WebAuthn assertion and continue sign-in."""
        capability = _auth_passkey_capability()
        if not capability.get("enabled"):
            return make_error_response("Passkey sign-in is disabled.", code="passkey-disabled", status=503)
        if capability.get("provider") != "first-party":
            return (
                jsonify(
                    {
                        "error": "Passkey provider does not support first-party verify endpoint.",
                        "code": "passkey-provider-mode-mismatch",
                        "provider": capability.get("provider"),
                    }
                ),
                409,
            )
        if not capability.get("handlers_ready"):
            return (
                jsonify(
                    {
                        "error": "Passkey sign-in handlers are not ready.",
                        "code": "passkey-provider-unavailable",
                        "next_step": capability.get("next_step"),
                    }
                ),
                503,
            )
        if not request.is_json:
            return make_error_response("Expected JSON payload.")

        if verify_authentication_response is None or base64url_to_bytes is None or not WEBAUTHN_AVAILABLE:
            return (
                jsonify(
                    {
                        "error": "WebAuthn verification dependencies are unavailable.",
                        "code": "passkey-webauthn-unavailable",
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) or {}
        state_token = str(payload.get("state") or "").strip()
        credential_payload = payload.get("credential")

        if not state_token:
            return make_error_response("state is required.")
        if not PASSKEY_CALLBACK_STATE_PATTERN.match(state_token):
            return make_error_response("Invalid state format.")
        if not isinstance(credential_payload, dict):
            return make_error_response("credential payload is required.")

        webauthn_state, reason = _consume_passkey_webauthn_state(
            state_token,
            expected_intent="sign-in",
        )
        if not webauthn_state:
            if reason == "expired":
                return make_error_response("Passkey challenge expired. Start again.", status=410)
            if reason == "intent-mismatch":
                return make_error_response("Passkey challenge intent mismatch.")
            return make_error_response("Invalid passkey challenge state.")

        credential_id = _extract_passkey_credential_id(credential_payload)
        if not credential_id:
            return (
                jsonify(
                    {
                        "error": "Passkey credential id is missing or malformed.",
                        "code": "passkey-credential-invalid",
                    }
                ),
                400,
            )

        passkey_row = _fetch_active_passkey_by_credential_id(credential_id)
        if not passkey_row:
            _logger.warning(
                "Passkey sign-in credential not found credential_hash=%s",
                hashlib.sha256(credential_id.encode("utf-8")).hexdigest()[:12],
            )
            return (
                jsonify(
                    {
                        "error": "Passkey credential was not recognized by this Suite environment.",
                        "code": "passkey-credential-not-found",
                        "next_step": (
                            "If you reset local Supabase or switched environments, "
                            "sign in with an email link and enroll this passkey again "
                            "from Settings."
                        ),
                    }
                ),
                401,
            )

        user_email = str(passkey_row.get("user_email") or "").strip().lower()
        if not _is_valid_email(user_email):
            return (
                jsonify(
                    {
                        "error": "Passkey record is missing a valid account email.",
                        "code": "passkey-account-email-invalid",
                    }
                ),
                502,
            )

        expected_challenge = str(webauthn_state.get("challenge") or "").strip()
        expected_origin = str(webauthn_state.get("expected_origin") or "").strip()
        if not expected_challenge or not expected_origin:
            return (
                jsonify(
                    {
                        "error": "Passkey challenge state was malformed.",
                        "code": "passkey-state-invalid",
                    }
                ),
                400,
            )

        credential_public_key = str(passkey_row.get("public_key") or "").strip()
        try:
            current_sign_count = int(passkey_row.get("sign_count") or 0)
        except Exception:
            current_sign_count = 0

        try:
            verification = verify_authentication_response(
                credential=credential_payload,
                expected_challenge=base64url_to_bytes(expected_challenge),
                expected_rp_id=AUTH_PASSKEY_RP_ID,
                expected_origin=expected_origin,
                credential_public_key=base64url_to_bytes(credential_public_key),
                credential_current_sign_count=current_sign_count,
                require_user_verification=AUTH_PASSKEY_REQUIRE_USER_VERIFICATION,
            )
        except Exception as exc:
            _logger.warning(
                "Passkey sign-in verification failed credential_hash=%s reason=%s",
                hashlib.sha256(credential_id.encode("utf-8")).hexdigest()[:12],
                exc,
            )
            return (
                jsonify(
                    {
                        "error": "Passkey verification failed.",
                        "code": "passkey-verification-failed",
                    }
                ),
                401,
            )

        try:
            new_sign_count = int(getattr(verification, "new_sign_count", current_sign_count))
        except Exception:
            new_sign_count = current_sign_count

        passkey_id = str(passkey_row.get("id") or "").strip()
        if passkey_id:
            ok, patch_error, patch_status = _update_user_passkey_row(
                passkey_id,
                    {
                        "sign_count": max(new_sign_count, 0),
                        "last_used_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    },
                )
            if not ok:
                _logger.warning(
                    "Passkey usage update failed passkey_id=%s status=%s error=%s",
                    passkey_id,
                    patch_status,
                    patch_error,
                )

        client_redirect_to = str(webauthn_state.get("client_redirect_to") or "").strip()
        if SUPABASE_SERVICE_ROLE_KEY:
            try:
                magic_link = _generate_supabase_magic_link_url(
                    user_email,
                    client_redirect_to=client_redirect_to,
                    redirect_path="/login",
                )
                return (
                    jsonify(
                        {
                            "ok": True,
                            "completed": True,
                            "intent": "sign-in",
                            "status": "success",
                            "session_mode": "magic-link-direct",
                            "resume_url": magic_link,
                            "message": "Passkey verified. Continuing sign-in.",
                        }
                    ),
                    200,
                )
            except Exception as exc:
                _logger.warning("Passkey sign-in direct magic-link generation failed: %s", exc)

        try:
            _send_supabase_email_link(
                user_email,
                "signin",
                client_redirect_to=client_redirect_to,
                redirect_path="/login",
            )
        except Exception as exc:
            _logger.warning("Passkey sign-in email-link fallback failed: %s", exc)
            return (
                jsonify(
                    {
                        "error": "Passkey verified, but sign-in continuation failed.",
                        "code": "passkey-continuation-failed",
                    }
                ),
                502,
            )

        return (
            jsonify(
                {
                    "ok": True,
                    "completed": True,
                    "intent": "sign-in",
                    "status": "success",
                    "session_mode": "email-link-fallback",
                    "message": "Passkey verified. Check your email to finish sign-in.",
                }
            ),
            200,
        )

    @bp.route("/passkey/register/verify", methods=["POST"])
    @require_supabase_user
    @limiter.limit("40 per hour")
    def api_auth_passkey_register_verify():
        """Verify a first-party WebAuthn registration response and store passkey metadata."""
        capability = _auth_passkey_capability()
        if not capability.get("enabled"):
            return make_error_response("Passkey enrollment is disabled.", code="passkey-disabled", status=503)
        if capability.get("provider") != "first-party":
            return (
                jsonify(
                    {
                        "error": "Passkey provider does not support first-party verify endpoint.",
                        "code": "passkey-provider-mode-mismatch",
                        "provider": capability.get("provider"),
                    }
                ),
                409,
            )
        if not capability.get("handlers_ready"):
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment handlers are not ready.",
                        "code": "passkey-provider-unavailable",
                        "next_step": capability.get("next_step"),
                    }
                ),
                503,
            )
        if not request.is_json:
            return make_error_response("Expected JSON payload.")

        if (
            verify_registration_response is None
            or base64url_to_bytes is None
            or bytes_to_base64url is None
            or not WEBAUTHN_AVAILABLE
        ):
            return (
                jsonify(
                    {
                        "error": "WebAuthn verification dependencies are unavailable.",
                        "code": "passkey-webauthn-unavailable",
                    }
                ),
                503,
            )

        user = getattr(g, "supabase_user", {}) or {}
        user_id = _get_supabase_user_id(user) or ""
        user_email = _get_supabase_user_email(user) or ""
        if not user_id or not user_email:
            return (
                jsonify(
                    {
                        "error": "Authenticated user context is incomplete.",
                        "code": "passkey-user-context-missing",
                    }
                ),
                401,
            )

        payload = request.get_json(silent=True) or {}
        state_token = str(payload.get("state") or "").strip()
        credential_payload = payload.get("credential")
        friendly_name = _normalize_passkey_friendly_name(
            payload.get("friendly_name") or payload.get("friendlyName")
        )

        if not state_token:
            return make_error_response("state is required.")
        if not PASSKEY_CALLBACK_STATE_PATTERN.match(state_token):
            return make_error_response("Invalid state format.")
        if not isinstance(credential_payload, dict):
            return make_error_response("credential payload is required.")

        webauthn_state, reason = _consume_passkey_webauthn_state(
            state_token,
            expected_intent="enroll",
        )
        if not webauthn_state:
            if reason == "expired":
                return make_error_response("Passkey challenge expired. Start again.", status=410)
            if reason == "intent-mismatch":
                return make_error_response("Passkey challenge intent mismatch.")
            return make_error_response("Invalid passkey challenge state.")

        expected_user_id = str(webauthn_state.get("user_id") or "").strip()
        expected_email = str(webauthn_state.get("email") or "").strip().lower()
        if expected_user_id and expected_user_id != user_id:
            return (
                jsonify(
                    {
                        "error": "Passkey challenge user mismatch.",
                        "code": "passkey-user-mismatch",
                    }
                ),
                403,
            )
        if expected_email and expected_email != user_email:
            return (
                jsonify(
                    {
                        "error": "Passkey challenge email mismatch.",
                        "code": "passkey-email-mismatch",
                    }
                ),
                403,
            )

        expected_challenge = str(webauthn_state.get("challenge") or "").strip()
        expected_origin = str(webauthn_state.get("expected_origin") or "").strip()
        if not expected_challenge or not expected_origin:
            return (
                jsonify(
                    {
                        "error": "Passkey challenge state was malformed.",
                        "code": "passkey-state-invalid",
                    }
                ),
                400,
            )

        try:
            verification = verify_registration_response(
                credential=credential_payload,
                expected_challenge=base64url_to_bytes(expected_challenge),
                expected_rp_id=AUTH_PASSKEY_RP_ID,
                expected_origin=expected_origin,
                require_user_verification=AUTH_PASSKEY_REQUIRE_USER_VERIFICATION,
            )
        except Exception as exc:
            _logger.warning("Passkey enrollment verification failed user_id=%s reason=%s", user_id, exc)
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment verification failed.",
                        "code": "passkey-verification-failed",
                    }
                ),
                401,
            )

        credential_id = bytes_to_base64url(getattr(verification, "credential_id", b""))
        public_key = bytes_to_base64url(getattr(verification, "credential_public_key", b""))
        if not credential_id or not public_key:
            return (
                jsonify(
                    {
                        "error": "Passkey registration payload was missing credential data.",
                        "code": "passkey-registration-invalid",
                    }
                ),
                400,
            )

        try:
            sign_count = int(getattr(verification, "sign_count", 0) or 0)
        except Exception:
            sign_count = 0

        aaguid = _coerce_webauthn_enum_value(getattr(verification, "aaguid", "")).strip()
        device_type = _coerce_webauthn_enum_value(
            getattr(verification, "credential_device_type", "")
        ).strip()
        backed_up = bool(getattr(verification, "credential_backed_up", False))

        transports: List[str] = []
        response_payload = credential_payload.get("response")
        if isinstance(response_payload, dict):
            transports = _normalize_passkey_transports(response_payload.get("transports"))
        if not transports:
            transports = _normalize_passkey_transports(credential_payload.get("transports"))

        passkey_row = {
            "user_id": user_id,
            "user_email": user_email,
            "credential_id": credential_id,
            "public_key": public_key,
            "sign_count": max(sign_count, 0),
            "aaguid": aaguid or None,
            "device_type": device_type or None,
            "backed_up": backed_up,
            "transports": transports,
            "friendly_name": friendly_name or None,
            "last_used_at": None,
            "revoked_at": None,
        }

        inserted, insert_error, insert_status = _insert_user_passkey_row(passkey_row)
        if insert_error:
            lowered = insert_error.lower()
            if (
                insert_status == 409
                or "duplicate" in lowered
                or "already exists" in lowered
                or "23505" in lowered
            ):
                return (
                    jsonify(
                        {
                            "error": "This passkey is already enrolled.",
                            "code": "passkey-duplicate",
                        }
                    ),
                    409,
                )
            _logger.warning(
                "Passkey insert failed user_id=%s status=%s error=%s",
                user_id,
                insert_status,
                insert_error,
            )
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment succeeded, but storing metadata failed.",
                        "code": "passkey-store-failed",
                    }
                ),
                502,
            )

        settings_url = _build_auth_redirect_url(
            "/app/settings",
            str(webauthn_state.get("client_redirect_to") or "").strip(),
        )
        passkey_summary = {
            "id": str((inserted or {}).get("id") or ""),
            "credential_id": credential_id,
            "friendly_name": str((inserted or {}).get("friendly_name") or "") or None,
            "device_type": str((inserted or {}).get("device_type") or "") or None,
            "created_at": (inserted or {}).get("created_at"),
        }
        return (
            jsonify(
                {
                    "ok": True,
                    "completed": True,
                    "intent": "enroll",
                    "status": "success",
                    "passkey": passkey_summary,
                    "redirect_to": settings_url,
                    "message": "Passkey enrollment complete.",
                }
            ),
            200,
        )

    @bp.route("/passkey/callback/complete", methods=["POST"])
    @limiter.limit("60 per hour")
    def api_auth_passkey_callback_complete():
        """Complete a passkey callback by consuming one-time state and issuing the next auth step."""
        if not request.is_json:
            return make_error_response("Expected JSON payload.")

        payload = request.get_json(silent=True) or {}
        state_token = str(payload.get("state") or payload.get("passkey_state") or "").strip()
        if not state_token:
            return make_error_response("state is required.")
        if not PASSKEY_CALLBACK_STATE_PATTERN.match(state_token):
            return make_error_response("Invalid state format.")

        status = str(payload.get("status") or payload.get("passkey_status") or "").strip().lower()
        if status not in {"success", "failed"}:
            return make_error_response("status must be success or failed.")

        callback_state, reason = _get_passkey_callback_state(state_token)
        if not callback_state:
            if reason == "expired":
                return make_error_response("Passkey callback state expired. Start again.", status=410)
            return make_error_response("Invalid passkey callback state.")

        intent = str(callback_state.get("intent") or "").strip().lower()
        payload_intent = str(payload.get("intent") or payload.get("passkey_intent") or "").strip().lower()
        if payload_intent and payload_intent != intent:
            return (
                jsonify(
                    {
                        "error": "Passkey callback intent mismatch.",
                        "code": "passkey-intent-mismatch",
                    }
                ),
                400,
            )

        provider_error = str(payload.get("error") or payload.get("passkey_error") or "").strip()
        email = str(payload.get("email") or payload.get("passkey_email") or "").strip().lower()
        callback_signature = str(
            payload.get("signature")
            or payload.get("passkey_signature")
            or payload.get("provider_signature")
            or ""
        ).strip().lower()
        callback_timestamp_raw = str(
            payload.get("timestamp")
            or payload.get("passkey_timestamp")
            or payload.get("provider_timestamp")
            or ""
        ).strip()

        if status == "success" and intent == "sign-in" and not _is_valid_email(email):
            return (
                jsonify(
                    {
                        "error": "A valid email is required to complete passkey sign-in.",
                        "code": "passkey-email-required",
                    }
                ),
                400,
            )

        signature_ok, signature_reason = _verify_passkey_callback_signature(
            state=state_token,
            intent=intent,
            status=status,
            email=email,
            error_message=provider_error,
            signature=callback_signature,
            timestamp_raw=callback_timestamp_raw,
        )
        if not signature_ok:
            state_fingerprint = hashlib.sha256(state_token.encode("utf-8")).hexdigest()[:12]
            _logger.warning(
                "Rejected passkey callback signature: reason=%s intent=%s state_hash=%s ip=%s",
                signature_reason,
                intent,
                state_fingerprint,
                _get_request_ip(),
            )
            return (
                jsonify(
                    {
                        "error": "Passkey callback signature validation failed.",
                        "code": "passkey-callback-signature-invalid",
                        "reason": signature_reason,
                    }
                ),
                401,
            )

        callback_state, reason = _consume_passkey_callback_state(state_token)
        if not callback_state:
            if reason == "expired":
                return make_error_response("Passkey callback state expired. Start again.", status=410)
            return (
                jsonify(
                    {
                        "error": "Passkey callback state has already been used.",
                        "code": "passkey-callback-state-used",
                    }
                ),
                409,
            )

        client_redirect_to = str(callback_state.get("client_redirect_to") or "").strip()
        expected_email = str(callback_state.get("email") or "").strip().lower()
        if intent == "enroll" and expected_email and email and expected_email != email:
            return (
                jsonify(
                    {
                        "error": "Passkey enrollment email mismatch.",
                        "code": "passkey-email-mismatch",
                    }
                ),
                400,
            )

        if status == "failed":
            message = provider_error or "Passkey verification was not completed."
            return (
                jsonify(
                    {
                        "ok": True,
                        "completed": False,
                        "intent": intent,
                        "status": "failed",
                        "message": message,
                    }
                ),
                200,
            )

        if intent == "sign-in":
            if SUPABASE_SERVICE_ROLE_KEY:
                try:
                    magic_link = _generate_supabase_magic_link_url(
                        email,
                        client_redirect_to=client_redirect_to,
                        redirect_path="/login",
                    )
                    return (
                        jsonify(
                            {
                                "ok": True,
                                "completed": True,
                                "intent": intent,
                                "session_mode": "magic-link-direct",
                                "resume_url": magic_link,
                                "message": "Passkey verified. Continuing sign-in.",
                            }
                        ),
                        200,
                    )
                except Exception as exc:
                    _logger.warning("Passkey callback direct magic-link generation failed: %s", exc)

            try:
                _send_supabase_email_link(
                    email,
                    "signin",
                    client_redirect_to=client_redirect_to,
                    redirect_path="/login",
                )
            except Exception as exc:
                _logger.warning("Passkey callback email-link fallback failed: %s", exc)
                return (
                    jsonify(
                        {
                            "error": "Passkey callback completed, but sign-in continuation failed.",
                            "code": "passkey-continuation-failed",
                        }
                    ),
                    502,
                )

            return (
                jsonify(
                    {
                        "ok": True,
                        "completed": True,
                        "intent": intent,
                        "session_mode": "email-link-fallback",
                        "message": "Passkey verified. Check your email to finish sign-in.",
                    }
                ),
                200,
            )

        if intent == "enroll":
            settings_url = _build_auth_redirect_url("/app/settings", client_redirect_to)
            return (
                jsonify(
                    {
                        "ok": True,
                        "completed": True,
                        "intent": intent,
                        "status": "success",
                        "redirect_to": settings_url,
                        "message": "Passkey enrollment verified. Return to settings.",
                    }
                ),
                200,
            )

        return (
            jsonify(
                {
                    "error": "Unsupported passkey callback intent.",
                    "code": "passkey-intent-invalid",
                }
            ),
            400,
        )

    return bp
