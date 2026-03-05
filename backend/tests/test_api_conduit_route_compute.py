from __future__ import annotations

import unittest

from backend.route_groups.api_conduit_route_compute import compute_conduit_route


class TestApiConduitRouteCompute(unittest.TestCase):
    def test_compute_route_success(self) -> None:
        payload = {
            "start": {"x": 52, "y": 82},
            "end": {"x": 900, "y": 480},
            "mode": "plan_view",
            "clearance": 18,
            "canvasWidth": 980,
            "canvasHeight": 560,
            "gridStep": 8,
            "obstacles": [
                {
                    "id": "FNDN-1",
                    "type": "foundation",
                    "x": 320,
                    "y": 180,
                    "w": 180,
                    "h": 120,
                    "label": "Transformer Foundation",
                }
            ],
        }

        result = compute_conduit_route(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["code"], "")
        self.assertGreater(len(result["data"]["path"]), 1)
        self.assertGreater(result["data"]["length"], 0)
        self.assertIn("computeMs", result["meta"])
        self.assertIn("fallbackUsed", result["meta"])

    def test_compute_route_invalid_mode_rejected(self) -> None:
        payload = {
            "start": {"x": 10, "y": 10},
            "end": {"x": 50, "y": 50},
            "mode": "diagonal",
        }

        result = compute_conduit_route(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], "INVALID_REQUEST")

    def test_compute_route_cable_tag_returns_tag_payload(self) -> None:
        payload = {
            "start": {"x": 120, "y": 120},
            "end": {"x": 840, "y": 120},
            "mode": "cable_tag",
            "tagText": "AC-001 Z01",
            "obstacles": [],
        }

        result = compute_conduit_route(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["tag"]["text"], "AC-001 Z01")
        self.assertIn("position", result["data"]["tag"])

    def test_compute_route_falls_back_when_grid_is_fully_blocked(self) -> None:
        payload = {
            "start": {"x": 20, "y": 20},
            "end": {"x": 940, "y": 520},
            "mode": "plan_view",
            "clearance": 0,
            "canvasWidth": 980,
            "canvasHeight": 560,
            "gridStep": 8,
            "obstacles": [
                {
                    "id": "BLOCK-ALL",
                    "type": "foundation",
                    "x": 0,
                    "y": 0,
                    "w": 980,
                    "h": 560,
                    "label": "Hard Keepout",
                }
            ],
        }

        result = compute_conduit_route(payload)

        self.assertTrue(result["success"])
        self.assertTrue(result["meta"]["fallbackUsed"])
        self.assertEqual(len(result["data"]["path"]), 4)


if __name__ == "__main__":
    unittest.main()
