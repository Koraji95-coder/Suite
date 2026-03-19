from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.autodraft_execution_receipts import (
    get_receipt_db_path,
    persist_autodraft_execution_receipt,
)


class TestAutoDraftExecutionReceipts(unittest.TestCase):
    def test_persist_receipt_writes_sqlite_row(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "autodraft-execution-receipts.sqlite3")
            with patch.dict(
                os.environ,
                {"SUITE_AUTODRAFT_RECEIPTS_DB": db_path},
                clear=False,
            ):
                receipt = persist_autodraft_execution_receipt(
                    request_id="req-receipt-1",
                    payload={
                        "workflow_context": {"project_id": "project-1"},
                        "revision_context": {"drawing_number": "E-101"},
                    },
                    response_payload={
                        "job_id": "job-1",
                        "source": "dotnet-bridge",
                        "status": "committed",
                        "accepted": 1,
                        "skipped": 0,
                        "dry_run": False,
                        "message": "Commit completed.",
                        "warnings": ["Used AddText fallback."],
                        "meta": {
                            "cad": {
                                "drawingName": "sample.dwg",
                                "drawingPath": r"C:\Drawings\sample.dwg",
                            },
                            "commit": {
                                "createdHandles": ["1A2B"],
                                "titleBlockUpdates": [
                                    {
                                        "fieldKey": "revision",
                                        "attributeTag": "REV",
                                        "previousValue": "A",
                                        "nextValue": "B",
                                        "handle": "1A2B",
                                    }
                                ],
                            },
                        },
                    },
                    provider_path="dotnet_bridge",
                )

                self.assertEqual(receipt["requestId"], "req-receipt-1")
                self.assertEqual(receipt["status"], "committed")
                self.assertFalse(receipt["dryRun"])
                self.assertEqual(
                    receipt["workflowContext"],
                    {"project_id": "project-1"},
                )
                self.assertEqual(
                    receipt["revisionContext"],
                    {"drawing_number": "E-101"},
                )
                self.assertEqual(
                    receipt["titleBlockUpdates"],
                    [
                        {
                            "fieldKey": "revision",
                            "attributeTag": "REV",
                            "previousValue": "A",
                            "nextValue": "B",
                            "handle": "1A2B",
                        }
                    ],
                )
                self.assertEqual(get_receipt_db_path().as_posix(), db_path.replace("\\", "/"))

                connection = sqlite3.connect(db_path)
                try:
                    row = connection.execute(
                        """
                        select request_id, provider_path, status, dry_run, accepted, skipped,
                               drawing_name, drawing_path, warnings_json, created_handles_json,
                               workflow_context_json, revision_context_json, title_block_updates_json
                        from autodraft_execution_receipts
                        where request_id = ?
                        """,
                        ("req-receipt-1",),
                    ).fetchone()
                finally:
                    connection.close()

                self.assertIsNotNone(row)
                assert row is not None
                self.assertEqual(row[0], "req-receipt-1")
                self.assertEqual(row[1], "dotnet_bridge")
                self.assertEqual(row[2], "committed")
                self.assertEqual(row[3], 0)
                self.assertEqual(row[4], 1)
                self.assertEqual(row[5], 0)
                self.assertEqual(row[6], "sample.dwg")
                self.assertEqual(row[7], r"C:\Drawings\sample.dwg")
                self.assertIn("Used AddText fallback.", row[8])
                self.assertIn("1A2B", row[9])
                self.assertIn("project-1", row[10])
                self.assertIn("E-101", row[11])
                self.assertIn("\"fieldKey\":\"revision\"", row[12])


if __name__ == "__main__":
    unittest.main()
