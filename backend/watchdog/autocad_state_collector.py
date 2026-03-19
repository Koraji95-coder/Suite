from __future__ import annotations

import json
import os
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from .filesystem_collector import FilesystemCollectorStateStore, WatchdogCollectorApiClient


def _default_state_json_path() -> Path:
    app_data = os.environ.get("APPDATA")
    if app_data:
        base_dir = Path(app_data)
    else:
        base_dir = Path.home() / "AppData" / "Roaming"
    return (base_dir / "CadCommandCenter" / "tracker-state.json").resolve()


def _default_buffer_dir(collector_id: str) -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        base_dir = Path(local_appdata)
    else:
        base_dir = Path.home() / "AppData" / "Local"
    return (base_dir / "Suite" / "watchdog-autocad-collector" / collector_id).resolve()


def _split_string_list(raw_value: Any) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item or "").strip()]
    if isinstance(raw_value, str):
        values: list[str] = []
        for chunk in raw_value.replace(";", ",").splitlines():
            for item in chunk.split(","):
                text = item.strip()
                if text:
                    values.append(text)
        return values
    return [str(raw_value).strip()] if str(raw_value).strip() else []


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _timestamp_ms_from_value(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        pass

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def _duration_ms_from_value(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text:
        return None

    sign = -1 if text.startswith("-") else 1
    if sign < 0:
        text = text[1:]

    day_part = 0
    time_part = text
    if "." in text and text.count(":") == 2:
        first_dot = text.find(".")
        day_token = text[:first_dot]
        remainder = text[first_dot + 1 :]
        if day_token.isdigit() and remainder.count(":") == 2:
            day_part = int(day_token)
            time_part = remainder

    pieces = time_part.split(":")
    if len(pieces) != 3:
        return None

    try:
        hours = int(pieces[0])
        minutes = int(pieces[1])
        seconds_token = pieces[2]
        if "." in seconds_token:
            seconds_whole, fraction = seconds_token.split(".", 1)
            seconds = int(seconds_whole)
            fractional_ms = int(round(float(f"0.{fraction}") * 1000))
        else:
            seconds = int(seconds_token)
            fractional_ms = 0
    except ValueError:
        return None

    total_ms = (
        (((day_part * 24) + hours) * 60 * 60) + (minutes * 60) + seconds
    ) * 1000 + fractional_ms
    return sign * total_ms


def _session_key(session: Mapping[str, Any] | None) -> str | None:
    if not isinstance(session, Mapping):
        return None
    session_id = _optional_text(session.get("sessionId"))
    if session_id:
        return session_id
    full_path = _optional_text(session.get("fullPath")) or _optional_text(session.get("drawingPath"))
    started_at = _optional_text(session.get("startedAt"))
    drawing_name = _optional_text(session.get("drawingName"))
    if full_path and started_at:
        return f"{full_path}|{started_at}"
    if drawing_name and started_at:
        return f"{drawing_name}|{started_at}"
    return full_path or drawing_name


def _metadata_from_tracker_state(state: Mapping[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(state, Mapping):
        return {"sourceAvailable": False}

    current_session = state.get("currentSession")
    current_session_key = _session_key(current_session if isinstance(current_session, Mapping) else None)
    current_session_command_count = 0
    current_session_started_at = None
    current_session_tracked_ms = 0
    current_session_idle_ms = 0
    if isinstance(current_session, Mapping):
        try:
            current_session_command_count = max(0, int(current_session.get("commandCount") or 0))
        except Exception:
            current_session_command_count = 0
        current_session_started_at = _optional_text(current_session.get("startedAt"))
        current_session_tracked_ms = max(
            0,
            _duration_ms_from_value(current_session.get("activeTime")) or 0,
        )
        current_session_idle_ms = max(
            0,
            _duration_ms_from_value(current_session.get("idleTime")) or 0,
        )

    return {
        "sourceAvailable": True,
        "isTracking": bool(state.get("isTracking")),
        "isPaused": bool(state.get("isPaused")),
        "activeDrawing": _optional_text(state.get("activeDrawing")),
        "activeDrawingPath": _optional_text(state.get("activeDrawingPath")),
        "lastUpdated": _timestamp_ms_from_value(state.get("lastUpdated")) or 0,
        "lastActivityAt": _timestamp_ms_from_value(state.get("lastActivityAt")) or 0,
        "currentSessionId": current_session_key,
        "currentSessionStartedAt": current_session_started_at,
        "currentSessionTrackedMs": current_session_tracked_ms,
        "currentSessionIdleMs": current_session_idle_ms,
        "currentSessionCommandCount": current_session_command_count,
        "idleTimeoutSeconds": int(state.get("idleTimeoutSeconds") or 0),
    }


@dataclass(slots=True)
class AutoCadStateCollectorConfig:
    backend_url: str
    collector_id: str
    workstation_id: str
    state_json_path: Path | str | None = None
    api_key: str | None = None
    bearer_token: str | None = None
    collector_name: str | None = None
    collector_type: str = "autocad_state"
    capabilities: tuple[str, ...] = ("autocad", "drawing_sessions", "commands")
    heartbeat_ms: int = 15_000
    poll_interval_ms: int = 5_000
    batch_size: int = 100
    buffer_dir: Path | str | None = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.backend_url = str(self.backend_url or "").strip().rstrip("/")
        if not self.backend_url:
            raise ValueError("backend_url is required")
        self.collector_id = str(self.collector_id or "").strip()
        if not self.collector_id:
            raise ValueError("collector_id is required")
        self.workstation_id = str(self.workstation_id or "").strip()
        if not self.workstation_id:
            raise ValueError("workstation_id is required")
        self.heartbeat_ms = max(1_000, int(self.heartbeat_ms))
        self.poll_interval_ms = max(1_000, int(self.poll_interval_ms))
        self.batch_size = max(1, min(500, int(self.batch_size)))
        self.collector_name = (
            str(self.collector_name).strip()
            if self.collector_name
            else f"{self.workstation_id} AutoCAD Collector"
        )
        self.state_json_path = Path(
            self.state_json_path or _default_state_json_path(),
        ).expanduser().resolve()
        self.buffer_dir = Path(
            self.buffer_dir or _default_buffer_dir(self.collector_id),
        ).expanduser().resolve()
        self.metadata = dict(self.metadata or {})

    @property
    def state_path(self) -> Path:
        return self.buffer_dir / "state.json"

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "AutoCadStateCollectorConfig":
        workstation_id = (
            str(payload.get("workstationId") or "").strip()
            or socket.gethostname().strip()
            or "unknown"
        )
        collector_id = (
            str(payload.get("collectorId") or "").strip()
            or f"autocad-{workstation_id.lower()}"
        )
        return cls(
            backend_url=str(payload.get("backendUrl") or "").strip(),
            api_key=str(payload.get("apiKey") or "").strip() or None,
            bearer_token=str(payload.get("bearerToken") or "").strip() or None,
            collector_id=collector_id,
            collector_name=str(payload.get("collectorName") or "").strip() or None,
            collector_type=str(payload.get("collectorType") or "autocad_state").strip()
            or "autocad_state",
            workstation_id=workstation_id,
            state_json_path=payload.get("stateJsonPath"),
            heartbeat_ms=int(payload.get("heartbeatMs") or 15_000),
            poll_interval_ms=int(payload.get("pollIntervalMs") or 5_000),
            batch_size=int(payload.get("batchSize") or 100),
            buffer_dir=payload.get("bufferDir"),
            capabilities=tuple(
                _split_string_list(payload.get("capabilities"))
                or ["autocad", "drawing_sessions", "commands"]
            ),
            metadata=dict(payload.get("metadata") or {}),
        )


def load_autocad_state_collector_config(
    *,
    config_path: str | os.PathLike[str] | None = None,
    env: Mapping[str, str] | None = None,
) -> AutoCadStateCollectorConfig:
    payload: Dict[str, Any] = {}
    if config_path:
        raw = Path(config_path).expanduser().read_text(encoding="utf-8-sig")
        payload = json.loads(raw)

    source_env = dict(env or os.environ)
    overrides = {
        "backendUrl": source_env.get("SUITE_WATCHDOG_BACKEND_URL")
        or source_env.get("WATCHDOG_BACKEND_URL"),
        "apiKey": source_env.get("SUITE_WATCHDOG_API_KEY")
        or source_env.get("WATCHDOG_API_KEY"),
        "bearerToken": source_env.get("SUITE_WATCHDOG_BEARER_TOKEN")
        or source_env.get("WATCHDOG_BEARER_TOKEN"),
        "collectorId": source_env.get("WATCHDOG_AUTOCAD_COLLECTOR_ID"),
        "collectorName": source_env.get("WATCHDOG_AUTOCAD_COLLECTOR_NAME"),
        "collectorType": source_env.get("WATCHDOG_AUTOCAD_COLLECTOR_TYPE"),
        "workstationId": source_env.get("WATCHDOG_WORKSTATION_ID"),
        "stateJsonPath": source_env.get("WATCHDOG_AUTOCAD_STATE_PATH"),
        "heartbeatMs": source_env.get("WATCHDOG_AUTOCAD_HEARTBEAT_MS"),
        "pollIntervalMs": source_env.get("WATCHDOG_AUTOCAD_POLL_INTERVAL_MS"),
        "batchSize": source_env.get("WATCHDOG_AUTOCAD_BATCH_SIZE"),
        "bufferDir": source_env.get("WATCHDOG_AUTOCAD_BUFFER_DIR"),
    }
    metadata_raw = source_env.get("WATCHDOG_AUTOCAD_METADATA")
    if metadata_raw:
        overrides["metadata"] = json.loads(metadata_raw)

    merged = dict(payload)
    for key, value in overrides.items():
        if value not in (None, ""):
            merged[key] = value
    return AutoCadStateCollectorConfig.from_mapping(merged)


class AutoCadStateCollector:
    def __init__(
        self,
        config: AutoCadStateCollectorConfig,
        *,
        api_client: WatchdogCollectorApiClient | None = None,
        state_store: FilesystemCollectorStateStore | None = None,
        time_module: Any = time,
    ) -> None:
        self.config = config
        self.api_client = api_client or WatchdogCollectorApiClient(config)
        self.state_store = state_store or FilesystemCollectorStateStore(config.state_path)
        self.time = time_module
        self._registration_verified = False

    def _next_sequence(self, state: Dict[str, Any]) -> int:
        sequence = max(1, int(state.get("nextSequence") or 1))
        state["nextSequence"] = sequence + 1
        return sequence

    def _build_event_key(
        self,
        event_type: str,
        path_value: str | None,
        session_id: str | None,
        timestamp_ms: int,
        suffix: str | None = None,
    ) -> str:
        pieces = [
            event_type,
            str(path_value or ""),
            str(session_id or ""),
            str(int(timestamp_ms)),
        ]
        if suffix:
            pieces.append(suffix)
        return "::".join(pieces)

    def _append_lifecycle_event(self, state: Dict[str, Any], event_type: str) -> None:
        sequence = self._next_sequence(state)
        timestamp_ms = int(self.time.time() * 1000)
        pending = list(state.get("pendingEvents") or [])
        pending.append(
            {
                "sequence": sequence,
                "sourceEventId": sequence,
                "eventKey": f"{event_type}::{sequence}",
                "eventType": event_type,
                "sourceType": "collector",
                "timestamp": timestamp_ms,
                "metadata": {
                    "workstationId": self.config.workstation_id,
                    "syncMode": "hybrid-state",
                },
            }
        )
        state["pendingEvents"] = pending

    def _load_tracker_state(self) -> Dict[str, Any] | None:
        if not self.config.state_json_path.is_file():
            return None
        raw = self.config.state_json_path.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise RuntimeError("AutoCAD tracker state must be a JSON object")
        return parsed

    def _normalize_command_events(
        self,
        *,
        state: Dict[str, Any],
        tracker_state: Mapping[str, Any],
        previous_snapshot: Mapping[str, Any],
        drawing_path: str | None,
        session_id: str | None,
        timestamp_ms: int,
    ) -> list[Dict[str, Any]]:
        current_session = tracker_state.get("currentSession")
        if not isinstance(current_session, Mapping):
            return []

        current_count = max(0, int(current_session.get("commandCount") or 0))
        previous_count = 0
        if str(previous_snapshot.get("currentSessionId") or "") == str(session_id or ""):
            previous_count = max(0, int(previous_snapshot.get("currentSessionCommandCount") or 0))

        delta = max(0, current_count - previous_count)
        if delta <= 0:
            return []

        recent_commands = [
            str(item).strip()
            for item in (tracker_state.get("recentCommands") or [])
            if str(item or "").strip()
        ]
        candidate_commands = list(reversed(recent_commands[:delta])) or ["UNKNOWN"] * delta
        sequence_events: list[Dict[str, Any]] = []
        for index, command_name in enumerate(candidate_commands):
            sequence = self._next_sequence(state)
            event_timestamp = timestamp_ms + index
            sequence_events.append(
                {
                    "sequence": sequence,
                    "sourceEventId": sequence,
                    "eventKey": self._build_event_key(
                        "command_executed",
                        drawing_path,
                        session_id,
                        event_timestamp,
                        command_name,
                    ),
                    "eventType": "command_executed",
                    "sourceType": "autocad",
                    "timestamp": event_timestamp,
                    "drawingPath": drawing_path,
                    "sessionId": session_id,
                    "metadata": {
                        "commandName": command_name,
                        "drawingName": _optional_text(tracker_state.get("activeDrawing")),
                        "syncMode": "hybrid-state",
                    },
                }
            )
        return sequence_events

    def scan_once(self) -> Dict[str, Any]:
        state = self.state_store.load()
        previous_snapshot = dict(state.get("snapshot") or {})
        pending = list(state.get("pendingEvents") or [])
        now_ms = int(self.time.time() * 1000)

        tracker_state = self._load_tracker_state()
        if tracker_state is None:
            state["snapshot"] = {
                **previous_snapshot,
                "sourceAvailable": False,
                "lastCheckedAt": now_ms,
            }
            self.state_store.save(state)
            return {
                "queued": 0,
                "sourceAvailable": False,
                "trackerUpdatedAt": 0,
                "statePath": str(self.config.state_json_path),
            }

        metadata_snapshot = _metadata_from_tracker_state(tracker_state)
        current_session = tracker_state.get("currentSession")
        current_session_key = _session_key(current_session if isinstance(current_session, Mapping) else None)
        drawing_path = _optional_text(
            (current_session or {}).get("fullPath")
            if isinstance(current_session, Mapping)
            else None
        ) or _optional_text(tracker_state.get("activeDrawingPath"))
        drawing_name = _optional_text(
            (current_session or {}).get("drawingName")
            if isinstance(current_session, Mapping)
            else None
        ) or _optional_text(tracker_state.get("activeDrawing"))
        timestamp_ms = metadata_snapshot.get("lastUpdated") or now_ms

        previous_active_path = _optional_text(previous_snapshot.get("activeDrawingPath"))
        previous_session_id = _optional_text(previous_snapshot.get("currentSessionId"))
        previous_paused = bool(previous_snapshot.get("isPaused"))
        current_paused = bool(metadata_snapshot.get("isPaused"))

        queued_events: list[Dict[str, Any]] = []

        if drawing_path and drawing_path != previous_active_path:
            sequence = self._next_sequence(state)
            queued_events.append(
                {
                    "sequence": sequence,
                    "sourceEventId": sequence,
                    "eventKey": self._build_event_key(
                        "drawing_opened" if not previous_active_path else "drawing_activated",
                        drawing_path,
                        current_session_key,
                        int(timestamp_ms),
                    ),
                    "eventType": "drawing_opened" if not previous_active_path else "drawing_activated",
                    "sourceType": "autocad",
                    "timestamp": int(timestamp_ms),
                    "drawingPath": drawing_path,
                    "sessionId": current_session_key,
                    "metadata": {
                        "drawingName": drawing_name,
                        "syncMode": "hybrid-state",
                    },
                }
            )

        if current_paused and not previous_paused:
            sequence = self._next_sequence(state)
            queued_events.append(
                {
                    "sequence": sequence,
                    "sourceEventId": sequence,
                    "eventKey": self._build_event_key(
                        "idle_started",
                        drawing_path,
                        current_session_key,
                        int(timestamp_ms),
                    ),
                    "eventType": "idle_started",
                    "sourceType": "autocad",
                    "timestamp": int(timestamp_ms),
                    "drawingPath": drawing_path,
                    "sessionId": current_session_key,
                    "metadata": {
                        "drawingName": drawing_name,
                        "syncMode": "hybrid-state",
                    },
                }
            )

        if previous_paused and not current_paused:
            sequence = self._next_sequence(state)
            queued_events.append(
                {
                    "sequence": sequence,
                    "sourceEventId": sequence,
                    "eventKey": self._build_event_key(
                        "idle_resumed",
                        drawing_path or previous_active_path,
                        current_session_key or previous_session_id,
                        int(timestamp_ms),
                    ),
                    "eventType": "idle_resumed",
                    "sourceType": "autocad",
                    "timestamp": int(timestamp_ms),
                    "drawingPath": drawing_path or previous_active_path,
                    "sessionId": current_session_key or previous_session_id,
                    "metadata": {
                        "drawingName": drawing_name,
                        "syncMode": "hybrid-state",
                    },
                }
            )

        queued_events.extend(
            self._normalize_command_events(
                state=state,
                tracker_state=tracker_state,
                previous_snapshot=previous_snapshot,
                drawing_path=drawing_path,
                session_id=current_session_key,
                timestamp_ms=int(timestamp_ms),
            )
        )

        previous_completed_keys = {
            str(item)
            for item in (previous_snapshot.get("completedSessionKeys") or [])
            if str(item or "").strip()
        }
        current_completed_keys: list[str] = []
        completed_sessions = tracker_state.get("sessions")
        if isinstance(completed_sessions, list):
            for session in completed_sessions:
                if not isinstance(session, Mapping):
                    continue
                session_key = _session_key(session)
                if not session_key:
                    continue
                current_completed_keys.append(session_key)
                if session_key in previous_completed_keys:
                    continue
                closed_drawing_path = _optional_text(session.get("fullPath"))
                if not closed_drawing_path:
                    continue
                closed_timestamp = (
                    _timestamp_ms_from_value(session.get("endedAt"))
                    or _timestamp_ms_from_value(session.get("startedAt"))
                    or int(timestamp_ms)
                )
                active_ms = _duration_ms_from_value(session.get("activeTime")) or 0
                idle_ms = _duration_ms_from_value(session.get("idleTime")) or 0
                started_at = _optional_text(session.get("startedAt"))
                ended_at = _optional_text(session.get("endedAt"))
                work_date = None
                reference_text = ended_at or started_at
                if reference_text and "T" in reference_text:
                    work_date = reference_text.split("T", 1)[0].strip() or None
                ended_at_ms = _timestamp_ms_from_value(ended_at)
                started_at_ms = _timestamp_ms_from_value(started_at)
                reference_ms = ended_at_ms or started_at_ms
                if reference_ms and not work_date:
                    work_date = datetime.fromtimestamp(
                        reference_ms / 1000,
                        tz=timezone.utc,
                    ).date().isoformat()
                sequence = self._next_sequence(state)
                queued_events.append(
                    {
                        "sequence": sequence,
                        "sourceEventId": sequence,
                        "eventKey": self._build_event_key(
                            "drawing_closed",
                            closed_drawing_path,
                            session_key,
                            closed_timestamp,
                        ),
                        "eventType": "drawing_closed",
                        "sourceType": "autocad",
                        "timestamp": int(closed_timestamp),
                        "drawingPath": closed_drawing_path,
                        "sessionId": session_key,
                        "durationMs": int(active_ms),
                        "metadata": {
                            "drawingName": _optional_text(session.get("drawingName")),
                            "trackedMs": int(active_ms),
                            "idleMs": int(idle_ms),
                            "activeSeconds": round(active_ms / 1000, 3),
                            "idleSeconds": round(idle_ms / 1000, 3),
                            "commandCount": int(session.get("commandCount") or 0),
                            "segmentStartedAt": started_at,
                            "segmentEndedAt": ended_at,
                            "workDate": work_date,
                            "syncMode": "hybrid-state",
                        },
                    }
                )

        pending.extend(queued_events)
        state["pendingEvents"] = pending
        state["snapshot"] = {
            **metadata_snapshot,
            "activeDrawingPath": drawing_path,
            "activeDrawingName": drawing_name,
            "currentSessionId": current_session_key,
            "currentSessionCommandCount": int(metadata_snapshot.get("currentSessionCommandCount") or 0),
            "completedSessionKeys": current_completed_keys[:200],
            "lastCheckedAt": now_ms,
        }
        self.state_store.save(state)
        return {
            "queued": len(queued_events),
            "sourceAvailable": True,
            "trackerUpdatedAt": int(metadata_snapshot.get("lastUpdated") or 0),
            "statePath": str(self.config.state_json_path),
            "activeDrawingPath": drawing_path,
            "currentSessionId": current_session_key,
        }

    def flush_pending_events(self) -> Dict[str, Any]:
        state = self.state_store.load()
        pending = list(state.get("pendingEvents") or [])
        if not pending:
            return {"accepted": 0, "duplicates": 0, "pending": 0}

        batch = pending[: self.config.batch_size]
        result = self.api_client.send_events(batch)
        ack_count = max(
            0,
            min(
                len(batch),
                int(result.get("accepted") or 0) + int(result.get("duplicates") or 0),
            ),
        )
        if ack_count > 0:
            state["pendingEvents"] = pending[ack_count:]
            self.state_store.save(state)
        return {
            "accepted": int(result.get("accepted") or 0),
            "duplicates": int(result.get("duplicates") or 0),
            "pending": len(state.get("pendingEvents") or []),
        }

    def register(self) -> Dict[str, Any]:
        return self.api_client.register()

    def _collector_missing_from_backend(self, exc: Exception) -> bool:
        message = str(exc)
        return "WATCHDOG_COLLECTOR_NOT_FOUND" in message or "Collector is not registered" in message

    def _attempt_register(self) -> Dict[str, Any]:
        if self._registration_verified:
            return {"ok": True, "skipped": True}
        try:
            result = self.register()
        except Exception as exc:
            self._registration_verified = False
            return {"ok": False, "error": str(exc)}
        self._registration_verified = True
        return result

    def _attempt_flush_pending_events(self) -> Dict[str, Any]:
        try:
            return self.flush_pending_events()
        except Exception as exc:
            if self._collector_missing_from_backend(exc):
                self._registration_verified = False
            return {
                "ok": False,
                "accepted": 0,
                "duplicates": 0,
                "pending": len(self.state_store.load().get("pendingEvents") or []),
                "error": str(exc),
            }

    def _attempt_heartbeat(self, *, status: str) -> Dict[str, Any]:
        try:
            return self.heartbeat(status=status)
        except Exception as exc:
            if self._collector_missing_from_backend(exc):
                self._registration_verified = False
            return {"ok": False, "status": status, "error": str(exc)}

    def heartbeat(self, *, status: str = "online") -> Dict[str, Any]:
        state = self.state_store.load()
        snapshot = dict(state.get("snapshot") or {})
        sequence = max(0, int(state.get("nextSequence") or 1) - 1)
        pending = list(state.get("pendingEvents") or [])
        metadata = {
            "pendingCount": len(pending),
            "pollIntervalMs": self.config.poll_interval_ms,
            "stateJsonPath": str(self.config.state_json_path),
            "sourceAvailable": bool(snapshot.get("sourceAvailable")),
            "isPaused": bool(snapshot.get("isPaused")),
            "activeDrawingName": _optional_text(snapshot.get("activeDrawingName")),
            "activeDrawingPath": _optional_text(snapshot.get("activeDrawingPath")),
            "currentSessionId": _optional_text(snapshot.get("currentSessionId")),
            "currentSessionStartedAt": _optional_text(snapshot.get("currentSessionStartedAt")),
            "currentSessionTrackedMs": int(snapshot.get("currentSessionTrackedMs") or 0),
            "currentSessionIdleMs": int(snapshot.get("currentSessionIdleMs") or 0),
            "currentSessionCommandCount": int(snapshot.get("currentSessionCommandCount") or 0),
            "trackerUpdatedAt": int(snapshot.get("lastUpdated") or 0),
            "lastActivityAt": int(snapshot.get("lastActivityAt") or 0),
        }
        result = self.api_client.heartbeat(
            status=status,
            sequence=sequence,
            metadata=metadata,
        )
        state["lastStatus"] = status
        self.state_store.save(state)
        return result

    def run_once(self) -> Dict[str, Any]:
        state = self.state_store.load()
        if str(state.get("lastStatus") or "offline") != "online":
            self._append_lifecycle_event(state, "collector_online")
            state["lastStatus"] = "online"
            self.state_store.save(state)
        scan_result = self.scan_once()
        register_result = self._attempt_register()
        flush_result = self._attempt_flush_pending_events()
        heartbeat_result = self._attempt_heartbeat(status="online")
        return {
            "register": register_result,
            "scan": scan_result,
            "flush": flush_result,
            "heartbeat": heartbeat_result,
        }

    def shutdown(self) -> None:
        state = self.state_store.load()
        if str(state.get("lastStatus") or "offline") == "offline":
            return
        self._append_lifecycle_event(state, "collector_offline")
        state["lastStatus"] = "offline"
        self.state_store.save(state)
        try:
            self.flush_pending_events()
            self.heartbeat(status="offline")
        except Exception:
            return

    def run_forever(self) -> None:
        next_poll_at = 0
        next_heartbeat_at = 0
        backoff_ms = 1_000
        while True:
            now_ms = int(self.time.time() * 1000)
            try:
                if now_ms >= next_poll_at:
                    state = self.state_store.load()
                    if str(state.get("lastStatus") or "offline") != "online":
                        self._append_lifecycle_event(state, "collector_online")
                        state["lastStatus"] = "online"
                        self.state_store.save(state)
                    self.scan_once()
                    next_poll_at = now_ms + self.config.poll_interval_ms
                    self._attempt_register()
                    self._attempt_flush_pending_events()
                if now_ms >= next_heartbeat_at:
                    next_heartbeat_at = now_ms + self.config.heartbeat_ms
                    self._attempt_register()
                    self._attempt_heartbeat(status="online")
                backoff_ms = 1_000
            except Exception:
                time.sleep(backoff_ms / 1000)
                backoff_ms = min(backoff_ms * 2, 30_000)
                continue
            time.sleep(0.5)
