from __future__ import annotations

import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.route_groups.api_agent_orchestration_runtime import (
    AgentRunOrchestrator,
    TERMINAL_RUN_STATUSES,
)


class _ResponseStub:
    def __init__(self, *, status_code: int, payload: Optional[Dict[str, Any]] = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self) -> Dict[str, Any]:
        return dict(self._payload)


class _RequestsStub:
    def __init__(self, responses: List[_ResponseStub]) -> None:
        self.responses = list(responses)
        self.calls: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def post(self, url: str, headers: Dict[str, str], json: Dict[str, Any], timeout: int):
        with self._lock:
            self.calls.append(
                {
                    "url": url,
                    "headers": dict(headers),
                    "json": dict(json),
                    "timeout": timeout,
                }
            )
            if not self.responses:
                raise RuntimeError("No stub response configured for request.")
            return self.responses.pop(0)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings: List[str] = []
        self.exceptions: List[str] = []

    def warning(self, message: str, *args: Any) -> None:
        self.warnings.append(message % args if args else message)

    def exception(self, message: str, *args: Any) -> None:
        self.exceptions.append(message % args if args else message)


def _build_orchestrator(*, ledger_path: Path, requests_stub: _RequestsStub) -> AgentRunOrchestrator:
    logger = _LoggerStub()

    def list_profiles() -> List[Dict[str, Any]]:
        return [
            {"id": "koro"},
            {"id": "devstral"},
            {"id": "sentinel"},
            {"id": "forge"},
            {"id": "draftsmith"},
            {"id": "gridsage"},
        ]

    def resolve_route(profile_id: str) -> Optional[Dict[str, Any]]:
        normalized = str(profile_id or "").strip().lower()
        if normalized == "devstral":
            return {
                "id": "devstral",
                "primary_model": "dev-primary",
                "fallback_models": [],
            }
        if normalized == "koro":
            return {
                "id": "koro",
                "primary_model": "koro-primary",
                "fallback_models": [],
            }
        return {
            "id": normalized,
            "primary_model": f"{normalized}-primary",
            "fallback_models": [],
        }

    return AgentRunOrchestrator(
        ledger_path=ledger_path,
        requests_module=requests_stub,
        logger=logger,
        agent_gateway_url="http://127.0.0.1:3000",
        agent_webhook_secret="",
        agent_require_webhook_secret=False,
        list_agent_profiles_fn=list_profiles,
        resolve_agent_profile_route_fn=resolve_route,
        default_timeout_ms=5_000,
        max_timeout_ms=20_000,
        max_parallel_profiles=2,
    )


class TestApiAgentOrchestrationRuntime(unittest.TestCase):
    def test_run_executes_stages_and_persists_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            responses = [
                _ResponseStub(status_code=200, payload={"response": "A devstral", "model": "dev-primary"}),
                _ResponseStub(status_code=200, payload={"response": "A sentinel", "model": "sentinel-primary"}),
                _ResponseStub(status_code=200, payload={"response": "B devstral", "model": "dev-primary"}),
                _ResponseStub(status_code=200, payload={"response": "B sentinel", "model": "sentinel-primary"}),
                _ResponseStub(status_code=200, payload={"response": "C koro", "model": "koro-primary"}),
            ]
            orchestrator = _build_orchestrator(
                ledger_path=Path(temp_dir) / "agent-runs.sqlite3",
                requests_stub=_RequestsStub(responses),
            )
            try:
                run_id = orchestrator.enqueue_run(
                    user_id="user-1",
                    user_email="user@example.com",
                    objective="Build a coordinated implementation plan.",
                    profiles=["devstral", "sentinel"],
                    synthesis_profile="koro",
                    context={"ticket": "SUITE-101"},
                    timeout_ms=10_000,
                    request_id="req-run-1",
                    gateway_token="token-1",
                )

                deadline = time.time() + 8
                status = orchestrator.get_run_status(run_id)
                while status not in TERMINAL_RUN_STATUSES and time.time() < deadline:
                    time.sleep(0.05)
                    status = orchestrator.get_run_status(run_id)

                self.assertEqual(status, "completed")

                snapshot = orchestrator.get_run_snapshot(run_id)
                self.assertIsNotNone(snapshot)
                assert snapshot is not None
                self.assertEqual(snapshot["status"], "completed")
                self.assertTrue(snapshot["finalOutput"])
                self.assertEqual(len(snapshot["tasks"]), 2)
                self.assertEqual(snapshot["taskSummary"]["total"], 2)
                self.assertEqual(snapshot["taskSummary"]["awaitingReview"], 2)
                self.assertEqual(len(snapshot["steps"]), 5)
                self.assertIn("stage_a", snapshot["stages"])
                self.assertIn("stage_b", snapshot["stages"])
                self.assertIn("stage_c", snapshot["stages"])

                event_types = {event["eventType"] for event in snapshot["messages"]}
                self.assertIn("run_enqueued", event_types)
                self.assertIn("run_started", event_types)
                self.assertIn("run_completed", event_types)
            finally:
                orchestrator.shutdown()

    def test_step_does_not_retry_alternate_model_on_5xx(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            responses = [
                _ResponseStub(status_code=500, payload={"error": "upstream unavailable"}),
                _ResponseStub(status_code=200, payload={"response": "B primary", "model": "dev-primary"}),
                _ResponseStub(status_code=200, payload={"response": "C synth", "model": "koro-primary"}),
            ]
            requests_stub = _RequestsStub(responses)
            orchestrator = _build_orchestrator(
                ledger_path=Path(temp_dir) / "agent-runs.sqlite3",
                requests_stub=requests_stub,
            )
            try:
                run_id = orchestrator.enqueue_run(
                    user_id="user-1",
                    user_email="user@example.com",
                    objective="Exercise fallback model retry path.",
                    profiles=["devstral"],
                    synthesis_profile="koro",
                    context={},
                    timeout_ms=10_000,
                    request_id="req-run-fallback",
                    gateway_token="token-1",
                )

                deadline = time.time() + 8
                status = orchestrator.get_run_status(run_id)
                while status not in TERMINAL_RUN_STATUSES and time.time() < deadline:
                    time.sleep(0.05)
                    status = orchestrator.get_run_status(run_id)

                self.assertEqual(status, "completed")

                snapshot = orchestrator.get_run_snapshot(run_id)
                self.assertIsNotNone(snapshot)
                assert snapshot is not None

                stage_a_steps = [step for step in snapshot["steps"] if step["stage"] == "stage_a"]
                self.assertEqual(len(stage_a_steps), 1)
                self.assertEqual(stage_a_steps[0]["modelUsed"], "dev-primary")
                self.assertEqual(stage_a_steps[0]["status"], "failed")
                self.assertEqual(len(requests_stub.calls), 3)
                self.assertTrue(
                    all("fallback_models" not in call.get("json", {}) for call in requests_stub.calls)
                )
            finally:
                orchestrator.shutdown()

    def test_tasks_and_activity_lifecycle_support_review_actions(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            responses = [
                _ResponseStub(status_code=200, payload={"response": "A devstral", "model": "dev-primary"}),
                _ResponseStub(status_code=200, payload={"response": "A sentinel", "model": "sentinel-primary"}),
                _ResponseStub(status_code=200, payload={"response": "B devstral", "model": "dev-primary"}),
                _ResponseStub(status_code=200, payload={"response": "B sentinel", "model": "sentinel-primary"}),
                _ResponseStub(status_code=200, payload={"response": "C synth", "model": "koro-primary"}),
            ]
            orchestrator = _build_orchestrator(
                ledger_path=Path(temp_dir) / "agent-runs.sqlite3",
                requests_stub=_RequestsStub(responses),
            )
            try:
                run_id = orchestrator.enqueue_run(
                    user_id="user-1",
                    user_email="user@example.com",
                    objective="Execute a coordinated reliability check.",
                    profiles=["devstral", "sentinel"],
                    synthesis_profile="koro",
                    context={"priority": "high"},
                    timeout_ms=10_000,
                    request_id="req-run-task-1",
                    gateway_token="token-1",
                )

                deadline = time.time() + 8
                status = orchestrator.get_run_status(run_id)
                while status not in TERMINAL_RUN_STATUSES and time.time() < deadline:
                    time.sleep(0.05)
                    status = orchestrator.get_run_status(run_id)

                self.assertEqual(status, "completed")

                tasks = orchestrator.list_tasks(user_id="user-1")
                self.assertEqual(len(tasks), 2)
                self.assertTrue(all(task["status"] == "awaiting_review" for task in tasks))
                self.assertTrue(all(task["priority"] == "high" for task in tasks))

                reviewed = orchestrator.review_task(
                    task_id=str(tasks[0]["taskId"]),
                    reviewer_id="user-1",
                    action="approve",
                    note="Approved in test.",
                    request_id="req-review-1",
                )
                self.assertIsNotNone(reviewed)
                assert reviewed is not None
                self.assertEqual(reviewed["status"], "approved")
                self.assertEqual(reviewed["reviewAction"], "approve")

                activity = orchestrator.list_activity(user_id="user-1", run_id=run_id, limit=200)
                event_types = {str(item.get("eventType") or "") for item in activity}
                self.assertIn("run_enqueued", event_types)
                self.assertIn("task_queued", event_types)
                self.assertIn("task_awaiting_review", event_types)
                self.assertIn("task_reviewed", event_types)
            finally:
                orchestrator.shutdown()


if __name__ == "__main__":
    unittest.main()
