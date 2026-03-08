from __future__ import annotations

from typing import Any, Dict, Optional


class AutoCadOperationError(Exception):
    """Typed AutoCAD failure carrying normalized code/stage metadata."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        stage: str,
        status_code: int = 500,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(str(message))
        self.code = str(code or "AUTOCAD_OPERATION_FAILED")
        self.stage = str(stage or "autocad_operation")
        self.status_code = int(status_code or 500)
        self.extra = dict(extra or {})


class AutoCadValidationError(AutoCadOperationError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "INVALID_REQUEST",
        stage: str = "validation",
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            stage=stage,
            status_code=400,
            extra=extra,
        )


class AutoCadConnectionError(AutoCadOperationError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "AUTOCAD_CONNECTION_FAILED",
        stage: str = "connection",
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            stage=stage,
            status_code=503,
            extra=extra,
        )
