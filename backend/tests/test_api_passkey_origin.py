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

    def test_normalize_origin_http_scheme(self) -> None:
        self.assertEqual(
            normalize_origin("http://example.com/path"),
            "http://example.com",
        )

    def test_normalize_origin_with_port(self) -> None:
        self.assertEqual(
            normalize_origin("https://example.com:8080/path?q=1"),
            "https://example.com:8080",
        )

    def test_normalize_origin_empty_string(self) -> None:
        self.assertIsNone(normalize_origin(""))

    def test_normalize_origin_whitespace_only(self) -> None:
        self.assertIsNone(normalize_origin("   "))

    def test_normalize_origin_no_netloc(self) -> None:
        self.assertIsNone(normalize_origin("https://"))

    def test_normalize_absolute_http_url(self) -> None:
        self.assertEqual(
            normalize_absolute_http_url("https://example.com/path?q=1#frag"),
            "https://example.com/path?q=1#frag",
        )
        self.assertIsNone(normalize_absolute_http_url("mailto:user@example.com"))

    def test_normalize_absolute_http_url_http_scheme(self) -> None:
        self.assertEqual(
            normalize_absolute_http_url("http://example.com/path"),
            "http://example.com/path",
        )

    def test_normalize_absolute_http_url_with_port(self) -> None:
        self.assertEqual(
            normalize_absolute_http_url("https://example.com:8443/callback?code=abc"),
            "https://example.com:8443/callback?code=abc",
        )

    def test_normalize_absolute_http_url_empty_string(self) -> None:
        self.assertIsNone(normalize_absolute_http_url(""))

    def test_normalize_absolute_http_url_relative_path(self) -> None:
        self.assertIsNone(normalize_absolute_http_url("/relative/path"))

    def test_normalize_absolute_http_url_no_netloc(self) -> None:
        self.assertIsNone(normalize_absolute_http_url("https://"))

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

    def test_normalized_auth_passkey_allowed_origins_empty(self) -> None:
        self.assertEqual(normalized_auth_passkey_allowed_origins([]), [])

    def test_normalized_auth_passkey_allowed_origins_all_invalid(self) -> None:
        self.assertEqual(
            normalized_auth_passkey_allowed_origins(["ftp://bad.com", "not-a-url", ""]),
            [],
        )

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

    def test_is_valid_webauthn_rp_id_for_origin_empty_rp_id(self) -> None:
        self.assertFalse(is_valid_webauthn_rp_id_for_origin("", "https://example.com"))

    def test_is_valid_webauthn_rp_id_for_origin_invalid_origin(self) -> None:
        self.assertFalse(is_valid_webauthn_rp_id_for_origin("example.com", "not-a-url"))

    def test_is_valid_webauthn_rp_id_for_origin_case_insensitive(self) -> None:
        self.assertTrue(
            is_valid_webauthn_rp_id_for_origin("EXAMPLE.COM", "https://EXAMPLE.COM")
        )
        self.assertTrue(
            is_valid_webauthn_rp_id_for_origin("example.com", "https://Sub.Example.COM")
        )


if __name__ == "__main__":
    unittest.main()
