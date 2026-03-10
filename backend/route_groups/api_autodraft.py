from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import requests
from flask import Blueprint, jsonify, request
from flask_limiter import Limiter

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
)

DEFAULT_RULES: List[Dict[str, Any]] = [
    {
        "id": "delete-green-cloud",
        "category": "DELETE",
        "trigger": {"type": "cloud", "color": "green", "text_contains": ""},
        "action": "Remove all geometry inside the cloud boundary",
        "icon": "\U0001F7E2",
        "examples": ["Green cloud around area", "Green X through element"],
        "confidence": 0.92,
    },
    {
        "id": "add-red-cloud",
        "category": "ADD",
        "trigger": {"type": "cloud", "color": "red", "text_contains": ""},
        "action": "Add geometry drawn inside red cloud to model",
        "icon": "\U0001F534",
        "examples": ["Red cloud with new linework", "Red arrow to insertion"],
        "confidence": 0.88,
    },
    {
        "id": "note-blue-text",
        "category": "NOTE",
        "trigger": {"type": "text", "color": "blue", "text_contains": ""},
        "action": "Log as note only; do not modify geometry",
        "icon": "\U0001F535",
        "examples": ["Blue text annotation", "Blue callout box"],
        "confidence": 0.95,
    },
    {
        "id": "swap-blue-arrows",
        "category": "SWAP",
        "trigger": {"type": "arrow", "color": "blue", "count": 2},
        "action": "Swap the two elements connected by arrows",
        "icon": "\U0001F500",
        "examples": ["Two blue arrows between components"],
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
        "icon": "\U0001F4CB",
        "examples": ["Standard ANSI title block", "Company header and rev table"],
        "confidence": 0.97,
    },
]

_DELETE_INTENT_TOKEN = "delete"
_ADD_INTENT_TOKEN = "add"
_CLOUD_COLOR_TO_CATEGORY: Dict[str, str] = {
    "green": "DELETE",
    "red": "ADD",
}

_BACKCHECK_PASS = "pass"
_BACKCHECK_WARN = "warn"
_BACKCHECK_FAIL = "fail"

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


def _cloud_intent_conflicts(markup: Dict[str, Any]) -> bool:
    markup_type = _normalize_text(markup.get("type"))
    if markup_type != "cloud":
        return False

    markup_color = _normalize_text(markup.get("color"))
    implied_category = _CLOUD_COLOR_TO_CATEGORY.get(markup_color)
    if not implied_category:
        return False

    markup_text = _normalize_text(markup.get("text"))
    has_delete_intent = _DELETE_INTENT_TOKEN in markup_text
    has_add_intent = _ADD_INTENT_TOKEN in markup_text

    if implied_category == "DELETE":
        return has_add_intent

    if implied_category == "ADD":
        return has_delete_intent

    return False


def _build_local_plan(markups: List[Dict[str, Any]]) -> Dict[str, Any]:
    actions: List[Dict[str, Any]] = []
    for idx, markup in enumerate(markups, start=1):
        if _cloud_intent_conflicts(markup):
            action_item = {
                "id": f"action-{idx}",
                "rule_id": None,
                "category": "UNCLASSIFIED",
                "action": "Conflicting cloud color/text intent. Manual review required.",
                "confidence": 0.0,
                "markup": markup,
                "status": "review",
            }
        else:
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


def _derive_request_id(payload: Dict[str, Any]) -> str:
    raw_request_id = (
        str(payload.get("requestId") or payload.get("request_id") or "").strip()
        or str(request.args.get("requestId") or request.args.get("request_id") or "").strip()
    )
    return autocad_derive_request_id(raw_request_id)


def _normalize_bounds(value: Any) -> Optional[Dict[str, float]]:
    if not isinstance(value, dict):
        return None
    try:
        x = float(value.get("x", 0))
        y = float(value.get("y", 0))
        width = float(value.get("width", 0))
        height = float(value.get("height", 0))
    except Exception:
        return None
    if width <= 0 or height <= 0:
        return None
    return {"x": x, "y": y, "width": width, "height": height}


def _bounds_overlap(bounds_a: Dict[str, float], bounds_b: Dict[str, float]) -> bool:
    ax0 = bounds_a["x"]
    ay0 = bounds_a["y"]
    ax1 = ax0 + bounds_a["width"]
    ay1 = ay0 + bounds_a["height"]

    bx0 = bounds_b["x"]
    by0 = bounds_b["y"]
    bx1 = bx0 + bounds_b["width"]
    by1 = by0 + bounds_b["height"]

    return ax0 < bx1 and ax1 > bx0 and ay0 < by1 and ay1 > by0


def _extract_locked_layers(cad_context: Dict[str, Any]) -> Set[str]:
    locked_layers: Set[str] = set()

    raw_locked_layers = cad_context.get("locked_layers")
    if isinstance(raw_locked_layers, list):
        for value in raw_locked_layers:
            if isinstance(value, str) and value.strip():
                locked_layers.add(value.strip().lower())

    raw_layers = cad_context.get("layers")
    if isinstance(raw_layers, list):
        for entry in raw_layers:
            if not isinstance(entry, dict):
                continue
            if not bool(entry.get("locked")):
                continue
            layer_name = str(entry.get("name") or "").strip().lower()
            if layer_name:
                locked_layers.add(layer_name)

    return locked_layers


def _extract_entities(cad_context: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_entities = cad_context.get("entities")
    if not isinstance(raw_entities, list):
        return []
    return [entry for entry in raw_entities if isinstance(entry, dict)]


def _finding_status_rank(status: str) -> int:
    if status == _BACKCHECK_FAIL:
        return 3
    if status == _BACKCHECK_WARN:
        return 2
    return 1


def _build_local_backcheck(
    *,
    actions: List[Dict[str, Any]],
    cad_context: Optional[Dict[str, Any]],
    request_id: str,
) -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []
    warnings: List[str] = []

    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    locked_layers = _extract_locked_layers(cad_context_obj)
    entities = _extract_entities(cad_context_obj)
    cad_available = bool(cad_context_obj) and (
        bool(locked_layers) or bool(entities) or bool(cad_context_obj.get("drawing"))
    )

    if not cad_available:
        warnings.append(
            "CAD context is unavailable; backcheck degraded to action-level verification."
        )

    for index, action in enumerate(actions, start=1):
        action_id = str(action.get("id") or f"action-{index}")
        rule_id = action.get("rule_id")
        category = _normalize_text(action.get("category"))
        confidence_raw = action.get("confidence")
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        markup_bounds = _normalize_bounds(markup.get("bounds"))

        notes: List[str] = []
        suggestions: List[str] = []
        status = _BACKCHECK_PASS
        severity = "low"

        if not isinstance(rule_id, str) or not rule_id.strip():
            status = _BACKCHECK_FAIL
            severity = "high"
            notes.append("Action is unclassified and requires operator review.")
            suggestions.append("Classify this markup manually before execute.")

        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.0
        if confidence < 0.5:
            if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                status = _BACKCHECK_WARN
                severity = "medium"
            notes.append(f"Confidence is low ({confidence:.2f}).")
            suggestions.append(
                "Review mapped geometry and text intent before execution."
            )

        if _cloud_intent_conflicts(markup):
            status = _BACKCHECK_FAIL
            severity = "high"
            notes.append("Markup color/text intent conflict detected.")
            suggestions.append(
                "Correct cloud color or action wording to remove conflicting intent."
            )

        if category in {"delete", "add", "swap"} and not markup_bounds:
            if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                status = _BACKCHECK_WARN
                severity = "medium"
            notes.append("Action has no geometry bounds for CAD-aware validation.")
            suggestions.append("Attach markup bounds to enable CAD collision checks.")

        layer_name = _normalize_text(markup.get("layer"))
        if cad_available and layer_name and layer_name in locked_layers:
            status = _BACKCHECK_FAIL
            severity = "high"
            notes.append(f"Layer '{layer_name}' is locked.")
            suggestions.append(
                "Move action target to an editable layer or unlock the target layer."
            )

        if cad_available and markup_bounds:
            overlapping_count = 0
            for entity in entities:
                entity_bounds = _normalize_bounds(entity.get("bounds"))
                if entity_bounds and _bounds_overlap(markup_bounds, entity_bounds):
                    overlapping_count += 1

            if category == "delete" and overlapping_count == 0:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append("DELETE action has no intersecting CAD entities in bounds.")
                suggestions.append("Expand bounds or verify target geometry selection.")
            elif category == "add" and overlapping_count > 0:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append(
                    f"ADD action overlaps {overlapping_count} existing CAD entities."
                )
                suggestions.append(
                    "Validate insertion offset or route to avoid geometry overlap."
                )
            elif category == "swap" and overlapping_count < 2:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append("SWAP action found fewer than two intersecting targets.")
                suggestions.append(
                    "Verify both swap endpoints are represented in markup bounds."
                )

        findings.append(
            {
                "id": f"finding-{index}",
                "action_id": action_id,
                "status": status,
                "severity": severity,
                "category": category or "unclassified",
                "notes": notes,
                "suggestions": sorted(set(suggestions)),
            }
        )

    summary = {
        "total_actions": len(findings),
        "pass_count": sum(1 for item in findings if item["status"] == _BACKCHECK_PASS),
        "warn_count": sum(1 for item in findings if item["status"] == _BACKCHECK_WARN),
        "fail_count": sum(1 for item in findings if item["status"] == _BACKCHECK_FAIL),
    }

    return {
        "ok": True,
        "success": True,
        "requestId": request_id,
        "source": "python-local-backcheck",
        "mode": "cad-aware",
        "cad": {
            "available": cad_available,
            "degraded": not cad_available,
            "entity_count": len(entities),
            "locked_layer_count": len(locked_layers),
        },
        "summary": summary,
        "warnings": warnings,
        "findings": findings,
    }


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

    @bp.route("/backcheck", methods=["POST"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_autodraft_backcheck():
        if not request.is_json:
            payload = autocad_build_error_payload(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=autocad_derive_request_id(""),
            )
            payload["ok"] = False
            return jsonify(payload), 400

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            request_id = autocad_derive_request_id("")
            response_payload = autocad_build_error_payload(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=request_id,
            )
            response_payload["ok"] = False
            return jsonify(response_payload), 400

        request_id = _derive_request_id(payload)

        if dotnet_base_url:
            upstream, error, status = _proxy_json(
                base_url=dotnet_base_url,
                method="POST",
                path="/api/autodraft/backcheck",
                timeout_seconds=25,
                payload=payload,
            )
            if upstream is not None:
                upstream.setdefault("requestId", request_id)
                upstream["source"] = "dotnet"
                return jsonify(upstream), status
            logger.warning(
                "AutoDraft .NET /backcheck unavailable. Falling back: %s", error
            )

        raw_actions = payload.get("actions")
        actions = raw_actions if isinstance(raw_actions, list) else []
        clean_actions = [item for item in actions if isinstance(item, dict)]
        cad_context = payload.get("cad_context") if isinstance(payload.get("cad_context"), dict) else None
        require_cad_context = bool(payload.get("require_cad_context"))
        has_cad_context = bool(cad_context)

        if require_cad_context and not has_cad_context:
            error_payload = autocad_build_error_payload(
                code="AUTODRAFT_CAD_CONTEXT_UNAVAILABLE",
                message=(
                    "CAD context was required but is not available in this request."
                ),
                request_id=request_id,
                meta={
                    "endpoint": "/api/autodraft/backcheck",
                    "degraded": True,
                },
                extra={
                    "ok": False,
                    "source": "python-local-backcheck",
                },
            )
            return jsonify(error_payload), 503

        result = _build_local_backcheck(
            actions=clean_actions,
            cad_context=cad_context,
            request_id=request_id,
        )
        return jsonify(result), 200

    return bp
