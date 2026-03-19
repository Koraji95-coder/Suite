from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def _safe_json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    except Exception:
        return "{}"


def _safe_json_loads(raw: Any, fallback: Any) -> Any:
    if raw is None:
        return fallback
    try:
        return json.loads(str(raw))
    except Exception:
        return fallback


def _optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class WatchdogLedger:
    def __init__(self, *, db_path: Path | str | None = None) -> None:
        resolved_path = (
            db_path
            or os.environ.get("SUITE_WATCHDOG_LEDGER_PATH")
            or os.environ.get("WATCHDOG_LEDGER_PATH")
        )
        if resolved_path:
            self.db_path = Path(resolved_path).expanduser().resolve()
        else:
            local_appdata = os.environ.get("LOCALAPPDATA")
            if local_appdata:
                self.db_path = (Path(local_appdata) / "Suite" / "watchdog" / "watchdog.sqlite3").resolve()
            else:
                self.db_path = (
                    Path.home() / "AppData" / "Local" / "Suite" / "watchdog" / "watchdog.sqlite3"
                ).resolve()
        self._lock = threading.RLock()
        self._ensure_schema()

    @contextmanager
    def _connect(self) -> Iterable[sqlite3.Connection]:
        connection = sqlite3.connect(
            str(self.db_path),
            timeout=30,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _ensure_schema(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL;")
            connection.execute("PRAGMA synchronous=NORMAL;")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS watchdog_legacy_states (
                    user_key TEXT PRIMARY KEY,
                    config_json TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    last_scan_json TEXT NOT NULL,
                    next_event_id INTEGER NOT NULL DEFAULT 1,
                    updated_at_ms INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS watchdog_user_state (
                    user_key TEXT PRIMARY KEY,
                    next_event_id INTEGER NOT NULL DEFAULT 1,
                    updated_at_ms INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS watchdog_collectors (
                    user_key TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    collector_type TEXT NOT NULL,
                    workstation_id TEXT NOT NULL,
                    capabilities_json TEXT NOT NULL DEFAULT '[]',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    last_heartbeat_at_ms INTEGER NOT NULL,
                    last_event_at_ms INTEGER NOT NULL DEFAULT 0,
                    event_count INTEGER NOT NULL DEFAULT 0,
                    last_sequence INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_key, collector_id)
                );

                CREATE INDEX IF NOT EXISTS idx_watchdog_collectors_user_heartbeat
                ON watchdog_collectors (user_key, last_heartbeat_at_ms DESC, updated_at_ms DESC);

                CREATE TABLE IF NOT EXISTS watchdog_events (
                    user_key TEXT NOT NULL,
                    event_id INTEGER NOT NULL,
                    collector_id TEXT NOT NULL,
                    collector_type TEXT NOT NULL,
                    workstation_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    timestamp_ms INTEGER NOT NULL,
                    project_id TEXT,
                    session_id TEXT,
                    path TEXT,
                    drawing_path TEXT,
                    event_key TEXT,
                    size_bytes INTEGER,
                    mtime_ms INTEGER,
                    duration_ms INTEGER,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (user_key, event_id)
                );

                CREATE INDEX IF NOT EXISTS idx_watchdog_events_user_timestamp
                ON watchdog_events (user_key, timestamp_ms DESC, event_id DESC);

                CREATE INDEX IF NOT EXISTS idx_watchdog_events_user_project
                ON watchdog_events (user_key, project_id, event_id DESC);

                CREATE INDEX IF NOT EXISTS idx_watchdog_events_user_collector
                ON watchdog_events (user_key, collector_id, event_id DESC);

                CREATE TABLE IF NOT EXISTS watchdog_event_keys (
                    user_key TEXT NOT NULL,
                    collector_id TEXT NOT NULL,
                    event_key TEXT NOT NULL,
                    event_id INTEGER NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (user_key, collector_id, event_key)
                );

                CREATE TABLE IF NOT EXISTS watchdog_hourly_rollups (
                    user_key TEXT NOT NULL,
                    bucket_start_ms INTEGER NOT NULL,
                    project_id TEXT NOT NULL DEFAULT '',
                    event_type TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    event_count INTEGER NOT NULL DEFAULT 0,
                    latest_event_at_ms INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_key, bucket_start_ms, project_id, event_type, source_type)
                );

                CREATE INDEX IF NOT EXISTS idx_watchdog_rollups_user_bucket
                ON watchdog_hourly_rollups (user_key, bucket_start_ms DESC, project_id);

                CREATE TABLE IF NOT EXISTS watchdog_project_rules (
                    user_key TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    roots_json TEXT NOT NULL DEFAULT '[]',
                    include_globs_json TEXT NOT NULL DEFAULT '[]',
                    exclude_globs_json TEXT NOT NULL DEFAULT '[]',
                    drawing_patterns_json TEXT NOT NULL DEFAULT '[]',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (user_key, project_id)
                );

                CREATE TABLE IF NOT EXISTS watchdog_sync_cursors (
                    user_key TEXT NOT NULL,
                    sync_name TEXT NOT NULL,
                    last_event_id INTEGER NOT NULL DEFAULT 0,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (user_key, sync_name)
                );
                """
            )

    def load_legacy_state(self, user_key: str) -> Optional[Dict[str, Any]]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT config_json, snapshot_json, last_scan_json, next_event_id
                FROM watchdog_legacy_states
                WHERE user_key = ?
                """,
                (user_key,),
            ).fetchone()
        if row is None:
            return None
        return {
            "config": _safe_json_loads(row["config_json"], {}),
            "snapshot": _safe_json_loads(row["snapshot_json"], {}),
            "last_scan": _safe_json_loads(row["last_scan_json"], {}),
            "next_event_id": int(row["next_event_id"] or 1),
        }

    def save_legacy_state(
        self,
        user_key: str,
        *,
        config: Dict[str, Any],
        snapshot: Dict[str, Any],
        last_scan: Dict[str, Any],
        next_event_id: int,
    ) -> None:
        now_ms = int(time.time() * 1000)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO watchdog_legacy_states (
                    user_key,
                    config_json,
                    snapshot_json,
                    last_scan_json,
                    next_event_id,
                    updated_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_key) DO UPDATE SET
                    config_json = excluded.config_json,
                    snapshot_json = excluded.snapshot_json,
                    last_scan_json = excluded.last_scan_json,
                    next_event_id = excluded.next_event_id,
                    updated_at_ms = excluded.updated_at_ms
                """,
                (
                    user_key,
                    _safe_json_dumps(config),
                    _safe_json_dumps(snapshot),
                    _safe_json_dumps(last_scan),
                    int(next_event_id),
                    now_ms,
                ),
            )

    def _ensure_user_state(
        self,
        connection: sqlite3.Connection,
        *,
        user_key: str,
        now_ms: int,
    ) -> int:
        row = connection.execute(
            """
            SELECT next_event_id
            FROM watchdog_user_state
            WHERE user_key = ?
            """,
            (user_key,),
        ).fetchone()
        if row is None:
            connection.execute(
                """
                INSERT INTO watchdog_user_state (user_key, next_event_id, updated_at_ms)
                VALUES (?, ?, ?)
                """,
                (user_key, 1, now_ms),
            )
            return 1
        return int(row["next_event_id"] or 1)

    def next_event_id(self, user_key: str) -> int:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT next_event_id
                FROM watchdog_user_state
                WHERE user_key = ?
                """,
                (user_key,),
            ).fetchone()
        if row is None:
            return 1
        return int(row["next_event_id"] or 1)

    def save_collector(self, user_key: str, collector: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(collector)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO watchdog_collectors (
                    user_key,
                    collector_id,
                    name,
                    collector_type,
                    workstation_id,
                    capabilities_json,
                    metadata_json,
                    status,
                    created_at_ms,
                    updated_at_ms,
                    last_heartbeat_at_ms,
                    last_event_at_ms,
                    event_count,
                    last_sequence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_key, collector_id) DO UPDATE SET
                    name = excluded.name,
                    collector_type = excluded.collector_type,
                    workstation_id = excluded.workstation_id,
                    capabilities_json = excluded.capabilities_json,
                    metadata_json = excluded.metadata_json,
                    status = excluded.status,
                    created_at_ms = excluded.created_at_ms,
                    updated_at_ms = excluded.updated_at_ms,
                    last_heartbeat_at_ms = excluded.last_heartbeat_at_ms,
                    last_event_at_ms = excluded.last_event_at_ms,
                    event_count = excluded.event_count,
                    last_sequence = excluded.last_sequence
                """,
                (
                    user_key,
                    str(payload.get("collectorId") or ""),
                    str(payload.get("name") or ""),
                    str(payload.get("collectorType") or ""),
                    str(payload.get("workstationId") or ""),
                    _safe_json_dumps(payload.get("capabilities") or []),
                    _safe_json_dumps(payload.get("metadata") or {}),
                    str(payload.get("status") or "unknown"),
                    int(payload.get("createdAt") or 0),
                    int(payload.get("updatedAt") or 0),
                    int(payload.get("lastHeartbeatAt") or 0),
                    int(payload.get("lastEventAt") or 0),
                    int(payload.get("eventCount") or 0),
                    int(payload.get("lastSequence") or 0),
                ),
            )
        return payload

    def get_collector(self, user_key: str, collector_id: str) -> Optional[Dict[str, Any]]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM watchdog_collectors
                WHERE user_key = ? AND collector_id = ?
                """,
                (user_key, collector_id),
            ).fetchone()
        return self._serialize_collector_row(row) if row is not None else None

    def list_collectors(self, user_key: str) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM watchdog_collectors
                WHERE user_key = ?
                ORDER BY last_heartbeat_at_ms DESC, updated_at_ms DESC
                """,
                (user_key,),
            ).fetchall()
        return [self._serialize_collector_row(row) for row in rows]

    def save_project_rule(self, user_key: str, rule: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(rule)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO watchdog_project_rules (
                    user_key,
                    project_id,
                    roots_json,
                    include_globs_json,
                    exclude_globs_json,
                    drawing_patterns_json,
                    metadata_json,
                    updated_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_key, project_id) DO UPDATE SET
                    roots_json = excluded.roots_json,
                    include_globs_json = excluded.include_globs_json,
                    exclude_globs_json = excluded.exclude_globs_json,
                    drawing_patterns_json = excluded.drawing_patterns_json,
                    metadata_json = excluded.metadata_json,
                    updated_at_ms = excluded.updated_at_ms
                """,
                (
                    user_key,
                    str(payload.get("projectId") or ""),
                    _safe_json_dumps(payload.get("roots") or []),
                    _safe_json_dumps(payload.get("includeGlobs") or []),
                    _safe_json_dumps(payload.get("excludeGlobs") or []),
                    _safe_json_dumps(payload.get("drawingPatterns") or []),
                    _safe_json_dumps(payload.get("metadata") or {}),
                    int(payload.get("updatedAt") or 0),
                ),
            )
        return payload

    def get_project_rule(self, user_key: str, project_id: str) -> Optional[Dict[str, Any]]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM watchdog_project_rules
                WHERE user_key = ? AND project_id = ?
                """,
                (user_key, project_id),
            ).fetchone()
        return self._serialize_project_rule_row(row) if row is not None else None

    def list_project_rules(self, user_key: str) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM watchdog_project_rules
                WHERE user_key = ?
                ORDER BY updated_at_ms DESC, project_id ASC
                """,
                (user_key,),
            ).fetchall()
        return [self._serialize_project_rule_row(row) for row in rows]

    def resolve_preferred_user_key(self) -> Optional[str]:
        query_plan = [
            ("SELECT user_key FROM watchdog_project_rules ORDER BY updated_at_ms DESC LIMIT 1", ()),
            ("SELECT user_key FROM watchdog_collectors ORDER BY updated_at_ms DESC LIMIT 1", ()),
            ("SELECT user_key FROM watchdog_sync_cursors ORDER BY updated_at_ms DESC LIMIT 1", ()),
            ("SELECT user_key FROM watchdog_user_state ORDER BY updated_at_ms DESC LIMIT 1", ()),
            ("SELECT user_key FROM watchdog_legacy_states ORDER BY updated_at_ms DESC LIMIT 1", ()),
            ("SELECT user_key FROM watchdog_events ORDER BY created_at_ms DESC LIMIT 1", ()),
        ]
        with self._lock, self._connect() as connection:
            for query, params in query_plan:
                row = connection.execute(query, params).fetchone()
                if row is None:
                    continue
                user_key = _optional_text(row["user_key"])
                if user_key:
                    return user_key
        return None

    def delete_project_rule(self, user_key: str, project_id: str) -> bool:
        normalized_project_id = _optional_text(project_id)
        if not normalized_project_id:
            return False
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                DELETE FROM watchdog_project_rules
                WHERE user_key = ? AND project_id = ?
                """,
                (user_key, normalized_project_id),
            )
        return int(cursor.rowcount or 0) > 0

    def get_sync_cursor(self, user_key: str, sync_name: str) -> Dict[str, Any]:
        normalized_sync_name = _optional_text(sync_name) or ""
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT last_event_id, metadata_json, updated_at_ms
                FROM watchdog_sync_cursors
                WHERE user_key = ? AND sync_name = ?
                """,
                (user_key, normalized_sync_name),
            ).fetchone()
        if row is None:
            return {
                "syncName": normalized_sync_name,
                "lastEventId": 0,
                "metadata": {},
                "updatedAt": 0,
            }
        return {
            "syncName": normalized_sync_name,
            "lastEventId": int(row["last_event_id"] or 0),
            "metadata": _safe_json_loads(row["metadata_json"], {}),
            "updatedAt": int(row["updated_at_ms"] or 0),
        }

    def save_sync_cursor(
        self,
        user_key: str,
        sync_name: str,
        *,
        last_event_id: int,
        metadata: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        normalized_sync_name = _optional_text(sync_name) or ""
        now_ms = int(time.time() * 1000)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO watchdog_sync_cursors (
                    user_key,
                    sync_name,
                    last_event_id,
                    metadata_json,
                    updated_at_ms
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_key, sync_name) DO UPDATE SET
                    last_event_id = excluded.last_event_id,
                    metadata_json = excluded.metadata_json,
                    updated_at_ms = excluded.updated_at_ms
                """,
                (
                    user_key,
                    normalized_sync_name,
                    max(0, int(last_event_id)),
                    _safe_json_dumps(metadata or {}),
                    now_ms,
                ),
            )
        return {
            "syncName": normalized_sync_name,
            "lastEventId": max(0, int(last_event_id)),
            "metadata": dict(metadata or {}),
            "updatedAt": now_ms,
        }

    def list_drawing_segment_source_events(
        self,
        user_key: str,
        *,
        after_event_id: int,
        limit: int,
    ) -> List[Dict[str, Any]]:
        safe_after = max(0, int(after_event_id))
        safe_limit = max(1, min(500, int(limit)))
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM watchdog_events
                WHERE user_key = ?
                  AND event_id > ?
                  AND event_type = 'drawing_closed'
                  AND project_id IS NOT NULL
                ORDER BY event_id ASC
                LIMIT ?
                """,
                (user_key, safe_after, safe_limit),
            ).fetchall()
        return [self._serialize_event_row(row) for row in rows]

    def insert_events(
        self,
        user_key: str,
        *,
        collector_id: str,
        events: Iterable[Dict[str, Any]],
        max_events_retained: int,
    ) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        inserted_events: List[Dict[str, Any]] = []
        duplicate_count = 0

        with self._lock, self._connect() as connection:
            next_event_id = self._ensure_user_state(
                connection,
                user_key=user_key,
                now_ms=now_ms,
            )
            for raw_event in events:
                event = dict(raw_event)
                event_key = _optional_text(event.get("eventKey"))
                if event_key:
                    existing = connection.execute(
                        """
                        SELECT event_id
                        FROM watchdog_event_keys
                        WHERE user_key = ? AND collector_id = ? AND event_key = ?
                        """,
                        (user_key, collector_id, event_key),
                    ).fetchone()
                    if existing is not None:
                        duplicate_count += 1
                        continue

                event["eventId"] = next_event_id
                next_event_id += 1
                created_at_ms = now_ms
                connection.execute(
                    """
                    INSERT INTO watchdog_events (
                        user_key,
                        event_id,
                        collector_id,
                        collector_type,
                        workstation_id,
                        event_type,
                        source_type,
                        timestamp_ms,
                        project_id,
                        session_id,
                        path,
                        drawing_path,
                        event_key,
                        size_bytes,
                        mtime_ms,
                        duration_ms,
                        metadata_json,
                        created_at_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_key,
                        int(event["eventId"]),
                        str(event.get("collectorId") or collector_id),
                        str(event.get("collectorType") or ""),
                        str(event.get("workstationId") or ""),
                        str(event.get("eventType") or "unknown"),
                        str(event.get("sourceType") or "collector"),
                        int(event.get("timestamp") or created_at_ms),
                        _optional_text(event.get("projectId")),
                        _optional_text(event.get("sessionId")),
                        _optional_text(event.get("path")),
                        _optional_text(event.get("drawingPath")),
                        event_key,
                        int(event["sizeBytes"]) if event.get("sizeBytes") is not None else None,
                        int(event["mtimeMs"]) if event.get("mtimeMs") is not None else None,
                        int(event["durationMs"])
                        if event.get("durationMs") is not None
                        else None,
                        _safe_json_dumps(event.get("metadata") or {}),
                        created_at_ms,
                    ),
                )
                if event_key:
                    connection.execute(
                        """
                        INSERT INTO watchdog_event_keys (
                            user_key,
                            collector_id,
                            event_key,
                            event_id,
                            created_at_ms
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            user_key,
                            collector_id,
                            event_key,
                            int(event["eventId"]),
                            created_at_ms,
                        ),
                    )
                self._increment_rollup(connection, user_key=user_key, event=event)
                inserted_events.append(event)

            connection.execute(
                """
                INSERT INTO watchdog_user_state (user_key, next_event_id, updated_at_ms)
                VALUES (?, ?, ?)
                ON CONFLICT(user_key) DO UPDATE SET
                    next_event_id = excluded.next_event_id,
                    updated_at_ms = excluded.updated_at_ms
                """,
                (user_key, int(next_event_id), now_ms),
            )

            overflow_rows = connection.execute(
                """
                SELECT event_id
                FROM watchdog_events
                WHERE user_key = ?
                ORDER BY event_id DESC
                LIMIT -1 OFFSET ?
                """,
                (user_key, max(1, int(max_events_retained))),
            ).fetchall()
            overflow_event_ids = [int(row["event_id"]) for row in overflow_rows]
            if overflow_event_ids:
                placeholders = ",".join("?" for _ in overflow_event_ids)
                params = [user_key, *overflow_event_ids]
                connection.execute(
                    f"""
                    DELETE FROM watchdog_event_keys
                    WHERE user_key = ? AND event_id IN ({placeholders})
                    """,
                    params,
                )
                connection.execute(
                    f"""
                    DELETE FROM watchdog_events
                    WHERE user_key = ? AND event_id IN ({placeholders})
                    """,
                    params,
                )

        return {
            "events": inserted_events,
            "duplicates": duplicate_count,
            "nextEventId": next_event_id,
        }

    def list_events(
        self,
        user_key: str,
        *,
        limit: int,
        after_event_id: int,
        collector_id: str | None = None,
        project_id: str | None = None,
        event_type: str | None = None,
        since_ms: int | None = None,
        until_ms: int | None = None,
    ) -> Dict[str, Any]:
        safe_limit = max(1, min(1000, int(limit)))
        safe_after = max(0, int(after_event_id))
        where_clauses = ["user_key = ?"]
        params: List[Any] = [user_key]

        if safe_after > 0:
            where_clauses.append("event_id > ?")
            params.append(safe_after)
        if collector_id:
            where_clauses.append("collector_id = ?")
            params.append(str(collector_id))
        if project_id:
            where_clauses.append("project_id = ?")
            params.append(str(project_id))
        if event_type:
            where_clauses.append("event_type = ?")
            params.append(str(event_type))
        if since_ms is not None:
            where_clauses.append("timestamp_ms >= ?")
            params.append(int(since_ms))
        if until_ms is not None:
            where_clauses.append("timestamp_ms <= ?")
            params.append(int(until_ms))

        where_sql = " AND ".join(where_clauses)
        order_sql = "event_id ASC" if safe_after > 0 else "event_id DESC"

        with self._lock, self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM watchdog_events
                WHERE {where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                (*params, safe_limit),
            ).fetchall()
            next_event_id = self._ensure_user_state(
                connection,
                user_key=user_key,
                now_ms=int(time.time() * 1000),
            )

        serialized = [self._serialize_event_row(row) for row in rows]
        if safe_after <= 0:
            serialized.reverse()
        last_event_id = int(serialized[-1]["eventId"]) if serialized else safe_after
        return {
            "events": serialized,
            "count": len(serialized),
            "afterEventId": safe_after,
            "lastEventId": last_event_id,
            "nextEventId": next_event_id,
        }

    def count_events(self, user_key: str, *, project_id: str | None = None) -> int:
        where_clauses = ["user_key = ?"]
        params: List[Any] = [user_key]
        if project_id:
            where_clauses.append("project_id = ?")
            params.append(project_id)
        where_sql = " AND ".join(where_clauses)
        with self._lock, self._connect() as connection:
            row = connection.execute(
                f"""
                SELECT COUNT(*) AS count
                FROM watchdog_events
                WHERE {where_sql}
                """,
                params,
            ).fetchone()
        return int((row or {})["count"] or 0)

    def list_recent_events(
        self,
        user_key: str,
        *,
        limit: int,
        project_id: str | None = None,
        since_ms: int | None = None,
    ) -> List[Dict[str, Any]]:
        where_clauses = ["user_key = ?"]
        params: List[Any] = [user_key]
        if project_id:
            where_clauses.append("project_id = ?")
            params.append(project_id)
        if since_ms is not None:
            where_clauses.append("timestamp_ms >= ?")
            params.append(int(since_ms))
        where_sql = " AND ".join(where_clauses)
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM watchdog_events
                WHERE {where_sql}
                ORDER BY event_id DESC
                LIMIT ?
                """,
                (*params, max(1, int(limit))),
            ).fetchall()
        return [self._serialize_event_row(row) for row in rows]

    def list_window_events(
        self,
        user_key: str,
        *,
        since_ms: int,
        project_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        where_clauses = ["user_key = ?", "timestamp_ms >= ?"]
        params: List[Any] = [user_key, int(since_ms)]
        if project_id:
            where_clauses.append("project_id = ?")
            params.append(project_id)
        where_sql = " AND ".join(where_clauses)
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM watchdog_events
                WHERE {where_sql}
                ORDER BY event_id ASC
                """,
                params,
            ).fetchall()
        return [self._serialize_event_row(row) for row in rows]

    def list_rollups(
        self,
        user_key: str,
        *,
        since_ms: int,
        project_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        where_clauses = ["user_key = ?", "bucket_start_ms >= ?"]
        params: List[Any] = [user_key, int(since_ms)]
        if project_id is not None:
            where_clauses.append("project_id = ?")
            params.append(project_id)
        where_sql = " AND ".join(where_clauses)
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    bucket_start_ms,
                    project_id,
                    event_type,
                    source_type,
                    event_count,
                    latest_event_at_ms
                FROM watchdog_hourly_rollups
                WHERE {where_sql}
                ORDER BY bucket_start_ms ASC
                """,
                params,
            ).fetchall()
        return [
            {
                "bucketStartMs": int(row["bucket_start_ms"] or 0),
                "projectId": str(row["project_id"] or ""),
                "eventType": str(row["event_type"] or "unknown"),
                "sourceType": str(row["source_type"] or "unknown"),
                "eventCount": int(row["event_count"] or 0),
                "latestEventAt": int(row["latest_event_at_ms"] or 0),
            }
            for row in rows
        ]

    def _increment_rollup(
        self,
        connection: sqlite3.Connection,
        *,
        user_key: str,
        event: Dict[str, Any],
    ) -> None:
        timestamp_ms = int(event.get("timestamp") or 0)
        bucket_start_ms = timestamp_ms - (timestamp_ms % (60 * 60 * 1000))
        project_id = str(event.get("projectId") or "")
        event_type = str(event.get("eventType") or "unknown")
        source_type = str(event.get("sourceType") or "unknown")
        connection.execute(
            """
            INSERT INTO watchdog_hourly_rollups (
                user_key,
                bucket_start_ms,
                project_id,
                event_type,
                source_type,
                event_count,
                latest_event_at_ms
            ) VALUES (?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(user_key, bucket_start_ms, project_id, event_type, source_type)
            DO UPDATE SET
                event_count = watchdog_hourly_rollups.event_count + 1,
                latest_event_at_ms = CASE
                    WHEN excluded.latest_event_at_ms > watchdog_hourly_rollups.latest_event_at_ms
                    THEN excluded.latest_event_at_ms
                    ELSE watchdog_hourly_rollups.latest_event_at_ms
                END
            """,
            (
                user_key,
                int(bucket_start_ms),
                project_id,
                event_type,
                source_type,
                int(timestamp_ms),
            ),
        )

    @staticmethod
    def _serialize_collector_row(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "collectorId": str(row["collector_id"] or ""),
            "name": str(row["name"] or ""),
            "collectorType": str(row["collector_type"] or ""),
            "workstationId": str(row["workstation_id"] or ""),
            "capabilities": _safe_json_loads(row["capabilities_json"], []),
            "metadata": _safe_json_loads(row["metadata_json"], {}),
            "status": str(row["status"] or "unknown"),
            "createdAt": int(row["created_at_ms"] or 0),
            "updatedAt": int(row["updated_at_ms"] or 0),
            "lastHeartbeatAt": int(row["last_heartbeat_at_ms"] or 0),
            "lastEventAt": int(row["last_event_at_ms"] or 0),
            "eventCount": int(row["event_count"] or 0),
            "lastSequence": int(row["last_sequence"] or 0),
        }

    @staticmethod
    def _serialize_event_row(row: sqlite3.Row) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "eventId": int(row["event_id"] or 0),
            "collectorId": str(row["collector_id"] or ""),
            "collectorType": str(row["collector_type"] or ""),
            "workstationId": str(row["workstation_id"] or ""),
            "eventType": str(row["event_type"] or "unknown"),
            "sourceType": str(row["source_type"] or "collector"),
            "timestamp": int(row["timestamp_ms"] or 0),
            "projectId": _optional_text(row["project_id"]),
            "sessionId": _optional_text(row["session_id"]),
            "path": _optional_text(row["path"]),
            "drawingPath": _optional_text(row["drawing_path"]),
            "metadata": _safe_json_loads(row["metadata_json"], {}),
        }
        event_key = _optional_text(row["event_key"])
        if event_key:
            payload["eventKey"] = event_key
        if row["size_bytes"] is not None:
            payload["sizeBytes"] = int(row["size_bytes"])
        if row["mtime_ms"] is not None:
            payload["mtimeMs"] = int(row["mtime_ms"])
        if row["duration_ms"] is not None:
            payload["durationMs"] = int(row["duration_ms"])
        return payload

    @staticmethod
    def _serialize_project_rule_row(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "projectId": str(row["project_id"] or ""),
            "roots": _safe_json_loads(row["roots_json"], []),
            "includeGlobs": _safe_json_loads(row["include_globs_json"], []),
            "excludeGlobs": _safe_json_loads(row["exclude_globs_json"], []),
            "drawingPatterns": _safe_json_loads(row["drawing_patterns_json"], []),
            "metadata": _safe_json_loads(row["metadata_json"], {}),
            "updatedAt": int(row["updated_at_ms"] or 0),
        }
