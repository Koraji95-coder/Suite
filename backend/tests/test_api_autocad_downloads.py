from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from flask import Flask, g
from flask_limiter import Limiter

from backend.route_groups.api_autocad import create_autocad_blueprint


class _FakeManager:
    def __init__(self, allowed_path: str | None) -> None:
        self.allowed_path = str(Path(allowed_path).resolve()) if allowed_path else None

    def resolve_allowed_export_path_by_name(self, file_name: str) -> str | None:
        if not self.allowed_path:
            return None
        allowed_name = Path(self.allowed_path).name
        return self.allowed_path if allowed_name == file_name else None

    def is_allowed_export_path(self, path_value: str) -> bool:
        if not self.allowed_path:
            return False
        return str(Path(path_value).resolve()) == self.allowed_path


class TestApiAutocadDownloads(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.export_path = Path(self.temp_dir.name) / "coordinates_20260405_123000.xlsx"
        self.export_path.write_text("xlsx", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_client(
        self,
        manager: _FakeManager,
        *,
        issue_ws_ticket=None,
    ):
        app = Flask(__name__)
        app.config["TESTING"] = True
        limiter = Limiter(
            app=app,
            key_func=lambda: "test-client",
            default_limits=[],
            storage_uri="memory://",
            strategy="fixed-window",
        )

        def require_autocad_auth(f):
            def wrapped(*args, **kwargs):
                g.autocad_auth_mode = "test"
                return f(*args, **kwargs)

            wrapped.__name__ = getattr(f, "__name__", "wrapped")
            return wrapped

        app.register_blueprint(
            create_autocad_blueprint(
                require_autocad_auth=require_autocad_auth,
                limiter=limiter,
                issue_ws_ticket=issue_ws_ticket or (lambda **_kwargs: {}),
                logger=app.logger,
                get_manager=lambda: manager,
                connect_autocad=lambda: None,
                dyn=lambda value: value,
                pythoncom=object(),
                conduit_route_autocad_provider="com",
                send_autocad_dotnet_command=None,
                send_autocad_acade_command=None,
                validate_layer_config=lambda value: value,
                traceback_module=__import__("traceback"),
            )
        )
        return app.test_client()

    def test_download_result_resolves_registered_export_by_file_name(self) -> None:
        client = self._create_client(_FakeManager(str(self.export_path)))

        response = client.get(
            "/api/download-result",
            query_string={"path": r"C:\untrusted\coordinates_20260405_123000.xlsx"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Content-Disposition"),
            'attachment; filename=coordinates_20260405_123000.xlsx',
        )
        response.close()

    def test_open_export_folder_rejects_unregistered_export_name(self) -> None:
        client = self._create_client(_FakeManager(None))

        response = client.post(
            "/api/open-export-folder",
            json={"path": r"C:\untrusted\coordinates_20260405_123000.xlsx"},
        )

        self.assertEqual(response.status_code, 404)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success"))
        self.assertEqual(payload.get("code"), "FILE_NOT_FOUND")

    def test_ws_ticket_hides_internal_exception_text(self) -> None:
        client = self._create_client(
            _FakeManager(None),
            issue_ws_ticket=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("secret boom")),
        )

        response = client.post("/api/autocad/ws-ticket")

        self.assertEqual(response.status_code, 500)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertEqual(payload.get("code"), "WS_TICKET_ISSUE_FAILED")
        self.assertEqual(payload.get("message"), "Failed to issue websocket ticket.")
        self.assertNotIn("secret boom", str(payload))


if __name__ == "__main__":
    unittest.main()
