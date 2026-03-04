from __future__ import annotations

import unittest

from backend.route_groups.api_autocad_entity_geometry import (
    entity_bbox,
    entity_center,
    poly_centroid,
)


class _BBoxEntity:
    def __init__(self, minimum, maximum) -> None:
        self._minimum = minimum
        self._maximum = maximum
        self.ObjectName = "AcDbBlockReference"

    def GetBoundingBox(self):
        return self._minimum, self._maximum


class _Polyline2DEntity:
    ObjectName = "AcDbPolyline"
    Coordinates = [0, 0, 10, 0, 10, 10, 0, 10]
    Elevation = 5


class _Polyline3DEntity:
    ObjectName = "AcDb3dPolyline"
    Coordinates = [0, 0, 0, 6, 0, 3, 6, 6, 6]


class _FallbackPolylineEntity:
    ObjectName = "AcDb2dPolyline"
    NumberOfVertices = 2
    Elevation = 7

    @property
    def Coordinates(self):
        raise RuntimeError("coordinates unavailable")

    def Coordinate(self, index):
        if index == 0:
            return (1, 1)
        return (3, 5)


class _BrokenEntity:
    ObjectName = "AcDbBlockReference"

    def GetBoundingBox(self):
        raise RuntimeError("no bbox")


class TestApiAutocadEntityGeometry(unittest.TestCase):
    def test_entity_bbox_normalizes_axis_order(self) -> None:
        bbox = entity_bbox(
            _BBoxEntity((9, 8, 7), (1, 2, 3)),
            dyn_fn=lambda value: value,
        )
        self.assertEqual(bbox, (1.0, 2.0, 3.0, 9.0, 8.0, 7.0))

    def test_entity_bbox_returns_none_on_error(self) -> None:
        self.assertIsNone(entity_bbox(_BrokenEntity(), dyn_fn=lambda value: value))

    def test_poly_centroid_2d_coordinates_uses_elevation(self) -> None:
        centroid = poly_centroid(_Polyline2DEntity(), dyn_fn=lambda value: value)
        self.assertEqual(centroid, (5.0, 5.0, 5.0))

    def test_poly_centroid_3d_coordinates(self) -> None:
        centroid = poly_centroid(_Polyline3DEntity(), dyn_fn=lambda value: value)
        self.assertEqual(centroid, (4.0, 2.0, 3.0))

    def test_poly_centroid_fallback_vertex_api(self) -> None:
        centroid = poly_centroid(_FallbackPolylineEntity(), dyn_fn=lambda value: value)
        self.assertEqual(centroid, (2.0, 3.0, 7.0))

    def test_entity_center_prefers_poly_centroid_for_polyline(self) -> None:
        center = entity_center(_Polyline2DEntity(), dyn_fn=lambda value: value)
        self.assertEqual(center, (5.0, 5.0, 5.0))

    def test_entity_center_uses_bbox_for_non_polyline(self) -> None:
        center = entity_center(
            _BBoxEntity((0, 2, 0), (4, 6, 8)),
            dyn_fn=lambda value: value,
        )
        self.assertEqual(center, (2.0, 4.0, 4.0))


if __name__ == "__main__":
    unittest.main()
