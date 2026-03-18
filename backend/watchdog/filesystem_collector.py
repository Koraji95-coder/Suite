from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from .filesystem import build_snapshot_events, ensure_absolute_roots, scan_snapshot


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


def _default_buffer_dir(collector_id: str) -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        base_dir = Path(local_appdata)
    else:
        base_dir = Path.home() / "AppData" / "Local"
    return (base_dir / "Suite" / "watchdog-collector" / collector_id).resolve()


def _state_template() -> Dict[str, Any]:
    return {
        "version": 1,
        "nextSequence": 1,
        "lastStatus": "offline",
        "snapshot": {},
        "pendingEvents": [],
    }


@dataclass(slots=True)
class FilesystemCollectorConfig:
    backend_url: str
    collector_id: str
    workstation_id: str
    roots: list[str]
    include_globs: list[str] = field(default_factory=list)
    exclude_globs: list[str] = field(default_factory=list)
    api_key: str | None = None
    bearer_token: str | None = None
    collector_name: str | None = None
    collector_type: str = "filesystem"
    capabilities: tuple[str, ...] = ("filesystem",)
    heartbeat_ms: int = 15_000
    scan_interval_ms: int = 5_000
    batch_size: int = 100
    buffer_dir: Path | None = None
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
        self.roots = ensure_absolute_roots(self.roots, allow_missing=False)
        self.include_globs = _split_string_list(self.include_globs)
        self.exclude_globs = _split_string_list(self.exclude_globs)
        self.heartbeat_ms = max(1_000, int(self.heartbeat_ms))
        self.scan_interval_ms = max(1_000, int(self.scan_interval_ms))
        self.batch_size = max(1, min(500, int(self.batch_size)))
        self.collector_name = (
            str(self.collector_name).strip()
            if self.collector_name
            else f"{self.workstation_id} Filesystem Collector"
        )
        self.buffer_dir = Path(self.buffer_dir or _default_buffer_dir(self.collector_id)).expanduser().resolve()
        self.metadata = dict(self.metadata or {})

    @property
    def state_path(self) -> Path:
        return self.buffer_dir / "state.json"

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "FilesystemCollectorConfig":
        workstation_id = (
            str(payload.get("workstationId") or "").strip() or socket.gethostname().strip() or "unknown"
        )
        collector_id = str(payload.get("collectorId") or "").strip() or f"fs-{workstation_id.lower()}"
        return cls(
            backend_url=str(payload.get("backendUrl") or "").strip(),
            api_key=str(payload.get("apiKey") or "").strip() or None,
            bearer_token=str(payload.get("bearerToken") or "").strip() or None,
            collector_id=collector_id,
            collector_name=str(payload.get("collectorName") or "").strip() or None,
            collector_type=str(payload.get("collectorType") or "filesystem").strip() or "filesystem",
            workstation_id=workstation_id,
            roots=_split_string_list(payload.get("roots")),
            include_globs=_split_string_list(payload.get("includeGlobs")),
            exclude_globs=_split_string_list(payload.get("excludeGlobs")),
            heartbeat_ms=int(payload.get("heartbeatMs") or 15_000),
            scan_interval_ms=int(payload.get("scanIntervalMs") or 5_000),
            batch_size=int(payload.get("batchSize") or 100),
            buffer_dir=payload.get("bufferDir"),
            capabilities=tuple(_split_string_list(payload.get("capabilities")) or ["filesystem"]),
            metadata=dict(payload.get("metadata") or {}),
        )


def load_collector_config(
    *,
    config_path: str | os.PathLike[str] | None = None,
    env: Mapping[str, str] | None = None,
) -> FilesystemCollectorConfig:
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
        "collectorId": source_env.get("WATCHDOG_COLLECTOR_ID"),
        "collectorName": source_env.get("WATCHDOG_COLLECTOR_NAME"),
        "collectorType": source_env.get("WATCHDOG_COLLECTOR_TYPE"),
        "workstationId": source_env.get("WATCHDOG_WORKSTATION_ID"),
        "roots": source_env.get("WATCHDOG_COLLECTOR_ROOTS"),
        "includeGlobs": source_env.get("WATCHDOG_COLLECTOR_INCLUDE_GLOBS"),
        "excludeGlobs": source_env.get("WATCHDOG_COLLECTOR_EXCLUDE_GLOBS"),
        "heartbeatMs": source_env.get("WATCHDOG_COLLECTOR_HEARTBEAT_MS"),
        "scanIntervalMs": source_env.get("WATCHDOG_COLLECTOR_SCAN_INTERVAL_MS"),
        "batchSize": source_env.get("WATCHDOG_COLLECTOR_BATCH_SIZE"),
        "bufferDir": source_env.get("WATCHDOG_COLLECTOR_BUFFER_DIR"),
    }
    metadata_raw = source_env.get("WATCHDOG_COLLECTOR_METADATA")
    if metadata_raw:
        overrides["metadata"] = json.loads(metadata_raw)

    merged = dict(payload)
    for key, value in overrides.items():
        if value not in (None, ""):
            merged[key] = value
    return FilesystemCollectorConfig.from_mapping(merged)


class FilesystemCollectorStateStore:
    def __init__(self, state_path: Path) -> None:
        self.state_path = Path(state_path).expanduser().resolve()

    def load(self) -> Dict[str, Any]:
        if not self.state_path.is_file():
            return _state_template()
        try:
            raw = self.state_path.read_text(encoding="utf-8")
            payload = json.loads(raw)
        except Exception:
            return _state_template()
        state = _state_template()
        state.update(payload if isinstance(payload, dict) else {})
        if not isinstance(state.get("pendingEvents"), list):
            state["pendingEvents"] = []
        if not isinstance(state.get("snapshot"), dict):
            state["snapshot"] = {}
        state["nextSequence"] = max(1, int(state.get("nextSequence") or 1))
        state["lastStatus"] = str(state.get("lastStatus") or "offline")
        return state

    def save(self, state: Mapping[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.state_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp_path, self.state_path)


class WatchdogCollectorApiClient:
    def __init__(self, config: FilesystemCollectorConfig, *, timeout_seconds: int = 15) -> None:
        self.config = config
        self.timeout_seconds = timeout_seconds

    def _request(self, method: str, path: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self.config.backend_url}{path}",
            data=body,
            method=method,
            headers={
                "Content-Type": "application/json",
                **(
                    {"X-API-Key": self.config.api_key}
                    if self.config.api_key
                    else {}
                ),
                **(
                    {"Authorization": f"Bearer {self.config.bearer_token}"}
                    if self.config.bearer_token
                    else {}
                ),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Collector request failed ({exc.code}): {details}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Collector request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Collector response was not valid JSON") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("Collector response payload was not an object")
        if parsed.get("ok") is False:
            raise RuntimeError(str(parsed.get("error") or "Collector request failed"))
        return parsed

    def register(self) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/watchdog/collectors/register",
            {
                "collectorId": self.config.collector_id,
                "name": self.config.collector_name,
                "collectorType": self.config.collector_type,
                "workstationId": self.config.workstation_id,
                "capabilities": list(self.config.capabilities),
                "metadata": self.config.metadata,
            },
        )

    def heartbeat(self, *, status: str, sequence: int, metadata: Mapping[str, Any]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/watchdog/collectors/heartbeat",
            {
                "collectorId": self.config.collector_id,
                "status": status,
                "sequence": sequence,
                "metadata": dict(metadata),
            },
        )

    def send_events(self, events: list[Dict[str, Any]]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/watchdog/collectors/events",
            {
                "collectorId": self.config.collector_id,
                "events": events,
            },
        )


class FilesystemCollector:
    def __init__(
        self,
        config: FilesystemCollectorConfig,
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

    def _exclude_paths(self) -> set[str]:
        return {
            str(self.config.state_path),
            str(self.config.state_path.with_suffix(".tmp")),
        }

    def _next_sequence(self, state: Dict[str, Any]) -> int:
        sequence = max(1, int(state.get("nextSequence") or 1))
        state["nextSequence"] = sequence + 1
        return sequence

    def _build_event_key(self, event_type: str, path_value: str | None, timestamp_ms: int, size_bytes: int | None, mtime_ms: int | None) -> str:
        return "::".join(
            [
                event_type,
                str(path_value or ""),
                str(int(size_bytes or 0)),
                str(int(mtime_ms or 0)),
                str(int(timestamp_ms)),
            ]
        )

    def _normalize_snapshot_event(self, state: Dict[str, Any], raw_event: Mapping[str, Any]) -> Dict[str, Any]:
        event_type = {
            "added": "file_added",
            "modified": "file_modified",
            "removed": "file_removed",
        }.get(str(raw_event.get("type") or "").lower(), "unknown")
        sequence = self._next_sequence(state)
        timestamp_ms = int(raw_event.get("timestamp") or int(self.time.time() * 1000))
        path_value = str(raw_event.get("path") or "").strip() or None
        size_bytes = int(raw_event.get("sizeBytes")) if raw_event.get("sizeBytes") is not None else None
        mtime_ms = int(raw_event.get("mtimeMs")) if raw_event.get("mtimeMs") is not None else None
        return {
            "sequence": sequence,
            "sourceEventId": sequence,
            "eventKey": self._build_event_key(event_type, path_value, timestamp_ms, size_bytes, mtime_ms),
            "eventType": event_type,
            "sourceType": "filesystem",
            "path": path_value,
            "timestamp": timestamp_ms,
            "sizeBytes": size_bytes,
            "mtimeMs": mtime_ms,
            "metadata": {
                "root": raw_event.get("root"),
                "relativePath": raw_event.get("relativePath"),
                "syncMode": "hybrid-scan",
            },
        }

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
                    "syncMode": "hybrid-scan",
                },
            }
        )
        state["pendingEvents"] = pending

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

    def scan_once(self) -> Dict[str, Any]:
        state = self.state_store.load()
        snapshot, scan_meta = scan_snapshot(
            roots=self.config.roots,
            include_globs=self.config.include_globs,
            exclude_globs=self.config.exclude_globs,
            exclude_paths=self._exclude_paths(),
            time_module=self.time,
        )
        previous_snapshot = dict(state.get("snapshot") or {})
        if not previous_snapshot:
            state["snapshot"] = snapshot
            self.state_store.save(state)
            return {
                "baseline": True,
                "queued": 0,
                **scan_meta,
            }

        raw_events = build_snapshot_events(
            old_snapshot=previous_snapshot,
            new_snapshot=snapshot,
            timestamp_ms=int(scan_meta.get("lastHeartbeatAt") or int(self.time.time() * 1000)),
        )
        pending = list(state.get("pendingEvents") or [])
        for raw_event in raw_events:
            pending.append(self._normalize_snapshot_event(state, raw_event))
        state["pendingEvents"] = pending
        state["snapshot"] = snapshot
        self.state_store.save(state)
        return {
            "baseline": False,
            "queued": len(raw_events),
            **scan_meta,
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

    def heartbeat(self, *, status: str = "online") -> Dict[str, Any]:
        state = self.state_store.load()
        sequence = max(0, int(state.get("nextSequence") or 1) - 1)
        pending = list(state.get("pendingEvents") or [])
        result = self.api_client.heartbeat(
            status=status,
            sequence=sequence,
            metadata={
                "pendingCount": len(pending),
                "rootCount": len(self.config.roots),
                "scanIntervalMs": self.config.scan_interval_ms,
            },
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
        next_scan_at = 0
        next_heartbeat_at = 0
        backoff_ms = 1_000
        while True:
            now_ms = int(self.time.time() * 1000)
            try:
                if now_ms >= next_scan_at:
                    state = self.state_store.load()
                    if str(state.get("lastStatus") or "offline") != "online":
                        self._append_lifecycle_event(state, "collector_online")
                        state["lastStatus"] = "online"
                        self.state_store.save(state)
                    self.scan_once()
                    next_scan_at = now_ms + self.config.scan_interval_ms
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
