from __future__ import annotations

import unittest

from backend.route_groups.api_autocad_connection import connect_autocad, dyn


class _PythonComStub:
    IID_IDispatch = object()


class _OleObject:
    def __init__(self, query_result=None, raises: bool = False) -> None:
        self.query_result = query_result
        self.raises = raises
        self.calls = []

    def QueryInterface(self, iid):
        self.calls.append(iid)
        if self.raises:
            raise RuntimeError("query failed")
        return self.query_result


class _ObjectWithOle:
    def __init__(self, ole_obj) -> None:
        self._oleobj_ = ole_obj


class _DynamicDispatchStub:
    def __init__(self, dispatch_fn):
        self._dispatch_fn = dispatch_fn
        self.calls = []

    def Dispatch(self, value):
        self.calls.append(value)
        return self._dispatch_fn(value)


class _Win32ClientStub:
    def __init__(self, dynamic_dispatch_stub, get_active_fn=None):
        self.dynamic = dynamic_dispatch_stub
        self._get_active_fn = get_active_fn
        self.get_active_calls = []

    def GetActiveObject(self, prog_id):
        self.get_active_calls.append(prog_id)
        if self._get_active_fn is None:
            raise RuntimeError("GetActiveObject unavailable")
        return self._get_active_fn(prog_id)


class _Win32ComStub:
    def __init__(self, dispatch_fn, get_active_fn=None):
        self._dynamic = _DynamicDispatchStub(dispatch_fn)
        self.client = _Win32ClientStub(self._dynamic, get_active_fn=get_active_fn)


class CDispatch:
    pass


class TestApiAutocadConnection(unittest.TestCase):
    def test_dyn_returns_cdispatch_as_is(self) -> None:
        value = CDispatch()
        self.assertIs(
            dyn(
                value,
                autocad_com_available=True,
                pythoncom_module=_PythonComStub,
                win32com_module=_Win32ComStub(lambda arg: arg),
            ),
            value,
        )

    def test_dyn_uses_query_interface_dispatch_when_available(self) -> None:
        ole = _OleObject(query_result="idispatch-object")
        obj = _ObjectWithOle(ole)
        win32_stub = _Win32ComStub(lambda arg: f"wrapped:{arg}")

        result = dyn(
            obj,
            autocad_com_available=True,
            pythoncom_module=_PythonComStub,
            win32com_module=win32_stub,
        )

        self.assertEqual(result, "wrapped:idispatch-object")
        self.assertEqual(ole.calls, [_PythonComStub.IID_IDispatch])

    def test_dyn_falls_back_to_dispatch_obj_when_query_interface_fails(self) -> None:
        ole = _OleObject(raises=True)
        obj = _ObjectWithOle(ole)
        win32_stub = _Win32ComStub(lambda arg: f"fallback:{id(arg)}")

        result = dyn(
            obj,
            autocad_com_available=True,
            pythoncom_module=_PythonComStub,
            win32com_module=win32_stub,
        )

        self.assertTrue(str(result).startswith("fallback:"))
        self.assertEqual(len(win32_stub.client.dynamic.calls), 1)
        self.assertIs(win32_stub.client.dynamic.calls[0], obj)

    def test_dyn_returns_obj_when_com_unavailable(self) -> None:
        value = object()
        self.assertIs(
            dyn(
                value,
                autocad_com_available=False,
                pythoncom_module=None,
                win32com_module=None,
            ),
            value,
        )

    def test_connect_autocad_raises_when_unavailable(self) -> None:
        with self.assertRaises(RuntimeError):
            connect_autocad(
                autocad_com_available=False,
                win32com_module=None,
                dyn_fn=lambda value: value,
            )

    def test_connect_autocad_raises_when_dispatch_returns_none(self) -> None:
        win32_stub = _Win32ComStub(lambda _value: None, get_active_fn=lambda _value: None)
        with self.assertRaises(RuntimeError):
            connect_autocad(
                autocad_com_available=True,
                win32com_module=win32_stub,
                dyn_fn=lambda value: value,
            )
        self.assertEqual(win32_stub.client.get_active_calls, ["AutoCAD.Application"])
        self.assertEqual(win32_stub.client.dynamic.calls, ["AutoCAD.Application"])

    def test_connect_autocad_prefers_get_active_object(self) -> None:
        win32_stub = _Win32ComStub(
            lambda value: {"dispatch_app": value},
            get_active_fn=lambda value: {"active_app": value},
        )

        result = connect_autocad(
            autocad_com_available=True,
            win32com_module=win32_stub,
            dyn_fn=lambda value: {"wrapped": value},
        )

        self.assertEqual(result, {"wrapped": {"active_app": "AutoCAD.Application"}})
        self.assertEqual(win32_stub.client.get_active_calls, ["AutoCAD.Application"])
        self.assertEqual(win32_stub.client.dynamic.calls, [])

    def test_connect_autocad_dispatches_when_get_active_fails(self) -> None:
        win32_stub = _Win32ComStub(
            lambda value: {"dispatch_app": value},
            get_active_fn=lambda _value: (_ for _ in ()).throw(RuntimeError("no instance")),
        )

        result = connect_autocad(
            autocad_com_available=True,
            win32com_module=win32_stub,
            dyn_fn=lambda value: {"wrapped": value},
        )

        self.assertEqual(result, {"wrapped": {"dispatch_app": "AutoCAD.Application"}})
        self.assertEqual(win32_stub.client.get_active_calls, ["AutoCAD.Application"])
        self.assertEqual(win32_stub.client.dynamic.calls, ["AutoCAD.Application"])


if __name__ == "__main__":
    unittest.main()
