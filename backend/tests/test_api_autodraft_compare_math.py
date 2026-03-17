from __future__ import annotations

import unittest

from backend.route_groups.api_autodraft import (
    _build_similarity_transform,
    _normalize_tolerance_profile,
    _transform_bounds_to_cad,
)


class TestAutoDraftCompareMath(unittest.TestCase):
    def test_similarity_transform_scale_translation(self) -> None:
        transform, error = _build_similarity_transform(
            pdf_points=[{"x": 0.0, "y": 0.0}, {"x": 10.0, "y": 0.0}],
            cad_points=[{"x": 100.0, "y": 50.0}, {"x": 120.0, "y": 50.0}],
        )
        self.assertIsNone(error)
        self.assertIsNotNone(transform)
        transform_obj = transform or {}
        self.assertAlmostEqual(float(transform_obj.get("scale") or 0), 2.0, places=6)
        self.assertAlmostEqual(float(transform_obj.get("rotation_deg") or 0), 0.0, places=6)
        translation = transform_obj.get("translation") or {}
        self.assertAlmostEqual(float(translation.get("x") or 0), 100.0, places=6)
        self.assertAlmostEqual(float(translation.get("y") or 0), 50.0, places=6)

    def test_transform_bounds_to_cad_applies_rotation_and_scale(self) -> None:
        transform, error = _build_similarity_transform(
            pdf_points=[{"x": 0.0, "y": 0.0}, {"x": 0.0, "y": 10.0}],
            cad_points=[{"x": 0.0, "y": 0.0}, {"x": 20.0, "y": 0.0}],
        )
        self.assertIsNone(error)
        self.assertIsNotNone(transform)
        transformed = _transform_bounds_to_cad(
            {"x": 0.0, "y": 0.0, "width": 2.0, "height": 4.0},
            transform or {},
        )
        self.assertGreater(transformed["width"], 0.0)
        self.assertGreater(transformed["height"], 0.0)

    def test_normalize_tolerance_profile_defaults_medium(self) -> None:
        self.assertEqual(_normalize_tolerance_profile("strict"), "strict")
        self.assertEqual(_normalize_tolerance_profile("loose"), "loose")
        self.assertEqual(_normalize_tolerance_profile("unknown"), "medium")


if __name__ == "__main__":
    unittest.main()
