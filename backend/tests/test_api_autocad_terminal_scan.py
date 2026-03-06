from __future__ import annotations

import unittest

from backend.route_groups.api_autocad_terminal_scan import scan_terminal_strips


class _Attr:
    def __init__(self, tag: str, value: str) -> None:
        self.TagString = tag
        self.TextString = value


class _BlockRef:
    ObjectName = "AcDbBlockReference"

    def __init__(
        self,
        *,
        name: str,
        handle: str,
        insertion_point: tuple[float, float, float],
        attrs: list[tuple[str, str]] | None = None,
        x_scale: float = 1.0,
        y_scale: float = 1.0,
        rotation: float = 0.0,
    ) -> None:
        self.EffectiveName = name
        self.Name = name
        self.Handle = handle
        self.InsertionPoint = insertion_point
        self.XScaleFactor = x_scale
        self.YScaleFactor = y_scale
        self.Rotation = rotation
        self._attrs = [_Attr(tag, value) for tag, value in (attrs or [])]

    def GetAttributes(self):
        return self._attrs


class _BlockDefLine:
    ObjectName = "AcDbLine"
    Handle = "DEF_LINE"

    def __init__(
        self,
        *,
        start_point: tuple[float, float, float],
        end_point: tuple[float, float, float],
    ) -> None:
        self.StartPoint = start_point
        self.EndPoint = end_point


class _LineEntity:
    ObjectName = "AcDbLine"
    Handle = "LINE1"


class _Collection:
    def __init__(self, items) -> None:
        self._items = list(items)

    @property
    def Count(self) -> int:
        return len(self._items)

    def Item(self, index: int):
        return self._items[index]


class _Doc:
    class _Blocks:
        def __init__(self, mapping) -> None:
            self._mapping = {
                str(name).upper(): value
                for name, value in dict(mapping or {}).items()
            }

        def Item(self, name: str):
            key = str(name).upper()
            if key not in self._mapping:
                raise KeyError(name)
            return self._mapping[key]

    def __init__(
        self,
        *,
        name: str,
        units: int,
        pickfirst=None,
        active=None,
        blocks=None,
    ) -> None:
        self.Name = name
        self._units = units
        self.PickfirstSelectionSet = _Collection(pickfirst or [])
        self.ActiveSelectionSet = _Collection(active or [])
        if blocks is not None:
            self.Blocks = _Doc._Blocks(blocks)

    def GetVariable(self, name: str):
        if name.upper() == "INSUNITS":
            return self._units
        return 0


class TestApiAutocadTerminalScan(unittest.TestCase):
    def test_scan_terminal_strips_extracts_panel_structure(self) -> None:
        entities = [
            _LineEntity(),
            _BlockRef(
                name="TERMINAL_STRIP_BLOCK",
                handle="A1",
                insertion_point=(100.0, 220.0, 0.0),
                attrs=[
                    ("PANEL_ID", "RP1"),
                    ("PANEL_NAME", "Relay Panel 1"),
                    ("SIDE", "L"),
                    ("STRIP_ID", "RP1L1"),
                    ("TERMINAL_COUNT", "16"),
                ],
            ),
            _BlockRef(
                name="TB_ROUTING",
                handle="A2",
                insertion_point=(160.0, 240.0, 0.0),
                attrs=[
                    ("PANEL", "RP2"),
                    ("SIDE", "R"),
                    ("STRIP_ID", "RP2R1"),
                    ("WAYS", "12"),
                ],
            ),
        ]
        modelspace = _Collection(entities)
        doc = _Doc(name="demo.dwg", units=1)

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalPanels"], 2)
        self.assertEqual(result["meta"]["totalStrips"], 2)
        self.assertEqual(result["meta"]["totalTerminals"], 28)
        self.assertEqual(result["data"]["drawing"]["units"], "Inches")
        self.assertIn("RP1", result["data"]["panels"])
        self.assertIn("RP2", result["data"]["panels"])

    def test_scan_terminal_strips_selection_only_uses_selection_sets(self) -> None:
        selected = [
            _BlockRef(
                name="TB",
                handle="S1",
                insertion_point=(10.0, 20.0, 0.0),
                attrs=[
                    ("PANEL", "JB1"),
                    ("SIDE", "C"),
                    ("STRIP_ID", "JB1C1"),
                    ("TERMINALS", "10"),
                ],
            )
        ]
        doc = _Doc(name="selection.dwg", units=2, pickfirst=selected, active=[])
        modelspace = _Collection([])

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=False,
            selection_only=True,
            max_entities=1000,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalPanels"], 1)
        self.assertEqual(result["meta"]["totalStrips"], 1)
        self.assertEqual(result["data"]["drawing"]["units"], "Feet")

    def test_scan_terminal_strips_reports_empty_result_with_code(self) -> None:
        doc = _Doc(name="empty.dwg", units=0)
        modelspace = _Collection([_LineEntity()])
        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], "NO_TERMINAL_STRIPS_FOUND")
        self.assertEqual(result["meta"]["totalPanels"], 0)
        self.assertEqual(result["meta"]["totalStrips"], 0)
        self.assertEqual(result["meta"]["skippedNonBlockEntities"], 1)
        self.assertEqual(result["meta"]["terminalCandidateBlocks"], 0)

    def test_scan_terminal_strips_reports_skip_diagnostics_for_terminal_like_blocks(self) -> None:
        doc = _Doc(name="diag.dwg", units=0)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TB_MISSING_PT",
                    handle="B1",
                    insertion_point=(None, None, 0.0),
                    attrs=[("PANEL_ID", "P1"), ("STRIP_ID", "P1L1")],
                ),
            ]
        )
        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], "NO_TERMINAL_STRIPS_FOUND")
        self.assertEqual(result["meta"]["terminalCandidateBlocks"], 1)
        self.assertEqual(result["meta"]["skippedMissingInsertionPointBlocks"], 1)
        top_blocks = result["meta"]["topScannedBlockNames"]
        self.assertTrue(any(item["blockName"] == "TB_MISSING_PT" for item in top_blocks))
        self.assertTrue(any("missing insertion point" in warning for warning in result["warnings"]))

    def test_scan_terminal_strips_parses_strip_number_from_strip_id_suffix(self) -> None:
        doc = _Doc(name="suffix.dwg", units=2)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TERMINAL_STRIP_BLOCK",
                    handle="C1",
                    insertion_point=(20.0, 40.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "L"),
                        ("STRIP_ID", "RP1L6"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
        )

        self.assertTrue(result["success"])
        strips = result["data"]["panels"]["RP1"]["sides"]["L"]["strips"]
        self.assertEqual(len(strips), 1)
        self.assertEqual(strips[0]["stripNumber"], 6)

    def test_scan_terminal_strips_applies_custom_terminal_profile(self) -> None:
        doc = _Doc(name="custom-profile.dwg", units=2)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="GENERIC_BLOCK",
                    handle="D1",
                    insertion_point=(50.0, 80.0, 0.0),
                    attrs=[
                        ("CAB", "XP2"),
                        ("POS", "R"),
                        ("WIRE_STRIP", "XP2R4"),
                        ("POLES", "24"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            terminal_profile={
                "panelIdKeys": ["CAB"],
                "sideKeys": ["POS"],
                "stripIdKeys": ["WIRE_STRIP"],
                "terminalCountKeys": ["POLES"],
                "terminalTagKeys": ["WIRE_STRIP", "POLES"],
                "defaultPanelPrefix": "RP",
                "defaultTerminalCount": 12,
            },
        )

        self.assertTrue(result["success"])
        panel = result["data"]["panels"]["XP2"]
        strips = panel["sides"]["R"]["strips"]
        self.assertEqual(len(strips), 1)
        self.assertEqual(strips[0]["stripId"], "XP2R4")
        self.assertEqual(strips[0]["stripNumber"], 4)
        self.assertEqual(strips[0]["terminalCount"], 24)

        profile_meta = result["meta"]["terminalProfile"]
        self.assertEqual(profile_meta["defaultPanelPrefix"], "RP")
        self.assertIn("WIRE_STRIP", profile_meta["stripIdKeys"])

    def test_scan_terminal_strips_extracts_termxx_label_attributes(self) -> None:
        doc = _Doc(name="term-labels.dwg", units=2)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TERMINAL_STRIP_BLOCK",
                    handle="E1",
                    insertion_point=(120.0, 220.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "L"),
                        ("STRIP_ID", "RP1L1"),
                        ("TERMINAL_COUNT", "4"),
                        ("TERM01_LABEL", "IN105 (+)"),
                        ("TERM02_LABEL", "IN105 (-)"),
                        ("TERM04_LABEL", "IN106 (-)"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
        )

        self.assertTrue(result["success"])
        strips = result["data"]["panels"]["RP1"]["sides"]["L"]["strips"]
        self.assertEqual(len(strips), 1)
        labels = strips[0]["terminalLabels"]
        self.assertEqual(labels, ["IN105 (+)", "IN105 (-)", "", "IN106 (-)"])
        self.assertEqual(result["meta"]["totalLabeledTerminals"], 3)

    def test_scan_terminal_strips_honors_strict_block_allowlist_profile(self) -> None:
        doc = _Doc(name="strict-profile.dwg", units=2)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TB_STRIP_META_SIDE",
                    handle="F1",
                    insertion_point=(10.0, 30.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "L"),
                        ("STRIP_ID", "RP1L1"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
                _BlockRef(
                    name="TERMINAL_BLOCK_MISC",
                    handle="F2",
                    insertion_point=(30.0, 40.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "R"),
                        ("STRIP_ID", "RP1R99"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            terminal_profile={
                "blockNameAllowList": ["TB_STRIP_META_SIDE"],
                "requireStripId": True,
                "requireTerminalCount": True,
                "requireSide": True,
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalStrips"], 1)
        strips = result["data"]["panels"]["RP1"]["sides"]["L"]["strips"]
        self.assertEqual(strips[0]["stripId"], "RP1L1")
        profile_meta = result["meta"]["terminalProfile"]
        self.assertEqual(profile_meta["blockNameAllowList"], ["TB_STRIP_META_SIDE"])
        self.assertTrue(profile_meta["requireStripId"])
        self.assertTrue(profile_meta["requireTerminalCount"])
        self.assertTrue(profile_meta["requireSide"])

    def test_scan_terminal_strips_includes_transformed_block_geometry(self) -> None:
        doc = _Doc(
            name="geometry.dwg",
            units=2,
            blocks={
                "TB_STRIP_META_SIDE": _Collection(
                    [
                        _BlockDefLine(start_point=(0.0, 0.0, 0.0), end_point=(0.0, 12.0, 0.0)),
                        _BlockDefLine(start_point=(0.0, 12.0, 0.0), end_point=(6.0, 12.0, 0.0)),
                    ]
                )
            },
        )
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TB_STRIP_META_SIDE",
                    handle="G1",
                    insertion_point=(100.0, 220.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "L"),
                        ("STRIP_ID", "RP1L1"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            terminal_profile={
                "blockNameAllowList": ["TB_STRIP_META_SIDE"],
                "requireStripId": True,
                "requireTerminalCount": True,
                "requireSide": True,
            },
        )

        self.assertTrue(result["success"])
        strips = result["data"]["panels"]["RP1"]["sides"]["L"]["strips"]
        self.assertEqual(len(strips), 1)
        geometry = strips[0]["geometry"]
        self.assertGreaterEqual(len(geometry), 2)
        self.assertEqual(geometry[0]["kind"], "line")
        self.assertAlmostEqual(geometry[0]["points"][0]["x"], 100.0, places=4)
        self.assertAlmostEqual(geometry[0]["points"][0]["y"], 220.0, places=4)
        self.assertAlmostEqual(geometry[0]["points"][1]["x"], 100.0, places=4)
        self.assertAlmostEqual(geometry[0]["points"][1]["y"], 232.0, places=4)
        self.assertGreaterEqual(result["meta"]["totalGeometryPrimitives"], 2)

    def test_scan_terminal_strips_extracts_tb_jumper_meta_records(self) -> None:
        doc = _Doc(name="jumpers.dwg", units=2)
        modelspace = _Collection(
            [
                _BlockRef(
                    name="TB_STRIP_META_SIDE",
                    handle="J1",
                    insertion_point=(10.0, 40.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "L"),
                        ("STRIP_ID", "RP1L1"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
                _BlockRef(
                    name="TB_STRIP_META_SIDE",
                    handle="J2",
                    insertion_point=(40.0, 40.0, 0.0),
                    attrs=[
                        ("PANEL_ID", "RP1"),
                        ("SIDE", "R"),
                        ("STRIP_ID", "RP1R1"),
                        ("TERMINAL_COUNT", "12"),
                    ],
                ),
                _BlockRef(
                    name="TB_JUMPER_META",
                    handle="J3",
                    insertion_point=(20.0, 20.0, 0.0),
                    attrs=[
                        ("JUMPER_ID", "JMP-A"),
                        ("PANEL_ID", "RP1"),
                        ("FROM_STRIP_ID", "RP1L1"),
                        ("FROM_TERM", "5"),
                        ("TO_STRIP_ID", "RP1R1"),
                        ("TO_TERM", "5"),
                    ],
                ),
            ]
        )

        result = scan_terminal_strips(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            terminal_profile={
                "blockNameAllowList": ["TB_STRIP_META_SIDE"],
                "requireStripId": True,
                "requireTerminalCount": True,
                "requireSide": True,
            },
        )

        self.assertTrue(result["success"])
        jumpers = result["data"]["jumpers"]
        self.assertEqual(len(jumpers), 1)
        self.assertEqual(jumpers[0]["jumperId"], "JMP-A")
        self.assertEqual(jumpers[0]["panelId"], "RP1")
        self.assertEqual(jumpers[0]["fromStripId"], "RP1L1")
        self.assertEqual(jumpers[0]["fromTerminal"], 5)
        self.assertEqual(jumpers[0]["toStripId"], "RP1R1")
        self.assertEqual(jumpers[0]["toTerminal"], 5)
        self.assertEqual(result["meta"]["totalJumpers"], 1)


if __name__ == "__main__":
    unittest.main()
