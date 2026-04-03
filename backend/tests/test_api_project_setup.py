from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_project_setup import create_project_setup_blueprint


class _ResponseStub:
    def __init__(self, status_code: int, payload, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = b"" if payload is None else b"json"

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self) -> None:
        self.get_response = _ResponseStub(200, [])
        self.post_response = _ResponseStub(200, [])
        self.last_get = None
        self.last_post = None

    def get(self, url, headers=None, params=None, timeout=None):
        self.last_get = {
            "url": url,
            "headers": headers,
            "params": params,
            "timeout": timeout,
        }
        return self.get_response

    def post(self, url, headers=None, params=None, json=None, timeout=None):
        self.last_post = {
            "url": url,
            "headers": headers,
            "params": params,
            "json": json,
            "timeout": timeout,
        }
        return self.post_response


class TestApiProjectSetup(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name)
        (self.project_root / "R3P-25074-E6-0001 MAIN.dwg").write_text(
            "",
            encoding="utf-8",
        )
        self.requests_stub = _RequestsStub()

        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        limiter = Limiter(
            app=self.app,
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

        self.app.register_blueprint(
            create_project_setup_blueprint(
                limiter=limiter,
                logger=self.app.logger,
                require_supabase_user=require_supabase_user,
                api_key="test-secret",
                supabase_url="http://supabase.test",
                supabase_api_key="sb-key",
                requests_module=self.requests_stub,
            )
        )
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_ticket_issue_returns_signed_ticket(self) -> None:
        response = self.client.post(
            "/api/project-setup/tickets",
            json={
                "action": "scan-root",
                "requestId": "req-123",
                "origin": "http://127.0.0.1:5173",
                "projectId": "project-1",
                "ttlSeconds": 60,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["action"], "scan-root")
        self.assertEqual(payload["requestId"], "req-123")
        self.assertEqual(payload["projectId"], "project-1")
        self.assertIn(".", payload["ticket"])

    def test_profile_get_returns_default_when_storage_missing(self) -> None:
        self.requests_stub.get_response = _ResponseStub(
            404,
            {"message": 'relation "project_title_block_profiles" does not exist'},
            text='relation "project_title_block_profiles" does not exist',
        )

        response = self.client.get(
            "/api/project-setup/projects/project-1/profile?projectRootPath=C:/Projects/Demo",
            headers={"Authorization": "Bearer token-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["project_id"], "project-1")
        self.assertEqual(payload["data"]["project_root_path"], "C:/Projects/Demo")
        self.assertEqual(payload["data"]["block_name"], "R3P-24x36BORDER&TITLE")

    def test_profile_put_persists_backend_owned_profile(self) -> None:
        self.requests_stub.post_response = _ResponseStub(
            201,
            [
                {
                    "id": "profile-1",
                    "project_id": "project-1",
                    "user_id": "user-1",
                    "block_name": "R3P-24x36BORDER&TITLE",
                    "project_root_path": "C:/Projects/Demo",
                    "acade_project_file_path": "C:/Projects/Demo/demo.wdp",
                    "acade_line1": "Client",
                    "acade_line2": "Site",
                    "acade_line4": "25074",
                    "signer_drawn_by": "DW",
                    "signer_checked_by": "QC",
                    "signer_engineer": "PE",
                }
            ],
        )

        response = self.client.put(
            "/api/project-setup/projects/project-1/profile",
            headers={"Authorization": "Bearer token-1"},
            json={
                "blockName": "R3P-24x36BORDER&TITLE",
                "projectRootPath": "C:/Projects/Demo",
                "acadeProjectFilePath": "C:/Projects/Demo/demo.wdp",
                "acadeLine1": "Client",
                "acadeLine2": "Site",
                "acadeLine4": "25074",
                "signerDrawnBy": "DW",
                "signerCheckedBy": "QC",
                "signerEngineer": "PE",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["project_root_path"], "C:/Projects/Demo")
        self.assertEqual(
            self.requests_stub.last_post["json"]["acade_project_file_path"],
            "C:/Projects/Demo/demo.wdp",
        )

    def test_preview_builds_rows_from_scan_snapshot(self) -> None:
        drawing_path = str((self.project_root / "R3P-25074-E6-0001 MAIN.dwg").resolve())

        response = self.client.post(
            "/api/project-setup/preview",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root.resolve()),
                "profile": {
                    "projectName": "Demo",
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root.resolve()),
                    "acadeLine1": "Client",
                    "acadeLine2": "Site",
                    "acadeLine4": "25074",
                    "signerDrawnBy": "DW",
                    "signerCheckedBy": "QC",
                    "signerEngineer": "PE",
                },
                "revisionEntries": [],
                "scanSnapshot": {
                    "files": [
                        {
                            "absolutePath": drawing_path,
                            "relativePath": "R3P-25074-E6-0001 MAIN.dwg",
                            "fileType": "dwg",
                        }
                    ],
                    "bridgeDrawings": [
                        {
                            "path": drawing_path,
                            "titleBlockFound": True,
                            "blockName": "R3P-24x36BORDER&TITLE",
                            "layoutName": "Layout1",
                            "handle": "ABCD",
                            "hasWdTb": False,
                            "attributes": {
                                "DWGNO": "R3P-25074-E6-0001",
                                "TITLE3": "MAIN",
                                "REV": "A",
                            },
                        }
                    ],
                    "artifacts": {
                        "wdpPath": str((self.project_root / "demo.wdp").resolve()),
                        "wdtPath": str((self.project_root / "demo.wdt").resolve()),
                        "wdlPath": str((self.project_root / "demo_wdtitle.wdl").resolve()),
                    },
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["summary"]["drawingFiles"], 1)
        self.assertEqual(payload["data"]["drawings"][0]["drawingNumber"], "R3P-25074-E6-0001")
        self.assertEqual(payload["data"]["artifacts"]["wdpPath"], str((self.project_root / "demo.wdp").resolve()))

    def test_results_endpoint_accepts_local_action_receipts(self) -> None:
        response = self.client.post(
            "/api/project-setup/results",
            json={
                "projectId": "project-1",
                "action": "apply-title-block",
                "status": "success",
                "requestId": "req-1",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["requestId"], "req-1")


if __name__ == "__main__":
    unittest.main()
