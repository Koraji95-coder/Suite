from __future__ import annotations

import fnmatch
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Mapping, Tuple


class WatchdogMonitorService:
    """In-memory folder heartbeat monitor keyed by authenticated user."""

    def __init__(
        self,
        *,
        time_module: Any = time,
        max_events_per_tick: int = 2000,
    ) -> None:
        self.time = time_module
        self.max_events_per_tick = max(100, int(max_events_per_tick))
        self._lock = threading.Lock()
        self._states: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _default_config() -> Dict[str, Any]:
        return {
            "roots": [],
            "includeGlobs": [],
            "excludeGlobs": [],
            "heartbeatMs": 5000,
            "enabled": False,
        }

    @staticmethod
    def _normalize_path(path_value: str) -> str:
        return os.path.normcase(os.path.normpath(os.path.abspath(path_value)))

    @staticmethod
    def _parse_globs(raw_value: Any, *, field_name: str) -> list[str]:
        if raw_value is None:
            return []
        if not isinstance(raw_value, list):
            raise ValueError(f"{field_name} must be a list of strings")

        out: list[str] = []
        seen: set[str] = set()
        for item in raw_value:
            text = str(item or "").strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(text)
        return out

    @staticmethod
    def _parse_heartbeat_ms(raw_value: Any) -> int:
        if raw_value is None:
            return 5000
        try:
            value = int(raw_value)
        except Exception as exc:
            raise ValueError("heartbeatMs must be an integer") from exc
        return max(1000, min(60000, value))

    @staticmethod
    def _parse_enabled(raw_value: Any) -> bool:
        if raw_value is None:
            return True
        if isinstance(raw_value, bool):
            return raw_value
        if isinstance(raw_value, (int, float)):
            return bool(raw_value)
        text = str(raw_value).strip().lower()
        if text in {"true", "1", "yes", "y", "on"}:
            return True
        if text in {"false", "0", "no", "n", "off"}:
            return False
        raise ValueError("enabled must be a boolean")

    @staticmethod
    def _parse_roots(raw_value: Any, *, allow_empty: bool = False) -> list[str]:
        if raw_value is None:
            if allow_empty:
                return []
            raise ValueError("roots must contain at least one absolute directory path")

        if not isinstance(raw_value, list):
            raise ValueError("roots must contain at least one absolute directory path")

        if len(raw_value) == 0 and allow_empty:
            return []
        if len(raw_value) == 0:
            raise ValueError("roots must contain at least one absolute directory path")

        out: list[str] = []
        seen: set[str] = set()
        for item in raw_value:
            root_value = str(item or "").strip()
            if not root_value:
                continue
            root_path = Path(root_value).expanduser()
            if not root_path.is_absolute():
                raise ValueError(f"Root path must be absolute: {root_value}")

            normalized = os.path.abspath(str(root_path))
            if not os.path.isdir(normalized):
                raise ValueError(f"Root path does not exist or is not a directory: {root_value}")

            dedupe_key = os.path.normcase(os.path.normpath(normalized))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            out.append(normalized)

        if len(out) == 0 and allow_empty:
            return []
        if len(out) == 0:
            raise ValueError("roots must contain at least one valid absolute directory path")

        return out

    def normalize_config(self, raw_config: Mapping[str, Any]) -> Dict[str, Any]:
        if not isinstance(raw_config, Mapping):
            raise ValueError("Request body must be a JSON object")

        enabled = self._parse_enabled(raw_config.get("enabled"))
        return {
            "roots": self._parse_roots(
                raw_config.get("roots"),
                allow_empty=not enabled,
            ),
            "includeGlobs": self._parse_globs(
                raw_config.get("includeGlobs"),
                field_name="includeGlobs",
            ),
            "excludeGlobs": self._parse_globs(
                raw_config.get("excludeGlobs"),
                field_name="excludeGlobs",
            ),
            "heartbeatMs": self._parse_heartbeat_ms(raw_config.get("heartbeatMs")),
            "enabled": enabled,
        }

    @staticmethod
    def _matches_any(patterns: list[str], rel_path: str, name: str) -> bool:
        rel = rel_path.lower()
        filename = name.lower()
        for pattern in patterns:
            normalized = pattern.replace("\\", "/").lower()
            if fnmatch.fnmatch(rel, normalized):
                return True
            if fnmatch.fnmatch(filename, normalized):
                return True
        return False

    def _is_included(self, *, rel_path: str, name: str, config: Mapping[str, Any]) -> bool:
        include_globs = config.get("includeGlobs") or []
        exclude_globs = config.get("excludeGlobs") or []

        if include_globs and not self._matches_any(include_globs, rel_path, name):
            return False
        if exclude_globs and self._matches_any(exclude_globs, rel_path, name):
            return False
        return True

    @staticmethod
    def _relative_posix(path_value: str, root_value: str) -> str:
        try:
            rel = os.path.relpath(path_value, root_value)
        except Exception:
            rel = path_value
        return rel.replace("\\", "/")

    def _scan_snapshot(self, config: Mapping[str, Any]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
        perf_counter = getattr(self.time, "perf_counter", time.perf_counter)
        started = perf_counter()
        warnings: list[str] = []
        files_scanned = 0
        folders_scanned = 0
        snapshot: Dict[str, Dict[str, Any]] = {}

        roots = [str(item) for item in (config.get("roots") or [])]
        for root in roots:
            if not os.path.isdir(root):
                warnings.append(f"Root unavailable during scan: {root}")
                continue

            stack = [root]
            while stack:
                current_dir = stack.pop()
                folders_scanned += 1
                try:
                    with os.scandir(current_dir) as entries:
                        for entry in entries:
                            try:
                                if entry.is_dir(follow_symlinks=False):
                                    stack.append(entry.path)
                                    continue
                                if not entry.is_file(follow_symlinks=False):
                                    continue
                                files_scanned += 1

                                rel_path = self._relative_posix(entry.path, root)
                                if not self._is_included(
                                    rel_path=rel_path,
                                    name=entry.name,
                                    config=config,
                                ):
                                    continue

                                try:
                                    stat = entry.stat(follow_symlinks=False)
                                except Exception as exc:
                                    warnings.append(f"Failed to stat file '{entry.path}': {exc}")
                                    continue

                                absolute_path = os.path.abspath(entry.path)
                                normalized_key = self._normalize_path(absolute_path)
                                snapshot[normalized_key] = {
                                    "root": root,
                                    "path": absolute_path,
                                    "relativePath": rel_path,
                                    "sizeBytes": int(stat.st_size),
                                    "mtimeMs": int(stat.st_mtime * 1000),
                                }
                            except Exception as exc:
                                warnings.append(f"Failed to inspect entry in '{current_dir}': {exc}")
                except Exception as exc:
                    warnings.append(f"Failed to scan directory '{current_dir}': {exc}")

        scan_ms = int((perf_counter() - started) * 1000)
        scan_meta = {
            "scanMs": max(0, scan_ms),
            "filesScanned": files_scanned,
            "foldersScanned": folders_scanned,
            "truncated": False,
            "warnings": warnings,
            "lastHeartbeatAt": int(self.time.time() * 1000),
        }
        return snapshot, scan_meta

    def _build_events(
        self,
        *,
        old_snapshot: Mapping[str, Dict[str, Any]],
        new_snapshot: Mapping[str, Dict[str, Any]],
        timestamp_ms: int,
    ) -> list[Dict[str, Any]]:
        events: list[Dict[str, Any]] = []

        old_keys = set(old_snapshot.keys())
        new_keys = set(new_snapshot.keys())

        for path_key in sorted(new_keys - old_keys):
            current = new_snapshot[path_key]
            events.append(
                {
                    "type": "added",
                    "root": current.get("root"),
                    "path": current.get("path"),
                    "relativePath": current.get("relativePath"),
                    "timestamp": timestamp_ms,
                    "sizeBytes": current.get("sizeBytes"),
                    "mtimeMs": current.get("mtimeMs"),
                }
            )

        for path_key in sorted(old_keys - new_keys):
            previous = old_snapshot[path_key]
            events.append(
                {
                    "type": "removed",
                    "root": previous.get("root"),
                    "path": previous.get("path"),
                    "relativePath": previous.get("relativePath"),
                    "timestamp": timestamp_ms,
                    "sizeBytes": previous.get("sizeBytes"),
                    "mtimeMs": previous.get("mtimeMs"),
                }
            )

        for path_key in sorted(old_keys & new_keys):
            previous = old_snapshot[path_key]
            current = new_snapshot[path_key]
            if (
                int(previous.get("sizeBytes") or 0) != int(current.get("sizeBytes") or 0)
                or int(previous.get("mtimeMs") or 0) != int(current.get("mtimeMs") or 0)
            ):
                events.append(
                    {
                        "type": "modified",
                        "root": current.get("root"),
                        "path": current.get("path"),
                        "relativePath": current.get("relativePath"),
                        "timestamp": timestamp_ms,
                        "sizeBytes": current.get("sizeBytes"),
                        "mtimeMs": current.get("mtimeMs"),
                    }
                )

        return events

    def configure(self, user_key: str, raw_config: Mapping[str, Any]) -> Dict[str, Any]:
        config = self.normalize_config(raw_config)
        snapshot, initial_scan = self._scan_snapshot(config)

        with self._lock:
            existing = self._states.get(user_key, {})
            next_event_id = int(existing.get("next_event_id") or 1)
            state = {
                "config": config,
                "snapshot": snapshot,
                "last_scan": initial_scan,
                "next_event_id": next_event_id,
            }
            self._states[user_key] = state

        return {
            "config": config,
            "initialScan": initial_scan,
            "nextEventId": next_event_id,
        }

    def status(self, user_key: str) -> Dict[str, Any]:
        with self._lock:
            state = self._states.get(user_key)
            if state is None:
                return {
                    "configured": False,
                    "config": self._default_config(),
                    "lastScan": None,
                    "nextEventId": 1,
                    "healthy": True,
                }

            return {
                "configured": True,
                "config": dict(state.get("config") or {}),
                "lastScan": dict(state.get("last_scan") or {}),
                "nextEventId": int(state.get("next_event_id") or 1),
                "healthy": True,
            }

    def heartbeat(self, user_key: str) -> Dict[str, Any]:
        with self._lock:
            state = self._states.get(user_key)
            if state is None:
                raise KeyError("Watchdog is not configured for this user.")
            config = dict(state.get("config") or {})
            old_snapshot = dict(state.get("snapshot") or {})
            next_event_id = int(state.get("next_event_id") or 1)

        if not bool(config.get("enabled")):
            now_ms = int(self.time.time() * 1000)
            payload = {
                "events": [],
                "scanMs": 0,
                "filesScanned": 0,
                "foldersScanned": 0,
                "truncated": False,
                "warnings": ["Watchdog is paused (enabled=false)."],
                "lastHeartbeatAt": now_ms,
            }
            with self._lock:
                state = self._states.get(user_key)
                if state is not None:
                    state["last_scan"] = dict(payload)
            return payload

        new_snapshot, scan_meta = self._scan_snapshot(config)
        timestamp_ms = int(scan_meta.get("lastHeartbeatAt") or int(self.time.time() * 1000))
        raw_events = self._build_events(
            old_snapshot=old_snapshot,
            new_snapshot=new_snapshot,
            timestamp_ms=timestamp_ms,
        )

        truncated = False
        warnings = list(scan_meta.get("warnings") or [])
        if len(raw_events) > self.max_events_per_tick:
            truncated = True
            warnings.append(
                f"Event list truncated to {self.max_events_per_tick} entries for this heartbeat."
            )
            raw_events = raw_events[: self.max_events_per_tick]

        events: list[Dict[str, Any]] = []
        for event in raw_events:
            event_payload = dict(event)
            event_payload["eventId"] = next_event_id
            next_event_id += 1
            events.append(event_payload)

        response = {
            "events": events,
            "scanMs": int(scan_meta.get("scanMs") or 0),
            "filesScanned": int(scan_meta.get("filesScanned") or 0),
            "foldersScanned": int(scan_meta.get("foldersScanned") or 0),
            "truncated": truncated or bool(scan_meta.get("truncated")),
            "warnings": warnings,
            "lastHeartbeatAt": timestamp_ms,
        }

        with self._lock:
            state = self._states.get(user_key)
            if state is not None:
                state["snapshot"] = new_snapshot
                state["last_scan"] = dict(response)
                state["next_event_id"] = next_event_id

        return response
