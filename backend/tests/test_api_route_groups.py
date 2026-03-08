from __future__ import annotations

import logging
import os
import tempfile
import unittest
from pathlib import Path

from flask import Flask, g, jsonify, request
from flask_limiter import Limiter

from backend.route_groups import register_route_groups


class TestApiRouteGroups(unittest.TestCase):
    def setUp(self) -> None:
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True

        self.temp_dir = tempfile.TemporaryDirectory()
        self.backup_dir = Path(self.temp_dir.name)
        self.template_path = self.backup_dir / "template.docx"
        self.template_path.write_bytes(b"test-template")

        self.limiter = Limiter(
            app=self.app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_api_key(f):
            def wrapped(*args, **kwargs):
                if request.headers.get("X-API-Key") != "valid-key":
                    return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def require_autocad_auth(f):
            def wrapped(*args, **kwargs):
                if request.headers.get("X-API-Key") != "valid-key":
                    return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def is_valid_api_key(provided_key: str | None) -> bool:
            return provided_key == "valid-key"

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def require_agent_session(f):
            def wrapped(*args, **kwargs):
                g.agent_session = {"user_id": "user-1", "token": "token-1", "expires_at": 4102444800}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def schedule_cleanup(_path: str) -> None:
            return None

        def load_transmittal_profiles_payload() -> dict:
            return {
                "profiles": [{"id": "sample-engineer", "name": "Sample Engineer"}],
                "firm_numbers": ["TX - Firm #00000"],
                "defaults": {"profile_id": "sample-engineer", "firm": "TX - Firm #00000"},
            }

        def apply_auth_email_response_floor(_started_at: float) -> None:
            return None

        def auth_email_generic_response() -> dict:
            return {"ok": True, "message": "If the email is valid, a sign-in link will arrive shortly."}

        def is_valid_email(email: str) -> bool:
            return "@" in email and "." in email

        def get_request_ip() -> str:
            return "127.0.0.1"

        def is_auth_email_request_allowed(_email: str, _client_ip: str) -> tuple[bool, str]:
            return True, "ok"

        def email_fingerprint(_email: str) -> str:
            return "hash"

        def verify_turnstile_token(_token: str, _client_ip: str) -> bool:
            return True

        def send_supabase_email_link(*_args, **_kwargs) -> None:
            return None

        class _ManagerStub:
            def get_status(self):
                return {
                    "connected": True,
                    "autocad_running": True,
                    "drawing_open": True,
                    "drawing_name": "demo.dwg",
                    "error": None,
                }

            def get_layers(self):
                return True, ["A-DEMO-LAYER"], None

            def execute_layer_search(self, _config):
                return {
                    "success": True,
                    "count": 1,
                    "points": [{"name": "P1", "x": 0, "y": 0, "z": 0, "layer": "A-DEMO-LAYER"}],
                    "layers": ["A-DEMO-LAYER"],
                    "excel_path": "",
                    "blocks_inserted": 0,
                    "block_errors": None,
                }

        manager_stub = _ManagerStub()

        def get_manager():
            return manager_stub

        def connect_autocad():
            raise RuntimeError("Not needed for route registration tests")

        def dyn(value):
            return value

        class _PythonComStub:
            @staticmethod
            def CoInitialize():
                return None

            @staticmethod
            def CoUninitialize():
                return None

        class _TracebackStub:
            @staticmethod
            def print_exc():
                return None

        def validate_layer_config(config):
            return config

        def issue_ws_ticket(**_kwargs):
            return {
                "ticket": "test-ticket",
                "expires_at": 4102444800.0,
                "ttl_seconds": 45,
            }

        def auth_passkey_capability() -> dict:
            return {
                "enabled": False,
                "provider": "supabase",
                "provider_label": "Supabase",
                "handlers_ready": False,
                "next_step": "Set AUTH_PASSKEY_ENABLED=true and restart backend.",
            }

        class _AgentRunOrchestratorStub:
            def __init__(self) -> None:
                self.run_snapshot = {
                    "runId": "run-1",
                    "userId": "user-1",
                    "status": "queued",
                    "requestId": "req-run-1",
                    "steps": [],
                    "messages": [],
                    "stages": {},
                }
                self.task_snapshot = {
                    "taskId": "task-1",
                    "runId": "run-1",
                    "userId": "user-1",
                    "assigneeProfile": "devstral",
                    "stage": "stage_b",
                    "title": "Devstral task",
                    "description": "Review run output.",
                    "priority": "high",
                    "status": "awaiting_review",
                    "reviewAction": "",
                    "reviewerId": "",
                    "reviewerNote": "",
                    "requestId": "req-task-1",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z",
                    "startedAt": "2026-01-01T00:00:00Z",
                    "finishedAt": "",
                }

            def enqueue_run(self, **_kwargs):
                return "run-1"

            def get_run_owner(self, run_id: str):
                if run_id != "run-1":
                    return None
                return "user-1"

            def get_run_snapshot(self, run_id: str):
                if run_id != "run-1":
                    return None
                return dict(self.run_snapshot)

            def cancel_run(self, **_kwargs):
                self.run_snapshot["status"] = "cancel_requested"
                return {"status": "cancel_requested", "requestId": "req-cancel-1"}

            def list_events(self, _run_id: str, *, after_id: int = 0, limit: int = 200):
                return [] if after_id > 0 else [
                    {
                        "id": 1,
                        "eventType": "run_enqueued",
                        "stage": "",
                        "profileId": "",
                        "requestId": "req-run-1",
                        "message": "Agent orchestration run enqueued.",
                        "payload": {"status": "queued"},
                        "createdAt": "2026-01-01T00:00:00Z",
                    }
                ]

            def get_run_status(self, _run_id: str):
                return "completed"

            def list_tasks(self, **_kwargs):
                return [dict(self.task_snapshot)]

            def get_task_owner(self, task_id: str):
                if task_id != "task-1":
                    return None
                return "user-1"

            def get_task(self, task_id: str):
                if task_id != "task-1":
                    return None
                return dict(self.task_snapshot)

            def review_task(self, *, task_id: str, reviewer_id: str, action: str, note: str, request_id: str):
                if task_id != "task-1":
                    return None
                status_map = {
                    "approve": "approved",
                    "rework": "rework_requested",
                    "defer": "deferred",
                }
                status = status_map.get(action, "awaiting_review")
                self.task_snapshot["status"] = status
                self.task_snapshot["reviewAction"] = action
                self.task_snapshot["reviewerId"] = reviewer_id
                self.task_snapshot["reviewerNote"] = note
                self.task_snapshot["requestId"] = request_id
                return dict(self.task_snapshot)

            def list_activity(self, **_kwargs):
                return [
                    {
                        "activityId": "run-1",
                        "source": "run",
                        "eventType": "run_enqueued",
                        "runId": "run-1",
                        "taskId": "",
                        "profileId": "",
                        "status": "queued",
                        "priority": "",
                        "stage": "",
                        "requestId": "req-run-1",
                        "message": "Agent orchestration run enqueued.",
                        "payload": {"status": "queued"},
                        "createdAt": "2026-01-01T00:00:00Z",
                    }
                ]

        agent_run_orchestrator = _AgentRunOrchestratorStub()

        register_route_groups(
            self.app,
            require_api_key=require_api_key,
            require_autocad_auth=require_autocad_auth,
            is_valid_api_key=is_valid_api_key,
            limiter=self.limiter,
            logger=logging.getLogger("test"),
            issue_ws_ticket=issue_ws_ticket,
            api_key="very-secure-test-key-value",
            schedule_cleanup=schedule_cleanup,
            supabase_url="https://example.supabase.co",
            supabase_api_key="service-key",
            auth_email_honeypot_field="company",
            auth_email_turnstile_secret="",
            auth_email_require_turnstile=False,
            apply_auth_email_response_floor=apply_auth_email_response_floor,
            auth_email_generic_response=auth_email_generic_response,
            is_valid_email=is_valid_email,
            get_request_ip=get_request_ip,
            is_auth_email_request_allowed=is_auth_email_request_allowed,
            email_fingerprint=email_fingerprint,
            verify_turnstile_token=verify_turnstile_token,
            send_supabase_email_link=send_supabase_email_link,
            load_transmittal_profiles_payload=load_transmittal_profiles_payload,
            transmittal_template_path=self.template_path,
            backup_storage_dir=self.backup_dir,
            backup_max_bytes=1024 * 1024,
            backup_max_files=100,
            autodraft_dotnet_api_url="",
            conduit_route_autocad_provider="com",
            batch_session_cookie="bfr_session",
            batch_session_ttl_seconds=3600,
            require_supabase_user=require_supabase_user,
            require_agent_session=require_agent_session,
            get_supabase_user_id=lambda user: str(user.get("id") or ""),
            get_supabase_user_email=lambda user: str(user.get("email") or ""),
            is_admin_user=lambda _user: False,
            passkey_deps={
                "_auth_passkey_capability": auth_passkey_capability,
                "_get_request_ip": get_request_ip,
            },
            agent_deps={
                "_agent_broker_config_status": lambda: {"ok": True, "missing": [], "warnings": []},
                "_get_supabase_user_id": lambda user: str(user.get("id") or ""),
                "_get_supabase_user_email": lambda user: str(user.get("email") or ""),
            },
            agent_run_orchestrator=agent_run_orchestrator,
            transmittal_render_deps={
                "TRANSMITTAL_RENDER_AVAILABLE": False,
            },
            get_manager=get_manager,
            connect_autocad=connect_autocad,
            dyn=dyn,
            pythoncom=_PythonComStub(),
            send_autocad_dotnet_command=None,
            validate_layer_config=validate_layer_config,
            traceback_module=_TracebackStub(),
        )

        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_expected_routes_registered(self) -> None:
        routes = {
            rule.rule: sorted(rule.methods - {"HEAD", "OPTIONS"})
            for rule in self.app.url_map.iter_rules()
        }

        expected = {
            "/api/backup/save": ["POST"],
            "/api/backup/list": ["GET"],
            "/api/backup/read": ["GET"],
            "/api/backup/delete": ["DELETE"],
            "/api/batch-find-replace/session": ["POST"],
            "/api/batch-find-replace/preview": ["POST"],
            "/api/batch-find-replace/apply": ["POST"],
            "/api/auth/email-link": ["POST"],
            "/api/auth/passkey-capability": ["GET"],
            "/api/auth/passkey/sign-in": ["POST"],
            "/api/auth/passkey/enroll": ["POST"],
            "/api/auth/passkey/auth/verify": ["POST"],
            "/api/auth/passkey/register/verify": ["POST"],
            "/api/auth/passkey/callback/complete": ["POST"],
            "/api/agent/pairing-challenge": ["POST"],
            "/api/agent/pairing-code/request": ["POST"],
            "/api/agent/pairing-confirm": ["POST"],
            "/api/agent/health": ["GET"],
            "/api/agent/config": ["GET"],
            "/api/agent/profiles": ["GET"],
            "/api/agent/session": ["GET"],
            "/api/agent/pair": ["POST"],
            "/api/agent/unpair": ["POST"],
            "/api/agent/session/clear": ["POST"],
            "/api/agent/webhook": ["POST"],
            "/api/agent/runs": ["POST"],
            "/api/agent/runs/<run_id>": ["GET"],
            "/api/agent/runs/<run_id>/events": ["GET"],
            "/api/agent/runs/<run_id>/cancel": ["POST"],
            "/api/agent/tasks": ["GET"],
            "/api/agent/tasks/<task_id>": ["GET"],
            "/api/agent/tasks/<task_id>/review": ["POST"],
            "/api/agent/activity": ["GET"],
            "/api/dashboard/load": ["POST"],
            "/api/dashboard/load/<job_id>": ["GET"],
            "/api/transmittal/profiles": ["GET"],
            "/api/transmittal/template": ["GET"],
            "/api/transmittal/render": ["POST"],
            "/api/status": ["GET"],
            "/api/layers": ["GET"],
            "/api/selection-count": ["GET"],
            "/api/execute": ["POST"],
            "/api/trigger-selection": ["POST"],
            "/api/conduit-route/terminal-scan": ["POST"],
            "/api/conduit-route/terminal-routes/draw": ["POST"],
            "/api/conduit-route/bridge/terminal-labels/sync": ["POST"],
            "/api/conduit-route/terminal-labels/sync": ["POST"],
            "/api/conduit-route/obstacles/scan": ["POST"],
            "/api/conduit-route/route/compute": ["POST"],
            "/api/etap/cleanup/run": ["POST"],
            "/api/autocad/ws-ticket": ["POST"],
            "/api/watchdog/config": ["PUT"],
            "/api/watchdog/heartbeat": ["POST"],
            "/api/watchdog/pick-root": ["POST"],
            "/api/watchdog/status": ["GET"],
            "/health": ["GET"],
        }

        for route, methods in expected.items():
            self.assertIn(route, routes)
            self.assertEqual(routes[route], methods)

    def test_health_endpoint(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertEqual(payload.get("status"), "running")
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")

    def test_backup_save_requires_api_key(self) -> None:
        response = self.client.post(
            "/api/backup/save",
            json={"filename": "suite_test.yaml", "content": "hello: world\n"},
        )
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/backup/save",
            headers={"X-API-Key": "valid-key"},
            json={"filename": "suite_test.yaml", "content": "hello: world\n"},
        )
        self.assertEqual(response.status_code, 200)

    def test_batch_preview_requires_auth(self) -> None:
        response = self.client.post("/api/batch-find-replace/preview")
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/batch-find-replace/preview",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 400)

    def test_transmittal_profiles_requires_api_key(self) -> None:
        response = self.client.get("/api/transmittal/profiles")
        self.assertEqual(response.status_code, 401)

        response = self.client.get(
            "/api/transmittal/profiles",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("success"))

    def test_transmittal_render_requires_api_key(self) -> None:
        response = self.client.post("/api/transmittal/render")
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertFalse(payload.get("success", True))

    def test_auth_email_link_endpoint(self) -> None:
        response = self.client.post(
            "/api/auth/email-link",
            json={"email": "user@example.com", "flow": "signin"},
        )
        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))

    def test_passkey_capability_endpoint(self) -> None:
        response = self.client.get("/api/auth/passkey-capability")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))
        self.assertIn("passkey", payload)

    def test_agent_config_endpoint(self) -> None:
        response = self.client.get("/api/agent/config")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))

    def test_agent_profiles_endpoint(self) -> None:
        response = self.client.get("/api/agent/profiles")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))
        self.assertIsInstance(payload.get("profiles"), list)

    def test_agent_runs_create_endpoint(self) -> None:
        response = self.client.post(
            "/api/agent/runs",
            json={"objective": "Test orchestration"},
        )
        self.assertEqual(response.status_code, 202)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("runId"), "run-1")

    def test_agent_runs_get_and_cancel_endpoints(self) -> None:
        get_response = self.client.get("/api/agent/runs/run-1")
        self.assertEqual(get_response.status_code, 200)
        get_payload = get_response.get_json() or {}
        self.assertTrue(get_payload.get("success"))
        self.assertEqual((get_payload.get("run") or {}).get("runId"), "run-1")

        cancel_response = self.client.post("/api/agent/runs/run-1/cancel")
        self.assertEqual(cancel_response.status_code, 200)
        cancel_payload = cancel_response.get_json() or {}
        self.assertTrue(cancel_payload.get("success"))
        self.assertEqual(cancel_payload.get("status"), "cancel_requested")

    def test_agent_task_and_activity_endpoints(self) -> None:
        tasks_response = self.client.get("/api/agent/tasks")
        self.assertEqual(tasks_response.status_code, 200)
        tasks_payload = tasks_response.get_json() or {}
        self.assertTrue(tasks_payload.get("success"))
        self.assertEqual(len(tasks_payload.get("tasks") or []), 1)

        task_response = self.client.get("/api/agent/tasks/task-1")
        self.assertEqual(task_response.status_code, 200)
        task_payload = task_response.get_json() or {}
        self.assertTrue(task_payload.get("success"))
        self.assertEqual((task_payload.get("task") or {}).get("taskId"), "task-1")

        review_response = self.client.post(
            "/api/agent/tasks/task-1/review",
            json={"action": "approve", "note": "Looks good."},
        )
        self.assertEqual(review_response.status_code, 200)
        review_payload = review_response.get_json() or {}
        self.assertTrue(review_payload.get("success"))
        self.assertEqual((review_payload.get("task") or {}).get("status"), "approved")

        activity_response = self.client.get("/api/agent/activity")
        self.assertEqual(activity_response.status_code, 200)
        activity_payload = activity_response.get_json() or {}
        self.assertTrue(activity_payload.get("success"))
        self.assertEqual(len(activity_payload.get("activity") or []), 1)

    def test_api_status_endpoint(self) -> None:
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/api/status", headers={"X-API-Key": "valid-key"})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")

    def test_autodraft_rules_payload_shape(self) -> None:
        unauthorized = self.client.get("/api/autodraft/rules")
        self.assertEqual(unauthorized.status_code, 401)

        response = self.client.get(
            "/api/autodraft/rules",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))

        rules = payload.get("rules") or []
        self.assertIsInstance(rules, list)
        self.assertGreater(len(rules), 0)

        first_rule = rules[0]
        self.assertIsInstance(first_rule, dict)
        self.assertTrue(first_rule.get("id"))
        self.assertTrue(first_rule.get("category"))
        self.assertTrue(first_rule.get("action"))
        self.assertIsInstance(first_rule.get("trigger"), dict)
        self.assertIsInstance(first_rule.get("icon"), str)
        self.assertIsInstance(first_rule.get("examples"), list)
        self.assertEqual(first_rule.get("id"), "delete-green-cloud")
        self.assertEqual(first_rule.get("category"), "DELETE")
        self.assertEqual((first_rule.get("trigger") or {}).get("color"), "green")

        second_rule = rules[1]
        self.assertIsInstance(second_rule, dict)
        self.assertEqual(second_rule.get("id"), "add-red-cloud")
        self.assertEqual(second_rule.get("category"), "ADD")
        self.assertEqual((second_rule.get("trigger") or {}).get("color"), "red")

    def test_autodraft_plan_payload_shape(self) -> None:
        response = self.client.post(
            "/api/autodraft/plan",
            headers={"X-API-Key": "valid-key"},
            json={
                "markups": [
                    {"type": "cloud", "color": "green", "text": "Remove this"},
                    {"type": "cloud", "color": "red", "text": "Install this"},
                    {"type": "cloud", "color": "green", "text": "add support"},
                    {"type": "cloud", "color": "red", "text": "delete feeder"},
                    {"type": "text", "color": "blue", "text": "note this"},
                ]
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertTrue(payload.get("ok"))

        actions = payload.get("actions") or []
        self.assertIsInstance(actions, list)
        self.assertEqual(len(actions), 5)

        green_delete_action = actions[0] or {}
        self.assertEqual(green_delete_action.get("rule_id"), "delete-green-cloud")
        self.assertEqual(green_delete_action.get("category"), "DELETE")
        self.assertEqual(green_delete_action.get("status"), "proposed")

        red_add_action = actions[1] or {}
        self.assertEqual(red_add_action.get("rule_id"), "add-red-cloud")
        self.assertEqual(red_add_action.get("category"), "ADD")
        self.assertEqual(red_add_action.get("status"), "proposed")

        green_add_conflict = actions[2] or {}
        self.assertIsNone(green_add_conflict.get("rule_id"))
        self.assertEqual(green_add_conflict.get("category"), "UNCLASSIFIED")
        self.assertEqual(green_add_conflict.get("status"), "review")

        red_delete_conflict = actions[3] or {}
        self.assertIsNone(red_delete_conflict.get("rule_id"))
        self.assertEqual(red_delete_conflict.get("category"), "UNCLASSIFIED")
        self.assertEqual(red_delete_conflict.get("status"), "review")

        summary = payload.get("summary") or {}
        self.assertIsInstance(summary, dict)
        self.assertEqual(summary.get("total_markups"), 5)
        self.assertEqual(summary.get("actions_proposed"), 5)
        self.assertIsInstance(summary.get("classified"), int)
        self.assertIsInstance(summary.get("needs_review"), int)

    def test_autodraft_execute_requires_api_key(self) -> None:
        response = self.client.post(
            "/api/autodraft/execute",
            json={"actions": [], "dry_run": True},
        )
        self.assertEqual(response.status_code, 401)

    def test_autodraft_execute_validation_and_fallback(self) -> None:
        not_json = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            data="not-json",
            content_type="text/plain",
        )
        self.assertEqual(not_json.status_code, 400)
        not_json_payload = not_json.get_json() or {}
        self.assertEqual(not_json_payload.get("error"), "Expected JSON payload.")

        invalid_object = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json=["invalid"],
        )
        self.assertEqual(invalid_object.status_code, 400)
        invalid_object_payload = invalid_object.get_json() or {}
        self.assertEqual(invalid_object_payload.get("error"), "Invalid JSON payload.")

        response = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={"actions": [], "dry_run": True},
        )
        self.assertEqual(response.status_code, 501)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("ok", True))
        self.assertIn("AUTODRAFT_DOTNET_API_URL", str(payload.get("error")))

    def test_terminal_scan_endpoint_requires_auth(self) -> None:
        response = self.client.post("/api/conduit-route/terminal-scan")
        self.assertEqual(response.status_code, 401)

    def test_conduit_route_compute_endpoint_requires_auth(self) -> None:
        response = self.client.post(
            "/api/conduit-route/route/compute",
            json={
                "start": {"x": 10, "y": 10},
                "end": {"x": 100, "y": 100},
                "mode": "plan_view",
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_terminal_route_draw_endpoint_requires_auth(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-routes/draw",
            json={"routes": []},
        )
        self.assertEqual(response.status_code, 401)

    def test_terminal_label_sync_endpoint_requires_auth(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-labels/sync",
            json={"strips": []},
        )
        self.assertEqual(response.status_code, 401)

    def test_bridge_terminal_label_sync_endpoint_requires_auth(self) -> None:
        response = self.client.post(
            "/api/conduit-route/bridge/terminal-labels/sync",
            json={"strips": []},
        )
        self.assertEqual(response.status_code, 401)

    def test_conduit_obstacle_scan_endpoint_requires_auth(self) -> None:
        response = self.client.post("/api/conduit-route/obstacles/scan")
        self.assertEqual(response.status_code, 401)

    def test_etap_cleanup_run_endpoint_requires_auth(self) -> None:
        response = self.client.post("/api/etap/cleanup/run")
        self.assertEqual(response.status_code, 401)

    def test_watchdog_endpoints_require_auth(self) -> None:
        response = self.client.get("/api/watchdog/status")
        self.assertEqual(response.status_code, 401)

        response = self.client.put(
            "/api/watchdog/config",
            json={
                "roots": [self.temp_dir.name],
                "includeGlobs": [],
                "excludeGlobs": [],
                "heartbeatMs": 5000,
                "enabled": True,
            },
        )
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/api/watchdog/heartbeat")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/api/watchdog/pick-root")
        self.assertEqual(response.status_code, 401)

    def test_watchdog_config_validation_and_heartbeat_events(self) -> None:
        bad_response = self.client.put(
            "/api/watchdog/config",
            headers={"X-API-Key": "valid-key"},
            json={
                "roots": ["relative/path"],
                "heartbeatMs": 5000,
                "enabled": True,
            },
        )
        self.assertEqual(bad_response.status_code, 400)
        bad_payload = bad_response.get_json()
        self.assertIsInstance(bad_payload, dict)
        self.assertFalse(bad_payload.get("ok", True))

        config_response = self.client.put(
            "/api/watchdog/config",
            headers={"X-API-Key": "valid-key"},
            json={
                "roots": [self.temp_dir.name],
                "includeGlobs": [],
                "excludeGlobs": [],
                "heartbeatMs": 5000,
                "enabled": True,
            },
        )
        self.assertEqual(config_response.status_code, 200)
        config_payload = config_response.get_json()
        self.assertIsInstance(config_payload, dict)
        self.assertTrue(config_payload.get("ok"))
        self.assertIn("config", config_payload)
        self.assertIn("initialScan", config_payload)

        first_heartbeat = self.client.post(
            "/api/watchdog/heartbeat",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(first_heartbeat.status_code, 200)
        first_payload = first_heartbeat.get_json()
        self.assertIsInstance(first_payload, dict)
        self.assertTrue(first_payload.get("ok"))
        self.assertIn("events", first_payload)
        self.assertIn("scanMs", first_payload)
        self.assertIn("filesScanned", first_payload)
        self.assertIn("foldersScanned", first_payload)
        self.assertIn("truncated", first_payload)
        self.assertIn("warnings", first_payload)
        self.assertIn("lastHeartbeatAt", first_payload)

        added_file = os.path.join(self.temp_dir.name, "watchdog_added.txt")
        with open(added_file, "w", encoding="utf-8") as handle:
            handle.write("new file")

        second_heartbeat = self.client.post(
            "/api/watchdog/heartbeat",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(second_heartbeat.status_code, 200)
        second_payload = second_heartbeat.get_json()
        self.assertIsInstance(second_payload, dict)

        events = second_payload.get("events") or []
        self.assertTrue(any(event.get("type") == "added" for event in events))
        added_event_ids = [
            int(event.get("eventId") or 0)
            for event in events
            if event.get("type") == "added"
        ]
        self.assertTrue(all(event_id > 0 for event_id in added_event_ids))

        modified_file = os.path.join(self.temp_dir.name, "watchdog_added.txt")
        with open(modified_file, "a", encoding="utf-8") as handle:
            handle.write("\nupdated")

        third_heartbeat = self.client.post(
            "/api/watchdog/heartbeat",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(third_heartbeat.status_code, 200)
        third_payload = third_heartbeat.get_json()
        self.assertIsInstance(third_payload, dict)
        third_events = third_payload.get("events") or []
        modified_event_ids = [
            int(event.get("eventId") or 0)
            for event in third_events
            if event.get("type") == "modified"
        ]
        self.assertTrue(modified_event_ids)
        if added_event_ids:
            self.assertGreater(min(modified_event_ids), max(added_event_ids))

    def test_watchdog_allows_disabled_config_without_roots(self) -> None:
        config_response = self.client.put(
            "/api/watchdog/config",
            headers={"X-API-Key": "valid-key"},
            json={
                "roots": [],
                "includeGlobs": [],
                "excludeGlobs": [],
                "heartbeatMs": 5000,
                "enabled": False,
            },
        )
        self.assertEqual(config_response.status_code, 200)
        config_payload = config_response.get_json() or {}
        self.assertTrue(config_payload.get("ok"))
        self.assertFalse((config_payload.get("config") or {}).get("enabled", True))
        self.assertEqual((config_payload.get("config") or {}).get("roots"), [])

        heartbeat_response = self.client.post(
            "/api/watchdog/heartbeat",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(heartbeat_response.status_code, 200)
        heartbeat_payload = heartbeat_response.get_json() or {}
        self.assertTrue(heartbeat_payload.get("ok"))
        self.assertEqual(heartbeat_payload.get("events"), [])
        warnings = heartbeat_payload.get("warnings") or []
        self.assertTrue(
            any("paused" in str(warning).lower() for warning in warnings),
        )


if __name__ == "__main__":
    unittest.main()
