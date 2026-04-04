from __future__ import annotations

from types import SimpleNamespace
import unittest

from backend.route_groups.api_auth_runtime import create_auth_runtime
from backend.route_groups.api_supabase_auth import SupabaseAuthProviderTimeoutError


class _RequestStub:
    def __init__(self) -> None:
        self.headers = {}
        self.cookies = {}
        self.path = "/"


class _LoggerStub:
    def info(self, *_args, **_kwargs) -> None:
        return None

    def warning(self, *_args, **_kwargs) -> None:
        return None

    def exception(self, *_args, **_kwargs) -> None:
        return None


def _jsonify(payload):
    return payload


def _build_runtime(
    *,
    request_obj: _RequestStub,
    g_obj: SimpleNamespace,
    verify_fn=None,
):
    return create_auth_runtime(
        request_obj=request_obj,
        jsonify_fn=_jsonify,
        g_obj=g_obj,
        is_valid_email_fn=lambda email: "@" in email,
        supabase_jwt_secret="",
        supabase_url="",
        supabase_api_key="",
        looks_like_uuid_fn=lambda _value: False,
        get_supabase_jwks_client_fn=lambda: None,
        jwt_module=object(),
        logger=_LoggerStub(),
        requests_module=object(),
        verify_supabase_user_token_fn=verify_fn,
    )


class TestApiAuthRuntime(unittest.TestCase):
    def test_identity_helpers(self) -> None:
        request_obj = _RequestStub()
        g_obj = SimpleNamespace()
        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=g_obj,
            verify_fn=lambda _token: None,
        )

        self.assertEqual(runtime.get_supabase_user_id({"sub": "user-1"}), "user-1")
        self.assertEqual(
            runtime.get_supabase_user_email({"email": "User@Example.com"}),
            "user@example.com",
        )
        self.assertIsNone(runtime.get_supabase_user_email({"email": "invalid"}))

    def test_get_bearer_token(self) -> None:
        request_obj = _RequestStub()
        request_obj.headers["Authorization"] = "Bearer token-123"
        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=SimpleNamespace(),
            verify_fn=lambda _token: None,
        )

        self.assertEqual(runtime.get_bearer_token(), "token-123")

    def test_require_supabase_user_success(self) -> None:
        request_obj = _RequestStub()
        request_obj.headers["Authorization"] = "Bearer good"
        g_obj = SimpleNamespace()
        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=g_obj,
            verify_fn=lambda token: {"id": "user-1"} if token == "good" else None,
        )

        def endpoint():
            return {"ok": True}, 200

        wrapped = runtime.require_supabase_user(endpoint)
        self.assertEqual(wrapped(), ({"ok": True}, 200))
        self.assertEqual(g_obj.supabase_user, {"id": "user-1"})

    def test_require_supabase_user_timeout_envelope(self) -> None:
        request_obj = _RequestStub()
        request_obj.path = "/api/auth/email-link"
        request_obj.headers["Authorization"] = "Bearer timeout"
        g_obj = SimpleNamespace(request_id="req-runtime-timeout")

        def verify(_token: str):
            raise SupabaseAuthProviderTimeoutError()

        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=g_obj,
            verify_fn=verify,
        )

        def endpoint():
            return {"ok": True}, 200

        wrapped = runtime.require_supabase_user(endpoint)
        payload, status = wrapped()
        self.assertEqual(status, 503)
        self.assertEqual(payload.get("code"), "AUTH_PROVIDER_TIMEOUT")
        self.assertEqual(payload.get("requestId"), "req-runtime-timeout")
        self.assertEqual((payload.get("meta") or {}).get("retryable"), True)


if __name__ == "__main__":
    unittest.main()
