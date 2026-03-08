from __future__ import annotations

import json
import time
from typing import Any, Callable, Dict, Optional

from flask import Blueprint, Response, g, jsonify, request, stream_with_context
from flask_limiter import Limiter

from .api_agent_orchestration_runtime import TERMINAL_RUN_STATUSES


def _derive_request_id() -> str:
    headers = request.headers
    query = request.args
    if request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload = {}

    raw = (
        str(payload.get("requestId") or payload.get("request_id") or "").strip()
        or str(query.get("requestId") or query.get("request_id") or "").strip()
        or str(headers.get("X-Request-ID") or headers.get("X-Request-Id") or "").strip()
    )
    return raw[:128] if raw else f"req-{int(time.time() * 1000)}"


def _coerce_optional_timeout(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        timeout_value = int(value)
    except Exception:
        return None
    if timeout_value <= 0:
        return None
    return timeout_value


def _coerce_optional_limit(value: Any, *, default: int = 100, max_value: int = 500) -> int:
    if value is None:
        return default
    try:
        numeric = int(value)
    except Exception:
        return default
    if numeric <= 0:
        return default
    return min(numeric, max_value)


def _parse_csv_param(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def create_agent_orchestration_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    require_agent_session: Callable,
    get_supabase_user_id: Callable[[Dict[str, Any]], Optional[str]],
    get_supabase_user_email: Callable[[Dict[str, Any]], Optional[str]],
    is_admin_user: Callable[[Dict[str, Any]], bool],
    orchestrator: Any,
) -> Blueprint:
    bp = Blueprint("agent_orchestration_api", __name__, url_prefix="/api/agent")

    def _run_owner_or_403(run_id: str):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(get_supabase_user_id(user) or "").strip()
        if not user_id:
            return None, (jsonify({"success": False, "error": "Invalid user context."}), 401)

        run_owner = orchestrator.get_run_owner(run_id)
        if not run_owner:
            return None, (jsonify({"success": False, "error": "Run not found."}), 404)
        if run_owner != user_id and not is_admin_user(user):
            return None, (jsonify({"success": False, "error": "Run access denied."}), 403)
        return user, None

    def _task_owner_or_403(task_id: str):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(get_supabase_user_id(user) or "").strip()
        if not user_id:
            return None, (jsonify({"success": False, "error": "Invalid user context."}), 401)

        task_owner = orchestrator.get_task_owner(task_id)
        if not task_owner:
            return None, (jsonify({"success": False, "error": "Task not found."}), 404)
        if task_owner != user_id and not is_admin_user(user):
            return None, (jsonify({"success": False, "error": "Task access denied."}), 403)
        return user, None

    @bp.route("/runs", methods=["POST"])
    @require_supabase_user
    @require_agent_session
    @limiter.limit("20 per hour")
    def api_agent_runs_create():
        request_id = _derive_request_id()
        if not request.is_json:
            return jsonify({"success": False, "error": "Expected JSON payload.", "requestId": request_id}), 400

        payload = request.get_json(silent=True) or {}
        objective = str(payload.get("objective") or "").strip()
        profiles_raw = payload.get("profiles")
        synthesis_profile = str(payload.get("synthesisProfile") or payload.get("synthesis_profile") or "").strip()
        context = payload.get("context")
        timeout_ms = _coerce_optional_timeout(payload.get("timeoutMs") or payload.get("timeout_ms"))

        profiles = []
        if isinstance(profiles_raw, list):
            profiles = [str(value or "").strip() for value in profiles_raw if str(value or "").strip()]
        elif profiles_raw is not None:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "profiles must be an array of profile ids.",
                        "requestId": request_id,
                    }
                ),
                400,
            )

        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(get_supabase_user_id(user) or "").strip()
        user_email = str(get_supabase_user_email(user) or "").strip()
        session = getattr(g, "agent_session", {}) or {}
        gateway_token = str(session.get("token") or "").strip()

        if not user_id:
            return jsonify({"success": False, "error": "Invalid user context.", "requestId": request_id}), 401
        if not gateway_token:
            return jsonify({"success": False, "error": "Agent session missing.", "requestId": request_id}), 401

        try:
            run_id = orchestrator.enqueue_run(
                user_id=user_id,
                user_email=user_email,
                objective=objective,
                profiles=profiles,
                synthesis_profile=synthesis_profile,
                context=context,
                timeout_ms=timeout_ms,
                request_id=request_id,
                gateway_token=gateway_token,
            )
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc), "requestId": request_id}), 400
        except Exception as exc:
            logger.exception("Agent run enqueue failed (request_id=%s): %s", request_id, exc)
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Failed to enqueue agent run.",
                        "requestId": request_id,
                    }
                ),
                500,
            )

        return (
            jsonify(
                {
                    "success": True,
                    "runId": run_id,
                    "status": "queued",
                    "requestId": request_id,
                }
            ),
            202,
        )

    @bp.route("/runs/<run_id>", methods=["GET"])
    @require_supabase_user
    def api_agent_runs_get(run_id: str):
        request_id = _derive_request_id()
        _, owner_error = _run_owner_or_403(run_id)
        if owner_error:
            return owner_error[0], owner_error[1]

        snapshot = orchestrator.get_run_snapshot(run_id)
        if not snapshot:
            return jsonify({"success": False, "error": "Run not found.", "requestId": request_id}), 404

        return jsonify({"success": True, "run": snapshot, "requestId": request_id}), 200

    @bp.route("/runs/<run_id>/cancel", methods=["POST"])
    @require_supabase_user
    @limiter.limit("30 per hour")
    def api_agent_runs_cancel(run_id: str):
        request_id = _derive_request_id()
        _, owner_error = _run_owner_or_403(run_id)
        if owner_error:
            return owner_error[0], owner_error[1]

        result = orchestrator.cancel_run(run_id=run_id, request_id=request_id)
        if not result:
            return jsonify({"success": False, "error": "Run not found.", "requestId": request_id}), 404

        return (
            jsonify(
                {
                    "success": True,
                    "status": result.get("status") or "cancel_requested",
                    "requestId": request_id,
                }
            ),
            200,
        )

    @bp.route("/runs/<run_id>/events", methods=["GET"])
    @require_supabase_user
    def api_agent_runs_events(run_id: str):
        request_id = _derive_request_id()
        _, owner_error = _run_owner_or_403(run_id)
        if owner_error:
            return owner_error[0], owner_error[1]

        last_event_raw = request.args.get("lastEventId") or request.args.get("last_event_id") or "0"
        try:
            last_event_id = max(0, int(last_event_raw))
        except Exception:
            last_event_id = 0

        def _event_stream():
            cursor = last_event_id
            terminal_seen_without_updates = False
            while True:
                events = orchestrator.list_events(run_id, after_id=cursor, limit=200)
                if events:
                    terminal_seen_without_updates = False
                    for event in events:
                        cursor = int(event.get("id") or cursor)
                        payload = {
                            "runId": run_id,
                            "requestId": request_id,
                            **event,
                        }
                        yield f"id: {cursor}\n"
                        yield f"event: {event.get('eventType', 'event')}\n"
                        yield "data: " + json.dumps(payload, ensure_ascii=True) + "\n\n"

                status = orchestrator.get_run_status(run_id)
                if status in TERMINAL_RUN_STATUSES:
                    if terminal_seen_without_updates:
                        break
                    terminal_seen_without_updates = not bool(events)

                if not events:
                    yield ": keep-alive\n\n"
                    time.sleep(0.75)

        return Response(
            stream_with_context(_event_stream()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @bp.route("/tasks", methods=["GET"])
    @require_supabase_user
    def api_agent_tasks_list():
        request_id = _derive_request_id()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(get_supabase_user_id(user) or "").strip()
        if not user_id:
            return jsonify({"success": False, "error": "Invalid user context.", "requestId": request_id}), 401

        status_param = request.args.get("status") or request.args.get("statuses") or ""
        statuses = _parse_csv_param(status_param)
        priority = str(request.args.get("priority") or "").strip()
        assignee_profile = str(
            request.args.get("assigneeProfile")
            or request.args.get("assignee_profile")
            or ""
        ).strip()
        run_id = str(request.args.get("runId") or request.args.get("run_id") or "").strip()
        limit = _coerce_optional_limit(request.args.get("limit"), default=100, max_value=500)

        tasks = orchestrator.list_tasks(
            user_id=user_id,
            statuses=statuses,
            priority=priority,
            assignee_profile=assignee_profile,
            run_id=run_id,
            limit=limit,
            include_all_users=bool(is_admin_user(user)),
        )
        return jsonify({"success": True, "tasks": tasks, "requestId": request_id}), 200

    @bp.route("/tasks/<task_id>", methods=["GET"])
    @require_supabase_user
    def api_agent_tasks_get(task_id: str):
        request_id = _derive_request_id()
        _, owner_error = _task_owner_or_403(task_id)
        if owner_error:
            return owner_error[0], owner_error[1]

        task = orchestrator.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found.", "requestId": request_id}), 404
        return jsonify({"success": True, "task": task, "requestId": request_id}), 200

    @bp.route("/tasks/<task_id>/review", methods=["POST"])
    @require_supabase_user
    @limiter.limit("120 per hour")
    def api_agent_tasks_review(task_id: str):
        request_id = _derive_request_id()
        user, owner_error = _task_owner_or_403(task_id)
        if owner_error:
            return owner_error[0], owner_error[1]

        if not request.is_json:
            return jsonify({"success": False, "error": "Expected JSON payload.", "requestId": request_id}), 400

        payload = request.get_json(silent=True) or {}
        action = str(payload.get("action") or "").strip().lower()
        note = str(payload.get("note") or "").strip()
        reviewer_id = str(get_supabase_user_id(user or {}) or "").strip()
        if not reviewer_id:
            return jsonify({"success": False, "error": "Invalid user context.", "requestId": request_id}), 401

        try:
            task = orchestrator.review_task(
                task_id=task_id,
                reviewer_id=reviewer_id,
                action=action,
                note=note,
                request_id=request_id,
            )
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc), "requestId": request_id}), 400
        except Exception as exc:
            logger.exception("Agent task review failed (request_id=%s, task_id=%s): %s", request_id, task_id, exc)
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Failed to review task.",
                        "requestId": request_id,
                    }
                ),
                500,
            )

        if not task:
            return jsonify({"success": False, "error": "Task not found.", "requestId": request_id}), 404
        return jsonify({"success": True, "task": task, "requestId": request_id}), 200

    @bp.route("/activity", methods=["GET"])
    @require_supabase_user
    def api_agent_activity_list():
        request_id = _derive_request_id()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(get_supabase_user_id(user) or "").strip()
        if not user_id:
            return jsonify({"success": False, "error": "Invalid user context.", "requestId": request_id}), 401

        run_id = str(request.args.get("runId") or request.args.get("run_id") or "").strip()
        limit = _coerce_optional_limit(request.args.get("limit"), default=150, max_value=500)
        activity = orchestrator.list_activity(
            user_id=user_id,
            run_id=run_id,
            limit=limit,
            include_all_users=bool(is_admin_user(user)),
        )
        return jsonify({"success": True, "activity": activity, "requestId": request_id}), 200

    return bp
