from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from flask import Blueprint, jsonify, request
from flask_limiter import Limiter

DEFAULT_RULES: List[Dict[str, Any]] = [
    {
        "id": "delete-red-cloud",
        "category": "DELETE",
        "trigger": {"type": "cloud", "color": "red", "text_contains": "delete"},
        "action": "Remove all geometry inside the cloud boundary",
        "confidence": 0.92,
    },
    {
        "id": "add-green-cloud",
        "category": "ADD",
        "trigger": {"type": "cloud", "color": "green", "text_contains": ""},
        "action": "Add geometry drawn inside green cloud to model",
        "confidence": 0.88,
    },
    {
        "id": "note-blue-text",
        "category": "NOTE",
        "trigger": {"type": "text", "color": "blue", "text_contains": ""},
        "action": "Log as note only; do not modify geometry",
        "confidence": 0.95,
    },
    {
        "id": "swap-blue-arrows",
        "category": "SWAP",
        "trigger": {"type": "arrow", "color": "blue", "count": 2},
        "action": "Swap the two elements connected by arrows",
        "confidence": 0.75,
    },
    {
        "id": "title-block-rect",
        "category": "TITLE_BLOCK",
        "trigger": {
            "type": "rectangle",
            "position": "bottom-right",
            "aspect": "wide",
        },
        "action": "Extract metadata only; skip geometry conversion",
        "confidence": 0.97,
    },
]


def _read_json_error(response: requests.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            for key in ("error", "message", "detail"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
    except Exception:
        pass
    return f"Upstream request failed ({response.status_code})"


def _proxy_json(
    *,
    base_url: str,
    method: str,
    path: str,
    timeout_seconds: int,
    payload: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    if not base_url:
        return None, "AutoDraft .NET API URL is not configured.", 503

    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    try:
        response = requests.request(
            method=method.upper(),
            url=url,
            json=payload,
            timeout=timeout_seconds,
        )
    except Exception as exc:
        return None, str(exc), 503

    if not response.ok:
        return None, _read_json_error(response), response.status_code

    try:
        parsed = response.json()
    except Exception:
        return None, "Upstream response was not valid JSON.", 502

    if not isinstance(parsed, dict):
        return None, "Upstream response must be a JSON object.", 502
    return parsed, None, response.status_code


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _rule_matches(rule: Dict[str, Any], markup: Dict[str, Any]) -> bool:
    trigger = rule.get("trigger")
    if not isinstance(trigger, dict):
        return False

    markup_type = _normalize_text(markup.get("type"))
    markup_color = _normalize_text(markup.get("color"))
    markup_text = _normalize_text(markup.get("text"))

    trigger_type = _normalize_text(trigger.get("type"))
    if trigger_type and trigger_type != markup_type:
        return False

    trigger_color = _normalize_text(trigger.get("color"))
    if trigger_color and trigger_color != "any" and trigger_color != markup_color:
        return False

    contains = _normalize_text(trigger.get("text_contains"))
    if contains and contains not in markup_text:
        return False

    return True


def _build_local_plan(markups: List[Dict[str, Any]]) -> Dict[str, Any]:
    actions: List[Dict[str, Any]] = []
    for idx, markup in enumerate(markups, start=1):
        selected_rule = next(
            (rule for rule in DEFAULT_RULES if _rule_matches(rule, markup)),
            None,
        )

        if selected_rule:
            action_item = {
                "id": f"action-{idx}",
                "rule_id": selected_rule["id"],
                "category": selected_rule["category"],
                "action": selected_rule["action"],
                "confidence": selected_rule["confidence"],
                "markup": markup,
                "status": "proposed",
            }
        else:
            action_item = {
                "id": f"action-{idx}",
                "rule_id": None,
                "category": "UNCLASSIFIED",
                "action": "Manual review required.",
                "confidence": 0.0,
                "markup": markup,
                "status": "review",
            }

        actions.append(action_item)

    summary = {
        "total_markups": len(markups),
        "actions_proposed": len(actions),
        "classified": sum(1 for item in actions if item["rule_id"]),
        "needs_review": sum(1 for item in actions if not item["rule_id"]),
    }

    return {"actions": actions, "summary": summary}


def create_autodraft_blueprint(
    *,
    require_api_key: Callable,
    limiter: Limiter,
    logger: Any,
    autodraft_dotnet_api_url: str,
) -> Blueprint:
    """Create /api/autodraft route group blueprint."""
    bp = Blueprint("autodraft_api", __name__, url_prefix="/api/autodraft")
    dotnet_base_url = (autodraft_dotnet_api_url or "").strip().rstrip("/")

    @bp.route("/health", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_autodraft_health():
        started_at = time.perf_counter()
        dotnet_status: Dict[str, Any] = {
            "configured": bool(dotnet_base_url),
            "reachable": False,
            "base_url": dotnet_base_url or None,
            "error": None,
            "payload": None,
        }

        if dotnet_base_url:
            payload, error, status = _proxy_json(
                base_url=dotnet_base_url,
                method="GET",
                path="/health",
                timeout_seconds=5,
            )
            if payload is not None:
                dotnet_status["reachable"] = True
                dotnet_status["payload"] = payload
                dotnet_status["status_code"] = status
            else:
                dotnet_status["error"] = error
                dotnet_status["status_code"] = status

        elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
        return (
            jsonify(
                {
                    "ok": True,
                    "app": "AutoDraft Studio",
                    "mode": "dotnet-proxy" if dotnet_base_url else "local-fallback",
                    "dotnet": dotnet_status,
                    "elapsed_ms": elapsed_ms,
                }
            ),
            200,
        )

    @bp.route("/rules", methods=["GET"])
    @require_api_key
    @limiter.limit("300 per hour")
    def api_autodraft_rules():
        return jsonify({"ok": True, "rules": DEFAULT_RULES}), 200

    @bp.route("/plan", methods=["POST"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_autodraft_plan():
        if not request.is_json:
            return jsonify({"error": "Expected JSON payload."}), 400

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify({"error": "Invalid JSON payload."}), 400

        if dotnet_base_url:
            upstream, error, status = _proxy_json(
                base_url=dotnet_base_url,
                method="POST",
                path="/api/autodraft/plan",
                timeout_seconds=20,
                payload=payload,
            )
            if upstream is not None:
                upstream["source"] = "dotnet"
                return jsonify(upstream), status
            logger.warning("AutoDraft .NET /plan unavailable. Falling back: %s", error)

        raw_markups = payload.get("markups")
        markups = raw_markups if isinstance(raw_markups, list) else []
        clean_markups = [
            item for item in markups if isinstance(item, dict)
        ]

        plan = _build_local_plan(clean_markups)
        plan["ok"] = True
        plan["source"] = "python-local-rules"
        return jsonify(plan), 200

    @bp.route("/execute", methods=["POST"])
    @require_api_key
    @limiter.limit("20 per hour")
    def api_autodraft_execute():
        if not request.is_json:
            return jsonify({"error": "Expected JSON payload."}), 400
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify({"error": "Invalid JSON payload."}), 400

        if not dotnet_base_url:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": (
                            "Execution requires .NET API integration. Configure "
                            "AUTODRAFT_DOTNET_API_URL."
                        ),
                    }
                ),
                501,
            )

        upstream, error, status = _proxy_json(
            base_url=dotnet_base_url,
            method="POST",
            path="/api/autodraft/execute",
            timeout_seconds=45,
            payload=payload,
        )
        if upstream is None:
            return jsonify({"ok": False, "error": error}), status

        upstream["source"] = "dotnet"
        return jsonify(upstream), status

    return bp
