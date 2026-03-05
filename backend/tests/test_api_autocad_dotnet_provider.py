from __future__ import annotations

import unittest
from typing import Any, Dict, List, Tuple

from flask import Flask
from flask_limiter import Limiter

from backend.route_groups.api_autocad import create_autocad_blueprint


class _ManagerStub:
    def get_status(self) -> Dict[str, Any]:
        return {
            "connected": True,
            "autocad_running": True,
            "drawing_open": True,
            "drawing_name": "stub.dwg",
            "error": None,
        }

    def get_layers(self) -> Tuple[bool, List[str], str | None]:
        return True, ["S-FNDN-PRIMARY"], None

    def execute_layer_search(self, _config: Any, run_id: str | None = None) -> Dict[str, Any]:
        return {
            "success": True,
            "count": 0,
            "points": [],
            "layers": [],
            "excel_path": "",
            "blocks_inserted": 0,
            "block_errors": None,
            "run_id": run_id,
        }


class _PythonComStub:
    @staticmethod
    def CoInitialize() -> None:
        return None

    @staticmethod
    def CoUninitialize() -> None:
        return None


class _TracebackStub:
    @staticmethod
    def print_exc() -> None:
        return None


class TestApiAutocadDotnetProvider(unittest.TestCase):
    def _build_client(
        self,
        *,
        provider: str,
        sender: Any,
    ):
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
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def issue_ws_ticket(**_kwargs):
            return {
                "ticket": "test-ticket",
                "expires_at": 4102444800.0,
                "ttl_seconds": 45,
            }

        manager = _ManagerStub()

        def get_manager():
            return manager

        def connect_autocad():
            raise RuntimeError("COM should not be used in dotnet provider tests")

        def dyn(value):
            return value

        def validate_layer_config(config):
            return config

        blueprint = create_autocad_blueprint(
            require_autocad_auth=require_autocad_auth,
            limiter=limiter,
            issue_ws_ticket=issue_ws_ticket,
            logger=app.logger,
            get_manager=get_manager,
            connect_autocad=connect_autocad,
            dyn=dyn,
            pythoncom=_PythonComStub(),
            conduit_route_autocad_provider=provider,
            send_autocad_dotnet_command=sender,
            validate_layer_config=validate_layer_config,
            traceback_module=_TracebackStub(),
        )
        app.register_blueprint(blueprint)
        return app.test_client()

    def test_terminal_scan_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "stub terminal scan ok",
                    "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "panels": {}},
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)

        response = client.post(
            "/api/conduit-route/terminal-scan",
            json={
                "selectionOnly": True,
                "includeModelspace": False,
                "maxEntities": 1234,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("source"), "dotnet")
        self.assertIn("bridgeMs", payload.get("meta", {}))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_terminal_scan")
        self.assertEqual(calls[0][1]["selectionOnly"], True)
        self.assertEqual(calls[0][1]["includeModelspace"], False)
        self.assertEqual(calls[0][1]["maxEntities"], 1234)

    def test_obstacle_scan_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "stub obstacle scan ok",
                    "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "obstacles": []},
                    "meta": {"totalObstacles": 0},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/obstacles/scan",
            json={
                "selectionOnly": False,
                "includeModelspace": True,
                "maxEntities": 50000,
                "canvasWidth": 980,
                "canvasHeight": 560,
                "layerNames": ["S-FNDN-PRIMARY"],
                "layerTypeOverrides": {"S-FNDN-PRIMARY": "foundation"},
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("source"), "dotnet")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_obstacle_scan")
        self.assertEqual(calls[0][1]["canvasWidth"], 980.0)
        self.assertEqual(calls[0][1]["canvasHeight"], 560.0)
        self.assertEqual(calls[0][1]["layerNames"], ["S-FNDN-PRIMARY"])

    def test_dotnet_terminal_scan_returns_503_when_sender_missing(self) -> None:
        client = self._build_client(provider="dotnet", sender=None)
        response = client.post("/api/conduit-route/terminal-scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_FAILED")

    def test_status_includes_conduit_provider_metadata(self) -> None:
        client = self._build_client(provider="dotnet_fallback_com", sender=None)
        response = client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        provider = payload.get("conduit_route_provider") or {}
        self.assertEqual(provider.get("configured"), "dotnet_fallback_com")
        self.assertTrue(provider.get("dotnet_enabled"))
        self.assertTrue(provider.get("com_fallback"))
        self.assertFalse(provider.get("dotnet_sender_ready"))


if __name__ == "__main__":
    unittest.main()
