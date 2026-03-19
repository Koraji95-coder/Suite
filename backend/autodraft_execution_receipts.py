from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY: set[str] = set()


def _default_receipt_db_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return (
            Path(local_app_data)
            / "Suite"
            / "autodraft"
            / "execution-receipts.sqlite3"
        )
    return (
        Path.home()
        / ".suite"
        / "autodraft"
        / "execution-receipts.sqlite3"
    )


def get_receipt_db_path() -> Path:
    override = str(os.environ.get("SUITE_AUTODRAFT_RECEIPTS_DB") or "").strip()
    if override:
        return Path(override)
    return _default_receipt_db_path()


@contextmanager
def _connect(db_path: Optional[Path] = None) -> Iterator[sqlite3.Connection]:
    resolved_path = db_path or get_receipt_db_path()
    resolved_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(resolved_path))
    try:
        _ensure_schema(connection, resolved_path)
        yield connection
    finally:
        connection.close()


def _ensure_schema(connection: sqlite3.Connection, db_path: Path) -> None:
    cache_key = str(db_path)
    if cache_key in _SCHEMA_READY:
        return

    with _SCHEMA_LOCK:
        if cache_key in _SCHEMA_READY:
            return
        connection.execute(
            """
            create table if not exists autodraft_execution_receipts (
                id text primary key,
                request_id text not null,
                job_id text,
                provider_path text not null,
                source text not null,
                status text not null,
                dry_run integer not null,
                accepted integer not null,
                skipped integer not null,
                drawing_name text,
                drawing_path text,
                message text,
                warnings_json text not null,
                workflow_context_json text,
                revision_context_json text,
                response_meta_json text,
                created_handles_json text,
                created_at text not null
            )
            """
        )
        connection.execute(
            "create index if not exists idx_autodraft_execution_receipts_request_id "
            "on autodraft_execution_receipts(request_id)"
        )
        connection.commit()
        _SCHEMA_READY.add(cache_key)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _extract_drawing_name(response_payload: Dict[str, Any]) -> str:
    meta = response_payload.get("meta")
    if isinstance(meta, dict):
        cad = meta.get("cad")
        if isinstance(cad, dict):
            drawing_name = _normalize_text(cad.get("drawingName"))
            if drawing_name:
                return drawing_name
    return ""


def _extract_drawing_path(response_payload: Dict[str, Any]) -> str:
    meta = response_payload.get("meta")
    if isinstance(meta, dict):
        cad = meta.get("cad")
        if isinstance(cad, dict):
            drawing_path = _normalize_text(cad.get("drawingPath"))
            if drawing_path:
                return drawing_path
    return ""


def persist_autodraft_execution_receipt(
    *,
    request_id: str,
    payload: Dict[str, Any],
    response_payload: Dict[str, Any],
    provider_path: str,
) -> Dict[str, Any]:
    created_at = datetime.now(timezone.utc).isoformat()
    receipt_id = f"autodraft-receipt-{request_id}"
    workflow_context = (
        payload.get("workflow_context")
        if isinstance(payload.get("workflow_context"), dict)
        else {}
    )
    revision_context = (
        payload.get("revision_context")
        if isinstance(payload.get("revision_context"), dict)
        else {}
    )
    warnings = response_payload.get("warnings")
    normalized_warnings = warnings if isinstance(warnings, list) else []
    meta = response_payload.get("meta") if isinstance(response_payload.get("meta"), dict) else {}
    commit_meta = meta.get("commit") if isinstance(meta.get("commit"), dict) else {}
    created_handles = (
        commit_meta.get("createdHandles")
        if isinstance(commit_meta.get("createdHandles"), list)
        else []
    )

    receipt_summary = {
        "id": receipt_id,
        "requestId": request_id,
        "jobId": _normalize_text(response_payload.get("job_id")),
        "providerPath": _normalize_text(provider_path) or "unknown",
        "source": _normalize_text(response_payload.get("source")) or "unknown",
        "status": _normalize_text(response_payload.get("status")) or "unknown",
        "dryRun": bool(response_payload.get("dry_run", True)),
        "accepted": int(response_payload.get("accepted") or 0),
        "skipped": int(response_payload.get("skipped") or 0),
        "drawingName": _extract_drawing_name(response_payload) or None,
        "drawingPath": _extract_drawing_path(response_payload) or None,
        "createdAt": created_at,
    }

    with _connect() as connection:
        connection.execute(
            """
            insert or replace into autodraft_execution_receipts (
                id,
                request_id,
                job_id,
                provider_path,
                source,
                status,
                dry_run,
                accepted,
                skipped,
                drawing_name,
                drawing_path,
                message,
                warnings_json,
                workflow_context_json,
                revision_context_json,
                response_meta_json,
                created_handles_json,
                created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                receipt_summary["id"],
                request_id,
                receipt_summary["jobId"] or None,
                receipt_summary["providerPath"],
                receipt_summary["source"],
                receipt_summary["status"],
                1 if receipt_summary["dryRun"] else 0,
                receipt_summary["accepted"],
                receipt_summary["skipped"],
                receipt_summary["drawingName"],
                receipt_summary["drawingPath"],
                _normalize_text(response_payload.get("message")) or None,
                _normalize_json(normalized_warnings),
                _normalize_json(workflow_context),
                _normalize_json(revision_context),
                _normalize_json(meta),
                _normalize_json(created_handles),
                created_at,
            ),
        )
        connection.commit()

    return receipt_summary
