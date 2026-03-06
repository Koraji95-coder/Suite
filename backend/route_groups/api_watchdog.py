from __future__ import annotations

import os
import time
from typing import Any, Callable, Dict

from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from .api_watchdog_service import WatchdogMonitorService

Decorator = Callable[[Callable[..., Any]], Callable[..., Any]]


def _pick_directory_dialog(initial_path: str | None = None) -> str | None:
    """Open a native folder picker and return an absolute directory path."""
    # Import lazily so headless/server environments can still import the module.
    import tkinter as tk
    from tkinter import filedialog

    candidate = str(initial_path or "").strip()
    if candidate and os.path.isdir(candidate):
        initial_dir = candidate
    else:
        initial_dir = os.path.expanduser("~")

    root = tk.Tk()
    root.withdraw()
    root.update_idletasks()
    try:
        root.attributes("-topmost", True)
    except Exception:
        # Not all window managers support topmost.
        pass

    try:
        selected = filedialog.askdirectory(
            parent=root,
            initialdir=initial_dir,
            mustexist=True,
            title="Select Watchdog Root Folder",
        )
    finally:
        root.destroy()

    selected_path = str(selected or "").strip()
    if not selected_path:
        return None
    return os.path.abspath(selected_path)


def create_watchdog_blueprint(
    *,
    require_autocad_auth: Decorator,
    limiter: Limiter,
    logger: Any,
    time_module: Any = time,
    pick_directory_fn: Callable[[str | None], str | None] = _pick_directory_dialog,
) -> Blueprint:
    """Create heartbeat-driven folder watch routes under /api/watchdog."""
    bp = Blueprint("watchdog_api", __name__, url_prefix="/api/watchdog")
    service = WatchdogMonitorService(time_module=time_module)

    def _watchdog_user_key() -> str:
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(user.get("id") or user.get("sub") or "").strip()
        if user_id:
            return f"user:{user_id}"

        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        remote_addr = str(request.remote_addr or "unknown")
        return f"{auth_mode}:{remote_addr}"

    @bp.route("/config", methods=["PUT"])
    @require_autocad_auth
    @limiter.limit("240 per hour")
    def api_watchdog_config():
        if not request.is_json:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Expected JSON payload",
                        "code": "WATCHDOG_CONFIG_INVALID",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True) or {}
        user_key = _watchdog_user_key()

        try:
            result = service.configure(user_key, payload)
            return jsonify({"ok": True, **result}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_CONFIG_INVALID",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to configure watchdog service (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to configure watchdog service",
                        "code": "WATCHDOG_CONFIG_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/status", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_status():
        user_key = _watchdog_user_key()
        payload = service.status(user_key)
        return jsonify({"ok": True, **payload}), 200

    @bp.route("/heartbeat", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("7200 per hour")
    def api_watchdog_heartbeat():
        user_key = _watchdog_user_key()
        try:
            payload = service.heartbeat(user_key)
            return jsonify({"ok": True, **payload}), 200
        except KeyError:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Watchdog is not configured for this user",
                        "code": "WATCHDOG_NOT_CONFIGURED",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to run watchdog heartbeat (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Watchdog heartbeat failed",
                        "code": "WATCHDOG_HEARTBEAT_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/pick-root", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("240 per hour")
    def api_watchdog_pick_root():
        payload = request.get_json(silent=True) if request.is_json else {}
        if payload is None:
            payload = {}

        initial_path_raw = payload.get("initialPath")
        initial_path = str(initial_path_raw).strip() if initial_path_raw is not None else ""
        if initial_path and not os.path.isdir(initial_path):
            initial_path = ""

        try:
            selected_path = pick_directory_fn(initial_path or None)
            if not selected_path:
                return jsonify({"ok": True, "cancelled": True, "path": None}), 200

            if not os.path.isdir(selected_path):
                return (
                    jsonify(
                        {
                            "ok": False,
                            "cancelled": False,
                            "error": "Selected path is not a valid directory.",
                            "code": "WATCHDOG_PICKER_INVALID",
                        }
                    ),
                    400,
                )

            return (
                jsonify(
                    {
                        "ok": True,
                        "cancelled": False,
                        "path": os.path.abspath(selected_path),
                    }
                ),
                200,
            )
        except Exception as exc:
            logger.exception("Failed to open watchdog folder picker.")
            return (
                jsonify(
                    {
                        "ok": False,
                        "cancelled": False,
                        "error": "Folder picker is unavailable in this environment.",
                        "code": "WATCHDOG_PICKER_UNAVAILABLE",
                        "message": str(exc),
                    }
                ),
                503,
            )

    return bp
