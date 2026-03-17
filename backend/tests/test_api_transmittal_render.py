from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path

from flask import Flask, jsonify, request
from flask_limiter import Limiter
from werkzeug.utils import secure_filename

from backend.route_groups.api_transmittal_render import (
    create_transmittal_render_blueprint,
)


class TestApiTransmittalRender(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.render_calls = []
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

        def parse_json_field(name: str, default=None):
            raw = request.form.get(name, "")
            if not raw:
                return default
            return json.loads(raw)

        def save_upload(file_storage, target_dir: str, filename: str | None = None):
            output_name = filename or secure_filename(file_storage.filename or "upload.bin")
            output_path = Path(target_dir) / output_name
            file_storage.save(output_path)
            return str(output_path)

        def render_transmittal(
            _template_path: str,
            _docs_dir: str,
            index_path: str,
            fields: dict,
            checks: dict,
            contacts: list,
            out_path: str,
            selected_files,
        ) -> None:
            self.render_calls.append(
                {
                    "index_path": index_path,
                    "fields": fields,
                    "checks": checks,
                    "contacts": contacts,
                    "selected_files": selected_files,
                }
            )
            Path(out_path).write_text("rendered", encoding="utf-8")

        app.register_blueprint(
            create_transmittal_render_blueprint(
                require_api_key=require_api_key,
                limiter=limiter,
                deps={
                    "TRANSMITTAL_RENDER_AVAILABLE": True,
                    "_parse_json_field": parse_json_field,
                    "_load_transmittal_profiles_payload": lambda: {
                        "profiles": [{"id": "valid-profile", "name": "Valid Sender"}],
                        "firm_numbers": ["TX-12345"],
                        "defaults": {"profile_id": "valid-profile", "firm": "TX-12345"},
                    },
                    "_schedule_cleanup": lambda _path: None,
                    "_save_upload": save_upload,
                    "render_cid_transmittal": None,
                    "render_transmittal": render_transmittal,
                    "_convert_docx_to_pdf": None,
                },
            )
        )

        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_render_rejects_invalid_profile_selection(self) -> None:
        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
            data={
                "fields": json.dumps({"from_profile_id": "missing-profile"}),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("Invalid transmittal profile", str(payload.get("message")))

    def test_render_requires_template_file(self) -> None:
        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
            data={},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("Template file is required", str(payload.get("message")))

    def test_render_pdf_mode_requires_pdf_helper(self) -> None:
        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
            data={
                "format": "pdf",
                "template": (io.BytesIO(b"template"), "template.docx"),
                "index": (io.BytesIO(b"index"), "index.xlsx"),
                "documents": (io.BytesIO(b"doc"), "drawing1.pdf"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 503)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("PDF conversion helper unavailable", str(payload.get("message")))

    def test_render_standard_allows_reviewed_pdf_document_data_without_index(self) -> None:
        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
            data={
                "template": (io.BytesIO(b"template"), "template.docx"),
                "documents": (io.BytesIO(b"doc"), "drawing1.pdf"),
                "fields": json.dumps({"job_num": "23001", "from_profile_id": "valid-profile"}),
                "pdf_document_data": json.dumps(
                    [
                        {
                            "file_name": "drawing1.pdf",
                            "drawing_number": "E1-100",
                            "title": "Floor Plan",
                            "revision": "2",
                            "confidence": 0.91,
                            "source": "embedded_text",
                            "needs_review": False,
                            "accepted": True,
                            "override_reason": "",
                        }
                    ]
                ),
            },
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(len(self.render_calls), 1)
        call = self.render_calls[0]
        self.assertTrue(str(call["index_path"]).endswith("index.generated.xlsx"))
        self.assertIsInstance(call["selected_files"], list)
        self.assertEqual(len(call["selected_files"]), 1)
        self.assertIn("E1-100", Path(call["selected_files"][0]).name)

    def test_render_standard_rejects_unreviewed_pdf_document_data_without_index(self) -> None:
        response = self.client.post(
            "/api/transmittal/render",
            headers={"X-API-Key": "valid-key"},
            data={
                "template": (io.BytesIO(b"template"), "template.docx"),
                "documents": (io.BytesIO(b"doc"), "drawing1.pdf"),
                "fields": json.dumps({"job_num": "23001", "from_profile_id": "valid-profile"}),
                "pdf_document_data": json.dumps(
                    [
                        {
                            "file_name": "drawing1.pdf",
                            "drawing_number": "E1-100",
                            "title": "Floor Plan",
                            "revision": "2",
                            "confidence": 0.42,
                            "source": "ocr",
                            "needs_review": True,
                            "accepted": False,
                            "override_reason": "",
                        }
                    ]
                ),
            },
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json() or {}
        self.assertFalse(payload.get("success", True))
        self.assertIn("requires review before render", str(payload.get("message")))


if __name__ == "__main__":
    unittest.main()
