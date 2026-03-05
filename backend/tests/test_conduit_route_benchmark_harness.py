from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.benchmarks import conduit_route_benchmark as bench


class TestConduitRouteBenchmarkHarness(unittest.TestCase):
    def test_parse_entity_counts(self) -> None:
        parsed = bench.parse_entity_counts("10000, 50000,100000")
        self.assertEqual(parsed, [10000, 50000, 100000])

    def test_parse_entity_counts_rejects_invalid(self) -> None:
        with self.assertRaises(ValueError):
            bench.parse_entity_counts("100,zero,500")

    def test_run_synthetic_suite_small(self) -> None:
        report = bench.run_synthetic_suite(
            entity_counts=[200],
            iterations=1,
            seed=7,
            scenario="all",
        )
        self.assertEqual(report.get("kind"), "synthetic")
        results = report.get("results") or []
        self.assertGreaterEqual(len(results), 3)

    def test_replay_suite_compute_entry(self) -> None:
        entries = [
            {
                "name": "compute-case",
                "kind": "compute",
                "payload": {
                    "start": {"x": 10, "y": 10},
                    "end": {"x": 200, "y": 200},
                    "mode": "plan_view",
                    "obstacles": [],
                },
            }
        ]
        report = bench.run_replay_suite(entries=entries, iterations=1, strict=True)
        self.assertEqual(report.get("kind"), "replay")
        results = report.get("results") or []
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].get("failureCount"), 0)

    def test_replay_suite_non_strict_skips_invalid_entry(self) -> None:
        entries = [
            {
                "name": "bad-obstacle",
                "kind": "obstacle_scan",
                "document": {"name": "sample.dwg", "units": 2},
                "scanRequest": {"maxEntities": 100},
            }
        ]
        report = bench.run_replay_suite(entries=entries, iterations=1, strict=False)
        self.assertEqual(report.get("kind"), "replay")
        self.assertEqual(report.get("executedCount"), 0)
        self.assertEqual(report.get("skippedCount"), 1)
        self.assertEqual(len(report.get("results") or []), 0)

    def test_replay_suite_strict_invalid_entry_raises(self) -> None:
        entries = [
            {
                "name": "bad-terminal",
                "kind": "terminal_scan",
                "document": {"name": "sample.dwg", "units": 2},
                "scanRequest": {"maxEntities": 100},
            }
        ]
        with self.assertRaises(ValueError):
            bench.run_replay_suite(entries=entries, iterations=1, strict=True)

    def test_load_replay_entries_from_template_shape(self) -> None:
        payload = {
            "entries": [
                {
                    "name": "sample",
                    "kind": "compute",
                    "payload": {
                        "start": {"x": 20, "y": 20},
                        "end": {"x": 120, "y": 120},
                        "mode": "plan_view",
                        "obstacles": [],
                    },
                }
            ]
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "replay.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            entries = bench.load_replay_entries([path])
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].get("name"), "sample")
        self.assertEqual(entries[0].get("kind"), "compute")

    def test_write_template_creates_replay_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "replay-template.json"
            bench._write_template(path, overwrite=False)
            entries = bench.load_replay_entries([path])
        self.assertGreaterEqual(len(entries), 3)
        self.assertTrue(any(str(entry.get("kind")) == "compute" for entry in entries))


if __name__ == "__main__":
    unittest.main()
