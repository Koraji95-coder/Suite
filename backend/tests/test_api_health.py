from __future__ import annotations

import unittest

from flask import Flask

from backend.route_groups.api_health import create_health_blueprint


class TestApiHealth(unittest.TestCase):
    def setUp(self) -> None:
        app = Flask(__name__)
        app.config["TESTING"] = True
        app.register_blueprint(create_health_blueprint())
        self.client = app.test_client()

    def test_health_payload_contract(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertEqual(payload.get("status"), "running")
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")
        self.assertEqual(payload.get("version"), "1.0.0")
        self.assertIsInstance(payload.get("timestamp"), float)
        limiter = payload.get("limiter") or {}
        self.assertEqual(limiter.get("storage"), "unknown")
        self.assertFalse(bool(limiter.get("degraded")))
        self.assertEqual(limiter.get("reason"), "uninitialized")
        agent_session_store = payload.get("agent_session_store") or {}
        self.assertEqual(agent_session_store.get("mode"), "memory")
        self.assertEqual(agent_session_store.get("reason"), "uninitialized")

    def test_health_payload_includes_limiter_runtime_metadata(self) -> None:
        self.client.application.config["LIMITER_RUNTIME_STATUS"] = {
            "storage": "memory://",
            "degraded": True,
            "reason": "redis_unreachable_dev_degrade",
        }

        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        limiter = payload.get("limiter") or {}
        self.assertEqual(limiter.get("storage"), "memory://")
        self.assertTrue(bool(limiter.get("degraded")))
        self.assertEqual(limiter.get("reason"), "redis_unreachable_dev_degrade")

    def test_health_payload_includes_agent_session_store_metadata(self) -> None:
        self.client.application.config["AGENT_SESSION_STORE_STATUS"] = {
            "mode": "redis",
            "reason": "redis_connected",
            "redis_url": "redis://127.0.0.1:6379/0",
            "key_prefix": "suite:agent:session:",
        }

        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        agent_session_store = payload.get("agent_session_store") or {}
        self.assertEqual(agent_session_store.get("mode"), "redis")
        self.assertEqual(agent_session_store.get("reason"), "redis_connected")
        self.assertEqual(agent_session_store.get("redis_url"), "redis://127.0.0.1:6379/0")
        self.assertEqual(agent_session_store.get("key_prefix"), "suite:agent:session:")


if __name__ == "__main__":
    unittest.main()
