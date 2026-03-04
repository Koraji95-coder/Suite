from __future__ import annotations

import json
import re
import threading
import time
import unittest

from backend.route_groups.api_passkey_runtime import create_passkey_runtime


class _RequestStub:
    def __init__(self) -> None:
        self.headers = {}


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message, *args) -> None:
        self.warnings.append((message, args))


def _build_runtime(
    *,
    request_obj: _RequestStub,
    logger: _LoggerStub,
    callback_states: dict,
    webauthn_states: dict,
    require_signed_callback: bool,
):
    return create_passkey_runtime(
        request_obj=request_obj,
        logger=logger,
        options_to_json_fn=lambda _opts: '{"challenge":"abc"}',
        json_module=json,
        auth_email_redirect_url="https://app.example.com",
        auth_allowed_redirect_origins=["https://app.example.com"],
        auth_passkey_allowed_origins=["https://app.example.com"],
        passkey_callback_states=callback_states,
        passkey_callback_states_lock=threading.Lock(),
        passkey_webauthn_states=webauthn_states,
        passkey_webauthn_states_lock=threading.Lock(),
        auth_passkey_callback_state_ttl_seconds=300,
        auth_passkey_callback_state_max_entries=1000,
        auth_passkey_webauthn_state_ttl_seconds=300,
        auth_passkey_webauthn_state_max_entries=1000,
        passkey_credential_id_pattern=re.compile(r"^[A-Za-z0-9_-]{16,1024}$"),
        passkey_callback_state_pattern=re.compile(r"^[A-Za-z0-9_-]{20,200}$"),
        passkey_callback_signature_pattern=re.compile(r"^[A-Fa-f0-9]{64}$"),
        passkey_callback_timestamp_pattern=re.compile(r"^\d{10,13}$"),
        auth_passkey_require_signed_callback=require_signed_callback,
        auth_passkey_callback_signing_secret="secret",
        auth_passkey_callback_signature_max_age_seconds=300,
        auth_passkey_callback_signature_max_clock_skew_seconds=90,
        auth_passkey_enabled=True,
        auth_passkey_provider="external",
        auth_passkey_external_name="External IdP",
        auth_passkey_external_discovery_url="https://idp.example.com/.well-known/openid-configuration",
        auth_passkey_external_signin_url="https://idp.example.com/signin",
        auth_passkey_external_enroll_url="https://idp.example.com/enroll",
        webauthn_available=True,
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role",
        auth_passkey_rp_id="example.com",
        auth_passkey_rp_name="Suite",
        webauthn_import_error="",
    )


class TestApiPasskeyRuntime(unittest.TestCase):
    def test_callback_state_lifecycle(self) -> None:
        callback_states = {}
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states=callback_states,
            webauthn_states={},
            require_signed_callback=True,
        )

        state, _expires_at = runtime.create_passkey_callback_state(
            "sign-in",
            "127.0.0.1",
            "https://app.example.com",
            "user-1",
            "User@Example.com",
        )
        payload, reason = runtime.get_passkey_callback_state(state)
        self.assertEqual(reason, "ok")
        self.assertEqual((payload or {}).get("email"), "user@example.com")
        consumed, reason = runtime.consume_passkey_callback_state(state)
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(consumed)
        self.assertNotIn(state, callback_states)

    def test_webauthn_state_intent_check(self) -> None:
        webauthn_states = {}
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states=webauthn_states,
            require_signed_callback=True,
        )

        state, _expires_at = runtime.create_passkey_webauthn_state(
            "enroll",
            "challenge-1",
            "https://app.example.com",
            "127.0.0.1",
            "https://app.example.com/settings",
            "user-1",
            "user@example.com",
        )
        consumed, reason = runtime.consume_passkey_webauthn_state(state, "sign-in")
        self.assertIsNone(consumed)
        self.assertEqual(reason, "intent-mismatch")

        consumed, reason = runtime.consume_passkey_webauthn_state(state, "enroll")
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(consumed)

    def test_build_auth_redirect_url(self) -> None:
        request_obj = _RequestStub()
        request_obj.headers["Origin"] = "https://app.example.com"
        runtime = _build_runtime(
            request_obj=request_obj,
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )

        result = runtime.build_auth_redirect_url(
            "/login",
            "https://app.example.com/anything",
            {"a": "1", "": "x", "b": ""},
        )
        self.assertEqual(result, "https://app.example.com/login?a=1")

    def test_options_to_json_dict(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        self.assertEqual(runtime.options_to_json_dict(object()), {"challenge": "abc"})

    def test_auth_passkey_capability_ready_for_external(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        payload = runtime.auth_passkey_capability()
        self.assertTrue(payload["handlers_ready"])
        self.assertEqual(payload["rollout_state"], "ready")

    def test_verify_signature_disabled_mode(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "",
            str(int(time.time())),
        )
        self.assertEqual((ok, reason), (True, "disabled"))


if __name__ == "__main__":
    unittest.main()
