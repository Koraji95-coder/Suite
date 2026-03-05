from __future__ import annotations

import logging
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
            batch_session_cookie="bfr_session",
            batch_session_ttl_seconds=3600,
            require_supabase_user=require_supabase_user,
            require_agent_session=require_agent_session,
            passkey_deps={
                "_auth_passkey_capability": auth_passkey_capability,
                "_get_request_ip": get_request_ip,
            },
            agent_deps={
                "_agent_broker_config_status": lambda: {"ok": True, "missing": [], "warnings": []},
                "_get_supabase_user_id": lambda user: str(user.get("id") or ""),
                "_get_supabase_user_email": lambda user: str(user.get("email") or ""),
            },
            transmittal_render_deps={
                "TRANSMITTAL_RENDER_AVAILABLE": False,
            },
            get_manager=get_manager,
            connect_autocad=connect_autocad,
            dyn=dyn,
            pythoncom=_PythonComStub(),
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
            "/api/agent/session": ["GET"],
            "/api/agent/pair": ["POST"],
            "/api/agent/unpair": ["POST"],
            "/api/agent/session/clear": ["POST"],
            "/api/agent/webhook": ["POST"],
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
            "/api/conduit-route/obstacles/scan": ["POST"],
            "/api/conduit-route/route/compute": ["POST"],
            "/api/autocad/ws-ticket": ["POST"],
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

    def test_api_status_endpoint(self) -> None:
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/api/status", headers={"X-API-Key": "valid-key"})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")

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

    def test_conduit_obstacle_scan_endpoint_requires_auth(self) -> None:
        response = self.client.post("/api/conduit-route/obstacles/scan")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
