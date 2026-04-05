from __future__ import annotations

import base64
from typing import Any, Callable, Dict, Mapping, Optional, Tuple


def websocket_connected_payload(
    *,
    backend_id: str,
    backend_version: str,
    timestamp: float,
) -> Dict[str, Any]:
    return {
        "type": "connected",
        "backend_id": backend_id,
        "backend_version": backend_version,
        "timestamp": timestamp,
    }


def websocket_status_payload(
    status: Mapping[str, Any],
    *,
    backend_id: str,
    backend_version: str,
    timestamp: float,
) -> Dict[str, Any]:
    return {
        "type": "status",
        "backend_id": backend_id,
        "backend_version": backend_version,
        "connected": bool(status.get("connected")),
        "autocad_running": bool(status.get("autocad_running")),
        "drawing_open": bool(status.get("drawing_open")),
        "drawing_name": status.get("drawing_name"),
        "error": status.get("error"),
        "checks": status.get("checks", {}),
        "timestamp": timestamp,
    }


def websocket_progress_payload(progress_state: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "type": "progress",
        "run_id": progress_state.get("run_id"),
        "stage": str(progress_state.get("stage") or "processing"),
        "progress": int(progress_state.get("progress") or 0),
        "current_item": progress_state.get("current_item"),
        "message": str(progress_state.get("message") or ""),
    }


def websocket_complete_payload(progress_state: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "type": "complete",
        "run_id": progress_state.get("run_id"),
        "message": str(progress_state.get("message") or "Completed"),
        "timestamp": progress_state.get("timestamp"),
    }


def websocket_error_payload(progress_state: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "type": "error",
        "run_id": progress_state.get("run_id"),
        "message": str(progress_state.get("message") or "Execution failed"),
        "error_details": str(progress_state.get("message") or "Execution failed"),
        "code": "EXECUTION_FAILED",
        "timestamp": progress_state.get("timestamp"),
    }


def _normalize_status_signature(status: Mapping[str, Any]) -> Tuple[Any, ...]:
    checks = status.get("checks", {})
    if isinstance(checks, Mapping):
        checks_signature: Any = tuple(
            sorted((str(key), str(value)) for key, value in checks.items())
        )
    else:
        checks_signature = str(checks)

    return (
        bool(status.get("connected")),
        bool(status.get("autocad_running")),
        bool(status.get("drawing_open")),
        str(status.get("drawing_name") or ""),
        str(status.get("error") or ""),
        checks_signature,
    )


def _resolve_next_poll_interval_seconds(
    *,
    base_poll_interval_seconds: float,
    max_poll_interval_seconds: float,
    idle_iterations: int,
    had_status_change: bool,
    had_progress_events: bool,
) -> float:
    if had_status_change or had_progress_events:
        return max(0.25, base_poll_interval_seconds * 0.5)

    # Idle periods back off gradually to reduce server wakeups.
    backoff_step_seconds = 0.5
    next_interval = base_poll_interval_seconds + (backoff_step_seconds * idle_iterations)
    return min(max_poll_interval_seconds, max(base_poll_interval_seconds, next_interval))


def _derive_request_id(request_obj: Any, *, fallback_timestamp_ms: int) -> str:
    args = getattr(request_obj, "args", {}) or {}
    headers = getattr(request_obj, "headers", {}) or {}
    candidate = (
        str(args.get("requestId") or args.get("request_id") or "").strip()
        or str(headers.get("X-Request-ID") or headers.get("X-Request-Id") or "").strip()
    )
    if candidate:
        return candidate[:128]
    return f"req-{fallback_timestamp_ms}"


def _derive_connection_id(
    *,
    request_id: str,
    remote_addr: str,
    timestamp_ms: int,
) -> str:
    suffix = abs(hash((request_id, remote_addr, timestamp_ms))) % 100000
    return f"ws-{timestamp_ms}-{suffix:05d}"


def websocket_status_bridge(
    ws: Any,
    *,
    request_obj: Any,
    is_valid_api_key_fn: Any,
    logger: Any,
    get_manager: Any,
    json_module: Any,
    time_module: Any,
    backend_id: str,
    backend_version: str,
    consume_ws_ticket_fn: Optional[Callable[[str, str], Tuple[bool, str]]] = None,
    allow_api_key_fallback: bool = True,
    poll_interval_seconds: float = 2.0,
    max_poll_interval_seconds: float = 5.0,
    status_keepalive_seconds: float = 12.0,
    max_iterations: Optional[int] = None,
) -> None:
    remote_addr = str(getattr(request_obj, "remote_addr", "") or "unknown")
    bootstrap_timestamp_ms = int(time_module.time() * 1000)
    request_id = _derive_request_id(
        request_obj,
        fallback_timestamp_ms=bootstrap_timestamp_ms,
    )
    connection_id = _derive_connection_id(
        request_id=request_id,
        remote_addr=remote_addr,
        timestamp_ms=bootstrap_timestamp_ms,
    )
    auth_mode = ""
    auth_failure_reason = "auth_missing"

    provided_ticket = str(request_obj.args.get("ticket") or "").strip()
    if provided_ticket and consume_ws_ticket_fn is not None:
        try:
            ticket_ok, ticket_reason = consume_ws_ticket_fn(provided_ticket, remote_addr)
        except Exception:
            ticket_ok = False
            ticket_reason = "ticket_validator_error"
        if ticket_ok:
            auth_mode = "ticket"
        else:
            auth_failure_reason = f"ticket_{ticket_reason or 'invalid'}"

    if not auth_mode and allow_api_key_fallback:
        provided_key = request_obj.args.get("api_key")
        if not provided_key:
            headers = getattr(request_obj, "headers", {}) or {}
            protocol_header = str(headers.get("Sec-WebSocket-Protocol", "") or "")
            for token in (part.strip() for part in protocol_header.split(",")):
                if token.startswith("api-key."):
                    encoded = token[len("api-key.") :]
                    try:
                        padding = "=" * (-len(encoded) % 4)
                        provided_key = base64.urlsafe_b64decode(
                            (encoded + padding).encode("ascii")
                        ).decode("utf-8")
                        break
                    except Exception:
                        continue
                if token.startswith("api-key-plain."):
                    provided_key = token[len("api-key-plain.") :]
                    break

        if provided_key and is_valid_api_key_fn(provided_key):
            auth_mode = "api_key"
        elif provided_key:
            auth_failure_reason = "api_key_invalid"
        elif auth_failure_reason == "auth_missing":
            auth_failure_reason = "api_key_missing"

    if not auth_mode:
        try:
            ws.send(
                json_module.dumps(
                    {
                        "type": "error",
                        "message": "Authentication failed",
                        "code": "AUTH_INVALID",
                    }
                )
            )
        finally:
            try:
                ws.close()
            except Exception:
                pass  # Connection may already be closed
        logger.warning(
            "Unauthorized websocket from %s (reason=%s, request_id=%s, connection_id=%s)",
            remote_addr,
            auth_failure_reason,
            request_id,
            connection_id,
        )
        return

    logger.info(
        "WebSocket connected from %s (auth_mode=%s, request_id=%s, connection_id=%s)",
        remote_addr,
        auth_mode,
        request_id,
        connection_id,
    )

    try:
        ws.send(
            json_module.dumps(
                websocket_connected_payload(
                    backend_id=backend_id,
                    backend_version=backend_version,
                    timestamp=time_module.time(),
                )
            )
        )

        iterations = 0
        last_progress_event_id = 0
        last_status_signature: Optional[Tuple[Any, ...]] = None
        last_status_sent_at = 0.0
        base_poll_interval = max(0.25, float(poll_interval_seconds))
        max_poll_interval = max(base_poll_interval, float(max_poll_interval_seconds))
        status_keepalive_interval = max(base_poll_interval, float(status_keepalive_seconds))
        idle_iterations = 0

        while True:
            manager = get_manager()
            status = manager.get_status(force_refresh=True)
            status_signature = _normalize_status_signature(status)
            now = time_module.time()
            status_changed = status_signature != last_status_signature
            should_emit_status = (
                status_changed
                or last_status_sent_at <= 0.0
                or (now - last_status_sent_at) >= status_keepalive_interval
            )

            if should_emit_status:
                ws.send(
                    json_module.dumps(
                        websocket_status_payload(
                            status,
                            backend_id=backend_id,
                            backend_version=backend_version,
                            timestamp=now,
                        )
                    )
                )
                last_status_signature = status_signature
                last_status_sent_at = now

            try:
                progress_events = manager.get_progress_events_since(last_progress_event_id)
            except Exception:
                progress_events = []

            for progress_event in progress_events:
                event_id = int(progress_event.get("event_id") or 0)
                ws.send(json_module.dumps(websocket_progress_payload(progress_event)))
                stage = str(progress_event.get("stage") or "").strip().lower()
                if stage == "completed":
                    ws.send(json_module.dumps(websocket_complete_payload(progress_event)))
                elif stage == "failed":
                    ws.send(json_module.dumps(websocket_error_payload(progress_event)))
                if event_id > last_progress_event_id:
                    last_progress_event_id = event_id

            try:
                incoming = ws.receive(timeout=0.1)
                if incoming is None:
                    pass
            except TypeError:
                pass  # ws.receive() may not accept timeout kwarg
            except Exception:
                pass  # Non-critical receive error during polling loop

            iterations += 1
            if max_iterations is not None and iterations >= max_iterations:
                break

            had_progress_events = len(progress_events) > 0
            if status_changed or had_progress_events:
                idle_iterations = 0
            else:
                idle_iterations += 1

            time_module.sleep(
                _resolve_next_poll_interval_seconds(
                    base_poll_interval_seconds=base_poll_interval,
                    max_poll_interval_seconds=max_poll_interval,
                    idle_iterations=idle_iterations,
                    had_status_change=status_changed,
                    had_progress_events=had_progress_events,
                )
            )

    except Exception as exc:
        logger.info(
            "WebSocket disconnected from %s (%s) (request_id=%s, connection_id=%s)",
            remote_addr,
            exc,
            request_id,
            connection_id,
        )
