from __future__ import annotations

import os
import shutil
import tempfile
import unittest

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_automation_recipes import (
    STATE_DIRNAME,
    create_automation_recipe_blueprint,
)


class TestApiAutomationRecipes(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="suite-automation-tests-")
        self.api_state_dir = os.path.join(tempfile.gettempdir(), STATE_DIRNAME)
        shutil.rmtree(self.api_state_dir, ignore_errors=True)
        self.drawing_root = os.path.join(self.temp_dir, "drawings")
        self.project_root = os.path.join(self.temp_dir, "project")
        os.makedirs(self.drawing_root, exist_ok=True)
        os.makedirs(self.project_root, exist_ok=True)

        self.drawing_path = os.path.join(self.drawing_root, "A-100.dwg")
        with open(self.drawing_path, "w", encoding="utf-8") as drawing_file:
            drawing_file.write("dummy drawing")
        with open(os.path.join(self.project_root, "demo.wdp"), "w", encoding="utf-8") as project_file:
            project_file.write("A-100\n")

        self.original_appdata = os.environ.get("APPDATA")
        plugin_root = os.path.join(
            self.temp_dir,
            "Roaming",
            "Autodesk",
            "ApplicationPlugins",
            "SuiteCadAuthoring.bundle",
            "Contents",
            "Win64",
        )
        os.makedirs(plugin_root, exist_ok=True)
        for file_name in [
            "SuiteCadAuthoring.dll",
            "SuiteCadAuthoring.deps.json",
            "SuiteCadAuthoring.runtimeconfig.json",
        ]:
            with open(os.path.join(plugin_root, file_name), "w", encoding="utf-8") as handle:
                handle.write("ok")
        with open(
            os.path.join(self.temp_dir, "Roaming", "Autodesk", "ApplicationPlugins", "SuiteCadAuthoring.bundle", "PackageContents.xml"),
            "w",
            encoding="utf-8",
        ) as handle:
            handle.write("<ApplicationPackage />")
        os.environ["APPDATA"] = os.path.join(self.temp_dir, "Roaming")

        self.bridge_actions: list[str] = []
        self.acade_actions: list[str] = []
        self.client = self._create_client()

    def tearDown(self) -> None:
        if self.original_appdata is None:
            os.environ.pop("APPDATA", None)
        else:
            os.environ["APPDATA"] = self.original_appdata
        shutil.rmtree(self.api_state_dir, ignore_errors=True)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_client(self):
        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        def is_valid_api_key(provided_key: str | None) -> bool:
            return provided_key == "valid-key"

        app.register_blueprint(
            create_automation_recipe_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                is_valid_api_key=is_valid_api_key,
                send_autocad_dotnet_command=self._send_autocad_dotnet_command,
                send_autocad_acade_command=self._send_autocad_acade_command,
            )
        )
        return app.test_client()

    def _build_payload(self):
        return {
            "workPackage": {
                "id": "work-package-1",
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "issueSetLabel": "IFC-01 • Package",
                "registerSnapshotId": "register-1",
                "terminalScheduleSnapshotId": "schedule-1",
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": self.drawing_root,
                "projectRootPath": self.project_root,
                "pdfPackageRootPath": os.path.join(self.project_root, "pdf"),
                "titleBlockSnapshotStatus": "ready",
                "titleBlockWarningCount": 0,
                "createdAt": "2026-03-28T00:00:00.000Z",
                "updatedAt": "2026-03-28T00:00:00.000Z",
                "warnings": [],
            },
            "recipe": {
                "id": "recipe-1",
                "projectId": "project-1",
                "issueSetId": "issue-1",
                "workPackageId": "work-package-1",
                "name": "Offline package run",
                "simulateOnCopy": True,
                "createdAt": "2026-03-28T00:00:00.000Z",
                "updatedAt": "2026-03-28T00:00:00.000Z",
                "warnings": [],
                "steps": [
                    {
                        "id": "autodraft-step",
                        "source": "autodraft",
                        "label": "Bluebeam markup authoring",
                        "enabled": True,
                        "ready": True,
                        "actionable": True,
                        "plannedItemCount": 1,
                        "approvedItemCount": 1,
                        "warningCount": 0,
                        "bindingKinds": ["markup"],
                        "summary": "Bluebeam markup preview ready.",
                    },
                    {
                        "id": "autowire-step",
                        "source": "autowire",
                        "label": "Wiring authoring",
                        "enabled": True,
                        "ready": True,
                        "actionable": True,
                        "plannedItemCount": 1,
                        "approvedItemCount": 1,
                        "warningCount": 0,
                        "bindingKinds": ["terminal-wiring"],
                        "summary": "Wiring preview ready.",
                    },
                    {
                        "id": "cad-utils-step",
                        "source": "cad-utils",
                        "label": "CAD utilities",
                        "enabled": True,
                        "ready": True,
                        "actionable": True,
                        "plannedItemCount": 1,
                        "approvedItemCount": 1,
                        "warningCount": 0,
                        "bindingKinds": ["drawing-content"],
                        "summary": "CAD utility preview ready.",
                    },
                ],
            },
            "stepPayloads": {
                "autodraft": {
                    "requestId": "markup-1",
                    "selectedOperationIds": ["markup-op-1"],
                    "markupSnapshots": [
                        {
                            "id": "markup-snapshot-1",
                            "projectId": "project-1",
                            "issueSetId": "issue-1",
                            "drawingPath": "A-100.dwg",
                            "drawingName": "A-100.dwg",
                            "pageIndex": 0,
                            "selectedOperationIds": ["markup-op-1"],
                            "warnings": [],
                            "comparePayload": {
                                "preview_operations": [
                                    {
                                        "id": "markup-op-1",
                                        "operationType": "delta-note-upsert",
                                        "before": None,
                                        "after": "Install new disconnect at MCC section A.",
                                        "detail": "Insert Bluebeam callout note in CAD space.",
                                        "warnings": [],
                                        "approved": True,
                                        "managedKey": {
                                            "source": "autodraft",
                                            "entityKind": "note",
                                            "value": "markup-1:delta-note-upsert",
                                        },
                                        "nativePayload": {
                                            "text": "Install new disconnect at MCC section A.",
                                            "anchorPoint": {"x": 120.0, "y": 45.0},
                                            "contractVersion": "bluebeam-default.v1",
                                        },
                                    }
                                ]
                            },
                        }
                    ],
                },
                "autowire": {
                    "requestId": "wire-1",
                    "scheduleSnapshotId": "schedule-1",
                    "selectedOperationIds": ["strip-op-1"],
                    "stripRows": [
                        {
                            "id": "strip-row-1",
                            "drawingPath": "A-100.dwg",
                            "panelId": "P1",
                            "side": "L",
                            "stripId": "TB1",
                            "terminalCount": 2,
                            "labelsCsv": "1;2",
                            "labels": ["1", "2"],
                        }
                    ],
                    "connectionRows": [],
                },
                "cadUtils": {
                    "requestId": "cad-1",
                    "blockNameHint": "R3P-24x36BORDER&TITLE",
                    "selectedPreviewKeys": [
                        "::".join(
                            [
                                self.drawing_path,
                                "ABCD",
                                "TITLE1",
                                "rule-1",
                                "OLD",
                                "NEW",
                                "0",
                            ]
                        )
                    ],
                    "rules": [
                        {
                            "id": "rule-1",
                            "find": "OLD",
                            "replace": "NEW",
                            "useRegex": False,
                            "matchCase": True,
                        }
                    ],
                },
            },
        }

    def _send_autocad_acade_command(self, action: str, payload: dict[str, object]):
        self.acade_actions.append(action)
        if action == "suite_terminal_authoring_project_preview":
            drawing = (payload.get("drawings") or [])[0]
            drawing_path = str((drawing or {}).get("path") or self.drawing_path)
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Wiring preview ready.",
                    "data": {
                        "operations": [
                            {
                                "operationId": "strip-op-1",
                                "source": "strip",
                                "operationType": "label-upsert",
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "stripId": "TB1",
                                "stripKey": "A100::TB1",
                                "before": "1 | 3",
                                "after": "1 | 2",
                                "detail": "Update strip TB1.",
                            }
                        ]
                    },
                    "warnings": [],
                    "meta": {"requestId": "wire-preview"},
                },
            }
        if action == "suite_batch_find_replace_project_preview":
            drawing = (payload.get("drawings") or [])[0]
            drawing_path = str((drawing or {}).get("path") or self.drawing_path)
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "message": "CAD utility preview ready.",
                    "data": {
                        "matches": [
                            {
                                "file": "A-100.dwg",
                                "line": 0,
                                "ruleId": "rule-1",
                                "handle": "ABCD",
                                "entityType": "AttributeReference",
                                "attributeTag": "TITLE1",
                                "before": "OLD",
                                "after": "NEW",
                                "currentValue": "OLD",
                                "nextValue": "NEW",
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                            }
                        ]
                    },
                    "warnings": [],
                    "meta": {"requestId": "cad-preview"},
                },
            }
        if action == "suite_markup_authoring_project_apply":
            operation = (payload.get("operations") or [])[0]
            drawing_path = str((operation or {}).get("drawingPath") or self.drawing_path)
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Bluebeam markup apply completed.",
                    "data": {
                        "changedDrawingCount": 1,
                        "changedItemCount": 1,
                        "drawings": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "updated": 1,
                                "warnings": [],
                            }
                        ],
                        "changes": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "markupSnapshotId": "markup-snapshot-1",
                                "operationId": "markup-op-1",
                                "operationType": "delta-note-upsert",
                                "managedKey": "markup-1:delta-note-upsert",
                                "before": "",
                                "after": "Install new disconnect at MCC section A.",
                                "detail": "Insert Bluebeam callout note in CAD space.",
                                "status": "applied",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "markup-apply"},
                },
            }
        if action == "suite_terminal_authoring_project_apply":
            operation = (payload.get("operations") or [])[0]
            drawing_path = str((operation or {}).get("drawingPath") or self.drawing_path)
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Wiring apply completed.",
                    "data": {
                        "changedDrawingCount": 1,
                        "terminalStripUpdateCount": 1,
                        "managedRouteUpsertCount": 0,
                        "drawings": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "stripUpdates": 1,
                                "routeUpserts": 0,
                                "updated": 1,
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
                                "before": "1 | 3",
                                "after": "1 | 2",
                                "detail": "Update strip TB1.",
                                "status": "applied",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "wire-apply"},
                },
            }
        if action == "suite_batch_find_replace_project_apply":
            match = (payload.get("matches") or [])[0]
            drawing_path = str((match or {}).get("drawingPath") or self.drawing_path)
            return {
                "ok": True,
                "result": {
                    "success": True,
                    "message": "CAD utility apply completed.",
                    "data": {
                        "updated": 1,
                        "changedDrawingCount": 1,
                        "changedItemCount": 1,
                        "drawings": [
                            {
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "updated": 1,
                                "skipped": 0,
                                "warnings": [],
                            }
                        ],
                        "changes": [
                            {
                                "file": "A-100.dwg",
                                "drawingPath": drawing_path,
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                                "ruleId": "rule-1",
                                "before": "OLD",
                                "after": "NEW",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "cad-apply"},
                },
            }
        raise AssertionError(f"Unexpected ACADE action {action}")

    def _send_autocad_dotnet_command(self, action: str, payload: dict[str, object]):
        self.bridge_actions.append(action)
        raise AssertionError(f"Unexpected bridge action {action}")

    def test_preflight_reports_ready_scope(self) -> None:
        response = self.client.post(
            "/api/cad/preflight/project-scope",
            headers={"X-API-Key": "valid-key"},
            json=self._build_payload(),
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("resolvedDrawingCount"), 1)
        self.assertTrue(payload.get("pluginReady"))

    def test_preflight_blocks_missing_issue_set(self) -> None:
        payload = self._build_payload()
        payload["workPackage"]["issueSetId"] = None

        response = self.client.post(
            "/api/cad/preflight/project-scope",
            headers={"X-API-Key": "valid-key"},
            json=payload,
        )
        self.assertEqual(response.status_code, 200)
        body = response.get_json() or {}
        self.assertTrue(body.get("success"))
        self.assertFalse(body.get("ok"))
        self.assertIn(
            "Offline automation recipes must be anchored to a selected issue set.",
            body.get("blockers") or [],
        )

    def test_recipe_preview_returns_combined_operations(self) -> None:
        response = self.client.post(
            "/api/automation-recipes/preview",
            headers={"X-API-Key": "valid-key"},
            json=self._build_payload(),
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(len(payload.get("operations") or []), 3)
        self.assertIn("suite_terminal_authoring_project_preview", self.acade_actions)
        self.assertIn("suite_batch_find_replace_project_preview", self.acade_actions)
        self.assertNotIn("suite_terminal_authoring_project_preview", self.bridge_actions)
        self.assertNotIn("suite_batch_find_replace_project_preview", self.bridge_actions)

    def test_recipe_apply_verify_and_download_report(self) -> None:
        preview = self.client.post(
            "/api/automation-recipes/preview",
            headers={"X-API-Key": "valid-key"},
            json=self._build_payload(),
        ).get_json()
        payload = self._build_payload()
        payload["operations"] = preview["operations"]

        apply_response = self.client.post(
            "/api/automation-recipes/apply",
            headers={"X-API-Key": "valid-key"},
            json=payload,
        )
        self.assertEqual(apply_response.status_code, 200)
        apply_payload = apply_response.get_json() or {}
        self.assertTrue(apply_payload.get("success"))
        self.assertTrue(apply_payload.get("runId"))
        self.assertTrue(apply_payload.get("reportId"))
        self.assertIn("suite_markup_authoring_project_apply", self.acade_actions)
        self.assertNotIn("suite_markup_authoring_project_apply", self.bridge_actions)
        self.assertIn("suite_terminal_authoring_project_apply", self.acade_actions)
        self.assertNotIn("suite_terminal_authoring_project_apply", self.bridge_actions)
        self.assertIn("suite_batch_find_replace_project_apply", self.acade_actions)
        self.assertNotIn("suite_batch_find_replace_project_apply", self.bridge_actions)

        verify_response = self.client.post(
            "/api/automation-recipes/verify",
            headers={"X-API-Key": "valid-key"},
            json={"runId": apply_payload["runId"]},
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_payload = verify_response.get_json() or {}
        self.assertTrue(verify_payload.get("verified"))
        self.assertGreaterEqual(len(verify_payload.get("artifacts") or []), 3)

        download_response = self.client.get(
            f"/api/cad/reports/{apply_payload['reportId']}",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(download_response.status_code, 200)
        download_response.close()

    def test_run_and_report_state_survive_blueprint_rebuild(self) -> None:
        preview = self.client.post(
            "/api/automation-recipes/preview",
            headers={"X-API-Key": "valid-key"},
            json=self._build_payload(),
        ).get_json()
        payload = self._build_payload()
        payload["operations"] = preview["operations"]

        apply_response = self.client.post(
            "/api/automation-recipes/apply",
            headers={"X-API-Key": "valid-key"},
            json=payload,
        )
        self.assertEqual(apply_response.status_code, 200)
        apply_payload = apply_response.get_json() or {}

        rebuilt_client = self._create_client()

        verify_response = rebuilt_client.post(
            "/api/automation-recipes/verify",
            headers={"X-API-Key": "valid-key"},
            json={"runId": apply_payload["runId"]},
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_payload = verify_response.get_json() or {}
        self.assertTrue(verify_payload.get("success"))

        download_response = rebuilt_client.get(
            f"/api/cad/reports/{apply_payload['reportId']}",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(download_response.status_code, 200)
        download_response.close()

    def test_recipe_apply_rejects_missing_issue_set(self) -> None:
        payload = self._build_payload()
        payload["workPackage"]["issueSetId"] = ""
        payload["operations"] = [
            {
                "id": "strip-op-1",
                "source": "autowire",
                "operationType": "label-upsert",
                "drawingPath": self.drawing_path,
                "approved": True,
                "nativePayload": {
                    "operationId": "strip-op-1",
                    "drawingPath": self.drawing_path,
                },
            }
        ]

        response = self.client.post(
            "/api/automation-recipes/apply",
            headers={"X-API-Key": "valid-key"},
            json=payload,
        )
        self.assertEqual(response.status_code, 400)
        body = response.get_json() or {}
        self.assertFalse(body.get("success"))
        self.assertEqual(
            body.get("error"),
            "Recipe apply is blocked by preflight findings.",
        )
        self.assertIn(
            "Offline automation recipes must be anchored to a selected issue set.",
            body.get("blockers") or [],
        )

    def test_acade_reconcile_reports_project_file(self) -> None:
        response = self.client.post(
            "/api/acade/reconcile/project-scope",
            headers={"X-API-Key": "valid-key"},
            json=self._build_payload(),
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertTrue(payload.get("acadeProjectFilePath"))


if __name__ == "__main__":
    unittest.main()
