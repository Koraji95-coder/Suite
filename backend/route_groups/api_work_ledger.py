from __future__ import annotations

import os
import socket
import subprocess
from pathlib import Path
from typing import Any, Callable, Optional

import requests
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from backend.work_ledger.artifacts import (
    WorkLedgerArtifactWriter,
    resolve_artifact_root,
)
from backend.work_ledger.publisher import WorkLedgerPublisher
from backend.work_ledger.suggestions import WorkLedgerSuggestionBuilder
from backend.work_ledger.store import WorkLedgerStore
from backend.work_ledger.worktale_runtime import WorktaleRuntime
from backend.watchdog import WatchdogMonitorService


def _extract_user_id(user: dict[str, Any]) -> str:
    return str(user.get("id") or user.get("sub") or "").strip()


def _extract_bearer_token() -> Optional[str]:
    auth_header = str(request.headers.get("Authorization") or "").strip()
    if not auth_header:
        return None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        return token or None
    return None


def _parse_query_int(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or str(raw).strip() == "":
        return int(default)
    return int(str(raw).strip())


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _work_ledger_error_response(*, message: str, code: str, status_code: int):
    return jsonify({"ok": False, "error": message, "code": code}), status_code


def create_work_ledger_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    supabase_url: str,
    supabase_api_key: str,
    repo_root: Path | None = None,
    requests_module: Any = requests,
    subprocess_module: Any = subprocess,
    socket_module: Any = socket,
    watchdog_service: Any = None,
) -> Blueprint:
    """Create /api/work-ledger route group blueprint."""
    bp = Blueprint("work_ledger_api", __name__, url_prefix="/api/work-ledger")
    resolved_repo_root = Path(repo_root or Path(__file__).resolve().parents[2]).resolve()
    store = WorkLedgerStore(
        supabase_url=supabase_url,
        supabase_api_key=supabase_api_key,
        logger=logger,
        requests_module=requests_module,
    )
    runtime = WorktaleRuntime(
        repo_root=resolved_repo_root,
        logger=logger,
        subprocess_module=subprocess_module,
        socket_module=socket_module,
    )
    artifact_writer = WorkLedgerArtifactWriter()
    publisher = WorkLedgerPublisher(
        store=store,
        runtime=runtime,
        artifact_writer=artifact_writer,
        logger=logger,
    )
    suggestion_builder = WorkLedgerSuggestionBuilder(
        repo_root=resolved_repo_root,
        logger=logger,
        subprocess_module=subprocess_module,
        watchdog_service=watchdog_service or WatchdogMonitorService(),
    )

    @bp.route("/publishers/worktale/readiness", methods=["GET"])
    @require_supabase_user
    @limiter.limit("1200 per hour")
    def api_work_ledger_worktale_readiness():
        workstation_id = runtime.resolve_workstation_id()
        payload = publisher.readiness(workstation_id=workstation_id)
        return jsonify({"ok": True, **payload}), 200

    @bp.route("/draft-suggestions", methods=["GET"])
    @require_supabase_user
    @limiter.limit("3600 per hour")
    def api_work_ledger_draft_suggestions():
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"ok": False, "error": "Authenticated user id not found."}), 401

        bearer_token = _extract_bearer_token()
        limit = _parse_query_int("limit", 12)
        try:
            try:
                existing_entries = store.list_entries_for_user(
                    user_id=user_id,
                    bearer_token=bearer_token,
                    limit=200,
                )
            except Exception as exc:
                logger.warning(
                    "Unable to load existing Work Ledger entries while building suggestions: %s",
                    exc,
                )
                existing_entries = []

            payload = suggestion_builder.build(
                user_id=user_id,
                existing_entries=existing_entries,
                limit=limit,
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError:
            return _work_ledger_error_response(
                message="Invalid work ledger suggestions query.",
                code="WORK_LEDGER_SUGGESTIONS_INVALID_QUERY",
                status_code=400,
            )
        except Exception:
            logger.exception("Failed to build work ledger draft suggestions")
            return _work_ledger_error_response(
                message="Failed to build work ledger draft suggestions.",
                code="WORK_LEDGER_SUGGESTIONS_FAILED",
                status_code=500,
            )

    @bp.route("/publishers/worktale/bootstrap", methods=["POST"])
    @require_supabase_user
    @limiter.limit("120 per hour")
    def api_work_ledger_worktale_bootstrap():
        workstation_id = runtime.resolve_workstation_id()
        try:
            payload = publisher.bootstrap(workstation_id=workstation_id)
            return jsonify({"ok": True, **payload}), 200
        except RuntimeError:
            return _work_ledger_error_response(
                message="Failed to bootstrap Worktale on this workstation.",
                code="WORK_LEDGER_WORKTALE_BOOTSTRAP_FAILED",
                status_code=400,
            )
        except Exception:
            logger.exception("Unexpected Worktale bootstrap failure")
            return _work_ledger_error_response(
                message="Failed to bootstrap Worktale on this workstation.",
                code="WORK_LEDGER_WORKTALE_BOOTSTRAP_FAILED",
                status_code=500,
            )

    @bp.route("/entries/<entry_id>/publish/worktale", methods=["POST"])
    @require_supabase_user
    @limiter.limit("360 per hour")
    def api_work_ledger_publish_entry_worktale(entry_id: str):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"ok": False, "error": "Authenticated user id not found."}), 401

        workstation_id = runtime.resolve_workstation_id()
        bearer_token = _extract_bearer_token()
        try:
            payload = publisher.publish_entry(
                entry_id=str(entry_id or "").strip(),
                user_id=user_id,
                workstation_id=workstation_id,
                bearer_token=bearer_token,
            )
            return jsonify({"ok": True, **payload}), 200
        except LookupError:
            return _work_ledger_error_response(
                message="Work ledger entry was not found.",
                code="WORK_LEDGER_ENTRY_NOT_FOUND",
                status_code=404,
            )
        except ValueError:
            return _work_ledger_error_response(
                message="Work ledger entry is not ready to publish.",
                code="WORK_LEDGER_ENTRY_INVALID_STATE",
                status_code=400,
            )
        except RuntimeError:
            return _work_ledger_error_response(
                message="Failed to publish work ledger entry.",
                code="WORK_LEDGER_WORKTALE_PUBLISH_FAILED",
                status_code=503,
            )
        except Exception:
            logger.exception("Unexpected Work Ledger publish failure")
            return _work_ledger_error_response(
                message="Failed to publish work ledger entry.",
                code="WORK_LEDGER_WORKTALE_PUBLISH_FAILED",
                status_code=500,
            )

    @bp.route("/entries/<entry_id>/publish-jobs", methods=["GET"])
    @require_supabase_user
    @limiter.limit("3600 per hour")
    def api_work_ledger_entry_publish_jobs(entry_id: str):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"ok": False, "error": "Authenticated user id not found."}), 401

        bearer_token = _extract_bearer_token()
        try:
            limit = _parse_query_int("limit", 20)
            payload = publisher.list_entry_jobs(
                entry_id=str(entry_id or "").strip(),
                user_id=user_id,
                bearer_token=bearer_token,
                limit=limit,
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError:
            return _work_ledger_error_response(
                message="Invalid work ledger publish jobs query.",
                code="WORK_LEDGER_INVALID_QUERY",
                status_code=400,
            )
        except LookupError:
            return _work_ledger_error_response(
                message="Work ledger entry was not found.",
                code="WORK_LEDGER_ENTRY_NOT_FOUND",
                status_code=404,
            )
        except Exception:
            logger.exception("Failed to list work ledger publish jobs")
            return _work_ledger_error_response(
                message="Failed to load work ledger publish jobs.",
                code="WORK_LEDGER_PUBLISH_JOBS_FAILED",
                status_code=500,
            )

    @bp.route(
        "/entries/<entry_id>/publish-jobs/<job_id>/open-artifact-folder",
        methods=["POST"],
    )
    @require_supabase_user
    @limiter.limit("360 per hour")
    def api_work_ledger_open_publish_job_artifact_folder(
        entry_id: str,
        job_id: str,
    ):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"ok": False, "error": "Authenticated user id not found."}), 401

        bearer_token = _extract_bearer_token()
        try:
            job = store.fetch_publish_job_for_user(
                entry_id=str(entry_id or "").strip(),
                job_id=str(job_id or "").strip(),
                user_id=user_id,
                bearer_token=bearer_token,
            )
            if job is None:
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Publish job was not found.",
                            "code": "WORK_LEDGER_PUBLISH_JOB_NOT_FOUND",
                        }
                    ),
                    404,
                )

            artifact_dir = str(job.get("artifact_dir") or "").strip()
            if not artifact_dir:
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Publish job does not have an artifact directory yet.",
                            "code": "WORK_LEDGER_PUBLISH_JOB_ARTIFACTS_MISSING",
                        }
                    ),
                    400,
                )

            resolved_artifact_dir = Path(artifact_dir).expanduser()
            try:
                resolved_artifact_dir = resolved_artifact_dir.resolve(strict=True)
            except FileNotFoundError:
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Artifact directory was not found on this workstation.",
                            "code": "WORK_LEDGER_PUBLISH_JOB_ARTIFACTS_MISSING",
                        }
                    ),
                    404,
                )

            if not resolved_artifact_dir.is_dir():
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Artifact path is not a folder.",
                            "code": "WORK_LEDGER_PUBLISH_JOB_ARTIFACTS_INVALID",
                        }
                    ),
                    400,
                )

            artifact_root = resolve_artifact_root().resolve()
            if not _is_relative_to(resolved_artifact_dir, artifact_root):
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Artifact folder is outside the allowed Work Ledger publisher scope.",
                            "code": "WORK_LEDGER_PUBLISH_JOB_ARTIFACTS_FORBIDDEN",
                        }
                    ),
                    403,
                )

            if os.name != "nt" or not hasattr(os, "startfile"):
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Open artifact folder is only available on Windows.",
                            "code": "WORK_LEDGER_ARTIFACT_FOLDER_UNSUPPORTED",
                        }
                    ),
                    501,
                )

            os.startfile(str(resolved_artifact_dir))
            return (
                jsonify(
                    {
                        "ok": True,
                        "entryId": str(entry_id or "").strip(),
                        "jobId": str(job_id or "").strip(),
                        "artifactDir": str(resolved_artifact_dir),
                    }
                ),
                200,
            )
        except Exception:
            logger.exception("Failed to open work ledger artifact folder")
            return _work_ledger_error_response(
                message="Failed to open artifact folder.",
                code="WORK_LEDGER_ARTIFACT_FOLDER_FAILED",
                status_code=500,
            )

    return bp
