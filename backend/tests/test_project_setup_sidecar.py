from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.domains.project_setup.constants import (
    DEFAULT_BLOCK_NAME,
    DEFAULT_WDL_LABELS,
    WDT_ATTRIBUTE_ORDER,
    WDT_FIELD_MAP,
)
from backend.domains.project_setup.service import (
    _build_artifact_preview_from_snapshot,
    _build_wdl_text,
    _build_wdt_text,
    _candidate_wdl_paths,
    _parse_wdt_definition_text,
    _resolve_wdl_path,
    _resolve_wdt_section,
)
from backend.route_groups.api_project_setup import create_project_setup_blueprint


# ---------------------------------------------------------------------------
# WDT generation
# ---------------------------------------------------------------------------


class TestBuildWdtText(unittest.TestCase):
    def test_default_block_name_when_profile_has_none(self) -> None:
        text = _build_wdt_text({})
        first_line = text.splitlines()[0]
        self.assertEqual(first_line, f"BLOCK = {DEFAULT_BLOCK_NAME}")

    def test_custom_block_name_from_profile(self) -> None:
        text = _build_wdt_text({"blockName": "MY-CUSTOM-BORDER"})
        first_line = text.splitlines()[0]
        self.assertEqual(first_line, "BLOCK = MY-CUSTOM-BORDER")

    def test_attribute_order_matches_constant(self) -> None:
        text = _build_wdt_text({"blockName": DEFAULT_BLOCK_NAME})
        lines = text.splitlines()
        # Skip the first BLOCK= line; the rest should be attribute mappings.
        attribute_lines = lines[1:]
        for idx, tag in enumerate(WDT_ATTRIBUTE_ORDER):
            expected_value = WDT_FIELD_MAP[tag]
            self.assertEqual(
                attribute_lines[idx],
                f"{tag} = {expected_value}",
                msg=f"Attribute line {idx} mismatch for tag {tag!r}",
            )

    def test_output_ends_with_newline(self) -> None:
        text = _build_wdt_text({})
        self.assertTrue(text.endswith("\n"))


# ---------------------------------------------------------------------------
# WDL generation
# ---------------------------------------------------------------------------


class TestBuildWdlText(unittest.TestCase):
    def test_contains_all_default_labels(self) -> None:
        text = _build_wdl_text()
        for key, value in DEFAULT_WDL_LABELS.items():
            self.assertIn(f"{key} = {value}", text)

    def test_output_ends_with_newline(self) -> None:
        self.assertTrue(_build_wdl_text().endswith("\n"))

    def test_line_count_matches_label_count(self) -> None:
        text = _build_wdl_text()
        non_empty_lines = [ln for ln in text.splitlines() if ln.strip()]
        self.assertEqual(len(non_empty_lines), len(DEFAULT_WDL_LABELS))


# ---------------------------------------------------------------------------
# WDT parsing
# ---------------------------------------------------------------------------


_SINGLE_SECTION_WDT = """\
BLOCK = R3P-24x36BORDER&TITLE
DWGNO = DWGNAM
TITLE1 = LINE1
TITLE2 = LINE2
TITLE3 = DWGDESC
PROJ = LINE4
"""

_MULTI_SECTION_WDT = """\
; Comment line - should be ignored
BLOCK = BORDER-A
DWGNO = DWGNAM
TITLE1 = LINE1

BLOCK = BORDER-B,BORDER-C
DWGNO = DWGNAM
TITLE3 = DWGDESC
"""

_WDT_WITH_COMMENTS_BLANKS = """\
; This is a header comment
; Another comment

BLOCK = TEST-BLOCK
; inline comment ignored
DWGNO = DWGNAM
"""


class TestParseWdtDefinitionText(unittest.TestCase):
    def test_single_section_parsed_correctly(self) -> None:
        result = _parse_wdt_definition_text(_SINGLE_SECTION_WDT, "output/project.wdt")
        self.assertEqual(result["path"], "output/project.wdt")
        sections = result["sections"]
        self.assertEqual(len(sections), 1)
        section = sections[0]
        self.assertEqual(section["blockNames"], ["R3P-24x36BORDER&TITLE"])
        self.assertIn("DWGNO", section["attributeMap"])
        self.assertEqual(section["attributeMap"]["DWGNO"], "DWGNAM")

    def test_multi_section_creates_multiple_sections(self) -> None:
        result = _parse_wdt_definition_text(_MULTI_SECTION_WDT, "output/multi.wdt")
        sections = result["sections"]
        self.assertEqual(len(sections), 2)

    def test_multi_value_block_names_split_correctly(self) -> None:
        result = _parse_wdt_definition_text(_MULTI_SECTION_WDT, "output/multi.wdt")
        second_section = result["sections"][1]
        self.assertIn("BORDER-B", second_section["blockNames"])
        self.assertIn("BORDER-C", second_section["blockNames"])

    def test_comments_and_blank_lines_are_ignored(self) -> None:
        result = _parse_wdt_definition_text(_WDT_WITH_COMMENTS_BLANKS, "output/test.wdt")
        sections = result["sections"]
        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0]["blockNames"], ["TEST-BLOCK"])

    def test_attribute_values_are_uppercased(self) -> None:
        wdt = "BLOCK = TestBlock\nDWGNO = dwgnam\n"
        result = _parse_wdt_definition_text(wdt, "output/x.wdt")
        self.assertEqual(result["sections"][0]["attributeMap"]["DWGNO"], "DWGNAM")

    def test_empty_input_yields_no_sections(self) -> None:
        result = _parse_wdt_definition_text("", "output/empty.wdt")
        self.assertEqual(result["sections"], [])

    def test_windows_crlf_line_endings_handled(self) -> None:
        wdt_crlf = "BLOCK = CRLF-BLOCK\r\nDWGNO = DWGNAM\r\n"
        result = _parse_wdt_definition_text(wdt_crlf, "output/crlf.wdt")
        self.assertEqual(len(result["sections"]), 1)
        self.assertEqual(result["sections"][0]["blockNames"], ["CRLF-BLOCK"])


# ---------------------------------------------------------------------------
# WDT section resolution
# ---------------------------------------------------------------------------


_MULTI_SECTION_DEF = {
    "path": "output/multi.wdt",
    "sections": [
        {"blockNames": ["BORDER-SCHEMATIC"], "attributeMap": {"DWGNO": "DWGNAM", "TITLE1": "LINE1"}},
        {"blockNames": ["BORDER-PANEL"], "attributeMap": {"DWGNO": "DWGNAM", "TITLE3": "DWGDESC"}},
    ],
}

_SINGLE_SECTION_DEF = {
    "path": "output/single.wdt",
    "sections": [
        {"blockNames": ["ONLY-BLOCK"], "attributeMap": {"DWGNO": "DWGNAM"}},
    ],
}


class TestResolveWdtSection(unittest.TestCase):
    def test_no_sections_returns_none(self) -> None:
        result = _resolve_wdt_section(
            wdt_definition={"path": "/tmp/x.wdt", "sections": []},
            block_name="ANY",
            current_attributes={},
        )
        self.assertIsNone(result)

    def test_single_section_always_returned(self) -> None:
        result = _resolve_wdt_section(
            wdt_definition=_SINGLE_SECTION_DEF,
            block_name="ANYTHING",
            current_attributes={},
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["blockNames"], ["ONLY-BLOCK"])  # type: ignore[index]

    def test_exact_block_name_match(self) -> None:
        result = _resolve_wdt_section(
            wdt_definition=_MULTI_SECTION_DEF,
            block_name="BORDER-PANEL",
            current_attributes={},
        )
        self.assertIsNotNone(result)
        self.assertIn("BORDER-PANEL", result["blockNames"])  # type: ignore[index]

    def test_contains_block_name_match(self) -> None:
        # "SCHEMATIC" is a substring of "BORDER-SCHEMATIC"
        result = _resolve_wdt_section(
            wdt_definition=_MULTI_SECTION_DEF,
            block_name="BORDER-SCHEMATIC-VARIANT",
            current_attributes={},
        )
        self.assertIsNotNone(result)
        self.assertIn("BORDER-SCHEMATIC", result["blockNames"])  # type: ignore[index]

    def test_attribute_score_fallback_selects_best_match(self) -> None:
        # Provide attributes matching the PANEL section (TITLE3) rather than SCHEMATIC (TITLE1)
        result = _resolve_wdt_section(
            wdt_definition=_MULTI_SECTION_DEF,
            block_name="UNKNOWN-BLOCK",
            current_attributes={"DWGNO": "001", "TITLE3": "PANEL DESC"},
        )
        self.assertIsNotNone(result)
        self.assertIn("BORDER-PANEL", result["blockNames"])  # type: ignore[index]


# ---------------------------------------------------------------------------
# WDL path candidates
# ---------------------------------------------------------------------------


class TestCandidateWdlPaths(unittest.TestCase):
    def test_first_candidate_is_wdtitle_variant(self) -> None:
        wdp = Path("/projects/MyProject/MyProject.wdp")
        candidates = _candidate_wdl_paths(wdp)
        first = candidates[0]
        self.assertEqual(first.name, "MyProject_wdtitle.wdl")

    def test_second_candidate_is_stem_dot_wdl(self) -> None:
        wdp = Path("/projects/MyProject/MyProject.wdp")
        candidates = _candidate_wdl_paths(wdp)
        second = candidates[1]
        self.assertEqual(second.name, "MyProject.wdl")

    def test_both_candidates_share_parent_directory(self) -> None:
        wdp = Path("/projects/MyProject/MyProject.wdp")
        candidates = _candidate_wdl_paths(wdp)
        for candidate in candidates:
            self.assertEqual(candidate.parent, wdp.parent)


# ---------------------------------------------------------------------------
# WDL path resolution from discovered files
# ---------------------------------------------------------------------------


class TestResolveWdlPath(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.wdp_path = self.root / "PROJ-00001.wdp"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_prefers_wdtitle_variant_when_present(self) -> None:
        wdtitle_file = self.root / "PROJ-00001_wdtitle.wdl"
        stem_file = self.root / "PROJ-00001.wdl"
        wdtitle_file.write_text("LINE1 = Client / Utility\n", encoding="utf-8")
        stem_file.write_text("LINE1 = Other\n", encoding="utf-8")

        resolved = _resolve_wdl_path([wdtitle_file, stem_file], self.wdp_path)
        self.assertEqual(resolved, wdtitle_file)

    def test_falls_back_to_stem_wdl_when_wdtitle_absent(self) -> None:
        stem_file = self.root / "PROJ-00001.wdl"
        stem_file.write_text("LINE1 = Client / Utility\n", encoding="utf-8")

        resolved = _resolve_wdl_path([stem_file], self.wdp_path)
        self.assertEqual(resolved, stem_file)

    def test_returns_default_candidate_when_neither_exists(self) -> None:
        resolved = _resolve_wdl_path([], self.wdp_path)
        # Default candidate is the _wdtitle.wdl variant
        self.assertEqual(resolved.name, "PROJ-00001_wdtitle.wdl")

    def test_case_insensitive_matching(self) -> None:
        # Simulate a file discovered with upper-case extension (Windows paths)
        upper_case_file = self.root / "PROJ-00001_WDTITLE.WDL"
        upper_case_file.write_text("LINE1 = Client / Utility\n", encoding="utf-8")

        resolved = _resolve_wdl_path([upper_case_file], self.wdp_path)
        # The expected candidate path (lower-case) should match upper_case_file
        self.assertEqual(resolved.name.upper(), "PROJ-00001_WDTITLE.WDL")


# ---------------------------------------------------------------------------
# Artifact preview building
# ---------------------------------------------------------------------------


class TestBuildArtifactPreviewFromSnapshot(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "PROJ-00001-E6-0001 MAIN.dwg").write_text("", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _profile(self, **overrides) -> dict:
        base = {
            "blockName": DEFAULT_BLOCK_NAME,
            "projectName": "MyProject",
            "projectRootPath": str(self.root),
            "acadeLine1": "Company",
            "acadeLine2": "Site",
            "acadeLine4": "PROJ-00001",
        }
        base.update(overrides)
        return base

    def _discovered(self) -> list:
        return [self.root / "PROJ-00001-E6-0001 MAIN.dwg"]

    def test_generates_wdt_text_when_not_provided(self) -> None:
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
                "wdtPath": str(self.root / "MyProject.wdt"),
                "wdlPath": str(self.root / "MyProject_wdtitle.wdl"),
            },
        )
        wdt_text = result["wdtText"]
        self.assertIn(f"BLOCK = {DEFAULT_BLOCK_NAME}", wdt_text)
        self.assertIn("DWGNO = DWGNAM", wdt_text)

    def test_preserves_existing_wdt_text_when_provided(self) -> None:
        existing_wdt = "BLOCK = CUSTOM-BLOCK\nDWGNO = DWGNAM\n"
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
                "wdtPath": str(self.root / "MyProject.wdt"),
                "wdlPath": str(self.root / "MyProject_wdtitle.wdl"),
                "wdtText": existing_wdt,
            },
        )
        # _normalize_text strips trailing whitespace from existing text.
        self.assertEqual(result["wdtText"], existing_wdt.strip())

    def test_generates_wdl_text_when_not_provided(self) -> None:
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
            },
        )
        wdl_text = result["wdlText"]
        for key, value in DEFAULT_WDL_LABELS.items():
            self.assertIn(f"{key} = {value}", wdl_text)

    def test_preserves_existing_wdl_text_when_provided(self) -> None:
        existing_wdl = "LINE1 = Custom Client\nLINE2 = Custom Site\nLINE4 = Custom Number\n"
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
                "wdlText": existing_wdl,
            },
        )
        # _normalize_text strips trailing whitespace from existing text.
        self.assertEqual(result["wdlText"], existing_wdl.strip())

    def test_wdt_path_is_sibling_of_wdp(self) -> None:
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={"wdpPath": str(self.root / "MyProject.wdp")},
        )
        wdp_parent = Path(result["wdpPath"]).parent
        wdt_parent = Path(result["wdtPath"]).parent
        self.assertEqual(wdp_parent, wdt_parent)

    def test_wdl_path_is_sibling_of_wdp(self) -> None:
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={"wdpPath": str(self.root / "MyProject.wdp")},
        )
        wdp_parent = Path(result["wdpPath"]).parent
        wdl_parent = Path(result["wdlPath"]).parent
        self.assertEqual(wdp_parent, wdl_parent)

    def test_wdp_state_is_starter_when_not_existing(self) -> None:
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
                "wdpExists": False,
            },
        )
        self.assertEqual(result["wdpState"], "starter")

    def test_wdp_state_is_existing_when_file_exists_with_different_content(self) -> None:
        generated_text = (
            "*[1]Company\n*[2]Site\n*[4]PROJ-00001\n"
            "+[1]%SL_DIR%NFPA/;%SL_DIR%NFPA/1-/;%SL_DIR%pneu_iso125/;%SL_DIR%hyd_iso125/;%SL_DIR%pid/\n"
        )
        existing_wdp_text = "*[1]DifferentOwner\n+[1]%SL_DIR%NFPA/\n"
        result = _build_artifact_preview_from_snapshot(
            project_root=self.root,
            discovered_files=self._discovered(),
            profile=self._profile(),
            artifacts_input={
                "wdpPath": str(self.root / "MyProject.wdp"),
                "wdpExists": True,
                "wdpText": existing_wdp_text,
            },
        )
        self.assertEqual(result["wdpState"], "existing")


# ---------------------------------------------------------------------------
# API endpoint – sidecar artifacts are surfaced in preview response
# ---------------------------------------------------------------------------


class _ResponseStub:
    def __init__(self, status_code: int, payload, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = b"" if payload is None else b"json"

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self) -> None:
        self.get_response = _ResponseStub(200, [])
        self.post_response = _ResponseStub(200, [])

    def get(self, url, headers=None, params=None, timeout=None):
        return self.get_response

    def post(self, url, headers=None, params=None, json=None, timeout=None):
        return self.post_response


class TestPreviewEndpointSidecarArtifacts(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name)
        (self.project_root / "PROJ-00001-E6-0001 MAIN.dwg").write_text(
            "", encoding="utf-8"
        )

        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        limiter = Limiter(
            app=self.app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "dev@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        self.app.register_blueprint(
            create_project_setup_blueprint(
                limiter=limiter,
                logger=self.app.logger,
                require_supabase_user=require_supabase_user,
                api_key="test-secret",
                supabase_url="http://supabase.test",
                supabase_api_key="sb-key",
                requests_module=_RequestsStub(),
            )
        )
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _post_preview(self, artifacts: dict) -> dict:
        drawing_path = str((self.project_root / "PROJ-00001-E6-0001 MAIN.dwg").resolve())
        response = self.client.post(
            "/api/project-setup/preview",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root.resolve()),
                "profile": {
                    "projectName": "MyProject",
                    "blockName": DEFAULT_BLOCK_NAME,
                    "projectRootPath": str(self.project_root.resolve()),
                    "acadeLine1": "Company",
                    "acadeLine2": "Site",
                    "acadeLine4": "PROJ-00001",
                    "signerDrawnBy": "Dev",
                    "signerCheckedBy": "Dev",
                    "signerEngineer": "Dev",
                },
                "revisionEntries": [],
                "scanSnapshot": {
                    "files": [
                        {
                            "absolutePath": drawing_path,
                            "relativePath": "PROJ-00001-E6-0001 MAIN.dwg",
                            "fileType": "dwg",
                        }
                    ],
                    "bridgeDrawings": [
                        {
                            "path": drawing_path,
                            "titleBlockFound": True,
                            "blockName": DEFAULT_BLOCK_NAME,
                            "layoutName": "Layout1",
                            "handle": "ABCD",
                            "hasWdTb": False,
                            "attributes": {
                                "DWGNO": "PROJ-00001-E6-0001",
                                "TITLE3": "MAIN",
                                "REV": "A",
                            },
                        }
                    ],
                    "artifacts": artifacts,
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        return payload["data"]["artifacts"]

    def test_response_includes_wdt_path(self) -> None:
        artifacts = self._post_preview(
            {
                "wdpPath": str((self.project_root / "MyProject.wdp").resolve()),
                "wdtPath": str((self.project_root / "MyProject.wdt").resolve()),
                "wdlPath": str(
                    (self.project_root / "MyProject_wdtitle.wdl").resolve()
                ),
            }
        )
        self.assertIn("wdtPath", artifacts)
        self.assertTrue(artifacts["wdtPath"].endswith(".wdt"))

    def test_response_includes_wdl_path(self) -> None:
        artifacts = self._post_preview(
            {
                "wdpPath": str((self.project_root / "MyProject.wdp").resolve()),
                "wdlPath": str(
                    (self.project_root / "MyProject_wdtitle.wdl").resolve()
                ),
            }
        )
        self.assertIn("wdlPath", artifacts)
        self.assertTrue(artifacts["wdlPath"].endswith(".wdl"))

    def test_generated_wdt_text_contains_block_name(self) -> None:
        artifacts = self._post_preview(
            {"wdpPath": str((self.project_root / "MyProject.wdp").resolve())}
        )
        self.assertIn("wdtText", artifacts)
        self.assertIn(f"BLOCK = {DEFAULT_BLOCK_NAME}", artifacts["wdtText"])

    def test_existing_wdt_text_preserved_in_response(self) -> None:
        custom_wdt = "BLOCK = CUSTOM-BLOCK\nDWGNO = DWGNAM\n"
        artifacts = self._post_preview(
            {
                "wdpPath": str((self.project_root / "MyProject.wdp").resolve()),
                "wdtText": custom_wdt,
            }
        )
        # _normalize_text strips trailing whitespace from the input text.
        self.assertEqual(artifacts["wdtText"], custom_wdt.strip())

    def test_existing_wdl_text_preserved_in_response(self) -> None:
        custom_wdl = "LINE1 = Custom Client\nLINE2 = Custom Site\nLINE4 = Custom Number\n"
        artifacts = self._post_preview(
            {
                "wdpPath": str((self.project_root / "MyProject.wdp").resolve()),
                "wdlText": custom_wdl,
            }
        )
        # _normalize_text strips trailing whitespace from the input text.
        self.assertEqual(artifacts["wdlText"], custom_wdl.strip())

    def test_generated_wdl_text_contains_default_labels(self) -> None:
        artifacts = self._post_preview(
            {"wdpPath": str((self.project_root / "MyProject.wdp").resolve())}
        )
        self.assertIn("wdlText", artifacts)
        for key, value in DEFAULT_WDL_LABELS.items():
            self.assertIn(f"{key} = {value}", artifacts["wdlText"])

    def test_wdt_conflict_flag_surfaced_in_drawing_issues(self) -> None:
        """A drawing with hasWdTb=True should report a conflict issue."""
        drawing_path = str((self.project_root / "PROJ-00001-E6-0001 MAIN.dwg").resolve())
        response = self.client.post(
            "/api/project-setup/preview",
            json={
                "projectId": "project-1",
                "projectRootPath": str(self.project_root.resolve()),
                "profile": {
                    "projectName": "MyProject",
                    "blockName": DEFAULT_BLOCK_NAME,
                    "projectRootPath": str(self.project_root.resolve()),
                    "acadeLine1": "Company",
                    "acadeLine2": "Site",
                    "acadeLine4": "PROJ-00001",
                },
                "revisionEntries": [],
                "scanSnapshot": {
                    "files": [
                        {
                            "absolutePath": drawing_path,
                            "relativePath": "PROJ-00001-E6-0001 MAIN.dwg",
                            "fileType": "dwg",
                        }
                    ],
                    "bridgeDrawings": [
                        {
                            "path": drawing_path,
                            "titleBlockFound": True,
                            "blockName": DEFAULT_BLOCK_NAME,
                            "layoutName": "Layout1",
                            "handle": "ABCD",
                            "hasWdTb": True,
                            "attributes": {"DWGNO": "PROJ-00001-E6-0001"},
                        }
                    ],
                    "artifacts": {
                        "wdpPath": str((self.project_root / "MyProject.wdp").resolve()),
                    },
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        drawings = payload["data"]["drawings"]
        self.assertEqual(len(drawings), 1)
        issues = drawings[0].get("issues", [])
        wdtb_issue = any("WD_TB" in issue for issue in issues)
        self.assertTrue(wdtb_issue, msg=f"Expected WD_TB conflict issue, got: {issues}")


if __name__ == "__main__":
    unittest.main()
