from __future__ import annotations

from types import SimpleNamespace
import unittest

from backend.route_groups.api_auth_decorators import (
    decorate_require_supabase_user,
)
from backend.route_groups.api_supabase_auth import SupabaseAuthProviderTimeoutError


class TestApiAuthDecorators(unittest.TestCase):
    @staticmethod
    def _jsonify(payload):
        return payload

    def test_require_supabase_user_missing_bearer_token(self) -> None:
        g_obj = SimpleNamespace()

        def endpoint():
            return {"ok": True}, 200

        wrapped = decorate_require_supabase_user(
            endpoint,
            get_bearer_token_fn=lambda: None,
            verify_supabase_user_token_fn=lambda _token: {"id": "user-1"},
            jsonify_fn=self._jsonify,
            g_obj=g_obj,
        )

        self.assertEqual(
            wrapped(),
            ({"error": "Authorization bearer token required"}, 401),
        )
        self.assertFalse(hasattr(g_obj, "supabase_user"))

    def test_require_supabase_user_rejects_invalid_token(self) -> None:
        g_obj = SimpleNamespace()

        def endpoint():
            return {"ok": True}, 200

        wrapped = decorate_require_supabase_user(
            endpoint,
            get_bearer_token_fn=lambda: "bad-token",
            verify_supabase_user_token_fn=lambda _token: None,
            jsonify_fn=self._jsonify,
            g_obj=g_obj,
        )

        self.assertEqual(
            wrapped(),
            ({"error": "Invalid or expired Supabase token"}, 401),
        )
        self.assertFalse(hasattr(g_obj, "supabase_user"))

    def test_require_supabase_user_sets_user_and_calls_endpoint(self) -> None:
        g_obj = SimpleNamespace()
        expected_user = {"id": "user-1", "email": "user@example.com"}

        def endpoint(value: str):
            return {"ok": value}, 200

        wrapped = decorate_require_supabase_user(
            endpoint,
            get_bearer_token_fn=lambda: "valid-token",
            verify_supabase_user_token_fn=lambda _token: expected_user,
            jsonify_fn=self._jsonify,
            g_obj=g_obj,
        )

        self.assertEqual(wrapped("ready"), ({"ok": "ready"}, 200))
        self.assertEqual(g_obj.supabase_user, expected_user)

    def test_require_supabase_user_returns_timeout_envelope(self) -> None:
        g_obj = SimpleNamespace()

        class _LoggerStub:
            def __init__(self) -> None:
                self.exceptions = []

            def exception(self, message, *args):
                self.exceptions.append((message, args))

        logger = _LoggerStub()

        def endpoint():
            return {"ok": True}, 200

        def verify(_token: str):
            raise SupabaseAuthProviderTimeoutError()

        wrapped = decorate_require_supabase_user(
            endpoint,
            get_bearer_token_fn=lambda: "valid-token",
            verify_supabase_user_token_fn=verify,
            jsonify_fn=self._jsonify,
            g_obj=g_obj,
            logger=logger,
            get_request_id_fn=lambda: "req-timeout-1",
            get_request_path_fn=lambda: "/api/auth/email-link",
        )

        payload, status = wrapped()
        self.assertEqual(status, 503)
        self.assertEqual(payload.get("success"), False)
        self.assertEqual(payload.get("code"), "AUTH_PROVIDER_TIMEOUT")
        self.assertEqual(payload.get("requestId"), "req-timeout-1")
        self.assertEqual((payload.get("meta") or {}).get("retryable"), True)
        self.assertGreaterEqual(len(logger.exceptions), 1)


if __name__ == "__main__":
    unittest.main()
