from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask, jsonify, request
from flask_limiter import Limiter

from backend.route_groups.api_transmittal import create_transmittal_blueprint


class TestApiTransmittal(unittest.TestCase):
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

        template_path = Path(self.temp_dir.name) / "template.docx"
        template_path.write_text("template", encoding="utf-8")

        app.register_blueprint(
            create_transmittal_blueprint(
                require_api_key=require_api_key,
                limiter=limiter,
                load_transmittal_profiles_payload=lambda: {
                    "profiles": [],
                    "firm_numbers": [],
                    "defaults": {},
                },
                transmittal_template_path=template_path,
            )
        )

        self.client = app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_analyze_pdfs_returns_detected_title_block_data(self) -> None:
        with patch(
            "backend.route_groups.api_transmittal.analyze_pdf_title_block",
            return_value={
                "drawing_number": "E1-100",
                "title": "One-Line Diagram",
                "revision": "3",
                "confidence": 0.94,
                "source": "embedded_text",
                "needs_review": False,
                "accepted": True,
                "override_reason": None,
                "recognition": {
                    "model_version": "deterministic-v1",
                    "confidence": 0.94,
                    "source": "embedded_text",
                    "feature_source": "titleblock_lines",
                    "reason_codes": ["titleblock_analysis"],
                    "needs_review": False,
                    "accepted": True,
                    "override_reason": None,
                },
                "fields": {
                    "drawing_number": {
                        "value": "E1-100",
                        "confidence": 0.95,
                        "source": "embedded_text",
                        "reason_codes": ["pattern_match"],
                        "model_version": "deterministic-v1",
                    }
                },
            },
        ):
            response = self.client.post(
                "/api/transmittal/analyze-pdfs",
                headers={"X-API-Key": "valid-key"},
                data={
                    "documents": (io.BytesIO(b"%PDF-1.7"), "sheet-01.pdf"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        documents = payload.get("documents") or []
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]["file_name"], "sheet-01.pdf")
        self.assertEqual(documents[0]["drawing_number"], "E1-100")
        self.assertEqual(documents[0]["title"], "One-Line Diagram")
        self.assertEqual(documents[0]["revision"], "3")
        self.assertFalse(documents[0]["needs_review"])

    def test_analyze_pdfs_skips_non_pdf_uploads(self) -> None:
        response = self.client.post(
            "/api/transmittal/analyze-pdfs",
            headers={"X-API-Key": "valid-key"},
            data={
                "documents": (io.BytesIO(b"text"), "notes.txt"),
            },
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("documents"), [])
        warnings = payload.get("warnings") or []
        self.assertTrue(any("Skipped non-PDF file" in str(entry) for entry in warnings))


if __name__ == "__main__":
    unittest.main()
