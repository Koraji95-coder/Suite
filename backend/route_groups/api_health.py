from __future__ import annotations

import time

from flask import Blueprint, jsonify


def create_health_blueprint() -> Blueprint:
    """Create /health route blueprint."""
    bp = Blueprint("health_api", __name__)

    @bp.route("/health", methods=["GET"])
    def health():
        return jsonify(
            {
                "status": "running",
                "server": "Coordinates Grabber API",
                "backend_id": "coordinates-grabber-api",
                "version": "1.0.0",
                "timestamp": time.time(),
            }
        )

    return bp
