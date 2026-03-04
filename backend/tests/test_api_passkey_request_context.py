from __future__ import annotations

import json
import unittest

from backend.route_groups.api_passkey_request_context import (
    options_to_json_dict,
    resolve_passkey_webauthn_expected_origin,
)


class TestApiPasskeyRequestContext(unittest.TestCase):
    def test_resolve_expected_origin_uses_header_origin(self) -> None:
        origin, reason = resolve_passkey_webauthn_expected_origin(
            request_headers={"Origin": "https://app.example.com"},
            auth_email_redirect_url="https://fallback.example.com",
            allowed_origins=["https://app.example.com", "https://fallback.example.com"],
        )
        self.assertEqual(origin, "https://app.example.com")
        self.assertEqual(reason, "ok")

    def test_resolve_expected_origin_fallback(self) -> None:
        origin, reason = resolve_passkey_webauthn_expected_origin(
            request_headers={"Origin": "https://evil.example.com"},
            auth_email_redirect_url="https://also-evil.example.com",
            allowed_origins=["https://trusted.example.com"],
        )
        self.assertEqual(origin, "https://trusted.example.com")
        self.assertEqual(reason, "fallback")

    def test_options_to_json_dict_parses_serializer_output(self) -> None:
        payload = {"challenge": "abc", "timeout": 60000}
        parsed = options_to_json_dict(
            object(),
            options_to_json_fn=lambda _options: json.dumps(payload),
            json_module=json,
        )
        self.assertEqual(parsed, payload)

    def test_options_to_json_dict_requires_serializer(self) -> None:
        with self.assertRaises(RuntimeError):
            options_to_json_dict(
                object(),
                options_to_json_fn=None,
                json_module=json,
            )


if __name__ == "__main__":
    unittest.main()
