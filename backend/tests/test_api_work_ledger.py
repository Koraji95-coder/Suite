from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import patch

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_work_ledger import create_work_ledger_blueprint


class _ResponseStub:
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)
        self.content = b"{}" if payload is not None else b""

    def json(self) -> Any:
        return self._payload


class _RequestsStub:
    def __init__(self) -> None:
        self.entries: Dict[str, Dict[str, Any]] = {
            "ledger-ready": {
                "id": "ledger-ready",
                "title": "Publish checkpoint",
                "summary": "Checkpoint summary.",
                "source_kind": "manual",
                "commit_refs": ["abc123"],
                "project_id": "project-1",
                "app_area": "dashboard",
                "architecture_paths": ["src/routes/ChangelogRoutePage.tsx"],
                "hotspot_ids": ["dashboard/changelog"],
                "publish_state": "ready",
                "published_at": None,
                "external_reference": None,
                "external_url": None,
                "user_id": "user-1",
                "created_at": "2026-03-18T00:00:00Z",
                "updated_at": "2026-03-18T00:00:00Z",
            },
            "ledger-draft": {
                "id": "ledger-draft",
                "title": "Draft checkpoint",
                "summary": "Still draft.",
                "source_kind": "manual",
                "commit_refs": [],
                "project_id": None,
                "app_area": None,
                "architecture_paths": [],
                "hotspot_ids": [],
                "publish_state": "draft",
                "published_at": None,
                "external_reference": None,
                "external_url": None,
                "user_id": "user-1",
                "created_at": "2026-03-18T00:00:00Z",
                "updated_at": "2026-03-18T00:00:00Z",
            },
        }
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.job_sequence = 0

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, str]] = None,
        json: Any = None,
        timeout: int = 0,
    ) -> _ResponseStub:
        _ = (headers, timeout)
        params = params or {}
        table = url.split("/rest/v1/", 1)[1]

        if table == "work_ledger_entries":
            if method == "GET":
                entry_id = str(params.get("id", "")).replace("eq.", "")
                user_id = str(params.get("user_id", "")).replace("eq.", "")
                entry = self.entries.get(entry_id)
                if entry and entry.get("user_id") == user_id:
                    return _ResponseStub(200, [dict(entry)])
                return _ResponseStub(200, [])

            if method == "PATCH":
                entry_id = str(params.get("id", "")).replace("eq.", "")
                user_id = str(params.get("user_id", "")).replace("eq.", "")
                entry = self.entries.get(entry_id)
                if not entry or entry.get("user_id") != user_id:
                    return _ResponseStub(200, [])
                patch_payload = dict(json or {})
                entry.update(patch_payload)
                entry["updated_at"] = "2026-03-18T01:00:00Z"
                return _ResponseStub(200, [dict(entry)])

        if table == "work_ledger_publish_jobs":
            if method == "POST":
                self.job_sequence += 1
                job_id = f"job-{self.job_sequence}"
                row = {
                    "id": job_id,
                    "entry_id": str((json or {}).get("entry_id") or ""),
                    "user_id": str((json or {}).get("user_id") or ""),
                    "publisher": str((json or {}).get("publisher") or "worktale"),
                    "mode": str((json or {}).get("mode") or "note"),
                    "status": str((json or {}).get("status") or "pending"),
                    "workstation_id": (json or {}).get("workstation_id"),
                    "repo_path": (json or {}).get("repo_path"),
                    "artifact_dir": (json or {}).get("artifact_dir"),
                    "stdout_excerpt": None,
                    "stderr_excerpt": None,
                    "error_text": None,
                    "external_reference": None,
                    "external_url": None,
                    "published_at": None,
                    "created_at": "2026-03-18T01:00:00Z",
                    "updated_at": "2026-03-18T01:00:00Z",
                }
                self.jobs[job_id] = row
                return _ResponseStub(201, [dict(row)])

            if method == "PATCH":
                job_id = str(params.get("id", "")).replace("eq.", "")
                user_id = str(params.get("user_id", "")).replace("eq.", "")
                row = self.jobs.get(job_id)
                if not row or row.get("user_id") != user_id:
                    return _ResponseStub(200, [])
                row.update(dict(json or {}))
                row["updated_at"] = "2026-03-18T01:01:00Z"
                return _ResponseStub(200, [dict(row)])

            if method == "GET":
                entry_id = str(params.get("entry_id", "")).replace("eq.", "")
                user_id = str(params.get("user_id", "")).replace("eq.", "")
                rows = [
                    dict(row)
                    for row in self.jobs.values()
                    if row.get("entry_id") == entry_id and row.get("user_id") == user_id
                ]
                rows.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
                return _ResponseStub(200, rows)

        return _ResponseStub(404, {"error": "Unknown table path"})


class _CompletedProcessStub:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class _SubprocessStub:
    def __init__(self, *, repo_root: Path) -> None:
        self.repo_root = repo_root
        self.fail_publish_note = False

    def run(
        self,
        command: list[str],
        *,
        cwd: str,
        capture_output: bool,
        text: bool,
        check: bool,
        shell: bool,
    ) -> _CompletedProcessStub:
        _ = (cwd, capture_output, text, check, shell)
        if command[:3] == ["git", "config", "user.email"]:
            return _CompletedProcessStub(0, stdout="user@example.com\n")
        if command[:3] == ["worktale", "hook", "install"]:
            (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)
            return _CompletedProcessStub(0, stdout="Hook installed")
        if command[:2] == ["worktale", "note"]:
            if self.fail_publish_note:
                return _CompletedProcessStub(1, stderr="Worktale note failed")
            return _CompletedProcessStub(0, stdout="Note added")
        return _CompletedProcessStub(0, stdout="")


class TestApiWorkLedger(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name) / "repo"
        self.repo_root.mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".git").mkdir(parents=True, exist_ok=True)
        self.artifact_root = Path(self.temp_dir.name) / "artifacts"

        self.requests_stub = _RequestsStub()
        self.subprocess_stub = _SubprocessStub(repo_root=self.repo_root)

        self.which_patcher = patch(
            "backend.work_ledger.worktale_runtime.shutil.which",
            return_value="C:\\tools\\worktale.exe",
        )
        self.which_patcher.start()

        self.environ_patcher = patch.dict(
            "os.environ",
            {
                "SUITE_WORK_LEDGER_ARTIFACT_ROOT": str(self.artifact_root),
                "SUITE_WORKSTATION_ID": "DUSTIN-HOME",
            },
            clear=False,
        )
        self.environ_patcher.start()

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
            create_work_ledger_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                supabase_url="https://example.supabase.co",
                supabase_api_key="service-key",
                repo_root=self.repo_root,
                requests_module=self.requests_stub,
                subprocess_module=self.subprocess_stub,
            )
        )
        self.client = app.test_client()

    def tearDown(self) -> None:
        self.which_patcher.stop()
        self.environ_patcher.stop()
        self.temp_dir.cleanup()

    def test_readiness_then_bootstrap(self) -> None:
        readiness = self.client.get("/api/work-ledger/publishers/worktale/readiness")
        self.assertEqual(readiness.status_code, 200)
        readiness_payload = readiness.get_json() or {}
        self.assertFalse(bool(readiness_payload.get("ready")))
        self.assertIn("issues", readiness_payload)

        bootstrap = self.client.post("/api/work-ledger/publishers/worktale/bootstrap")
        self.assertEqual(bootstrap.status_code, 200)
        bootstrap_payload = bootstrap.get_json() or {}
        self.assertTrue(bool(bootstrap_payload.get("ok")))

        readiness_after = self.client.get("/api/work-ledger/publishers/worktale/readiness")
        readiness_after_payload = readiness_after.get_json() or {}
        self.assertTrue(bool(readiness_after_payload.get("ready")))

    def test_publish_ready_entry_updates_state_and_receipts(self) -> None:
        (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-ready/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 200)
        publish_payload = publish_response.get_json() or {}
        self.assertTrue(bool(publish_payload.get("ok")))
        self.assertEqual(
            ((publish_payload.get("entry") or {}).get("publish_state")),
            "published",
        )
        self.assertEqual(
            ((publish_payload.get("job") or {}).get("status")),
            "succeeded",
        )

        jobs_response = self.client.get(
            "/api/work-ledger/entries/ledger-ready/publish-jobs",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(jobs_response.status_code, 200)
        jobs_payload = jobs_response.get_json() or {}
        self.assertEqual(int(jobs_payload.get("count") or 0), 1)

    def test_open_artifact_folder_for_publish_job(self) -> None:
        (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-ready/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 200)
        publish_payload = publish_response.get_json() or {}
        job_id = str(((publish_payload.get("job") or {}).get("id")) or "").strip()
        self.assertTrue(job_id)

        with patch("backend.route_groups.api_work_ledger.os.startfile") as startfile:
            open_response = self.client.post(
                f"/api/work-ledger/entries/ledger-ready/publish-jobs/{job_id}/open-artifact-folder",
                headers={"Authorization": "Bearer user-token"},
            )
        self.assertEqual(open_response.status_code, 200)
        startfile.assert_called_once()
        payload = open_response.get_json() or {}
        self.assertEqual(payload.get("jobId"), job_id)
        self.assertTrue(str(payload.get("artifactDir") or "").strip())

    def test_publish_failure_leaves_entry_ready(self) -> None:
        (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)
        self.subprocess_stub.fail_publish_note = True
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-ready/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 503)
        self.assertEqual(
            self.requests_stub.entries["ledger-ready"]["publish_state"],
            "ready",
        )
        job_rows = list(self.requests_stub.jobs.values())
        self.assertTrue(job_rows)
        self.assertEqual(job_rows[-1]["status"], "failed")

    def test_publish_rejects_non_ready_entries(self) -> None:
        (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-draft/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 400)
        payload = publish_response.get_json() or {}
        self.assertEqual(payload.get("code"), "WORK_LEDGER_ENTRY_INVALID_STATE")


if __name__ == "__main__":
    unittest.main()
