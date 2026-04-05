from __future__ import annotations

import secrets
import threading
import time
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from .api_supabase_service_request import (
    supabase_service_rest_request as supabase_service_rest_request_helper,
)

JOB_TTL_SECONDS = 10 * 60

_jobs_lock = threading.Lock()
_jobs: Dict[str, Dict[str, Any]] = {}


def _now_ts() -> float:
    return time.time()


def _extract_user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or user.get("sub") or "").strip()


def _extract_bearer_token() -> Optional[str]:
    auth_header = str(request.headers.get("Authorization") or "").strip()
    if not auth_header:
        return None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        return token or None
    return None


def _cleanup_expired_jobs() -> None:
    now = _now_ts()
    with _jobs_lock:
        expired_ids = [
            job_id
            for job_id, job in _jobs.items()
            if now - float(job.get("updated_at_ts") or 0) > JOB_TTL_SECONDS
        ]
        for job_id in expired_ids:
            _jobs.pop(job_id, None)


def _create_job(user_id: str) -> str:
    job_id = secrets.token_urlsafe(12)
    now = _now_ts()
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "user_id": user_id,
            "status": "pending",
            "stage": "queued",
            "message": "Queued",
            "progress": 0,
            "error": None,
            "data": None,
            "created_at_ts": now,
            "updated_at_ts": now,
        }
    return job_id


def _set_job_state(job_id: str, **updates: Any) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updated_at_ts"] = _now_ts()


def _get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return dict(job)


def _coerce_rows(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


def _request_user_rows(
    *,
    table_path: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    requests_module: Any,
    params: Optional[Dict[str, str]] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str], int]:
    payload, error, status_code = supabase_service_rest_request_helper(
        "GET",
        table_path,
        supabase_url=supabase_url,
        supabase_service_role_key=user_token,
        params=params,
        extra_headers={"apikey": supabase_api_key},
        timeout=10,
        requests_module=requests_module,
    )
    return _coerce_rows(payload), error, status_code


def _parse_iso_day(value: Any) -> Optional[date]:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except Exception:
        return None


def _build_task_counts(
    *,
    projects: List[Dict[str, Any]],
    tasks: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    tasks_by_project: Dict[str, List[Dict[str, Any]]] = {}
    for task in tasks:
        project_id = str(task.get("project_id") or "").strip()
        if not project_id:
            continue
        tasks_by_project.setdefault(project_id, []).append(task)

    today = date.today()
    counts: Dict[str, Dict[str, Any]] = {}

    for project in projects:
        project_id = str(project.get("id") or "").strip()
        if not project_id:
            continue

        project_tasks = tasks_by_project.get(project_id, [])
        completed = 0
        has_overdue = False
        next_due: Optional[Dict[str, str]] = None
        next_due_date: Optional[date] = None

        for task in project_tasks:
            if bool(task.get("completed")):
                completed += 1
                continue

            due_date_raw = task.get("due_date")
            due_day = _parse_iso_day(due_date_raw)
            if due_day is None:
                continue

            if due_day < today:
                has_overdue = True
                continue

            if next_due_date is None or due_day < next_due_date:
                next_due_date = due_day
                next_due = {
                    "name": str(task.get("name") or "Untitled task"),
                    "date": str(due_date_raw),
                }

        counts[project_id] = {
            "total": len(project_tasks),
            "completed": completed,
            "nextDue": next_due,
            "hasOverdue": has_overdue,
        }

    return counts


def _sum_storage_bytes(files: List[Dict[str, Any]]) -> int:
    total = 0
    for file_item in files:
        size_raw = file_item.get("size")
        if isinstance(size_raw, bool):
            continue
        if isinstance(size_raw, (int, float)):
            total += int(size_raw)
            continue
        if isinstance(size_raw, str):
            try:
                total += int(float(size_raw))
            except Exception:
                continue
    return total


def _fail_job(
    *,
    job_id: str,
    stage: str,
    message: str,
    error: str,
    logger: Any,
) -> None:
    logger.warning("Dashboard load failed at %s: %s", stage, error)
    _set_job_state(
        job_id,
        status="error",
        stage=stage,
        message=message,
        error=error,
    )


def _run_dashboard_load_job(
    *,
    job_id: str,
    user_id: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    logger: Any,
    requests_module: Any,
) -> None:
    try:
        _set_job_state(
            job_id,
            status="running",
            stage="projects",
            message="Loading active projects...",
            progress=10,
        )

        projects, error, _ = _request_user_rows(
            table_path="projects",
            user_token=user_token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            requests_module=requests_module,
            params={
                "select": "id,name,deadline,status,priority,color,category",
                "user_id": f"eq.{user_id}",
                "status": "eq.active",
                "order": "deadline.asc.nullslast",
                "limit": "5",
            },
        )
        if error:
            _fail_job(
                job_id=job_id,
                stage="projects",
                message="Could not load projects.",
                error=error,
                logger=logger,
            )
            return

        _set_job_state(
            job_id,
            stage="activity",
            message="Loading recent activity...",
            progress=30,
        )
        activities, error, _ = _request_user_rows(
            table_path="activity_log",
            user_token=user_token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            requests_module=requests_module,
            params={
                "select": "id,action,description,project_id,task_id,timestamp,user_id",
                "user_id": f"eq.{user_id}",
                "order": "timestamp.desc",
                "limit": "7",
            },
        )
        if error:
            _fail_job(
                job_id=job_id,
                stage="activity",
                message="Could not load activity.",
                error=error,
                logger=logger,
            )
            return

        _set_job_state(
            job_id,
            stage="files",
            message="Calculating storage usage...",
            progress=45,
        )
        files, error, _ = _request_user_rows(
            table_path="files",
            user_token=user_token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            requests_module=requests_module,
            params={
                "select": "size",
                "user_id": f"eq.{user_id}",
            },
        )
        if error:
            _fail_job(
                job_id=job_id,
                stage="files",
                message="Could not calculate storage usage.",
                error=error,
                logger=logger,
            )
            return

        task_counts: Dict[str, Dict[str, Any]] = {}
        if projects:
            _set_job_state(
                job_id,
                stage="tasks",
                message="Loading project task progress...",
                progress=62,
            )

            project_ids = [
                str(project.get("id") or "").strip()
                for project in projects
                if str(project.get("id") or "").strip()
            ]
            tasks: List[Dict[str, Any]] = []
            if project_ids:
                in_filter = f"in.({','.join(project_ids)})"
                tasks, error, _ = _request_user_rows(
                    table_path="tasks",
                    user_token=user_token,
                    supabase_url=supabase_url,
                    supabase_api_key=supabase_api_key,
                    requests_module=requests_module,
                    params={
                        "select": "id,project_id,completed,due_date,name",
                        "user_id": f"eq.{user_id}",
                        "project_id": in_filter,
                    },
                )
                if error:
                    _fail_job(
                        job_id=job_id,
                        stage="tasks",
                        message="Could not load task progress.",
                        error=error,
                        logger=logger,
                    )
                    return

            task_counts = _build_task_counts(projects=projects, tasks=tasks)

        _set_job_state(
            job_id,
            stage="activity-projects",
            message="Resolving activity project references...",
            progress=82,
        )
        project_map: Dict[str, Dict[str, Any]] = {
            str(project.get("id") or ""): project
            for project in projects
            if str(project.get("id") or "").strip()
        }

        missing_project_ids = sorted(
            {
                str(activity.get("project_id") or "").strip()
                for activity in activities
                if str(activity.get("project_id") or "").strip()
                and str(activity.get("project_id") or "").strip() not in project_map
            }
        )

        if missing_project_ids:
            related_projects, error, _ = _request_user_rows(
                table_path="projects",
                user_token=user_token,
                supabase_url=supabase_url,
                supabase_api_key=supabase_api_key,
                requests_module=requests_module,
                params={
                    "select": "id,name,deadline,status,priority,color,category",
                    "user_id": f"eq.{user_id}",
                    "id": f"in.({','.join(missing_project_ids)})",
                },
            )
            if error:
                _fail_job(
                    job_id=job_id,
                    stage="activity-projects",
                    message="Could not resolve activity project references.",
                    error=error,
                    logger=logger,
                )
                return
            for project in related_projects:
                project_id = str(project.get("id") or "").strip()
                if project_id:
                    project_map[project_id] = project

        _set_job_state(
            job_id,
            status="complete",
            stage="complete",
            message="Dashboard ready.",
            progress=100,
            data={
                "projects": projects,
                "activities": activities,
                "storageUsed": _sum_storage_bytes(files),
                "projectTaskCounts": task_counts,
                "allProjects": list(project_map.values()),
            },
            error=None,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("Unexpected dashboard load failure")
        _set_job_state(
            job_id,
            status="error",
            stage="error",
            message="Dashboard load failed.",
            error="An unexpected error occurred.",
        )


def create_dashboard_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    supabase_url: str,
    supabase_api_key: str,
    requests_module: Any = requests,
) -> Blueprint:
    """Create /api/dashboard route group blueprint."""
    bp = Blueprint("dashboard_api", __name__, url_prefix="/api/dashboard")

    @bp.route("/load", methods=["POST"])
    @require_supabase_user
    @limiter.limit("120 per hour")
    def start_dashboard_load():
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"error": "Authenticated user id not found."}), 401

        token = _extract_bearer_token()
        if not token:
            return jsonify({"error": "Authorization bearer token required."}), 401

        if not supabase_url or not supabase_api_key:
            return jsonify({"error": "Supabase backend credentials are not configured."}), 503

        _cleanup_expired_jobs()
        job_id = _create_job(user_id)

        worker = threading.Thread(
            target=_run_dashboard_load_job,
            kwargs={
                "job_id": job_id,
                "user_id": user_id,
                "user_token": token,
                "supabase_url": supabase_url,
                "supabase_api_key": supabase_api_key,
                "logger": logger,
                "requests_module": requests_module,
            },
            daemon=True,
            name=f"dashboard-load-{job_id}",
        )
        worker.start()

        return jsonify({"ok": True, "job_id": job_id, "status": "pending"}), 202

    @bp.route("/load/<job_id>", methods=["GET"])
    @require_supabase_user
    @limiter.limit("1500 per hour")
    def get_dashboard_load_status(job_id: str):
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _extract_user_id(user)
        if not user_id:
            return jsonify({"error": "Authenticated user id not found."}), 401

        _cleanup_expired_jobs()
        job = _get_job(job_id)
        if not job or str(job.get("user_id") or "") != user_id:
            return jsonify({"error": "Dashboard load job not found."}), 404

        payload: Dict[str, Any] = {
            "ok": True,
            "job_id": job_id,
            "status": str(job.get("status") or "pending"),
            "stage": str(job.get("stage") or "queued"),
            "message": str(job.get("message") or ""),
            "progress": int(job.get("progress") or 0),
        }

        if payload["status"] == "complete":
            payload["data"] = job.get("data") or {}
        elif payload["status"] == "error":
            payload["error"] = str(job.get("error") or "Dashboard load failed.")

        return jsonify(payload), 200

    return bp
