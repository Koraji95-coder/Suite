from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from backend.watchdog.filesystem_collector import (
    FilesystemCollector,
    FilesystemCollectorConfig,
    load_collector_config,
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


def make_config(temp_dir: str, root: Path) -> FilesystemCollectorConfig:
    return FilesystemCollectorConfig(
        backend_url="http://127.0.0.1:5000",
        api_key="valid-key",
        collector_id="collector-a",
        workstation_id="DEV-WORKSTATION",
        roots=[str(root)],
        buffer_dir=Path(temp_dir) / "collector-state",
        scan_interval_ms=1_000,
        heartbeat_ms=5_000,
    )


class TestFilesystemCollector(unittest.TestCase):
    def test_load_collector_config_accepts_utf8_bom_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            config_path = Path(temp_dir) / "collector-config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "backendUrl": "http://127.0.0.1:5000",
                        "apiKey": "valid-key",
                        "collectorId": "collector-a",
                        "workstationId": "DEV-WORKSTATION",
                        "roots": [str(root)],
                    },
                    indent=2,
                ),
                encoding="utf-8-sig",
            )

            config = load_collector_config(config_path=config_path)

            self.assertEqual(config.collector_id, "collector-a")
            self.assertEqual(config.workstation_id, "DEV-WORKSTATION")
            self.assertEqual(config.roots, [str(root.resolve())])

    def test_initial_scan_establishes_baseline_without_file_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            (root / "seed.txt").write_text("seed", encoding="utf-8")
            api_client = FakeCollectorApiClient()
            collector = FilesystemCollector(
                make_config(temp_dir, root),
                api_client=api_client,
            )

            result = collector.run_once()

            self.assertEqual(result["scan"]["queued"], 0)
            self.assertEqual(len(api_client.register_calls), 1)
            self.assertEqual(len(api_client.heartbeat_calls), 1)
            sent_event_types = {
                str(event.get("eventType") or "")
                for batch in api_client.send_calls
                for event in batch
            }
            self.assertEqual(sent_event_types, {"collector_online"})

    def test_failed_flush_replays_buffered_events_without_changing_event_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            (root / "seed.txt").write_text("seed", encoding="utf-8")
            api_client = FakeCollectorApiClient()
            collector = FilesystemCollector(
                make_config(temp_dir, root),
                api_client=api_client,
            )

            collector.run_once()
            api_client.send_calls.clear()

            (root / "added.txt").write_text("alpha", encoding="utf-8")
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

    def test_sequences_increase_for_new_filesystem_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            (root / "seed.txt").write_text("seed", encoding="utf-8")
            api_client = FakeCollectorApiClient()
            collector = FilesystemCollector(
                make_config(temp_dir, root),
                api_client=api_client,
            )

            collector.run_once()
            api_client.send_calls.clear()

            tracked_file = root / "tracked.txt"
            tracked_file.write_text("one", encoding="utf-8")
            collector.scan_once()
            collector.flush_pending_events()

            time.sleep(0.02)
            tracked_file.write_text("two", encoding="utf-8")
            collector.scan_once()
            collector.flush_pending_events()

            self.assertEqual(len(api_client.send_calls), 2)
            first_sequence = int(api_client.send_calls[0][0].get("sequence") or 0)
            second_sequence = int(api_client.send_calls[1][0].get("sequence") or 0)
            self.assertEqual(first_sequence, 2)
            self.assertEqual(second_sequence, 3)

    def test_run_once_buffers_events_when_backend_is_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            (root / "seed.txt").write_text("seed", encoding="utf-8")
            api_client = FakeCollectorApiClient()
            collector = FilesystemCollector(
                make_config(temp_dir, root),
                api_client=api_client,
            )

            collector.run_once()

            (root / "offline-added.txt").write_text("alpha", encoding="utf-8")
            api_client.fail_register = True
            api_client.fail_send = True
            api_client.fail_heartbeat = True

            result = collector.run_once()

            self.assertTrue(result["register"]["ok"])
            self.assertFalse(result["heartbeat"]["ok"])
            self.assertEqual(result["scan"]["queued"], 1)
            pending_events = list(collector.state_store.load().get("pendingEvents") or [])
            self.assertEqual(len(pending_events), 1)
            self.assertEqual(str(pending_events[0].get("eventType") or ""), "file_added")


if __name__ == "__main__":
    unittest.main()
