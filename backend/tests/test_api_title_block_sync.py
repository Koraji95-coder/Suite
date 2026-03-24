from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_title_block_sync import create_title_block_sync_blueprint


class TestApiTitleBlockSync(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name)
        (self.project_root / "sub").mkdir(exist_ok=True)
        (self.project_root / "R3P-25074-E6-0001 MAIN.dwg").write_text("", encoding="utf-8")
        (self.project_root / "sub" / "R3P-25074-E6-0002 AUX.pdf").write_text("", encoding="utf-8")
        (self.project_root / "demo.wdp").write_text("", encoding="utf-8")

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

        def send_autocad_dotnet_command(action: str, payload: dict[str, object]):
            if action == "suite_drawing_list_scan":
                drawing_path = str(self.project_root / "R3P-25074-E6-0001 MAIN.dwg")
                return {
                    "ok": True,
                    "id": "bridge-1",
                    "result": {
                        "success": True,
                        "code": "",
                        "message": "ok",
                        "data": {
                            "drawings": [
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
                            ]
                        },
                        "warnings": [],
                        "meta": {},
                    },
                }

            if action == "suite_title_block_apply":
                return {
                    "ok": True,
                    "id": "bridge-2",
                    "result": {
                        "success": True,
                        "code": "",
                        "message": "ok",
                        "data": {
                            "files": [
                                {
                                    "path": str(self.project_root / "R3P-25074-E6-0001 MAIN.dwg"),
                                    "updated": 4,
                                    "wroteChanges": True,
                                }
                            ],
                            "updated": 4,
                            "acadeUpdateQueued": True,
                        },
                        "warnings": ["Queued AEUPDATETITLEBLOCK."],
                        "meta": {},
                    },
                }

            raise AssertionError(f"Unexpected bridge action {action}")

        self.app.register_blueprint(
            create_title_block_sync_blueprint(
                limiter=limiter,
                logger=self.app.logger,
                require_supabase_user=require_supabase_user,
                send_autocad_dotnet_command=send_autocad_dotnet_command,
            )
        )
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_scan_builds_rows_and_artifact_preview(self) -> None:
        response = self.client.post(
            "/api/title-block-sync/scan",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeLine1": "HUNT ENERGY NETWORK",
                    "acadeLine2": "NANULAK 180MW BESS SUBSTATION",
                    "acadeLine4": "R3P-25074",
                },
                "revisionEntries": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        data = payload.get("data") or {}
        self.assertEqual((data.get("summary") or {}).get("totalFiles"), 3)
        drawings = data.get("drawings") or []
        self.assertEqual(len(drawings), 3)
        self.assertTrue(str((data.get("artifacts") or {}).get("wdtPath")).endswith("demo.wdt"))

    def test_preview_derives_cadno_and_revision_rows(self) -> None:
        response = self.client.post(
            "/api/title-block-sync/preview",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
                "revisionEntries": [
                    {
                        "drawing_number": "R3P-25074-E6-0001",
                        "revision": "A",
                        "revision_description": "Issued for preliminary",
                        "revision_by": "APS",
                        "revision_checked_by": "DW",
                        "revision_date": "2026-01-01",
                        "revision_sort_order": 1,
                        "created_at": "2026-01-01T00:00:00Z",
                    },
                    {
                        "drawing_number": "R3P-25074-E6-0001",
                        "revision": "B",
                        "revision_description": "Issued for approval",
                        "revision_by": "KE",
                        "revision_checked_by": "DW",
                        "revision_date": "2026-02-01",
                        "revision_sort_order": 2,
                        "created_at": "2026-02-01T00:00:00Z",
                    },
                ],
                "rows": [
                    {
                        "id": "row-1",
                        "fileName": "R3P-25074-E6-0001 MAIN.dwg",
                        "relativePath": "R3P-25074-E6-0001 MAIN.dwg",
                        "absolutePath": str(self.project_root / "R3P-25074-E6-0001 MAIN.dwg"),
                        "fileType": "dwg",
                        "filenameDrawingNumber": "R3P-25074-E6-0001",
                        "filenameTitle": "MAIN",
                        "currentAttributes": {"DWGNO": "R3P-25074-E6-0001", "REV": "A"},
                        "editableFields": {
                            "scale": "NTS",
                            "drawnBy": "KE",
                            "drawnDate": "2026-03-01",
                            "checkedBy": "DW",
                            "checkedDate": "2026-03-02",
                            "engineer": "APS",
                            "engineerDate": "2026-03-03",
                        },
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        row = ((payload.get("data") or {}).get("drawings") or [])[0]
        self.assertEqual((row.get("suiteUpdates") or {}).get("CADNO"), "R3P25074E60001")
        self.assertEqual((row.get("suiteUpdates") or {}).get("REV"), "B")
        self.assertEqual(len(row.get("revisionRows") or []), 2)

    def test_apply_blocks_wd_tb_conflicts(self) -> None:
        response = self.client.post(
            "/api/title-block-sync/apply",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                },
                "revisionEntries": [],
                "rows": [
                    {
                        "id": "row-1",
                        "fileName": "R3P-25074-E6-0001 MAIN.dwg",
                        "relativePath": "R3P-25074-E6-0001 MAIN.dwg",
                        "absolutePath": str(self.project_root / "R3P-25074-E6-0001 MAIN.dwg"),
                        "fileType": "dwg",
                        "filenameDrawingNumber": "R3P-25074-E6-0001",
                        "filenameTitle": "MAIN",
                        "hasWdTbConflict": True,
                        "currentAttributes": {},
                        "editableFields": {},
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "INVALID_REQUEST")


if __name__ == "__main__":
    unittest.main()
