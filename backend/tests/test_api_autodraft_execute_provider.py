from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from flask import Flask, jsonify, request
from flask_limiter import Limiter

from backend.route_groups.api_autodraft import create_autodraft_blueprint


def _build_valid_action() -> dict[str, object]:
    return {
        "id": "action-1",
        "rule_id": "delete-green-cloud",
        "category": "DELETE",
        "action": "Delete the marked geometry.",
        "confidence": 0.91,
        "status": "proposed",
        "markup": {
            "type": "cloud",
            "color": "green",
            "text": "delete line",
            "bounds": {"x": 10, "y": 10, "width": 40, "height": 20},
        },
    }


def _build_title_block_action(*, text: str = "Revision") -> dict[str, object]:
    return {
        "id": "action-title-1",
        "rule_id": "title-block-rect",
        "category": "TITLE_BLOCK",
        "action": "Extract metadata only; skip geometry conversion",
        "confidence": 0.97,
        "status": "proposed",
        "markup": {
            "type": "text",
            "color": "blue",
            "text": text,
            "bounds": {"x": 120, "y": 12, "width": 24, "height": 8},
            "meta": {
                "page_zone": "bottom-right",
                "cad_transform_applied": True,
            },
        },
    }


class TestApiAutoDraftExecuteProvider(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._temp_dir = tempfile.TemporaryDirectory()
        self._receipts_env = patch.dict(
            os.environ,
            {
                "SUITE_AUTODRAFT_RECEIPTS_DB": os.path.join(
                    self._temp_dir.name,
                    "autodraft-execution-receipts.sqlite3",
                )
            },
            clear=False,
        )
        self._receipts_env.start()

    def tearDown(self) -> None:
        self._receipts_env.stop()
        self._temp_dir.cleanup()
        super().tearDown()

    def _build_client(
        self,
        *,
        execute_provider: str,
        dotnet_url: str = "",
        send_autodraft_dotnet_command=None,
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

        def require_api_key(f):
            def wrapped(*args, **kwargs):
                if request.headers.get("X-API-Key") != "valid-key":
                    return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        logger = Mock()
        app.register_blueprint(
            create_autodraft_blueprint(
                require_api_key=require_api_key,
                limiter=limiter,
                logger=logger,
                autodraft_dotnet_api_url=dotnet_url,
                autodraft_execute_provider=execute_provider,
                send_autodraft_dotnet_command=send_autodraft_dotnet_command,
                get_manager=None,
            )
        )
        return app.test_client()

    def test_execute_uses_bridge_when_enabled(self) -> None:
        def _bridge_sender(action: str, payload: dict[str, object]) -> dict[str, object]:
            self.assertEqual(action, "autodraft_execute")
            self.assertEqual(payload.get("requestId"), "req-bridge-1")
            self.assertEqual(
                payload.get("workflow_context"),
                {"project_id": "project-1", "lane": "autodraft-studio"},
            )
            self.assertEqual(
                payload.get("revision_context"),
                {"project_id": "project-1", "drawing_number": "E-101"},
            )
            return {
                "id": "bridge-job-1",
                "ok": True,
                "result": {
                    "success": True,
                    "message": "CAD preflight complete.",
                    "data": {
                        "jobId": "autodraft-bridge-1",
                        "status": "preflight-only",
                        "accepted": 1,
                        "skipped": 0,
                        "dryRun": True,
                        "message": "CAD preflight complete.",
                    },
                    "meta": {"source": "dotnet", "requestId": "req-bridge-1"},
                    "warnings": ["CAD writes are disabled in bridge mode."],
                },
            }

        client = self._build_client(
            execute_provider="dotnet_bridge",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        response = client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-bridge-1",
                "actions": [_build_valid_action()],
                "dry_run": True,
                "workflow_context": {
                    "project_id": "project-1",
                    "lane": "autodraft-studio",
                },
                "revision_context": {
                    "project_id": "project-1",
                    "drawing_number": "E-101",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("source"), "dotnet-bridge")
        self.assertEqual(payload.get("job_id"), "autodraft-bridge-1")
        self.assertEqual(payload.get("status"), "preflight-only")
        self.assertEqual(payload.get("accepted"), 1)
        self.assertEqual(payload.get("skipped"), 0)
        self.assertEqual(payload.get("requestId"), "req-bridge-1")
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "dotnet_bridge")
        self.assertEqual(
            payload.get("meta", {}).get("executionReceipt", {}).get("requestId"),
            "req-bridge-1",
        )
        self.assertEqual(
            payload.get("meta", {}).get("executionReceipt", {}).get("workflowContext"),
            {"project_id": "project-1", "lane": "autodraft-studio"},
        )

    def test_execute_returns_bridge_error_without_fallback(self) -> None:
        def _bridge_sender(_action: str, _payload: dict[str, object]) -> dict[str, object]:
            raise RuntimeError("bridge unavailable")

        client = self._build_client(
            execute_provider="dotnet_bridge",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        response = client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-bridge-2",
                "actions": [_build_valid_action()],
                "dry_run": True,
            },
        )
        self.assertEqual(response.status_code, 502)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("ok", True))
        self.assertEqual(payload.get("code"), "AUTODRAFT_UPSTREAM_ERROR")
        self.assertEqual(payload.get("requestId"), "req-bridge-2")
        self.assertEqual(payload.get("meta", {}).get("provider_path"), "dotnet_bridge")

    def test_execute_falls_back_to_api_when_configured(self) -> None:
        def _bridge_sender(_action: str, _payload: dict[str, object]) -> dict[str, object]:
            raise RuntimeError("bridge unavailable")

        client = self._build_client(
            execute_provider="dotnet_bridge_fallback_api",
            dotnet_url="http://127.0.0.1:5275",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        upstream_response = Mock()
        upstream_response.ok = True
        upstream_response.status_code = 200
        upstream_response.json.return_value = {
            "ok": True,
            "job_id": "api-job-1",
            "status": "dry-run",
            "accepted": 1,
            "skipped": 0,
            "dry_run": True,
            "message": "Upstream .NET API accepted the request.",
        }

        with patch(
            "backend.route_groups.api_autodraft.requests.request",
            return_value=upstream_response,
        ) as request_mock:
            response = client.post(
                "/api/autodraft/execute",
                headers={"X-API-Key": "valid-key"},
                json={
                    "requestId": "req-bridge-3",
                    "actions": [_build_valid_action()],
                    "dry_run": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("source"), "dotnet")
        self.assertEqual(payload.get("job_id"), "api-job-1")
        self.assertEqual(payload.get("meta", {}).get("providerPath"), "dotnet_api")
        request_mock.assert_called_once()

    def test_execute_normalizes_bridge_commit_response(self) -> None:
        def _bridge_sender(_action: str, payload: dict[str, object]) -> dict[str, object]:
            self.assertEqual(payload.get("requestId"), "req-bridge-commit-1")
            self.assertEqual(payload.get("dry_run"), False)
            return {
                "id": "bridge-job-commit-1",
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Commit completed in 'sample.dwg'. 1 action(s) were written.",
                    "data": {
                        "jobId": "autodraft-bridge-commit-1",
                        "status": "committed",
                        "accepted": 1,
                        "skipped": 0,
                        "dryRun": False,
                        "mode": "commit",
                        "previewReady": 1,
                        "message": "Commit completed in 'sample.dwg'. 1 action(s) were written.",
                        "cad": {
                            "available": True,
                            "drawingName": "sample.dwg",
                            "drawingPath": r"C:\Drawings\sample.dwg",
                            "commandStateAvailable": True,
                            "readOnly": False,
                        },
                        "commit": {
                            "requested": True,
                            "committed": 1,
                            "createdHandles": ["1A2B"],
                            "notesLayer": "SUITE_AUTODRAFT_NOTES",
                        },
                    },
                    "meta": {"source": "dotnet", "requestId": "req-bridge-commit-1"},
                    "warnings": [],
                },
            }

        client = self._build_client(
            execute_provider="dotnet_bridge",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        response = client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-bridge-commit-1",
                "actions": [_build_valid_action()],
                "dry_run": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("status"), "committed")
        self.assertFalse(payload.get("dry_run", True))
        self.assertEqual(payload.get("accepted"), 1)
        self.assertEqual(payload.get("meta", {}).get("cad", {}).get("drawingName"), "sample.dwg")
        self.assertEqual(payload.get("meta", {}).get("commit", {}).get("committed"), 1)
        self.assertEqual(
            payload.get("meta", {}).get("executionReceipt", {}).get("providerPath"),
            "dotnet_bridge",
        )

    def test_execute_prepares_title_block_targets_for_bridge(self) -> None:
        def _bridge_sender(_action: str, payload: dict[str, object]) -> dict[str, object]:
            actions = payload.get("actions")
            self.assertIsInstance(actions, list)
            assert isinstance(actions, list)
            target = actions[0].get("execute_target") if isinstance(actions[0], dict) else None
            self.assertEqual(
                target,
                {
                    "kind": "title_block_attribute",
                    "field_key": "revision",
                    "attribute_tags": ["REV", "REVISION", "REV_NO", "CURRENT_REV", "SHEET_REV"],
                    "target_value": "B",
                    "block_name_hint": None,
                    "layout_hint": None,
                },
            )
            return {
                "id": "bridge-job-title-1",
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Preview complete.",
                    "data": {
                        "jobId": "autodraft-title-1",
                        "status": "preview-ready",
                        "accepted": 1,
                        "skipped": 0,
                        "dryRun": True,
                        "message": "Preview complete.",
                    },
                    "meta": {"source": "dotnet", "requestId": "req-title-target-1"},
                    "warnings": [],
                },
            }

        client = self._build_client(
            execute_provider="dotnet_bridge",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        response = client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-title-target-1",
                "actions": [_build_title_block_action()],
                "dry_run": True,
                "revision_context": {
                    "revision": "B",
                },
            },
        )
        self.assertEqual(response.status_code, 200)

    def test_execute_leaves_title_block_without_target_when_context_missing(self) -> None:
        def _bridge_sender(_action: str, payload: dict[str, object]) -> dict[str, object]:
            actions = payload.get("actions")
            self.assertIsInstance(actions, list)
            assert isinstance(actions, list)
            first = actions[0]
            self.assertIsInstance(first, dict)
            assert isinstance(first, dict)
            self.assertNotIn("execute_target", first)
            return {
                "id": "bridge-job-title-2",
                "ok": True,
                "result": {
                    "success": True,
                    "message": "Preview requires title-block target metadata.",
                    "data": {
                        "jobId": "autodraft-title-2",
                        "status": "preview-review",
                        "accepted": 0,
                        "skipped": 1,
                        "dryRun": True,
                        "message": "Preview requires title-block target metadata.",
                    },
                    "meta": {"source": "dotnet", "requestId": "req-title-target-2"},
                    "warnings": [],
                },
            }

        client = self._build_client(
            execute_provider="dotnet_bridge",
            send_autodraft_dotnet_command=_bridge_sender,
        )

        response = client.post(
            "/api/autodraft/execute",
            headers={"X-API-Key": "valid-key"},
            json={
                "requestId": "req-title-target-2",
                "actions": [_build_title_block_action(text="Revision")],
                "dry_run": True,
            },
        )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
