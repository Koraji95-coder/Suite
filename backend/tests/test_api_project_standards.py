from __future__ import annotations

import unittest

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_project_standards import (
    create_project_standards_blueprint,
)


class _ResponseStub:
    def __init__(self, status_code: int, payload, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = b"" if payload is None else b"json"

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self) -> None:
        self.get_response = _ResponseStub(200, [])
        self.post_response = _ResponseStub(204, None)
        self.last_get = None
        self.last_post = None

    def get(self, url, headers=None, params=None, timeout=None):
        self.last_get = {
            "url": url,
            "headers": headers,
            "params": params,
            "timeout": timeout,
        }
        return self.get_response

    def post(self, url, headers=None, params=None, json=None, timeout=None):
        self.last_post = {
            "url": url,
            "headers": headers,
            "params": params,
            "json": json,
            "timeout": timeout,
        }
        return self.post_response


class TestApiProjectStandards(unittest.TestCase):
    def setUp(self) -> None:
        self.requests_stub = _RequestsStub()

        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        limiter = Limiter(
            app=self.app,
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

        self.app.register_blueprint(
            create_project_standards_blueprint(
                limiter=limiter,
                logger=self.app.logger,
                require_supabase_user=require_supabase_user,
                api_key="test-secret",
                supabase_url="http://supabase.test",
                supabase_api_key="sb-key",
                requests_module=self.requests_stub,
            )
        )
        self.client = self.app.test_client()

    def test_profile_get_returns_default_when_missing(self) -> None:
        response = self.client.get(
            "/api/project-standards/projects/project-1/profile",
            headers={"Authorization": "Bearer token-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["projectId"], "project-1")
        self.assertEqual(payload["data"]["standardsCategory"], "NEC")
        self.assertEqual(payload["data"]["selectedStandardIds"], [])

    def test_profile_get_normalizes_user_settings_row(self) -> None:
        self.requests_stub.get_response = _ResponseStub(
            200,
            [
                {
                    "id": "setting-1",
                    "project_id": "project-1",
                    "user_id": "user-1",
                    "setting_key": "project_standards_profile",
                    "setting_value": {
                        "cadFamilyId": "nfpa",
                        "standardsCategory": "IEEE",
                        "selectedStandardIds": ["ieee-80", "ieee-1584", "ieee-80"],
                    },
                    "created_at": "2026-04-03T01:00:00Z",
                    "updated_at": "2026-04-03T02:00:00Z",
                }
            ],
        )

        response = self.client.get(
            "/api/project-standards/projects/project-1/profile",
            headers={"Authorization": "Bearer token-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["cadFamilyId"], "nfpa")
        self.assertEqual(payload["data"]["standardsCategory"], "IEEE")
        self.assertEqual(
            payload["data"]["selectedStandardIds"],
            ["ieee-80", "ieee-1584"],
        )
        self.assertEqual(
            self.requests_stub.last_get["params"]["setting_key"],
            "eq.project_standards_profile",
        )

    def test_profile_put_uses_upsert_user_setting_rpc(self) -> None:
        self.requests_stub.post_response = _ResponseStub(204, None)
        self.requests_stub.get_response = _ResponseStub(
            200,
            [
                {
                    "id": "setting-1",
                    "project_id": "project-1",
                    "user_id": "user-1",
                    "setting_key": "project_standards_profile",
                    "setting_value": {
                        "cadFamilyId": "jic",
                        "standardsCategory": "NEC",
                        "selectedStandardIds": ["nec-210", "nec-250"],
                    },
                    "created_at": "2026-04-03T01:00:00Z",
                    "updated_at": "2026-04-03T03:00:00Z",
                }
            ],
        )

        response = self.client.put(
            "/api/project-standards/projects/project-1/profile",
            headers={"Authorization": "Bearer token-1"},
            json={
                "cadFamilyId": "jic",
                "standardsCategory": "NEC",
                "selectedStandardIds": ["nec-210", "nec-250"],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["cadFamilyId"], "jic")
        self.assertEqual(
            self.requests_stub.last_post["url"],
            "http://supabase.test/rest/v1/rpc/upsert_user_setting",
        )
        self.assertEqual(
            self.requests_stub.last_post["json"]["p_setting_key"],
            "project_standards_profile",
        )
        self.assertEqual(
            self.requests_stub.last_post["json"]["p_project_id"],
            "project-1",
        )

    def test_ticket_post_returns_signed_ticket(self) -> None:
        response = self.client.post(
            "/api/project-standards/tickets",
            json={
                "action": "run-review",
                "projectId": "project-1",
                "requestId": "req-1",
                "origin": "http://127.0.0.1:5173",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["action"], "run-review")
        self.assertEqual(payload["projectId"], "project-1")
        self.assertTrue(payload["ticket"])

    def test_latest_review_get_returns_default_when_missing(self) -> None:
        response = self.client.get(
            "/api/project-standards/projects/project-1/latest-review",
            headers={"Authorization": "Bearer token-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["projectId"], "project-1")
        self.assertEqual(payload["data"]["results"], [])

    def test_results_post_uses_upsert_user_setting_rpc(self) -> None:
        self.requests_stub.post_response = _ResponseStub(204, None)
        self.requests_stub.get_response = _ResponseStub(
            200,
            [
                {
                    "id": "setting-2",
                    "project_id": "project-1",
                    "user_id": "user-1",
                    "setting_key": "project_standards_latest_review",
                    "setting_value": {
                        "requestId": "req-1",
                        "recordedAt": "2026-04-03T03:30:00Z",
                        "cadFamilyId": "jic",
                        "standardsCategory": "NEC",
                        "selectedStandardIds": ["nec-210"],
                        "results": [
                            {
                                "standardId": "nec-210",
                                "status": "fail",
                                "message": "Follow-up required.",
                            }
                        ],
                        "warnings": ["No .dws file found."],
                        "summary": {"drawingCount": 3},
                        "meta": {"providerPath": "runtime-control"},
                        "overallStatus": "fail",
                    },
                    "created_at": "2026-04-03T03:30:00Z",
                    "updated_at": "2026-04-03T03:30:00Z",
                }
            ],
        )

        response = self.client.post(
            "/api/project-standards/results",
            headers={"Authorization": "Bearer token-1"},
            json={
                "projectId": "project-1",
                "requestId": "req-1",
                "cadFamilyId": "jic",
                "standardsCategory": "NEC",
                "selectedStandardIds": ["nec-210"],
                "results": [
                    {
                        "standardId": "nec-210",
                        "status": "fail",
                        "message": "Follow-up required.",
                    }
                ],
                "warnings": ["No .dws file found."],
                "summary": {"drawingCount": 3},
                "meta": {"providerPath": "runtime-control"},
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["overallStatus"], "fail")
        self.assertEqual(
            self.requests_stub.last_post["url"],
            "http://supabase.test/rest/v1/rpc/upsert_user_setting",
        )
        self.assertEqual(
            self.requests_stub.last_post["json"]["p_setting_key"],
            "project_standards_latest_review",
        )

    def test_profile_get_returns_default_when_storage_missing(self) -> None:
        self.requests_stub.get_response = _ResponseStub(
            404,
            {"message": 'relation "user_settings" does not exist'},
            text='relation "user_settings" does not exist',
        )

        response = self.client.get(
            "/api/project-standards/projects/project-1/profile",
            headers={"Authorization": "Bearer token-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["projectId"], "project-1")
        self.assertEqual(payload["data"]["cadFamilyId"], None)


if __name__ == "__main__":
    unittest.main()
