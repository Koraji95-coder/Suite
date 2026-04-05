from __future__ import annotations

import unittest
from unittest.mock import patch

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_watchdog import create_watchdog_blueprint


class TestApiWatchdogSecurity(unittest.TestCase):
    def setUp(self) -> None:
        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_autocad_auth(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                g.autocad_auth_mode = "api-key"
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def require_watchdog_collector_auth(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                g.autocad_auth_mode = "collector"
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_watchdog_blueprint(
                require_autocad_auth=require_autocad_auth,
                require_watchdog_collector_auth=require_watchdog_collector_auth,
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                supabase_url="https://example.supabase.co",
                supabase_api_key="service-key",
            )
        )
        self.client = app.test_client()

    def test_config_hides_validation_exception_text(self) -> None:
        with patch(
            "backend.route_groups.api_watchdog.WatchdogMonitorService.configure",
            side_effect=ValueError("C:\\secret\\token.txt"),
        ):
            response = self.client.put("/api/watchdog/config", json={"enabled": True})

        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("error"), "Invalid watchdog configuration.")
        self.assertEqual(payload.get("code"), "WATCHDOG_CONFIG_INVALID")
        self.assertNotIn("token.txt", str(payload))

    def test_project_rules_sync_hides_internal_exception_text(self) -> None:
        with patch(
            "backend.route_groups.api_watchdog.WatchdogMonitorService.sync_project_rules",
            side_effect=RuntimeError("secret boom"),
        ):
            response = self.client.post(
                "/api/watchdog/project-rules/sync",
                json={"rules": [{"projectId": "project-1", "roots": []}]},
            )

        self.assertEqual(response.status_code, 500)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("error"), "Failed to sync watchdog project rules")
        self.assertEqual(payload.get("code"), "WATCHDOG_PROJECT_RULES_FAILED")
        self.assertNotIn("secret boom", str(payload))

    def test_drawing_activity_sync_hides_upstream_error_text(self) -> None:
        prepared_payload = {
            "rows": [{"sync_key": "segment-1", "project_id": "project-1"}],
            "lastScannedEventId": 42,
            "skippedCount": 0,
        }
        with patch(
            "backend.route_groups.api_watchdog.WatchdogMonitorService.prepare_drawing_activity_sync",
            return_value=prepared_payload,
        ), patch(
            "backend.route_groups.api_watchdog.supabase_service_rest_request_helper",
            return_value=(None, "secret boom", 500),
        ):
            response = self.client.post("/api/watchdog/drawing-activity/sync", json={"limit": 1})

        self.assertEqual(response.status_code, 500)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("error"), "Failed to sync drawing activity segments.")
        self.assertEqual(payload.get("code"), "WATCHDOG_DRAWING_SYNC_FAILED")
        self.assertNotIn("secret boom", str(payload))

    def test_drawing_activity_sync_does_not_echo_raw_supabase_rows(self) -> None:
        prepared_payload = {
            "rows": [{"sync_key": "segment-1", "project_id": "project-1"}],
            "lastScannedEventId": 42,
            "skippedCount": 1,
        }
        with patch(
            "backend.route_groups.api_watchdog.WatchdogMonitorService.prepare_drawing_activity_sync",
            return_value=prepared_payload,
        ), patch(
            "backend.route_groups.api_watchdog.WatchdogMonitorService.mark_drawing_activity_synced",
            return_value={"lastEventId": 42},
        ), patch(
            "backend.route_groups.api_watchdog.supabase_service_rest_request_helper",
            return_value=([{"sync_key": "segment-1", "debug": "secret"}], None, 201),
        ):
            response = self.client.post("/api/watchdog/drawing-activity/sync", json={"limit": 1})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("synced"), 1)
        self.assertEqual(payload.get("syncedRows"), 1)
        self.assertNotIn("rows", payload)
        self.assertNotIn("secret", str(payload))


if __name__ == "__main__":
    unittest.main()
