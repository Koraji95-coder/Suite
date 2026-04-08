from __future__ import annotations

import hashlib
import hmac
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


_SIG_PATTERN = re.compile(r"^[A-Fa-f0-9]{64}$")
_TS_PATTERN = re.compile(r"^\d{10,13}$")
_SIGNING_SECRET = "test-signing-secret"


def _build_runtime(
    *,
    request_obj: _RequestStub,
    logger: _LoggerStub,
    callback_states: dict,
    webauthn_states: dict,
    require_signed_callback: bool,
    signing_secret: str = _SIGNING_SECRET,
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
        passkey_callback_signature_pattern=_SIG_PATTERN,
        passkey_callback_timestamp_pattern=_TS_PATTERN,
        auth_passkey_require_signed_callback=require_signed_callback,
        auth_passkey_callback_signing_secret=signing_secret,
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


def _make_signature(secret: str, payload: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


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

    def test_verify_signature_success(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        payload = "\n".join([
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            str(timestamp),
        ])
        signature = _make_signature(_SIGNING_SECRET, payload)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_verify_signature_missing_secret(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
            signing_secret="",
        )
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "a" * 64,
            str(int(time.time())),
        )
        self.assertEqual((ok, reason), (False, "missing-secret"))

    def test_verify_signature_invalid_format(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "not-a-valid-hex-signature",
            str(int(time.time())),
        )
        self.assertEqual((ok, reason), (False, "invalid-signature-format"))

    def test_verify_signature_invalid_timestamp_format(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "a" * 64,
            "not-a-timestamp",
        )
        self.assertEqual((ok, reason), (False, "invalid-timestamp-format"))

    def test_verify_signature_timestamp_in_future(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        future_ts = int(time.time()) + 9999
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "a" * 64,
            str(future_ts),
        )
        self.assertEqual((ok, reason), (False, "timestamp-in-future"))

    def test_verify_signature_timestamp_expired(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        expired_ts = int(time.time()) - 9999
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "a" * 64,
            str(expired_ts),
        )
        self.assertEqual((ok, reason), (False, "timestamp-expired"))

    def test_verify_signature_mismatch(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        wrong_signature = _make_signature("wrong-secret", "arbitrary-payload")
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            wrong_signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (False, "signature-mismatch"))

    def test_verify_signature_normalizes_email_and_case(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        payload = "\n".join([
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            str(timestamp),
        ])
        signature = _make_signature(_SIGNING_SECRET, payload)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "SIGN-IN",
            "SUCCESS",
            "USER@EXAMPLE.COM",
            "",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_verify_signature_normalizes_error_message_whitespace(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        payload = "\n".join([
            "state-token",
            "error",
            "failed",
            "user@example.com",
            "line1  line2",
            str(timestamp),
        ])
        signature = _make_signature(_SIGNING_SECRET, payload)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "error",
            "failed",
            "user@example.com",
            "line1\r\nline2",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_normalize_origin_via_runtime(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertEqual(
            runtime.normalize_origin("https://app.example.com/path?q=1"),
            "https://app.example.com",
        )
        self.assertIsNone(runtime.normalize_origin("not-a-url"))

    def test_normalize_origin_http_scheme(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertEqual(
            runtime.normalize_origin("http://internal.corp/any/path"),
            "http://internal.corp",
        )

    def test_normalize_origin_preserves_port(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertEqual(
            runtime.normalize_origin("https://app.example.com:8443/path"),
            "https://app.example.com:8443",
        )

    def test_normalize_origin_empty_string(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertIsNone(runtime.normalize_origin(""))

    def test_normalize_origin_unsupported_scheme(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertIsNone(runtime.normalize_origin("ftp://files.example.com/pub"))

    def test_normalize_origin_no_netloc(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertIsNone(runtime.normalize_origin("https:///no-host/path"))

    def test_normalize_origin_strips_fragment(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertEqual(
            runtime.normalize_origin("https://app.example.com/page#section"),
            "https://app.example.com",
        )

    def test_is_valid_rp_id_for_origin_via_runtime(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=False,
        )
        self.assertTrue(
            runtime.is_valid_webauthn_rp_id_for_origin("example.com", "https://app.example.com")
        )
        self.assertFalse(
            runtime.is_valid_webauthn_rp_id_for_origin("other.com", "https://app.example.com")
        )

    def test_verify_signature_millisecond_timestamp(self) -> None:
        """Timestamps supplied in milliseconds must be auto-converted to seconds."""
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp_s = int(time.time())
        timestamp_ms = timestamp_s * 1000
        payload = "\n".join([
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            str(timestamp_s),
        ])
        signature = _make_signature(_SIGNING_SECRET, payload)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            signature,
            str(timestamp_ms),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_build_and_verify_signature_round_trip(self) -> None:
        """build_passkey_callback_signature_payload + verify form a consistent round-trip."""
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        payload_str = runtime.build_passkey_callback_signature_payload(
            "state-abc",
            "enroll",
            "success",
            "user@example.com",
            "some error",
            timestamp,
        )
        signature = _make_signature(_SIGNING_SECRET, payload_str)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-abc",
            "enroll",
            "success",
            "user@example.com",
            "some error",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_verify_signature_error_message_multi_newline(self) -> None:
        """Multi-line error messages are collapsed: \\r→space then \\n→space."""
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        # Normalization: \r→" " then \n→" ".
        # "line1\r\nline2\nline3" → "line1  line2 line3" (double-space before line2).
        payload = "\n".join([
            "state-token",
            "error",
            "failed",
            "user@example.com",
            "line1  line2 line3",
            str(timestamp),
        ])
        signature = _make_signature(_SIGNING_SECRET, payload)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "error",
            "failed",
            "user@example.com",
            "line1\r\nline2\nline3",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_verify_signature_empty_error_message(self) -> None:
        """An empty error_message field round-trips cleanly."""
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            callback_states={},
            webauthn_states={},
            require_signed_callback=True,
        )
        timestamp = int(time.time())
        payload_str = runtime.build_passkey_callback_signature_payload(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            timestamp,
        )
        signature = _make_signature(_SIGNING_SECRET, payload_str)
        ok, reason = runtime.verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            signature,
            str(timestamp),
        )
        self.assertEqual((ok, reason), (True, "ok"))


if __name__ == "__main__":
    unittest.main()
