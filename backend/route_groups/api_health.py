from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from flask import Blueprint, current_app, jsonify
from flask_limiter import Limiter

_RUNTIME_STATUS_CACHE_TTL_SECONDS = 15
_runtime_status_cache_payload: Dict[str, Any] | None = None
_runtime_status_cache_checked_at = 0.0
_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUNTIME_STATUS_SCRIPT_PATH = _REPO_ROOT / "scripts" / "get-suite-runtime-status.ps1"
_RUNTIME_CONTROL_LAUNCHER_PATH = (
    _REPO_ROOT / "scripts" / "launch-suite-runtime-control.ps1"
)


def _limiter_health_payload() -> Dict[str, Any]:
    limiter_runtime = current_app.config.get("LIMITER_RUNTIME_STATUS")
    if not isinstance(limiter_runtime, dict):
        return {
            "storage": "unknown",
            "degraded": False,
            "reason": "uninitialized",
        }
    return {
        "storage": str(limiter_runtime.get("storage") or "unknown"),
        "degraded": bool(limiter_runtime.get("degraded", False)),
        "reason": str(limiter_runtime.get("reason") or ""),
    }


def _doctor_state_from_checks(checks: list[Dict[str, Any]]) -> str:
    actionable_checks = [
        check
        for check in checks
        if bool(check.get("actionable"))
        and str(check.get("severity") or "ready") != "ready"
    ]
    if actionable_checks:
        if any(
            str(check.get("severity") or "ready") == "unavailable"
            for check in actionable_checks
        ):
            return "unavailable"
        return "needs-attention"

    if any(
        str(check.get("severity") or "ready") == "background" for check in checks
    ):
        return "background"

    return "ready"


def _doctor_counts(checks: list[Dict[str, Any]]) -> Dict[str, int]:
    counts = {
        "ready": 0,
        "background": 0,
        "needs-attention": 0,
        "unavailable": 0,
    }
    for check in checks:
        severity = str(check.get("severity") or "ready")
        if severity not in counts:
            severity = "background"
        counts[severity] += 1
    return counts


def _suite_health_checks() -> tuple[list[Dict[str, Any]], list[str]]:
    limiter = _limiter_health_payload()

    recommendations: list[str] = []
    checks: list[Dict[str, Any]] = [
        {
            "key": "backend-api",
            "label": "Watchdog backend",
            "subsystem": "backend",
            "severity": "ready",
            "detail": "Watchdog backend is responding to /health.",
            "actionable": False,
            "meta": {
                "backendId": "coordinates-grabber-api",
                "version": "1.0.0",
            },
        }
    ]

    limiter_degraded = bool(limiter.get("degraded", False))
    limiter_reason = str(limiter.get("reason") or "").strip()
    limiter_storage = str(limiter.get("storage") or "unknown")
    limiter_detail = f"Limiter storage is {limiter_storage}."
    if limiter_reason:
        limiter_detail = f"{limiter_detail} Reason: {limiter_reason}."
    checks.append(
        {
            "key": "rate-limiter-storage",
            "label": "Rate limiter storage",
            "subsystem": "backend",
            "severity": "needs-attention" if limiter_degraded else "ready",
            "detail": limiter_detail,
            "actionable": limiter_degraded,
            "meta": limiter,
        }
    )
    if limiter_degraded:
        recommendations.append(
            "Restore shared limiter storage or accept degraded local-memory limiter behavior for this workstation."
        )

    return checks, recommendations


def _checked_at_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _build_runtime_status_fallback(detail: str) -> Dict[str, Any]:
    checked_at = _checked_at_iso()
    return {
        "schemaVersion": "suite.runtime.v1",
        "checkedAt": checked_at,
        "ok": False,
        "overall": {
            "state": "down",
            "text": "OFFLINE",
        },
        "doctor": {
            "overallState": "unavailable",
            "actionableIssueCount": 1,
            "severityCounts": {
                "ready": 0,
                "background": 0,
                "needs-attention": 0,
                "unavailable": 1,
            },
            "recommendations": [
                "Restore the local backend and workstation runtime snapshot before relying on developer diagnostics."
            ],
        },
        "runtime": {
            "statusDir": None,
            "statusPath": None,
            "currentBootstrapPath": None,
            "logPath": None,
            "lastBootstrap": None,
            "currentBootstrap": None,
        },
        "services": [],
        "source": "backend:/api/runtime/status",
        "warnings": [detail],
        "support": {
            "generatedAt": checked_at,
            "lines": [
                "Suite Runtime Control Support Summary",
                f"Generated: {checked_at}",
                "Runtime snapshot: unavailable",
                f"Suite doctor: unavailable; actionable issues 1",
                f"Recommendation: {detail}",
            ],
            "text": "\n".join(
                [
                    "Suite Runtime Control Support Summary",
                    f"Generated: {checked_at}",
                    "Runtime snapshot: unavailable",
                    "Suite doctor: unavailable; actionable issues 1",
                    f"Recommendation: {detail}",
                ]
            ),
            "workstation": {
                "workstationId": os.environ.get("SUITE_WORKSTATION_ID") or os.environ.get("COMPUTERNAME") or None,
                "computerName": os.environ.get("COMPUTERNAME") or None,
                "userName": os.environ.get("USERNAME") or None,
            },
            "config": {},
            "paths": {},
        },
    }


def _extract_json_object(text: str) -> Dict[str, Any] | None:
    if not text:
        return None

    candidate = text.strip()
    try:
        payload = json.loads(candidate)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        return None

    try:
        payload = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _run_runtime_status_script() -> Dict[str, Any]:
    if not _RUNTIME_STATUS_SCRIPT_PATH.exists():
        return _build_runtime_status_fallback(
            f"Runtime status script was not found at {_RUNTIME_STATUS_SCRIPT_PATH}."
        )

    try:
        completed = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(_RUNTIME_STATUS_SCRIPT_PATH),
                "-RepoRoot",
                str(_REPO_ROOT),
                "-Json",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            cwd=str(_REPO_ROOT),
        )
    except FileNotFoundError:
        return _build_runtime_status_fallback(
            "PowerShell is unavailable on this workstation, so the shared runtime snapshot could not be read."
        )
    except subprocess.TimeoutExpired:
        return _build_runtime_status_fallback(
            "Runtime status snapshot timed out while reading the workstation state."
        )
    except Exception as exc:  # pragma: no cover - defensive process wrapper
        return _build_runtime_status_fallback(
            f"Runtime status snapshot failed unexpectedly: {exc}"
        )

    output = "\n".join(
        part.strip()
        for part in [completed.stdout or "", completed.stderr or ""]
        if part and part.strip()
    )
    payload = _extract_json_object(output)
    if payload is None:
        detail = (
            "Runtime status script did not return JSON."
            if not output
            else f"Runtime status script returned unreadable output: {output[:500]}"
        )
        return _build_runtime_status_fallback(detail)

    payload.setdefault("source", "script:get-suite-runtime-status.ps1")
    payload.setdefault("checkedAt", _checked_at_iso())
    return payload


def _load_runtime_status_snapshot() -> Dict[str, Any]:
    global _runtime_status_cache_payload
    global _runtime_status_cache_checked_at

    now = time.time()
    if (
        _runtime_status_cache_payload is not None
        and now - _runtime_status_cache_checked_at <= _RUNTIME_STATUS_CACHE_TTL_SECONDS
    ):
        return _runtime_status_cache_payload

    payload = _run_runtime_status_script()
    _runtime_status_cache_payload = payload
    _runtime_status_cache_checked_at = now
    return payload


def _launch_runtime_control() -> tuple[bool, str]:
    if not _RUNTIME_CONTROL_LAUNCHER_PATH.exists():
        return (
            False,
            f"Runtime Control launcher was not found at {_RUNTIME_CONTROL_LAUNCHER_PATH}.",
        )

    creation_flags = 0
    creation_flags |= int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    creation_flags |= int(getattr(subprocess, "DETACHED_PROCESS", 0))

    try:
        subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(_RUNTIME_CONTROL_LAUNCHER_PATH),
                "-RepoRoot",
                str(_REPO_ROOT),
            ],
            cwd=str(_REPO_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
    except FileNotFoundError:
        return False, "PowerShell is unavailable on this workstation."
    except Exception as exc:  # pragma: no cover - defensive launcher wrapper
        return False, f"Runtime Control could not start: {exc}"

    return True, "Suite Runtime Control is starting."


def create_health_blueprint(*, limiter: Limiter | None = None) -> Blueprint:
    """Create /health route blueprint."""
    bp = Blueprint("health_api", __name__)

    def health():
        checked_at = _checked_at_iso()
        checks, recommendations = _suite_health_checks()
        overall_state = _doctor_state_from_checks(checks)
        severity_counts = _doctor_counts(checks)
        actionable_issue_count = sum(
            1
            for check in checks
            if bool(check.get("actionable"))
            and str(check.get("severity") or "ready") != "ready"
        )

        return jsonify(
            {
                "schemaVersion": "suite.runtime.v1",
                "status": "running",
                "server": "Coordinates Grabber API",
                "backend_id": "coordinates-grabber-api",
                "version": "1.0.0",
                "timestamp": time.time(),
                "checkedAt": checked_at,
                "limiter": _limiter_health_payload(),
                "service": {
                    "id": "backend",
                    "label": "Watchdog Backend",
                    "state": overall_state,
                    "source": "backend:/health",
                    "checkedAt": checked_at,
                    "version": "1.0.0",
                    "checks": checks,
                    "actionableIssueCount": actionable_issue_count,
                    "recommendations": recommendations,
                },
                "doctor": {
                    "checkedAt": checked_at,
                    "overallState": overall_state,
                    "groups": [
                        {
                            "id": "backend",
                            "label": "Watchdog Backend",
                            "checks": checks,
                        }
                    ],
                    "severityCounts": severity_counts,
                    "actionableIssueCount": actionable_issue_count,
                    "recommendations": recommendations,
                },
            }
        )

    bp.route("/health", methods=["GET"])(
        limiter.exempt(health) if limiter is not None else health
    )

    @bp.route("/api/runtime/status", methods=["GET"])
    def runtime_status():
        loader = current_app.config.get("SUITE_RUNTIME_STATUS_LOADER")
        if callable(loader):
            payload = loader()
        else:
            payload = _load_runtime_status_snapshot()
        return jsonify(payload)

    @bp.route("/api/runtime/open-control", methods=["POST"])
    def open_runtime_control():
        launched, message = _launch_runtime_control()
        status_code = 202 if launched else 500
        return (
            jsonify(
                {
                    "ok": launched,
                    "message": message,
                    "launchedAt": _checked_at_iso(),
                }
            ),
            status_code,
        )

    return bp
