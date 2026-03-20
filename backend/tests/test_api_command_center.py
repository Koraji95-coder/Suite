from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_command_center import create_command_center_blueprint


class TestApiCommandCenter(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.status_dir = Path(self.temp_dir.name)
        (self.status_dir / "last-preflight.json").write_text(
            '{"kind":"preflight","ok":true,"pushReady":false,"summary":"Hosted Supabase preflight is ready."}\n',
            encoding="utf-8",
        )
        (self.status_dir / "last-push.json").write_text(
            '{"kind":"push","ok":false,"summary":"Hosted push aborted because preflight failed."}\n',
            encoding="utf-8",
        )
        (self.status_dir / "supabase-sync.log").write_text(
            "[2026-03-19T10:00:00Z] preflight: ok\n[2026-03-19T10:01:00Z] push: error\n",
            encoding="utf-8",
        )

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
            create_command_center_blueprint(
                limiter=limiter,
                logger=app.logger,
                require_supabase_user=require_supabase_user,
                status_dir=self.status_dir,
            )
        )
        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_returns_supabase_sync_status_payload(self) -> None:
        response = self.client.get("/api/command-center/supabase-sync-status")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(
            ((payload.get("paths") or {}).get("root")),
            str(self.status_dir),
        )
        self.assertEqual(
            ((payload.get("lastPreflight") or {}).get("kind")),
            "preflight",
        )
        self.assertFalse(bool((payload.get("lastPreflight") or {}).get("pushReady")))
        self.assertEqual(((payload.get("lastPush") or {}).get("kind")), "push")
        self.assertEqual(len(payload.get("logTail") or []), 2)


if __name__ == "__main__":
    unittest.main()
