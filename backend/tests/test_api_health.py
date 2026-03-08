from __future__ import annotations

import unittest

from flask import Flask

from backend.route_groups.api_health import create_health_blueprint


class TestApiHealth(unittest.TestCase):
    def setUp(self) -> None:
        app = Flask(__name__)
        app.config["TESTING"] = True
        app.register_blueprint(create_health_blueprint())
        self.client = app.test_client()

    def test_health_payload_contract(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertEqual(payload.get("status"), "running")
        self.assertEqual(payload.get("backend_id"), "coordinates-grabber-api")
        self.assertEqual(payload.get("version"), "1.0.0")
        self.assertIsInstance(payload.get("timestamp"), float)


if __name__ == "__main__":
    unittest.main()
