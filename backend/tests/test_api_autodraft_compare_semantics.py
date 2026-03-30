from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.route_groups.api_local_learning_runtime import LocalModelPrediction
from backend.route_groups.api_autodraft import (
    _build_autodraft_preview_operations,
    _build_local_backcheck,
    _build_local_plan,
    _extract_annotation_color,
)


class TestAutoDraftCompareSemantics(unittest.TestCase):
    def test_build_preview_operations_promotes_native_line_markup_to_geometry_add(self) -> None:
        operations = _build_autodraft_preview_operations(
            actions=[
                {
                    "id": "action-add-line",
                    "category": "ADD",
                    "markup": {
                        "id": "annot-line-1",
                        "type": "line",
                        "text": "",
                        "bounds": {"x": 10.0, "y": 20.0, "width": 40.0, "height": 0.5},
                        "meta": {
                            "subtype": "/Line",
                            "line_points": [
                                {"x": 10.0, "y": 20.0},
                                {"x": 50.0, "y": 20.0},
                            ],
                            "callout_points": [
                                {"x": 10.0, "y": 20.0},
                                {"x": 50.0, "y": 20.0},
                            ],
                        },
                        "recognition": {
                            "feature_source": "pdf_annotations",
                            "needs_review": False,
                        },
                    },
                }
            ],
            cad_context=None,
        )

        geometry_add = next(
            operation
            for operation in operations
            if (operation or {}).get("operationType") == "geometry-add"
        )
        self.assertTrue(geometry_add.get("approved"))
        self.assertEqual((geometry_add.get("nativePayload") or {}).get("contractVersion"), "bluebeam-default.v1")
        self.assertEqual(
            ((geometry_add.get("nativePayload") or {}).get("geometry") or {}).get("kind"),
            "line",
        )

    def test_build_preview_operations_deletes_only_explicit_geometric_targets(self) -> None:
        operations = _build_autodraft_preview_operations(
            actions=[
                {
                    "id": "action-delete-geometry",
                    "category": "DELETE",
                    "markup": {
                        "id": "annot-delete-1",
                        "type": "cloud",
                        "text": "delete old line",
                        "bounds": {"x": 95.0, "y": 95.0, "width": 25.0, "height": 25.0},
                        "meta": {
                            "subtype": "/Square",
                            "callout_points": [
                                {"x": 95.0, "y": 95.0},
                                {"x": 120.0, "y": 120.0},
                            ],
                        },
                        "recognition": {
                            "feature_source": "pdf_annotations",
                            "needs_review": False,
                        },
                    },
                }
            ],
            cad_context={
                "entities": [
                    {
                        "id": "ABCD",
                        "entity_type": "Polyline",
                        "bounds": {"x": 100.0, "y": 100.0, "width": 10.0, "height": 5.0},
                    },
                    {
                        "id": "TEXT1",
                        "entity_type": "DBText",
                        "bounds": {"x": 102.0, "y": 102.0, "width": 8.0, "height": 2.0},
                    },
                ]
            },
        )

        geometry_delete = next(
            operation
            for operation in operations
            if (operation or {}).get("operationType") == "geometry-delete"
        )
        self.assertTrue(geometry_delete.get("approved"))
        self.assertEqual(geometry_delete.get("targetHandleRefs"), ["ABCD"])
        delete_targets = ((geometry_delete.get("nativePayload") or {}).get("deleteTargets") or [])
        self.assertEqual(len(delete_targets), 1)
        self.assertEqual((delete_targets[0] or {}).get("id"), "ABCD")

    def test_extract_annotation_color_prefers_c_over_other_sources(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": [0.0, 1.0, 0.0],
                "/DA": "1 0 0 rg /Helv 12 Tf",
                "/DS": "color:#0000FF",
            }
        )
        self.assertEqual(color_name, "green")
        self.assertEqual(color_source, "C")
        self.assertEqual(color_hex, "#00FF00")
        self.assertEqual(rgb, (0.0, 1.0, 0.0))

    def test_extract_annotation_color_uses_da_when_c_is_empty(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": [],
                "/DA": "1 0 0 rg /Helv 12 Tf",
            }
        )
        self.assertEqual(color_name, "red")
        self.assertEqual(color_source, "DA")
        self.assertEqual(color_hex, "#FF0000")
        self.assertEqual(rgb, (1.0, 0.0, 0.0))

    def test_extract_annotation_color_uses_ds_hex_fallback(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": [],
                "/DS": "font: Helvetica 12pt; color:#0000FF",
            }
        )
        self.assertEqual(color_name, "blue")
        self.assertEqual(color_source, "DS")
        self.assertEqual(color_hex, "#0000FF")
        self.assertEqual(rgb, (0.0, 0.0, 1.0))

    def test_extract_annotation_color_uses_rc_css_rgb_fallback(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": [],
                "/DA": "",
                "/DS": "font: Helvetica 12pt",
                "/RC": "<body style='font:12pt Helvetica;color:rgb(255,0,0)'>x</body>",
            }
        )
        self.assertEqual(color_name, "red")
        self.assertEqual(color_source, "RC")
        self.assertEqual(color_hex, "#FF0000")
        self.assertEqual(rgb, (1.0, 0.0, 0.0))

    def test_extract_annotation_color_unknown_for_invalid_values(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": "not-a-color-array",
                "/DA": "foo bar",
                "/DS": "font: Helvetica 12pt",
            }
        )
        self.assertEqual(color_name, "unknown")
        self.assertIsNone(rgb)
        self.assertIsNone(color_hex)
        self.assertEqual(color_source, "unknown")

    def test_extract_annotation_color_uses_ic_fill_fallback(self) -> None:
        color_name, rgb, color_hex, color_source = _extract_annotation_color(
            {
                "/C": [],
                "/IC": [1.0, 1.0, 0.0],
            }
        )
        self.assertEqual(color_name, "yellow")
        self.assertEqual(color_source, "IC")
        self.assertEqual(color_hex, "#FFFF00")
        self.assertEqual(rgb, (1.0, 1.0, 0.0))

    def test_build_local_plan_pairs_blue_note_with_blue_rectangle(self) -> None:
        plan = _build_local_plan(
            [
                {
                    "id": "annot-note",
                    "type": "text",
                    "color": "blue",
                    "text": "Add termination cabinet terminal blocks",
                    "bounds": {"x": 100.0, "y": 100.0, "width": 120.0, "height": 80.0},
                    "meta": {
                        "subtype": "/FreeText",
                        "callout_points": [{"x": 210.0, "y": 160.0}],
                    },
                },
                {
                    "id": "annot-rect",
                    "type": "cloud",
                    "color": "blue",
                    "text": "Rectangle",
                    "bounds": {"x": 205.0, "y": 150.0, "width": 60.0, "height": 50.0},
                    "meta": {"subtype": "/Square"},
                },
            ]
        )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("category"), "NOTE")
        self.assertEqual(first.get("status"), "proposed")
        paired_ids = first.get("paired_annotation_ids") or []
        self.assertEqual(paired_ids, ["annot-note", "annot-rect"])

    def test_build_local_plan_pairs_red_callout_note_with_same_color_anchor(self) -> None:
        plan = _build_local_plan(
            [
                {
                    "id": "annot-note",
                    "type": "text",
                    "color": "red",
                    "text": "Install new disconnect",
                    "bounds": {"x": 60.0, "y": 60.0, "width": 120.0, "height": 42.0},
                    "meta": {
                        "subtype": "/FreeText",
                        "callout_points": [{"x": 200.0, "y": 92.0}],
                    },
                },
                {
                    "id": "annot-anchor",
                    "type": "rectangle",
                    "color": "red",
                    "text": "",
                    "bounds": {"x": 188.0, "y": 82.0, "width": 40.0, "height": 28.0},
                    "meta": {"subtype": "/Square"},
                },
            ]
        )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("category"), "ADD")
        self.assertEqual(first.get("paired_annotation_ids"), ["annot-note", "annot-anchor"])

    def test_build_local_plan_matches_title_block_rectangle_rule(self) -> None:
        plan = _build_local_plan(
            [
                {
                    "id": "annot-title-block",
                    "type": "rectangle",
                    "color": "black",
                    "text": "Drawing No. E-101",
                    "bounds": {"x": 250.0, "y": 10.0, "width": 135.0, "height": 28.0},
                    "meta": {
                        "subtype": "/Square",
                        "page_width": 400.0,
                        "page_height": 200.0,
                    },
                }
            ]
        )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("rule_id"), "title-block-rect")
        self.assertEqual(first.get("category"), "TITLE_BLOCK")

    def test_build_local_plan_matches_two_blue_arrows_to_swap_rule(self) -> None:
        plan = _build_local_plan(
            [
                {
                    "id": "annot-arrow-a",
                    "type": "arrow",
                    "color": "blue",
                    "text": "",
                    "bounds": {"x": 20.0, "y": 20.0, "width": 40.0, "height": 12.0},
                },
                {
                    "id": "annot-arrow-b",
                    "type": "arrow",
                    "color": "blue",
                    "text": "",
                    "bounds": {"x": 100.0, "y": 50.0, "width": 40.0, "height": 12.0},
                },
            ]
        )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 2)
        self.assertTrue(all((action or {}).get("rule_id") == "swap-blue-arrows" for action in actions))
        self.assertTrue(all((action or {}).get("category") == "SWAP" for action in actions))

    def test_build_local_plan_applies_color_defaults_and_keyword_override(self) -> None:
        plan = _build_local_plan(
            [
                {
                    "id": "annot-red-text",
                    "type": "text",
                    "color": "red",
                    "text": "TS416",
                    "bounds": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 5.0},
                },
                {
                    "id": "annot-green-highlight",
                    "type": "cloud",
                    "color": "green",
                    "text": "Highlight",
                    "bounds": {"x": 15.0, "y": 20.0, "width": 30.0, "height": 15.0},
                },
                {
                    "id": "annot-red-delete",
                    "type": "text",
                    "color": "red",
                    "text": "delete feeder",
                    "bounds": {"x": 40.0, "y": 30.0, "width": 20.0, "height": 10.0},
                },
            ]
        )
        actions = plan.get("actions") or []
        self.assertEqual((actions[0] or {}).get("category"), "ADD")
        self.assertEqual((actions[1] or {}).get("category"), "DELETE")
        self.assertEqual((actions[2] or {}).get("category"), "DELETE")

    def test_build_local_plan_uses_local_model_for_ambiguous_native_markup(self) -> None:
        with patch(
            "backend.route_groups.api_autodraft._LOCAL_LEARNING_RUNTIME.predict_text_domain",
            return_value=LocalModelPrediction(
                label="ADD",
                confidence=0.73,
                model_version="20260317T010000Z",
                feature_source="text+structured_tokens",
                source="local_model",
                reason_codes=["local_model_prediction"],
            ),
        ):
            plan = _build_local_plan(
                [
                    {
                        "id": "annot-model-add",
                        "type": "text",
                        "color": "black",
                        "text": "TS416",
                        "bounds": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 5.0},
                        "meta": {"subtype": "/FreeText"},
                    }
                ]
            )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("rule_id"), "semantic-recognition-local_model-add")
        self.assertEqual(first.get("category"), "ADD")
        self.assertEqual(first.get("status"), "proposed")
        self.assertAlmostEqual(float(first.get("confidence") or 0.0), 0.73, places=6)

    def test_build_local_plan_local_model_overrides_low_signal_blue_note_rule(self) -> None:
        with patch(
            "backend.route_groups.api_autodraft._LOCAL_LEARNING_RUNTIME.predict_text_domain",
            return_value=LocalModelPrediction(
                label="ADD",
                confidence=0.91,
                model_version="20260317T010000Z",
                feature_source="text+structured_tokens",
                source="local_model",
                reason_codes=["local_model_prediction"],
            ),
        ):
            plan = _build_local_plan(
                [
                    {
                        "id": "annot-blue-text",
                        "type": "text",
                        "color": "blue",
                        "text": "TS416",
                        "bounds": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 5.0},
                        "meta": {"subtype": "/FreeText"},
                    }
                ]
            )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("rule_id"), "semantic-recognition-local_model-add")
        self.assertEqual(first.get("category"), "ADD")
        self.assertEqual(first.get("status"), "proposed")
        self.assertAlmostEqual(float(first.get("confidence") or 0.0), 0.91, places=6)

    def test_build_local_plan_keeps_title_block_rule_over_local_model(self) -> None:
        with patch(
            "backend.route_groups.api_autodraft._LOCAL_LEARNING_RUNTIME.predict_text_domain",
            return_value=LocalModelPrediction(
                label="ADD",
                confidence=0.95,
                model_version="20260317T010000Z",
                feature_source="text+structured_tokens",
                source="local_model",
                reason_codes=["local_model_prediction"],
            ),
        ):
            plan = _build_local_plan(
                [
                    {
                        "id": "annot-title-block",
                        "type": "rectangle",
                        "color": "black",
                        "text": "Drawing No. E-101",
                        "bounds": {"x": 250.0, "y": 10.0, "width": 135.0, "height": 28.0},
                        "meta": {
                            "subtype": "/Square",
                            "page_width": 400.0,
                            "page_height": 200.0,
                        },
                    }
                ]
            )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("rule_id"), "title-block-rect")
        self.assertEqual(first.get("category"), "TITLE_BLOCK")

    def test_build_local_plan_model_guidance_still_requires_review_when_recognition_does(self) -> None:
        with patch(
            "backend.route_groups.api_autodraft._LOCAL_LEARNING_RUNTIME.predict_text_domain",
            return_value=LocalModelPrediction(
                label="ADD",
                confidence=0.94,
                model_version="20260317T010000Z",
                feature_source="text+structured_tokens",
                source="local_model",
                reason_codes=["local_model_prediction"],
            ),
        ):
            plan = _build_local_plan(
                [
                    {
                        "id": "annot-unknown-color",
                        "type": "text",
                        "color": "unknown",
                        "text": "TS416",
                        "bounds": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 5.0},
                        "meta": {"subtype": "/FreeText"},
                    }
                ]
            )
        actions = plan.get("actions") or []
        self.assertEqual(len(actions), 1)
        first = actions[0] or {}
        self.assertEqual(first.get("rule_id"), "semantic-recognition-local_model-add")
        self.assertEqual(first.get("category"), "ADD")
        self.assertEqual(first.get("status"), "needs_review")

    def test_backcheck_note_unfulfilled_is_warn_and_keeps_pair_ids(self) -> None:
        backcheck = _build_local_backcheck(
            actions=[
                {
                    "id": "action-1",
                    "rule_id": "semantic-color-blue",
                    "category": "NOTE",
                    "confidence": 0.8,
                    "status": "proposed",
                    "paired_annotation_ids": ["annot-note", "annot-rect"],
                    "markup": {
                        "type": "text",
                        "color": "blue",
                        "bounds": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 10.0},
                    },
                }
            ],
            cad_context={"drawing": {"name": "sample.dwg"}},
            request_id="req-test",
            cad_context_source="live",
            geometry_tolerance=0.0,
        )
        findings = backcheck.get("findings") or []
        self.assertEqual(len(findings), 1)
        finding = findings[0] or {}
        self.assertEqual(finding.get("status"), "warn")
        self.assertEqual(
            finding.get("paired_annotation_ids"),
            ["annot-note", "annot-rect"],
        )


if __name__ == "__main__":
    unittest.main()
