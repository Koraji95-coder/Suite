from __future__ import annotations

import unittest

from backend.route_groups.api_conduit_route_obstacle_scan import (
    scan_conduit_obstacles,
)


class _BBoxEntity:
    def __init__(
        self,
        *,
        handle: str,
        layer: str,
        object_name: str,
        bbox: tuple[float, float, float, float, float, float],
    ) -> None:
        self.Handle = handle
        self.Layer = layer
        self.ObjectName = object_name
        self._bbox = bbox


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


class TestApiConduitRouteObstacleScan(unittest.TestCase):
    def test_obstacle_scan_maps_supported_layers_and_scales_to_canvas(self) -> None:
        entities = [
            _BBoxEntity(
                handle="1",
                layer="S-FNDN",
                object_name="AcDbPolyline",
                bbox=(100.0, 100.0, 0.0, 180.0, 170.0, 0.0),
            ),
            _BBoxEntity(
                handle="2",
                layer="E-TRENCH",
                object_name="AcDbPolyline",
                bbox=(220.0, 120.0, 0.0, 350.0, 140.0, 0.0),
            ),
            _BBoxEntity(
                handle="3",
                layer="ROAD",
                object_name="AcDbPolyline",
                bbox=(80.0, 220.0, 0.0, 400.0, 260.0, 0.0),
            ),
        ]
        modelspace = _Collection(entities)
        doc = _Doc(name="yard.dwg", units=2)

        result = scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda ent: ent._bbox,
            include_modelspace=True,
            selection_only=False,
            max_entities=5000,
            canvas_width=980,
            canvas_height=560,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalObstacles"], 3)
        self.assertEqual(result["data"]["drawing"]["units"], "Feet")
        types = {item["type"] for item in result["data"]["obstacles"]}
        self.assertEqual(types, {"foundation", "trench", "road"})

    def test_obstacle_scan_selection_only_uses_selection_set(self) -> None:
        selected = [
            _BBoxEntity(
                handle="SEL-1",
                layer="PAD",
                object_name="AcDbBlockReference",
                bbox=(10.0, 20.0, 0.0, 40.0, 60.0, 0.0),
            ),
        ]
        doc = _Doc(name="selection.dwg", units=1, pickfirst=selected, active=[])
        modelspace = _Collection([])

        result = scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda ent: ent._bbox,
            include_modelspace=False,
            selection_only=True,
            max_entities=1000,
            canvas_width=980,
            canvas_height=560,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalObstacles"], 1)
        self.assertEqual(result["data"]["obstacles"][0]["type"], "equipment_pad")

    def test_obstacle_scan_reports_no_obstacles_when_layers_do_not_match(self) -> None:
        entities = [
            _BBoxEntity(
                handle="X1",
                layer="A-ANNO-TEXT",
                object_name="AcDbText",
                bbox=(0.0, 0.0, 0.0, 20.0, 20.0, 0.0),
            ),
            _BBoxEntity(
                handle="X2",
                layer="MISC",
                object_name="AcDbPolyline",
                bbox=(0.0, 0.0, 0.0, 20.0, 20.0, 0.0),
            ),
        ]
        doc = _Doc(name="empty.dwg", units=0)
        modelspace = _Collection(entities)

        result = scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda ent: ent._bbox,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            canvas_width=980,
            canvas_height=560,
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], "NO_OBSTACLES_FOUND")
        self.assertEqual(result["meta"]["totalObstacles"], 0)

    def test_obstacle_scan_applies_layer_type_override(self) -> None:
        entities = [
            _BBoxEntity(
                handle="OV1",
                layer="X-ROUTE-KEEP",
                object_name="AcDbPolyline",
                bbox=(50.0, 80.0, 0.0, 120.0, 130.0, 0.0),
            ),
        ]
        doc = _Doc(name="override.dwg", units=1)
        modelspace = _Collection(entities)

        result = scan_conduit_obstacles(
            doc=doc,
            modelspace=modelspace,
            dyn_fn=lambda value: value,
            entity_bbox_fn=lambda ent: ent._bbox,
            include_modelspace=True,
            selection_only=False,
            max_entities=1000,
            canvas_width=980,
            canvas_height=560,
            layer_names=["X-ROUTE-KEEP"],
            layer_type_overrides={"X-ROUTE-KEEP": "trench"},
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["meta"]["totalObstacles"], 1)
        self.assertEqual(result["meta"]["overrideLayerEntities"], 1)
        self.assertEqual(result["data"]["obstacles"][0]["type"], "trench")


if __name__ == "__main__":
    unittest.main()
