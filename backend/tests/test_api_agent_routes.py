from __future__ import annotations

import logging
import threading
import unittest
from functools import wraps
from types import SimpleNamespace
from typing import Any, Dict

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_agent import create_agent_blueprint


class TestApiAgentRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        self.limiter = Limiter(
            app=self.app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        self.gateway_pairing_result: tuple[str | None, str | None, int] = (
            "123456",
            None,
            200,
        )
        self.gateway_pairing_calls = 0
        self.challenge_calls: list[Dict[str, Any]] = []
        self.sent_links: list[Dict[str, Any]] = []
        self.challenge_store: Dict[str, Dict[str, Any]] = {}
        self.challenge_lock = threading.Lock()
        self.pairing_action_allow_result: tuple[bool, str, int] = (True, "ok", 0)
        self.send_email_error: Exception | None = None
        self.agent_health_proxy_calls = 0

        def require_supabase_user(f):
            @wraps(f)
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            return wrapped

        def require_agent_session(f):
            @wraps(f)
            def wrapped(*args, **kwargs):
                g.agent_session = {
                    "user_id": "user-1",
                    "token": "token-1",
                    "expires_at": 4102444800,
                }
                return f(*args, **kwargs)

            return wrapped

        def request_gateway_pairing_code():
            self.gateway_pairing_calls += 1
            return self.gateway_pairing_result

        def create_agent_pairing_challenge(*, action, user_id, email, pairing_code, client_ip):
            call = {
                "action": action,
                "user_id": user_id,
                "email": email,
                "pairing_code": pairing_code,
                "client_ip": client_ip,
            }
            self.challenge_calls.append(call)
            challenge_id = f"challenge-{len(self.challenge_calls)}"
            self.challenge_store[challenge_id] = call
            return challenge_id, 4102444800.0

        def send_supabase_email_link(
            _email: str,
            _flow: str,
            *,
            client_redirect_to: str = "",
            redirect_path: str = "/app/agent",
            redirect_query: Dict[str, str] | None = None,
            require_redirect: bool = False,
        ) -> None:
            if self.send_email_error is not None:
                raise self.send_email_error
            self.sent_links.append(
                {
                    "redirect_to": client_redirect_to,
                    "redirect_path": redirect_path,
                    "redirect_query": dict(redirect_query or {}),
                    "require_redirect": require_redirect,
                }
            )

        class _GatewayHealthResponse:
            status_code = 200

            def json(self):
                return {"ok": True}

        def gateway_get(_url: str, timeout: int):
            self.agent_health_proxy_calls += 1
            self.assertEqual(timeout, 3)
            return _GatewayHealthResponse()

        bp = create_agent_blueprint(
            limiter=self.limiter,
            logger=logging.getLogger("test_api_agent_routes"),
            require_supabase_user=require_supabase_user,
            require_agent_session=require_agent_session,
            deps={
                "_agent_broker_config_status": lambda: {
                    "ok": True,
                    "missing": [],
                    "warnings": [],
                },
                "_get_supabase_user_id": lambda user: str(user.get("id") or ""),
                "_get_supabase_user_email": lambda user: str(user.get("email") or ""),
                "_get_request_ip": lambda: "127.0.0.1",
                "_is_agent_pairing_action_allowed": lambda _user_id, _action: self.pairing_action_allow_result,
                "_request_gateway_pairing_code": request_gateway_pairing_code,
                "_create_agent_pairing_challenge": create_agent_pairing_challenge,
                "_send_supabase_email_link": send_supabase_email_link,
                "_build_auth_redirect_url": lambda path, _redirect_to="", query_params=None: (
                    f"https://app.example.com{path}"
                ),
                "AGENT_PAIRING_CHALLENGES": self.challenge_store,
                "AGENT_PAIRING_CHALLENGE_LOCK": self.challenge_lock,
                "requests_module": SimpleNamespace(get=gateway_get),
            },
        )
        self.app.register_blueprint(bp)
        self.client = self.app.test_client()

    def test_pairing_challenge_pair_fetches_gateway_code_server_side(self) -> None:
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={"action": "pair"},
        )
        self.assertEqual(response.status_code, 202)
        payload = response.get_json() or {}
        self.assertTrue(str(payload.get("requestId") or "").startswith("agent-"))
        self.assertTrue(str(response.headers.get("X-Request-ID") or "").startswith("agent-"))
        self.assertEqual(self.gateway_pairing_calls, 1)
        self.assertEqual(len(self.challenge_calls), 1)
        self.assertEqual(self.challenge_calls[0]["pairing_code"], "123456")
        self.assertEqual(len(self.sent_links), 1)
        redirect_query = self.sent_links[0]["redirect_query"]
        self.assertEqual(
            redirect_query,
            {"agent_action": "pair", "agent_challenge": "challenge-1"},
        )
        self.assertEqual(self.sent_links[0]["redirect_path"], "/login")
        self.assertNotIn("agent_pairing_code", redirect_query)
        self.assertTrue(self.sent_links[0]["require_redirect"])

    def test_pairing_challenge_pair_returns_gateway_error(self) -> None:
        self.gateway_pairing_result = (None, "Agent gateway unavailable", 503)
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={"action": "pair"},
            headers={"X-Request-ID": "req-test-1"},
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("error"), "Agent gateway unavailable")
        self.assertEqual(payload.get("requestId"), "req-test-1")
        self.assertEqual(response.headers.get("X-Request-ID"), "req-test-1")
        self.assertEqual(self.gateway_pairing_calls, 1)
        self.assertEqual(self.challenge_calls, [])
        self.assertEqual(self.sent_links, [])

    def test_pairing_challenge_unpair_does_not_request_gateway_code(self) -> None:
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={"action": "unpair"},
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.gateway_pairing_calls, 0)
        self.assertEqual(len(self.challenge_calls), 1)
        self.assertEqual(self.challenge_calls[0]["pairing_code"], "")

    def test_pairing_challenge_honors_redirect_path(self) -> None:
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={
                "action": "pair",
                "redirect_path": "/app/settings",
                "redirect_to": "http://localhost:5173/agent/pairing-callback",
            },
            headers={"X-Request-ID": "req-redirect-1"},
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(len(self.sent_links), 1)
        self.assertEqual(self.sent_links[0]["redirect_path"], "/app/settings")
        payload = response.get_json() or {}
        self.assertEqual(payload.get("requestId"), "req-redirect-1")

    def test_pairing_challenge_returns_deterministic_throttle_payload(self) -> None:
        self.pairing_action_allow_result = (False, "min-interval", 19)
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={"action": "pair"},
            headers={"X-Request-ID": "req-throttle-1"},
        )
        self.assertEqual(response.status_code, 429)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("reason"), "min-interval")
        self.assertEqual(payload.get("code"), "pairing-challenge-throttled")
        self.assertEqual(payload.get("throttle_source"), "local-abuse")
        self.assertEqual(payload.get("retry_after_seconds"), 19)
        self.assertEqual(payload.get("requestId"), "req-throttle-1")
        self.assertEqual(response.headers.get("Retry-After"), "19")

    def test_pairing_challenge_email_failure_propagates_retry_metadata(self) -> None:
        class _EmailError(RuntimeError):
            status_code = 429
            retry_after_seconds = 45

        self.send_email_error = _EmailError("Supabase email auth request failed (429): rate limit")
        response = self.client.post(
            "/api/agent/pairing-challenge",
            json={"action": "pair"},
            headers={"X-Request-ID": "req-smtp-1"},
        )
        self.assertEqual(response.status_code, 429)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("code"), "pairing-email-delivery-failed")
        self.assertEqual(payload.get("throttle_source"), "supabase")
        self.assertEqual(payload.get("retry_after_seconds"), 45)
        self.assertEqual(payload.get("requestId"), "req-smtp-1")
        self.assertEqual(response.headers.get("Retry-After"), "45")

    def test_agent_session_endpoint_rate_limit_applies(self) -> None:
        for _ in range(20):
            response = self.client.get("/api/agent/session")
            self.assertNotEqual(response.status_code, 429)

        throttled = self.client.get("/api/agent/session")
        self.assertEqual(throttled.status_code, 429)

    def test_agent_health_endpoint_rate_limit_applies(self) -> None:
        for _ in range(30):
            response = self.client.get("/api/agent/health")
            self.assertNotEqual(response.status_code, 429)

        throttled = self.client.get("/api/agent/health")
        self.assertEqual(throttled.status_code, 429)
        self.assertGreaterEqual(self.agent_health_proxy_calls, 1)

    def test_direct_pair_endpoint_returns_428(self) -> None:
        response = self.client.post(
            "/api/agent/pair",
            json={"pairing_code": "123456"},
        )
        self.assertEqual(response.status_code, 428)
        payload = response.get_json() or {}
        self.assertIn("Direct pair is disabled", str(payload.get("error") or ""))
        self.assertEqual(
            payload.get("next"),
            [
                "POST /api/agent/pairing-challenge",
                "POST /api/agent/pairing-confirm",
            ],
        )


if __name__ == "__main__":
    unittest.main()
