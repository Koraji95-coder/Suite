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


def _build_autodraft_error_payload(
    *,
    code: str,
    message: str,
    request_id: str,
    meta: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = autocad_build_error_payload(
        code=code,
        message=message,
        request_id=request_id,
        meta=meta,
        extra=extra or {},
    )
    payload.setdefault("ok", False)
    payload.setdefault("success", False)
    payload.setdefault("error", message)
    payload.setdefault("code", code)
    payload.setdefault("message", message)
    payload.setdefault("requestId", request_id)
    return payload


def _autodraft_error_response(
    *,
    code: str,
    message: str,
    request_id: str,
    status_code: int,
    meta: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
):
    payload = _build_autodraft_error_payload(
        code=code,
        message=message,
        request_id=request_id,
        meta=meta,
        extra=extra,
    )
    return jsonify(payload), status_code


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


def _normalize_layer_entries(raw_layers: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_layers, list):
        return []

    entries: List[Dict[str, Any]] = []
    for entry in raw_layers:
        if isinstance(entry, str):
            layer_name = entry.strip()
            if layer_name:
                entries.append({"name": layer_name, "locked": False})
            continue
        if not isinstance(entry, dict):
            continue
        layer_name = str(entry.get("name") or "").strip()
        if not layer_name:
            continue
        entries.append({"name": layer_name, "locked": bool(entry.get("locked"))})
    return entries


def _merge_cad_context(
    *,
    live_context: Optional[Dict[str, Any]],
    client_context: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    live_obj = live_context if isinstance(live_context, dict) else {}
    client_obj = client_context if isinstance(client_context, dict) else {}
    if not live_obj and not client_obj:
        return None

    merged: Dict[str, Any] = {}

    live_layers = _normalize_layer_entries(live_obj.get("layers"))
    client_layers = _normalize_layer_entries(client_obj.get("layers"))
    layer_lookup: Dict[str, Dict[str, Any]] = {}
    for layer in [*live_layers, *client_layers]:
        layer_name = str(layer.get("name") or "").strip()
        if not layer_name:
            continue
        key = layer_name.lower()
        existing = layer_lookup.get(key)
        if existing is None:
            layer_lookup[key] = {"name": layer_name, "locked": bool(layer.get("locked"))}
            continue
        existing["locked"] = bool(existing.get("locked")) or bool(layer.get("locked"))
    if layer_lookup:
        merged["layers"] = sorted(layer_lookup.values(), key=lambda item: str(item.get("name", "")).lower())

    locked_layers: Set[str] = set()
    for source in (live_obj, client_obj):
        raw_locked_layers = source.get("locked_layers")
        if isinstance(raw_locked_layers, list):
            for value in raw_locked_layers:
                if isinstance(value, str) and value.strip():
                    locked_layers.add(value.strip())
    if locked_layers:
        merged["locked_layers"] = sorted(locked_layers, key=lambda value: value.lower())

    live_entities = _extract_entities(live_obj)
    client_entities = _extract_entities(client_obj)
    entities: List[Dict[str, Any]] = []
    seen_entity_keys: Set[str] = set()
    for index, entity in enumerate([*live_entities, *client_entities]):
        key_candidates = [
            str(entity.get("id") or "").strip(),
            str(entity.get("handle") or "").strip(),
            str(entity.get("uuid") or "").strip(),
        ]
        entity_key = next((value for value in key_candidates if value), f"idx-{index}")
        if entity_key in seen_entity_keys:
            continue
        seen_entity_keys.add(entity_key)
        entities.append(entity)
    if entities:
        merged["entities"] = entities

    drawing_live = live_obj.get("drawing") if isinstance(live_obj.get("drawing"), dict) else None
    drawing_client = (
        client_obj.get("drawing")
        if isinstance(client_obj.get("drawing"), dict)
        else None
    )
    if drawing_live:
        merged["drawing"] = drawing_live
    elif drawing_client:
        merged["drawing"] = drawing_client

    return merged if merged else None


def _collect_action_layer_hints(actions: Any) -> List[str]:
    if not isinstance(actions, list):
        return []
    layer_names: List[str] = []
    seen: Set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        markup = action.get("markup")
        if not isinstance(markup, dict):
            continue
        layer_name = str(markup.get("layer") or "").strip()
        if not layer_name:
            continue
        key = layer_name.lower()
        if key in seen:
            continue
        seen.add(key)
        layer_names.append(layer_name)
    return layer_names


def _collect_live_cad_context(
    *,
    get_manager: Optional[Callable[[], Any]],
    logger: Any,
    request_id: str,
    actions: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    if not callable(get_manager):
        return None

    try:
        manager = get_manager()
    except Exception:
        logger.exception(
            "AutoDraft backcheck CAD context acquire failed stage=get_manager request_id=%s",
            request_id,
        )
        return None

    if manager is None:
        return None

    context: Dict[str, Any] = {}

    try:
        status = manager.get_status() if hasattr(manager, "get_status") else None
        if isinstance(status, dict):
            drawing_name = str(status.get("drawing_name") or "").strip()
            if drawing_name:
                context["drawing"] = {
                    "name": drawing_name,
                    "connected": bool(status.get("connected")),
                    "autocad_running": bool(status.get("autocad_running")),
                    "drawing_open": bool(status.get("drawing_open")),
                }
    except Exception:
        logger.exception(
            "AutoDraft backcheck CAD context gather failed stage=get_status request_id=%s",
            request_id,
        )

    action_layer_hints = _collect_action_layer_hints(actions)

    try:
        layers_result: Any = None
        if hasattr(manager, "get_layer_snapshot"):
            layers_result = manager.get_layer_snapshot()
        elif hasattr(manager, "get_layers"):
            layers_result = manager.get_layers()
        raw_layers: Any = None
        if isinstance(layers_result, tuple):
            if len(layers_result) >= 2 and bool(layers_result[0]):
                raw_layers = layers_result[1]
        elif isinstance(layers_result, list):
            raw_layers = layers_result
        elif isinstance(layers_result, dict):
            raw_layers = layers_result.get("layers")

        normalized_layers = _normalize_layer_entries(raw_layers)
        if normalized_layers:
            context["layers"] = normalized_layers
            context["locked_layers"] = [
                str(entry.get("name") or "")
                for entry in normalized_layers
                if bool(entry.get("locked"))
            ]
    except Exception:
        logger.exception(
            "AutoDraft backcheck CAD context gather failed stage=get_layers request_id=%s",
            request_id,
        )

    try:
        entities_result: Any = None
        if hasattr(manager, "get_entity_snapshot"):
            try:
                entities_result = manager.get_entity_snapshot(
                    layer_names=action_layer_hints,
                    max_entities=500,
                )
            except TypeError:
                entities_result = manager.get_entity_snapshot()

        raw_entities: Any = None
        if isinstance(entities_result, tuple):
            if len(entities_result) >= 2 and bool(entities_result[0]):
                raw_entities = entities_result[1]
        elif isinstance(entities_result, dict):
            raw_entities = entities_result.get("entities")
        elif isinstance(entities_result, list):
            raw_entities = entities_result

        if isinstance(raw_entities, list):
            normalized_entities: List[Dict[str, Any]] = []
            for entry in raw_entities:
                if not isinstance(entry, dict):
                    continue
                bounds = _normalize_bounds(entry.get("bounds"))
                if not bounds:
                    continue
                entity_id = str(
                    entry.get("id")
                    or entry.get("handle")
                    or entry.get("uuid")
                    or f"entity-{len(normalized_entities) + 1}"
                ).strip()
                if not entity_id:
                    entity_id = f"entity-{len(normalized_entities) + 1}"
                normalized_entry = {
                    "id": entity_id,
                    "bounds": bounds,
                }
                layer_name = str(entry.get("layer") or "").strip()
                if layer_name:
                    normalized_entry["layer"] = layer_name
                normalized_entities.append(normalized_entry)
            if normalized_entities:
                context["entities"] = normalized_entities
    except Exception:
        logger.exception(
            "AutoDraft backcheck CAD context gather failed stage=get_entity_snapshot request_id=%s",
            request_id,
        )

    return context if context else None


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
    cad_context_source: str = "none",
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

    action_bounds: Dict[str, Dict[str, float]] = {}
    action_categories: Dict[str, str] = {}
    for index, action in enumerate(actions, start=1):
        action_id = str(action.get("id") or f"action-{index}")
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        bounds = _normalize_bounds(markup.get("bounds"))
        if bounds:
            action_bounds[action_id] = bounds
        action_categories[action_id] = _normalize_text(action.get("category"))

    for index, action in enumerate(actions, start=1):
        action_id = str(action.get("id") or f"action-{index}")
        rule_id = action.get("rule_id")
        category = _normalize_text(action.get("category"))
        action_status = _normalize_text(action.get("status"))
        confidence_raw = action.get("confidence")
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        markup_bounds = _normalize_bounds(markup.get("bounds"))
        markup_type = _normalize_text(markup.get("type"))
        markup_color = _normalize_text(markup.get("color"))
        layer_name = _normalize_text(markup.get("layer"))

        notes: List[str] = []
        suggestions: List[str] = []
        status = _BACKCHECK_PASS
        severity = "low"

        if action_status in {"review", "needs_review"}:
            status = _BACKCHECK_FAIL
            severity = "high"
            notes.append("Action is still marked for review and is not execution-ready.")
            suggestions.append(
                "Resolve classification/review state before execution."
            )

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

        if not markup_type:
            if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                status = _BACKCHECK_WARN
                severity = "medium"
            notes.append("Markup type is missing.")
            suggestions.append("Include markup.type to improve rule verification.")

        if _cloud_intent_conflicts(markup):
            status = _BACKCHECK_FAIL
            severity = "high"
            notes.append("Markup color/text intent conflict detected.")
            suggestions.append(
                "Correct cloud color or action wording to remove conflicting intent."
            )

        if markup_type == "cloud":
            if markup_color == "green" and category not in {"delete"}:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append("Green cloud is typically delete intent, but category is not DELETE.")
                suggestions.append("Confirm cloud color/category mapping before execution.")
            elif markup_color == "red" and category not in {"add"}:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append("Red cloud is typically add intent, but category is not ADD.")
                suggestions.append("Confirm cloud color/category mapping before execution.")

        if category in {"delete", "add", "swap"} and not markup_bounds:
            if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                status = _BACKCHECK_WARN
                severity = "medium"
            notes.append("Action has no geometry bounds for CAD-aware validation.")
            suggestions.append("Attach markup bounds to enable CAD collision checks.")

        if category in {"delete", "add", "swap"} and not layer_name:
            if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                status = _BACKCHECK_WARN
                severity = "medium"
            notes.append("Layer name is missing for geometry-affecting action.")
            suggestions.append("Include markup.layer to validate standards and lock state.")

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

        if markup_bounds:
            conflict_count = 0
            for other_action_id, other_bounds in action_bounds.items():
                if other_action_id == action_id:
                    continue
                if not _bounds_overlap(markup_bounds, other_bounds):
                    continue
                other_category = action_categories.get(other_action_id, "")
                if {category, other_category} == {"add", "delete"}:
                    conflict_count += 1
            if conflict_count > 0:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append(
                    f"Action bounds conflict with {conflict_count} opposite-intent action(s)."
                )
                suggestions.append(
                    "Resolve overlap between ADD and DELETE operations before execution."
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
            "source": cad_context_source,
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
    get_manager: Optional[Callable[[], Any]] = None,
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
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/plan"},
            )

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/plan"},
            )

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
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/execute"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/execute"},
            )

        request_id = _derive_request_id(payload)
        override_reason = str(payload.get("backcheck_override_reason") or "").strip()
        raw_actions = payload.get("actions")
        actions = raw_actions if isinstance(raw_actions, list) else []
        clean_actions = [item for item in actions if isinstance(item, dict)]
        client_cad_context = (
            payload.get("cad_context")
            if isinstance(payload.get("cad_context"), dict)
            else None
        )
        live_cad_context = _collect_live_cad_context(
            get_manager=get_manager,
            logger=logger,
            request_id=request_id,
            actions=clean_actions,
        )
        cad_context = _merge_cad_context(
            live_context=live_cad_context,
            client_context=client_cad_context,
        )
        cad_context_source = (
            "live+client"
            if live_cad_context and client_cad_context
            else "live"
            if live_cad_context
            else "client"
            if client_cad_context
            else "none"
        )
        backcheck_result = _build_local_backcheck(
            actions=clean_actions,
            cad_context=cad_context,
            request_id=request_id,
            cad_context_source=cad_context_source,
        )
        summary_obj = (
            backcheck_result.get("summary")
            if isinstance(backcheck_result.get("summary"), dict)
            else {}
        )
        try:
            server_backcheck_fail_count = int(summary_obj.get("fail_count") or 0)
        except Exception:
            server_backcheck_fail_count = 0

        client_fail_count_raw = payload.get("backcheck_fail_count")
        try:
            client_backcheck_fail_count = int(client_fail_count_raw or 0)
        except Exception:
            client_backcheck_fail_count = 0
        if client_backcheck_fail_count != server_backcheck_fail_count:
            logger.warning(
                "AutoDraft execute backcheck fail-count mismatch request_id=%s client=%s server=%s",
                request_id,
                client_backcheck_fail_count,
                server_backcheck_fail_count,
            )

        if server_backcheck_fail_count > 0 and not override_reason:
            return _autodraft_error_response(
                code="AUTODRAFT_BACKCHECK_FAILED",
                message=(
                    "Backcheck reported failing actions. Provide "
                    "`backcheck_override_reason` to continue execute."
                ),
                request_id=request_id,
                status_code=428,
                meta={
                    "backcheck_fail_count": server_backcheck_fail_count,
                    "cad_source": cad_context_source,
                },
            )

        payload["backcheck_fail_count"] = server_backcheck_fail_count
        payload.setdefault("requestId", request_id)
        if not dotnet_base_url:
            return _autodraft_error_response(
                code="AUTODRAFT_EXECUTE_NOT_CONFIGURED",
                message=(
                    "Execution requires .NET API integration. Configure "
                    "AUTODRAFT_DOTNET_API_URL."
                ),
                request_id=request_id,
                status_code=501,
                meta={"endpoint": "/api/autodraft/execute"},
            )

        upstream, error, status = _proxy_json(
            base_url=dotnet_base_url,
            method="POST",
            path="/api/autodraft/execute",
            timeout_seconds=45,
            payload=payload,
        )
        if upstream is None:
            return _autodraft_error_response(
                code="AUTODRAFT_UPSTREAM_ERROR",
                message=str(error or "Upstream execute request failed."),
                request_id=request_id,
                status_code=status,
                meta={
                    "endpoint": "/api/autodraft/execute",
                    "upstream_status": status,
                },
            )

        upstream.setdefault("requestId", request_id)
        upstream["source"] = "dotnet"
        return jsonify(upstream), status

    @bp.route("/backcheck", methods=["POST"])
    @require_api_key
    @limiter.limit("60 per hour")
    def api_autodraft_backcheck():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/backcheck"},
                extra={"source": "python-local-backcheck"},
            )

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/backcheck"},
                extra={"source": "python-local-backcheck"},
            )

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
        client_cad_context = (
            payload.get("cad_context")
            if isinstance(payload.get("cad_context"), dict)
            else None
        )
        live_cad_context = _collect_live_cad_context(
            get_manager=get_manager,
            logger=logger,
            request_id=request_id,
            actions=clean_actions,
        )
        cad_context = _merge_cad_context(
            live_context=live_cad_context,
            client_context=client_cad_context,
        )
        require_cad_context = bool(payload.get("require_cad_context"))
        has_cad_context = bool(cad_context)
        cad_context_source = (
            "live+client"
            if live_cad_context and client_cad_context
            else "live"
            if live_cad_context
            else "client"
            if client_cad_context
            else "none"
        )

        if require_cad_context and not has_cad_context:
            error_payload = _build_autodraft_error_payload(
                code="AUTODRAFT_CAD_CONTEXT_UNAVAILABLE",
                message=(
                    "CAD context was required but unavailable from request payload and live AutoCAD context."
                ),
                request_id=request_id,
                meta={
                    "endpoint": "/api/autodraft/backcheck",
                    "degraded": True,
                    "cadSource": cad_context_source,
                },
                extra={
                    "source": "python-local-backcheck",
                },
            )
            return jsonify(error_payload), 503

        result = _build_local_backcheck(
            actions=clean_actions,
            cad_context=cad_context,
            request_id=request_id,
            cad_context_source=cad_context_source,
        )
        return jsonify(result), 200

    return bp
