from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Callable

from flask import Blueprint, jsonify, request, send_file
from flask_limiter import Limiter

from .api_transmittal_pdf_analysis import analyze_pdf_title_block


def create_transmittal_blueprint(
    *,
    require_api_key: Callable,
    limiter: Limiter,
    load_transmittal_profiles_payload: Callable[[], dict[str, Any]],
    transmittal_template_path: Path,
) -> Blueprint:
    """Create /api/transmittal route group blueprint."""
    bp = Blueprint("transmittal_api", __name__, url_prefix="/api/transmittal")

    @bp.route("/profiles", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_transmittal_profiles():
        payload = load_transmittal_profiles_payload()
        return jsonify(
            {
                "success": True,
                "profiles": payload.get("profiles", []),
                "firm_numbers": payload.get("firm_numbers", []),
                "defaults": payload.get("defaults", {}),
            }
        )

    @bp.route("/template", methods=["GET"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_transmittal_template():
        if not transmittal_template_path.exists():
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Example template not found on server.",
                    }
                ),
                404,
            )
        return send_file(
            str(transmittal_template_path),
            as_attachment=True,
            download_name=transmittal_template_path.name,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    @bp.route("/analyze-pdfs", methods=["POST"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_transmittal_analyze_pdfs():
        files = request.files.getlist("documents")
        if not files:
            files = request.files.getlist("pdfs")
        if not files:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "At least one PDF document is required.",
                    }
                ),
                400,
            )

        documents = []
        warnings = []
        for file_storage in files:
            filename = str(getattr(file_storage, "filename", "") or "").strip() or "document.pdf"
            if not filename.lower().endswith(".pdf"):
                warnings.append(f"Skipped non-PDF file '{filename}'.")
                continue
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                    temp_path = Path(temp_file.name)
                    file_storage.save(temp_file)
                try:
                    analysis = analyze_pdf_title_block(str(temp_path))
                finally:
                    temp_path.unlink(missing_ok=True)
            except Exception as exc:
                documents.append(
                    {
                        "file_name": filename,
                        "drawing_number": "",
                        "title": "",
                        "revision": "",
                        "confidence": 0.0,
                        "source": "analysis_failed",
                        "needs_review": True,
                        "accepted": False,
                        "override_reason": None,
                        "recognition": {
                            "model_version": "deterministic-v1",
                            "confidence": 0.0,
                            "source": "analysis_failed",
                            "feature_source": "titleblock_lines",
                            "reason_codes": ["analysis_failed"],
                            "needs_review": True,
                            "accepted": False,
                            "override_reason": None,
                        },
                        "error": "Document analysis failed.",
                    }
                )
                continue

            documents.append(
                {
                    "file_name": filename,
                    "drawing_number": analysis.get("drawing_number", ""),
                    "title": analysis.get("title", ""),
                    "revision": analysis.get("revision", ""),
                    "confidence": analysis.get("confidence", 0.0),
                    "source": analysis.get("source", "embedded_text"),
                    "needs_review": bool(analysis.get("needs_review")),
                    "accepted": bool(analysis.get("accepted")),
                    "override_reason": analysis.get("override_reason"),
                    "recognition": analysis.get("recognition", {}),
                    "fields": analysis.get("fields", {}),
                }
            )

        return jsonify(
            {
                "success": True,
                "documents": documents,
                "warnings": warnings,
            }
        )

    return bp
