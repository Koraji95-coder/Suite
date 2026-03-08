from __future__ import annotations

import re
import unittest
from urllib.parse import parse_qs, urlparse

from backend.route_groups.api_auth_redirect import (
    build_auth_redirect_url,
    build_external_passkey_redirect,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message, *args):
        self.warnings.append((message, args))


def _normalize_origin(candidate: str):
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


class TestApiAuthRedirect(unittest.TestCase):
    def test_build_auth_redirect_url_prefers_client_redirect(self) -> None:
        logger = _LoggerStub()
        result = build_auth_redirect_url(
            "login",
            "https://app.example.com/path",
            query_params={"a": "1", "": "x", "b": ""},
            auth_allowed_redirect_origins=["https://app.example.com"],
            auth_email_redirect_url="https://fallback.example.com",
            request_headers={},
            normalize_origin_fn=_normalize_origin,
            logger=logger,
        )
        self.assertEqual(result, "https://app.example.com/login?a=1")
        self.assertEqual(logger.warnings, [])

    def test_build_auth_redirect_url_rejects_origin_outside_allowlist(self) -> None:
        logger = _LoggerStub()
        result = build_auth_redirect_url(
            "/app/settings",
            "https://evil.example.com",
            query_params=None,
            auth_allowed_redirect_origins=["https://allowed.example.com"],
            auth_email_redirect_url="https://allowed.example.com",
            request_headers={"Origin": "https://also-evil.example.com"},
            normalize_origin_fn=_normalize_origin,
            logger=logger,
        )
        self.assertEqual(result, "https://allowed.example.com/app/settings")
        self.assertEqual(len(logger.warnings), 1)

    def test_build_auth_redirect_url_returns_none_when_no_valid_candidate(self) -> None:
        logger = _LoggerStub()
        result = build_auth_redirect_url(
            "/login",
            "",
            query_params=None,
            auth_allowed_redirect_origins=["https://allowed.example.com"],
            auth_email_redirect_url="",
            request_headers={"Origin": "invalid"},
            normalize_origin_fn=_normalize_origin,
            logger=logger,
        )
        self.assertIsNone(result)
        self.assertGreaterEqual(len(logger.warnings), 1)

    def test_build_external_passkey_redirect_invalid_inputs(self) -> None:
        pattern = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
        self.assertIsNone(
            build_external_passkey_redirect(
                "bad-intent",
                "a" * 24,
                passkey_callback_state_pattern=pattern,
                auth_passkey_external_signin_url="https://idp.example.com/signin",
                auth_passkey_external_enroll_url="",
                auth_passkey_require_signed_callback=True,
                auth_passkey_callback_signature_max_age_seconds=300,
                normalize_absolute_http_url_fn=lambda value: value,
                build_auth_redirect_url_fn=lambda *_args, **_kwargs: None,
            )
        )
        self.assertIsNone(
            build_external_passkey_redirect(
                "sign-in",
                "bad state",
                passkey_callback_state_pattern=pattern,
                auth_passkey_external_signin_url="https://idp.example.com/signin",
                auth_passkey_external_enroll_url="",
                auth_passkey_require_signed_callback=True,
                auth_passkey_callback_signature_max_age_seconds=300,
                normalize_absolute_http_url_fn=lambda value: value,
                build_auth_redirect_url_fn=lambda *_args, **_kwargs: None,
            )
        )

    def test_build_external_passkey_redirect_success(self) -> None:
        pattern = re.compile(r"^[A-Za-z0-9_-]{20,200}$")

        def build_redirect(path, client_redirect_to="", query_params=None):
            if path == "/api/auth/passkey/callback/complete":
                return "https://suite.example.com/api/auth/passkey/callback/complete"
            if path == "/login":
                return "https://suite.example.com/login?passkey_state=STATE1234567890123456&passkey_intent=sign-in"
            return None

        result = build_external_passkey_redirect(
            "sign-in",
            "STATE1234567890123456",
            "https://suite.example.com",
            passkey_callback_state_pattern=pattern,
            auth_passkey_external_signin_url="https://idp.example.com/signin?existing=1",
            auth_passkey_external_enroll_url="https://idp.example.com/enroll",
            auth_passkey_require_signed_callback=True,
            auth_passkey_callback_signature_max_age_seconds=300,
            normalize_absolute_http_url_fn=lambda value: value if value.startswith("http") else None,
            build_auth_redirect_url_fn=build_redirect,
        )
        self.assertIsNotNone(result)

        parsed = urlparse(result or "")
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "idp.example.com")
        self.assertEqual(parsed.path, "/signin")
        query = parse_qs(parsed.query)
        self.assertEqual(query.get("existing"), ["1"])
        self.assertEqual(query.get("suite_intent"), ["sign-in"])
        self.assertEqual(query.get("suite_state"), ["STATE1234567890123456"])
        self.assertEqual(query.get("suite_callback_sig_required"), ["1"])
        self.assertEqual(query.get("suite_callback_sig_max_age_seconds"), ["300"])
        self.assertIn("suite_return_to", query)
        self.assertIn("suite_callback_api", query)


if __name__ == "__main__":
    unittest.main()
