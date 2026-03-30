from __future__ import annotations

import unittest
from unittest.mock import patch

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
        self.assertEqual(payload.get("schemaVersion"), "suite.runtime.v1")
        self.assertEqual(payload.get("status"), "running")
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")
        self.assertEqual(payload.get("version"), "1.0.0")
        self.assertIsInstance(payload.get("timestamp"), float)
        self.assertIsInstance(payload.get("checkedAt"), str)
        limiter = payload.get("limiter") or {}
        self.assertEqual(limiter.get("storage"), "unknown")
        self.assertFalse(bool(limiter.get("degraded")))
        self.assertEqual(limiter.get("reason"), "uninitialized")
        agent_session_store = payload.get("agent_session_store") or {}
        self.assertEqual(agent_session_store.get("mode"), "memory")
        self.assertEqual(agent_session_store.get("reason"), "uninitialized")
        service = payload.get("service") or {}
        self.assertEqual(service.get("id"), "backend")
        self.assertEqual(service.get("label"), "Watchdog Backend")
        self.assertEqual(service.get("state"), "background")
        self.assertEqual(service.get("source"), "backend:/health")
        self.assertEqual(service.get("version"), "1.0.0")
        self.assertEqual(service.get("actionableIssueCount"), 0)
        self.assertIsInstance(service.get("checks"), list)
        self.assertGreaterEqual(len(service.get("checks")), 3)
        doctor = payload.get("doctor") or {}
        self.assertEqual(doctor.get("overallState"), "background")
        self.assertEqual(doctor.get("actionableIssueCount"), 0)
        self.assertIsInstance(doctor.get("groups"), list)
        severity_counts = doctor.get("severityCounts") or {}
        self.assertGreaterEqual(severity_counts.get("ready", 0), 1)
        self.assertGreaterEqual(severity_counts.get("background", 0), 1)

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
        service = payload.get("service") or {}
        self.assertEqual(service.get("state"), "needs-attention")
        self.assertEqual(service.get("actionableIssueCount"), 1)
        doctor = payload.get("doctor") or {}
        self.assertEqual(doctor.get("overallState"), "needs-attention")
        self.assertEqual(doctor.get("actionableIssueCount"), 1)
        recommendations = doctor.get("recommendations") or []
        self.assertGreaterEqual(len(recommendations), 1)

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
        service = payload.get("service") or {}
        checks = service.get("checks") or []
        session_check = next(
            (check for check in checks if check.get("key") == "agent-session-store"),
            None,
        )
        self.assertIsNotNone(session_check)
        self.assertEqual(session_check.get("severity"), "ready")
        self.assertFalse(bool(session_check.get("actionable")))

    def test_runtime_status_endpoint_uses_configured_loader(self) -> None:
        self.client.application.config["SUITE_RUNTIME_STATUS_LOADER"] = lambda: {
            "schemaVersion": "suite.runtime.v1",
            "checkedAt": "2026-03-24T07:00:00Z",
            "ok": True,
            "overall": {"state": "healthy", "text": "ALL SYSTEMS UP"},
            "doctor": {
                "overallState": "ready",
                "actionableIssueCount": 0,
                "severityCounts": {
                    "ready": 6,
                    "background": 0,
                    "needs-attention": 0,
                    "unavailable": 0,
                },
                "recommendations": [],
            },
            "runtime": {
                "statusDir": "C:/Suite/runtime-bootstrap",
                "statusPath": "C:/Suite/runtime-bootstrap/last-bootstrap.json",
                "currentBootstrapPath": None,
                "logPath": "C:/Suite/runtime-bootstrap/bootstrap.log",
                "lastBootstrap": {"summary": "All systems up."},
                "currentBootstrap": None,
            },
            "services": [
                {
                    "id": "supabase",
                    "name": "Supabase (Local)",
                    "state": "running",
                    "summary": "Local Supabase is running.",
                    "checks": [],
                }
            ],
        }

        response = self.client.get("/api/runtime/status")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertEqual(payload.get("schemaVersion"), "suite.runtime.v1")
        self.assertTrue(bool(payload.get("ok")))
        doctor = payload.get("doctor") or {}
        self.assertEqual(doctor.get("overallState"), "ready")
        self.assertEqual(doctor.get("actionableIssueCount"), 0)
        services = payload.get("services") or []
        self.assertEqual(len(services), 1)
        self.assertEqual((services[0] or {}).get("id"), "supabase")

    @patch("backend.route_groups.api_health._launch_runtime_control")
    def test_runtime_control_launcher_endpoint(self, mock_launch) -> None:
        mock_launch.return_value = (True, "Suite Runtime Control is starting.")

        response = self.client.post("/api/runtime/open-control")
        self.assertEqual(response.status_code, 202)

        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("ok")))
        self.assertEqual(
            payload.get("message"),
            "Suite Runtime Control is starting.",
        )
        self.assertIsInstance(payload.get("launchedAt"), str)

    @patch("backend.route_groups.api_health._launch_runtime_control")
    def test_runtime_control_launcher_endpoint_reports_failure(self, mock_launch) -> None:
        mock_launch.return_value = (False, "PowerShell is unavailable on this workstation.")

        response = self.client.post("/api/runtime/open-control")
        self.assertEqual(response.status_code, 500)

        payload = response.get_json() or {}
        self.assertFalse(bool(payload.get("ok")))
        self.assertEqual(
            payload.get("message"),
            "PowerShell is unavailable on this workstation.",
        )


if __name__ == "__main__":
    unittest.main()
