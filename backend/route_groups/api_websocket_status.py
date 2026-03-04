from __future__ import annotations

from typing import Any, Dict, Mapping, Optional


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
    poll_interval_seconds: float = 2.0,
    max_iterations: Optional[int] = None,
) -> None:
    provided_key = request_obj.args.get("api_key")
    if not is_valid_api_key_fn(provided_key):
        try:
            ws.send(
                json_module.dumps(
                    {
                        "type": "error",
                        "message": "Invalid API key",
                        "code": "AUTH_INVALID",
                    }
                )
            )
        finally:
            try:
                ws.close()
            except Exception:
                pass
        logger.warning(
            "Unauthorized websocket connection attempt from %s",
            request_obj.remote_addr,
        )
        return

    logger.info("WebSocket connected from %s", request_obj.remote_addr)

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
        while True:
            manager = get_manager()
            status = manager.get_status(force_refresh=True)

            ws.send(
                json_module.dumps(
                    websocket_status_payload(
                        status,
                        backend_id=backend_id,
                        backend_version=backend_version,
                        timestamp=time_module.time(),
                    )
                )
            )

            try:
                incoming = ws.receive(timeout=0.1)
                if incoming is None:
                    pass
            except TypeError:
                pass
            except Exception:
                pass

            iterations += 1
            if max_iterations is not None and iterations >= max_iterations:
                break

            time_module.sleep(poll_interval_seconds)

    except Exception as exc:
        logger.info("WebSocket disconnected from %s (%s)", request_obj.remote_addr, exc)
