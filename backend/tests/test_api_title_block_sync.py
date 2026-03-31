from __future__ import annotations

import copy
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
        self.bridge_calls: list[tuple[str, dict[str, object]]] = []
        self.open_project_bridge_error: Exception | None = None
        self.open_project_bridge_result: dict[str, object] = {
            "ok": True,
            "id": "bridge-3",
            "result": {
                "success": True,
                "code": "",
                "message": "ACADE project open completed.",
                "data": {
                    "wdpPath": "",
                    "acadeLaunched": True,
                    "projectActivated": True,
                    "temporaryDocumentCreated": True,
                    "verification": {
                        "commandCompleted": True,
                        "aepxObserved": True,
                        "lastProjObserved": False,
                    },
                },
                "warnings": [],
                "meta": {},
            },
        }

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
            self.bridge_calls.append((action, payload))
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

            if action == "suite_acade_project_open":
                if self.open_project_bridge_error is not None:
                    raise self.open_project_bridge_error
                response = copy.deepcopy(self.open_project_bridge_result)
                result = response.get("result") if isinstance(response, dict) else None
                result_data = result.get("data") if isinstance(result, dict) else None
                if isinstance(result_data, dict) and not result_data.get("wdpPath"):
                    result_data["wdpPath"] = str(payload.get("wdpPath") or "")
                return response

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
        self.assertTrue(str((data.get("artifacts") or {}).get("wdpPath")).endswith("demo.wdp"))
        self.assertTrue(str((data.get("artifacts") or {}).get("wdtPath")).endswith("demo.wdt"))
        self.assertEqual((data.get("artifacts") or {}).get("wdpState"), "existing")

    def test_ensure_artifacts_creates_missing_support_files(self) -> None:
        starter_wdp = self.project_root / "starter.wdp"
        starter_wdt = self.project_root / "starter.wdt"
        starter_wdl = self.project_root / "starter.wdl"
        for path in (starter_wdp, starter_wdt, starter_wdl):
            if path.exists():
                path.unlink()

        response = self.client.post(
            "/api/title-block-sync/ensure-artifacts",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeProjectFilePath": str(starter_wdp),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        artifacts = (payload.get("data") or {}).get("artifacts") or {}
        self.assertEqual(artifacts.get("wdpState"), "starter")
        self.assertTrue(starter_wdp.exists())
        self.assertTrue(starter_wdt.exists())
        self.assertTrue(starter_wdl.exists())
        starter_text = starter_wdp.read_text(encoding="utf-8")
        self.assertIn("*[1]CLIENT", starter_text)
        self.assertIn("*[2]SITE", starter_text)
        self.assertIn("*[4]R3P-25074", starter_text)
        self.assertIn("=====SUB=SCHEMATIC", starter_text)

    def test_ensure_artifacts_preserves_existing_wdp(self) -> None:
        existing_text = "*[1]Existing project\n+[1]%SL_DIR%NFPA/\n===Demo drawing\ndemo01.dwg\n"
        wdp_path = self.project_root / "demo.wdp"
        wdp_path.write_text(existing_text, encoding="utf-8")

        response = self.client.post(
            "/api/title-block-sync/ensure-artifacts",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeProjectFilePath": str(wdp_path),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        artifacts = (payload.get("data") or {}).get("artifacts") or {}
        self.assertEqual(artifacts.get("wdpState"), "existing")
        self.assertEqual(wdp_path.read_text(encoding="utf-8"), existing_text)

    def test_blank_wdp_derives_from_project_name_not_root_folder(self) -> None:
        demo_wdp = self.project_root / "demo.wdp"
        if demo_wdp.exists():
            demo_wdp.unlink()

        response = self.client.post(
            "/api/title-block-sync/ensure-artifacts",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "projectName": "Nanulak",
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        artifacts = (payload.get("data") or {}).get("artifacts") or {}
        self.assertEqual(
            artifacts.get("wdpPath"),
            str(self.project_root / "Nanulak.wdp"),
        )
        self.assertEqual(
            artifacts.get("wdtPath"),
            str(self.project_root / "Nanulak.wdt"),
        )
        self.assertTrue((self.project_root / "Nanulak.wdp").exists())

    def test_open_project_returns_verified_bridge_data(self) -> None:
        starter_wdp = self.project_root / "starter.wdp"
        response = self.client.post(
            "/api/title-block-sync/open-project",
            json={
                "requestId": "req-open-success",
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeProjectFilePath": str(starter_wdp),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("requestId"), "req-open-success")
        self.assertTrue(starter_wdp.exists())
        open_project = ((payload.get("data") or {}).get("openProject") or {})
        self.assertEqual(open_project.get("wdpPath"), str(starter_wdp))
        self.assertTrue(open_project.get("acadeLaunched"))
        self.assertTrue(open_project.get("projectActivated"))
        self.assertTrue(open_project.get("temporaryDocumentCreated"))
        self.assertTrue((open_project.get("verification") or {}).get("commandCompleted"))
        self.assertTrue((open_project.get("verification") or {}).get("aepxObserved"))
        self.assertIn(
            (
                "suite_acade_project_open",
                {
                    "projectRootPath": str(self.project_root),
                    "wdpPath": str(starter_wdp),
                    "launchIfNeeded": True,
                    "uiMode": "project_manager_only",
                    "requestId": "req-open-success",
                },
            ),
            self.bridge_calls,
        )

    def test_open_project_returns_503_when_bridge_raises(self) -> None:
        starter_wdp = self.project_root / "starter.wdp"
        self.open_project_bridge_error = RuntimeError("bridge unavailable")

        response = self.client.post(
            "/api/title-block-sync/open-project",
            json={
                "requestId": "req-open-bridge-error",
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeProjectFilePath": str(starter_wdp),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "ACADE_PROJECT_OPEN_UNAVAILABLE")
        self.assertEqual(payload.get("requestId"), "req-open-bridge-error")
        self.assertEqual(
            payload.get("message"),
            "Support files are ready, but ACADE did not register/open the project.",
        )
        data = payload.get("data") or {}
        self.assertEqual(
            (data.get("artifacts") or {}).get("wdpPath"),
            str(starter_wdp),
        )
        self.assertIn("bridge unavailable", payload.get("warnings") or [])

    def test_open_project_returns_502_when_bridge_reports_failure(self) -> None:
        starter_wdp = self.project_root / "starter.wdp"
        self.open_project_bridge_result = {
            "ok": True,
            "id": "bridge-3",
            "result": {
                "success": False,
                "code": "ACADE_PROJECT_OPEN_FAILED",
                "message": "Native ACADE open failed.",
                "data": {
                    "wdpPath": str(starter_wdp),
                    "acadeLaunched": True,
                    "projectActivated": False,
                    "temporaryDocumentCreated": False,
                    "verification": {
                        "commandCompleted": True,
                        "aepxObserved": False,
                        "lastProjObserved": False,
                    },
                },
                "warnings": ["Native ACADE open failed."],
                "meta": {},
            },
        }

        response = self.client.post(
            "/api/title-block-sync/open-project",
            json={
                "requestId": "req-open-bridge-failure",
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                    "acadeProjectFilePath": str(starter_wdp),
                    "acadeLine1": "CLIENT",
                    "acadeLine2": "SITE",
                    "acadeLine4": "R3P-25074",
                },
            },
        )

        self.assertEqual(response.status_code, 502)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "ACADE_PROJECT_OPEN_FAILED")
        self.assertEqual(payload.get("requestId"), "req-open-bridge-failure")
        self.assertEqual(
            ((payload.get("data") or {}).get("artifacts") or {}).get("wdpPath"),
            str(starter_wdp),
        )
        self.assertIn("Native ACADE open failed.", payload.get("warnings") or [])

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

    def test_scan_uses_customer_safe_warning_when_bridge_is_unavailable(self) -> None:
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

        app.register_blueprint(
            create_title_block_sync_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                send_autocad_dotnet_command=None,
            )
        )
        client = app.test_client()

        response = client.post(
            "/api/title-block-sync/scan",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root),
                "profile": {
                    "blockName": "R3P-24x36BORDER&TITLE",
                    "projectRootPath": str(self.project_root),
                },
                "revisionEntries": [],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertEqual(
            payload.get("warnings"),
            [
                "Live DWG metadata is unavailable right now, so Suite is using filename fallback for drawing rows."
            ],
        )


if __name__ == "__main__":
    unittest.main()
