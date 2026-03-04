from __future__ import annotations

from types import SimpleNamespace
import unittest

from backend.route_groups.api_agent_session import (
    clear_agent_session_for_request,
    create_agent_session,
    get_agent_session,
)


class TestApiAgentSession(unittest.TestCase):
    def test_create_agent_session_stores_session(self) -> None:
        sessions = {}
        purge_calls = {"count": 0}

        def purge() -> None:
            purge_calls["count"] += 1

        session_id, expires_at = create_agent_session(
            "token-1",
            "user-1",
            purge_expired_agent_sessions_fn=purge,
            token_urlsafe_fn=lambda _n: "sid-1",
            now_fn=lambda: 1000.0,
            agent_session_ttl_seconds=3600,
            agent_sessions_store=sessions,
        )

        self.assertEqual(purge_calls["count"], 1)
        self.assertEqual(session_id, "sid-1")
        self.assertEqual(expires_at, 4600)
        self.assertEqual(
            sessions["sid-1"],
            {"token": "token-1", "user_id": "user-1", "expires_at": 4600},
        )

    def test_get_agent_session_returns_none_without_cookie(self) -> None:
        sessions = {}
        request_obj = SimpleNamespace(cookies={})
        result = get_agent_session(
            purge_expired_agent_sessions_fn=lambda: None,
            request_obj=request_obj,
            agent_session_cookie="suite_agent_session",
            now_fn=lambda: 1000.0,
            agent_sessions_store=sessions,
        )
        self.assertIsNone(result)

    def test_get_agent_session_returns_none_for_missing_store_entry(self) -> None:
        sessions = {}
        request_obj = SimpleNamespace(cookies={"suite_agent_session": "sid-missing"})
        result = get_agent_session(
            purge_expired_agent_sessions_fn=lambda: None,
            request_obj=request_obj,
            agent_session_cookie="suite_agent_session",
            now_fn=lambda: 1000.0,
            agent_sessions_store=sessions,
        )
        self.assertIsNone(result)

    def test_get_agent_session_removes_expired_session(self) -> None:
        sessions = {
            "sid-1": {"token": "token-1", "user_id": "user-1", "expires_at": 999}
        }
        request_obj = SimpleNamespace(cookies={"suite_agent_session": "sid-1"})
        result = get_agent_session(
            purge_expired_agent_sessions_fn=lambda: None,
            request_obj=request_obj,
            agent_session_cookie="suite_agent_session",
            now_fn=lambda: 1000.0,
            agent_sessions_store=sessions,
        )
        self.assertIsNone(result)
        self.assertNotIn("sid-1", sessions)

    def test_get_agent_session_returns_active_session(self) -> None:
        session = {"token": "token-1", "user_id": "user-1", "expires_at": 2000}
        sessions = {"sid-1": session}
        request_obj = SimpleNamespace(cookies={"suite_agent_session": "sid-1"})
        result = get_agent_session(
            purge_expired_agent_sessions_fn=lambda: None,
            request_obj=request_obj,
            agent_session_cookie="suite_agent_session",
            now_fn=lambda: 1000.0,
            agent_sessions_store=sessions,
        )
        self.assertEqual(result, session)

    def test_clear_agent_session_for_request_removes_existing(self) -> None:
        sessions = {"sid-1": {"token": "token-1", "user_id": "user-1", "expires_at": 2000}}
        request_obj = SimpleNamespace(cookies={"suite_agent_session": "sid-1"})
        clear_agent_session_for_request(
            request_obj=request_obj,
            agent_session_cookie="suite_agent_session",
            agent_sessions_store=sessions,
        )
        self.assertNotIn("sid-1", sessions)


if __name__ == "__main__":
    unittest.main()
