from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.benchmarks import autodraft_learning_benchmark as bench
from backend.route_groups.api_local_learning_runtime import LocalLearningRuntime


def _build_markup_examples() -> list[dict]:
    return [
        {
            "label": "NOTE",
            "text": "VERIFY FEEDER TAG",
            "features": {"color": "blue", "markup_type": "text", "page_zone": "center"},
        },
        {
            "label": "NOTE",
            "text": "CHECK PANEL SCHEDULE",
            "features": {"color": "blue", "markup_type": "text", "page_zone": "top"},
        },
        {
            "label": "NOTE",
            "text": "SEE DWG E2.1",
            "features": {"color": "yellow", "markup_type": "text", "page_zone": "right"},
        },
        {
            "label": "ADD",
            "text": "INSTALL NEW TAG",
            "features": {"color": "red", "markup_type": "arrow", "page_zone": "center"},
        },
        {
            "label": "ADD",
            "text": "PROVIDE NEW DEVICE",
            "features": {"color": "red", "markup_type": "cloud", "page_zone": "left"},
        },
        {
            "label": "ADD",
            "text": "ADD TERMINAL BLOCK",
            "features": {"color": "red", "markup_type": "text", "page_zone": "bottom"},
        },
    ]


def _build_replacement_examples() -> list[dict]:
    return [
        {
            "label": "selected",
            "text": "TS416",
            "features": {
                "distance": 5.0,
                "pointer_hit": 1.0,
                "overlap": 0.0,
                "pair_hit_count": 1.0,
                "text_similarity": 0.92,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 2.0,
                "base_score": 0.61,
                "final_score": 0.61,
                "markup_width": 40.0,
                "markup_height": 18.0,
            },
        },
        {
            "label": "selected",
            "text": "TS500",
            "features": {
                "distance": 6.0,
                "pointer_hit": 1.0,
                "overlap": 0.0,
                "pair_hit_count": 2.0,
                "text_similarity": 0.88,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 3.0,
                "base_score": 0.63,
                "final_score": 0.63,
                "markup_width": 36.0,
                "markup_height": 16.0,
            },
        },
        {
            "label": "selected",
            "text": "TB101",
            "features": {
                "distance": 4.0,
                "pointer_hit": 1.0,
                "overlap": 1.0,
                "pair_hit_count": 1.0,
                "text_similarity": 0.95,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 2.0,
                "base_score": 0.69,
                "final_score": 0.69,
                "markup_width": 32.0,
                "markup_height": 14.0,
            },
        },
        {
            "label": "selected",
            "text": "TS700",
            "features": {
                "distance": 7.0,
                "pointer_hit": 1.0,
                "overlap": 0.0,
                "pair_hit_count": 0.0,
                "text_similarity": 0.81,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 4.0,
                "base_score": 0.57,
                "final_score": 0.57,
                "markup_width": 42.0,
                "markup_height": 19.0,
            },
        },
        {
            "label": "not_selected",
            "text": "TS410",
            "features": {
                "distance": 18.0,
                "pointer_hit": 0.0,
                "overlap": 0.0,
                "pair_hit_count": 0.0,
                "text_similarity": 0.34,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 3.0,
                "base_score": 0.22,
                "final_score": 0.22,
                "markup_width": 40.0,
                "markup_height": 18.0,
            },
        },
        {
            "label": "not_selected",
            "text": "TS402",
            "features": {
                "distance": 20.0,
                "pointer_hit": 0.0,
                "overlap": 0.0,
                "pair_hit_count": 0.0,
                "text_similarity": 0.28,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 3.0,
                "base_score": 0.18,
                "final_score": 0.18,
                "markup_width": 40.0,
                "markup_height": 18.0,
            },
        },
        {
            "label": "not_selected",
            "text": "TS401",
            "features": {
                "distance": 17.0,
                "pointer_hit": 0.0,
                "overlap": 0.0,
                "pair_hit_count": 0.0,
                "text_similarity": 0.31,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 4.0,
                "base_score": 0.24,
                "final_score": 0.24,
                "markup_width": 38.0,
                "markup_height": 17.0,
            },
        },
        {
            "label": "not_selected",
            "text": "TS305",
            "features": {
                "distance": 21.0,
                "pointer_hit": 0.0,
                "overlap": 0.0,
                "pair_hit_count": 0.0,
                "text_similarity": 0.22,
                "same_color": 1.0,
                "same_type": 1.0,
                "cad_entity_count": 4.0,
                "base_score": 0.15,
                "final_score": 0.15,
                "markup_width": 38.0,
                "markup_height": 17.0,
            },
        },
    ]


class TestAutoDraftLearningBenchmarkHarness(unittest.TestCase):
    def _write_bundle(self, directory: str, name: str, bundle: dict) -> Path:
        path = Path(directory) / name
        path.write_text(json.dumps(bundle), encoding="utf-8")
        return path

    def test_load_reviewed_run_bundles_reads_single_bundle_file(self) -> None:
        bundle = {
            "schema": "autodraft_reviewed_run.v1",
            "bundle_id": "req-1:1:20260317T020000Z",
            "request_id": "req-1",
            "feedback": {"items": []},
            "learning_examples": {},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = self._write_bundle(temp_dir, "bundle.json", bundle)
            loaded = bench.load_reviewed_run_bundles([path])
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0].get("bundle_id"), "req-1:1:20260317T020000Z")

    def test_import_reviewed_run_bundles_records_examples_and_skips_duplicates(self) -> None:
        bundle = {
            "schema": "autodraft_reviewed_run.v1",
            "bundle_id": "req-2:1:20260317T020000Z",
            "request_id": "req-2",
            "feedback": {
                "items": [
                    {
                        "request_id": "req-2",
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
                        },
                        "predicted_category": "NOTE",
                    }
                ]
            },
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime = LocalLearningRuntime(base_dir=Path(temp_dir) / ".learning")
            feedback_db_path = str(Path(temp_dir) / "compare-feedback.sqlite3")
            report = bench.import_reviewed_run_bundles(
                bundles=[bundle],
                runtime=runtime,
                feedback_db_path=feedback_db_path,
            )
            self.assertEqual(report.get("importedCount"), 1)
            markup_examples = runtime._load_examples("autodraft_markup")
            self.assertEqual(len(markup_examples), 1)

            duplicate_report = bench.import_reviewed_run_bundles(
                bundles=[bundle],
                runtime=runtime,
                feedback_db_path=feedback_db_path,
            )
            self.assertEqual(duplicate_report.get("skippedCount"), 1)

    def test_benchmark_reviewed_run_bundles_uses_active_models(self) -> None:
        markup_examples = _build_markup_examples()
        replacement_examples = _build_replacement_examples()
        bundle = {
            "schema": "autodraft_reviewed_run.v1",
            "bundle_id": "req-3:2:20260317T020000Z",
            "request_id": "req-3",
            "feedback": {"items": []},
            "learning_examples": {
                "autodraft_markup": markup_examples,
                "autodraft_replacement": replacement_examples,
            },
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime = LocalLearningRuntime(base_dir=Path(temp_dir) / ".learning")
            runtime.record_examples(domain="autodraft_markup", examples=markup_examples)
            runtime.record_examples(
                domain="autodraft_replacement",
                examples=replacement_examples,
            )
            runtime.train_domain(domain="autodraft_markup")
            runtime.train_domain(domain="autodraft_replacement")

            report = bench.benchmark_reviewed_run_bundles(
                bundles=[bundle],
                runtime=runtime,
            )

        self.assertEqual(report.get("kind"), "reviewed_run_benchmark")
        self.assertEqual(report.get("bundleCount"), 1)
        results = report.get("results") or []
        self.assertEqual(len(results), 2)
        domains = {entry.get("domain"): entry for entry in results}
        self.assertTrue(domains["autodraft_markup"].get("ok"))
        self.assertTrue(domains["autodraft_replacement"].get("ok"))
        self.assertGreater(float((domains["autodraft_markup"].get("metrics") or {}).get("coverage") or 0), 0)
        self.assertGreater(float((domains["autodraft_replacement"].get("metrics") or {}).get("coverage") or 0), 0)


if __name__ == "__main__":
    unittest.main()
