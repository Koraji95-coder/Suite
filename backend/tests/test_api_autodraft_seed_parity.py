from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.route_groups.api_autodraft import DEFAULT_RULES


class TestAutoDraftSeedParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        spec_path = repo_root / "docs" / "autodraft" / "rule_seed_spec.json"
        cls.seed_spec = json.loads(spec_path.read_text(encoding="utf-8"))

    def test_python_seed_rules_match_spec(self) -> None:
        expected_rules = self.seed_spec.get("rules") or []
        self.assertEqual(len(DEFAULT_RULES), len(expected_rules))

        for index, expected in enumerate(expected_rules):
            actual = DEFAULT_RULES[index]
            trigger = actual.get("trigger") if isinstance(actual, dict) else {}
            trigger = trigger if isinstance(trigger, dict) else {}
            expected_trigger = expected.get("trigger") or {}

            self.assertEqual(actual.get("id"), expected.get("id"))
            self.assertEqual(actual.get("category"), expected.get("category"))
            self.assertEqual(trigger.get("type"), expected_trigger.get("type"))
            self.assertEqual(trigger.get("color"), expected_trigger.get("color"))

            action_text = str(actual.get("action") or "").strip()
            self.assertNotEqual(action_text, "")

            confidence = actual.get("confidence")
            self.assertIsInstance(confidence, (int, float))
            assert isinstance(confidence, (int, float))
            self.assertGreaterEqual(float(confidence), 0.0)
            self.assertLessEqual(float(confidence), 1.0)


if __name__ == "__main__":
    unittest.main()
