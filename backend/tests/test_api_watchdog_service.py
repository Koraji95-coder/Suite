from __future__ import annotations

import os
import tempfile
import unittest

from backend.route_groups.api_watchdog_service import WatchdogMonitorService


class TestWatchdogMonitorService(unittest.TestCase):
    def test_initial_baseline_has_no_false_events(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            seeded = os.path.join(root, "seed.txt")
            with open(seeded, "w", encoding="utf-8") as handle:
                handle.write("seed")

            service = WatchdogMonitorService()
            config_payload = {
                "roots": [root],
                "includeGlobs": [],
                "excludeGlobs": [],
                "heartbeatMs": 5000,
                "enabled": True,
            }

            configured = service.configure("user:demo", config_payload)
            self.assertIn("initialScan", configured)
            self.assertGreaterEqual(int(configured["initialScan"]["filesScanned"]), 1)

            heartbeat = service.heartbeat("user:demo")
            self.assertEqual(heartbeat["events"], [])
            self.assertFalse(heartbeat["truncated"])

    def test_added_removed_and_modified_events(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            tracked = os.path.join(root, "tracked.txt")
            with open(tracked, "w", encoding="utf-8") as handle:
                handle.write("alpha")

            service = WatchdogMonitorService()
            service.configure(
                "user:demo",
                {
                    "roots": [root],
                    "includeGlobs": [],
                    "excludeGlobs": [],
                    "heartbeatMs": 5000,
                    "enabled": True,
                },
            )

            added = os.path.join(root, "added.txt")
            with open(added, "w", encoding="utf-8") as handle:
                handle.write("new file")

            first = service.heartbeat("user:demo")
            first_events = first["events"]
            self.assertTrue(any(event["type"] == "added" for event in first_events))
            first_event_ids = [int(event["eventId"]) for event in first_events]

            with open(tracked, "a", encoding="utf-8") as handle:
                handle.write("\nmore content to force modification")
            os.remove(added)

            second = service.heartbeat("user:demo")
            second_events = second["events"]
            self.assertTrue(any(event["type"] == "modified" for event in second_events))
            self.assertTrue(any(event["type"] == "removed" for event in second_events))
            second_event_ids = [int(event["eventId"]) for event in second_events]
            if first_event_ids and second_event_ids:
                self.assertGreater(min(second_event_ids), max(first_event_ids))

    def test_recursive_scan_detects_nested_changes(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            nested = os.path.join(root, "a", "b", "c")
            os.makedirs(nested, exist_ok=True)
            base_file = os.path.join(nested, "base.txt")
            with open(base_file, "w", encoding="utf-8") as handle:
                handle.write("baseline")

            service = WatchdogMonitorService()
            service.configure(
                "user:demo",
                {
                    "roots": [root],
                    "includeGlobs": [],
                    "excludeGlobs": [],
                    "heartbeatMs": 5000,
                    "enabled": True,
                },
            )

            deep_file = os.path.join(root, "a", "b", "c", "new.txt")
            with open(deep_file, "w", encoding="utf-8") as handle:
                handle.write("nested")

            heartbeat = service.heartbeat("user:demo")
            self.assertGreaterEqual(int(heartbeat["foldersScanned"]), 4)
            added_events = [event for event in heartbeat["events"] if event["type"] == "added"]
            self.assertTrue(added_events)
            self.assertTrue(
                any("a/b/c/new.txt" in str(event.get("relativePath") or "") for event in added_events)
            )

    def test_multi_root_events_preserve_root_attribution(self) -> None:
        with tempfile.TemporaryDirectory() as root_one, tempfile.TemporaryDirectory() as root_two:
            service = WatchdogMonitorService()
            service.configure(
                "user:demo",
                {
                    "roots": [root_one, root_two],
                    "includeGlobs": [],
                    "excludeGlobs": [],
                    "heartbeatMs": 5000,
                    "enabled": True,
                },
            )

            one_file = os.path.join(root_one, "one.txt")
            two_file = os.path.join(root_two, "two.txt")
            with open(one_file, "w", encoding="utf-8") as handle:
                handle.write("one")
            with open(two_file, "w", encoding="utf-8") as handle:
                handle.write("two")

            heartbeat = service.heartbeat("user:demo")
            roots = {str(event.get("root")) for event in heartbeat["events"] if event["type"] == "added"}
            self.assertIn(root_one, roots)
            self.assertIn(root_two, roots)

    def test_config_validation_rejects_invalid_roots(self) -> None:
        service = WatchdogMonitorService()
        with self.assertRaisesRegex(ValueError, "absolute"):
            service.configure(
                "user:demo",
                {
                    "roots": ["relative/path"],
                    "heartbeatMs": 5000,
                    "enabled": True,
                },
            )

        with self.assertRaisesRegex(ValueError, "does not exist"):
            service.configure(
                "user:demo",
                {
                    "roots": [os.path.abspath("Z:/definitely-missing-watchdog-root")],
                    "heartbeatMs": 5000,
                    "enabled": True,
                },
            )


if __name__ == "__main__":
    unittest.main()
