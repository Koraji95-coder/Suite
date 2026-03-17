from __future__ import annotations

import io
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
        self.previous_feedback_db = os.environ.get("AUTODRAFT_COMPARE_FEEDBACK_DB")
        self.previous_shadow_advisor = os.environ.get(
            "AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED"
        )
        self.previous_agent_pre_review = os.environ.get(
            "AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED"
        )
        os.environ["AUTODRAFT_COMPARE_FEEDBACK_DB"] = str(
            self.backup_dir / "compare-feedback.sqlite3"
        )
        os.environ["AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED"] = "false"
        os.environ["AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED"] = "false"

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

            def get_layer_snapshot(self):
                return (
                    True,
                    [
                        {"name": "A-DEMO-LAYER", "locked": False},
                        {"name": "A-LOCKED-LAYER", "locked": True},
                    ],
                    None,
                )

            def get_entity_snapshot(self, *, layer_names=None, max_entities=500):
                layer_lookup = {
                    str(value).strip().lower()
                    for value in (layer_names or [])
                    if str(value).strip()
                }
                entities = [
                    {
                        "id": "E-1",
                        "layer": "A-DEMO-LAYER",
                        "bounds": {"x": 8, "y": 8, "width": 20, "height": 20},
                    },
                    {
                        "id": "E-2",
                        "layer": "A-LOCKED-LAYER",
                        "bounds": {"x": 40, "y": 40, "width": 10, "height": 10},
                    },
                ]
                if layer_lookup:
                    entities = [
                        entry
                        for entry in entities
                        if str(entry.get("layer") or "").strip().lower() in layer_lookup
                    ]
                return True, entities[: max(1, int(max_entities or 1))], None

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
        if self.previous_feedback_db is None:
            os.environ.pop("AUTODRAFT_COMPARE_FEEDBACK_DB", None)
        else:
            os.environ["AUTODRAFT_COMPARE_FEEDBACK_DB"] = self.previous_feedback_db
        if self.previous_shadow_advisor is None:
            os.environ.pop("AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED", None)
        else:
            os.environ["AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED"] = (
                self.previous_shadow_advisor
            )
        if self.previous_agent_pre_review is None:
            os.environ.pop("AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED", None)
        else:
            os.environ["AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED"] = (
                self.previous_agent_pre_review
            )
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
            "/api/transmittal/analyze-pdfs": ["POST"],
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
            "/api/conduit-route/backcheck": ["POST"],
            "/api/autodraft/backcheck": ["POST"],
            "/api/autodraft/compare/prepare": ["POST"],
            "/api/autodraft/compare": ["POST"],
            "/api/autodraft/compare/feedback": ["POST"],
            "/api/autodraft/compare/feedback/export": ["GET"],
            "/api/autodraft/compare/feedback/import": ["POST"],
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

    def test_backup_save_normalizes_parent_segments(self) -> None:
        response = self.client.post(
            "/api/backup/save",
            headers={"X-API-Key": "valid-key"},
            json={"filename": "..\\..\\outside.yaml", "content": "hello: world\n"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        filename = str(payload.get("filename") or "")
        self.assertNotIn("..", filename)
        self.assertTrue(filename.endswith(".yaml"))
        self.assertTrue((self.backup_dir / filename).exists())

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

    def test_transmittal_analyze_pdfs_requires_api_key(self) -> None:
        response = self.client.post("/api/transmittal/analyze-pdfs")
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/transmittal/analyze-pdfs",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 400)
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

    def test_autodraft_backcheck_requires_api_key(self) -> None:
        response = self.client.post(
            "/api/autodraft/backcheck",
            json={"actions": []},
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
        self.assertEqual(not_json_payload.get("code"), "AUTODRAFT_INVALID_REQUEST")
        self.assertTrue(str(not_json_payload.get("requestId", "")).startswith("req-"))

        invalid_object = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json=["invalid"],
        )
        self.assertEqual(invalid_object.status_code, 400)
        invalid_object_payload = invalid_object.get_json() or {}
        self.assertEqual(invalid_object_payload.get("error"), "Invalid JSON payload.")
        self.assertEqual(invalid_object_payload.get("code"), "AUTODRAFT_INVALID_REQUEST")
        self.assertTrue(str(invalid_object_payload.get("requestId", "")).startswith("req-"))

        response = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={"actions": [], "dry_run": True},
        )
        self.assertEqual(response.status_code, 501)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("ok", True))
        self.assertIn("AUTODRAFT_DOTNET_API_URL", str(payload.get("error")))
        self.assertEqual(payload.get("code"), "AUTODRAFT_EXECUTE_NOT_CONFIGURED")
        self.assertTrue(str(payload.get("requestId", "")).startswith("req-"))

    def test_autodraft_execute_requires_override_reason_for_failures(self) -> None:
        failing_action = {
            "id": "action-1",
            "rule_id": None,
            "category": "UNCLASSIFIED",
            "status": "review",
            "confidence": 0.2,
            "markup": {
                "type": "cloud",
                "color": "green",
                "text": "add new conduit",
                "bounds": {"x": 5, "y": 5, "width": 20, "height": 10},
            },
        }
        blocked = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={"actions": [failing_action], "dry_run": True, "backcheck_fail_count": 0},
        )
        self.assertEqual(blocked.status_code, 428)
        blocked_payload = blocked.get_json() or {}
        self.assertFalse(blocked_payload.get("ok", True))
        self.assertIn("backcheck_override_reason", str(blocked_payload.get("error")))
        self.assertEqual(blocked_payload.get("code"), "AUTODRAFT_BACKCHECK_FAILED")
        self.assertTrue(str(blocked_payload.get("requestId", "")).startswith("req-"))
        self.assertEqual(
            blocked_payload.get("meta", {}).get("backcheck_fail_count"),
            1,
        )

        allowed = self.client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "actions": [failing_action],
                "dry_run": True,
                "backcheck_override_reason": "Operator reviewed conflicts.",
            },
        )
        self.assertEqual(allowed.status_code, 501)

    def test_autodraft_backcheck_payload_shape(self) -> None:
        response = self.client.post(
            "/api/autodraft/backcheck",
            headers={"X-API-Key": "valid-key"},
            json={
                "actions": [
                    {
                        "id": "action-1",
                        "rule_id": "delete-green-cloud",
                        "category": "DELETE",
                        "confidence": 0.9,
                        "markup": {
                            "type": "cloud",
                            "color": "green",
                            "text": "delete line",
                            "bounds": {"x": 10, "y": 10, "width": 40, "height": 20},
                        },
                    },
                    {
                        "id": "action-2",
                        "rule_id": None,
                        "category": "UNCLASSIFIED",
                        "confidence": 0.2,
                        "markup": {"type": "text", "color": "blue", "text": "review"},
                    },
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("success"))
        self.assertTrue(str(payload.get("requestId", "")).startswith("req-"))
        self.assertEqual(payload.get("source"), "python-local-backcheck")

        summary = payload.get("summary") or {}
        self.assertEqual(summary.get("total_actions"), 2)
        self.assertIsInstance(summary.get("warn_count"), int)
        self.assertIsInstance(summary.get("fail_count"), int)

        cad = payload.get("cad") or {}
        self.assertEqual(cad.get("source"), "live")

        findings = payload.get("findings") or []
        self.assertIsInstance(findings, list)
        self.assertEqual(len(findings), 2)
        first_finding = findings[0] or {}
        self.assertIn(first_finding.get("status"), {"pass", "warn", "fail"})
        self.assertIsInstance(first_finding.get("suggestions"), list)

    def test_autodraft_backcheck_require_cad_context_accepts_live_context(self) -> None:
        response = self.client.post(
            "/api/autodraft/backcheck",
            headers={"X-API-Key": "valid-key"},
            json={
                "require_cad_context": True,
                "actions": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertIn("requestId", payload)
        cad = payload.get("cad") or {}
        self.assertEqual(cad.get("source"), "live")

    def test_autodraft_backcheck_uses_live_entity_enrichment(self) -> None:
        response = self.client.post(
            "/api/autodraft/backcheck",
            headers={"X-API-Key": "valid-key"},
            json={
                "actions": [
                    {
                        "id": "action-entity-check",
                        "rule_id": "delete-green-cloud",
                        "category": "DELETE",
                        "confidence": 0.95,
                        "markup": {
                            "type": "cloud",
                            "color": "green",
                            "text": "delete line",
                            "layer": "A-DEMO-LAYER",
                            "bounds": {"x": 9, "y": 9, "width": 6, "height": 6},
                        },
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        cad = payload.get("cad") or {}
        self.assertGreaterEqual(int(cad.get("entity_count") or 0), 1)
        findings = payload.get("findings") or []
        self.assertEqual(len(findings), 1)
        notes = findings[0].get("notes") or []
        self.assertFalse(
            any("no intersecting cad entities" in str(note).strip().lower() for note in notes)
        )

    def test_autodraft_backcheck_uses_live_locked_layer_enrichment(self) -> None:
        response = self.client.post(
            "/api/autodraft/backcheck",
            headers={"X-API-Key": "valid-key"},
            json={
                "actions": [
                    {
                        "id": "action-locked-layer",
                        "rule_id": "add-red-cloud",
                        "category": "ADD",
                        "confidence": 0.95,
                        "markup": {
                            "type": "cloud",
                            "color": "red",
                            "text": "add conduit",
                            "layer": "A-LOCKED-LAYER",
                            "bounds": {"x": 42, "y": 42, "width": 4, "height": 4},
                        },
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        findings = payload.get("findings") or []
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].get("status"), "fail")
        notes = findings[0].get("notes") or []
        self.assertTrue(any("locked" in str(note).strip().lower() for note in notes))

    def test_autodraft_compare_requires_api_key(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            json={},
        )
        self.assertEqual(response.status_code, 401)

    def test_autodraft_compare_validation_requires_calibration_points(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "markups": [
                    {
                        "id": "markup-1",
                        "type": "cloud",
                        "color": "green",
                        "text": "delete",
                        "bounds": {"x": 10, "y": 10, "width": 15, "height": 10},
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 422)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("code"), "AUTODRAFT_CALIBRATION_MANUAL_REQUIRED")

    def test_autodraft_compare_auto_falls_back_to_python_when_dotnet_unavailable(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "engine": "auto",
                "tolerance_profile": "medium",
                "manual_override": True,
                "markups": [
                    {
                        "id": "markup-1",
                        "type": "cloud",
                        "color": "green",
                        "text": "delete feeder",
                        "bounds": {"x": 10, "y": 10, "width": 20, "height": 10},
                    }
                ],
                "pdf_points": [{"x": 10, "y": 10}, {"x": 30, "y": 10}],
                "cad_points": [{"x": 100, "y": 100}, {"x": 140, "y": 100}],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        engine = payload.get("engine") or {}
        self.assertEqual(engine.get("requested"), "auto")
        self.assertEqual(engine.get("used"), "python")
        self.assertTrue(payload.get("ok"))
        self.assertIn("summary", payload)
        self.assertIn("backcheck", payload)

    def test_autodraft_compare_dotnet_strict_requires_config(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "engine": "dotnet",
                "manual_override": True,
                "markups": [
                    {
                        "id": "markup-1",
                        "type": "cloud",
                        "color": "green",
                        "text": "delete feeder",
                        "bounds": {"x": 10, "y": 10, "width": 20, "height": 10},
                    }
                ],
                "pdf_points": [{"x": 10, "y": 10}, {"x": 30, "y": 10}],
                "cad_points": [{"x": 100, "y": 100}, {"x": 140, "y": 100}],
            },
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("code"), "AUTODRAFT_COMPARE_NOT_CONFIGURED")

    def test_autodraft_compare_flags_ocr_fallback_markup_for_review(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "engine": "python",
                "calibration_mode": "manual",
                "markups": [
                    {
                        "id": "ocr-text-1",
                        "type": "text",
                        "color": "blue",
                        "text": "verify feeder tag",
                        "bounds": {"x": 10, "y": 10, "width": 30, "height": 10},
                        "meta": {
                            "extraction_source": "ocr",
                            "color_source": "render_sample",
                            "page_position": {"x": 25, "y": 15},
                        },
                        "recognition": {
                            "label": "note",
                            "model_version": "deterministic-v1",
                            "confidence": 0.58,
                            "source": "ocr",
                            "feature_source": "pdf_text_fallback",
                            "reason_codes": [
                                "prepare_text_fallback",
                                "text_source:ocr",
                            ],
                            "needs_review": True,
                            "accepted": False,
                            "override_reason": None,
                        },
                    }
                ],
                "pdf_points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}],
                "cad_points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}],
                "cad_context": {
                    "drawing": {"name": "sample.dwg"},
                    "layers": [{"name": "A-DEMO-LAYER", "locked": False}],
                    "entities": [
                        {
                            "id": "E-TEXT-1",
                            "layer": "A-DEMO-LAYER",
                            "text": "VERIFY FEEDER",
                            "bounds": {"x": 8, "y": 8, "width": 36, "height": 14},
                        }
                    ],
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        plan = payload.get("plan") or {}
        summary = plan.get("summary") or {}
        self.assertEqual(summary.get("needs_review"), 1)
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first_action = actions[0] or {}
        self.assertEqual(first_action.get("status"), "needs_review")
        self.assertEqual(first_action.get("review_type"), "markup")
        self.assertAlmostEqual(float(first_action.get("confidence") or 0.0), 0.58, places=6)

        markup_review_queue = payload.get("markup_review_queue") or []
        self.assertEqual(len(markup_review_queue), 1)
        first_review = markup_review_queue[0] or {}
        self.assertEqual(first_review.get("action_id"), "action-1")
        self.assertEqual(first_review.get("status"), "needs_review")
        self.assertIn("operator review", str(first_review.get("message") or "").lower())

        self.assertEqual(payload.get("review_queue") or [], [])
        findings = ((payload.get("backcheck") or {}).get("findings") or [])
        self.assertEqual(len(findings), 1)
        finding = findings[0] or {}
        self.assertEqual(finding.get("status"), "fail")
        finding_notes = [str(item) for item in (finding.get("notes") or [])]
        self.assertTrue(
            any("low-confidence markup recognition" in item.lower() for item in finding_notes)
        )

    def test_autodraft_compare_infers_red_callout_replacement_metadata(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "engine": "python",
                "tolerance_profile": "medium",
                "manual_override": True,
                "markups": [
                    {
                        "id": "annot-8",
                        "type": "text",
                        "color": "red",
                        "text": "TS416",
                        "bounds": {"x": 880, "y": 900, "width": 80, "height": 150},
                        "meta": {
                            "callout_points": [
                                {"x": 900.0, "y": 1035.0},
                                {"x": 945.0, "y": 1004.0},
                                {"x": 945.0, "y": 975.0},
                            ]
                        },
                    }
                ],
                "replacement_tuning": {
                    "unresolved_confidence_threshold": 0.4,
                    "ambiguity_margin_threshold": 0.1,
                    "search_radius_multiplier": 2.8,
                },
                "pdf_points": [{"x": 10, "y": 10}, {"x": 30, "y": 10}],
                "cad_points": [{"x": 100, "y": 100}, {"x": 140, "y": 100}],
                "cad_context": {
                    "drawing": {"name": "sample.dwg"},
                    "layers": [{"name": "A-DEMO-LAYER", "locked": False}],
                    "entities": [
                        {
                            "id": "E-TS410",
                            "layer": "A-DEMO-LAYER",
                            "text": "TS410",
                            "bounds": {"x": 936, "y": 968, "width": 24, "height": 14},
                        },
                        {
                            "id": "E-TS402",
                            "layer": "A-DEMO-LAYER",
                            "text": "TS402",
                            "bounds": {"x": 1010, "y": 910, "width": 24, "height": 14},
                        },
                    ],
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        tuning = payload.get("replacement_tuning") or {}
        self.assertAlmostEqual(float(tuning.get("unresolved_confidence_threshold") or 0), 0.4, places=6)
        self.assertAlmostEqual(float(tuning.get("ambiguity_margin_threshold") or 0), 0.1, places=6)
        self.assertAlmostEqual(float(tuning.get("search_radius_multiplier") or 0), 2.8, places=6)
        review_queue = payload.get("review_queue") or []
        self.assertGreaterEqual(len(review_queue), 1)
        first_review = review_queue[0] or {}
        self.assertEqual(first_review.get("new_text"), "TS416")
        self.assertIn(first_review.get("status"), {"resolved", "ambiguous", "unresolved"})
        self.assertGreaterEqual(len(first_review.get("candidates") or []), 1)

        plan = payload.get("plan") or {}
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        replacement = (actions[0] or {}).get("replacement") or {}
        self.assertEqual(replacement.get("new_text"), "TS416")
        self.assertIn(
            replacement.get("status"),
            {"resolved", "ambiguous", "unresolved"},
        )
        self.assertIn("target_entity_id", replacement)
        self.assertIn("candidates", replacement)

        findings = ((payload.get("backcheck") or {}).get("findings") or [])
        self.assertEqual(len(findings), 1)
        self.assertIn("replacement", findings[0] or {})

    def test_autodraft_compare_skips_replacement_for_red_see_dwg_reference(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare",
            headers={"X-API-Key": "valid-key"},
            json={
                "engine": "python",
                "manual_override": True,
                "markups": [
                    {
                        "id": "annot-ref-1",
                        "type": "text",
                        "color": "red",
                        "text": "52-203 SEE DWG. E6-0105",
                        "bounds": {"x": 820, "y": 620, "width": 64, "height": 70},
                    }
                ],
                "pdf_points": [{"x": 10, "y": 10}, {"x": 30, "y": 10}],
                "cad_points": [{"x": 100, "y": 100}, {"x": 140, "y": 100}],
                "cad_context": {
                    "drawing": {"name": "sample.dwg"},
                    "layers": [{"name": "A-DEMO-LAYER", "locked": False}],
                    "entities": [
                        {
                            "id": "E-TEXT-1",
                            "layer": "A-DEMO-LAYER",
                            "text": "TS410",
                            "bounds": {"x": 936, "y": 968, "width": 24, "height": 14},
                        },
                    ],
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("review_queue") or [], [])
        actions = ((payload.get("plan") or {}).get("actions") or [])
        self.assertEqual(len(actions), 1)
        self.assertNotIn("replacement", actions[0] or {})

    def test_autodraft_compare_feedback_round_trip(self) -> None:
        submit_response = self.client.post(
            "/api/autodraft/compare/feedback",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-compare-1",
                "items": [
                    {
                        "request_id": "req-compare-1",
                        "action_id": "action-red-1",
                        "review_status": "corrected",
                        "new_text": "TS416",
                        "selected_old_text": "TS410",
                        "selected_entity_id": "E-TS410",
                        "confidence": 0.71,
                        "note": "Validated against modelspace text.",
                        "candidates": [
                            {
                                "entity_id": "E-TS410",
                                "text": "TS410",
                                "score": 0.71,
                                "distance": 8.0,
                                "pointer_hit": True,
                                "overlap": False,
                                "pair_hit_count": 0,
                            }
                        ],
                        "selected_candidate": {
                            "entity_id": "E-TS410",
                            "text": "TS410",
                            "score": 0.71,
                            "distance": 8.0,
                            "pointer_hit": True,
                            "overlap": False,
                            "pair_hit_count": 0,
                        },
                    }
                ],
            },
        )
        self.assertEqual(submit_response.status_code, 200)
        submit_payload = submit_response.get_json() or {}
        self.assertTrue(submit_payload.get("success"))
        self.assertEqual(submit_payload.get("stored"), 1)

        export_response = self.client.get(
            "/api/autodraft/compare/feedback/export",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(export_response.status_code, 200)
        export_payload = export_response.get_json() or {}
        events = export_payload.get("events") or []
        pairs = export_payload.get("pairs") or []
        metrics = export_payload.get("metrics") or []
        self.assertGreaterEqual(len(events), 1)
        self.assertGreaterEqual(len(pairs), 1)
        self.assertGreaterEqual(len(metrics), 1)

        import_response = self.client.post(
            "/api/autodraft/compare/feedback/import",
            headers={"X-API-Key": "valid-key"},
            json={
                "mode": "replace",
                "events": events,
                "pairs": pairs,
                "metrics": metrics,
            },
        )
        self.assertEqual(import_response.status_code, 200)
        import_payload = import_response.get_json() or {}
        self.assertTrue(import_payload.get("success"))
        self.assertEqual(import_payload.get("mode"), "replace")
        imported = import_payload.get("imported") or {}
        self.assertGreaterEqual(int(imported.get("events") or 0), 1)

    def test_autodraft_compare_prepare_requires_pdf_upload(self) -> None:
        response = self.client.post(
            "/api/autodraft/compare/prepare",
            headers={"X-API-Key": "valid-key"},
            data={"page_index": "0"},
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("code"), "AUTODRAFT_INVALID_REQUEST")

    def test_autodraft_compare_prepare_extracts_markups(self) -> None:
        class _FakeAnnotRef:
            def __init__(self, obj):
                self._obj = obj

            def get_object(self):
                return self._obj

        class _FakePage(dict):
            def __init__(self):
                super().__init__()
                self["/Annots"] = (
                    _FakeAnnotRef(
                        {
                            "/Subtype": "/FreeText",
                            "/Rect": [10, 20, 60, 45],
                            "/C": [0.0, 0.0, 1.0],
                            "/Contents": "Install note",
                        }
                    ),
                )
                self["/Measure"] = {"/R": "1 in = 12 in"}

                class _Box:
                    width = 612
                    height = 792

                self.mediabox = _Box()

        class _FakeReader:
            def __init__(self, _stream):
                self.pages = [_FakePage()]
                self.metadata = {
                    "/Producer": "Bluebeam Revu x64",
                    "/Creator": "Bluebeam Revu",
                    "/Title": "Rev markup",
                }

        with (
            patch("backend.route_groups.api_autodraft._PYPDF_AVAILABLE", True),
            patch("backend.route_groups.api_autodraft._PdfReader", _FakeReader),
        ):
            response = self.client.post(
                "/api/autodraft/compare/prepare",
                headers={"X-API-Key": "valid-key"},
                data={
                    "page_index": "0",
                    "pdf": (io.BytesIO(b"%PDF-1.7"), "sample.pdf"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        markups = payload.get("markups") or []
        self.assertEqual(len(markups), 1)
        first = markups[0]
        self.assertEqual(first.get("type"), "text")
        self.assertEqual(first.get("color"), "blue")
        meta = first.get("meta") or {}
        self.assertEqual(meta.get("color_source"), "C")
        self.assertEqual(meta.get("color_hex"), "#0000FF")
        self.assertEqual((meta.get("color_rgb") or {}).get("b"), 1.0)
        self.assertIn("bounds", first)
        seed = payload.get("calibration_seed") or {}
        self.assertTrue(seed.get("available"))
        pdf_metadata = payload.get("pdf_metadata") or {}
        self.assertTrue(pdf_metadata.get("bluebeam_detected"))
        doc_metadata = pdf_metadata.get("document") or {}
        self.assertEqual(doc_metadata.get("producer"), "Bluebeam Revu x64")
        page_metadata = pdf_metadata.get("page") or {}
        annotation_counts = page_metadata.get("annotation_counts") or {}
        self.assertEqual(annotation_counts.get("total"), 1)
        self.assertEqual(annotation_counts.get("supported"), 1)

    def test_autodraft_compare_prepare_uses_ocr_text_fallback_for_flattened_bluebeam_pdf(self) -> None:
        from PIL import Image as PILImage

        class _FakePage(dict):
            def __init__(self):
                super().__init__()

                class _Box:
                    width = 400
                    height = 200

                self.mediabox = _Box()

        class _FakeReader:
            def __init__(self, _stream):
                self.pages = [_FakePage()]
                self.metadata = {
                    "/Producer": "Bluebeam Revu x64",
                    "/Creator": "Bluebeam Revu",
                }

        def _fake_render(pdf_path, *, page_index, output_dir, prefix="page"):
            self.assertEqual(page_index, 0)
            image_path = Path(output_dir) / f"{prefix}.png"
            image = PILImage.new("RGB", (400, 200), "white")
            for x_value in range(40, 241):
                for y_value in range(20, 56):
                    image.putpixel((x_value, y_value), (235, 40, 40))
            image.save(image_path)
            return {
                "path": str(image_path),
                "image_width": 400,
                "image_height": 200,
                "source": "pdftoppm",
            }

        with (
            patch("backend.route_groups.api_autodraft._PYPDF_AVAILABLE", True),
            patch("backend.route_groups.api_autodraft._PdfReader", _FakeReader),
            patch("backend.route_groups.api_autodraft.pdf_render_available", return_value=True),
            patch("backend.route_groups.api_autodraft.pdf_ocr_available", return_value=True),
            patch(
                "backend.route_groups.api_autodraft.extract_embedded_text_page_lines",
                return_value={
                    "page_width": 400.0,
                    "page_height": 200.0,
                    "lines": [],
                    "source": "embedded_text",
                },
            ),
            patch(
                "backend.route_groups.api_autodraft.render_pdf_page_to_png",
                side_effect=_fake_render,
            ),
            patch(
                "backend.route_groups.api_autodraft.extract_ocr_page_lines_from_image",
                return_value={
                    "source": "ocr",
                    "lines": [
                        {
                            "text": "Install new panel",
                            "bounds": {"x": 40.0, "y": 145.0, "width": 201.0, "height": 36.0},
                            "pixel_bounds": {"left": 40, "top": 20, "width": 201, "height": 36},
                            "ocr_confidence": 93.2,
                        }
                    ],
                },
            ),
        ):
            response = self.client.post(
                "/api/autodraft/compare/prepare",
                headers={"X-API-Key": "valid-key"},
                data={
                    "page_index": "0",
                    "pdf": (io.BytesIO(b"%PDF-1.7"), "flattened.pdf"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        markups = payload.get("markups") or []
        self.assertEqual(len(markups), 1)
        first = markups[0] or {}
        self.assertEqual(first.get("type"), "text")
        self.assertEqual(first.get("color"), "red")
        meta = first.get("meta") or {}
        self.assertEqual(meta.get("subtype"), "ocr_text_line")
        self.assertEqual(meta.get("extraction_source"), "ocr")
        self.assertEqual(meta.get("color_source"), "render_sample")
        recognition = first.get("recognition") or {}
        self.assertEqual(recognition.get("feature_source"), "pdf_text_fallback")
        self.assertTrue(recognition.get("needs_review"))
        page_metadata = (payload.get("pdf_metadata") or {}).get("page") or {}
        annotation_counts = page_metadata.get("annotation_counts") or {}
        self.assertEqual(annotation_counts.get("supported"), 0)
        text_extraction = page_metadata.get("text_extraction") or {}
        self.assertTrue(text_extraction.get("used"))
        self.assertEqual(text_extraction.get("source"), "ocr")
        self.assertEqual(text_extraction.get("selected_line_count"), 1)
        warnings = payload.get("warnings") or []
        self.assertTrue(any("OCR fallback recovered text-only markup candidates" in item for item in warnings))

    def test_autodraft_compare_prepare_fallback_filters_title_block_metadata_lines(self) -> None:
        from PIL import Image as PILImage

        class _FakePage(dict):
            def __init__(self):
                super().__init__()

                class _Box:
                    width = 400
                    height = 200

                self.mediabox = _Box()

        class _FakeReader:
            def __init__(self, _stream):
                self.pages = [_FakePage()]
                self.metadata = {
                    "/Producer": "Bluebeam Revu x64",
                    "/Creator": "Bluebeam Revu",
                }

        def _fake_render(pdf_path, *, page_index, output_dir, prefix="page"):
            self.assertEqual(page_index, 0)
            image_path = Path(output_dir) / f"{prefix}.png"
            image = PILImage.new("RGB", (400, 200), "white")
            for x_value in range(30, 181):
                for y_value in range(24, 52):
                    image.putpixel((x_value, y_value), (35, 180, 60))
            for x_value in range(250, 371):
                for y_value in range(160, 184):
                    image.putpixel((x_value, y_value), (30, 30, 30))
            image.save(image_path)
            return {
                "path": str(image_path),
                "image_width": 400,
                "image_height": 200,
                "source": "pdftoppm",
            }

        with (
            patch("backend.route_groups.api_autodraft._PYPDF_AVAILABLE", True),
            patch("backend.route_groups.api_autodraft._PdfReader", _FakeReader),
            patch("backend.route_groups.api_autodraft.pdf_render_available", return_value=True),
            patch("backend.route_groups.api_autodraft.pdf_ocr_available", return_value=True),
            patch(
                "backend.route_groups.api_autodraft.extract_embedded_text_page_lines",
                return_value={
                    "page_width": 400.0,
                    "page_height": 200.0,
                    "lines": [],
                    "source": "embedded_text",
                },
            ),
            patch(
                "backend.route_groups.api_autodraft.render_pdf_page_to_png",
                side_effect=_fake_render,
            ),
            patch(
                "backend.route_groups.api_autodraft.extract_ocr_page_lines_from_image",
                return_value={
                    "source": "ocr",
                    "lines": [
                        {
                            "text": "delete feeder",
                            "bounds": {"x": 30.0, "y": 148.0, "width": 150.0, "height": 28.0},
                            "pixel_bounds": {"left": 30, "top": 24, "width": 150, "height": 28},
                        },
                        {
                            "text": "REVISION A",
                            "bounds": {"x": 250.0, "y": 16.0, "width": 120.0, "height": 24.0},
                            "pixel_bounds": {"left": 250, "top": 160, "width": 120, "height": 24},
                        },
                    ],
                },
            ),
        ):
            response = self.client.post(
                "/api/autodraft/compare/prepare",
                headers={"X-API-Key": "valid-key"},
                data={
                    "page_index": "0",
                    "pdf": (io.BytesIO(b"%PDF-1.7"), "flattened.pdf"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        markups = payload.get("markups") or []
        self.assertEqual(len(markups), 1)
        self.assertEqual((markups[0] or {}).get("text"), "delete feeder")
        text_extraction = (((payload.get("pdf_metadata") or {}).get("page") or {}).get("text_extraction") or {})
        self.assertTrue(text_extraction.get("used"))
        self.assertEqual(text_extraction.get("source"), "ocr")

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

    def test_conduit_route_backcheck_endpoint_requires_auth(self) -> None:
        response = self.client.post(
            "/api/conduit-route/backcheck",
            json={
                "routes": [
                    {
                        "id": "route_1",
                        "mode": "plan_view",
                        "path": [{"x": 10, "y": 10}, {"x": 100, "y": 10}],
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_conduit_route_backcheck_payload_shape(self) -> None:
        response = self.client.post(
            "/api/conduit-route/backcheck",
            headers={"X-API-Key": "valid-key"},
            json={
                "obstacleSource": "client",
                "clearance": 18,
                "obstacles": [{"id": "OBS-A", "type": "foundation", "x": 45, "y": 5, "w": 20, "h": 20}],
                "routes": [
                    {
                        "id": "route_1",
                        "ref": "DC-001",
                        "mode": "plan_view",
                        "path": [{"x": 10, "y": 10}, {"x": 120, "y": 10}],
                    },
                    {
                        "id": "route_2",
                        "ref": "DC-002",
                        "mode": "plan_view",
                        "path": [{"x": 10, "y": 30}, {"x": 30, "y": 45}, {"x": 120, "y": 45}],
                    },
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertTrue(str(payload.get("requestId", "")).startswith("req-"))
        self.assertEqual(payload.get("source"), "python-local-backcheck")
        summary = payload.get("summary") or {}
        self.assertEqual(summary.get("total_routes"), 2)
        self.assertIsInstance(summary.get("fail_count"), int)
        self.assertIsInstance(summary.get("warn_count"), int)
        self.assertIsInstance(summary.get("pass_count"), int)
        findings = payload.get("findings") or []
        self.assertEqual(len(findings), 2)
        first_finding = findings[0] or {}
        self.assertIn(first_finding.get("status"), {"pass", "warn", "fail"})
        self.assertIn("stats", first_finding)
        self.assertIn("issues", first_finding)
        self.assertIn("suggestions", first_finding)

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
