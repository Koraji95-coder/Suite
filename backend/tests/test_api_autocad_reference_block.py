from __future__ import annotations

import os
import tempfile
import unittest

import backend.route_groups.api_autocad_reference_block as reference_block
from backend.route_groups.api_autocad_reference_block import (
    add_point_label,
    default_ref_dwg_path,
    ensure_block_exists,
    insert_reference_block,
)


class _BlocksStub:
    def __init__(self, names):
        self._names = set(names)

    def Item(self, name):
        if name not in self._names:
            raise KeyError(name)
        return object()


class _DocStub:
    def __init__(self, block_names):
        self.Blocks = _BlocksStub(block_names)


class _LoggerStub:
    def __init__(self):
        self.messages = []

    def info(self, message, *args):
        self.messages.append((message, args))


class _BlockRefStub:
    def __init__(self):
        self.Layer = ""


class _ModelSpaceStub:
    def __init__(self):
        self.insert_calls = []
        self.text_calls = []

    def InsertBlock(self, point, name, sx, sy, sz, rotation):
        self.insert_calls.append((point, name, sx, sy, sz, rotation))
        return _BlockRefStub()

    def AddText(self, label_text, point, text_height):
        self.text_calls.append((label_text, point, text_height))
        return _BlockRefStub()


class TestApiAutocadReferenceBlock(unittest.TestCase):
    def setUp(self) -> None:
        reference_block._REF_IMPORT_CACHE.clear()

    def test_default_ref_dwg_path_prefers_assets_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            assets_dir = os.path.join(temp_dir, "assets")
            os.makedirs(assets_dir, exist_ok=True)
            assets_path = os.path.join(assets_dir, "Coordinate Reference Point.dwg")
            with open(assets_path, "w", encoding="utf-8") as handle:
                handle.write("dwg")

            self.assertEqual(default_ref_dwg_path(base_dir=temp_dir), assets_path)

    def test_default_ref_dwg_path_falls_back_to_base(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            expected = os.path.join(temp_dir, "Coordinate Reference Point.dwg")
            self.assertEqual(default_ref_dwg_path(base_dir=temp_dir), expected)

    def test_ensure_block_exists_returns_existing_block(self) -> None:
        doc = _DocStub({"RefBlock"})
        result = ensure_block_exists(
            doc,
            "RefBlock",
            "/not/used.dwg",
            dyn_fn=lambda value: value,
            logger=_LoggerStub(),
            pt_fn=lambda x, y, z: (x, y, z),
            com_call_with_retry_fn=lambda fn: fn(),
            wait_for_command_finish_fn=lambda _doc, timeout_s: True,
        )
        self.assertEqual(result, "RefBlock")

    def test_ensure_block_exists_raises_for_missing_file(self) -> None:
        doc = _DocStub(set())
        with self.assertRaises(RuntimeError):
            ensure_block_exists(
                doc,
                "RefBlock",
                "/definitely/missing/coord_ref.dwg",
                dyn_fn=lambda value: value,
                logger=_LoggerStub(),
                pt_fn=lambda x, y, z: (x, y, z),
                com_call_with_retry_fn=lambda fn: fn(),
                wait_for_command_finish_fn=lambda _doc, timeout_s: True,
            )

    def test_insert_reference_block_uses_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            ref_path = os.path.join(temp_dir, "Coordinate Reference Point.dwg")
            with open(ref_path, "w", encoding="utf-8") as handle:
                handle.write("dwg")

            ms = _ModelSpaceStub()
            ensure_calls = []

            def ensure_block_exists_fn(_doc, block_name, _dwg_path):
                ensure_calls.append(block_name)
                return block_name

            result1 = insert_reference_block(
                doc=object(),
                ms=ms,
                ref_dwg_path=ref_path,
                layer_name="COORD-LABELS",
                x=1,
                y=2,
                z=3,
                scale=2,
                rotation_deg=90,
                dyn_fn=lambda value: value,
                ensure_block_exists_fn=ensure_block_exists_fn,
                ensure_layer_fn=lambda _doc, _layer: None,
                pt_fn=lambda x, y, z: (x, y, z),
                com_call_with_retry_fn=lambda fn: fn(),
            )
            result2 = insert_reference_block(
                doc=object(),
                ms=ms,
                ref_dwg_path=ref_path,
                layer_name="COORD-LABELS",
                x=4,
                y=5,
                z=6,
                scale=1,
                rotation_deg=0,
                dyn_fn=lambda value: value,
                ensure_block_exists_fn=ensure_block_exists_fn,
                ensure_layer_fn=lambda _doc, _layer: None,
                pt_fn=lambda x, y, z: (x, y, z),
                com_call_with_retry_fn=lambda fn: fn(),
            )

            self.assertEqual(len(ensure_calls), 1)
            self.assertEqual(result1.Layer, "COORD-LABELS")
            self.assertEqual(result2.Layer, "COORD-LABELS")
            self.assertEqual(len(ms.insert_calls), 2)

    def test_add_point_label_sets_layer_and_alignment(self) -> None:
        ms = _ModelSpaceStub()
        txt = add_point_label(
            ms=ms,
            layer_name="COORD-TEXT",
            label_text="P1",
            x=10,
            y=20,
            z=0,
            scale=2,
            pt_fn=lambda x, y, z: (x, y, z),
            com_call_with_retry_fn=lambda fn: fn(),
            dyn_fn=lambda value: value,
        )

        self.assertEqual(txt.Layer, "COORD-TEXT")
        self.assertEqual(txt.Alignment, 0)
        self.assertEqual(len(ms.text_calls), 1)
        label, point, height = ms.text_calls[0]
        self.assertEqual(label, "P1")
        self.assertEqual(point, (16.0, 20, 0))
        self.assertEqual(height, 3.0)


if __name__ == "__main__":
    unittest.main()
