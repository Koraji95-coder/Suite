from __future__ import annotations

import time
from typing import Any, Dict

from flask import Blueprint, current_app, jsonify


def _limiter_health_payload() -> Dict[str, Any]:
    limiter_runtime = current_app.config.get("LIMITER_RUNTIME_STATUS")
    if not isinstance(limiter_runtime, dict):
        return {
            "storage": "unknown",
            "degraded": False,
            "reason": "uninitialized",
        }
    return {
        "storage": str(limiter_runtime.get("storage") or "unknown"),
        "degraded": bool(limiter_runtime.get("degraded", False)),
        "reason": str(limiter_runtime.get("reason") or ""),
    }


def _agent_session_store_payload() -> Dict[str, Any]:
    runtime = current_app.config.get("AGENT_SESSION_STORE_STATUS")
    if not isinstance(runtime, dict):
        return {
            "mode": "memory",
            "reason": "uninitialized",
        }
    payload = {
        "mode": str(runtime.get("mode") or "memory"),
        "reason": str(runtime.get("reason") or ""),
    }
    redis_url = str(runtime.get("redis_url") or "").strip()
    if redis_url:
        payload["redis_url"] = redis_url
    key_prefix = str(runtime.get("key_prefix") or "").strip()
    if key_prefix:
        payload["key_prefix"] = key_prefix
    return payload


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
                "limiter": _limiter_health_payload(),
                "agent_session_store": _agent_session_store_payload(),
            }
        )

    return bp
