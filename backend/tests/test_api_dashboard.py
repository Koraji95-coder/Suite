from __future__ import annotations

import time
import unittest
from typing import Any, Dict, Optional

from flask import Flask, g, jsonify
from flask_limiter import Limiter

from backend.route_groups.api_dashboard import create_dashboard_blueprint


class _ResponseStub:
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)
        self.content = b"{}"

    @property
    def ok(self) -> bool:
        return self.status_code < 400

    def json(self) -> Any:
        return self._payload


class _RequestsStub:
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, str]] = None,
        json: Any = None,
        timeout: int = 0,
    ) -> _ResponseStub:
        _ = (method, headers, json, timeout)
        table = url.split("/rest/v1/", 1)[1]
        params = params or {}

        if table == "projects":
            status_filter = params.get("status")
            id_filter = params.get("id", "")
            if status_filter == "eq.active":
                return _ResponseStub(
                    200,
                    [
                        {
                            "id": "project-1",
                            "name": "Alpha",
                            "deadline": "2030-01-15",
                            "status": "active",
                            "priority": "high",
                            "color": "#22c55e",
                            "category": "Substation",
                        }
                    ],
                )
            if "project-2" in id_filter:
                return _ResponseStub(
                    200,
                    [
                        {
                            "id": "project-2",
                            "name": "Legacy",
                            "deadline": None,
                            "status": "hold",
                            "priority": "low",
                            "color": "#60a5fa",
                            "category": "Legacy",
                        }
                    ],
                )
            return _ResponseStub(200, [])

        if table == "activity_log":
            return _ResponseStub(
                200,
                [
                    {
                        "id": "act-1",
                        "action": "created",
                        "description": "Created task",
                        "project_id": "project-1",
                        "task_id": "task-1",
                        "timestamp": "2030-01-10T10:00:00Z",
                        "user_id": "user-1",
                    },
                    {
                        "id": "act-2",
                        "action": "updated",
                        "description": "Updated legacy project",
                        "project_id": "project-2",
                        "task_id": None,
                        "timestamp": "2030-01-11T11:00:00Z",
                        "user_id": "user-1",
                    },
                ],
            )

        if table == "files":
            return _ResponseStub(200, [{"size": 512}, {"size": 1024}])

        if table == "tasks":
            return _ResponseStub(
                200,
                [
                    {
                        "id": "task-1",
                        "project_id": "project-1",
                        "completed": False,
                        "due_date": "2030-01-20",
                        "name": "Issue IFC",
                    },
                    {
                        "id": "task-2",
                        "project_id": "project-1",
                        "completed": True,
                        "due_date": "2030-01-12",
                        "name": "QC review",
                    },
                ],
            )

        return _ResponseStub(404, {"error": "unknown table"})


class TestApiDashboard(unittest.TestCase):
    def setUp(self) -> None:
        app = Flask(__name__)
        app.config["TESTING"] = True

        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_supabase_user(f):
            def wrapped(*args, **kwargs):
                g.supabase_user = {"id": "user-1", "email": "user@example.com"}
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_dashboard_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                supabase_url="https://example.supabase.co",
                supabase_api_key="anon-key",
                requests_module=_RequestsStub(),
            )
        )

        self.client = app.test_client()

    def test_load_requires_bearer_token(self) -> None:
        response = self.client.post("/api/dashboard/load")
        self.assertEqual(response.status_code, 401)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        self.assertIn("error", payload)

    def test_load_job_completes_and_returns_payload(self) -> None:
        headers = {"Authorization": "Bearer test-access-token"}
        response = self.client.post("/api/dashboard/load", headers=headers)
        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        job_id = str(payload.get("job_id") or "")
        self.assertTrue(job_id)

        status_payload: Dict[str, Any] = {}
        for _ in range(100):
            status_response = self.client.get(
                f"/api/dashboard/load/{job_id}",
                headers=headers,
            )
            self.assertEqual(status_response.status_code, 200)
            status_payload = status_response.get_json() or {}
            if status_payload.get("status") == "complete":
                break
            time.sleep(0.01)

        self.assertEqual(status_payload.get("status"), "complete")
        self.assertEqual(status_payload.get("progress"), 100)

        data = status_payload.get("data") or {}
        self.assertEqual(len(data.get("projects", [])), 1)
        self.assertEqual(len(data.get("activities", [])), 2)
        self.assertEqual(data.get("storageUsed"), 1536)

        task_counts = data.get("projectTaskCounts") or {}
        self.assertIn("project-1", task_counts)
        self.assertEqual(task_counts["project-1"].get("total"), 2)
        self.assertEqual(task_counts["project-1"].get("completed"), 1)

        all_projects = data.get("allProjects") or []
        self.assertEqual(len(all_projects), 2)


if __name__ == "__main__":
    unittest.main()
