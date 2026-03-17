from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.route_groups.api_autodraft import (
    _REPLACEMENT_STATUS_AMBIGUOUS,
    _REPLACEMENT_STATUS_RESOLVED,
    _REPLACEMENT_STATUS_UNRESOLVED,
    _build_feedback_learning_examples,
    _export_feedback_data,
    _import_feedback_data,
    _infer_action_replacement,
    _load_replacement_metric_scores,
    _normalize_feedback_items,
    _persist_feedback_items,
    _resolve_replacement_weights,
)


class TestAutoDraftCompareReplacements(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "compare-feedback.sqlite3")
        self.weights = _resolve_replacement_weights({})

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _build_action(self, text: str = "TS416") -> dict:
        return {
            "id": "action-red-1",
            "markup": {
                "id": "annot-8",
                "type": "text",
                "color": "red",
                "text": text,
                "bounds": {"x": 880.0, "y": 900.0, "width": 80.0, "height": 150.0},
                "meta": {
                    "callout_points": [
                        {"x": 900.0, "y": 1035.0},
                        {"x": 945.0, "y": 1004.0},
                        {"x": 945.0, "y": 975.0},
                    ]
                },
            },
        }

    def test_infer_action_replacement_resolved(self) -> None:
        replacement = _infer_action_replacement(
            action=self._build_action(),
            text_entities=[
                {
                    "id": "E-TS410",
                    "text": "TS410",
                    "bounds": {"x": 936.0, "y": 968.0, "width": 24.0, "height": 14.0},
                },
                {
                    "id": "E-TS402",
                    "text": "TS402",
                    "bounds": {"x": 1010.0, "y": 910.0, "width": 24.0, "height": 14.0},
                },
            ],
            weights=self.weights,
            db_path=self.db_path,
        )
        self.assertIsNotNone(replacement)
        replacement_obj = replacement or {}
        self.assertEqual(replacement_obj.get("new_text"), "TS416")
        self.assertEqual(replacement_obj.get("old_text"), "TS410")
        self.assertEqual(replacement_obj.get("target_entity_id"), "E-TS410")
        self.assertEqual(replacement_obj.get("status"), _REPLACEMENT_STATUS_RESOLVED)
        self.assertGreater(float(replacement_obj.get("confidence") or 0.0), 0.36)

    def test_infer_action_replacement_respects_tuning_thresholds(self) -> None:
        replacement = _infer_action_replacement(
            action=self._build_action(),
            text_entities=[
                {
                    "id": "E-TS410",
                    "text": "TS410",
                    "bounds": {"x": 936.0, "y": 968.0, "width": 24.0, "height": 14.0},
                },
                {
                    "id": "E-TS402",
                    "text": "TS402",
                    "bounds": {"x": 1010.0, "y": 910.0, "width": 24.0, "height": 14.0},
                },
            ],
            weights=self.weights,
            db_path=self.db_path,
            tuning={
                "unresolved_confidence_threshold": 0.0,
                "ambiguity_margin_threshold": 1.0,
                "search_radius_multiplier": 2.5,
                "min_search_radius": 24,
            },
        )
        self.assertIsNotNone(replacement)
        replacement_obj = replacement or {}
        self.assertEqual(replacement_obj.get("status"), _REPLACEMENT_STATUS_AMBIGUOUS)

    def test_infer_action_replacement_ambiguous_when_scores_tie(self) -> None:
        replacement = _infer_action_replacement(
            action=self._build_action(),
            text_entities=[
                {
                    "id": "E-TS410",
                    "text": "TS410",
                    "bounds": {"x": 936.0, "y": 968.0, "width": 24.0, "height": 14.0},
                },
                {
                    "id": "E-TS402",
                    "text": "TS402",
                    "bounds": {"x": 936.0, "y": 968.0, "width": 24.0, "height": 14.0},
                },
            ],
            weights=self.weights,
            db_path=self.db_path,
        )
        self.assertIsNotNone(replacement)
        replacement_obj = replacement or {}
        self.assertEqual(replacement_obj.get("status"), _REPLACEMENT_STATUS_AMBIGUOUS)
        self.assertEqual(len(replacement_obj.get("candidates") or []), 2)

    def test_infer_action_replacement_unresolved_without_candidates(self) -> None:
        replacement = _infer_action_replacement(
            action=self._build_action(),
            text_entities=[],
            weights=self.weights,
            db_path=self.db_path,
        )
        self.assertIsNotNone(replacement)
        replacement_obj = replacement or {}
        self.assertEqual(replacement_obj.get("status"), _REPLACEMENT_STATUS_UNRESOLVED)
        self.assertEqual(replacement_obj.get("target_entity_id"), None)
        self.assertEqual(replacement_obj.get("old_text"), None)

    def test_infer_action_replacement_applies_bounded_agent_boost(self) -> None:
        replacement = _infer_action_replacement(
            action=self._build_action(),
            text_entities=[
                {
                    "id": "E-TS410",
                    "text": "TS410",
                    "bounds": {"x": 936.0, "y": 968.0, "width": 24.0, "height": 14.0},
                },
                {
                    "id": "E-TS402",
                    "text": "TS402",
                    "bounds": {"x": 1010.0, "y": 910.0, "width": 24.0, "height": 14.0},
                },
            ],
            weights=self.weights,
            db_path=self.db_path,
            agent_hint={
                "candidate_boosts": {
                    "E-TS410": 0.5,
                },
                "rationale": "Proximity + tag family fit",
            },
        )
        self.assertIsNotNone(replacement)
        replacement_obj = replacement or {}
        candidates = replacement_obj.get("candidates") or []
        self.assertGreaterEqual(len(candidates), 1)
        first = candidates[0] or {}
        score_components = first.get("score_components") or {}
        self.assertIn("agent_boost", score_components)
        self.assertLessEqual(float(score_components.get("agent_boost") or 0.0), 0.12)

    def test_feedback_store_export_import_round_trip(self) -> None:
        stored = _persist_feedback_items(
            db_path=self.db_path,
            items=[
                {
                    "request_id": "req-compare-1",
                    "action_id": "action-red-1",
                    "review_status": "corrected",
                    "new_text": "TS416",
                    "selected_old_text": "TS410",
                    "selected_entity_id": "E-TS410",
                    "confidence": 0.71,
                    "note": "Verified by operator.",
                    "candidates": [
                        {
                            "entity_id": "E-TS410",
                            "text": "TS410",
                            "score": 0.71,
                            "distance": 8.0,
                            "pointer_hit": True,
                            "overlap": False,
                            "pair_hit_count": 0,
                        }
                    ],
                    "selected_candidate": {
                        "entity_id": "E-TS410",
                        "text": "TS410",
                        "score": 0.71,
                        "distance": 8.0,
                        "pointer_hit": True,
                        "overlap": False,
                        "pair_hit_count": 0,
                    },
                }
            ],
        )
        self.assertEqual(stored, 1)

        exported = _export_feedback_data(db_path=self.db_path)
        self.assertGreaterEqual(len(exported.get("events") or []), 1)
        self.assertGreaterEqual(len(exported.get("pairs") or []), 1)
        self.assertGreaterEqual(len(exported.get("metrics") or []), 1)

        imported = _import_feedback_data(
            db_path=self.db_path,
            payload={
                "events": exported.get("events") or [],
                "pairs": exported.get("pairs") or [],
                "metrics": exported.get("metrics") or [],
            },
            mode="replace",
        )
        self.assertGreaterEqual(int(imported.get("events") or 0), 1)
        self.assertGreaterEqual(int(imported.get("pairs") or 0), 1)
        self.assertGreaterEqual(int(imported.get("metrics") or 0), 1)

        scores = _load_replacement_metric_scores(self.db_path)
        self.assertIn("pointer_hit", scores)
        self.assertIn("overlap", scores)

    def test_build_feedback_learning_examples_uses_native_markup_review_labels(self) -> None:
        items = _normalize_feedback_items(
            {
                "items": [
                    {
                        "request_id": "req-compare-1",
                        "action_id": "action-note-1",
                        "review_status": "approved",
                        "feedback_type": "markup_learning",
                        "new_text": "VERIFY FEEDER TAG",
                        "markup_id": "annot-note-1",
                        "markup": {
                            "id": "annot-note-1",
                            "type": "text",
                            "color": "blue",
                            "text": "VERIFY FEEDER TAG",
                            "bounds": {"x": 20, "y": 30, "width": 60, "height": 18},
                            "meta": {
                                "subtype": "/FreeText",
                                "page_position": {"x": 50, "y": 39},
                            },
                        },
                        "predicted_category": "NOTE",
                    }
                ]
            }
        )
        examples = _build_feedback_learning_examples(items=items)
        markup_examples = examples.get("autodraft_markup") or []
        self.assertEqual(len(markup_examples), 1)
        first = markup_examples[0] or {}
        self.assertEqual(first.get("label"), "NOTE")
        self.assertEqual(first.get("text"), "VERIFY FEEDER TAG")
        metadata = first.get("metadata") or {}
        self.assertEqual(metadata.get("predicted_category"), "NOTE")


if __name__ == "__main__":
    unittest.main()
