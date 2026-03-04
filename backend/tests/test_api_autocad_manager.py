from __future__ import annotations

import os
import re
import threading
import traceback
import unittest

from backend.route_groups.api_autocad_manager import (
    AutoCADManager,
    create_autocad_manager,
    get_manager,
    reset_manager_for_tests,
)


class _TimeStub:
    def __init__(self, start: float = 1000.0) -> None:
        self.current = start

    def time(self) -> float:
        value = self.current
        self.current += 1.0
        return value


class _PythonComStub:
    def __init__(self) -> None:
        self.initialize_calls = 0
        self.uninitialize_calls = 0

    def CoInitialize(self) -> None:
        self.initialize_calls += 1

    def CoUninitialize(self) -> None:
        self.uninitialize_calls += 1


class _PsutilStub:
    NoSuchProcess = RuntimeError
    AccessDenied = PermissionError

    @staticmethod
    def process_iter(_attrs):
        return []


class _ModelSpaceStub:
    Count = 0


class _DocStub:
    def __init__(self) -> None:
        self.Name = "TestDrawing.dwg"
        self.ModelSpace = _ModelSpaceStub()


class _AcadStub:
    def __init__(self, doc) -> None:
        self.ActiveDocument = doc


def _build_manager(
    *,
    autocad_com_available: bool = True,
    pythoncom_module=None,
    connect_autocad_fn=None,
) -> AutoCADManager:
    doc = _DocStub()
    pythoncom = pythoncom_module or _PythonComStub()
    connect_fn = connect_autocad_fn or (lambda: _AcadStub(doc))

    return create_autocad_manager(
        time_module=_TimeStub(),
        threading_module=threading,
        psutil_module=_PsutilStub,
        pythoncom_module=pythoncom,
        traceback_module=traceback,
        os_module=os,
        re_module=re,
        autocad_com_available=autocad_com_available,
        connect_autocad_fn=connect_fn,
        dyn_fn=lambda value: value,
        entity_bbox_fn=lambda _ent: None,
        entity_center_fn=lambda _ent: None,
        default_ref_dwg_path_fn=lambda: "missing.dwg",
        insert_reference_block_fn=lambda *args, **kwargs: None,
        add_point_label_fn=lambda *args, **kwargs: None,
        export_points_to_excel_fn=lambda *args, **kwargs: "output.xlsx",
        foundation_source_type="Foundation Coordinates",
        print_fn=lambda *_args, **_kwargs: None,
    )


class TestApiAutocadManager(unittest.TestCase):
    def setUp(self) -> None:
        reset_manager_for_tests()

    def tearDown(self) -> None:
        reset_manager_for_tests()

    def test_get_manager_caches_instance_until_reset(self) -> None:
        calls = {"count": 0}

        def create():
            calls["count"] += 1
            return object()

        first = get_manager(create_manager_fn=create)
        second = get_manager(create_manager_fn=create)

        self.assertIs(first, second)
        self.assertEqual(calls["count"], 1)

        reset_manager_for_tests()
        third = get_manager(create_manager_fn=create)

        self.assertIsNot(first, third)
        self.assertEqual(calls["count"], 2)

    def test_get_status_reports_degraded_mode_when_com_unavailable(self) -> None:
        manager = _build_manager(autocad_com_available=False)

        status = manager.get_status(force_refresh=True)

        self.assertFalse(status["connected"])
        self.assertFalse(status["autocad_running"])
        self.assertFalse(status["drawing_open"])
        self.assertTrue(status["degraded_mode"])
        self.assertIn("AutoCAD COM unavailable", status["error"])

    def test_execute_layer_search_requires_layer_names(self) -> None:
        pythoncom = _PythonComStub()
        manager = _build_manager(
            autocad_com_available=True,
            pythoncom_module=pythoncom,
        )

        result = manager.execute_layer_search({})

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "No layer names provided")
        self.assertEqual(result["points"], [])
        self.assertEqual(result["count"], 0)
        self.assertEqual(pythoncom.initialize_calls, 1)
        self.assertEqual(pythoncom.uninitialize_calls, 1)


if __name__ == "__main__":
    unittest.main()
