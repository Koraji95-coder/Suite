from __future__ import annotations

import math
import unittest
from typing import Any, Dict

from backend.route_groups.api_autocad_terminal_route_plot import (
    _normalize_add_arc_angles,
    canonicalize_route_for_sync,
    sync_terminal_route_operation,
)


class _FakeEntity:
    def __init__(self, *, handle: str) -> None:
        self.Handle = handle
        self.Layer = ""
        self.Color = 0
        self.deleted = False

    def Delete(self) -> None:
        self.deleted = True


class _FakeDoc:
    def __init__(self) -> None:
        self._next = 1
        self.entities: Dict[str, _FakeEntity] = {}

    def allocate_entity(self) -> _FakeEntity:
        handle = f"H{self._next:04d}"
        self._next += 1
        entity = _FakeEntity(handle=handle)
        self.entities[handle] = entity
        return entity

    def HandleToObject(self, handle: str) -> _FakeEntity:
        key = str(handle or "").strip().upper()
        entity = self.entities.get(key)
        if entity is None or entity.deleted:
            raise RuntimeError("Handle not found")
        return entity


class _FakeModelSpace:
    def __init__(self, *, doc: _FakeDoc) -> None:
        self._doc = doc

    def AddLine(self, _start: Any, _end: Any) -> _FakeEntity:
        return self._doc.allocate_entity()

    def AddArc(
        self,
        _center: Any,
        _radius: float,
        _start_angle: float,
        _end_angle: float,
    ) -> _FakeEntity:
        return self._doc.allocate_entity()

    def AddText(self, _text: str, _point: Any, _height: float) -> _FakeEntity:
        return self._doc.allocate_entity()


class TestApiAutocadTerminalRoutePlot(unittest.TestCase):
    @staticmethod
    def _sweep_radians(start_angle: float, end_angle: float) -> float:
        sweep = end_angle - start_angle
        while sweep < 0:
            sweep += math.tau
        while sweep >= math.tau:
            sweep -= math.tau
        return sweep

    def _run(
        self,
        *,
        payload: Dict[str, Any],
        doc: _FakeDoc,
        modelspace: _FakeModelSpace,
        store: Dict[str, Dict[str, list[str]]],
        ensure_layer_fn: Any | None = None,
    ) -> Dict[str, Any]:
        return sync_terminal_route_operation(
            doc=doc,
            modelspace=modelspace,
            payload=payload,
            binding_store=store,
            ensure_layer_fn=ensure_layer_fn or (lambda _doc, _layer: None),
            pt_fn=lambda x, y, z: (x, y, z),
            dyn_fn=lambda value: value,
            com_call_with_retry_fn=lambda fn: fn(),
        )

    def test_upsert_draws_route_and_stores_bindings(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}

        result = self._run(
            payload={
                "operation": "upsert",
                "sessionId": "S1",
                "clientRouteId": "R1",
                "route": {
                    "ref": "DC-001",
                    "routeType": "conductor",
                    "path": [{"x": 1, "y": 2}, {"x": 12, "y": 2}, {"x": 12, "y": 15}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["syncStatus"], "synced")
        self.assertGreaterEqual(result["data"]["drawnSegments"], 2)
        self.assertGreaterEqual(result["data"]["drawnLines"], 1)
        self.assertGreaterEqual(result["data"]["drawnArcs"], 1)
        self.assertEqual(result["data"]["geometryVersion"], "v1.2")
        self.assertIn("S1", store)
        self.assertIn("R1", store["S1"])
        self.assertGreaterEqual(len(store["S1"]["R1"]), 2)

    def test_normalize_add_arc_angles_keeps_quarter_turn_for_ccw_and_cw(self) -> None:
        quarter_turn = math.pi * 0.5
        cases = (
            (0.0, quarter_turn, 1.0),
            (0.0, -quarter_turn, -1.0),
            (quarter_turn, 0.0, -1.0),
            (-quarter_turn, 0.0, 1.0),
            (math.pi, quarter_turn, -1.0),
            (quarter_turn, math.pi, 1.0),
        )
        for start_angle, end_angle, turn in cases:
            normalized_start, normalized_end = _normalize_add_arc_angles(
                start_angle=start_angle,
                end_angle=end_angle,
                turn=turn,
            )
            sweep = self._sweep_radians(normalized_start, normalized_end)
            self.assertAlmostEqual(sweep, quarter_turn, places=6)

    def test_canonicalize_snaps_near_axis_points_without_micro_segments(self) -> None:
        route, warnings = canonicalize_route_for_sync(
            {
                "ref": "DC-100",
                "routeType": "conductor",
                "filletRadius": 0.1,
                "path": [
                    {"x": 10.0003, "y": 5.0},
                    {"x": 10.0, "y": 12.0},
                    {"x": 18.0, "y": 12.0},
                ],
            }
        )
        self.assertEqual(warnings, [])
        self.assertIsInstance(route.get("primitives"), list)
        primitives = route["primitives"]
        line_count = sum(1 for entry in primitives if entry.get("kind") == "line")
        arc_count = sum(1 for entry in primitives if entry.get("kind") == "arc")
        self.assertGreaterEqual(line_count, 2)
        self.assertGreaterEqual(arc_count, 1)

    def test_canonicalize_preserves_endpoints(self) -> None:
        route, _warnings = canonicalize_route_for_sync(
            {
                "ref": "DC-200",
                "routeType": "conductor",
                "filletRadius": 0.1,
                "path": [
                    {"x": 4.125, "y": 9.875},
                    {"x": 12.0, "y": 9.875},
                    {"x": 12.0, "y": 23.5},
                ],
            }
        )
        path = route.get("path") or []
        self.assertEqual(path[0]["x"], 4.125)
        self.assertEqual(path[0]["y"], 9.875)
        self.assertEqual(path[-1]["x"], 12.0)
        self.assertEqual(path[-1]["y"], 23.5)

    def test_canonicalize_jumper_keeps_diagonal_segments_and_disables_fillet(self) -> None:
        route, _warnings = canonicalize_route_for_sync(
            {
                "ref": "JMP-100",
                "routeType": "jumper",
                "filletRadius": 0.75,
                "path": [
                    {"x": 10.0, "y": 10.0},
                    {"x": 16.0, "y": 14.0},
                    {"x": 16.0, "y": 26.0},
                    {"x": 10.0, "y": 30.0},
                ],
            }
        )
        self.assertEqual(route.get("filletRadius"), 0.0)
        primitives = route.get("primitives") or []
        self.assertEqual(sum(1 for entry in primitives if entry.get("kind") == "arc"), 0)
        self.assertEqual(sum(1 for entry in primitives if entry.get("kind") == "line"), 3)
        path = route.get("path") or []
        self.assertEqual(path[1]["x"], 16.0)
        self.assertEqual(path[1]["y"], 14.0)

    def test_upsert_is_idempotent_by_route_id(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}

        first = self._run(
            payload={
                "operation": "upsert",
                "sessionId": "S2",
                "clientRouteId": "R2",
                "route": {
                    "ref": "DC-001",
                    "routeType": "conductor",
                    "path": [{"x": 1, "y": 1}, {"x": 8, "y": 1}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )
        self.assertTrue(first["success"])
        first_handles = list(store["S2"]["R2"])

        second = self._run(
            payload={
                "operation": "upsert",
                "sessionId": "S2",
                "clientRouteId": "R2",
                "route": {
                    "ref": "DC-001",
                    "routeType": "conductor",
                    "path": [{"x": 2, "y": 2}, {"x": 9, "y": 2}, {"x": 9, "y": 12}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )
        self.assertTrue(second["success"])
        second_handles = list(store["S2"]["R2"])
        self.assertNotEqual(first_handles, second_handles)

        deleted_count = sum(
            1
            for handle in first_handles
            if handle in doc.entities and doc.entities[handle].deleted
        )
        self.assertGreaterEqual(deleted_count, 1)

    def test_delete_erases_bound_entities(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}

        self._run(
            payload={
                "operation": "upsert",
                "sessionId": "S3",
                "clientRouteId": "R3",
                "route": {
                    "ref": "DC-003",
                    "routeType": "conductor",
                    "path": [{"x": 1, "y": 1}, {"x": 4, "y": 5}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )
        handles = list(store["S3"]["R3"])
        self.assertGreaterEqual(len(handles), 1)

        result = self._run(
            payload={
                "operation": "delete",
                "sessionId": "S3",
                "clientRouteId": "R3",
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["syncStatus"], "deleted")
        self.assertEqual(result["data"]["deletedEntities"], len(handles))
        self.assertNotIn("R3", store.get("S3", {}))

    def test_reset_clears_all_bindings_for_session(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}

        for route_id in ("R10", "R11"):
            self._run(
                payload={
                    "operation": "upsert",
                    "sessionId": "S4",
                    "clientRouteId": route_id,
                    "route": {
                        "ref": route_id,
                        "routeType": "conductor",
                        "path": [{"x": 1, "y": 1}, {"x": 5, "y": 5}],
                    },
                },
                doc=doc,
                modelspace=modelspace,
                store=store,
            )

        self.assertIn("S4", store)
        result = self._run(
            payload={
                "operation": "reset",
                "sessionId": "S4",
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["syncStatus"], "reset")
        self.assertEqual(result["data"]["resetRoutes"], 2)
        self.assertNotIn("S4", store)

    def test_rejects_missing_session_id(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}

        result = self._run(
            payload={
                "operation": "upsert",
                "clientRouteId": "R5",
                "route": {
                    "ref": "R5",
                    "routeType": "conductor",
                    "path": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], "INVALID_REQUEST")

    def test_upsert_uses_bylayer_entities_and_passes_layer_color(self) -> None:
        doc = _FakeDoc()
        modelspace = _FakeModelSpace(doc=doc)
        store: Dict[str, Dict[str, list[str]]] = {}
        ensure_calls: list[tuple[str, int | None]] = []

        def ensure_layer(_doc: Any, layer_name: str, color_aci: int | None = None) -> None:
            ensure_calls.append((layer_name, color_aci))

        result = self._run(
            payload={
                "operation": "upsert",
                "sessionId": "S6",
                "clientRouteId": "R6",
                "route": {
                    "ref": "DC-006",
                    "routeType": "conductor",
                    "layerName": "SUITE_WIRE_DC_RD",
                    "colorAci": 1,
                    "path": [{"x": 1, "y": 2}, {"x": 12, "y": 2}, {"x": 12, "y": 15}],
                },
            },
            doc=doc,
            modelspace=modelspace,
            store=store,
            ensure_layer_fn=ensure_layer,
        )

        self.assertTrue(result["success"])
        self.assertIn(("SUITE_WIRE_DC_RD", 1), ensure_calls)
        for handle in store["S6"]["R6"]:
            self.assertEqual(doc.entities[handle].Color, 256)


if __name__ == "__main__":
    unittest.main()
