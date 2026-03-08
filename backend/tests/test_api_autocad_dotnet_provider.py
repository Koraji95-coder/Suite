from __future__ import annotations

import os
import tempfile
import unittest
from typing import Any, Dict, List, Tuple

from flask import Flask
from flask_limiter import Limiter

from backend.route_groups.api_autocad import create_autocad_blueprint


_UNSET = object()


class _ManagerStub:
    def __init__(self, status: Dict[str, Any] | None = None) -> None:
        default_status: Dict[str, Any] = {
            "connected": True,
            "autocad_running": True,
            "drawing_open": True,
            "drawing_name": "stub.dwg",
            "error": None,
        }
        if isinstance(status, dict):
            default_status.update(status)
        self._status = default_status
        self.draw_payloads: list[dict[str, Any]] = []
        self.label_sync_payloads: list[dict[str, Any]] = []

    def get_status(self) -> Dict[str, Any]:
        return dict(self._status)

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

    def plot_terminal_routes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.draw_payloads.append(payload)
        operation = str(payload.get("operation") or "")
        client_route_id = str(payload.get("clientRouteId") or "")
        sync_status = "synced" if operation == "upsert" else ("deleted" if operation == "delete" else "reset")
        return {
            "success": True,
            "code": "",
            "message": "ok",
            "data": {
                "drawing": {"name": "stub.dwg", "units": "Feet"},
                "operation": operation,
                "sessionId": payload.get("sessionId"),
                "clientRouteId": client_route_id,
                "syncStatus": sync_status,
                "drawnRoutes": 1 if operation == "upsert" else 0,
                "drawnSegments": 2 if operation == "upsert" else 0,
                "labelsDrawn": 1 if operation == "upsert" else 0,
                "deletedEntities": 1 if operation == "delete" else 0,
                "resetRoutes": 1 if operation == "reset" else 0,
                "layersUsed": ["SUITE_WIRE_AUTO"],
                "bindings": {client_route_id: {"entityHandles": ["A1", "A2"]}}
                if client_route_id
                else {},
            },
            "warnings": [],
        }

    def sync_terminal_labels(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.label_sync_payloads.append(payload)
        strips = payload.get("strips") or []
        return {
            "success": True,
            "code": "",
            "message": "labels synced",
            "data": {
                "drawing": {"name": "stub.dwg", "units": "Feet"},
                "updatedStrips": len(strips),
                "matchedStrips": len(strips),
                "targetStrips": len(strips),
                "matchedBlocks": len(strips),
                "updatedBlocks": len(strips),
                "updatedAttributes": len(strips) * 12,
                "unchangedAttributes": 0,
                "missingAttributes": 0,
                "failedAttributes": 0,
            },
            "meta": {},
            "warnings": [],
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
        manager_status: Dict[str, Any] | None = None,
        connect_autocad_fn: Any = None,
        pythoncom_override: Any = _UNSET,
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

        manager = _ManagerStub(status=manager_status)
        self._manager = manager

        def get_manager():
            return manager

        def connect_autocad():
            if callable(connect_autocad_fn):
                return connect_autocad_fn()
            raise RuntimeError("COM should not be used in dotnet provider tests")

        def dyn(value):
            return value

        def validate_layer_config(config):
            return config

        pythoncom_value = _PythonComStub() if pythoncom_override is _UNSET else pythoncom_override

        blueprint = create_autocad_blueprint(
            require_autocad_auth=require_autocad_auth,
            limiter=limiter,
            issue_ws_ticket=issue_ws_ticket,
            logger=app.logger,
            get_manager=get_manager,
            connect_autocad=connect_autocad,
            dyn=dyn,
            pythoncom=pythoncom_value,
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
                "terminalProfile": {
                    "panelIdKeys": ["PANEL_TAG"],
                    "stripIdKeys": ["STRIP_TAG"],
                    "blockNameAllowList": ["tb_strip_meta_side"],
                    "requireStripId": True,
                    "requireTerminalCount": True,
                    "requireSide": True,
                    "defaultPanelPrefix": "rp",
                    "defaultTerminalCount": 12,
                },
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
        terminal_profile = calls[0][1].get("terminalProfile") or {}
        self.assertEqual(terminal_profile.get("panelIdKeys"), ["PANEL_TAG"])
        self.assertEqual(terminal_profile.get("stripIdKeys"), ["STRIP_TAG"])
        self.assertEqual(terminal_profile.get("blockNameAllowList"), ["TB_STRIP_META_SIDE"])
        self.assertEqual(terminal_profile.get("requireStripId"), True)
        self.assertEqual(terminal_profile.get("requireTerminalCount"), True)
        self.assertEqual(terminal_profile.get("requireSide"), True)
        self.assertEqual(terminal_profile.get("defaultPanelPrefix"), "RP")
        self.assertEqual(terminal_profile.get("defaultTerminalCount"), 12)

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

    def test_terminal_route_draw_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "stub route draw ok",
                    "data": {
                        "drawing": {"name": "stub.dwg", "units": "Feet"},
                        "drawnRoutes": 1,
                        "drawnSegments": 2,
                        "labelsDrawn": 1,
                        "layersUsed": ["SUITE_WIRE_AUTO"],
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/terminal-routes/draw",
            json={
                "operation": "upsert",
                "sessionId": "cad-session-1",
                "clientRouteId": "route-1",
                "defaultLayerName": "SUITE_WIRE_AUTO",
                "annotateRefs": True,
                "route": {
                    "ref": "DC-001",
                    "routeType": "conductor",
                    "wireFunction": "DC (+)",
                    "cableType": "DC",
                    "colorCode": "RD",
                    "colorAci": 1,
                    "path": [
                        {"x": 10, "y": 20},
                        {"x": 30, "y": 20},
                        {"x": 30, "y": 50},
                    ],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("source"), "dotnet")
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "dotnet")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_terminal_routes_draw")
        dotnet_payload = calls[0][1]
        self.assertEqual(dotnet_payload.get("operation"), "upsert")
        self.assertEqual(dotnet_payload.get("sessionId"), "cad-session-1")
        self.assertEqual(dotnet_payload.get("clientRouteId"), "route-1")
        self.assertEqual(dotnet_payload.get("defaultLayerName"), "SUITE_WIRE_AUTO")
        self.assertEqual(dotnet_payload.get("annotateRefs"), True)
        self.assertEqual(dotnet_payload.get("textHeight"), 0.125)
        self.assertIsInstance(dotnet_payload.get("route"), dict)
        route_payload = dotnet_payload.get("route") or {}
        self.assertEqual(route_payload.get("geometryVersion"), "v1.2")
        self.assertIsInstance(route_payload.get("primitives"), list)
        self.assertGreaterEqual(len(route_payload.get("primitives")), 2)

    def test_terminal_route_draw_dotnet_fallback_uses_com_when_bridge_unavailable(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            raise RuntimeError("named pipe unavailable")

        client = self._build_client(provider="dotnet_fallback_com", sender=sender)
        response = client.post(
            "/api/conduit-route/terminal-routes/draw",
            headers={"X-Request-ID": "req-route-fallback-1"},
            json={
                "operation": "upsert",
                "sessionId": "cad-session-2",
                "clientRouteId": "route-fallback-1",
                "route": {
                    "ref": "JMP-001",
                    "routeType": "jumper",
                    "path": [{"x": 8, "y": 10}, {"x": 18, "y": 10}],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("source"), "autocad")
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "com_fallback")
        manager = self._manager
        self.assertEqual(len(manager.draw_payloads), 1)
        self.assertEqual(manager.draw_payloads[0].get("requestId"), "req-route-fallback-1")

    def test_terminal_label_sync_uses_manager_com_path(self) -> None:
        client = self._build_client(provider="dotnet", sender=lambda *_args, **_kwargs: {})
        response = client.post(
            "/api/conduit-route/terminal-labels/sync",
            headers={"X-Request-ID": "req-label-sync-1"},
            json={
                "selectionOnly": False,
                "includeModelspace": True,
                "maxEntities": 50000,
                "strips": [
                    {
                        "stripId": "RP1L1",
                        "terminalCount": 12,
                        "labels": [str(index) for index in range(1, 13)],
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "com")
        manager = self._manager
        self.assertEqual(len(manager.label_sync_payloads), 1)
        self.assertEqual(
            manager.label_sync_payloads[0]["strips"][0]["stripId"],
            "RP1L1",
        )
        self.assertEqual(
            manager.label_sync_payloads[0].get("requestId"),
            "req-label-sync-1",
        )

    def test_bridge_terminal_label_sync_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "labels synced",
                    "data": {
                        "drawing": {"name": "stub.dwg", "units": "Feet"},
                        "updatedStrips": 1,
                        "matchedStrips": 1,
                        "targetStrips": 1,
                        "matchedBlocks": 1,
                        "updatedBlocks": 1,
                        "updatedAttributes": 12,
                        "unchangedAttributes": 0,
                        "missingAttributes": 0,
                        "failedAttributes": 0,
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/bridge/terminal-labels/sync",
            json={
                "selectionOnly": False,
                "includeModelspace": True,
                "maxEntities": 50000,
                "strips": [
                    {
                        "stripId": "RP1L1",
                        "terminalCount": 12,
                        "labels": [str(index) for index in range(1, 13)],
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("meta", {}).get("source"), "dotnet")
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "dotnet")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_terminal_labels_sync")
        self.assertEqual(calls[0][1].get("selectionOnly"), False)
        self.assertEqual(calls[0][1].get("includeModelspace"), True)
        self.assertEqual(calls[0][1].get("maxEntities"), 50000)
        self.assertEqual(
            ((calls[0][1].get("strips") or [{}])[0] or {}).get("stripId"),
            "RP1L1",
        )
        manager = self._manager
        self.assertEqual(len(manager.label_sync_payloads), 0)

    def test_bridge_terminal_label_sync_rejects_invalid_payload(self) -> None:
        client = self._build_client(provider="dotnet", sender=lambda *_args, **_kwargs: {})
        response = client.post(
            "/api/conduit-route/bridge/terminal-labels/sync",
            json={"maxEntities": "not-an-int"},
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "INVALID_REQUEST")

    def test_bridge_terminal_label_sync_requires_sender_configuration(self) -> None:
        client = self._build_client(provider="dotnet", sender=None)
        response = client.post(
            "/api/conduit-route/bridge/terminal-labels/sync",
            json={},
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_UNAVAILABLE")

    def test_terminal_route_draw_rejects_missing_session_id(self) -> None:
        client = self._build_client(provider="dotnet", sender=lambda *_args, **_kwargs: {})
        response = client.post(
            "/api/conduit-route/terminal-routes/draw",
            json={
                "operation": "upsert",
                "clientRouteId": "route-1",
                "route": {
                    "ref": "R1",
                    "routeType": "conductor",
                    "path": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
                },
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "INVALID_REQUEST")

    def test_terminal_route_draw_delete_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "deleted",
                    "data": {
                        "operation": "delete",
                        "sessionId": "cad-session-del",
                        "clientRouteId": "route-del-1",
                        "syncStatus": "deleted",
                        "drawnRoutes": 0,
                        "drawnSegments": 0,
                        "labelsDrawn": 0,
                        "deletedEntities": 2,
                        "resetRoutes": 0,
                        "layersUsed": [],
                        "bindings": {"route-del-1": {"entityHandles": ["A1", "A2"]}},
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/terminal-routes/draw",
            json={
                "operation": "delete",
                "sessionId": "cad-session-del",
                "clientRouteId": "route-del-1",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_terminal_routes_draw")
        self.assertEqual(calls[0][1].get("operation"), "delete")

    def test_terminal_route_draw_reset_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "reset",
                    "data": {
                        "operation": "reset",
                        "sessionId": "cad-session-rst",
                        "clientRouteId": "",
                        "syncStatus": "reset",
                        "drawnRoutes": 0,
                        "drawnSegments": 0,
                        "labelsDrawn": 0,
                        "deletedEntities": 4,
                        "resetRoutes": 2,
                        "layersUsed": [],
                        "bindings": {},
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/terminal-routes/draw",
            json={
                "operation": "reset",
                "sessionId": "cad-session-rst",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_terminal_routes_draw")
        self.assertEqual(calls[0][1].get("operation"), "reset")

    def test_obstacle_scan_layer_preset_expands_rules_for_dotnet_payload(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "ok",
                    "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "obstacles": []},
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/obstacles/scan",
            json={
                "layerPreset": "substation_default",
                "layerNames": ["CUSTOM-ROAD-LAYER"],
                "layerTypeOverrides": {"CUSTOM-ROAD-LAYER": "road"},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(calls), 1)
        dotnet_payload = calls[0][1]
        self.assertEqual(dotnet_payload.get("layerPreset"), "substation_default")
        self.assertIn("S-FNDN-PRIMARY", dotnet_payload.get("layerNames") or [])
        self.assertIn("CUSTOM-ROAD-LAYER", dotnet_payload.get("layerNames") or [])
        self.assertEqual(
            (dotnet_payload.get("layerTypeOverrides") or {}).get("CUSTOM-ROAD-LAYER"),
            "road",
        )

    def test_route_compute_layer_preset_expands_for_dotnet_obstacle_scan_payload(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            if action == "conduit_route_obstacle_scan":
                return {
                    "ok": True,
                    "result": {
                        "success": True,
                        "code": "",
                        "message": "ok",
                        "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "obstacles": []},
                        "meta": {},
                        "warnings": [],
                    },
                    "error": None,
                }
            raise AssertionError(f"Unexpected action: {action}")

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/route/compute",
            json={
                "start": {"x": 12, "y": 14},
                "end": {"x": 220, "y": 240},
                "mode": "plan_view",
                "obstacleSource": "autocad",
                "obstacleScan": {
                    "layerPreset": "utility_yard",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get("success"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "conduit_route_obstacle_scan")
        self.assertEqual(calls[0][1].get("layerPreset"), "utility_yard")
        self.assertIn("U-FOUND", calls[0][1].get("layerNames") or [])

    def test_dotnet_terminal_scan_returns_503_when_sender_missing(self) -> None:
        client = self._build_client(provider="dotnet", sender=None)
        response = client.post("/api/conduit-route/terminal-scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_FAILED")

    def test_etap_cleanup_run_uses_dotnet_action(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "id": "bridge-etap-123",
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "queued",
                    "data": {
                        "drawing": {"name": "stub.dwg"},
                        "command": "ETAPFIX",
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/etap/cleanup/run",
            headers={"X-Request-ID": "req-etap-123"},
            json={
                "command": "ETAPFIX",
                "pluginDllPath": "C:\\AutoCAD\\Plugins\\EtapDxfCleanup.dll",
                "waitForCompletion": False,
                "timeoutMs": 120000,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "etap_dxf_cleanup_run")
        self.assertEqual(calls[0][1].get("requestId"), "req-etap-123")
        self.assertEqual(calls[0][1].get("command"), "ETAPFIX")
        self.assertEqual(
            calls[0][1].get("pluginDllPath"),
            "C:\\AutoCAD\\Plugins\\EtapDxfCleanup.dll",
        )
        self.assertEqual(calls[0][1].get("waitForCompletion"), False)
        self.assertEqual(calls[0][1].get("timeoutMs"), 120000)
        self.assertEqual((payload.get("meta") or {}).get("requestId"), "req-etap-123")
        self.assertEqual((payload.get("meta") or {}).get("bridgeRequestId"), "bridge-etap-123")

    def test_etap_cleanup_run_returns_503_when_sender_missing(self) -> None:
        client = self._build_client(provider="dotnet", sender=None)
        response = client.post("/api/etap/cleanup/run", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_UNAVAILABLE")

    def test_etap_cleanup_run_maps_plugin_not_found_to_404(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            return {
                "ok": True,
                "result": {
                    "success": False,
                    "code": "PLUGIN_DLL_NOT_FOUND",
                    "message": "missing plugin",
                    "data": {},
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/etap/cleanup/run",
            json={"pluginDllPath": "C:\\missing\\EtapDxfCleanup.dll"},
        )
        self.assertEqual(response.status_code, 404)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "PLUGIN_DLL_NOT_FOUND")

    def test_etap_cleanup_run_uses_env_default_plugin_path_when_not_provided(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "id": "bridge-etap-auto-path",
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "queued",
                    "data": {
                        "drawing": {"name": "stub.dwg"},
                        "command": "ETAPFIX",
                    },
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        fd, dll_path = tempfile.mkstemp(suffix=".dll")
        os.close(fd)
        previous_env = os.environ.get("AUTOCAD_ETAP_PLUGIN_DLL_PATH")
        os.environ["AUTOCAD_ETAP_PLUGIN_DLL_PATH"] = dll_path
        try:
            client = self._build_client(provider="dotnet", sender=sender)
            response = client.post(
                "/api/etap/cleanup/run",
                json={"command": "ETAPFIX"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], "etap_dxf_cleanup_run")
            payload_plugin_path = str(calls[0][1].get("pluginDllPath") or "")
            self.assertTrue(payload_plugin_path)
            self.assertTrue(os.path.exists(payload_plugin_path))
            self.assertTrue(os.path.samefile(payload_plugin_path, dll_path))

            payload = response.get_json() or {}
            meta = payload.get("meta") or {}
            meta_plugin_path = str(meta.get("pluginDllPath") or "")
            self.assertTrue(meta_plugin_path)
            self.assertTrue(os.path.exists(meta_plugin_path))
            self.assertTrue(os.path.samefile(meta_plugin_path, dll_path))
            self.assertTrue(meta.get("pluginDllAutoDiscovered"))
        finally:
            if previous_env is None:
                os.environ.pop("AUTOCAD_ETAP_PLUGIN_DLL_PATH", None)
            else:
                os.environ["AUTOCAD_ETAP_PLUGIN_DLL_PATH"] = previous_env
            try:
                os.remove(dll_path)
            except OSError:
                pass

    def test_terminal_scan_propagates_request_id_to_dotnet_and_response_meta(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "id": "bridge-job-123",
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "ok",
                    "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "panels": {}},
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/terminal-scan",
            headers={"X-Request-ID": "req-test-123"},
            json={},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1].get("requestId"), "req-test-123")
        self.assertEqual((payload.get("meta") or {}).get("requestId"), "req-test-123")
        self.assertEqual((payload.get("meta") or {}).get("bridgeRequestId"), "bridge-job-123")

    def test_terminal_scan_returns_503_for_malformed_dotnet_result(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            return {
                "ok": True,
                "result": "bad-result-shape",
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post("/api/conduit-route/terminal-scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_FAILED")

    def test_obstacle_scan_propagates_request_id_to_dotnet_and_response_meta(self) -> None:
        calls: list[tuple[str, dict[str, Any]]] = []

        def sender(action: str, payload: dict[str, Any]) -> dict[str, Any]:
            calls.append((action, payload))
            return {
                "id": "bridge-obstacle-42",
                "ok": True,
                "result": {
                    "success": True,
                    "code": "",
                    "message": "ok",
                    "data": {"drawing": {"name": "stub.dwg", "units": "Feet"}, "obstacles": []},
                    "meta": {},
                    "warnings": [],
                },
                "error": None,
            }

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/obstacles/scan",
            headers={"X-Request-ID": "req-obs-42"},
            json={},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1].get("requestId"), "req-obs-42")
        self.assertEqual((payload.get("meta") or {}).get("requestId"), "req-obs-42")
        self.assertEqual(
            (payload.get("meta") or {}).get("bridgeRequestId"),
            "bridge-obstacle-42",
        )

    def test_terminal_scan_dotnet_fallback_provider_uses_com_path_when_bridge_unavailable(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            raise RuntimeError("named pipe unavailable")

        client = self._build_client(
            provider="dotnet_fallback_com",
            sender=sender,
            manager_status={"drawing_open": False},
        )
        response = client.post("/api/conduit-route/terminal-scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "AUTOCAD_DRAWING_NOT_OPEN")

    def test_obstacle_scan_dotnet_fallback_provider_uses_com_path_when_bridge_unavailable(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            raise RuntimeError("named pipe unavailable")

        client = self._build_client(
            provider="dotnet_fallback_com",
            sender=sender,
            manager_status={"drawing_open": False},
        )
        response = client.post("/api/conduit-route/obstacles/scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "AUTOCAD_DRAWING_NOT_OPEN")

    def test_route_compute_autocad_source_returns_bridge_failed_for_strict_dotnet(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            raise TimeoutError("pipe timeout")

        client = self._build_client(provider="dotnet", sender=sender)
        response = client.post(
            "/api/conduit-route/route/compute",
            json={
                "start": {"x": 10, "y": 10},
                "end": {"x": 80, "y": 80},
                "mode": "plan_view",
                "obstacleSource": "autocad",
            },
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "DOTNET_BRIDGE_FAILED")

    def test_obstacle_scan_rejects_invalid_canvas_dimensions(self) -> None:
        client = self._build_client(provider="com", sender=None)
        response = client.post(
            "/api/conduit-route/obstacles/scan",
            json={
                "canvasWidth": "not-a-number",
                "canvasHeight": 560,
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "INVALID_REQUEST")

    def test_obstacle_scan_fallback_returns_com_unavailable_when_pythoncom_missing(self) -> None:
        def sender(_action: str, _payload: dict[str, Any]) -> dict[str, Any]:
            raise RuntimeError("named pipe unavailable")

        client = self._build_client(
            provider="dotnet_fallback_com",
            sender=sender,
            pythoncom_override=None,
        )
        response = client.post("/api/conduit-route/obstacles/scan", json={})
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "COM_UNAVAILABLE")

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

    def test_obstacle_presets_endpoint_returns_catalog(self) -> None:
        client = self._build_client(provider="com", sender=None)
        response = client.get("/api/conduit-route/obstacles/presets")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        presets = payload.get("presets") or []
        preset_ids = {entry.get("id") for entry in presets if isinstance(entry, dict)}
        self.assertIn("substation_default", preset_ids)
        self.assertIn("industrial_plant", preset_ids)
        self.assertIn("utility_yard", preset_ids)


if __name__ == "__main__":
    unittest.main()
