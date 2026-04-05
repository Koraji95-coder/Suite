from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Optional
from unittest.mock import Mock, patch

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
                "lifecycle_state": "active",
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
                "lifecycle_state": "planned",
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
        self.post_commit_installed = False
        self.post_push_installed = False

    def mark_bootstrapped(self) -> None:
        (self.repo_root / ".worktale").mkdir(parents=True, exist_ok=True)

    def _ensure_hooks_dir(self) -> Path:
        hooks_dir = self.repo_root / ".git" / "hooks"
        hooks_dir.mkdir(parents=True, exist_ok=True)
        return hooks_dir

    def _install_post_commit_hook(self) -> None:
        hooks_dir = self._ensure_hooks_dir()
        (hooks_dir / "post-commit").write_text(
            "#!/bin/sh\n# Worktale post-commit hook\nnode \"$REPO_ROOT/scripts/run-worktale-cli.mjs\" capture --silent 2>/dev/null || true\n",
            encoding="utf-8",
        )
        (hooks_dir / "post-commit.ps1").write_text(
            "# Worktale post-commit hook (Windows)\n& node scripts\\run-worktale-cli.mjs capture --silent\n",
            encoding="utf-8",
        )
        self.post_commit_installed = True

    def _install_post_push_hook(self) -> None:
        hooks_dir = self._ensure_hooks_dir()
        (hooks_dir / "post-push").write_text(
            "#!/bin/sh\n# Worktale post-push reminder\necho \"  Tip: run 'npm run worktale:digest' to review today's work\" 2>/dev/null || true\n",
            encoding="utf-8",
        )
        self.post_push_installed = True

    def install_hooks(self) -> None:
        self._install_post_commit_hook()
        self._install_post_push_hook()

    def install_post_commit_only(self) -> None:
        self._install_post_commit_hook()

    def uninstall_hooks(self) -> None:
        hooks_dir = self.repo_root / ".git" / "hooks"
        for name in ("post-commit", "post-commit.ps1", "post-push"):
            hook_path = hooks_dir / name
            if hook_path.exists():
                hook_path.unlink()
        self.post_commit_installed = False
        self.post_push_installed = False

    def _readiness_payload(self) -> dict[str, Any]:
        bootstrapped = (self.repo_root / ".worktale").exists()
        ready = bootstrapped and self.post_commit_installed and self.post_push_installed
        issues: list[str] = []
        if not bootstrapped:
            issues.append("Initialize Worktale metadata with `npm run worktale:bootstrap`.")
        if not self.post_commit_installed:
            issues.append("Install or repair the Worktale post-commit hook.")
        if not self.post_push_installed:
            issues.append("Install or repair the Worktale post-push hook.")
        return {
            "ready": ready,
            "repoRoot": str(self.repo_root),
            "checks": {
                "cliInstalled": True,
                "cliPath": "C:\\tools\\worktale\\dist\\cli.js",
                "runnerStrategy": "node22-npx",
                "repoExists": True,
                "gitRepository": True,
                "gitEmailConfigured": True,
                "gitEmail": "user@example.com",
                "bootstrapped": bootstrapped,
                "postCommitHookInstalled": self.post_commit_installed,
                "postPushHookInstalled": self.post_push_installed,
            },
            "issues": issues,
            "recommendedActions": [] if ready else ["Run `npm run worktale:bootstrap` to initialize the repository and repair hooks."],
            "nextStep": None if ready else "npm run worktale:bootstrap",
        }

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
        if command[:2] == ["git", "log"]:
            return _CompletedProcessStub(
                0,
                stdout="abc1234567890abc\x1fSplit project watchdog signals\x1f2026-03-18T05:00:00+00:00\n",
            )
        if command[:2] == ["git", "show"]:
            return _CompletedProcessStub(
                0,
                stdout="src/features/project-watchdog/ProjectTelemetryPanel.tsx\nsrc/features/autodraft-studio/ui/AutoDraftComparePanel.tsx\n",
            )
        if len(command) >= 2 and command[0].endswith("node.exe"):
            script_name = Path(command[1]).name
            if script_name == "check-worktale-readiness.mjs":
                return _CompletedProcessStub(
                    0,
                    stdout=f"{__import__('json').dumps(self._readiness_payload())}\n",
                )
            if script_name == "bootstrap-worktale.mjs":
                if not (self.repo_root / ".worktale").exists():
                    self.mark_bootstrapped()
                self.install_hooks()
                return _CompletedProcessStub(0, stdout="worktale: repository is bootstrapped\n")
            if script_name == "run-worktale-cli.mjs" and len(command) >= 3:
                if command[2] == "note":
                    if self.fail_publish_note:
                        return _CompletedProcessStub(1, stderr="Worktale note failed")
                    return _CompletedProcessStub(0, stdout="Note added")
        if command[:2] == ["worktale", "init"]:
            self.mark_bootstrapped()
            self._install_post_commit_hook()
            return _CompletedProcessStub(0, stdout="Initialized Worktale")
        if command[:3] == ["worktale", "hook", "install"]:
            # Match the current Worktale CLI bug: install exits early if post-commit exists,
            # even when post-push is still missing.
            if self.post_commit_installed:
                return _CompletedProcessStub(0, stdout="Worktale hooks are already installed")
            self.install_hooks()
            return _CompletedProcessStub(0, stdout="Hooks installed")
        if command[:3] == ["worktale", "hook", "uninstall"]:
            self.uninstall_hooks()
            return _CompletedProcessStub(0, stdout="Hooks removed")
        if command[:2] == ["worktale", "note"]:
            if self.fail_publish_note:
                return _CompletedProcessStub(1, stderr="Worktale note failed")
            return _CompletedProcessStub(0, stdout="Note added")
        return _CompletedProcessStub(0, stdout="")
class _WatchdogServiceStub:
    def list_sessions(
        self,
        scope_key: str,
        *,
        limit: int,
        time_window_ms: int,
    ) -> dict[str, Any]:
        _ = (scope_key, limit, time_window_ms)
        return {
            "sessions": [
                {
                    "sessionId": "session-1",
                    "projectId": "project-1",
                    "drawingPath": "C:/Projects/Alpha/Drawing1.dwg",
                    "status": "completed",
                    "durationMs": 45 * 60 * 1000,
                    "commandCount": 12,
                    "workstationId": "DEV-HOME",
                }
            ]
        }


class TestApiWorkLedger(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name) / "repo"
        self.repo_root.mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".git").mkdir(parents=True, exist_ok=True)
        scripts_root = self.repo_root / "scripts"
        scripts_root.mkdir(parents=True, exist_ok=True)
        for script_name in (
            "bootstrap-worktale.mjs",
            "check-worktale-readiness.mjs",
            "run-worktale-cli.mjs",
        ):
            (scripts_root / script_name).write_text("// test fixture\n", encoding="utf-8")
        self.artifact_root = Path(self.temp_dir.name) / "artifacts"

        self.requests_stub = _RequestsStub()
        self.subprocess_stub = _SubprocessStub(repo_root=self.repo_root)
        self.watchdog_service = _WatchdogServiceStub()

        self.which_patcher = patch(
            "backend.work_ledger.worktale_runtime.shutil.which",
            side_effect=lambda name: "C:\\tools\\node.exe" if name == "node" else None,
        )
        self.which_patcher.start()

        self.environ_patcher = patch.dict(
            "os.environ",
            {
                "SUITE_WORK_LEDGER_ARTIFACT_ROOT": str(self.artifact_root),
                "SUITE_WORKSTATION_ID": "DEV-HOME",
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
                watchdog_service=self.watchdog_service,
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
        self.assertFalse(
            bool(((readiness_payload.get("checks") or {}).get("postPushHookInstalled")))
        )

        bootstrap = self.client.post("/api/work-ledger/publishers/worktale/bootstrap")
        self.assertEqual(bootstrap.status_code, 200)
        bootstrap_payload = bootstrap.get_json() or {}
        self.assertTrue(bool(bootstrap_payload.get("ok")))
        self.assertTrue(
            bool(((bootstrap_payload.get("checks") or {}).get("postCommitHookInstalled")))
        )
        self.assertTrue(
            bool(((bootstrap_payload.get("checks") or {}).get("postPushHookInstalled")))
        )

        readiness_after = self.client.get("/api/work-ledger/publishers/worktale/readiness")
        readiness_after_payload = readiness_after.get_json() or {}
        self.assertTrue(bool(readiness_after_payload.get("ready")))

    def test_publish_ready_entry_updates_state_and_receipts(self) -> None:
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_hooks()
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
            ((publish_payload.get("entry") or {}).get("lifecycle_state")),
            "completed",
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
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_hooks()
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-ready/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 200)
        publish_payload = publish_response.get_json() or {}
        job_id = str(((publish_payload.get("job") or {}).get("id")) or "").strip()
        self.assertTrue(job_id)

        startfile = Mock()
        with patch(
            "backend.route_groups.api_work_ledger.os",
            SimpleNamespace(name="nt", startfile=startfile),
        ):
            open_response = self.client.post(
                f"/api/work-ledger/entries/ledger-ready/publish-jobs/{job_id}/open-artifact-folder",
                headers={"Authorization": "Bearer user-token"},
            )
        self.assertEqual(open_response.status_code, 200)
        startfile.assert_called_once()
        payload = open_response.get_json() or {}
        self.assertEqual(payload.get("jobId"), job_id)
        self.assertTrue(str(payload.get("artifactDir") or "").strip())

    def test_open_artifact_folder_requires_windows(self) -> None:
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_hooks()
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-ready/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 200)
        publish_payload = publish_response.get_json() or {}
        job_id = str(((publish_payload.get("job") or {}).get("id")) or "").strip()
        self.assertTrue(job_id)

        with patch(
            "backend.route_groups.api_work_ledger.os",
            SimpleNamespace(name="posix"),
        ):
            open_response = self.client.post(
                f"/api/work-ledger/entries/ledger-ready/publish-jobs/{job_id}/open-artifact-folder",
                headers={"Authorization": "Bearer user-token"},
            )

        self.assertEqual(open_response.status_code, 501)
        payload = open_response.get_json() or {}
        self.assertEqual(
            payload.get("code"),
            "WORK_LEDGER_ARTIFACT_FOLDER_UNSUPPORTED",
        )

    def test_publish_failure_leaves_entry_ready(self) -> None:
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_hooks()
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
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_hooks()
        publish_response = self.client.post(
            "/api/work-ledger/entries/ledger-draft/publish/worktale",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(publish_response.status_code, 400)
        payload = publish_response.get_json() or {}
        self.assertEqual(payload.get("code"), "WORK_LEDGER_ENTRY_INVALID_STATE")

    def test_bootstrap_repairs_partial_hook_install(self) -> None:
        self.subprocess_stub.mark_bootstrapped()
        self.subprocess_stub.install_post_commit_only()

        readiness = self.client.get("/api/work-ledger/publishers/worktale/readiness")
        readiness_payload = readiness.get_json() or {}
        self.assertFalse(bool(readiness_payload.get("ready")))
        self.assertTrue(
            bool(((readiness_payload.get("checks") or {}).get("postCommitHookInstalled")))
        )
        self.assertFalse(
            bool(((readiness_payload.get("checks") or {}).get("postPushHookInstalled")))
        )

        bootstrap = self.client.post("/api/work-ledger/publishers/worktale/bootstrap")
        self.assertEqual(bootstrap.status_code, 200)
        bootstrap_payload = bootstrap.get_json() or {}
        self.assertTrue(bool(bootstrap_payload.get("ready")))
        self.assertTrue(
            bool(((bootstrap_payload.get("checks") or {}).get("postCommitHookInstalled")))
        )
        self.assertTrue(
            bool(((bootstrap_payload.get("checks") or {}).get("postPushHookInstalled")))
        )

    def test_bootstrap_hides_runtime_exception_text(self) -> None:
        with patch(
            "backend.route_groups.api_work_ledger.WorkLedgerPublisher.bootstrap",
            side_effect=RuntimeError("secret boom"),
        ):
            response = self.client.post("/api/work-ledger/publishers/worktale/bootstrap")

        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertEqual(
            payload.get("error"),
            "Failed to bootstrap Worktale on this workstation.",
        )
        self.assertEqual(payload.get("code"), "WORK_LEDGER_WORKTALE_BOOTSTRAP_FAILED")
        self.assertNotIn("secret boom", str(payload))

    def test_draft_suggestions_merge_git_and_watchdog_sources(self) -> None:
        response = self.client.get(
            "/api/work-ledger/draft-suggestions?limit=6",
            headers={"Authorization": "Bearer user-token"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(bool(payload.get("ok")))
        self.assertGreaterEqual(int(payload.get("count") or 0), 2)
        self.assertEqual((payload.get("sources") or {}).get("git"), 1)
        self.assertEqual((payload.get("sources") or {}).get("watchdog"), 1)
        suggestions = payload.get("suggestions") or []
        self.assertTrue(
            any(item.get("sourceKind") == "git_checkpoint" for item in suggestions)
        )
        self.assertTrue(any(item.get("sourceKind") == "watchdog" for item in suggestions))


if __name__ == "__main__":
    unittest.main()

