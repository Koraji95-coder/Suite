"""Durable Watchdog domain service implementation."""

from __future__ import annotations

import hashlib
import os
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional

from .filesystem import (
    build_snapshot_events,
    ensure_absolute_roots,
    matches_any,
    normalize_path,
    relative_posix,
    scan_snapshot,
)
from .store import WatchdogLedger


DRAWING_ACTIVITY_SYNC_CURSOR = "supabase_project_drawing_segments"


class WatchdogMonitorService:
    """Durable watchdog service with legacy heartbeat compatibility."""

    def __init__(
        self,
        *,
        time_module: Any = time,
        max_events_per_tick: int = 2000,
        max_collector_events_retained: int = 10000,
        ledger_path: str | os.PathLike[str] | None = None,
        ledger: WatchdogLedger | None = None,
    ) -> None:
        self.time = time_module
        self.max_events_per_tick = max(100, int(max_events_per_tick))
        self.max_collector_events_retained = max(500, int(max_collector_events_retained))
        self.ledger = ledger or WatchdogLedger(db_path=ledger_path)
        self._ledger = self.ledger

    def resolve_runtime_user_key(self) -> str | None:
        return self.ledger.resolve_preferred_user_key()

    def _legacy_scan_exclude_paths(self) -> set[str]:
        ledger_path = str(getattr(self.ledger, "db_path", "") or "").strip()
        if not ledger_path:
            return set()
        return {
            ledger_path,
            f"{ledger_path}-wal",
            f"{ledger_path}-shm",
        }

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
    def _empty_project_rule(project_id: str) -> Dict[str, Any]:
        return {
            "projectId": project_id,
            "roots": [],
            "includeGlobs": [],
            "excludeGlobs": [],
            "drawingPatterns": [],
            "metadata": {},
            "updatedAt": 0,
        }

    @staticmethod
    def _empty_project_rule_payload() -> Dict[str, Any]:
        return {
            "roots": [],
            "includeGlobs": [],
            "excludeGlobs": [],
            "drawingPatterns": [],
            "metadata": {},
        }

    @staticmethod
    def _optional_text(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _optional_int(value: Any) -> Optional[int]:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def _timestamp_ms_from_value(value: Any) -> Optional[int]:
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
        except Exception:
            pass
        normalized = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except Exception:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp() * 1000)

    @staticmethod
    def _iso_from_timestamp_ms(timestamp_ms: int | None) -> str | None:
        if timestamp_ms is None or int(timestamp_ms) <= 0:
            return None
        return datetime.fromtimestamp(int(timestamp_ms) / 1000, tz=timezone.utc).isoformat()

    @staticmethod
    def _basename_from_path(path_value: str | None) -> str:
        if not path_value:
            return "Unknown"
        normalized = str(path_value).replace("\\", "/").rstrip("/")
        return normalized.split("/")[-1] or str(path_value)

    def _metadata_text(self, metadata: Mapping[str, Any], *keys: str) -> str | None:
        for key in keys:
            text = self._optional_text(metadata.get(key))
            if text:
                return text
        return None

    def _metadata_int(self, metadata: Mapping[str, Any], *keys: str) -> int | None:
        for key in keys:
            value = self._optional_int(metadata.get(key))
            if value is not None:
                return value
        return None

    @staticmethod
    def _parse_string_list(raw_value: Any) -> list[str]:
        if raw_value is None:
            return []
        if not isinstance(raw_value, list):
            raise ValueError("Expected a list of strings")

        out: list[str] = []
        seen: set[str] = set()
        for item in raw_value:
            value = str(item or "").strip()
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(value)
        return out

    @staticmethod
    def _parse_optional_mapping(raw_value: Any) -> Dict[str, Any]:
        if raw_value is None:
            return {}
        if not isinstance(raw_value, Mapping):
            raise ValueError("metadata must be a JSON object")
        return {str(key): value for key, value in raw_value.items()}

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

    def normalize_config(self, raw_config: Mapping[str, Any]) -> Dict[str, Any]:
        if not isinstance(raw_config, Mapping):
            raise ValueError("Request body must be a JSON object")
        enabled = self._parse_enabled(raw_config.get("enabled"))
        return {
            "roots": ensure_absolute_roots(
                list(raw_config.get("roots") or []),
                allow_missing=not enabled,
            ),
            "includeGlobs": self._parse_globs(raw_config.get("includeGlobs"), field_name="includeGlobs"),
            "excludeGlobs": self._parse_globs(raw_config.get("excludeGlobs"), field_name="excludeGlobs"),
            "heartbeatMs": self._parse_heartbeat_ms(raw_config.get("heartbeatMs")),
            "enabled": enabled,
        }

    def configure(self, user_key: str, raw_config: Mapping[str, Any]) -> Dict[str, Any]:
        config = self.normalize_config(raw_config)
        snapshot, initial_scan = scan_snapshot(
            roots=list(config.get("roots") or []),
            include_globs=list(config.get("includeGlobs") or []),
            exclude_globs=list(config.get("excludeGlobs") or []),
            exclude_paths=self._legacy_scan_exclude_paths(),
            time_module=self.time,
        )
        existing = self.ledger.load_legacy_state(user_key) or {}
        next_event_id = int(existing.get("next_event_id") or 1)
        self.ledger.save_legacy_state(
            user_key,
            config=config,
            snapshot=snapshot,
            last_scan=initial_scan,
            next_event_id=next_event_id,
        )
        return {
            "config": config,
            "initialScan": initial_scan,
            "nextEventId": next_event_id,
        }

    def status(self, user_key: str) -> Dict[str, Any]:
        state = self.ledger.load_legacy_state(user_key)
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
        state = self.ledger.load_legacy_state(user_key)
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
            self.ledger.save_legacy_state(
                user_key,
                config=config,
                snapshot=old_snapshot,
                last_scan=payload,
                next_event_id=next_event_id,
            )
            return payload

        new_snapshot, scan_meta = scan_snapshot(
            roots=list(config.get("roots") or []),
            include_globs=list(config.get("includeGlobs") or []),
            exclude_globs=list(config.get("excludeGlobs") or []),
            exclude_paths=self._legacy_scan_exclude_paths(),
            time_module=self.time,
        )
        timestamp_ms = int(scan_meta.get("lastHeartbeatAt") or int(self.time.time() * 1000))
        raw_events = build_snapshot_events(
            old_snapshot=old_snapshot,
            new_snapshot=new_snapshot,
            timestamp_ms=timestamp_ms,
        )
        warnings = list(scan_meta.get("warnings") or [])
        truncated = False
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

        payload = {
            "events": events,
            "scanMs": int(scan_meta.get("scanMs") or 0),
            "filesScanned": int(scan_meta.get("filesScanned") or 0),
            "foldersScanned": int(scan_meta.get("foldersScanned") or 0),
            "truncated": truncated or bool(scan_meta.get("truncated")),
            "warnings": warnings,
            "lastHeartbeatAt": timestamp_ms,
        }
        self.ledger.save_legacy_state(
            user_key,
            config=config,
            snapshot=new_snapshot,
            last_scan=payload,
            next_event_id=next_event_id,
        )
        return payload

    def register_collector(self, user_key: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ValueError("Request body must be a JSON object")
        now_ms = int(self.time.time() * 1000)
        collector_id = self._optional_text(payload.get("collectorId")) or f"collector-{uuid.uuid4().hex[:12]}"
        if len(collector_id) > 128:
            raise ValueError("collectorId must be <= 128 characters")
        existing = self.ledger.get_collector(user_key, collector_id) or {}
        collector = {
            "collectorId": collector_id,
            "name": self._optional_text(payload.get("name")) or collector_id,
            "collectorType": self._optional_text(payload.get("collectorType")) or "filesystem",
            "workstationId": self._optional_text(payload.get("workstationId")) or "unknown",
            "capabilities": self._parse_string_list(payload.get("capabilities")),
            "metadata": self._parse_optional_mapping(payload.get("metadata")),
            "status": self._optional_text(payload.get("status")) or "online",
            "createdAt": int(existing.get("createdAt") or now_ms),
            "updatedAt": now_ms,
            "lastHeartbeatAt": now_ms,
            "lastEventAt": int(existing.get("lastEventAt") or 0),
            "eventCount": int(existing.get("eventCount") or 0),
            "lastSequence": int(existing.get("lastSequence") or 0),
        }
        self.ledger.save_collector(user_key, collector)
        return {"collector": collector}

    def collector_heartbeat(self, user_key: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ValueError("Request body must be a JSON object")
        collector_id = self._optional_text(payload.get("collectorId"))
        if not collector_id:
            raise ValueError("collectorId is required")
        collector = self.ledger.get_collector(user_key, collector_id)
        if collector is None:
            raise KeyError("Collector is not registered")
        now_ms = int(self.time.time() * 1000)
        collector["status"] = self._optional_text(payload.get("status")) or "online"
        collector["updatedAt"] = now_ms
        collector["lastHeartbeatAt"] = now_ms
        sequence = self._optional_int(payload.get("sequence"))
        if sequence is not None:
            collector["lastSequence"] = max(0, int(sequence))
        metadata_update = payload.get("metadata")
        if metadata_update is not None:
            if not isinstance(metadata_update, Mapping):
                raise ValueError("metadata must be a JSON object")
            merged = dict(collector.get("metadata") or {})
            merged.update({str(key): value for key, value in metadata_update.items()})
            collector["metadata"] = merged
        self.ledger.save_collector(user_key, collector)
        return {"collector": collector}

    def _normalize_project_rule(
        self,
        project_id: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        normalized_project_id = self._optional_text(project_id)
        if not normalized_project_id:
            raise ValueError("projectId is required")
        return {
            "projectId": normalized_project_id,
            "roots": ensure_absolute_roots(
                list(payload.get("roots") or []),
                allow_missing=True,
            ),
            "includeGlobs": self._parse_globs(payload.get("includeGlobs"), field_name="includeGlobs"),
            "excludeGlobs": self._parse_globs(payload.get("excludeGlobs"), field_name="excludeGlobs"),
            "drawingPatterns": self._parse_globs(
                payload.get("drawingPatterns"),
                field_name="drawingPatterns",
            ),
            "metadata": self._parse_optional_mapping(payload.get("metadata")),
            "updatedAt": int(self.time.time() * 1000),
        }

    def get_project_rules(self, user_key: str, project_id: str) -> Dict[str, Any]:
        normalized_project_id = self._optional_text(project_id)
        if not normalized_project_id:
            raise ValueError("projectId is required")
        rule = self.ledger.get_project_rule(user_key, normalized_project_id)
        return {"rule": rule or self._empty_project_rule(normalized_project_id)}

    def get_project_rule(self, user_key: str, project_id: str) -> Dict[str, Any]:
        return self.get_project_rules(user_key, project_id)

    def upsert_project_rules(
        self,
        user_key: str,
        project_id: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ValueError("Request body must be a JSON object")
        rule = self._normalize_project_rule(project_id, payload)
        self.ledger.save_project_rule(user_key, rule)
        return {"rule": rule}

    def put_project_rule(
        self,
        user_key: str,
        project_id: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        return self.upsert_project_rules(user_key, project_id, payload)

    def delete_project_rule(self, user_key: str, project_id: str) -> Dict[str, Any]:
        normalized_project_id = self._optional_text(project_id)
        if not normalized_project_id:
            raise ValueError("projectId is required")
        deleted = self.ledger.delete_project_rule(user_key, normalized_project_id)
        return {
            "deleted": deleted,
            "rule": self._empty_project_rule(normalized_project_id),
        }

    def sync_project_rules(
        self,
        user_key: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ValueError("Request body must be a JSON object")
        raw_rules = payload.get("rules")
        if raw_rules is None:
            raw_rules = []
        if not isinstance(raw_rules, list):
            raise ValueError("rules must be a list")

        normalized_rules: list[Dict[str, Any]] = []
        seen_project_ids: set[str] = set()
        for item in raw_rules:
            if not isinstance(item, Mapping):
                raise ValueError("rules must contain JSON objects")
            project_id = self._optional_text(item.get("projectId"))
            if not project_id:
                raise ValueError("Each rule requires a projectId")
            if project_id in seen_project_ids:
                raise ValueError(f"Duplicate rule received for projectId '{project_id}'")
            seen_project_ids.add(project_id)
            normalized_rules.append(self._normalize_project_rule(project_id, item))

        existing_rules = self.ledger.list_project_rules(user_key)
        deleted_project_ids: list[str] = []
        for existing_rule in existing_rules:
            existing_project_id = self._optional_text(existing_rule.get("projectId"))
            if not existing_project_id or existing_project_id in seen_project_ids:
                continue
            if self.ledger.delete_project_rule(user_key, existing_project_id):
                deleted_project_ids.append(existing_project_id)

        for rule in normalized_rules:
            self.ledger.save_project_rule(user_key, rule)

        return {
            "rules": normalized_rules,
            "count": len(normalized_rules),
            "deletedProjectIds": deleted_project_ids,
        }

    def _resolve_work_date(
        self,
        metadata: Mapping[str, Any],
        *,
        started_at_ms: int | None,
        ended_at_ms: int | None,
    ) -> str:
        work_date = self._optional_text(metadata.get("workDate"))
        if work_date:
            return work_date
        reference_ms = ended_at_ms or started_at_ms or int(self.time.time() * 1000)
        return datetime.fromtimestamp(reference_ms / 1000, tz=timezone.utc).date().isoformat()

    def _build_drawing_segment_sync_key(
        self,
        event: Mapping[str, Any],
        *,
        drawing_path: str,
        ended_at_ms: int,
        session_id: str,
    ) -> str:
        event_key = self._optional_text(event.get("eventKey"))
        if event_key:
            return f"watchdog:{event_key}"
        source_seed = "|".join(
            [
                str(event.get("collectorId") or "").strip().lower(),
                str(event.get("workstationId") or "").strip().lower(),
                normalize_path(drawing_path).lower(),
                str(ended_at_ms),
                session_id.strip().lower(),
            ]
        )
        digest = hashlib.sha256(source_seed.encode("utf-8")).hexdigest()
        return f"watchdog:drawing-segment:{digest}"

    def _build_drawing_segment_row(
        self,
        event: Mapping[str, Any],
    ) -> Dict[str, Any] | None:
        event_id = self._optional_int(event.get("eventId")) or 0
        project_id = self._optional_text(event.get("projectId"))
        drawing_path = self._optional_text(event.get("drawingPath")) or self._optional_text(event.get("path"))
        if not project_id or not drawing_path:
            return None

        metadata = dict(event.get("metadata") or {})
        tracked_ms = self._event_tracked_duration_ms(event)
        if tracked_ms is None:
            return None
        idle_ms = self._event_idle_duration_ms(event) or 0
        session_id = self._optional_text(event.get("sessionId")) or f"event-{event_id}"
        ended_at_ms = (
            self._timestamp_ms_from_value(metadata.get("segmentEndedAt"))
            or self._optional_int(event.get("timestamp"))
            or int(self.time.time() * 1000)
        )
        started_at_ms = (
            self._timestamp_ms_from_value(metadata.get("segmentStartedAt"))
            or self._timestamp_ms_from_value(metadata.get("startedAt"))
            or max(0, ended_at_ms - tracked_ms - idle_ms)
        )
        drawing_name = (
            self._metadata_text(metadata, "drawingName")
            or self._basename_from_path(drawing_path)
        )
        command_count = self._metadata_int(metadata, "commandCount") or 0
        sync_key = self._build_drawing_segment_sync_key(
            event,
            drawing_path=drawing_path,
            ended_at_ms=ended_at_ms,
            session_id=session_id,
        )
        return {
            "project_id": project_id,
            "drawing_path": drawing_path,
            "drawing_name": drawing_name,
            "work_date": self._resolve_work_date(
                metadata,
                started_at_ms=started_at_ms,
                ended_at_ms=ended_at_ms,
            ),
            "segment_started_at": self._iso_from_timestamp_ms(started_at_ms),
            "segment_ended_at": self._iso_from_timestamp_ms(ended_at_ms),
            "tracked_ms": int(tracked_ms),
            "idle_ms": int(max(0, idle_ms)),
            "command_count": int(max(0, command_count)),
            "workstation_id": str(event.get("workstationId") or "").strip(),
            "source_session_id": session_id,
            "sync_key": sync_key,
        }

    def prepare_drawing_activity_sync(
        self,
        user_key: str,
        *,
        limit: int = 100,
    ) -> Dict[str, Any]:
        safe_limit = max(1, min(500, int(limit)))
        cursor = self.ledger.get_sync_cursor(user_key, DRAWING_ACTIVITY_SYNC_CURSOR)
        after_event_id = int(cursor.get("lastEventId") or 0)
        source_events = self.ledger.list_drawing_segment_source_events(
            user_key,
            after_event_id=after_event_id,
            limit=safe_limit,
        )
        rows: list[Dict[str, Any]] = []
        last_scanned_event_id = after_event_id
        skipped_count = 0
        for event in source_events:
            event_id = self._optional_int(event.get("eventId")) or 0
            if event_id > last_scanned_event_id:
                last_scanned_event_id = event_id
            row = self._build_drawing_segment_row(event)
            if row is None:
                skipped_count += 1
                continue
            rows.append(row)

        return {
            "cursor": cursor,
            "rows": rows,
            "scannedCount": len(source_events),
            "readyCount": len(rows),
            "skippedCount": skipped_count,
            "lastScannedEventId": last_scanned_event_id,
        }

    def mark_drawing_activity_synced(
        self,
        user_key: str,
        *,
        last_event_id: int,
        metadata: Mapping[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return self.ledger.save_sync_cursor(
            user_key,
            DRAWING_ACTIVITY_SYNC_CURSOR,
            last_event_id=max(0, int(last_event_id)),
            metadata=dict(metadata or {}),
        )

    def _match_project_rule(
        self,
        target_path: str,
        rule: Mapping[str, Any],
        *,
        use_drawing_patterns: bool,
    ) -> tuple[bool, int]:
        normalized_target = normalize_path(target_path)
        filename = os.path.basename(normalized_target)
        roots = [normalize_path(str(item)) for item in (rule.get("roots") or []) if str(item).strip()]
        include_globs = list(rule.get("includeGlobs") or [])
        exclude_globs = list(rule.get("excludeGlobs") or [])
        drawing_patterns = list(rule.get("drawingPatterns") or [])

        matched_rel_paths: list[str] = []
        longest_root = 0
        for root in roots:
            try:
                common = os.path.commonpath([normalized_target, root])
            except ValueError:
                continue
            if common != root:
                continue
            matched_rel_paths.append(relative_posix(normalized_target, root))
            longest_root = max(longest_root, len(root))

        if roots and not matched_rel_paths:
            return False, 0

        if not roots and not include_globs and not drawing_patterns:
            return False, 0

        candidate_paths = matched_rel_paths or [normalized_target.replace("\\", "/")]
        for rel_path in candidate_paths:
            if include_globs and not matches_any(include_globs, rel_path, filename):
                continue
            if exclude_globs and matches_any(exclude_globs, rel_path, filename):
                continue
            if use_drawing_patterns and drawing_patterns and not matches_any(drawing_patterns, rel_path, filename):
                continue
            return True, longest_root

        return False, 0

    def _resolve_project_id(
        self,
        raw_event: Mapping[str, Any],
        rules: list[Dict[str, Any]],
    ) -> tuple[str | None, str | None]:
        explicit_project_id = self._optional_text(raw_event.get("projectId"))
        if explicit_project_id:
            return explicit_project_id, "explicit"

        drawing_path = self._optional_text(raw_event.get("drawingPath"))
        candidate_path = drawing_path or self._optional_text(raw_event.get("path"))
        if not candidate_path:
            return None, None

        best_rule: Dict[str, Any] | None = None
        best_rank = (-1, -1, "")
        for rule in rules:
            matched, root_length = self._match_project_rule(
                candidate_path,
                rule,
                use_drawing_patterns=bool(drawing_path),
            )
            if not matched:
                continue
            rank = (root_length, int(rule.get("updatedAt") or 0), str(rule.get("projectId") or ""))
            if rank > best_rank:
                best_rule = rule
                best_rank = rank

        if best_rule is None:
            return None, None
        return self._optional_text(best_rule.get("projectId")), "rule"

    def _derive_legacy_session_id(
        self,
        collector: Mapping[str, Any],
        raw_event: Mapping[str, Any],
        project_id: str | None,
    ) -> str | None:
        event_stub = {
            "collectorType": str(collector.get("collectorType") or ""),
            "sourceType": self._optional_text(raw_event.get("sourceType"))
            or str(collector.get("collectorType") or ""),
            "eventType": str(raw_event.get("eventType") or raw_event.get("type") or ""),
        }
        if not self._is_autocad_session_event(event_stub):
            return None

        drawing_path = self._optional_text(raw_event.get("drawingPath")) or self._optional_text(
            raw_event.get("path")
        )
        if not drawing_path:
            return None

        collector_id = self._optional_text(raw_event.get("collectorId")) or str(
            collector.get("collectorId") or ""
        )
        session_seed = "|".join(
            [
                collector_id.strip().lower(),
                str(project_id or "").strip().lower(),
                normalize_path(drawing_path).lower(),
            ]
        )
        digest = hashlib.sha1(session_seed.encode("utf-8")).hexdigest()[:16]
        return f"legacy-{digest}"

    def _normalize_collector_event(
        self,
        collector: Mapping[str, Any],
        raw_event: Mapping[str, Any],
        rules: list[Dict[str, Any]],
    ) -> Dict[str, Any]:
        event_type = str(raw_event.get("eventType") or raw_event.get("type") or "").strip().lower()
        event_type = {
            "added": "file_added",
            "removed": "file_removed",
            "modified": "file_modified",
        }.get(event_type, event_type or "unknown")
        timestamp_ms = self._optional_int(raw_event.get("timestamp")) or int(self.time.time() * 1000)
        metadata = self._parse_optional_mapping(raw_event.get("metadata"))
        project_id, attribution_source = self._resolve_project_id(raw_event, rules)
        if attribution_source and "attributionSource" not in metadata:
            metadata["attributionSource"] = attribution_source
        session_id = self._optional_text(raw_event.get("sessionId")) or self._derive_legacy_session_id(
            collector,
            raw_event,
            project_id,
        )
        if session_id and not self._optional_text(raw_event.get("sessionId")):
            metadata.setdefault("sessionSource", "derived")

        source_event_id = self._optional_int(raw_event.get("sourceEventId"))
        if source_event_id is None:
            source_event_id = self._optional_int(raw_event.get("sequence"))
        if source_event_id is None:
            source_event_id = self._optional_int(raw_event.get("eventId"))

        payload: Dict[str, Any] = {
            "collectorId": str(collector.get("collectorId") or ""),
            "collectorType": str(collector.get("collectorType") or ""),
            "workstationId": self._optional_text(raw_event.get("workstationId"))
            or str(collector.get("workstationId") or ""),
            "eventType": event_type,
            "sourceType": self._optional_text(raw_event.get("sourceType"))
            or str(collector.get("collectorType") or "collector"),
            "timestamp": int(timestamp_ms),
            "projectId": project_id,
            "sessionId": session_id,
            "path": self._optional_text(raw_event.get("path")),
            "drawingPath": self._optional_text(raw_event.get("drawingPath")),
            "metadata": metadata,
        }
        event_key = self._optional_text(raw_event.get("eventKey"))
        if event_key:
            payload["eventKey"] = event_key
        if source_event_id is not None and source_event_id > 0:
            payload.setdefault("eventKey", f"source:{int(source_event_id)}")
            payload["sourceEventId"] = int(source_event_id)
        size_bytes = self._optional_int(raw_event.get("sizeBytes"))
        if size_bytes is not None:
            payload["sizeBytes"] = int(size_bytes)
        mtime_ms = self._optional_int(raw_event.get("mtimeMs"))
        if mtime_ms is not None:
            payload["mtimeMs"] = int(mtime_ms)
        duration_ms = self._optional_int(raw_event.get("durationMs"))
        if duration_ms is not None:
            payload["durationMs"] = int(duration_ms)
            metadata.setdefault("trackedMs", int(duration_ms))
        if "trackedMs" not in metadata:
            active_seconds = self._optional_int(metadata.get("activeSeconds"))
            if active_seconds is not None:
                metadata["trackedMs"] = int(active_seconds) * 1000
        if "idleMs" not in metadata:
            idle_seconds = self._optional_int(metadata.get("idleSeconds"))
            if idle_seconds is not None:
                metadata["idleMs"] = int(idle_seconds) * 1000
        return payload

    def ingest_collector_events(self, user_key: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ValueError("Request body must be a JSON object")
        collector_id = self._optional_text(payload.get("collectorId"))
        if not collector_id:
            raise ValueError("collectorId is required")
        raw_events = payload.get("events")
        if not isinstance(raw_events, list):
            raise ValueError("events must be a list")
        collector = self.ledger.get_collector(user_key, collector_id)
        if collector is None:
            raise KeyError("Collector is not registered")
        rules = self.ledger.list_project_rules(user_key)
        normalized_events: list[Dict[str, Any]] = []
        rejected = 0
        for item in raw_events:
            if not isinstance(item, Mapping):
                rejected += 1
                continue
            normalized_events.append(self._normalize_collector_event(collector, item, rules))
        insert_result = self.ledger.insert_events(
            user_key,
            collector_id=collector_id,
            events=normalized_events,
            max_events_retained=self.max_collector_events_retained,
        )
        accepted_events = list(insert_result.get("events") or [])
        now_ms = int(self.time.time() * 1000)
        collector["eventCount"] = int(collector.get("eventCount") or 0) + len(accepted_events)
        collector["updatedAt"] = now_ms
        collector["lastHeartbeatAt"] = now_ms
        if accepted_events:
            collector["lastEventAt"] = int(accepted_events[-1].get("timestamp") or now_ms)
        self.ledger.save_collector(user_key, collector)
        return {
            "accepted": len(accepted_events),
            "rejected": rejected,
            "duplicates": int(insert_result.get("duplicates") or 0),
            "collector": collector,
            "nextEventId": int(insert_result.get("nextEventId") or 1),
        }

    def list_collectors(self, user_key: str) -> Dict[str, Any]:
        collectors = self.ledger.list_collectors(user_key)
        return {"collectors": collectors, "count": len(collectors)}

    def list_events(
        self,
        user_key: str,
        *,
        limit: int = 200,
        after_event_id: int = 0,
        collector_id: str | None = None,
        project_id: str | None = None,
        event_type: str | None = None,
        since_ms: int | None = None,
        until_ms: int | None = None,
    ) -> Dict[str, Any]:
        return self.ledger.list_events(
            user_key,
            limit=limit,
            after_event_id=after_event_id,
            collector_id=self._optional_text(collector_id),
            project_id=self._optional_text(project_id),
            event_type=self._optional_text(event_type),
            since_ms=since_ms,
            until_ms=until_ms,
        )

    @staticmethod
    def _is_autocad_session_event(event: Mapping[str, Any]) -> bool:
        collector_type = str(event.get("collectorType") or "").strip().lower()
        source_type = str(event.get("sourceType") or "").strip().lower()
        event_type = str(event.get("eventType") or "").strip().lower()
        if collector_type == "autocad_state" or source_type == "autocad":
            return True
        return (
            event_type.startswith("drawing_")
            or event_type.startswith("idle_")
            or event_type == "command_executed"
        )

    def _session_tracking_key(self, event: Mapping[str, Any]) -> tuple[str, str, str]:
        drawing_path = self._optional_text(event.get("drawingPath")) or self._optional_text(event.get("path")) or ""
        return (
            str(event.get("collectorId") or "").strip(),
            self._optional_text(event.get("projectId")) or "",
            drawing_path,
        )

    def _resolve_session_id(
        self,
        event: Mapping[str, Any],
        *,
        active_sessions: dict[tuple[str, str, str], str],
    ) -> str | None:
        explicit_session_id = self._optional_text(event.get("sessionId"))
        if explicit_session_id:
            tracking_key = self._session_tracking_key(event)
            if any(tracking_key):
                active_sessions[tracking_key] = explicit_session_id
            return explicit_session_id

        event_type = str(event.get("eventType") or "").strip().lower()
        tracking_key = self._session_tracking_key(event)
        if not any(tracking_key):
            return None

        current_session_id = active_sessions.get(tracking_key)
        if current_session_id:
            return current_session_id

        if event_type.startswith("drawing_") or event_type == "command_executed":
            fallback_seed = self._optional_text(event.get("eventKey")) or str(
                self._optional_int(event.get("eventId")) or int(event.get("timestamp") or 0)
            )
            synthetic_session_id = (
                f"synthetic:{tracking_key[0] or 'collector'}:{fallback_seed}"
            )
            active_sessions[tracking_key] = synthetic_session_id
            return synthetic_session_id
        return None

    def _event_tracked_duration_ms(self, event: Mapping[str, Any]) -> int | None:
        metadata = dict(event.get("metadata") or {})
        tracked_ms = self._metadata_int(metadata, "trackedMs", "activeMs")
        if tracked_ms is not None:
            return max(0, int(tracked_ms))
        duration_ms = self._optional_int(event.get("durationMs"))
        if duration_ms is not None:
            return max(0, int(duration_ms))
        return None

    def _event_idle_duration_ms(self, event: Mapping[str, Any]) -> int | None:
        metadata = dict(event.get("metadata") or {})
        idle_ms = self._metadata_int(metadata, "idleMs")
        if idle_ms is not None:
            return max(0, int(idle_ms))
        idle_seconds = metadata.get("idleSeconds")
        if isinstance(idle_seconds, (int, float)):
            return max(0, int(round(float(idle_seconds) * 1000)))
        return None

    def _collector_live_tracked_duration_ms(self, metadata: Mapping[str, Any]) -> int | None:
        tracked_ms = self._metadata_int(
            metadata,
            "currentSessionTrackedMs",
            "activeTimeMs",
            "trackedMs",
        )
        if tracked_ms is not None:
            return max(0, int(tracked_ms))
        return None

    def _collector_live_idle_duration_ms(self, metadata: Mapping[str, Any]) -> int | None:
        idle_ms = self._metadata_int(metadata, "currentSessionIdleMs", "idleMs")
        if idle_ms is not None:
            return max(0, int(idle_ms))
        return None

    def list_sessions(
        self,
        user_key: str,
        *,
        limit: int = 12,
        collector_id: str | None = None,
        project_id: str | None = None,
        time_window_ms: int = 24 * 60 * 60 * 1000,
        active_only: bool = False,
    ) -> Dict[str, Any]:
        now_ms = int(self.time.time() * 1000)
        safe_limit = max(1, min(100, int(limit)))
        safe_window = max(60_000, int(time_window_ms))
        start_ms = now_ms - safe_window
        normalized_collector_id = self._optional_text(collector_id)
        normalized_project_id = self._optional_text(project_id)

        collectors = self.ledger.list_collectors(user_key)
        rules = self.ledger.list_project_rules(user_key)
        collector_map = {
            str(item.get("collectorId") or ""): item for item in collectors
        }

        raw_events = self.ledger.list_window_events(
            user_key,
            since_ms=start_ms,
            project_id=normalized_project_id,
        )
        session_map: Dict[str, Dict[str, Any]] = {}
        active_sessions: dict[tuple[str, str, str], str] = {}

        for event in raw_events:
            if normalized_collector_id and str(event.get("collectorId") or "") != normalized_collector_id:
                continue
            if not self._is_autocad_session_event(event):
                continue

            session_id = self._resolve_session_id(event, active_sessions=active_sessions)
            if not session_id:
                continue

            event_type = str(event.get("eventType") or "unknown")
            timestamp = int(event.get("timestamp") or 0)
            drawing_path = self._optional_text(event.get("drawingPath")) or self._optional_text(event.get("path"))
            event_metadata = dict(event.get("metadata") or {})
            event_started_at = (
                self._timestamp_ms_from_value(event_metadata.get("segmentStartedAt"))
                or self._timestamp_ms_from_value(event_metadata.get("startedAt"))
                or timestamp
            )
            session = session_map.get(session_id)
            if session is None:
                session = {
                    "sessionId": session_id,
                    "collectorId": str(event.get("collectorId") or ""),
                    "collectorType": str(event.get("collectorType") or ""),
                    "workstationId": str(event.get("workstationId") or ""),
                    "projectId": self._optional_text(event.get("projectId")),
                    "drawingPath": drawing_path,
                    "status": "completed",
                    "active": False,
                    "startedAt": event_started_at,
                    "endedAt": None,
                    "latestEventAt": timestamp,
                    "lastActivityAt": None,
                    "lastEventType": event_type,
                    "eventCount": 0,
                    "commandCount": 0,
                    "idleCount": 0,
                    "activationCount": 0,
                    "durationMs": 0,
                    "idleDurationMs": 0,
                    "durationSource": None,
                    "sourceAvailable": False,
                    "pendingCount": 0,
                    "trackerUpdatedAt": None,
                }
                session_map[session_id] = session

            session["startedAt"] = min(int(session.get("startedAt") or event_started_at), event_started_at)
            session["latestEventAt"] = max(int(session.get("latestEventAt") or 0), timestamp)
            session["lastEventType"] = event_type
            session["eventCount"] = int(session.get("eventCount") or 0) + 1
            if drawing_path:
                session["drawingPath"] = drawing_path
            if event.get("projectId"):
                session["projectId"] = self._optional_text(event.get("projectId"))

            if event_type == "command_executed":
                session["commandCount"] = int(session.get("commandCount") or 0) + 1
                session["lastActivityAt"] = timestamp
            elif event_type in {"drawing_opened", "drawing_activated", "idle_resumed"}:
                session["activationCount"] = int(session.get("activationCount") or 0) + 1
                session["lastActivityAt"] = timestamp
            elif event_type == "idle_started":
                session["idleCount"] = int(session.get("idleCount") or 0) + 1
            elif event_type == "drawing_closed":
                session["endedAt"] = timestamp
                session["lastActivityAt"] = timestamp
                tracked_duration_ms = self._event_tracked_duration_ms(event)
                if tracked_duration_ms is not None:
                    session["durationMs"] = max(
                        int(session.get("durationMs") or 0),
                        int(tracked_duration_ms),
                    )
                    session["durationSource"] = "tracker_closed"
                idle_duration_ms = self._event_idle_duration_ms(event)
                if idle_duration_ms is not None:
                    session["idleDurationMs"] = max(
                        int(session.get("idleDurationMs") or 0),
                        int(idle_duration_ms),
                    )
                closed_command_count = self._metadata_int(event_metadata, "commandCount")
                if closed_command_count is not None:
                    session["commandCount"] = max(
                        int(session.get("commandCount") or 0),
                        int(closed_command_count),
                    )

            if event_type == "drawing_closed":
                tracking_key = self._session_tracking_key(event)
                active_session_id = active_sessions.get(tracking_key)
                if active_session_id == session_id:
                    active_sessions.pop(tracking_key, None)

        for collector in collectors:
            collector_key = str(collector.get("collectorId") or "")
            if normalized_collector_id and collector_key != normalized_collector_id:
                continue
            if not self._is_autocad_session_event(collector):
                capabilities = [str(item or "").strip().lower() for item in (collector.get("capabilities") or [])]
                if "drawing_sessions" not in capabilities and "autocad" not in capabilities:
                    continue

            metadata = dict(collector.get("metadata") or {})
            current_session_id = self._optional_text(metadata.get("currentSessionId"))
            if not current_session_id:
                continue
            source_available = bool(metadata.get("sourceAvailable"))

            drawing_path = self._optional_text(metadata.get("activeDrawingPath")) or self._optional_text(metadata.get("activeDrawingName"))
            inferred_project_id = self._optional_text(metadata.get("projectId"))
            if not inferred_project_id and drawing_path:
                inferred_project_id, _ = self._resolve_project_id(
                    {"drawingPath": drawing_path},
                    rules,
                )

            tracker_updated_at = self._optional_int(metadata.get("trackerUpdatedAt")) or int(
                collector.get("lastHeartbeatAt") or now_ms
            )
            last_activity_at = self._optional_int(metadata.get("lastActivityAt"))
            live_started_at = (
                self._timestamp_ms_from_value(metadata.get("currentSessionStartedAt"))
                or self._timestamp_ms_from_value(metadata.get("startedAt"))
                or tracker_updated_at
            )
            session = session_map.get(current_session_id)
            existing_project_id = self._optional_text(session.get("projectId")) if session else None
            effective_project_id = inferred_project_id or existing_project_id
            if normalized_project_id and effective_project_id != normalized_project_id:
                continue
            if session is None:
                session = {
                    "sessionId": current_session_id,
                    "collectorId": collector_key,
                    "collectorType": str(collector.get("collectorType") or ""),
                    "workstationId": str(collector.get("workstationId") or ""),
                    "projectId": effective_project_id,
                    "drawingPath": drawing_path,
                    "status": "completed",
                    "active": False,
                    "startedAt": live_started_at,
                    "endedAt": None,
                    "latestEventAt": tracker_updated_at,
                    "lastActivityAt": last_activity_at,
                    "lastEventType": None,
                    "eventCount": 0,
                    "commandCount": 0,
                    "idleCount": 0,
                    "activationCount": 0,
                    "durationMs": 0,
                    "idleDurationMs": 0,
                    "durationSource": None,
                    "sourceAvailable": False,
                    "pendingCount": 0,
                    "trackerUpdatedAt": tracker_updated_at,
                }
                session_map[current_session_id] = session

            session["collectorId"] = collector_key
            session["collectorType"] = str(collector.get("collectorType") or "")
            session["workstationId"] = str(collector.get("workstationId") or "")
            session["sourceAvailable"] = source_available
            if source_available:
                session["active"] = True
                session["status"] = "paused" if bool(metadata.get("isPaused")) else "live"
            else:
                session["active"] = False
                if not session.get("status") or str(session.get("status")) in {"live", "paused"}:
                    session["status"] = "completed"
            session["pendingCount"] = max(
                int(session.get("pendingCount") or 0),
                max(0, self._optional_int(metadata.get("pendingCount")) or 0),
            )
            session["trackerUpdatedAt"] = tracker_updated_at
            session["startedAt"] = min(
                int(session.get("startedAt") or live_started_at),
                int(live_started_at),
            )
            session["latestEventAt"] = max(int(session.get("latestEventAt") or 0), tracker_updated_at)
            if last_activity_at is not None:
                session["lastActivityAt"] = max(
                    int(session.get("lastActivityAt") or 0),
                    int(last_activity_at),
                )
            if drawing_path:
                session["drawingPath"] = drawing_path
            if effective_project_id:
                session["projectId"] = effective_project_id
            live_tracked_duration_ms = self._collector_live_tracked_duration_ms(metadata)
            if live_tracked_duration_ms is not None:
                session["durationMs"] = max(
                    int(session.get("durationMs") or 0),
                    int(live_tracked_duration_ms),
                )
                session["durationSource"] = "tracker_live"
            live_idle_duration_ms = self._collector_live_idle_duration_ms(metadata)
            if live_idle_duration_ms is not None:
                session["idleDurationMs"] = max(
                    int(session.get("idleDurationMs") or 0),
                    int(live_idle_duration_ms),
                )
            live_command_count = self._metadata_int(metadata, "currentSessionCommandCount", "commandCount")
            if live_command_count is not None:
                session["commandCount"] = max(
                    int(session.get("commandCount") or 0),
                    int(live_command_count),
                )

        sessions: list[Dict[str, Any]] = []
        for session in session_map.values():
            if normalized_project_id and self._optional_text(session.get("projectId")) != normalized_project_id:
                continue
            if active_only and not bool(session.get("active")):
                continue

            latest_event_at = int(session.get("latestEventAt") or 0)
            tracker_updated_at = self._optional_int(session.get("trackerUpdatedAt"))
            effective_end = self._optional_int(session.get("endedAt"))
            if effective_end is None:
                effective_end = max(
                    latest_event_at,
                    tracker_updated_at or 0,
                )
            started_at = int(session.get("startedAt") or effective_end or now_ms)
            tracked_duration_ms = self._optional_int(session.get("durationMs"))
            if tracked_duration_ms is None or (
                tracked_duration_ms <= 0 and not self._optional_text(session.get("durationSource"))
            ):
                tracked_duration_ms = max(0, int(effective_end or started_at) - started_at)
                session["durationSource"] = session.get("durationSource") or "elapsed_fallback"
            session["durationMs"] = int(tracked_duration_ms)
            if not session.get("status"):
                session["status"] = "completed"
            sessions.append(session)

        sessions.sort(
            key=lambda item: (
                0 if bool(item.get("active")) else 1,
                -int(item.get("latestEventAt") or 0),
                str(item.get("sessionId") or ""),
            )
        )
        return {
            "generatedAt": now_ms,
            "timeWindowMs": safe_window,
            "projectId": normalized_project_id,
            "collectorId": normalized_collector_id,
            "count": len(sessions),
            "sessions": sessions[:safe_limit],
        }

    def overview(
        self,
        user_key: str,
        *,
        project_id: str | None = None,
        time_window_ms: int = 24 * 60 * 60 * 1000,
    ) -> Dict[str, Any]:
        now_ms = int(self.time.time() * 1000)
        safe_window = max(60_000, int(time_window_ms))
        normalized_project_id = self._optional_text(project_id)
        start_ms = now_ms - safe_window
        collectors = self.ledger.list_collectors(user_key)
        window_events = self.ledger.list_window_events(
            user_key,
            since_ms=start_ms,
            project_id=normalized_project_id,
        )
        recent_events = self.ledger.list_recent_events(
            user_key,
            limit=20,
            project_id=normalized_project_id,
            since_ms=start_ms,
        )
        rollups = self.ledger.list_rollups(
            user_key,
            since_ms=start_ms,
            project_id=normalized_project_id or None,
        )
        active_cutoff = now_ms - 10 * 60 * 1000
        online_collectors = [
            collector
            for collector in collectors
            if str(collector.get("status") or "").lower() not in {"offline", "stopped", "error"}
            and int(collector.get("lastHeartbeatAt") or 0) >= active_cutoff
        ]
        event_type_counts = Counter(str(event.get("eventType") or "unknown") for event in window_events)
        source_type_counts = Counter(str(event.get("sourceType") or "unknown") for event in window_events)
        project_counts = Counter(
            str(event.get("projectId") or "")
            for event in window_events
            if str(event.get("projectId") or "").strip()
        )
        bucket_ms = 60 * 60 * 1000
        bucket_count = max(1, min(48, (safe_window + bucket_ms - 1) // bucket_ms))
        aligned_now = now_ms - (now_ms % bucket_ms)
        bucket_start_ms = aligned_now - ((bucket_count - 1) * bucket_ms)
        bucket_counts = Counter()
        for rollup in rollups:
            bucket_counts[int(rollup.get("bucketStartMs") or 0)] += int(rollup.get("eventCount") or 0)
        trend_buckets = [
            {
                "bucketStartMs": int(bucket_start_ms + (index * bucket_ms)),
                "eventCount": int(bucket_counts.get(bucket_start_ms + (index * bucket_ms), 0)),
            }
            for index in range(bucket_count)
        ]
        return {
            "generatedAt": now_ms,
            "timeWindowMs": safe_window,
            "projectId": normalized_project_id,
            "collectors": {
                "total": len(collectors),
                "online": len(online_collectors),
                "offline": max(0, len(collectors) - len(online_collectors)),
            },
            "events": {
                "retained": self.ledger.count_events(user_key, project_id=normalized_project_id),
                "inWindow": len(window_events),
                "latestEventAt": int(max((event.get("timestamp") or 0) for event in window_events))
                if window_events
                else 0,
                "byType": dict(event_type_counts),
                "bySourceType": dict(source_type_counts),
                "latest": list(reversed(recent_events)),
            },
            "projects": {
                "top": [
                    {"projectId": project_key, "eventCount": int(count)}
                    for project_key, count in project_counts.most_common(10)
                ]
            },
            "trendBuckets": trend_buckets,
        }

    def dashboard_snapshot(
        self,
        user_key: str,
        *,
        project_id: str | None = None,
        collector_id: str | None = None,
        time_window_ms: int = 24 * 60 * 60 * 1000,
        events_limit: int = 8,
        sessions_limit: int = 8,
    ) -> Dict[str, Any]:
        now_ms = int(self.time.time() * 1000)
        safe_window = max(60_000, int(time_window_ms))
        normalized_project_id = self._optional_text(project_id)
        normalized_collector_id = self._optional_text(collector_id)
        safe_events_limit = max(1, min(100, int(events_limit)))
        safe_sessions_limit = max(1, min(100, int(sessions_limit)))
        start_ms = now_ms - safe_window

        collectors_payload = self.list_collectors(user_key)
        overview_payload = self.overview(
            user_key,
            project_id=normalized_project_id,
            time_window_ms=safe_window,
        )
        events_payload = self.list_events(
            user_key,
            limit=safe_events_limit,
            collector_id=normalized_collector_id,
            project_id=normalized_project_id,
            since_ms=start_ms,
        )
        sessions_payload = self.list_sessions(
            user_key,
            limit=safe_sessions_limit,
            collector_id=normalized_collector_id,
            project_id=normalized_project_id,
            time_window_ms=safe_window,
        )

        return {
            "generatedAt": now_ms,
            "timeWindowMs": safe_window,
            "projectId": normalized_project_id,
            "collectorId": normalized_collector_id,
            "collectors": {"ok": True, **collectors_payload},
            "overview": {"ok": True, **overview_payload},
            "events": {"ok": True, **events_payload},
            "sessions": {"ok": True, **sessions_payload},
        }
