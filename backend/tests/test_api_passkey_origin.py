from __future__ import annotations

import unittest

from backend.route_groups.api_passkey_origin import (
    is_valid_webauthn_rp_id_for_origin,
    normalize_absolute_http_url,
    normalize_origin,
    normalized_auth_passkey_allowed_origins,
)


class TestApiPasskeyOrigin(unittest.TestCase):
    def test_normalize_origin(self) -> None:
        self.assertEqual(
            normalize_origin("https://example.com/path?q=1"),
            "https://example.com",
        )
        self.assertIsNone(normalize_origin("ftp://example.com"))
        self.assertIsNone(normalize_origin("not-a-url"))

    def test_normalize_absolute_http_url(self) -> None:
        self.assertEqual(
            normalize_absolute_http_url("https://example.com/path?q=1#frag"),
            "https://example.com/path?q=1#frag",
        )
        self.assertIsNone(normalize_absolute_http_url("mailto:user@example.com"))

    def test_normalized_auth_passkey_allowed_origins_dedupes(self) -> None:
        origins = normalized_auth_passkey_allowed_origins(
            [
                "https://example.com/path",
                " https://example.com ",
                "https://sub.example.com",
                "ftp://bad.example.com",
            ]
        )
        self.assertEqual(origins, ["https://example.com", "https://sub.example.com"])

    def test_is_valid_webauthn_rp_id_for_origin(self) -> None:
        self.assertTrue(
            is_valid_webauthn_rp_id_for_origin(
                "example.com",
                "https://example.com",
            )
        )
        self.assertTrue(
            is_valid_webauthn_rp_id_for_origin(
                "example.com",
                "https://sub.example.com",
            )
        )
        self.assertFalse(
            is_valid_webauthn_rp_id_for_origin(
                "example.com",
                "https://badexample.com",
            )
        )


if __name__ == "__main__":
    unittest.main()
