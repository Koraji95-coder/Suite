from __future__ import annotations

import os
import sys
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

    def test_join_under_absolute_root_posix_root_single_part(self) -> None:
        joined_path = join_under_absolute_root("/home/Dev/output", ["results.json"])

        self.assertEqual(joined_path, "/home/Dev/output/results.json")

    def test_join_under_absolute_root_posix_root_multiple_parts(self) -> None:
        joined_path = join_under_absolute_root("/home/Dev/output", ["subdir", "results.json"])

        self.assertEqual(joined_path, "/home/Dev/output/subdir/results.json")

    def test_join_under_absolute_root_windows_root_multiple_parts(self) -> None:
        joined_path = join_under_absolute_root(
            r"C:\Users\Dev\Projects",
            ["MyProject", "output", "report.txt"],
        )

        self.assertEqual(joined_path, r"C:\Users\Dev\Projects\MyProject\output\report.txt")

    def test_join_under_absolute_root_empty_parts_returns_root_unchanged_windows(self) -> None:
        root = r"C:\Users\Dev\Projects"

        joined_path = join_under_absolute_root(root, [])

        self.assertEqual(joined_path, root)

    def test_join_under_absolute_root_empty_parts_returns_root_unchanged_posix(self) -> None:
        root = "/home/Dev/output"

        joined_path = join_under_absolute_root(root, [])

        self.assertEqual(joined_path, root)

    def test_join_under_absolute_root_filters_empty_string_parts(self) -> None:
        joined_path = join_under_absolute_root("/home/Dev/output", ["", "results.json", ""])

        self.assertEqual(joined_path, "/home/Dev/output/results.json")

    def test_join_under_absolute_root_relative_base_returns_base_unchanged(self) -> None:
        joined_path = join_under_absolute_root("relative/path", ["file.txt"])

        self.assertEqual(joined_path, "relative/path")

    def test_join_under_absolute_root_empty_base_returns_empty(self) -> None:
        joined_path = join_under_absolute_root("", ["file.txt"])

        self.assertEqual(joined_path, "")

    def test_join_under_absolute_root_unc_path(self) -> None:
        joined_path = join_under_absolute_root(r"\\DEV-SERVER\share\folder", ["file.txt"])

        self.assertEqual(joined_path, r"\\DEV-SERVER\share\folder\file.txt")

    def test_join_under_absolute_root_parent_traversal_kept_literally_windows(self) -> None:
        # PureWindowsPath preserves '..' literally without resolving it
        joined_path = join_under_absolute_root(r"C:\Users\Dev\Projects", ["..", "Other"])

        self.assertEqual(joined_path, r"C:\Users\Dev\Projects\..\Other")

    def test_join_under_absolute_root_parent_traversal_kept_literally_posix(self) -> None:
        # PurePosixPath preserves '..' literally without resolving it
        joined_path = join_under_absolute_root("/home/Dev/output", ["..", "results"])

        self.assertEqual(joined_path, "/home/Dev/output/../results")

    def test_join_under_absolute_root_absolute_part_overrides_base_windows(self) -> None:
        # PureWindowsPath.joinpath replaces the path when a part is absolute
        joined_path = join_under_absolute_root(r"C:\Users\Dev\Projects", [r"D:\Other"])

        self.assertEqual(joined_path, r"D:\Other")

    def test_join_under_absolute_root_absolute_part_overrides_base_posix(self) -> None:
        # PurePosixPath.joinpath replaces the path when a part is absolute
        joined_path = join_under_absolute_root("/home/Dev/output", ["/other"])

        self.assertEqual(joined_path, "/other")


@unittest.skipIf(sys.platform == "win32", "symlink creation may require elevated privileges on Windows")
class TestResolveRuntimeDirectorySymlinks(unittest.TestCase):
    """Integration tests for resolve_runtime_directory with symbolic link paths."""

    def test_symlink_to_directory_resolves_to_real_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            real_dir = Path(temp_dir) / "real_dir"
            real_dir.mkdir()
            link_path = Path(temp_dir) / "link_to_dir"
            link_path.symlink_to(real_dir)

            result = resolve_runtime_directory(
                str(link_path),
                repo_root=Path(temp_dir),
            )

            self.assertEqual(result, real_dir.resolve())

    def test_symlink_to_file_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            real_file = Path(temp_dir) / "real_file.txt"
            real_file.write_text("content")
            link_path = Path(temp_dir) / "link_to_file"
            link_path.symlink_to(real_file)

            result = resolve_runtime_directory(
                str(link_path),
                repo_root=Path(temp_dir),
            )

            self.assertIsNone(result)

    def test_broken_symlink_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            nonexistent_target = Path(temp_dir) / "nonexistent_target"
            broken_link = Path(temp_dir) / "broken_link"
            broken_link.symlink_to(nonexistent_target)

            result = resolve_runtime_directory(
                str(broken_link),
                repo_root=Path(temp_dir),
            )

            self.assertIsNone(result)

    def test_chained_symlinks_resolve_to_real_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            real_dir = Path(temp_dir) / "real_dir"
            real_dir.mkdir()
            intermediate_link = Path(temp_dir) / "intermediate_link"
            intermediate_link.symlink_to(real_dir)
            final_link = Path(temp_dir) / "final_link"
            final_link.symlink_to(intermediate_link)

            result = resolve_runtime_directory(
                str(final_link),
                repo_root=Path(temp_dir),
            )

            self.assertEqual(result, real_dir.resolve())

    def test_symlink_under_repo_root_suffix_resolves_correctly(self) -> None:
        # The suffix-fallback branch is exercised when the direct path does not
        # exist on the current filesystem (e.g. a Windows host path on Linux).
        # A symlink placed at the matched suffix location must still be followed.
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_repo_root = Path(temp_dir)
            real_dir = runtime_repo_root / "output" / "real_project"
            real_dir.mkdir(parents=True)
            link_path = runtime_repo_root / "output" / "linked_project"
            link_path.symlink_to(real_dir)

            result = resolve_runtime_directory(
                "/workspace/Suite/output/linked_project",
                repo_root=runtime_repo_root,
            )

            self.assertEqual(result, real_dir.resolve())

    def test_cross_root_symlink_resolves_to_external_directory(self) -> None:
        # A symlink whose target lives outside the repo-root tree must still
        # resolve as long as the target directory exists.
        with tempfile.TemporaryDirectory() as temp_dir_a:
            with tempfile.TemporaryDirectory() as temp_dir_b:
                real_dir = Path(temp_dir_b) / "real_dir"
                real_dir.mkdir()
                link_path = Path(temp_dir_a) / "link_to_other_root"
                link_path.symlink_to(real_dir)

                result = resolve_runtime_directory(
                    str(link_path),
                    repo_root=Path(temp_dir_a),
                )

                self.assertEqual(result, real_dir.resolve())


if __name__ == "__main__":
    unittest.main()
