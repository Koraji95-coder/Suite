from __future__ import annotations

import time
from typing import Any, Dict, Optional


def derive_request_id(raw_value: Any, *, time_module: Any = time) -> str:
    value = str(raw_value or "").strip()
    if value:
        return value[:128]
    return f"req-{int(time_module.time() * 1000)}"


def exception_message(exc: BaseException) -> str:
    text = str(exc).strip()
    return text if text else exc.__class__.__name__


def client_exception_message(exc: BaseException) -> str:
    if isinstance(exc, ValueError):
        return "Invalid request parameters."
    if isinstance(exc, TimeoutError):
        return "Operation timed out."
    if isinstance(exc, PermissionError):
        return "Permission denied."
    if isinstance(exc, FileNotFoundError):
        return "Required file was not found."
    return "Unexpected AutoCAD error."


def build_error_payload(
    *,
    code: str,
    message: str,
    request_id: str,
    meta: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "success": False,
        "code": str(code or "UNKNOWN_ERROR"),
        "message": str(message or "Unexpected AutoCAD error."),
        "requestId": str(request_id or ""),
    }
    if meta:
        payload["meta"] = dict(meta)
    if extra:
        payload.update(dict(extra))
    return payload


def log_autocad_exception(
    *,
    logger: Any,
    message: str,
    request_id: str,
    remote_addr: str,
    auth_mode: str,
    stage: str,
    code: str,
    provider: str = "",
) -> None:
    logger.exception(
        "%s (request_id=%s, remote=%s, auth_mode=%s, stage=%s, code=%s, provider=%s)",
        message,
        request_id,
        remote_addr,
        auth_mode,
        stage,
        code,
        provider,
    )
