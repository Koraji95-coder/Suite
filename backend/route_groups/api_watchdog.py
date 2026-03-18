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
    require_watchdog_collector_auth: Decorator,
    limiter: Limiter,
    logger: Any,
    time_module: Any = time,
    pick_directory_fn: Callable[[str | None], str | None] = _pick_directory_dialog,
) -> Blueprint:
    """Create watchdog routes under /api/watchdog."""
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

    def _parse_query_int(name: str, default: int | None = None) -> int | None:
        raw = request.args.get(name)
        if raw is None or str(raw).strip() == "":
            return default
        try:
            return int(str(raw).strip())
        except Exception as exc:
            raise ValueError(f"Query parameter '{name}' must be an integer") from exc

    def _parse_query_bool(name: str, default: bool = False) -> bool:
        raw = request.args.get(name)
        if raw is None or str(raw).strip() == "":
            return default
        normalized = str(raw).strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
        raise ValueError(f"Query parameter '{name}' must be a boolean")

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

    @bp.route("/collectors/register", methods=["POST"])
    @require_watchdog_collector_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_collectors_register():
        if not request.is_json:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Expected JSON payload",
                        "code": "WATCHDOG_COLLECTOR_INVALID",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True) or {}
        user_key = _watchdog_user_key()
        try:
            result = service.register_collector(user_key, payload)
            return jsonify({"ok": True, **result}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_COLLECTOR_INVALID",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to register watchdog collector (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to register watchdog collector",
                        "code": "WATCHDOG_COLLECTOR_REGISTER_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/collectors/heartbeat", methods=["POST"])
    @require_watchdog_collector_auth
    @limiter.limit("7200 per hour")
    def api_watchdog_collectors_heartbeat():
        if not request.is_json:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Expected JSON payload",
                        "code": "WATCHDOG_COLLECTOR_HEARTBEAT_INVALID",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True) or {}
        user_key = _watchdog_user_key()
        try:
            result = service.collector_heartbeat(user_key, payload)
            return jsonify({"ok": True, **result}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_COLLECTOR_HEARTBEAT_INVALID",
                    }
                ),
                400,
            )
        except KeyError:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Collector is not registered",
                        "code": "WATCHDOG_COLLECTOR_NOT_FOUND",
                    }
                ),
                404,
            )
        except Exception as exc:
            logger.exception("Failed collector heartbeat (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Collector heartbeat failed",
                        "code": "WATCHDOG_COLLECTOR_HEARTBEAT_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/collectors/events", methods=["POST"])
    @require_watchdog_collector_auth
    @limiter.limit("12000 per hour")
    def api_watchdog_collectors_events():
        if not request.is_json:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Expected JSON payload",
                        "code": "WATCHDOG_COLLECTOR_EVENTS_INVALID",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True) or {}
        user_key = _watchdog_user_key()
        try:
            result = service.ingest_collector_events(user_key, payload)
            return jsonify({"ok": True, **result}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_COLLECTOR_EVENTS_INVALID",
                    }
                ),
                400,
            )
        except KeyError:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Collector is not registered",
                        "code": "WATCHDOG_COLLECTOR_NOT_FOUND",
                    }
                ),
                404,
            )
        except Exception as exc:
            logger.exception("Failed to ingest collector events (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Collector event ingest failed",
                        "code": "WATCHDOG_COLLECTOR_EVENTS_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/collectors", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_collectors_list():
        user_key = _watchdog_user_key()
        payload = service.list_collectors(user_key)
        return jsonify({"ok": True, **payload}), 200

    @bp.route("/events", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("7200 per hour")
    def api_watchdog_events():
        user_key = _watchdog_user_key()
        try:
            payload = service.list_events(
                user_key,
                limit=_parse_query_int("limit", 200) or 200,
                after_event_id=_parse_query_int("afterEventId", 0) or 0,
                collector_id=request.args.get("collectorId"),
                project_id=request.args.get("projectId"),
                event_type=request.args.get("eventType"),
                since_ms=_parse_query_int("sinceMs", None),
                until_ms=_parse_query_int("untilMs", None),
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_EVENTS_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to list watchdog events (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to list watchdog events",
                        "code": "WATCHDOG_EVENTS_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/overview", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_overview():
        user_key = _watchdog_user_key()
        try:
            payload = service.overview(
                user_key,
                project_id=request.args.get("projectId"),
                time_window_ms=_parse_query_int("timeWindowMs", 24 * 60 * 60 * 1000)
                or 24 * 60 * 60 * 1000,
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_OVERVIEW_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to build watchdog overview (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to build watchdog overview",
                        "code": "WATCHDOG_OVERVIEW_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/sessions", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_sessions():
        user_key = _watchdog_user_key()
        try:
            payload = service.list_sessions(
                user_key,
                limit=_parse_query_int("limit", 12) or 12,
                collector_id=request.args.get("collectorId"),
                project_id=request.args.get("projectId"),
                time_window_ms=_parse_query_int("timeWindowMs", 24 * 60 * 60 * 1000)
                or 24 * 60 * 60 * 1000,
                active_only=_parse_query_bool("activeOnly", False),
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_SESSIONS_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to list watchdog sessions (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to list watchdog sessions",
                        "code": "WATCHDOG_SESSIONS_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/projects/<project_id>/overview", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_project_overview(project_id: str):
        user_key = _watchdog_user_key()
        normalized_project_id = str(project_id or "").strip()
        if not normalized_project_id:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "project_id is required",
                        "code": "WATCHDOG_PROJECT_INVALID",
                    }
                ),
                400,
            )
        try:
            payload = service.overview(
                user_key,
                project_id=normalized_project_id,
                time_window_ms=_parse_query_int("timeWindowMs", 24 * 60 * 60 * 1000)
                or 24 * 60 * 60 * 1000,
            )
            return jsonify({"ok": True, **payload}), 200
        except Exception as exc:
            logger.exception(
                "Failed to build project watchdog overview (user=%s, project=%s)",
                user_key,
                normalized_project_id,
            )
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to build project watchdog overview",
                        "code": "WATCHDOG_PROJECT_OVERVIEW_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/projects/<project_id>/events", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("7200 per hour")
    def api_watchdog_project_events(project_id: str):
        user_key = _watchdog_user_key()
        normalized_project_id = str(project_id or "").strip()
        if not normalized_project_id:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "project_id is required",
                        "code": "WATCHDOG_PROJECT_INVALID",
                    }
                ),
                400,
            )
        try:
            payload = service.list_events(
                user_key,
                limit=_parse_query_int("limit", 200) or 200,
                after_event_id=_parse_query_int("afterEventId", 0) or 0,
                collector_id=request.args.get("collectorId"),
                project_id=normalized_project_id,
                event_type=request.args.get("eventType"),
                since_ms=_parse_query_int("sinceMs", None),
                until_ms=_parse_query_int("untilMs", None),
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_EVENTS_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception(
                "Failed to list project watchdog events (user=%s, project=%s)",
                user_key,
                normalized_project_id,
            )
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to list project watchdog events",
                        "code": "WATCHDOG_PROJECT_EVENTS_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/projects/<project_id>/sessions", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_project_sessions(project_id: str):
        user_key = _watchdog_user_key()
        normalized_project_id = str(project_id or "").strip()
        if not normalized_project_id:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "project_id is required",
                        "code": "WATCHDOG_PROJECT_INVALID",
                    }
                ),
                400,
            )
        try:
            payload = service.list_sessions(
                user_key,
                limit=_parse_query_int("limit", 12) or 12,
                collector_id=request.args.get("collectorId"),
                project_id=normalized_project_id,
                time_window_ms=_parse_query_int("timeWindowMs", 24 * 60 * 60 * 1000)
                or 24 * 60 * 60 * 1000,
                active_only=_parse_query_bool("activeOnly", False),
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_SESSIONS_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception(
                "Failed to list project watchdog sessions (user=%s, project=%s)",
                user_key,
                normalized_project_id,
            )
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to list project watchdog sessions",
                        "code": "WATCHDOG_PROJECT_SESSIONS_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/projects/<project_id>/rules", methods=["GET", "PUT"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_project_rules(project_id: str):
        user_key = _watchdog_user_key()
        normalized_project_id = str(project_id or "").strip()
        if not normalized_project_id:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "project_id is required",
                        "code": "WATCHDOG_PROJECT_INVALID",
                    }
                ),
                400,
            )

        if request.method == "GET":
            try:
                payload = service.get_project_rules(user_key, normalized_project_id)
                return jsonify({"ok": True, **payload}), 200
            except ValueError as exc:
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": str(exc),
                            "code": "WATCHDOG_PROJECT_RULES_INVALID",
                        }
                    ),
                    400,
                )
            except Exception as exc:
                logger.exception(
                    "Failed to load project watchdog rules (user=%s, project=%s)",
                    user_key,
                    normalized_project_id,
                )
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Failed to load project watchdog rules",
                            "code": "WATCHDOG_PROJECT_RULES_FAILED",
                            "message": str(exc),
                        }
                    ),
                    500,
                )

        if not request.is_json:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Expected JSON payload",
                        "code": "WATCHDOG_PROJECT_RULES_INVALID",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True) or {}
        try:
            result = service.upsert_project_rules(user_key, normalized_project_id, payload)
            return jsonify({"ok": True, **result}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_PROJECT_RULES_INVALID",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception(
                "Failed to save project watchdog rules (user=%s, project=%s)",
                user_key,
                normalized_project_id,
            )
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to save project watchdog rules",
                        "code": "WATCHDOG_PROJECT_RULES_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    return bp
