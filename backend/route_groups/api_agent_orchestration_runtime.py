
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from .api_agent_orchestration_templates import (
    build_stage_a_prompt,
    build_stage_b_prompt,
    build_stage_c_prompt,
)
from .api_agent_profiles import dedupe_model_candidates

TERMINAL_RUN_STATUSES = {"completed", "failed", "cancelled"}
TASK_PRIORITIES = {"critical", "high", "medium", "low"}
TASK_STATUSES = {
    "queued",
    "running",
    "awaiting_review",
    "approved",
    "rework_requested",
    "deferred",
}
TERMINAL_TASK_STATUSES = {"approved", "rework_requested", "deferred"}
TASK_REVIEW_STATUS_BY_ACTION = {
    "approve": "approved",
    "rework": "rework_requested",
    "defer": "deferred",
}


def _normalize_task_priority(value: Any, *, fallback: str = "medium") -> str:
    normalized = str(value or "").strip().lower()
    if normalized in TASK_PRIORITIES:
        return normalized
    return fallback


def _normalize_task_status(value: Any, *, fallback: str = "queued") -> str:
    normalized = str(value or "").strip().lower()
    if normalized in TASK_STATUSES:
        return normalized
    return fallback


def _utc_iso_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_json_loads(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    try:
        return json.loads(str(value))
    except Exception:
        return fallback


def _normalize_profile_id(value: Any) -> str:
    return str(value or "").strip().lower()


def _extract_gateway_error(response: Any) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = None

    if isinstance(payload, dict):
        candidate = payload.get("error") or payload.get("message")
        if candidate:
            text = str(candidate).strip()
            if text:
                return text[:1000]

    text_body = str(getattr(response, "text", "") or "").strip()
    if text_body:
        return text_body[:1000]

    status_code = int(getattr(response, "status_code", 500) or 500)
    return f"Gateway request failed with status {status_code}."


def _extract_gateway_response_text(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("response", "reply", "output", "message"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        data_value = payload.get("data")
        if isinstance(data_value, str) and data_value.strip():
            return data_value.strip()

        if isinstance(data_value, dict):
            for key in ("response", "reply", "output", "message"):
                nested = data_value.get(key)
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()

        return json.dumps(payload, ensure_ascii=True)[:8000]

    if isinstance(payload, str):
        return payload.strip()

    return str(payload or "").strip()


class AgentRunOrchestrator:
    def __init__(
        self,
        *,
        ledger_path: Path,
        requests_module: Any,
        logger: Any,
        agent_gateway_url: str,
        agent_webhook_secret: str,
        agent_require_webhook_secret: bool,
        list_agent_profiles_fn: Callable[[], List[Dict[str, Any]]],
        resolve_agent_profile_route_fn: Callable[[str], Optional[Dict[str, Any]]],
        default_timeout_ms: int = 45_000,
        max_timeout_ms: int = 180_000,
        max_parallel_profiles: int = 4,
    ) -> None:
        self._ledger_path = Path(ledger_path).expanduser().resolve()
        self._requests = requests_module
        self._logger = logger
        self._agent_gateway_url = str(agent_gateway_url or "").strip().rstrip("/")
        self._agent_webhook_secret = str(agent_webhook_secret or "").strip()
        self._agent_require_webhook_secret = bool(agent_require_webhook_secret)
        self._list_agent_profiles = list_agent_profiles_fn
        self._resolve_agent_profile_route = resolve_agent_profile_route_fn
        self._default_timeout_ms = int(default_timeout_ms)
        self._max_timeout_ms = int(max_timeout_ms)
        self._max_parallel_profiles = max(1, int(max_parallel_profiles))

        self._db_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._cancel_events: Dict[str, threading.Event] = {}
        self._run_futures: Dict[str, Any] = {}
        self._executor = ThreadPoolExecutor(
            max_workers=max(4, self._max_parallel_profiles * 2),
            thread_name_prefix="suite-agent-runs",
        )

        self._init_db()

    def shutdown(self) -> None:
        with self._state_lock:
            for cancel_event in self._cancel_events.values():
                cancel_event.set()
        self._executor.shutdown(wait=True, cancel_futures=True)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            str(self._ledger_path),
            timeout=30,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        self._ledger_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL;")
            connection.execute("PRAGMA synchronous=NORMAL;")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS agent_runs (
                    run_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    profiles_json TEXT NOT NULL,
                    synthesis_profile TEXT NOT NULL,
                    context_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_id TEXT NOT NULL,
                    timeout_ms INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    cancelled_at TEXT,
                    final_output TEXT,
                    final_error TEXT
                );

                CREATE TABLE IF NOT EXISTS agent_run_steps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    step_index INTEGER NOT NULL,
                    profile_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    step_request_id TEXT NOT NULL,
                    prompt_hash TEXT NOT NULL,
                    model_primary TEXT NOT NULL,
                    model_attempts_json TEXT NOT NULL,
                    model_used TEXT,
                    latency_ms INTEGER,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    error_message TEXT,
                    response_text TEXT
                );

                CREATE TABLE IF NOT EXISTS agent_run_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    stage TEXT,
                    profile_id TEXT,
                    request_id TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_tasks (
                    task_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    assignee_profile TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    status TEXT NOT NULL,
                    review_action TEXT NOT NULL,
                    reviewer_id TEXT NOT NULL,
                    reviewer_note TEXT NOT NULL,
                    request_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT
                );

                CREATE TABLE IF NOT EXISTS agent_task_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    assignee_profile TEXT NOT NULL,
                    request_id TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run_id
                    ON agent_run_steps(run_id, id);

                CREATE INDEX IF NOT EXISTS idx_agent_run_messages_run_id
                    ON agent_run_messages(run_id, id);

                CREATE INDEX IF NOT EXISTS idx_agent_tasks_user
                    ON agent_tasks(user_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_agent_tasks_run
                    ON agent_tasks(run_id, assignee_profile, status);

                CREATE INDEX IF NOT EXISTS idx_agent_task_events_user
                    ON agent_task_events(user_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_agent_task_events_run
                    ON agent_task_events(run_id, id);
                """
            )

    def _write(self, query: str, params: Iterable[Any]) -> None:
        with self._db_lock:
            with self._connect() as connection:
                connection.execute(query, tuple(params))

    def _fetch_one(self, query: str, params: Iterable[Any]) -> Optional[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(query, tuple(params)).fetchone()

    def _fetch_all(self, query: str, params: Iterable[Any]) -> List[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(query, tuple(params)).fetchall()

    def _append_event(
        self,
        *,
        run_id: str,
        event_type: str,
        request_id: str,
        message: str,
        stage: str = "",
        profile_id: str = "",
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload_obj = dict(payload or {})
        payload_obj.setdefault("runId", run_id)
        payload_obj.setdefault("requestId", request_id)

        self._write(
            """
            INSERT INTO agent_run_messages (
                run_id, event_type, stage, profile_id, request_id, message, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                str(event_type or "event"),
                str(stage or ""),
                str(profile_id or ""),
                str(request_id or ""),
                str(message or ""),
                json.dumps(payload_obj, ensure_ascii=True),
                _utc_iso_now(),
            ),
        )

    def _serialize_task_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "taskId": str(row["task_id"]),
            "runId": str(row["run_id"]),
            "userId": str(row["user_id"]),
            "assigneeProfile": str(row["assignee_profile"]),
            "stage": str(row["stage"]),
            "title": str(row["title"]),
            "description": str(row["description"]),
            "priority": _normalize_task_priority(row["priority"]),
            "status": _normalize_task_status(row["status"]),
            "reviewAction": str(row["review_action"] or ""),
            "reviewerId": str(row["reviewer_id"] or ""),
            "reviewerNote": str(row["reviewer_note"] or ""),
            "requestId": str(row["request_id"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "startedAt": str(row["started_at"] or ""),
            "finishedAt": str(row["finished_at"] or ""),
        }

    def _append_task_event(
        self,
        *,
        task_id: str,
        run_id: str,
        user_id: str,
        event_type: str,
        status: str,
        priority: str,
        assignee_profile: str,
        request_id: str,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload_obj = dict(payload or {})
        payload_obj.setdefault("taskId", task_id)
        payload_obj.setdefault("runId", run_id)
        payload_obj.setdefault("requestId", request_id)
        payload_obj.setdefault("status", status)
        payload_obj.setdefault("priority", priority)
        payload_obj.setdefault("assigneeProfile", assignee_profile)

        self._write(
            """
            INSERT INTO agent_task_events (
                task_id, run_id, user_id, event_type, status, priority, assignee_profile,
                request_id, message, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(task_id),
                str(run_id),
                str(user_id),
                str(event_type or "task_event"),
                _normalize_task_status(status),
                _normalize_task_priority(priority),
                str(assignee_profile or ""),
                str(request_id or ""),
                str(message or ""),
                json.dumps(payload_obj, ensure_ascii=True),
                _utc_iso_now(),
            ),
        )

    def _resolve_profile_name(self, profile_id: str) -> str:
        normalized = _normalize_profile_id(profile_id)
        for profile in self._list_agent_profiles() or []:
            candidate = _normalize_profile_id(profile.get("id"))
            if candidate != normalized:
                continue
            name = str(profile.get("name") or "").strip()
            if name:
                return name
        return normalized or "agent"

    def _derive_task_priority(self, objective: str, context: Any) -> str:
        context_obj = context if isinstance(context, dict) else {}
        if isinstance(context_obj, dict):
            for key in ("priority", "taskPriority", "task_priority"):
                candidate = _normalize_task_priority(context_obj.get(key), fallback="")
                if candidate:
                    return candidate

        text = f"{objective} {json.dumps(context_obj, ensure_ascii=True)}".lower()
        if any(token in text for token in ("critical", "blocker", "sev1", "p0")):
            return "critical"
        if any(token in text for token in ("high", "urgent", "sev2", "p1")):
            return "high"
        if any(token in text for token in ("low", "backlog", "nice-to-have", "p3")):
            return "low"
        return "medium"

    def _create_run_tasks(
        self,
        *,
        run_id: str,
        user_id: str,
        objective: str,
        profiles: Iterable[str],
        request_id: str,
        context: Any,
    ) -> None:
        task_priority = self._derive_task_priority(objective, context)
        objective_preview = str(objective or "").strip()
        if len(objective_preview) > 260:
            objective_preview = f"{objective_preview[:257]}..."

        for profile_id in profiles:
            normalized_profile_id = _normalize_profile_id(profile_id)
            if not normalized_profile_id:
                continue
            now = _utc_iso_now()
            task_id = f"task-{uuid.uuid4().hex}"
            profile_name = self._resolve_profile_name(normalized_profile_id)
            title = f"{profile_name} task"
            description = (
                f"{profile_name} is assigned to the run objective: {objective_preview}"
                if objective_preview
                else f"{profile_name} is assigned to this orchestration run."
            )

            self._write(
                """
                INSERT INTO agent_tasks (
                    task_id, run_id, user_id, assignee_profile, stage, title, description,
                    priority, status, review_action, reviewer_id, reviewer_note, request_id,
                    created_at, updated_at, started_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    run_id,
                    str(user_id),
                    normalized_profile_id,
                    "stage_a",
                    title,
                    description,
                    task_priority,
                    "queued",
                    "",
                    "",
                    "",
                    str(request_id or ""),
                    now,
                    now,
                    "",
                    "",
                ),
            )

            self._append_task_event(
                task_id=task_id,
                run_id=run_id,
                user_id=str(user_id),
                event_type="task_queued",
                status="queued",
                priority=task_priority,
                assignee_profile=normalized_profile_id,
                request_id=str(request_id or ""),
                message=f"Task queued for {normalized_profile_id}.",
                payload={
                    "title": title,
                    "description": description,
                    "stage": "stage_a",
                },
            )

    def _get_task_row_for_profile(self, *, run_id: str, profile_id: str) -> Optional[sqlite3.Row]:
        return self._fetch_one(
            """
            SELECT * FROM agent_tasks
            WHERE run_id = ? AND assignee_profile = ?
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (run_id, _normalize_profile_id(profile_id)),
        )

    def _transition_task_status(
        self,
        *,
        task_row: sqlite3.Row,
        next_status: str,
        request_id: str,
        event_type: str,
        message: str,
        stage: str = "",
        reviewer_id: str = "",
        reviewer_note: str = "",
        review_action: str = "",
        attach_response: str = "",
        attach_error: str = "",
    ) -> Dict[str, Any]:
        task_id = str(task_row["task_id"])
        run_id = str(task_row["run_id"])
        user_id = str(task_row["user_id"])
        assignee_profile = str(task_row["assignee_profile"])
        priority = _normalize_task_priority(task_row["priority"])
        normalized_status = _normalize_task_status(next_status)
        current_status = _normalize_task_status(task_row["status"])

        if current_status == normalized_status and not any(
            [reviewer_id, reviewer_note, review_action, attach_response, attach_error]
        ):
            return self._serialize_task_row(task_row)

        started_at = str(task_row["started_at"] or "")
        if normalized_status in {"running", "awaiting_review"} and not started_at:
            started_at = _utc_iso_now()

        finished_at = str(task_row["finished_at"] or "")
        if normalized_status in TERMINAL_TASK_STATUSES:
            finished_at = _utc_iso_now()

        updated_at = _utc_iso_now()
        self._write(
            """
            UPDATE agent_tasks
            SET status = ?, stage = ?, review_action = ?, reviewer_id = ?, reviewer_note = ?,
                request_id = ?, updated_at = ?, started_at = ?, finished_at = ?
            WHERE task_id = ?
            """,
            (
                normalized_status,
                str(stage or task_row["stage"] or ""),
                str(review_action or task_row["review_action"] or ""),
                str(reviewer_id or task_row["reviewer_id"] or ""),
                str(reviewer_note or task_row["reviewer_note"] or ""),
                str(request_id or task_row["request_id"] or ""),
                updated_at,
                started_at,
                finished_at,
                task_id,
            ),
        )

        payload: Dict[str, Any] = {
            "fromStatus": current_status,
            "toStatus": normalized_status,
            "stage": str(stage or task_row["stage"] or ""),
        }
        if review_action:
            payload["reviewAction"] = review_action
        if reviewer_note:
            payload["reviewNote"] = reviewer_note
        if attach_response:
            payload["response"] = attach_response[:6000]
        if attach_error:
            payload["error"] = attach_error[:2000]

        self._append_task_event(
            task_id=task_id,
            run_id=run_id,
            user_id=user_id,
            event_type=event_type,
            status=normalized_status,
            priority=priority,
            assignee_profile=assignee_profile,
            request_id=str(request_id or task_row["request_id"] or ""),
            message=message,
            payload=payload,
        )

        refreshed = self._fetch_one("SELECT * FROM agent_tasks WHERE task_id = ?", (task_id,))
        if not refreshed:
            return {
                "taskId": task_id,
                "runId": run_id,
                "userId": user_id,
                "assigneeProfile": assignee_profile,
                "priority": priority,
                "status": normalized_status,
                "stage": str(stage or ""),
            }
        return self._serialize_task_row(refreshed)

    def _maybe_mark_task_running(
        self,
        *,
        run_id: str,
        profile_id: str,
        request_id: str,
        stage: str,
    ) -> None:
        task_row = self._get_task_row_for_profile(run_id=run_id, profile_id=profile_id)
        if not task_row:
            return
        current_status = _normalize_task_status(task_row["status"])
        if current_status != "queued":
            return
        self._transition_task_status(
            task_row=task_row,
            next_status="running",
            request_id=request_id,
            event_type="task_running",
            message=f"Task running for {_normalize_profile_id(profile_id)} in {stage}.",
            stage=stage,
        )

    def _maybe_mark_task_awaiting_review(
        self,
        *,
        run_id: str,
        profile_id: str,
        request_id: str,
        stage: str,
        response_text: str,
        error_text: str,
        failed: bool,
    ) -> None:
        task_row = self._get_task_row_for_profile(run_id=run_id, profile_id=profile_id)
        if not task_row:
            return
        current_status = _normalize_task_status(task_row["status"])
        if current_status in TERMINAL_TASK_STATUSES:
            return
        self._transition_task_status(
            task_row=task_row,
            next_status="awaiting_review",
            request_id=request_id,
            event_type="task_awaiting_review",
            message=(
                f"Task awaiting review after {stage} failure."
                if failed
                else f"Task awaiting review after {stage} completion."
            ),
            stage=stage,
            attach_response=response_text,
            attach_error=error_text,
        )

    def _bulk_transition_open_tasks(
        self,
        *,
        run_id: str,
        request_id: str,
        next_status: str,
        event_type: str,
        message: str,
    ) -> None:
        rows = self._fetch_all(
            """
            SELECT * FROM agent_tasks
            WHERE run_id = ? AND status IN (?, ?)
            ORDER BY created_at ASC
            """,
            (run_id, "queued", "running"),
        )
        for row in rows:
            self._transition_task_status(
                task_row=row,
                next_status=next_status,
                request_id=request_id,
                event_type=event_type,
                message=message,
                stage=str(row["stage"] or ""),
            )

    def list_tasks(
        self,
        *,
        user_id: str,
        statuses: Optional[Iterable[str]] = None,
        priority: str = "",
        assignee_profile: str = "",
        run_id: str = "",
        limit: int = 200,
        include_all_users: bool = False,
    ) -> List[Dict[str, Any]]:
        where_clauses: List[str] = []
        params: List[Any] = []

        normalized_user_id = str(user_id or "").strip()
        if not include_all_users:
            where_clauses.append("user_id = ?")
            params.append(normalized_user_id)

        normalized_statuses = [
            _normalize_task_status(status, fallback="")
            for status in (statuses or [])
            if _normalize_task_status(status, fallback="")
        ]
        if normalized_statuses:
            placeholders = ", ".join(["?"] * len(normalized_statuses))
            where_clauses.append(f"status IN ({placeholders})")
            params.extend(normalized_statuses)

        normalized_priority = _normalize_task_priority(priority, fallback="")
        if normalized_priority:
            where_clauses.append("priority = ?")
            params.append(normalized_priority)

        normalized_profile = _normalize_profile_id(assignee_profile)
        if normalized_profile:
            where_clauses.append("assignee_profile = ?")
            params.append(normalized_profile)

        normalized_run_id = str(run_id or "").strip()
        if normalized_run_id:
            where_clauses.append("run_id = ?")
            params.append(normalized_run_id)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        safe_limit = max(1, min(int(limit or 200), 500))
        query = f"""
            SELECT * FROM agent_tasks
            {where_sql}
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(safe_limit)
        rows = self._fetch_all(query, tuple(params))
        return [self._serialize_task_row(row) for row in rows]

    def get_task_owner(self, task_id: str) -> Optional[str]:
        row = self._fetch_one(
            "SELECT user_id FROM agent_tasks WHERE task_id = ?",
            (str(task_id or "").strip(),),
        )
        if not row:
            return None
        return str(row["user_id"])

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        row = self._fetch_one(
            "SELECT * FROM agent_tasks WHERE task_id = ?",
            (str(task_id or "").strip(),),
        )
        if not row:
            return None
        return self._serialize_task_row(row)

    def review_task(
        self,
        *,
        task_id: str,
        reviewer_id: str,
        action: str,
        note: str,
        request_id: str,
    ) -> Optional[Dict[str, Any]]:
        normalized_task_id = str(task_id or "").strip()
        if not normalized_task_id:
            raise ValueError("taskId is required.")

        normalized_action = str(action or "").strip().lower()
        if normalized_action not in TASK_REVIEW_STATUS_BY_ACTION:
            raise ValueError("action must be one of: approve, rework, defer.")

        row = self._fetch_one(
            "SELECT * FROM agent_tasks WHERE task_id = ?",
            (normalized_task_id,),
        )
        if not row:
            return None

        current_status = _normalize_task_status(row["status"])
        next_status = TASK_REVIEW_STATUS_BY_ACTION[normalized_action]
        if current_status not in {"awaiting_review", next_status}:
            raise ValueError(
                f"Task review action is only allowed from awaiting_review. Current status: {current_status}."
            )

        note_text = str(note or "").strip()
        return self._transition_task_status(
            task_row=row,
            next_status=next_status,
            request_id=str(request_id or row["request_id"] or ""),
            event_type="task_reviewed",
            message=f"Task {normalized_action} by reviewer.",
            reviewer_id=str(reviewer_id or ""),
            reviewer_note=note_text,
            review_action=normalized_action,
            stage=str(row["stage"] or ""),
        )

    def list_activity(
        self,
        *,
        user_id: str,
        run_id: str = "",
        limit: int = 200,
        include_all_users: bool = False,
    ) -> List[Dict[str, Any]]:
        normalized_user_id = str(user_id or "").strip()
        normalized_run_id = str(run_id or "").strip()
        safe_limit = max(1, min(int(limit or 200), 500))
        query_limit = max(safe_limit * 2, 100)

        run_where: List[str] = []
        run_params: List[Any] = []
        if not include_all_users:
            run_where.append("r.user_id = ?")
            run_params.append(normalized_user_id)
        if normalized_run_id:
            run_where.append("m.run_id = ?")
            run_params.append(normalized_run_id)
        run_where_sql = f"WHERE {' AND '.join(run_where)}" if run_where else ""

        task_where: List[str] = []
        task_params: List[Any] = []
        if not include_all_users:
            task_where.append("e.user_id = ?")
            task_params.append(normalized_user_id)
        if normalized_run_id:
            task_where.append("e.run_id = ?")
            task_params.append(normalized_run_id)
        task_where_sql = f"WHERE {' AND '.join(task_where)}" if task_where else ""

        run_rows = self._fetch_all(
            f"""
            SELECT
                m.id AS event_id,
                m.run_id AS run_id,
                m.event_type AS event_type,
                m.stage AS stage,
                m.profile_id AS profile_id,
                m.request_id AS request_id,
                m.message AS message,
                m.payload_json AS payload_json,
                m.created_at AS created_at
            FROM agent_run_messages m
            JOIN agent_runs r ON r.run_id = m.run_id
            {run_where_sql}
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT ?
            """,
            (*run_params, query_limit),
        )
        task_rows = self._fetch_all(
            f"""
            SELECT
                e.id AS event_id,
                e.task_id AS task_id,
                e.run_id AS run_id,
                e.event_type AS event_type,
                e.status AS status,
                e.priority AS priority,
                e.assignee_profile AS assignee_profile,
                e.request_id AS request_id,
                e.message AS message,
                e.payload_json AS payload_json,
                e.created_at AS created_at
            FROM agent_task_events e
            {task_where_sql}
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT ?
            """,
            (*task_params, query_limit),
        )

        merged: List[Dict[str, Any]] = []
        for row in run_rows:
            event_id = int(row["event_id"])
            merged.append(
                {
                    "activityId": f"run-{event_id}",
                    "source": "run",
                    "eventType": str(row["event_type"]),
                    "runId": str(row["run_id"]),
                    "taskId": "",
                    "profileId": str(row["profile_id"] or ""),
                    "status": "",
                    "priority": "",
                    "stage": str(row["stage"] or ""),
                    "requestId": str(row["request_id"]),
                    "message": str(row["message"]),
                    "payload": _safe_json_loads(row["payload_json"], {}),
                    "createdAt": str(row["created_at"]),
                }
            )

        for row in task_rows:
            event_id = int(row["event_id"])
            event_type = str(row["event_type"] or "")
            merged.append(
                {
                    "activityId": f"task-{event_id}",
                    "source": "review" if event_type == "task_reviewed" else "task",
                    "eventType": event_type,
                    "runId": str(row["run_id"]),
                    "taskId": str(row["task_id"]),
                    "profileId": str(row["assignee_profile"] or ""),
                    "status": _normalize_task_status(row["status"]),
                    "priority": _normalize_task_priority(row["priority"]),
                    "stage": "",
                    "requestId": str(row["request_id"]),
                    "message": str(row["message"]),
                    "payload": _safe_json_loads(row["payload_json"], {}),
                    "createdAt": str(row["created_at"]),
                }
            )

        merged.sort(
            key=lambda item: (
                str(item.get("createdAt") or ""),
                str(item.get("activityId") or ""),
            ),
            reverse=True,
        )
        return merged[:safe_limit]

    def _default_profiles(self) -> List[str]:
        configured = [
            _normalize_profile_id(profile.get("id"))
            for profile in (self._list_agent_profiles() or [])
            if _normalize_profile_id(profile.get("id"))
        ]
        preferred = [profile_id for profile_id in configured if profile_id != "koro"]
        return preferred if preferred else configured

    def enqueue_run(
        self,
        *,
        user_id: str,
        user_email: str,
        objective: str,
        profiles: Optional[Iterable[str]],
        synthesis_profile: str,
        context: Any,
        timeout_ms: Optional[int],
        request_id: str,
        gateway_token: str,
    ) -> str:
        objective_text = str(objective or "").strip()
        if not objective_text:
            raise ValueError("objective is required.")
        if not str(gateway_token or "").strip():
            raise ValueError("Agent session token is required.")

        configured_ids = {
            _normalize_profile_id(profile.get("id"))
            for profile in (self._list_agent_profiles() or [])
        }
        configured_ids.discard("")

        selected_profiles = dedupe_model_candidates(
            [_normalize_profile_id(value) for value in (profiles or [])]
        )
        if not selected_profiles:
            selected_profiles = self._default_profiles()
        selected_profiles = [profile_id for profile_id in selected_profiles if profile_id in configured_ids]
        if not selected_profiles:
            selected_profiles = self._default_profiles()
        if not selected_profiles:
            raise ValueError("No agent profiles are configured for orchestration.")

        synthesis_profile_id = _normalize_profile_id(synthesis_profile) or "koro"
        if synthesis_profile_id not in configured_ids:
            synthesis_profile_id = "koro" if "koro" in configured_ids else selected_profiles[0]

        timeout_value = int(timeout_ms or self._default_timeout_ms)
        timeout_value = max(3_000, min(timeout_value, self._max_timeout_ms))

        run_id = f"run-{uuid.uuid4().hex}"
        self._write(
            """
            INSERT INTO agent_runs (
                run_id, user_id, user_email, objective, profiles_json, synthesis_profile,
                context_json, status, request_id, timeout_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                str(user_id),
                str(user_email or ""),
                objective_text,
                json.dumps(selected_profiles, ensure_ascii=True),
                synthesis_profile_id,
                json.dumps(context if context is not None else {}, ensure_ascii=True),
                "queued",
                str(request_id),
                timeout_value,
                _utc_iso_now(),
            ),
        )
        self._create_run_tasks(
            run_id=run_id,
            user_id=str(user_id),
            objective=objective_text,
            profiles=selected_profiles,
            request_id=str(request_id or ""),
            context=context,
        )
        self._append_event(
            run_id=run_id,
            event_type="run_enqueued",
            request_id=request_id,
            message="Agent orchestration run enqueued.",
            payload={
                "status": "queued",
                "profiles": selected_profiles,
                "synthesisProfile": synthesis_profile_id,
            },
        )

        cancel_event = threading.Event()
        with self._state_lock:
            self._cancel_events[run_id] = cancel_event
            self._run_futures[run_id] = self._executor.submit(
                self._execute_run,
                run_id,
                str(gateway_token),
                str(request_id),
                cancel_event,
            )
        return run_id

    def get_run_owner(self, run_id: str) -> Optional[str]:
        row = self._fetch_one("SELECT user_id FROM agent_runs WHERE run_id = ?", (run_id,))
        if not row:
            return None
        return str(row["user_id"])

    def get_run_status(self, run_id: str) -> Optional[str]:
        row = self._fetch_one("SELECT status FROM agent_runs WHERE run_id = ?", (run_id,))
        if not row:
            return None
        return str(row["status"])

    def cancel_run(self, *, run_id: str, request_id: str) -> Optional[Dict[str, Any]]:
        status = self.get_run_status(run_id)
        if status is None:
            return None
        if status in TERMINAL_RUN_STATUSES:
            return {"status": status, "requestId": request_id}

        with self._state_lock:
            cancel_event = self._cancel_events.get(run_id)
            if cancel_event:
                cancel_event.set()

        self._write("UPDATE agent_runs SET status = ? WHERE run_id = ?", ("cancel_requested", run_id))
        self._append_event(
            run_id=run_id,
            event_type="run_cancel_requested",
            request_id=request_id,
            message="Cancellation requested.",
            payload={"status": "cancel_requested"},
        )
        return {"status": "cancel_requested", "requestId": request_id}

    def list_events(self, run_id: str, *, after_id: int = 0, limit: int = 200) -> List[Dict[str, Any]]:
        rows = self._fetch_all(
            """
            SELECT id, event_type, stage, profile_id, request_id, message, payload_json, created_at
            FROM agent_run_messages
            WHERE run_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (run_id, int(after_id), int(limit)),
        )
        result: List[Dict[str, Any]] = []
        for row in rows:
            result.append(
                {
                    "id": int(row["id"]),
                    "eventType": str(row["event_type"]),
                    "stage": str(row["stage"] or ""),
                    "profileId": str(row["profile_id"] or ""),
                    "requestId": str(row["request_id"]),
                    "message": str(row["message"]),
                    "payload": _safe_json_loads(row["payload_json"], {}),
                    "createdAt": str(row["created_at"]),
                }
            )
        return result

    def get_run_snapshot(self, run_id: str) -> Optional[Dict[str, Any]]:
        run_row = self._fetch_one("SELECT * FROM agent_runs WHERE run_id = ?", (run_id,))
        if not run_row:
            return None

        step_rows = self._fetch_all(
            "SELECT * FROM agent_run_steps WHERE run_id = ? ORDER BY id ASC",
            (run_id,),
        )
        message_rows = self._fetch_all(
            "SELECT * FROM agent_run_messages WHERE run_id = ? ORDER BY id ASC",
            (run_id,),
        )

        run_payload: Dict[str, Any] = {
            "runId": str(run_row["run_id"]),
            "userId": str(run_row["user_id"]),
            "userEmail": str(run_row["user_email"]),
            "objective": str(run_row["objective"]),
            "profiles": _safe_json_loads(run_row["profiles_json"], []),
            "synthesisProfile": str(run_row["synthesis_profile"]),
            "context": _safe_json_loads(run_row["context_json"], {}),
            "status": str(run_row["status"]),
            "requestId": str(run_row["request_id"]),
            "timeoutMs": int(run_row["timeout_ms"]),
            "createdAt": str(run_row["created_at"]),
            "startedAt": str(run_row["started_at"] or ""),
            "finishedAt": str(run_row["finished_at"] or ""),
            "cancelledAt": str(run_row["cancelled_at"] or ""),
            "finalOutput": str(run_row["final_output"] or ""),
            "finalError": str(run_row["final_error"] or ""),
        }

        steps = []
        stage_summary: Dict[str, Dict[str, int]] = {}
        for row in step_rows:
            status = str(row["status"])
            step_payload = {
                "id": int(row["id"]),
                "runId": str(row["run_id"]),
                "stage": str(row["stage"]),
                "stepIndex": int(row["step_index"]),
                "profileId": str(row["profile_id"]),
                "status": status,
                "stepRequestId": str(row["step_request_id"]),
                "promptHash": str(row["prompt_hash"]),
                "modelPrimary": str(row["model_primary"]),
                "modelAttempts": _safe_json_loads(row["model_attempts_json"], []),
                "modelUsed": str(row["model_used"] or ""),
                "latencyMs": int(row["latency_ms"] or 0),
                "startedAt": str(row["started_at"]),
                "finishedAt": str(row["finished_at"] or ""),
                "error": str(row["error_message"] or ""),
                "response": str(row["response_text"] or ""),
            }
            steps.append(step_payload)

            stage = step_payload["stage"]
            stage_item = stage_summary.setdefault(
                stage,
                {"total": 0, "completed": 0, "failed": 0, "cancelled": 0, "inProgress": 0},
            )
            stage_item["total"] += 1
            if status == "completed":
                stage_item["completed"] += 1
            elif status == "failed":
                stage_item["failed"] += 1
            elif status == "cancelled":
                stage_item["cancelled"] += 1
            else:
                stage_item["inProgress"] += 1

        run_payload["steps"] = steps
        run_payload["stages"] = stage_summary
        run_payload["messages"] = [
            {
                "id": int(row["id"]),
                "eventType": str(row["event_type"]),
                "stage": str(row["stage"] or ""),
                "profileId": str(row["profile_id"] or ""),
                "requestId": str(row["request_id"]),
                "message": str(row["message"]),
                "payload": _safe_json_loads(row["payload_json"], {}),
                "createdAt": str(row["created_at"]),
            }
            for row in message_rows
        ]
        return run_payload

    def _mark_run_terminal(
        self,
        *,
        run_id: str,
        status: str,
        request_id: str,
        final_output: str = "",
        final_error: str = "",
    ) -> None:
        finished_at = _utc_iso_now()
        cancelled_at = finished_at if status == "cancelled" else ""
        self._write(
            """
            UPDATE agent_runs
            SET status = ?, finished_at = ?, cancelled_at = ?, final_output = ?, final_error = ?
            WHERE run_id = ?
            """,
            (status, finished_at, cancelled_at, str(final_output), str(final_error), run_id),
        )

        if status == "completed":
            self._bulk_transition_open_tasks(
                run_id=run_id,
                request_id=request_id,
                next_status="awaiting_review",
                event_type="task_awaiting_review",
                message="Task awaiting reviewer decision after run completion.",
            )
        elif status in {"failed", "cancelled"}:
            self._bulk_transition_open_tasks(
                run_id=run_id,
                request_id=request_id,
                next_status="deferred",
                event_type="task_deferred",
                message=f"Task deferred because run {status}.",
            )

        self._append_event(
            run_id=run_id,
            event_type=f"run_{status}",
            request_id=request_id,
            message=f"Run {status}.",
            payload={"status": status},
        )

    def _is_cancel_requested(self, run_id: str, cancel_event: threading.Event) -> bool:
        if cancel_event.is_set():
            return True
        return self.get_run_status(run_id) == "cancel_requested"

    def _resolve_models(self, profile_id: str) -> tuple[str, List[str]]:
        route = self._resolve_agent_profile_route(profile_id) or {}
        primary = str(route.get("primary_model") or "").strip()
        fallbacks = [
            str(value).strip()
            for value in (route.get("fallback_models") or [])
            if str(value).strip()
        ]
        candidates = dedupe_model_candidates([primary, *fallbacks])
        return primary, candidates if candidates else [""]

    def _finalize_step(
        self,
        *,
        run_id: str,
        stage: str,
        profile_id: str,
        step_request_id: str,
        status: str,
        started_perf: float,
        model_used: str,
        response_text: str,
        error_text: str,
    ) -> Dict[str, Any]:
        latency_ms = max(0, int((time.perf_counter() - started_perf) * 1000))
        self._write(
            """
            UPDATE agent_run_steps
            SET status = ?, model_used = ?, latency_ms = ?, finished_at = ?, error_message = ?, response_text = ?
            WHERE run_id = ? AND step_request_id = ?
            """,
            (
                status,
                str(model_used),
                latency_ms,
                _utc_iso_now(),
                str(error_text),
                str(response_text),
                run_id,
                step_request_id,
            ),
        )

        event_type = "step_completed" if status == "completed" else "step_failed"
        if status == "cancelled":
            event_type = "step_cancelled"
        self._append_event(
            run_id=run_id,
            event_type=event_type,
            request_id=step_request_id,
            stage=stage,
            profile_id=profile_id,
            message=f"Step {status} for {profile_id} in {stage}.",
            payload={
                "stage": stage,
                "profileId": profile_id,
                "status": status,
                "latencyMs": latency_ms,
                "modelUsed": str(model_used),
                "error": str(error_text),
            },
        )

        if response_text:
            self._append_event(
                run_id=run_id,
                event_type="agent_message",
                request_id=step_request_id,
                stage=stage,
                profile_id=profile_id,
                message="Agent step response captured.",
                payload={
                    "stage": stage,
                    "profileId": profile_id,
                    "response": str(response_text),
                },
            )

        if stage in {"stage_a", "stage_b"} and status in {"completed", "failed", "cancelled"}:
            should_queue_review = stage == "stage_b" or status in {"failed", "cancelled"}
            if should_queue_review:
                self._maybe_mark_task_awaiting_review(
                    run_id=run_id,
                    profile_id=profile_id,
                    request_id=step_request_id,
                    stage=stage,
                    response_text=str(response_text or ""),
                    error_text=str(error_text or ""),
                    failed=status != "completed",
                )

        return {
            "status": status,
            "response": str(response_text),
            "error": str(error_text),
            "modelUsed": str(model_used),
            "requestId": step_request_id,
            "latencyMs": latency_ms,
        }

    def _execute_step(
        self,
        *,
        run_id: str,
        stage: str,
        step_index: int,
        profile_id: str,
        prompt: str,
        gateway_token: str,
        timeout_ms: int,
        run_request_id: str,
        cancel_event: threading.Event,
    ) -> Dict[str, Any]:
        started_perf = time.perf_counter()
        step_request_id = f"{run_request_id}:{stage}:{profile_id}:{uuid.uuid4().hex[:8]}"
        prompt_hash = hashlib.sha256(str(prompt).encode("utf-8")).hexdigest()[:16]
        model_primary, model_candidates = self._resolve_models(profile_id)

        self._write(
            """
            INSERT INTO agent_run_steps (
                run_id, stage, step_index, profile_id, status, step_request_id, prompt_hash,
                model_primary, model_attempts_json, started_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                stage,
                int(step_index),
                profile_id,
                "running",
                step_request_id,
                prompt_hash,
                model_primary,
                json.dumps(model_candidates, ensure_ascii=True),
                _utc_iso_now(),
            ),
        )

        self._append_event(
            run_id=run_id,
            event_type="step_started",
            request_id=step_request_id,
            stage=stage,
            profile_id=profile_id,
            message=f"Step started for {profile_id} in {stage}.",
            payload={
                "stage": stage,
                "profileId": profile_id,
                "stepIndex": int(step_index),
                "modelCandidates": model_candidates,
            },
        )
        self._maybe_mark_task_running(
            run_id=run_id,
            profile_id=profile_id,
            request_id=step_request_id,
            stage=stage,
        )

        if self._is_cancel_requested(run_id, cancel_event):
            return self._finalize_step(
                run_id=run_id,
                stage=stage,
                profile_id=profile_id,
                step_request_id=step_request_id,
                status="cancelled",
                started_perf=started_perf,
                model_used="",
                response_text="",
                error_text="Run cancellation requested.",
            )

        if self._agent_require_webhook_secret and not self._agent_webhook_secret:
            return self._finalize_step(
                run_id=run_id,
                stage=stage,
                profile_id=profile_id,
                step_request_id=step_request_id,
                status="failed",
                started_perf=started_perf,
                model_used="",
                response_text="",
                error_text="AGENT_WEBHOOK_SECRET is required but not configured.",
            )

        headers = {
            "Authorization": f"Bearer {gateway_token}",
            "Content-Type": "application/json",
        }
        if self._agent_webhook_secret:
            headers["X-Webhook-Secret"] = self._agent_webhook_secret

        timeout_seconds = max(3, int(timeout_ms / 1000))
        status_code = 0
        response_text = ""
        error_text = ""
        model_used = ""

        for index, candidate in enumerate(model_candidates):
            payload: Dict[str, Any] = {"message": prompt, "profile_id": profile_id}
            if candidate:
                payload["model"] = candidate
            if index < len(model_candidates) - 1:
                payload["fallback_models"] = model_candidates[index + 1 :]

            try:
                response = self._requests.post(
                    f"{self._agent_gateway_url}/webhook",
                    headers=headers,
                    json=payload,
                    timeout=timeout_seconds,
                )
                status_code = int(getattr(response, "status_code", 0) or 0)
            except Exception as exc:
                error_text = str(exc).strip() or exc.__class__.__name__
                if index < len(model_candidates) - 1:
                    self._logger.warning(
                        "Agent step request failed; trying fallback model (run_id=%s, stage=%s, profile=%s, model=%s, request_id=%s, error=%s)",
                        run_id,
                        stage,
                        profile_id,
                        candidate or "default",
                        step_request_id,
                        exc,
                    )
                    continue
                break

            if status_code >= 500 and index < len(model_candidates) - 1:
                self._logger.warning(
                    "Agent step gateway status=%s; trying fallback model (run_id=%s, stage=%s, profile=%s, model=%s, request_id=%s)",
                    status_code,
                    run_id,
                    stage,
                    profile_id,
                    candidate or "default",
                    step_request_id,
                )
                continue

            model_used = str(candidate or "")
            if status_code >= 400:
                error_text = _extract_gateway_error(response)
                break

            try:
                payload_obj = response.json()
            except Exception:
                payload_obj = {"response": str(getattr(response, "text", "") or "")}

            response_text = _extract_gateway_response_text(payload_obj)
            if isinstance(payload_obj, dict):
                model_used = str(payload_obj.get("model") or model_used).strip()
            break

        if response_text:
            return self._finalize_step(
                run_id=run_id,
                stage=stage,
                profile_id=profile_id,
                step_request_id=step_request_id,
                status="completed",
                started_perf=started_perf,
                model_used=model_used,
                response_text=response_text,
                error_text="",
            )

        if not error_text:
            if status_code:
                error_text = f"Gateway step failed with status {status_code}."
            else:
                error_text = "Gateway step failed without response."

        return self._finalize_step(
            run_id=run_id,
            stage=stage,
            profile_id=profile_id,
            step_request_id=step_request_id,
            status="failed",
            started_perf=started_perf,
            model_used=model_used,
            response_text="",
            error_text=error_text,
        )

    def _execute_stage(
        self,
        *,
        run_id: str,
        stage: str,
        prompts_by_profile: Mapping[str, str],
        gateway_token: str,
        timeout_ms: int,
        run_request_id: str,
        cancel_event: threading.Event,
    ) -> Dict[str, Dict[str, Any]]:
        results: Dict[str, Dict[str, Any]] = {}
        if not prompts_by_profile:
            return results

        max_workers = min(self._max_parallel_profiles, len(prompts_by_profile))
        with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix=f"suite-{stage}") as executor:
            future_map = {
                executor.submit(
                    self._execute_step,
                    run_id=run_id,
                    stage=stage,
                    step_index=index,
                    profile_id=profile_id,
                    prompt=prompt,
                    gateway_token=gateway_token,
                    timeout_ms=timeout_ms,
                    run_request_id=run_request_id,
                    cancel_event=cancel_event,
                ): profile_id
                for index, (profile_id, prompt) in enumerate(prompts_by_profile.items())
            }

            for future in as_completed(future_map):
                profile_id = future_map[future]
                try:
                    results[profile_id] = future.result()
                except Exception as exc:
                    self._logger.exception(
                        "Agent step execution crashed (run_id=%s, stage=%s, profile=%s): %s",
                        run_id,
                        stage,
                        profile_id,
                        exc,
                    )
                    results[profile_id] = {
                        "status": "failed",
                        "response": "",
                        "error": str(exc),
                        "modelUsed": "",
                        "requestId": run_request_id,
                        "latencyMs": 0,
                    }
        return results

    def _execute_run(
        self,
        run_id: str,
        gateway_token: str,
        run_request_id: str,
        cancel_event: threading.Event,
    ) -> None:
        try:
            row = self._fetch_one("SELECT * FROM agent_runs WHERE run_id = ?", (run_id,))
            if not row:
                return

            objective = str(row["objective"])
            profiles = [str(item) for item in _safe_json_loads(row["profiles_json"], [])]
            synthesis_profile = str(row["synthesis_profile"])
            context = _safe_json_loads(row["context_json"], {})
            timeout_ms = int(row["timeout_ms"])

            self._write(
                "UPDATE agent_runs SET status = ?, started_at = ? WHERE run_id = ?",
                ("running", _utc_iso_now(), run_id),
            )
            self._append_event(
                run_id=run_id,
                event_type="run_started",
                request_id=run_request_id,
                message="Run started.",
                payload={"status": "running"},
            )

            if self._is_cancel_requested(run_id, cancel_event):
                self._mark_run_terminal(
                    run_id=run_id,
                    status="cancelled",
                    request_id=run_request_id,
                    final_error="Run cancelled before execution.",
                )
                return

            stage_a_prompts = {
                profile_id: build_stage_a_prompt(profile_id=profile_id, objective=objective, context=context)
                for profile_id in profiles
            }
            stage_a_results = self._execute_stage(
                run_id=run_id,
                stage="stage_a",
                prompts_by_profile=stage_a_prompts,
                gateway_token=gateway_token,
                timeout_ms=timeout_ms,
                run_request_id=run_request_id,
                cancel_event=cancel_event,
            )
            stage_a_outputs = {
                profile_id: {
                    "status": result.get("status", "failed"),
                    "response": result.get("response", ""),
                    "error": result.get("error", ""),
                    "modelUsed": result.get("modelUsed", ""),
                    "requestId": result.get("requestId", ""),
                }
                for profile_id, result in stage_a_results.items()
            }

            if self._is_cancel_requested(run_id, cancel_event):
                self._mark_run_terminal(
                    run_id=run_id,
                    status="cancelled",
                    request_id=run_request_id,
                    final_error="Run cancelled during Stage A.",
                )
                return

            stage_b_prompts = {
                profile_id: build_stage_b_prompt(
                    profile_id=profile_id,
                    objective=objective,
                    stage_a_outputs=stage_a_outputs,
                )
                for profile_id in profiles
            }
            stage_b_results = self._execute_stage(
                run_id=run_id,
                stage="stage_b",
                prompts_by_profile=stage_b_prompts,
                gateway_token=gateway_token,
                timeout_ms=timeout_ms,
                run_request_id=run_request_id,
                cancel_event=cancel_event,
            )
            stage_b_outputs = {
                profile_id: {
                    "status": result.get("status", "failed"),
                    "response": result.get("response", ""),
                    "error": result.get("error", ""),
                    "modelUsed": result.get("modelUsed", ""),
                    "requestId": result.get("requestId", ""),
                }
                for profile_id, result in stage_b_results.items()
            }

            if self._is_cancel_requested(run_id, cancel_event):
                self._mark_run_terminal(
                    run_id=run_id,
                    status="cancelled",
                    request_id=run_request_id,
                    final_error="Run cancelled during Stage B.",
                )
                return

            synthesis_prompt = build_stage_c_prompt(
                synthesis_profile_id=synthesis_profile,
                objective=objective,
                stage_a_outputs=stage_a_outputs,
                stage_b_outputs=stage_b_outputs,
            )
            synthesis_result = self._execute_step(
                run_id=run_id,
                stage="stage_c",
                step_index=0,
                profile_id=synthesis_profile,
                prompt=synthesis_prompt,
                gateway_token=gateway_token,
                timeout_ms=timeout_ms,
                run_request_id=run_request_id,
                cancel_event=cancel_event,
            )

            if self._is_cancel_requested(run_id, cancel_event):
                self._mark_run_terminal(
                    run_id=run_id,
                    status="cancelled",
                    request_id=run_request_id,
                    final_error="Run cancelled during synthesis.",
                )
                return

            if synthesis_result.get("status") == "completed":
                self._mark_run_terminal(
                    run_id=run_id,
                    status="completed",
                    request_id=run_request_id,
                    final_output=str(synthesis_result.get("response") or ""),
                )
                return

            self._mark_run_terminal(
                run_id=run_id,
                status="failed",
                request_id=run_request_id,
                final_error=str(synthesis_result.get("error") or "Synthesis step failed."),
            )
        except Exception as exc:
            self._logger.exception("Agent orchestration run failed (run_id=%s): %s", run_id, exc)
            self._mark_run_terminal(
                run_id=run_id,
                status="failed",
                request_id=run_request_id,
                final_error=str(exc),
            )
        finally:
            with self._state_lock:
                self._cancel_events.pop(run_id, None)
                self._run_futures.pop(run_id, None)
