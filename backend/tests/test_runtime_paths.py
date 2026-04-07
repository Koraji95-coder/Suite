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


class TestJoinUnderAbsoluteRootIntegration(unittest.TestCase):
    """Integration tests that exercise join_under_absolute_root with real
    filesystem paths created by tempfile, verifying behaviour against
    directories that either exist or are intentionally absent."""

    # ------------------------------------------------------------------
    # Existing-directory integration
    # ------------------------------------------------------------------

    def test_joined_path_exists_when_subdirectory_is_created(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            subdir = Path(temp_dir) / "subproject"
            subdir.mkdir()

            joined = join_under_absolute_root(temp_dir, ["subproject"])

            self.assertEqual(joined, str(subdir))
            self.assertTrue(Path(joined).is_dir())

    def test_joined_path_resolves_to_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_file = Path(temp_dir) / "results.json"
            output_file.write_text("{}")

            joined = join_under_absolute_root(temp_dir, ["results.json"])

            self.assertEqual(joined, str(output_file))
            self.assertTrue(Path(joined).is_file())

    def test_joined_nested_path_exists_when_tree_is_created(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            nested = Path(temp_dir) / "output" / "reports"
            nested.mkdir(parents=True)

            joined = join_under_absolute_root(temp_dir, ["output", "reports"])

            self.assertEqual(joined, str(nested))
            self.assertTrue(Path(joined).is_dir())

    # ------------------------------------------------------------------
    # Non-existent-directory integration
    # ------------------------------------------------------------------

    def test_joined_path_for_missing_subdirectory_is_still_returned(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            expected = str(Path(temp_dir) / "does-not-exist")

            joined = join_under_absolute_root(temp_dir, ["does-not-exist"])

            self.assertEqual(joined, expected)
            self.assertFalse(Path(joined).exists())

    def test_joined_path_for_missing_nested_parts_is_still_returned(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            expected = str(Path(temp_dir) / "missing" / "nested" / "dir")

            joined = join_under_absolute_root(temp_dir, ["missing", "nested", "dir"])

            self.assertEqual(joined, expected)
            self.assertFalse(Path(joined).exists())

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    def test_whitespace_only_part_is_passed_through(self) -> None:
        # str("  ") is truthy so the implementation keeps whitespace-only parts
        with tempfile.TemporaryDirectory() as temp_dir:
            joined = join_under_absolute_root(temp_dir, ["  "])

            # PurePosixPath joins it literally; the whitespace part is retained
            self.assertIn("  ", joined)

    def test_base_with_trailing_separator_is_normalised(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base_with_slash = temp_dir.rstrip("/") + "/"

            joined = join_under_absolute_root(base_with_slash, ["output"])
            joined_without = join_under_absolute_root(temp_dir, ["output"])

            self.assertEqual(joined, joined_without)

    # ------------------------------------------------------------------
    # Integration with resolve_runtime_path
    # ------------------------------------------------------------------

    def test_joined_path_resolves_correctly_via_resolve_runtime_path(self) -> None:
        from backend.runtime_paths import resolve_runtime_path

        with tempfile.TemporaryDirectory() as temp_dir:
            subdir = Path(temp_dir) / "project"
            subdir.mkdir()

            joined = join_under_absolute_root(temp_dir, ["project"])
            resolved = resolve_runtime_path(joined)

            self.assertIsNotNone(resolved)
            self.assertEqual(resolved, subdir.resolve())

    def test_joined_path_for_missing_dir_resolves_to_none(self) -> None:
        from backend.runtime_paths import resolve_runtime_path

        with tempfile.TemporaryDirectory() as temp_dir:
            joined = join_under_absolute_root(temp_dir, ["nonexistent-subdir"])
            resolved = resolve_runtime_path(joined)

            self.assertIsNone(resolved)


if __name__ == "__main__":
    unittest.main()
