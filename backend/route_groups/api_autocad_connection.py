from __future__ import annotations

from typing import Any


def dyn(
    obj: Any,
    *,
    autocad_com_available: bool,
    pythoncom_module: Any,
    win32com_module: Any,
) -> Any:
    """
    Force late-bound dynamic dispatch on a COM object.
    Avoids stale gen_py wrappers and CDispatch type errors.
    """
    try:
        if type(obj).__name__ == "CDispatch":
            return obj
    except Exception:
        pass

    try:
        ole = obj._oleobj_
    except Exception:
        ole = obj

    if not autocad_com_available or pythoncom_module is None or win32com_module is None:
        return obj

    try:
        disp = ole.QueryInterface(pythoncom_module.IID_IDispatch)
        return win32com_module.client.dynamic.Dispatch(disp)
    except Exception:
        try:
            return win32com_module.client.dynamic.Dispatch(obj)
        except Exception:
            return obj


def connect_autocad(
    *,
    autocad_com_available: bool,
    win32com_module: Any,
    dyn_fn: Any,
) -> Any:
    """Connect to AutoCAD using late-bound dynamic dispatch (no gen_py)."""
    if not autocad_com_available or win32com_module is None:
        raise RuntimeError(
            "AutoCAD COM bridge unavailable on this platform. Run backend on Windows with pywin32 installed."
        )
    acad = win32com_module.client.dynamic.Dispatch("AutoCAD.Application")
    if acad is None:
        raise RuntimeError("Could not connect to AutoCAD.Application")
    return dyn_fn(acad)
