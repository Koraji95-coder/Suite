from __future__ import annotations

import time
from typing import Any, Callable, Dict

import requests
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from .api_supabase_service_request import (
    supabase_service_rest_request as supabase_service_rest_request_helper,
)
from .api_watchdog_service import WatchdogMonitorService

Decorator = Callable[[Callable[..., Any]], Callable[..., Any]]


def create_watchdog_blueprint(
    *,
    require_autocad_auth: Decorator,
    require_watchdog_collector_auth: Decorator,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Decorator | None = None,
    supabase_url: str = "",
    supabase_api_key: str = "",
    time_module: Any = time,
    requests_module: Any = requests,
) -> Blueprint:
    """Create watchdog routes under /api/watchdog."""
    bp = Blueprint("watchdog_api", __name__, url_prefix="/api/watchdog")
    service = WatchdogMonitorService(time_module=time_module)
    supabase_url = str(supabase_url or "").strip()
    supabase_api_key = str(supabase_api_key or "").strip()

    def _require_supabase_user(endpoint: Callable[..., Any]) -> Callable[..., Any]:
        if require_supabase_user is None:
            return endpoint
        return require_supabase_user(endpoint)

    def _watchdog_user_key() -> str:
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(user.get("id") or user.get("sub") or "").strip()
        preferred_user_key = service.resolve_runtime_user_key()
        if preferred_user_key:
            return preferred_user_key
        if user_id:
            return f"user:{user_id}"

        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        remote_addr = str(request.remote_addr or "unknown")
        return f"{auth_mode}:{remote_addr}"

    def _extract_bearer_token() -> str | None:
        auth_header = str(request.headers.get("Authorization") or "").strip()
        if not auth_header:
            return None
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            return token or None
        return None

    def _watchdog_supabase_request(
        method: str,
        table_path: str,
        *,
        params: Dict[str, str] | None = None,
        payload: Any = None,
        extra_headers: Dict[str, str] | None = None,
    ) -> tuple[Any, str | None, int]:
        bearer_token = _extract_bearer_token()
        auth_key = bearer_token or supabase_api_key
        merged_headers = dict(extra_headers or {})
        if bearer_token and supabase_api_key:
            merged_headers["apikey"] = supabase_api_key
        return supabase_service_rest_request_helper(
            method,
            table_path,
            supabase_url=supabase_url,
            supabase_service_role_key=auth_key,
            params=params,
            payload=payload,
            extra_headers=merged_headers or None,
            timeout=12,
            requests_module=requests_module,
        )

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

    @bp.route("/dashboard", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_watchdog_dashboard():
        user_key = _watchdog_user_key()
        try:
            payload = service.dashboard_snapshot(
                user_key,
                project_id=request.args.get("projectId"),
                collector_id=request.args.get("collectorId"),
                time_window_ms=_parse_query_int("timeWindowMs", 24 * 60 * 60 * 1000)
                or 24 * 60 * 60 * 1000,
                events_limit=_parse_query_int("eventsLimit", 8) or 8,
                sessions_limit=_parse_query_int("sessionsLimit", 8) or 8,
            )
            return jsonify({"ok": True, **payload}), 200
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_DASHBOARD_INVALID_QUERY",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to build watchdog dashboard snapshot (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to build watchdog dashboard snapshot",
                        "code": "WATCHDOG_DASHBOARD_FAILED",
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

    @bp.route("/projects/<project_id>/rules", methods=["GET", "PUT", "DELETE"])
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

        if request.method == "DELETE":
            try:
                result = service.delete_project_rule(user_key, normalized_project_id)
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
                    "Failed to delete project watchdog rules (user=%s, project=%s)",
                    user_key,
                    normalized_project_id,
                )
                return (
                    jsonify(
                        {
                            "ok": False,
                            "error": "Failed to delete project watchdog rules",
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

    @bp.route("/project-rules/sync", methods=["POST"])
    @_require_supabase_user
    @limiter.limit("3600 per hour")
    def api_watchdog_project_rules_sync():
        user_key = _watchdog_user_key()
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
            result = service.sync_project_rules(user_key, payload)
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
            logger.exception("Failed to sync watchdog project rules (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to sync watchdog project rules",
                        "code": "WATCHDOG_PROJECT_RULES_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/drawing-activity/sync", methods=["POST"])
    @_require_supabase_user
    @limiter.limit("3600 per hour")
    def api_watchdog_drawing_activity_sync():
        user_key = _watchdog_user_key()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(user.get("id") or user.get("sub") or "").strip()
        if not user_id:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Authenticated user id not found.",
                        "code": "WATCHDOG_DRAWING_SYNC_AUTH_INVALID",
                    }
                ),
                401,
            )
        if not supabase_url or not supabase_api_key:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Supabase configuration is unavailable.",
                        "code": "WATCHDOG_DRAWING_SYNC_SUPABASE_UNAVAILABLE",
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) if request.is_json else {}
        if payload is None:
            payload = {}
        try:
            prepared = service.prepare_drawing_activity_sync(
                user_key,
                limit=int(payload.get("limit") or 100),
            )
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": str(exc),
                        "code": "WATCHDOG_DRAWING_SYNC_INVALID",
                    }
                ),
                400,
            )
        except Exception as exc:
            logger.exception("Failed to prepare drawing activity sync batch (user=%s)", user_key)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to prepare drawing activity sync batch",
                        "code": "WATCHDOG_DRAWING_SYNC_PREPARE_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

        rows = [dict(row, user_id=user_id) for row in (prepared.get("rows") or [])]
        last_scanned_event_id = int(prepared.get("lastScannedEventId") or 0)
        if not rows:
            cursor = service.mark_drawing_activity_synced(
                user_key,
                last_event_id=last_scanned_event_id,
                metadata={
                    "syncedAt": int(time_module.time() * 1000),
                    "syncedCount": 0,
                    "skippedCount": int(prepared.get("skippedCount") or 0),
                },
            )
            return (
                jsonify(
                    {
                        "ok": True,
                        "synced": 0,
                        "skipped": int(prepared.get("skippedCount") or 0),
                        "remaining": 0,
                        "cursor": cursor,
                    }
                ),
                200,
            )

        response_payload, response_error, response_status = _watchdog_supabase_request(
            "POST",
            "project_drawing_work_segments",
            params={"on_conflict": "sync_key"},
            payload=rows,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        if response_error:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": response_error,
                        "code": "WATCHDOG_DRAWING_SYNC_FAILED",
                        "status": response_status,
                    }
                ),
                500 if response_status < 400 else response_status,
            )

        synced_rows = response_payload if isinstance(response_payload, list) else rows
        cursor = service.mark_drawing_activity_synced(
            user_key,
            last_event_id=last_scanned_event_id,
            metadata={
                "syncedAt": int(time_module.time() * 1000),
                "syncedCount": len(rows),
                "skippedCount": int(prepared.get("skippedCount") or 0),
            },
        )
        return (
            jsonify(
                {
                    "ok": True,
                    "synced": len(rows),
                    "skipped": int(prepared.get("skippedCount") or 0),
                    "rows": synced_rows,
                    "cursor": cursor,
                }
            ),
            200,
        )

    return bp
