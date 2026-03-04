from __future__ import annotations

import re
import threading
import unittest
from typing import Any, Dict, List, Optional

from backend.route_groups.api_agent_runtime import create_agent_runtime


class _NowStub:
    def __init__(self, value: float = 1000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


class _ResponseStub:
    def __init__(
        self,
        *,
        status_code: int,
        payload: Optional[Dict[str, Any]] = None,
        text: str = "",
        has_content: bool = True,
    ) -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self.content = b"ok" if has_content else b""

    def json(self) -> Dict[str, Any]:
        return self._payload


class _RequestsStub:
    def __init__(self, responses: List[_ResponseStub]) -> None:
        self.responses = list(responses)
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if not self.responses:
            raise RuntimeError("No stub response configured")
        return self.responses.pop(0)


class _LoggerStub:
    def warning(self, *_args, **_kwargs) -> None:
        return None


class _JsonResponse:
    def __init__(self, payload: Dict[str, Any]) -> None:
        self.payload = payload
        self.cookies = []

    def set_cookie(self, *args, **kwargs) -> None:
        self.cookies.append((args, kwargs))


def _jsonify(payload: Dict[str, Any]) -> _JsonResponse:
    return _JsonResponse(payload)


def _build_runtime(
    *,
    now_stub: _NowStub,
    requests_stub: _RequestsStub,
    session_store: Optional[Dict[str, Dict[str, Any]]] = None,
    challenge_store: Optional[Dict[str, Dict[str, Any]]] = None,
    action_window: Optional[Dict[str, List[float]]] = None,
    action_last_attempt: Optional[Dict[str, float]] = None,
    action_blocked_until: Optional[Dict[str, float]] = None,
    confirm_failure_window: Optional[Dict[str, List[float]]] = None,
    confirm_blocked_until: Optional[Dict[str, float]] = None,
):
    session_store = {} if session_store is None else session_store
    challenge_store = {} if challenge_store is None else challenge_store
    action_window = {} if action_window is None else action_window
    action_last_attempt = {} if action_last_attempt is None else action_last_attempt
    action_blocked_until = {} if action_blocked_until is None else action_blocked_until
    confirm_failure_window = (
        {} if confirm_failure_window is None else confirm_failure_window
    )
    confirm_blocked_until = {} if confirm_blocked_until is None else confirm_blocked_until

    return create_agent_runtime(
        now_fn=now_stub,
        token_urlsafe_fn=lambda _n: "challenge-1",
        agent_sessions_store=session_store,
        agent_pairing_challenges_store=challenge_store,
        agent_pairing_challenge_lock=threading.Lock(),
        agent_pairing_challenge_ttl_seconds=900,
        agent_pairing_challenge_max_entries=1000,
        agent_pairing_action_abuse_lock=threading.Lock(),
        agent_pairing_action_window=action_window,
        agent_pairing_action_last_attempt=action_last_attempt,
        agent_pairing_action_blocked_until=action_blocked_until,
        agent_pairing_action_window_seconds=60,
        agent_pairing_action_max_attempts=2,
        agent_pairing_action_min_interval_seconds=5,
        agent_pairing_action_block_seconds=30,
        agent_pairing_confirm_abuse_lock=threading.Lock(),
        agent_pairing_confirm_failure_window=confirm_failure_window,
        agent_pairing_confirm_blocked_until=confirm_blocked_until,
        agent_pairing_confirm_failure_window_seconds=60,
        agent_pairing_confirm_failure_max_attempts=2,
        agent_pairing_confirm_failure_block_seconds=30,
        agent_gateway_url="https://gateway.test",
        agent_webhook_secret="secret",
        pairing_code_pattern=re.compile(r"^\d{6}$"),
        jsonify_fn=_jsonify,
        agent_session_cookie="suite_agent_session",
        agent_session_samesite="Lax",
        agent_session_secure=False,
        agent_session_ttl_seconds=3600,
        requests_module=requests_stub,
        logger=_LoggerStub(),
    )


class TestApiAgentRuntime(unittest.TestCase):
    def test_purge_session_and_policy_helpers(self) -> None:
        now_stub = _NowStub(100.0)
        session_store = {
            "expired": {"expires_at": 99.0},
            "active": {"expires_at": 200.0},
        }
        runtime = _build_runtime(
            now_stub=now_stub,
            requests_stub=_RequestsStub([]),
            session_store=session_store,
        )

        runtime.purge_expired_agent_sessions()
        self.assertNotIn("expired", session_store)
        self.assertIn("active", session_store)

        self.assertTrue(runtime.is_admin_user({"app_metadata": {"role": "ADMIN"}}))
        self.assertTrue(runtime.is_admin_user({"app_metadata": {"roles": ["viewer", "admin"]}}))
        self.assertFalse(runtime.is_admin_user({"app_metadata": {"role": "member"}}))
        self.assertTrue(runtime.is_agent_task_allowed("chat", {"app_metadata": {"role": "member"}}))
        self.assertFalse(runtime.is_agent_task_allowed("build", {"app_metadata": {"role": "member"}}))

    def test_pairing_challenge_create_consume(self) -> None:
        now_stub = _NowStub(1000.0)
        challenge_store: Dict[str, Dict[str, Any]] = {}
        runtime = _build_runtime(
            now_stub=now_stub,
            requests_stub=_RequestsStub([]),
            challenge_store=challenge_store,
        )

        challenge_id, expires_at = runtime.create_agent_pairing_challenge(
            "pair",
            "user-1",
            " USER@example.com ",
            "123456",
            "127.0.0.1",
        )
        self.assertEqual(challenge_id, "challenge-1")
        self.assertEqual(expires_at, 1900)
        self.assertEqual(challenge_store["challenge-1"]["email"], "user@example.com")

        challenge, reason = runtime.consume_agent_pairing_challenge(
            "challenge-1",
            "user-1",
            "user@example.com",
        )
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(challenge)
        self.assertNotIn("challenge-1", challenge_store)

    def test_abuse_controls(self) -> None:
        now_stub = _NowStub(100.0)
        action_window: Dict[str, List[float]] = {}
        action_last_attempt: Dict[str, float] = {}
        action_blocked_until: Dict[str, float] = {}
        confirm_failure_window: Dict[str, List[float]] = {}
        confirm_blocked_until: Dict[str, float] = {}

        runtime = _build_runtime(
            now_stub=now_stub,
            requests_stub=_RequestsStub([]),
            action_window=action_window,
            action_last_attempt=action_last_attempt,
            action_blocked_until=action_blocked_until,
            confirm_failure_window=confirm_failure_window,
            confirm_blocked_until=confirm_blocked_until,
        )

        allowed, reason, retry_after = runtime.is_agent_pairing_action_allowed("user-1", "pair")
        self.assertEqual((allowed, reason, retry_after), (True, "ok", 0))

        allowed, reason, retry_after = runtime.is_agent_pairing_action_allowed("user-1", "pair")
        self.assertEqual((allowed, reason), (False, "min-interval"))
        self.assertGreater(retry_after, 0)

        now_stub.value = 106.0
        allowed, reason, retry_after = runtime.is_agent_pairing_action_allowed("user-1", "pair")
        self.assertEqual((allowed, reason, retry_after), (False, "window-limit", 30))

        blocked, retry_after = runtime.register_agent_pairing_confirm_failure("user-1", "127.0.0.1")
        self.assertEqual((blocked, retry_after), (False, 0))
        blocked, retry_after = runtime.register_agent_pairing_confirm_failure("user-1", "127.0.0.1")
        self.assertEqual((blocked, retry_after), (False, 0))
        blocked, retry_after = runtime.register_agent_pairing_confirm_failure("user-1", "127.0.0.1")
        self.assertEqual((blocked, retry_after), (True, 30))

        is_blocked, retry_after = runtime.is_agent_pairing_confirm_blocked("user-1", "127.0.0.1")
        self.assertTrue(is_blocked)
        self.assertGreater(retry_after, 0)

        runtime.clear_agent_pairing_confirm_failures("user-1", "127.0.0.1")
        is_blocked, retry_after = runtime.is_agent_pairing_confirm_blocked("user-1", "127.0.0.1")
        self.assertEqual((is_blocked, retry_after), (False, 0))

    def test_request_gateway_pairing_code(self) -> None:
        runtime = _build_runtime(
            now_stub=_NowStub(),
            requests_stub=_RequestsStub(
                [_ResponseStub(status_code=200, payload={"pairing_code": "123456"})]
            ),
        )
        pairing_code, error_message, status_code = runtime.request_gateway_pairing_code()
        self.assertEqual((pairing_code, error_message, status_code), ("123456", None, 200))

    def test_pair_and_revoke_gateway(self) -> None:
        requests_stub = _RequestsStub(
            [
                _ResponseStub(status_code=200, payload={"token": "gateway-token"}),
                _ResponseStub(
                    status_code=404,
                    payload={"paired": False, "pairing_code": "123456"},
                ),
            ]
        )
        runtime = _build_runtime(
            now_stub=_NowStub(),
            requests_stub=requests_stub,
        )

        response, status_code = runtime.pair_agent_session_for_user(
            "123456",
            "user-1",
            lambda token, user_id: (f"{user_id}:{token}", 2000),
            {"source": "dashboard"},
        )
        self.assertEqual(status_code, 200)
        self.assertEqual(response.payload["paired"], True)
        self.assertEqual(response.payload["source"], "dashboard")
        self.assertIn("expires_at", response.payload)
        self.assertEqual(len(response.cookies), 1)

        response, status_code = runtime.revoke_gateway_agent_token("gateway-token")
        self.assertEqual(status_code, 200)
        self.assertEqual(response.payload["gateway_status"], 404)
        self.assertEqual(response.payload["revoked"], False)
        self.assertEqual(response.payload["pairing_code"], "123456")


if __name__ == "__main__":
    unittest.main()
