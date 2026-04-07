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

    def test_resolve_runtime_directory_maps_repo_suffix_from_posix_host_path(self) -> None:
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
                "/workspace/Suite/output/autodesk-acade-regression-fixtures/wddemo-project/project",
                repo_root=runtime_repo_root,
            )

            self.assertEqual(resolved_directory, expected_directory.resolve())

    def test_resolve_runtime_directory_returns_none_when_candidate_is_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)
            parent_dir = runtime_repo_root / "output" / "some-subdir"
            parent_dir.mkdir(parents=True, exist_ok=True)
            file_path = parent_dir / "file.txt"
            file_path.write_text("content")

            resolved_directory = resolve_runtime_directory(
                "/workspace/Suite/output/some-subdir/file.txt",
                repo_root=runtime_repo_root,
            )

            self.assertIsNone(resolved_directory)

    def test_resolve_runtime_directory_returns_none_for_relative_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)

            resolved_directory = resolve_runtime_directory(
                "relative/path/to/something",
                repo_root=runtime_repo_root,
            )

            self.assertIsNone(resolved_directory)

    def test_resolve_runtime_directory_returns_none_for_empty_string(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)

            resolved_directory = resolve_runtime_directory(
                "",
                repo_root=runtime_repo_root,
            )

            self.assertIsNone(resolved_directory)

    def test_resolve_runtime_directory_returns_none_when_path_not_under_repo_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)

            resolved_directory = resolve_runtime_directory(
                "/workspace/Suite/output/nonexistent-path/missing-dir",
                repo_root=runtime_repo_root,
            )

            self.assertIsNone(resolved_directory)

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
