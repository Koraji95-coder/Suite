from __future__ import annotations

from typing import Any


def com_call_with_retry(
    callable_func: Any,
    max_retries: int = 25,
    initial_delay: float = 0.03,
    *,
    pythoncom_module: Any,
    time_module: Any,
) -> Any:
    """Retry COM calls that get RPC_E_CALL_REJECTED (AutoCAD busy)."""
    delay = initial_delay
    com_error_type = getattr(pythoncom_module, "com_error", None) if pythoncom_module is not None else None

    for _ in range(max_retries):
        try:
            return callable_func()
        except Exception as exc:
            if com_error_type is None or not isinstance(exc, com_error_type):
                raise
            if exc.args and exc.args[0] == -2147418111:  # RPC_E_CALL_REJECTED
                time_module.sleep(delay)
                delay = min(delay * 1.5, 0.5)
                continue
            raise

    raise RuntimeError("AutoCAD COM call failed: RPC busy too long")


def pt(
    x: float,
    y: float,
    z: float = 0.0,
    *,
    autocad_com_available: bool,
    pythoncom_module: Any,
    win32com_client_module: Any,
) -> Any:
    if not autocad_com_available:
        raise RuntimeError("AutoCAD COM bridge unavailable on this platform")
    return win32com_client_module.VARIANT(
        pythoncom_module.VT_ARRAY | pythoncom_module.VT_R8,
        (float(x), float(y), float(z)),
    )


def ensure_layer(
    doc: Any,
    layer_name: str,
    *,
    color_aci: int | None = None,
    dyn_fn: Any,
) -> None:
    doc = dyn_fn(doc)
    try:
        layers = dyn_fn(doc.Layers)
        layer = None
        try:
            layer = layers.Item(layer_name)
        except Exception:
            layer = layers.Add(layer_name)
        if layer is not None and color_aci is not None and 1 <= int(color_aci) <= 255:
            try:
                layer.Color = int(color_aci)
            except Exception:
                pass  # COM object may not support color assignment
    except Exception:
        pass  # Best-effort layer creation; failure is non-critical


def wait_for_command_finish(
    doc: Any,
    timeout_s: float = 10.0,
    *,
    dyn_fn: Any,
    time_module: Any,
) -> bool:
    doc = dyn_fn(doc)
    t0 = time_module.time()
    while (time_module.time() - t0) < timeout_s:
        try:
            names = ""
            if hasattr(doc, "GetVariable"):
                names = str(doc.GetVariable("CMDNAMES") or "")
            if not names.strip():
                return True
        except Exception:
            pass  # COM call may fail while AutoCAD is busy; keep polling
        time_module.sleep(0.15)
    return False
