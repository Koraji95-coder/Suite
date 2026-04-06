from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.runtime_paths import (
    is_absolute_path_value,
    join_under_absolute_root,
    normalize_runtime_path,
    resolve_runtime_directory,
)
from backend.watchdog.filesystem import ensure_absolute_roots


class TestNormalizeRuntimePath(unittest.TestCase):
    # ------------------------------------------------------------------
    # Empty / blank inputs
    # ------------------------------------------------------------------

    def test_empty_string_returns_empty(self) -> None:
        self.assertEqual(normalize_runtime_path(""), "")

    def test_whitespace_only_returns_empty(self) -> None:
        self.assertEqual(normalize_runtime_path("   "), "")

    # ------------------------------------------------------------------
    # Windows absolute paths
    # ------------------------------------------------------------------

    def test_windows_absolute_normalizes_case_and_backslashes(self) -> None:
        # ntpath.normcase lowercases and enforces backslash separators
        result = normalize_runtime_path(r"C:\Users\Dev\Documents")
        self.assertEqual(result, r"c:\users\dev\documents")

    def test_windows_absolute_converts_forward_slashes_to_backslashes(self) -> None:
        result = normalize_runtime_path("C:/Users/Dev/Documents")
        self.assertEqual(result, r"c:\users\dev\documents")

    def test_windows_absolute_collapses_dotdot_segments(self) -> None:
        result = normalize_runtime_path(r"C:\Users\Dev\..\Documents")
        self.assertEqual(result, r"c:\users\documents")

    def test_windows_absolute_strips_leading_whitespace(self) -> None:
        result = normalize_runtime_path(r"  C:\Users\Dev\Documents  ")
        self.assertEqual(result, r"c:\users\dev\documents")

    # ------------------------------------------------------------------
    # UNC Windows paths
    # ------------------------------------------------------------------

    def test_unc_path_normalizes_case(self) -> None:
        result = normalize_runtime_path(r"\\Server\Share\Folder")
        self.assertEqual(result, r"\\server\share\folder")

    # ------------------------------------------------------------------
    # POSIX absolute paths
    # ------------------------------------------------------------------

    def test_posix_absolute_preserved(self) -> None:
        result = normalize_runtime_path("/suite-test/output/project")
        self.assertEqual(result, "/suite-test/output/project")

    def test_posix_absolute_trailing_slash_stripped(self) -> None:
        result = normalize_runtime_path("/suite-test/output/project/")
        self.assertEqual(result, "/suite-test/output/project")

    def test_posix_absolute_collapses_dotdot_segments(self) -> None:
        result = normalize_runtime_path("/suite-test/output/../project")
        self.assertEqual(result, "/suite-test/project")

    def test_posix_absolute_collapses_dot_segments(self) -> None:
        result = normalize_runtime_path("/suite-test/./output/./project")
        self.assertEqual(result, "/suite-test/output/project")

    # ------------------------------------------------------------------
    # Relative paths
    # ------------------------------------------------------------------

    def test_relative_path_backslashes_converted_to_forward_slashes(self) -> None:
        result = normalize_runtime_path("output\\autodesk-acade\\project")
        self.assertEqual(result, "output/autodesk-acade/project")

    def test_relative_posix_path_returned_unchanged(self) -> None:
        result = normalize_runtime_path("output/autodesk-acade/project")
        self.assertEqual(result, "output/autodesk-acade/project")


class TestRuntimePaths(unittest.TestCase):
    def test_is_absolute_path_value_supports_windows_and_posix(self) -> None:
        self.assertTrue(is_absolute_path_value(r"C:\Users\Dev\Documents\GitHub\Suite"))
        self.assertTrue(is_absolute_path_value(r"\\server\share\folder"))
        self.assertTrue(is_absolute_path_value("/workspace/output"))
        self.assertFalse(is_absolute_path_value("relative/path"))

    def test_resolve_runtime_directory_maps_repo_suffix_from_windows_host_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)
            expected_directory = (
                runtime_repo_root
                / "output"
                / "autodesk-acade-regression-fixtures"
                / "wddemo-project"
                / "project"
            )
            expected_directory.mkdir(parents=True, exist_ok=True)

            resolved_directory = resolve_runtime_directory(
                r"X:\Workspace\Suite\output\autodesk-acade-regression-fixtures\wddemo-project\project",
                repo_root=runtime_repo_root,
            )

            self.assertEqual(resolved_directory, expected_directory.resolve())

    def test_ensure_absolute_roots_preserves_windows_roots_for_rule_sync(self) -> None:
        root_value = r"C:\Users\Dev\Documents\GitHub\Suite\output\autodesk-acade-regression-fixtures\wddemo-project\project"

        resolved_roots = ensure_absolute_roots([root_value], allow_missing=True)

        self.assertEqual(resolved_roots, [normalize_runtime_path(root_value)])

    def test_join_under_absolute_root_rebuilds_windows_host_paths(self) -> None:
        joined_path = join_under_absolute_root(
            r"C:\Users\Dev\Documents\GitHub\Suite\output\autodesk-acade-regression-fixtures\wddemo-project\project",
            ["wddemo.wdp"],
        )

        self.assertEqual(
            joined_path,
            r"C:\Users\Dev\Documents\GitHub\Suite\output\autodesk-acade-regression-fixtures\wddemo-project\project\wddemo.wdp",
        )


if __name__ == "__main__":
    unittest.main()
