from __future__ import annotations

import io
import json
import unittest

from flask import Flask
from flask_limiter import Limiter

from backend.route_groups.api_batch_find_replace import create_batch_find_replace_blueprint


class TestApiBatchFindReplace(unittest.TestCase):
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

        def is_valid_api_key(provided_key: str | None) -> bool:
            return provided_key == "valid-key"

        app.register_blueprint(
            create_batch_find_replace_blueprint(
                limiter=limiter,
                logger=app.logger,
                is_valid_api_key=is_valid_api_key,
                api_key="very-secure-test-key",
                schedule_cleanup=lambda _path: None,
                batch_session_cookie="bfr_session",
                batch_session_ttl_seconds=3600,
                send_autocad_dotnet_command=self._send_autocad_dotnet_command,
                send_autocad_acade_command=self._send_autocad_acade_command,
            )
        )

        self.client = app.test_client()
        self.bridge_actions: list[str] = []
        self.acade_actions: list[str] = []

    def _send_autocad_dotnet_command(self, action: str, payload: dict[str, object]):
        self.bridge_actions.append(action)
        if action == "suite_batch_find_replace_preview":
            return {
                "ok": True,
                "id": "bridge-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "preview ready",
                    "data": {
                        "drawingName": "demo.dwg",
                        "matches": [
                            {
                                "file": "demo.dwg",
                                "line": 0,
                                "ruleId": "rule-1",
                                "handle": "ABCD",
                                "entityType": "AttributeReference",
                                "attributeTag": "TITLE1",
                                "before": "OLD",
                                "after": "NEW",
                                "currentValue": "OLD",
                                "nextValue": "NEW",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-preview"},
                },
            }
        if action == "suite_batch_find_replace_apply":
            raise AssertionError("CAD batch apply should not be routed through the bridge sender.")
        if action == "suite_batch_find_replace_project_preview":
            return {
                "ok": True,
                "id": "bridge-project-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project preview ready",
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
                                "drawingPath": r"C:\dwg\A-100.dwg",
                                "drawingName": "A-100.dwg",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-project-preview"},
                },
            }
        if action == "suite_batch_find_replace_project_apply":
            raise AssertionError("Project CAD batch apply should not be routed through the bridge sender.")
        raise AssertionError(f"Unexpected bridge action {action}")

    def _send_autocad_acade_command(self, action: str, payload: dict[str, object]):
        self.acade_actions.append(action)
        if action == "suite_batch_find_replace_preview":
            return {
                "ok": True,
                "id": "acade-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "preview ready",
                    "data": {
                        "drawingName": "demo.dwg",
                        "matches": [
                            {
                                "file": "demo.dwg",
                                "line": 0,
                                "ruleId": "rule-1",
                                "handle": "ABCD",
                                "entityType": "AttributeReference",
                                "attributeTag": "TITLE1",
                                "before": "OLD",
                                "after": "NEW",
                                "currentValue": "OLD",
                                "nextValue": "NEW",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-preview"},
                },
            }
        if action == "suite_batch_find_replace_project_preview":
            return {
                "ok": True,
                "id": "acade-project-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project preview ready",
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
                                "drawingPath": r"C:\dwg\A-100.dwg",
                                "drawingName": "A-100.dwg",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-project-preview"},
                },
            }
        if action == "suite_batch_find_replace_apply":
            return {
                "ok": True,
                "id": "acade-apply",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "apply complete",
                    "data": {
                        "drawingName": "demo.dwg",
                        "updated": 1,
                        "changes": [
                            {
                                "file": "demo.dwg",
                                "line": 0,
                                "ruleId": "rule-1",
                                "before": "OLD",
                                "after": "NEW",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-apply"},
                },
            }
        if action == "suite_drawing_cleanup_preview":
            request_id = str(payload.get("requestId") or "cleanup-preview-req")
            return {
                "ok": True,
                "id": "acade-cleanup-preview",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "cleanup preview ready",
                    "requestId": request_id,
                    "data": {
                        "summary": {
                            "entryMode": "import_file",
                            "preset": "import_full",
                            "deterministicCandidateCount": 3,
                            "reviewCandidateCount": 2,
                            "layerCandidateCount": 1,
                            "blockCandidateCount": 1,
                            "textCandidateCount": 1,
                            "textLayerReviewCount": 1,
                            "overlapReviewCount": 1,
                            "appliedDeterministicCount": 0,
                            "appliedReviewCount": 0,
                            "saved": False,
                            "appliedLayerChanges": 0,
                            "appliedBlockChanges": 0,
                            "appliedTextChanges": 0,
                            "appliedTextLayerReviewChanges": 0,
                            "appliedOverlapReviewChanges": 0,
                        },
                        "deterministicFixes": [
                            {
                                "id": "normalize_layers",
                                "label": "Normalize layers",
                                "description": "Move obvious imported entities to normalized layers.",
                                "count": 4,
                                "selected": True,
                                "kind": "deterministic",
                            }
                        ],
                        "reviewQueue": [
                            {
                                "id": "review_overlaps",
                                "label": "Review overlaps",
                                "description": "Manual review is required for overlap candidates.",
                                "count": 2,
                                "selected": False,
                                "kind": "review",
                            }
                        ],
                        "drawing": {
                            "name": "dirty-export.dwg",
                            "path": r"C:\incoming\dirty-export.dxf",
                            "outputPath": r"C:\incoming\dirty-export.cleaned.dwg",
                            "saveDrawing": True,
                        },
                    },
                    "warnings": ["Review overlaps before apply."],
                    "meta": {"requestId": request_id},
                },
            }
        if action == "suite_drawing_cleanup_apply":
            request_id = str(payload.get("requestId") or "cleanup-apply-req")
            return {
                "ok": True,
                "id": "acade-cleanup-apply",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "cleanup apply complete",
                    "requestId": request_id,
                    "data": {
                        "summary": {
                            "entryMode": "import_file",
                            "preset": "import_full",
                            "deterministicCandidateCount": 3,
                            "reviewCandidateCount": 2,
                            "layerCandidateCount": 1,
                            "blockCandidateCount": 1,
                            "textCandidateCount": 1,
                            "textLayerReviewCount": 1,
                            "overlapReviewCount": 1,
                            "appliedDeterministicCount": 1,
                            "appliedReviewCount": 1,
                            "saved": True,
                            "appliedLayerChanges": 3,
                            "appliedBlockChanges": 1,
                            "appliedTextChanges": 2,
                            "appliedTextLayerReviewChanges": 1,
                            "appliedOverlapReviewChanges": 1,
                        },
                        "deterministicFixes": [
                            {
                                "id": "normalize_layers",
                                "label": "Normalize layers",
                                "description": "Move obvious imported entities to normalized layers.",
                                "count": 4,
                                "selected": True,
                                "kind": "deterministic",
                            }
                        ],
                        "reviewQueue": [
                            {
                                "id": "review_overlaps",
                                "label": "Review overlaps",
                                "description": "Manual review is required for overlap candidates.",
                                "count": 2,
                                "selected": True,
                                "kind": "review",
                            }
                        ],
                        "drawing": {
                            "name": "dirty-export.dwg",
                            "path": r"C:\incoming\dirty-export.dxf",
                            "outputPath": r"C:\incoming\dirty-export.cleaned.dwg",
                            "saveDrawing": True,
                        },
                    },
                    "warnings": [],
                    "meta": {"requestId": request_id},
                },
            }
        if action == "suite_batch_find_replace_project_apply":
            return {
                "ok": True,
                "id": "acade-project-apply",
                "result": {
                    "success": True,
                    "code": "",
                    "message": "project apply complete",
                    "data": {
                        "updated": 1,
                        "changedDrawingCount": 1,
                        "changedItemCount": 1,
                        "drawings": [
                            {
                                "drawingPath": r"C:\dwg\A-100.dwg",
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
                                "line": 0,
                                "ruleId": "rule-1",
                                "before": "OLD",
                                "after": "NEW",
                                "drawingPath": r"C:\dwg\A-100.dwg",
                                "drawingName": "A-100.dwg",
                                "relativePath": "A-100.dwg",
                            }
                        ],
                    },
                    "warnings": [],
                    "meta": {"requestId": "req-project-apply"},
                },
            }
        raise AssertionError(f"Unexpected ACADE action {action}")

    def test_preview_requires_api_key_or_batch_session(self) -> None:
        response = self.client.post("/api/batch-find-replace/preview")
        self.assertEqual(response.status_code, 401)
        payload = response.get_json() or {}
        self.assertEqual(payload.get("code"), "AUTH_REQUIRED")

    def test_preview_rejects_invalid_rules_json(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/preview",
            headers={"X-API-Key": "valid-key"},
            data={
                "rules": "{not-json",
                "files": (io.BytesIO(b"line one"), "demo.txt"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("not valid JSON", str(payload.get("error")))

    def test_preview_rejects_invalid_regex_rule(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/preview",
            headers={"X-API-Key": "valid-key"},
            data={
                "rules": json.dumps(
                    [
                        {
                            "id": "broken-regex",
                            "find": "(",
                            "replace": "x",
                            "useRegex": True,
                            "matchCase": False,
                        }
                    ]
                ),
                "files": (io.BytesIO(b"sample"), "demo.txt"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("Invalid regex", str(payload.get("error")))

    def test_cad_preview_routes_to_acade_host(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "rules": [
                    {
                        "id": "rule-1",
                        "find": "OLD",
                        "replace": "NEW",
                        "useRegex": False,
                        "matchCase": True,
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("matchCount"), 1)
        self.assertIn("suite_batch_find_replace_preview", self.acade_actions)
        self.assertNotIn("suite_batch_find_replace_preview", self.bridge_actions)

    def test_cad_apply_downloads_excel_report(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/apply",
            headers={"X-API-Key": "valid-key"},
            json={
                "matches": [
                    {
                        "ruleId": "rule-1",
                        "handle": "ABCD",
                        "entityType": "AttributeReference",
                        "attributeTag": "TITLE1",
                        "currentValue": "OLD",
                        "nextValue": "NEW",
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.mimetype,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("suite_batch_find_replace_apply", self.acade_actions)
        self.assertNotIn("suite_batch_find_replace_apply", self.bridge_actions)
        response.close()

    def test_drawing_cleanup_preview_routes_to_acade_host(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/cleanup-preview",
            headers={"X-API-Key": "valid-key", "X-Request-ID": "cleanup-preview-req"},
            json={
                "entryMode": "import_file",
                "preset": "import_full",
                "sourcePath": r"C:\incoming\dirty-export.dxf",
                "saveDrawing": True,
                "timeoutMs": 120000,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("requestId"), "cleanup-preview-req")
        self.assertEqual(
            (payload.get("meta") or {}).get("requestId"),
            "cleanup-preview-req",
        )
        self.assertEqual(
            (payload.get("data") or {}).get("drawing", {}).get("outputPath"),
            r"C:\incoming\dirty-export.cleaned.dwg",
        )
        self.assertIn("suite_drawing_cleanup_preview", self.acade_actions)
        self.assertNotIn("suite_drawing_cleanup_preview", self.bridge_actions)

    def test_drawing_cleanup_apply_routes_to_acade_host(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/cleanup-apply",
            headers={"X-API-Key": "valid-key", "X-Request-ID": "cleanup-apply-req"},
            json={
                "entryMode": "import_file",
                "preset": "import_full",
                "sourcePath": r"C:\incoming\dirty-export.dxf",
                "saveDrawing": True,
                "timeoutMs": 120000,
                "selectedFixIds": ["normalize_layers"],
                "approvedReviewIds": ["review_overlaps"],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("requestId"), "cleanup-apply-req")
        self.assertEqual(
            (payload.get("meta") or {}).get("requestId"),
            "cleanup-apply-req",
        )
        self.assertTrue((payload.get("data") or {}).get("summary", {}).get("saved"))
        self.assertIn("suite_drawing_cleanup_apply", self.acade_actions)
        self.assertNotIn("suite_drawing_cleanup_apply", self.bridge_actions)

    def test_project_cad_preview_resolves_issue_set_drawings(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/project-preview",
            headers={"X-API-Key": "valid-key"},
            json={
                "rules": [
                    {
                        "id": "rule-1",
                        "find": "OLD",
                        "replace": "NEW",
                        "useRegex": False,
                        "matchCase": True,
                    }
                ],
                "selectedDrawingPaths": ["A-100.dwg"],
                "drawingRootPath": r"C:\dwg",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("matchCount"), 1)
        self.assertEqual(payload.get("drawings")[0]["matchCount"], 1)
        self.assertEqual(payload.get("matches")[0]["relativePath"], "A-100.dwg")
        self.assertIn("suite_batch_find_replace_project_preview", self.acade_actions)
        self.assertNotIn("suite_batch_find_replace_project_preview", self.bridge_actions)

    def test_project_cad_apply_returns_downloadable_report_metadata(self) -> None:
        response = self.client.post(
            "/api/batch-find-replace/cad/project-apply",
            headers={"X-API-Key": "valid-key"},
            json={
                "matches": [
                    {
                        "ruleId": "rule-1",
                        "handle": "ABCD",
                        "entityType": "AttributeReference",
                        "attributeTag": "TITLE1",
                        "currentValue": "OLD",
                        "nextValue": "NEW",
                        "drawingPath": r"C:\dwg\A-100.dwg",
                        "drawingName": "A-100.dwg",
                        "relativePath": "A-100.dwg",
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("changedDrawingCount"), 1)
        self.assertTrue(payload.get("reportId"))
        self.assertIn("/api/batch-find-replace/reports/", payload.get("downloadUrl", ""))
        self.assertIn("suite_batch_find_replace_project_apply", self.acade_actions)
        self.assertNotIn("suite_batch_find_replace_project_apply", self.bridge_actions)

        download = self.client.get(
            f"/api/batch-find-replace/reports/{payload['reportId']}",
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
