from __future__ import annotations

import hashlib
import hmac
import re
import time
import unittest

from backend.route_groups.api_auth_redirect_signature import (
    build_passkey_callback_signature_payload,
    normalize_passkey_callback_timestamp,
    verify_passkey_callback_signature,
)


class TestApiAuthRedirectSignature(unittest.TestCase):
    def test_normalize_passkey_callback_timestamp(self) -> None:
        pattern = re.compile(r"^\d{10,13}$")
        self.assertEqual(
            normalize_passkey_callback_timestamp(
                "1700000000",
                timestamp_pattern=pattern,
            ),
            1700000000,
        )
        self.assertEqual(
            normalize_passkey_callback_timestamp(
                "1700000000123",
                timestamp_pattern=pattern,
            ),
            1700000000,
        )
        self.assertIsNone(
            normalize_passkey_callback_timestamp(
                "bad",
                timestamp_pattern=pattern,
            )
        )

    def test_build_passkey_callback_signature_payload(self) -> None:
        payload = build_passkey_callback_signature_payload(
            " state ",
            "SIGN-IN",
            "SUCCESS",
            "USER@EXAMPLE.COM ",
            "line1\r\nline2",
            1700000000,
        )
        self.assertEqual(
            payload,
            "state\nsign-in\nsuccess\nuser@example.com\nline1  line2\n1700000000",
        )

    def test_verify_passkey_callback_signature_disabled(self) -> None:
        ok, reason = verify_passkey_callback_signature(
            "state",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "",
            str(int(time.time())),
            require_signed_callback=False,
            callback_signing_secret="",
            signature_pattern=re.compile(r"^[A-Fa-f0-9]{64}$"),
            timestamp_pattern=re.compile(r"^\d{10,13}$"),
            max_clock_skew_seconds=90,
            max_age_seconds=300,
        )
        self.assertEqual((ok, reason), (True, "disabled"))

    def test_verify_passkey_callback_signature_success(self) -> None:
        secret = "test-secret"
        timestamp = int(time.time())
        timestamp_raw = str(timestamp)
        payload = build_passkey_callback_signature_payload(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            timestamp,
        )
        signature = hmac.new(
            secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        ok, reason = verify_passkey_callback_signature(
            "state-token",
            "sign-in",
            "success",
            "user@example.com",
            "",
            signature,
            timestamp_raw,
            require_signed_callback=True,
            callback_signing_secret=secret,
            signature_pattern=re.compile(r"^[A-Fa-f0-9]{64}$"),
            timestamp_pattern=re.compile(r"^\d{10,13}$"),
            max_clock_skew_seconds=90,
            max_age_seconds=300,
        )
        self.assertEqual((ok, reason), (True, "ok"))

    def test_verify_passkey_callback_signature_invalid_signature_format(self) -> None:
        ok, reason = verify_passkey_callback_signature(
            "state",
            "sign-in",
            "success",
            "user@example.com",
            "",
            "not-hex",
            str(int(time.time())),
            require_signed_callback=True,
            callback_signing_secret="secret",
            signature_pattern=re.compile(r"^[A-Fa-f0-9]{64}$"),
            timestamp_pattern=re.compile(r"^\d{10,13}$"),
            max_clock_skew_seconds=90,
            max_age_seconds=300,
        )
        self.assertEqual((ok, reason), (False, "invalid-signature-format"))


if __name__ == "__main__":
    unittest.main()
