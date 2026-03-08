from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, jsonify, request
from flask_limiter import Limiter

from backend.route_groups.api_backup import create_backup_blueprint


class TestApiBackup(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        app = Flask(__name__)
        app.config["TESTING"] = True

        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_api_key(f):
            def wrapped(*args, **kwargs):
                if request.headers.get("X-API-Key") != "valid-key":
                    return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_backup_blueprint(
                require_api_key=require_api_key,
                limiter=limiter,
                logger=app.logger,
                backup_storage_dir=Path(self.temp_dir.name),
                backup_max_bytes=16,
                backup_max_files=10,
            )
        )

        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_save_requires_json_payload(self) -> None:
        response = self.client.post(
            "/api/backup/save",
            headers={"X-API-Key": "valid-key"},
            data="plain-text",
            content_type="text/plain",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertIn("Expected JSON payload", str(payload.get("error")))

    def test_save_rejects_oversized_backup(self) -> None:
        response = self.client.post(
            "/api/backup/save",
            headers={"X-API-Key": "valid-key"},
            json={"filename": "large.yaml", "content": "x" * 100},
        )
        self.assertEqual(response.status_code, 413)
        payload = response.get_json() or {}
        self.assertIn("max size", str(payload.get("error")))

    def test_read_requires_file_query_param(self) -> None:
        response = self.client.get(
            "/api/backup/read",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertIn("Missing file", str(payload.get("error")))

    def test_delete_returns_not_found_for_missing_file(self) -> None:
        response = self.client.delete(
            "/api/backup/delete?file=missing.yaml",
            headers={"X-API-Key": "valid-key"},
        )
        self.assertEqual(response.status_code, 404)
        payload = response.get_json() or {}
        self.assertIn("not found", str(payload.get("error")).lower())


if __name__ == "__main__":
    unittest.main()
