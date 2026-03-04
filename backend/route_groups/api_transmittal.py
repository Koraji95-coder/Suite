from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from flask import Blueprint, jsonify, send_file
from flask_limiter import Limiter


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

    return bp
