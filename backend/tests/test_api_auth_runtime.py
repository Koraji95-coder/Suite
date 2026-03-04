from __future__ import annotations

from types import SimpleNamespace
import unittest

from backend.route_groups.api_auth_runtime import create_auth_runtime


class _RequestStub:
    def __init__(self) -> None:
        self.headers = {}
        self.cookies = {}


class _LoggerStub:
    def info(self, *_args, **_kwargs) -> None:
        return None

    def warning(self, *_args, **_kwargs) -> None:
        return None


class _NowStub:
    def __init__(self, value: float = 1000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


def _jsonify(payload):
    return payload


def _build_runtime(
    *,
    request_obj: _RequestStub,
    g_obj: SimpleNamespace,
    session_store: dict,
    now_fn,
    verify_fn=None,
):
    return create_auth_runtime(
        request_obj=request_obj,
        jsonify_fn=_jsonify,
        g_obj=g_obj,
        is_valid_email_fn=lambda email: "@" in email,
        purge_expired_agent_sessions_fn=lambda: None,
        token_urlsafe_fn=lambda _n: "session-1",
        now_fn=now_fn,
        agent_session_ttl_seconds=3600,
        agent_sessions_store=session_store,
        agent_session_cookie="suite_agent_session",
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
            session_store={},
            now_fn=_NowStub(),
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
            session_store={},
            now_fn=_NowStub(),
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
            session_store={},
            now_fn=_NowStub(),
            verify_fn=lambda token: {"id": "user-1"} if token == "good" else None,
        )

        def endpoint():
            return {"ok": True}, 200

        wrapped = runtime.require_supabase_user(endpoint)
        self.assertEqual(wrapped(), ({"ok": True}, 200))
        self.assertEqual(g_obj.supabase_user, {"id": "user-1"})

    def test_agent_session_lifecycle_and_decorator(self) -> None:
        request_obj = _RequestStub()
        g_obj = SimpleNamespace(supabase_user={"id": "user-1"})
        session_store = {}
        now_stub = _NowStub()
        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=g_obj,
            session_store=session_store,
            now_fn=now_stub,
            verify_fn=lambda _token: None,
        )

        session_id, expires_at = runtime.create_agent_session("token-1", "user-1")
        self.assertEqual(session_id, "session-1")
        self.assertEqual(expires_at, 4600)
        request_obj.cookies["suite_agent_session"] = session_id

        def endpoint():
            return {"ok": True}, 200

        wrapped = runtime.require_agent_session(endpoint)
        self.assertEqual(wrapped(), ({"ok": True}, 200))
        self.assertEqual(g_obj.agent_session["token"], "token-1")

        runtime.clear_agent_session_for_request()
        self.assertIsNone(runtime.get_agent_session())

    def test_require_agent_session_rejects_mismatch(self) -> None:
        request_obj = _RequestStub()
        g_obj = SimpleNamespace(supabase_user={"id": "user-1"})
        session_store = {
            "session-1": {"token": "token-1", "user_id": "user-2", "expires_at": 9999}
        }
        request_obj.cookies["suite_agent_session"] = "session-1"
        runtime = _build_runtime(
            request_obj=request_obj,
            g_obj=g_obj,
            session_store=session_store,
            now_fn=_NowStub(),
            verify_fn=lambda _token: None,
        )

        def endpoint():
            return {"ok": True}, 200

        wrapped = runtime.require_agent_session(endpoint)
        self.assertEqual(wrapped(), ({"error": "Agent session required"}, 401))


if __name__ == "__main__":
    unittest.main()
