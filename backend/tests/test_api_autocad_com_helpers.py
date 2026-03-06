from __future__ import annotations

import unittest

from backend.route_groups.api_autocad_com_helpers import (
    com_call_with_retry,
    ensure_layer,
    pt,
    wait_for_command_finish,
)


class _ComError(Exception):
    pass


class _PythonComStub:
    com_error = _ComError
    VT_ARRAY = 0x2000
    VT_R8 = 5


class _Win32ClientStub:
    def __init__(self) -> None:
        self.calls = []

    def VARIANT(self, variant_type, value):
        self.calls.append((variant_type, value))
        return {"variant_type": variant_type, "value": value}


class _TimeStub:
    def __init__(self, *, start: float = 0.0, step: float = 0.05) -> None:
        self.current = start
        self.step = step
        self.sleep_calls = []

    def time(self) -> float:
        value = self.current
        self.current += self.step
        return value

    def sleep(self, seconds: float) -> None:
        self.sleep_calls.append(seconds)


class _LayersStub:
    def __init__(self, existing):
        self.existing = {}
        for name in existing:
            layer = type("LayerStub", (), {})()
            layer.Color = 7
            self.existing[name] = layer
        self.add_calls = []

    def Item(self, name):
        if name not in self.existing:
            raise RuntimeError("missing")
        return self.existing[name]

    def Add(self, name):
        self.add_calls.append(name)
        layer = type("LayerStub", (), {})()
        layer.Color = 7
        self.existing[name] = layer
        return layer


class _DocWithLayers:
    def __init__(self, existing):
        self.Layers = _LayersStub(existing)


class _DocCommandNames:
    def __init__(self, value: str):
        self.value = value

    def GetVariable(self, _name: str):
        return self.value


class TestApiAutocadComHelpers(unittest.TestCase):
    def test_com_call_with_retry_retries_rpc_busy(self) -> None:
        time_stub = _TimeStub()
        attempts = {"count": 0}

        def flaky_call():
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise _ComError(-2147418111, "RPC_E_CALL_REJECTED")
            return "ok"

        result = com_call_with_retry(
            flaky_call,
            max_retries=3,
            initial_delay=0.01,
            pythoncom_module=_PythonComStub,
            time_module=time_stub,
        )
        self.assertEqual(result, "ok")
        self.assertEqual(attempts["count"], 2)
        self.assertEqual(time_stub.sleep_calls, [0.01])

    def test_com_call_with_retry_raises_non_busy_com_error(self) -> None:
        with self.assertRaises(_ComError):
            com_call_with_retry(
                lambda: (_ for _ in ()).throw(_ComError(-1, "other")),
                pythoncom_module=_PythonComStub,
                time_module=_TimeStub(),
            )

    def test_com_call_with_retry_raises_runtime_after_exhausted_retries(self) -> None:
        with self.assertRaises(RuntimeError):
            com_call_with_retry(
                lambda: (_ for _ in ()).throw(_ComError(-2147418111, "busy")),
                max_retries=2,
                initial_delay=0.01,
                pythoncom_module=_PythonComStub,
                time_module=_TimeStub(),
            )

    def test_pt_builds_variant(self) -> None:
        win32_client = _Win32ClientStub()
        result = pt(
            1,
            2.5,
            3,
            autocad_com_available=True,
            pythoncom_module=_PythonComStub,
            win32com_client_module=win32_client,
        )
        self.assertEqual(result["value"], (1.0, 2.5, 3.0))
        self.assertEqual(
            result["variant_type"],
            _PythonComStub.VT_ARRAY | _PythonComStub.VT_R8,
        )

    def test_pt_raises_when_com_unavailable(self) -> None:
        with self.assertRaises(RuntimeError):
            pt(
                1,
                2,
                3,
                autocad_com_available=False,
                pythoncom_module=_PythonComStub,
                win32com_client_module=_Win32ClientStub(),
            )

    def test_ensure_layer_adds_missing_layer(self) -> None:
        doc = _DocWithLayers(existing=[])
        ensure_layer(doc, "COORD", dyn_fn=lambda value: value, color_aci=30)
        self.assertEqual(doc.Layers.add_calls, ["COORD"])
        self.assertEqual(doc.Layers.Item("COORD").Color, 30)

    def test_ensure_layer_keeps_existing_layer(self) -> None:
        doc = _DocWithLayers(existing=["COORD"])
        ensure_layer(doc, "COORD", dyn_fn=lambda value: value, color_aci=10)
        self.assertEqual(doc.Layers.add_calls, [])
        self.assertEqual(doc.Layers.Item("COORD").Color, 10)

    def test_wait_for_command_finish_returns_true_when_idle(self) -> None:
        result = wait_for_command_finish(
            _DocCommandNames(""),
            timeout_s=0.2,
            dyn_fn=lambda value: value,
            time_module=_TimeStub(step=0.01),
        )
        self.assertTrue(result)

    def test_wait_for_command_finish_times_out_when_busy(self) -> None:
        time_stub = _TimeStub(step=0.06)
        result = wait_for_command_finish(
            _DocCommandNames("LINE"),
            timeout_s=0.1,
            dyn_fn=lambda value: value,
            time_module=time_stub,
        )
        self.assertFalse(result)
        self.assertEqual(time_stub.sleep_calls, [0.15])


if __name__ == "__main__":
    unittest.main()
