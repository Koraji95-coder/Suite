from __future__ import annotations

import unittest

from backend.route_groups.api_supabase_jwks import (
    get_supabase_jwks_client,
    looks_like_uuid,
)


class TestApiSupabaseJwks(unittest.TestCase):
    def test_looks_like_uuid(self) -> None:
        self.assertTrue(looks_like_uuid("123e4567-e89b-12d3-a456-426614174000"))
        self.assertFalse(looks_like_uuid(""))
        self.assertFalse(looks_like_uuid("not-a-uuid"))
        self.assertFalse(looks_like_uuid("123e4567e89b12d3a456426614174000"))

    def test_get_client_returns_none_without_url(self) -> None:
        calls = {"count": 0}

        class _Client:
            def __init__(self, _url: str):
                calls["count"] += 1

        client = get_supabase_jwks_client(
            supabase_jwks_url="",
            cached_client=None,
            py_jwk_client_cls=_Client,
        )
        self.assertIsNone(client)
        self.assertEqual(calls["count"], 0)

    def test_get_client_builds_when_cache_missing(self) -> None:
        calls = {"count": 0}

        class _Client:
            def __init__(self, url: str):
                calls["count"] += 1
                self.url = url

        client = get_supabase_jwks_client(
            supabase_jwks_url="https://example.supabase.co/auth/v1/keys",
            cached_client=None,
            py_jwk_client_cls=_Client,
        )
        self.assertIsInstance(client, _Client)
        self.assertEqual(client.url, "https://example.supabase.co/auth/v1/keys")
        self.assertEqual(calls["count"], 1)

    def test_get_client_reuses_cached_client(self) -> None:
        calls = {"count": 0}

        class _Client:
            def __init__(self, _url: str):
                calls["count"] += 1

        cached = object()
        client = get_supabase_jwks_client(
            supabase_jwks_url="https://example.supabase.co/auth/v1/keys",
            cached_client=cached,
            py_jwk_client_cls=_Client,
        )
        self.assertIs(client, cached)
        self.assertEqual(calls["count"], 0)


if __name__ == "__main__":
    unittest.main()
