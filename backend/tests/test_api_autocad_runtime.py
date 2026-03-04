from __future__ import annotations

import os
import re
import tempfile
import threading
import traceback
import unittest
from datetime import datetime

from backend.route_groups.api_autocad_manager import reset_manager_for_tests
from backend.route_groups.api_autocad_runtime import create_autocad_runtime


class _TimeStub:
    def time(self) -> float:
        return 1000.0

    def sleep(self, _seconds: float) -> None:
        return None


class _PythonComStub:
    IID_IDispatch = object()
    VT_ARRAY = 0x2000
    VT_R8 = 5

    @staticmethod
    def CoInitialize() -> None:
        return None

    @staticmethod
    def CoUninitialize() -> None:
        return None


class _PsutilStub:
    NoSuchProcess = RuntimeError
    AccessDenied = PermissionError

    @staticmethod
    def process_iter(_attrs):
        return []


class _LoggerStub:
    def info(self, *_args, **_kwargs) -> None:
        return None


def _build_runtime(*, autocad_com_available: bool, api_base_dir: str):
    return create_autocad_runtime(
        autocad_com_available=autocad_com_available,
        pythoncom_module=_PythonComStub,
        win32com_module=None,
        psutil_module=_PsutilStub,
        time_module=_TimeStub(),
        threading_module=threading,
        os_module=os,
        re_module=re,
        traceback_module=traceback,
        logger=_LoggerStub(),
        datetime_now_fn=lambda: datetime(2026, 3, 3, 0, 0, 0),
        api_base_dir=api_base_dir,
        print_fn=lambda *_args, **_kwargs: None,
    )


class TestApiAutocadRuntime(unittest.TestCase):
    def setUp(self) -> None:
        reset_manager_for_tests()

    def tearDown(self) -> None:
        reset_manager_for_tests()

    def test_connect_autocad_raises_when_com_unavailable(self) -> None:
        runtime = _build_runtime(autocad_com_available=False, api_base_dir="/tmp")
        with self.assertRaises(RuntimeError):
            runtime.connect_autocad()

    def test_default_ref_dwg_path_uses_api_base_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            runtime = _build_runtime(
                autocad_com_available=False,
                api_base_dir=tmp_dir,
            )
            path = runtime.default_ref_dwg_path()
            self.assertEqual(path, os.path.join(tmp_dir, "Coordinate Reference Point.dwg"))

    def test_get_manager_is_cached_until_reset(self) -> None:
        runtime = _build_runtime(autocad_com_available=False, api_base_dir="/tmp")
        first = runtime.get_manager()
        second = runtime.get_manager()
        self.assertIs(first, second)

        reset_manager_for_tests()
        third = runtime.get_manager()
        self.assertIsNot(first, third)


if __name__ == "__main__":
    unittest.main()
