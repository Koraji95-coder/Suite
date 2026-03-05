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
    ) -> None:
        self.EffectiveName = name
        self.Name = name
        self.Handle = handle
        self.InsertionPoint = insertion_point
        self._attrs = [_Attr(tag, value) for tag, value in (attrs or [])]

    def GetAttributes(self):
        return self._attrs


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
    def __init__(self, *, name: str, units: int, pickfirst=None, active=None) -> None:
        self.Name = name
        self._units = units
        self.PickfirstSelectionSet = _Collection(pickfirst or [])
        self.ActiveSelectionSet = _Collection(active or [])

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


if __name__ == "__main__":
    unittest.main()
