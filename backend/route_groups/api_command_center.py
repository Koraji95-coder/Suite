from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Callable, Optional

from flask import Blueprint, jsonify
from flask_limiter import Limiter

_LOG_TAIL_LINE_LIMIT = 40


def _read_env_value(key: str, default: str = "", *, os_module: Any = os) -> str:
    return str((os_module.environ.get(key) or default) if os_module else default).strip()


def _resolve_sync_status_dir(
    *,
    status_dir: Optional[Path] = None,
    os_module: Any = os,
) -> Path:
    if status_dir is not None:
        return Path(status_dir)

    explicit = _read_env_value("SUITE_SUPABASE_SYNC_STATUS_DIR", os_module=os_module)
    if explicit:
        return Path(explicit).expanduser()

    local_app_data = (
        _read_env_value("LOCALAPPDATA", os_module=os_module)
        or _read_env_value("TEMP", os_module=os_module)
        or str(Path(tempfile.gettempdir()) / "suite")
    )
    return Path(local_app_data) / "Suite" / "supabase-sync"


def _read_json_file(path: Path, *, logger: Any) -> Optional[dict[str, Any]]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        logger.exception("Command Center could not read status JSON", extra={"path": str(path)})
        return None


def _read_log_tail(path: Path, *, logger: Any, line_limit: int = _LOG_TAIL_LINE_LIMIT) -> list[str]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        logger.exception("Command Center could not read status log", extra={"path": str(path)})
        return []
    return lines[-line_limit:]


def _summarize_push_readiness(run: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(run, dict):
        return None

    push_readiness_summary = str(run.get("pushReadinessSummary") or "").strip()
    checks = run.get("checks")
    checks = checks if isinstance(checks, dict) else {}

    def _check_ok(key: str) -> bool:
        value = checks.get(key)
        return isinstance(value, dict) and value.get("ok") is True

    def _check_message(key: str, fallback: str) -> str:
        value = checks.get(key)
        if isinstance(value, dict):
            message = str(value.get("message") or "").strip()
            if message:
                return message
        return fallback

    if run.get("pushReady") is True:
        return push_readiness_summary or "Hosted migration push is ready."

    if not _check_ok("localSupabase"):
        runtime_issues = []
        if not _check_ok("localSupabase"):
            runtime_issues.append(_check_message("localSupabase", "Local Supabase is unavailable."))
        if runtime_issues:
            return (
                "Hosted push is waiting on the latest local preflight confirmation: "
                + " ".join(runtime_issues)
            )
        return "Hosted push is waiting on a healthy local preflight snapshot."

    if not _check_ok("cliAuth"):
        return _check_message("cliAuth", "Hosted push is blocked until CLI auth is ready.")

    if not _check_ok("link"):
        return _check_message(
            "link",
            "Hosted push is blocked until the hosted project link check succeeds.",
        )

    if not _check_ok("dryRun"):
        return _check_message(
            "dryRun",
            "Hosted push is blocked until the hosted dry-run succeeds.",
        )

    return push_readiness_summary or "Hosted push stays gated until the latest preflight says it is safe."


def create_command_center_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    status_dir: Optional[Path] = None,
    os_module: Any = os,
) -> Blueprint:
    """Create /api/command-center route group blueprint."""

    bp = Blueprint("command_center_api", __name__, url_prefix="/api/command-center")

    @bp.route("/supabase-sync-status", methods=["GET"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def get_supabase_sync_status():
        root = _resolve_sync_status_dir(status_dir=status_dir, os_module=os_module)
        preflight_path = root / "last-preflight.json"
        push_path = root / "last-push.json"
        log_path = root / "supabase-sync.log"
        last_preflight = _read_json_file(preflight_path, logger=logger)
        last_push = _read_json_file(push_path, logger=logger)

        payload = {
            "ok": True,
            "paths": {
                "root": str(root),
                "preflightPath": str(preflight_path),
                "pushPath": str(push_path),
                "logPath": str(log_path),
            },
            "lastPreflight": last_preflight,
            "lastPush": last_push,
            "pushReadinessSummary": _summarize_push_readiness(last_preflight),
            "logTail": _read_log_tail(log_path, logger=logger),
        }
        return jsonify(payload), 200

    return bp
