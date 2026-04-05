from __future__ import annotations

import os
import tempfile
import time
import unittest

from backend.route_groups.api_watchdog_service import WatchdogMonitorService
from backend.watchdog.filesystem import normalize_path


def make_service(temp_dir: str) -> WatchdogMonitorService:
    return WatchdogMonitorService(
        ledger_path=os.path.join(temp_dir, "watchdog.sqlite3"),
    )


class TestWatchdogMonitorService(unittest.TestCase):
    def test_initial_baseline_has_no_false_events(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            seeded = os.path.join(root, "seed.txt")
            with open(seeded, "w", encoding="utf-8") as handle:
                handle.write("seed")

            service = make_service(root)
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

            service = make_service(root)
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

            service = make_service(root)
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
            service = make_service(root_one)
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
            normalized_roots = {normalize_path(root_value) for root_value in roots}
            self.assertIn(normalize_path(root_one), normalized_roots)
            self.assertIn(normalize_path(root_two), normalized_roots)

    def test_config_validation_rejects_invalid_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
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

    def test_disabled_configuration_allows_empty_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            configured = service.configure(
                "user:demo",
                {
                    "roots": [],
                    "includeGlobs": [],
                    "excludeGlobs": [],
                    "heartbeatMs": 5000,
                    "enabled": False,
                },
            )

            self.assertIn("config", configured)
            self.assertEqual(configured["config"]["roots"], [])
            self.assertFalse(configured["config"]["enabled"])

            heartbeat = service.heartbeat("user:demo")
            self.assertEqual(heartbeat["events"], [])
            self.assertIn("paused", " ".join(heartbeat.get("warnings") or []).lower())

    def test_collector_register_heartbeat_ingest_and_overview(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            registered = service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["filesystem", "cad"],
                },
            )
            collector = registered.get("collector") or {}
            self.assertEqual(collector.get("collectorId"), "collector-a")
            self.assertEqual(collector.get("collectorType"), "filesystem")

            heartbeat = service.collector_heartbeat(
                "user:demo",
                {"collectorId": "collector-a", "status": "online", "sequence": 4},
            )
            self.assertEqual((heartbeat.get("collector") or {}).get("lastSequence"), 4)

            ingested = service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventType": "file_modified",
                            "projectId": "project-1",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 3000,
                        },
                        {
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\dwg\\sheet-1.dwg",
                            "timestamp": now_ms - 1000,
                        },
                    ],
                },
            )
            self.assertEqual(ingested.get("accepted"), 2)
            self.assertEqual(ingested.get("rejected"), 0)

            listed = service.list_events("user:demo", project_id="project-1")
            self.assertEqual(int(listed.get("count") or 0), 2)
            event_types = {str(item.get("eventType")) for item in (listed.get("events") or [])}
            self.assertIn("file_modified", event_types)
            self.assertIn("drawing_opened", event_types)

            overview = service.overview("user:demo", project_id="project-1")
            self.assertEqual((overview.get("collectors") or {}).get("total"), 1)
            self.assertEqual((overview.get("events") or {}).get("inWindow"), 2)
            self.assertIn("file_modified", (overview.get("events") or {}).get("byType") or {})

    def test_dashboard_snapshot_aggregates_watchdog_payloads(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["filesystem"],
                },
            )
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "name": "AutoCAD Collector",
                    "collectorType": "autocad_state",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["autocad", "drawing_sessions", "commands"],
                },
            )
            service.collector_heartbeat(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "status": "online",
                    "metadata": {
                        "sourceAvailable": True,
                        "activeDrawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                        "activeDrawingName": "Drawing1.dwg",
                        "currentSessionId": "session-1",
                        "trackerUpdatedAt": now_ms - 200,
                        "lastActivityAt": now_ms - 300,
                    },
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventType": "file_modified",
                            "projectId": "project-1",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 3000,
                        }
                    ],
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "events": [
                        {
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 1000,
                            "sessionId": "session-1",
                        }
                    ],
                },
            )

            snapshot = service.dashboard_snapshot(
                "user:demo",
                project_id="project-1",
                collector_id="collector-cad",
                time_window_ms=60 * 60 * 1000,
                events_limit=8,
                sessions_limit=8,
            )

            self.assertEqual(snapshot.get("projectId"), "project-1")
            self.assertEqual(snapshot.get("collectorId"), "collector-cad")
            self.assertEqual(snapshot.get("timeWindowMs"), 60 * 60 * 1000)
            self.assertEqual(
                int((((snapshot.get("collectors") or {}).get("count")) or 0)),
                2,
            )
            self.assertEqual(
                int((((snapshot.get("events") or {}).get("count")) or 0)),
                1,
            )
            self.assertEqual(
                str(((((snapshot.get("events") or {}).get("events")) or [{}])[0]).get("collectorId") or ""),
                "collector-cad",
            )
            self.assertEqual(
                int((((snapshot.get("sessions") or {}).get("count")) or 0)),
                1,
            )
            self.assertEqual(
                str(((((snapshot.get("sessions") or {}).get("sessions")) or [{}])[0]).get("sessionId") or ""),
                "session-1",
            )
            self.assertEqual(
                int(((((snapshot.get("overview") or {}).get("events")) or {}).get("inWindow") or 0)),
                2,
            )

    def test_list_sessions_summarizes_autocad_activity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "name": "AutoCAD Collector",
                    "collectorType": "autocad_state",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["autocad", "drawing_sessions", "commands"],
                },
            )
            service.collector_heartbeat(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "status": "online",
                    "metadata": {
                        "sourceAvailable": True,
                        "activeDrawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                        "activeDrawingName": "Drawing1.dwg",
                        "currentSessionId": "session-1",
                        "trackerUpdatedAt": now_ms - 200,
                        "lastActivityAt": now_ms - 300,
                    },
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "events": [
                        {
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 5000,
                            "sessionId": "session-1",
                        },
                        {
                            "eventType": "command_executed",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 2500,
                            "sessionId": "session-1",
                        },
                        {
                            "eventType": "idle_started",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 1800,
                            "sessionId": "session-1",
                        },
                    ],
                },
            )

            sessions = service.list_sessions(
                "user:demo",
                project_id="project-1",
                time_window_ms=60 * 60 * 1000,
            )

            self.assertEqual(int(sessions.get("count") or 0), 1)
            session = (sessions.get("sessions") or [{}])[0]
            self.assertEqual(session.get("sessionId"), "session-1")
            self.assertEqual(session.get("collectorId"), "collector-cad")
            self.assertEqual(session.get("projectId"), "project-1")
            self.assertEqual(session.get("status"), "live")
            self.assertTrue(bool(session.get("active")))
            self.assertEqual(int(session.get("commandCount") or 0), 1)
            self.assertEqual(int(session.get("idleCount") or 0), 1)
            self.assertGreater(int(session.get("durationMs") or 0), 0)

    def test_list_sessions_does_not_keep_session_live_when_source_is_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "name": "AutoCAD Collector",
                    "collectorType": "autocad_state",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["autocad", "drawing_sessions", "commands"],
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "events": [
                        {
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 5000,
                            "sessionId": "session-1",
                        },
                        {
                            "eventType": "drawing_closed",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                            "timestamp": now_ms - 1000,
                            "sessionId": "session-1",
                        },
                    ],
                },
            )
            service.collector_heartbeat(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "status": "online",
                    "metadata": {
                        "sourceAvailable": False,
                        "activeDrawingPath": r"C:\\Projects\\Alpha\\Drawing1.dwg",
                        "activeDrawingName": "Drawing1.dwg",
                        "currentSessionId": "session-1",
                        "trackerUpdatedAt": now_ms - 200,
                        "lastActivityAt": now_ms - 300,
                    },
                },
            )

            sessions = service.list_sessions(
                "user:demo",
                project_id="project-1",
                time_window_ms=60 * 60 * 1000,
            )

            self.assertEqual(int(sessions.get("count") or 0), 1)
            session = (sessions.get("sessions") or [{}])[0]
            self.assertEqual(session.get("sessionId"), "session-1")
            self.assertFalse(bool(session.get("active")))
            self.assertEqual(session.get("status"), "completed")
            self.assertFalse(bool(session.get("sourceAvailable")))

    def test_list_sessions_derives_legacy_session_id_for_drawing_events_without_session_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                    "capabilities": ["filesystem", "cad"],
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-open",
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\dwg\\sheet-1.dwg",
                            "timestamp": now_ms - 1000,
                        }
                    ],
                },
            )

            sessions = service.list_sessions(
                "user:demo",
                project_id="project-1",
                time_window_ms=7 * 24 * 60 * 60 * 1000,
            )

            self.assertEqual(int(sessions.get("count") or 0), 1)
            session = (sessions.get("sessions") or [{}])[0]
            self.assertEqual(session.get("projectId"), "project-1")
            self.assertEqual(int(session.get("eventCount") or 0), 1)
            self.assertEqual(session.get("drawingPath"), r"C:\\dwg\\sheet-1.dwg")
            self.assertTrue(str(session.get("sessionId") or "").startswith("legacy-"))

    def test_collector_ingest_requires_registered_collector(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            with self.assertRaises(KeyError):
                service.ingest_collector_events(
                    "user:demo",
                    {
                        "collectorId": "missing",
                        "events": [{"eventType": "file_modified"}],
                    },
                )

    def test_collector_events_persist_across_service_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            now_ms = int(time.time() * 1000)
            first_service = make_service(temp_dir)
            first_service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                },
            )
            first_service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-1",
                            "eventType": "file_modified",
                            "projectId": "project-1",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 500,
                        }
                    ],
                },
            )

            second_service = make_service(temp_dir)
            listed = second_service.list_events("user:demo", project_id="project-1")
            self.assertEqual(int(listed.get("count") or 0), 1)
            self.assertEqual(
                str((listed.get("events") or [{}])[0].get("eventType") or ""),
                "file_modified",
            )

    def test_project_rules_attribute_filesystem_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            now_ms = int(time.time() * 1000)
            project_root = os.path.join(temp_dir, "projects", "alpha")
            os.makedirs(project_root, exist_ok=True)
            service = make_service(temp_dir)
            service.put_project_rule(
                "user:demo",
                "project-alpha",
                {
                    "roots": [project_root],
                    "includeGlobs": ["*.dwg", "*.pdf"],
                    "excludeGlobs": [],
                    "drawingPatterns": ["*.dwg"],
                },
            )
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                },
            )

            ingested = service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-1",
                            "eventType": "drawing_opened",
                            "drawingPath": os.path.join(project_root, "sheet-1.dwg"),
                            "timestamp": now_ms - 1500,
                        },
                        {
                            "eventKey": "evt-2",
                            "eventType": "file_modified",
                            "path": os.path.join(project_root, "submittal.pdf"),
                            "timestamp": now_ms - 1000,
                        },
                    ],
                },
            )
            self.assertEqual(ingested.get("accepted"), 2)

            listed = service.list_events("user:demo", project_id="project-alpha")
            self.assertEqual(int(listed.get("count") or 0), 2)
            self.assertTrue(
                all(
                    str(item.get("projectId") or "") == "project-alpha"
                    for item in (listed.get("events") or [])
                )
            )

    def test_sync_project_rules_reconciles_local_runtime_rules(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            alpha_root = os.path.join(temp_dir, "projects", "alpha")
            beta_root = os.path.join(temp_dir, "projects", "beta")
            gamma_root = os.path.join(temp_dir, "projects", "gamma")
            os.makedirs(alpha_root, exist_ok=True)
            os.makedirs(beta_root, exist_ok=True)
            os.makedirs(gamma_root, exist_ok=True)

            service = make_service(temp_dir)
            service.put_project_rule(
                "user:demo",
                "project-alpha",
                {"roots": [alpha_root], "includeGlobs": [], "excludeGlobs": [], "drawingPatterns": []},
            )
            service.put_project_rule(
                "user:demo",
                "project-beta",
                {"roots": [beta_root], "includeGlobs": [], "excludeGlobs": [], "drawingPatterns": []},
            )

            synced = service.sync_project_rules(
                "user:demo",
                {
                    "rules": [
                        {
                            "projectId": "project-alpha",
                            "roots": [alpha_root],
                            "includeGlobs": ["*.dwg"],
                            "excludeGlobs": [],
                            "drawingPatterns": ["*.dwg"],
                        },
                        {
                            "projectId": "project-gamma",
                            "roots": [gamma_root],
                            "includeGlobs": [],
                            "excludeGlobs": ["*.bak"],
                            "drawingPatterns": [],
                        },
                    ]
                },
            )

            self.assertEqual(int(synced.get("count") or 0), 2)
            self.assertEqual(synced.get("deletedProjectIds"), ["project-beta"])
            alpha_rule = service.get_project_rules("user:demo", "project-alpha").get("rule") or {}
            gamma_rule = service.get_project_rules("user:demo", "project-gamma").get("rule") or {}
            beta_rule = service.get_project_rules("user:demo", "project-beta").get("rule") or {}
            self.assertEqual(alpha_rule.get("includeGlobs"), ["*.dwg"])
            self.assertEqual(gamma_rule.get("excludeGlobs"), ["*.bak"])
            self.assertEqual(beta_rule.get("roots"), [])

    def test_prepare_drawing_activity_sync_returns_tracked_segment_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(temp_dir)
            now_ms = int(time.time() * 1000)
            project_root = os.path.join(temp_dir, "projects", "alpha")
            os.makedirs(project_root, exist_ok=True)
            drawing_path = os.path.join(project_root, "sheet-1.dwg")

            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "name": "AutoCAD Collector",
                    "collectorType": "autocad_state",
                    "workstationId": "DEV-HOME",
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-cad",
                    "events": [
                        {
                            "eventKey": "evt-drawing-closed",
                            "eventType": "drawing_closed",
                            "projectId": "project-alpha",
                            "drawingPath": drawing_path,
                            "timestamp": now_ms,
                            "sessionId": "session-1",
                            "workstationId": "DEV-HOME",
                            "metadata": {
                                "drawingName": "sheet-1.dwg",
                                "trackedMs": 240000,
                                "idleMs": 60000,
                                "commandCount": 3,
                                "segmentStartedAt": now_ms - 300000,
                                "segmentEndedAt": now_ms,
                                "workDate": "2026-03-19",
                            },
                        }
                    ],
                },
            )

            prepared = service.prepare_drawing_activity_sync("user:demo", limit=25)
            self.assertEqual(int(prepared.get("readyCount") or 0), 1)
            self.assertEqual(int(prepared.get("skippedCount") or 0), 0)
            row = (prepared.get("rows") or [{}])[0]
            self.assertNotIn("eventId", row)
            self.assertEqual(row.get("project_id"), "project-alpha")
            self.assertEqual(row.get("drawing_path"), drawing_path)
            self.assertEqual(row.get("drawing_name"), "sheet-1.dwg")
            self.assertEqual(int(row.get("tracked_ms") or 0), 240000)
            self.assertEqual(int(row.get("idle_ms") or 0), 60000)
            self.assertEqual(int(row.get("command_count") or 0), 3)
            self.assertEqual(row.get("source_session_id"), "session-1")
            self.assertEqual(row.get("workstation_id"), "DEV-HOME")
            self.assertEqual(row.get("work_date"), "2026-03-19")
            self.assertTrue(str(row.get("sync_key") or "").startswith("watchdog:"))

            cursor = service.mark_drawing_activity_synced(
                "user:demo",
                last_event_id=int(prepared.get("lastScannedEventId") or 0),
                metadata={"syncedAt": now_ms, "syncedCount": 1},
            )
            self.assertEqual(int(cursor.get("lastEventId") or 0), int(prepared.get("lastScannedEventId") or 0))

            follow_up = service.prepare_drawing_activity_sync("user:demo", limit=25)
            self.assertEqual(int(follow_up.get("readyCount") or 0), 0)
            self.assertEqual(follow_up.get("rows"), [])

    def test_duplicate_event_keys_are_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            now_ms = int(time.time() * 1000)
            service = make_service(temp_dir)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                },
            )
            first = service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-1",
                            "eventType": "file_modified",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 1000,
                        }
                    ],
                },
            )
            second = service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-1",
                            "eventType": "file_modified",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 1000,
                        }
                    ],
                },
            )

            self.assertEqual(first.get("accepted"), 1)
            self.assertEqual(second.get("accepted"), 0)
            self.assertEqual(second.get("duplicates"), 1)
            listed = service.list_events("user:demo")
            self.assertEqual(int(listed.get("count") or 0), 1)

    def test_rollups_record_collector_event_counts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            now_ms = int(time.time() * 1000)
            service = make_service(temp_dir)
            service.register_collector(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "name": "Desktop Collector",
                    "collectorType": "filesystem",
                    "workstationId": "DEV-HOME",
                },
            )
            service.ingest_collector_events(
                "user:demo",
                {
                    "collectorId": "collector-a",
                    "events": [
                        {
                            "eventKey": "evt-1",
                            "eventType": "file_modified",
                            "projectId": "project-1",
                            "path": r"C:\\repo\\a.txt",
                            "timestamp": now_ms - 2000,
                        },
                        {
                            "eventKey": "evt-2",
                            "eventType": "drawing_opened",
                            "projectId": "project-1",
                            "drawingPath": r"C:\\dwg\\sheet-1.dwg",
                            "timestamp": now_ms - 1000,
                        },
                    ],
                },
            )

            rollups = service._ledger.list_rollups(
                "user:demo",
                since_ms=now_ms - (2 * 60 * 60 * 1000),
                project_id="project-1",
            )
            self.assertGreaterEqual(len(rollups), 2)
            by_type = {str(row.get("eventType") or ""): int(row.get("eventCount") or 0) for row in rollups}
            self.assertEqual(by_type.get("file_modified"), 1)
            self.assertEqual(by_type.get("drawing_opened"), 1)


if __name__ == "__main__":
    unittest.main()

