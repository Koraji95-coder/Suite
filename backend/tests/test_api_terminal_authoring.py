from __future__ import annotations

import os
import shutil
import tempfile
import unittest

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_terminal_authoring import (
    create_terminal_authoring_blueprint,
)


class TestApiTerminalAuthoring(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="suite-terminal-authoring-tests-")
        self.project_root = os.path.join(self.temp_dir, "project")
        os.makedirs(self.project_root, exist_ok=True)
        self.project_file = os.path.join(self.project_root, "demo.wdp")
        with open(self.project_file, "w", encoding="utf-8") as handle:
            handle.write("A-100\n")
        self.outside_project_file = os.path.join(self.temp_dir, "outside-demo.wdp")
        with open(self.outside_project_file, "w", encoding="utf-8") as handle:
            handle.write("OUTSIDE\n")

        app = Flask(__name__)
        app.config["TESTING"] = True

        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        self.bridge_actions: list[str] = []
        self.acade_actions: list[str] = []

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def is_valid_api_key(provided_key: str | None) -> bool:
            return provided_key == "valid-key"

        app.register_blueprint(
            create_terminal_authoring_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                is_valid_api_key=is_valid_api_key,
                schedule_cleanup=lambda _path: None,
                send_autocad_dotnet_command=self._send_autocad_dotnet_command,
                send_autocad_acade_command=self._send_autocad_acade_command,
            )
        )

        self.client = app.test_client()

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _send_autocad_dotnet_command(self, action: str, payload: dict[str, object]):
        self.bridge_actions.append(action)
        if action == "suite_terminal_authoring_project_preview":
            drawings = payload.get("drawings") or []
            drawing = drawings[0] if isinstance(drawings, list) else {}
            drawing_path = str((drawing or {}).get("path") or r"C:\dwg\A-100.dwg")
            drawing_name = str((drawing or {}).get("drawingName") or "A-100.dwg")
            relative_path = str((drawing or {}).get("relativePath") or "A-100.dwg")
            return {
                "ok": True,
                "id": "bridge-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project terminal preview ready",
                    "data": {
                        "operationCount": 2,
                        "stripUpdateCount": 1,
                        "routeUpsertCount": 1,
                        "unresolvedCount": 0,
                        "drawings": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "operationCount": 2,
                                "stripUpdateCount": 1,
                                "routeUpsertCount": 1,
                                "unresolvedCount": 0,
                                "warnings": [],
                            }
                        ],
                        "operations": [
                            {
                                "operationId": "strip-op-1",
                                "rowId": "strip-row-1",
                                "source": "strip",
                                "operationType": "label-upsert",
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "panelId": "P1",
                                "side": "L",
                                "stripId": "TB1",
                                "terminalCount": 3,
                                "labels": ["1", "2", "3"],
                                "stripKey": "A100::TB1",
                                "before": "1 | 2 | 4",
                                "after": "1 | 2 | 3",
                                "detail": "Update strip TB1 labels.",
                                "warning": None,
                                "path": [],
                            },
                            {
                                "operationId": "route-op-1",
                                "rowId": "conn-row-1",
                                "source": "connection",
                                "operationType": "route-insert",
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "routeRef": "W1",
                                "routeType": "conductor",
                                "cableType": "CT",
                                "wireFunction": "Trip",
                                "annotateRef": True,
                                "fromStripId": "TB1",
                                "fromTerminal": 1,
                                "toStripId": "TB2",
                                "toTerminal": 1,
                                "routeKey": "project-1::A100::CONDUCTOR::W1",
                                "before": None,
                                "after": "Route W1",
                                "detail": "Insert managed route W1.",
                                "warning": None,
                                "path": [
                                    {"x": 0.0, "y": 0.0},
                                    {"x": 5.0, "y": 0.0},
                                    {"x": 5.0, "y": 5.0},
                                ],
                            },
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-preview"},
                },
            }
        if action == "suite_terminal_authoring_project_apply":
            raise AssertionError("Terminal authoring apply should not be routed through the bridge sender.")
        raise AssertionError(f"Unexpected bridge action {action}")

    def _send_autocad_acade_command(self, action: str, payload: dict[str, object]):
        self.acade_actions.append(action)
        if action == "suite_terminal_authoring_project_preview":
            drawings = payload.get("drawings") or []
            drawing = drawings[0] if isinstance(drawings, list) else {}
            drawing_path = str((drawing or {}).get("path") or r"C:\dwg\A-100.dwg")
            drawing_name = str((drawing or {}).get("drawingName") or "A-100.dwg")
            relative_path = str((drawing or {}).get("relativePath") or "A-100.dwg")
            return {
                "ok": True,
                "id": "acade-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project terminal preview ready",
                    "data": {
                        "operationCount": 2,
                        "stripUpdateCount": 1,
                        "routeUpsertCount": 1,
                        "unresolvedCount": 0,
                        "drawings": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "operationCount": 2,
                                "stripUpdateCount": 1,
                                "routeUpsertCount": 1,
                                "unresolvedCount": 0,
                                "warnings": [],
                            }
                        ],
                        "operations": [
                            {
                                "operationId": "strip-op-1",
                                "rowId": "strip-row-1",
                                "source": "strip",
                                "operationType": "label-upsert",
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "panelId": "P1",
                                "side": "L",
                                "stripId": "TB1",
                                "terminalCount": 3,
                                "labels": ["1", "2", "3"],
                                "stripKey": "A100::TB1",
                                "before": "1 | 2 | 4",
                                "after": "1 | 2 | 3",
                                "detail": "Update strip TB1 labels.",
                                "warning": None,
                                "path": [],
                            },
                            {
                                "operationId": "route-op-1",
                                "rowId": "conn-row-1",
                                "source": "connection",
                                "operationType": "route-insert",
                                "drawingPath": drawing_path,
                                "drawingName": drawing_name,
                                "relativePath": relative_path,
                                "routeRef": "W1",
                                "routeType": "conductor",
                                "cableType": "CT",
                                "wireFunction": "Trip",
                                "annotateRef": True,
                                "fromStripId": "TB1",
                                "fromTerminal": 1,
                                "toStripId": "TB2",
                                "toTerminal": 1,
                                "routeKey": "project-1::A100::CONDUCTOR::W1",
                                "before": None,
                                "after": "Route W1",
                                "detail": "Insert managed route W1.",
                                "warning": None,
                                "path": [
                                    {"x": 0.0, "y": 0.0},
                                    {"x": 5.0, "y": 0.0},
                                    {"x": 5.0, "y": 5.0},
                                ],
                            },
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-preview"},
                },
            }
        if action == "suite_terminal_authoring_project_apply":
            return {
                "ok": True,
                "id": "acade-apply",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project terminal apply complete",
                    "data": {
                        "changedDrawingCount": 1,
                        "terminalStripUpdateCount": 1,
                        "managedRouteUpsertCount": 1,
                        "drawings": [
                            {
                                "drawingPath": r"C:\dwg\A-100.dwg",
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "stripUpdates": 1,
                                "routeUpserts": 1,
                                "updated": 2,
                                "warnings": [],
                            }
                        ],
                        "changes": [
                            {
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "operationType": "label-upsert",
                                "source": "strip",
                                "stripId": "TB1",
                                "routeRef": "",
                                "before": "1 | 2 | 4",
                                "after": "1 | 2 | 3",
                                "detail": "Update strip TB1 labels.",
                                "status": "applied",
                            },
                            {
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "operationType": "route-insert",
                                "source": "connection",
                                "stripId": "",
                                "routeRef": "W1",
                                "before": "",
                                "after": "Route W1",
                                "detail": "Insert managed route W1.",
                                "status": "applied",
                            },
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-apply"},
                },
            }
        raise AssertionError(f"Unexpected ACADE action {action}")

    def test_preview_rejects_missing_schedule_snapshot(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": r"C:\dwg",
                "stripRows": [{"id": "strip-row-1"}],
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("message"), "Invalid request parameters.")

    def test_preview_forwards_issue_set_scope_and_returns_grouped_drawings(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "scheduleSnapshotId": "schedule-1",
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": r"C:\dwg",
                "projectRootPath": r"C:\project",
                "stripRows": [
                    {
                        "id": "strip-row-1",
                        "drawingPath": "A-100.dwg",
                        "panelId": "P1",
                        "side": "L",
                        "stripId": "TB1",
                        "terminalCount": 3,
                        "labelsCsv": "1;2;3",
                        "labels": ["1", "2", "3"],
                    }
                ],
                "connectionRows": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("operationCount"), 2)
        self.assertEqual(payload.get("drawings")[0]["operationCount"], 2)
        self.assertIn("suite_terminal_authoring_project_preview", self.acade_actions)
        self.assertNotIn("suite_terminal_authoring_project_preview", self.bridge_actions)

    def test_preview_accepts_project_file_under_project_root(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "scheduleSnapshotId": "schedule-1",
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": r"C:\dwg",
                "projectRootPath": self.project_root,
                "acadeProjectFilePath": self.project_file,
                "stripRows": [{"id": "strip-row-1", "drawingPath": "A-100.dwg"}],
                "connectionRows": [],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertNotIn(
            "No AutoCAD Electrical .wdp project file was provided under the project root. ACAD writes can continue, but ACADE context could not be verified.",
            payload.get("warnings") or [],
        )

    def test_preview_warns_when_project_file_is_outside_project_root(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "scheduleSnapshotId": "schedule-1",
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": r"C:\dwg",
                "projectRootPath": self.project_root,
                "acadeProjectFilePath": self.outside_project_file,
                "stripRows": [{"id": "strip-row-1", "drawingPath": "A-100.dwg"}],
                "connectionRows": [],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertIn(
            "No AutoCAD Electrical .wdp project file was provided under the project root. ACAD writes can continue, but ACADE context could not be verified.",
            payload.get("warnings") or [],
        )

    def test_apply_rejects_missing_operations(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-apply",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "scheduleSnapshotId": "schedule-1",
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("message"), "Invalid request parameters.")

    def test_apply_returns_downloadable_report(self) -> None:
        response = self.client.post(
            "/api/conduit-route/terminal-authoring/project-apply",
            headers={"X-API-Key": "valid-key"},
            json={
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "scheduleSnapshotId": "schedule-1",
                "operations": [
                    {
                        "operationId": "strip-op-1",
                        "rowId": "strip-row-1",
                        "source": "strip",
                        "operationType": "label-upsert",
                        "drawingPath": r"C:\dwg\A-100.dwg",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("changedDrawingCount"), 1)
        self.assertTrue(payload.get("reportId"))
        self.assertIn("/api/conduit-route/reports/", payload.get("downloadUrl", ""))
        self.assertIn("suite_terminal_authoring_project_apply", self.acade_actions)
        self.assertNotIn("suite_terminal_authoring_project_apply", self.bridge_actions)

        download = self.client.get(
            f"/api/conduit-route/reports/{payload['reportId']}",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(download.status_code, 200)
        self.assertEqual(
            download.mimetype,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        download.close()


if __name__ == "__main__":
    unittest.main()
