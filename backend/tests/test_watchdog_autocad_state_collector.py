from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.watchdog.autocad_state_collector import (
    AutoCadStateCollector,
    AutoCadStateCollectorConfig,
    load_autocad_state_collector_config,
)


class FakeCollectorApiClient:
    def __init__(self) -> None:
        self.register_calls: list[dict] = []
        self.heartbeat_calls: list[dict] = []
        self.send_calls: list[list[dict]] = []
        self.fail_register = False
        self.fail_heartbeat = False
        self.fail_send = False

    def register(self) -> dict:
        self.register_calls.append({})
        if self.fail_register:
            raise RuntimeError("backend unavailable")
        return {"ok": True, "collector": {"collectorId": "collector-a"}}

    def heartbeat(self, *, status: str, sequence: int, metadata: dict) -> dict:
        self.heartbeat_calls.append(
            {
                "status": status,
                "sequence": sequence,
                "metadata": dict(metadata),
            }
        )
        if self.fail_heartbeat:
            raise RuntimeError("backend unavailable")
        return {"ok": True, "collector": {"status": status, "lastSequence": sequence}}

    def send_events(self, events: list[dict]) -> dict:
        self.send_calls.append([dict(event) for event in events])
        if self.fail_send:
            raise RuntimeError("offline")
        return {"ok": True, "accepted": len(events), "duplicates": 0}


def make_config(temp_dir: str, state_json_path: Path) -> AutoCadStateCollectorConfig:
    return AutoCadStateCollectorConfig(
        backend_url="http://127.0.0.1:5000",
        api_key="valid-key",
        collector_id="collector-a",
        workstation_id="DEV-HOME",
        state_json_path=state_json_path,
        buffer_dir=Path(temp_dir) / "collector-state",
        poll_interval_ms=1_000,
        heartbeat_ms=5_000,
    )


def write_tracker_state(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


class TestAutoCadStateCollector(unittest.TestCase):
    def test_load_autocad_config_accepts_utf8_bom_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            config_path = Path(temp_dir) / "collector-config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "backendUrl": "http://127.0.0.1:5000",
                        "apiKey": "valid-key",
                        "collectorId": "collector-a",
                        "workstationId": "DEV-HOME",
                        "stateJsonPath": str(state_path),
                    },
                    indent=2,
                ),
                encoding="utf-8-sig",
            )

            config = load_autocad_state_collector_config(config_path=config_path)

            self.assertEqual(config.collector_id, "collector-a")
            self.assertEqual(config.workstation_id, "DEV-HOME")
            self.assertEqual(config.state_json_path, state_path.resolve())

    def test_missing_state_file_reports_source_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: True,
            )

            result = collector.run_once()

            self.assertFalse(result["scan"]["sourceAvailable"])
            self.assertEqual(len(api_client.register_calls), 1)
            self.assertEqual(len(api_client.heartbeat_calls), 1)
            sent_event_types = {
                str(event.get("eventType") or "")
                for batch in api_client.send_calls
                for event in batch
            }
            self.assertEqual(sent_event_types, {"collector_online"})
            self.assertFalse(api_client.heartbeat_calls[0]["metadata"]["sourceAvailable"])

    def test_process_exit_marks_source_unavailable_and_closes_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            process_running = {"value": True}
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: process_running["value"],
            )

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["LINE"],
                    "lastActivityAt": "2026-03-18T10:00:01Z",
                    "lastUpdated": "2026-03-18T10:00:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 1,
                        "activeTime": "00:00:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.run_once()
            api_client.send_calls.clear()

            process_running["value"] = False
            result = collector.run_once()

            self.assertFalse(result["scan"]["sourceAvailable"])
            self.assertEqual(result["scan"]["reason"], "autocad_process_not_running")
            self.assertEqual(result["scan"]["queued"], 1)
            self.assertEqual(len(api_client.send_calls), 1)
            self.assertEqual(
                [str(event.get("eventType") or "") for event in api_client.send_calls[0]],
                ["drawing_closed"],
            )
            self.assertFalse(api_client.heartbeat_calls[-1]["metadata"]["sourceAvailable"])
            self.assertIsNone(api_client.heartbeat_calls[-1]["metadata"]["currentSessionId"])

            snapshot = dict(collector.state_store.load().get("snapshot") or {})
            self.assertFalse(bool(snapshot.get("sourceAvailable")))
            self.assertIsNone(snapshot.get("currentSessionId"))
            self.assertIsNone(snapshot.get("activeDrawingPath"))

    def test_tracker_state_translates_to_session_idle_and_command_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: True,
            )

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["ZOOM", "LINE"],
                    "lastActivityAt": "2026-03-18T10:00:01Z",
                    "lastUpdated": "2026-03-18T10:00:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 2,
                        "activeTime": "00:00:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.run_once()
            first_event_types = [
                str(event.get("eventType") or "")
                for event in api_client.send_calls[0]
            ]
            self.assertEqual(
                first_event_types,
                ["collector_online", "drawing_opened", "command_executed", "command_executed"],
            )
            first_command_names = [
                str(event.get("metadata", {}).get("commandName") or "")
                for event in api_client.send_calls[0]
                if str(event.get("eventType") or "") == "command_executed"
            ]
            self.assertEqual(first_command_names, ["LINE", "ZOOM"])

            api_client.send_calls.clear()
            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": True,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["MOVE", "ZOOM", "LINE"],
                    "lastActivityAt": "2026-03-18T10:05:00Z",
                    "lastUpdated": "2026-03-18T10:05:05Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 3,
                        "activeTime": "00:04:00",
                        "idleTime": "00:01:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.scan_once()
            collector.flush_pending_events()
            second_event_types = [
                str(event.get("eventType") or "")
                for event in api_client.send_calls[0]
            ]
            self.assertEqual(second_event_types, ["idle_started", "command_executed"])
            self.assertEqual(
                str(api_client.send_calls[0][1].get("metadata", {}).get("commandName") or ""),
                "MOVE",
            )

    def test_tracker_state_exposes_create_operation_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: True,
            )

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "Drawing1.dwg",
                    "activeDrawingPath": r"C:\Projects\Test\Drawing1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "isCreating": True,
                    "operationType": "acade_project_create",
                    "operationRequestId": "req-create-1",
                    "operationTargetPath": r"C:\Projects\Test\Test.wdp",
                    "operationStartedAt": "2026-03-31T20:00:00Z",
                    "idleTimeoutSeconds": 180,
                    "recentCommands": [],
                    "lastActivityAt": "2026-03-31T20:00:01Z",
                    "lastUpdated": "2026-03-31T20:00:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "Drawing1.dwg",
                        "fullPath": r"C:\Projects\Test\Drawing1.dwg",
                        "startedAt": "2026-03-31T20:00:00Z",
                        "commandCount": 0,
                        "activeTime": "00:00:10",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.run_once()

            heartbeat = api_client.heartbeat_calls[-1]["metadata"]
            self.assertTrue(heartbeat["isCreating"])
            self.assertEqual(heartbeat["operationType"], "acade_project_create")
            self.assertEqual(heartbeat["operationRequestId"], "req-create-1")
            self.assertEqual(heartbeat["operationTargetPath"], r"C:\Projects\Test\Test.wdp")

    def test_failed_flush_replays_buffered_events_without_changing_event_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: True,
            )

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["LINE"],
                    "lastActivityAt": "2026-03-18T10:00:01Z",
                    "lastUpdated": "2026-03-18T10:00:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 1,
                        "activeTime": "00:00:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.run_once()
            api_client.send_calls.clear()

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["MOVE", "LINE"],
                    "lastActivityAt": "2026-03-18T10:01:01Z",
                    "lastUpdated": "2026-03-18T10:01:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 2,
                        "activeTime": "00:01:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )

            collector.scan_once()

            api_client.fail_send = True
            with self.assertRaises(RuntimeError):
                collector.flush_pending_events()

            pending_state = collector.state_store.load()
            pending_events = list(pending_state.get("pendingEvents") or [])
            self.assertEqual(len(pending_events), 1)
            buffered_event_key = str(pending_events[0].get("eventKey") or "")

            api_client.fail_send = False
            collector.flush_pending_events()

            self.assertEqual(len(api_client.send_calls), 2)
            self.assertEqual(
                str(api_client.send_calls[0][0].get("eventKey") or ""),
                buffered_event_key,
            )
            self.assertEqual(
                str(api_client.send_calls[1][0].get("eventKey") or ""),
                buffered_event_key,
            )
            self.assertEqual(
                len(collector.state_store.load().get("pendingEvents") or []),
                0,
            )

    def test_run_once_buffers_autocad_events_when_backend_is_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "tracker-state.json"
            api_client = FakeCollectorApiClient()
            collector = AutoCadStateCollector(
                make_config(temp_dir, state_path),
                api_client=api_client,
                autocad_process_checker=lambda: True,
            )

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["LINE"],
                    "lastActivityAt": "2026-03-18T10:00:01Z",
                    "lastUpdated": "2026-03-18T10:00:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 1,
                        "activeTime": "00:00:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )
            collector.run_once()

            write_tracker_state(
                state_path,
                {
                    "activeDrawing": "sheet-1.dwg",
                    "activeDrawingPath": r"C:\Projects\Alpha\sheet-1.dwg",
                    "isTracking": True,
                    "isPaused": False,
                    "idleTimeoutSeconds": 180,
                    "recentCommands": ["MOVE", "LINE"],
                    "lastActivityAt": "2026-03-18T10:01:01Z",
                    "lastUpdated": "2026-03-18T10:01:02Z",
                    "currentSession": {
                        "sessionId": "session-1",
                        "drawingName": "sheet-1.dwg",
                        "fullPath": r"C:\Projects\Alpha\sheet-1.dwg",
                        "startedAt": "2026-03-18T10:00:00Z",
                        "commandCount": 2,
                        "activeTime": "00:01:30",
                        "idleTime": "00:00:00",
                        "isActive": True,
                    },
                    "sessions": [],
                },
            )
            api_client.fail_register = True
            api_client.fail_send = True
            api_client.fail_heartbeat = True

            result = collector.run_once()

            self.assertTrue(result["register"]["ok"])
            self.assertFalse(result["heartbeat"]["ok"])
            self.assertEqual(result["scan"]["queued"], 1)
            pending_events = list(collector.state_store.load().get("pendingEvents") or [])
            self.assertEqual(len(pending_events), 1)
            self.assertEqual(str(pending_events[0].get("eventType") or ""), "command_executed")


if __name__ == "__main__":
    unittest.main()

