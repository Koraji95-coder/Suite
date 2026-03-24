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
            )
        )

        self.client = app.test_client()
        self.bridge_actions: list[str] = []

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
            return {
                "ok": True,
                "id": "bridge-apply",
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
        raise AssertionError(f"Unexpected bridge action {action}")

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

    def test_cad_preview_routes_to_bridge(self) -> None:
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
        self.assertIn("suite_batch_find_replace_preview", self.bridge_actions)

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
        self.assertIn("suite_batch_find_replace_apply", self.bridge_actions)
        response.close()


if __name__ == "__main__":
    unittest.main()
