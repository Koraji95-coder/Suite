from __future__ import annotations

import html
import json
import math
import os
import re
import sqlite3
import threading
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import requests
from flask import Blueprint, jsonify, request
from flask_limiter import Limiter

try:
    import redis  # type: ignore[import-not-found]
except Exception:
    redis = None

try:
    from pypdf import PdfReader as _PdfReader

    _PYPDF_AVAILABLE = True
except Exception:
    _PdfReader = None
    _PYPDF_AVAILABLE = False

try:
    from PIL import Image

    _PIL_AVAILABLE = True
except Exception:
    Image = None
    _PIL_AVAILABLE = False

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
)
from ..autodraft_execution_receipts import persist_autodraft_execution_receipt
from .api_local_learning_runtime import get_local_learning_runtime
from .pdf_text_extraction import (
    extract_embedded_text_page_lines,
    extract_ocr_page_lines_from_image,
    pdf_bounds_to_pixel_bounds,
    pdf_ocr_available,
    pdf_render_available,
    render_pdf_page_to_png,
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
_DEFAULT_COLOR_TO_CATEGORY: Dict[str, str] = {
    "blue": "NOTE",
    "green": "DELETE",
    "red": "ADD",
    "yellow": "NOTE",
}
_RECOGNITION_LABEL_TO_CATEGORY: Dict[str, str] = {
    "delete": "DELETE",
    "remove": "DELETE",
    "add": "ADD",
    "insert": "ADD",
    "note": "NOTE",
    "title_block": "TITLE_BLOCK",
    "titleblock": "TITLE_BLOCK",
}
_LOCAL_MODEL_RECOGNITION_MIN_CONFIDENCE = 0.66
_LOCAL_MODEL_RECOGNITION_LOW_SIGNAL_OVERRIDE_CONFIDENCE = 0.80
_RECOGNITION_FALLBACK_MIN_CONFIDENCE = 0.72
_LOW_SIGNAL_DEFAULT_RULE_IDS = {"note-blue-text"}

_ADD_INTENT_PATTERN = re.compile(r"\b(add|install|insert|provide|new)\b", re.IGNORECASE)
_DELETE_INTENT_PATTERN = re.compile(
    r"\b(delete|remove|demolish|omit)\b",
    re.IGNORECASE,
)
_NOTE_INTENT_PATTERN = re.compile(
    r"\b(note|review|verify|confirm|check|coord(?:inate)?|see\s+dwg)\b",
    re.IGNORECASE,
)

_PDF_DA_RGB_PATTERN = re.compile(
    r"([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+rg\b",
    re.IGNORECASE,
)
_PDF_DA_GRAY_PATTERN = re.compile(r"([-+]?\d*\.?\d+)\s+g\b", re.IGNORECASE)
_PDF_DA_CMYK_PATTERN = re.compile(
    r"([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+k\b",
    re.IGNORECASE,
)
_CSS_HEX_COLOR_PATTERN = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_CSS_RGB_COLOR_PATTERN = re.compile(
    r"rgb\(\s*([0-9]{1,3}%?)\s*,\s*([0-9]{1,3}%?)\s*,\s*([0-9]{1,3}%?)\s*\)",
    re.IGNORECASE,
)
_HTML_BREAK_PATTERN = re.compile(
    r"<\s*(?:br|/p|/div|/li|/tr|/td|/h[1-6])\b[^>]*>",
    re.IGNORECASE,
)
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

_BACKCHECK_PASS = "pass"
_BACKCHECK_WARN = "warn"
_BACKCHECK_FAIL = "fail"

_COMPARE_ENGINE_AUTO = "auto"
_COMPARE_ENGINE_PYTHON = "python"
_COMPARE_ENGINE_DOTNET = "dotnet"
_COMPARE_SUPPORTED_ENGINES = {
    _COMPARE_ENGINE_AUTO,
    _COMPARE_ENGINE_PYTHON,
    _COMPARE_ENGINE_DOTNET,
}
_COMPARE_CALIBRATION_MODE_AUTO = "auto"
_COMPARE_CALIBRATION_MODE_MANUAL = "manual"
_COMPARE_CALIBRATION_MODES = {
    _COMPARE_CALIBRATION_MODE_AUTO,
    _COMPARE_CALIBRATION_MODE_MANUAL,
}
_COMPARE_AGENT_REVIEW_MODE_OFF = "off"
_COMPARE_AGENT_REVIEW_MODE_PRE = "pre"
_COMPARE_AGENT_REVIEW_MODES = {
    _COMPARE_AGENT_REVIEW_MODE_OFF,
    _COMPARE_AGENT_REVIEW_MODE_PRE,
}

_AUTO_CALIBRATION_READY_MIN_CONFIDENCE = 0.56
_AUTO_CALIBRATION_READY_MIN_MATCH_RATIO = 0.45

_COMPARE_TOLERANCE_PROFILE_STRICT = "strict"
_COMPARE_TOLERANCE_PROFILE_MEDIUM = "medium"
_COMPARE_TOLERANCE_PROFILE_LOOSE = "loose"
_COMPARE_TOLERANCE_PROFILES = {
    _COMPARE_TOLERANCE_PROFILE_STRICT,
    _COMPARE_TOLERANCE_PROFILE_MEDIUM,
    _COMPARE_TOLERANCE_PROFILE_LOOSE,
}

_REPLACEMENT_STATUS_RESOLVED = "resolved"
_REPLACEMENT_STATUS_AMBIGUOUS = "ambiguous"
_REPLACEMENT_STATUS_UNRESOLVED = "unresolved"
_REPLACEMENT_WARN_STATUSES = {
    _REPLACEMENT_STATUS_AMBIGUOUS,
    _REPLACEMENT_STATUS_UNRESOLVED,
}
_REPLACEMENT_REVIEW_ACTIONS = {
    "approved",
    "corrected",
    "unresolved",
}
_REPLACEMENT_MAX_CANDIDATES = 5
_REPLACEMENT_TUNING_DEFAULT = {
    "unresolved_confidence_threshold": 0.36,
    "ambiguity_margin_threshold": 0.08,
    "search_radius_multiplier": 2.5,
    "min_search_radius": 24.0,
}
_REPLACEMENT_MODEL_MIN_CONFIDENCE = 0.58
_REPLACEMENT_MODEL_MAX_BOOST = 0.14
_REPLACEMENT_MODEL_MAX_PENALTY = 0.12
_SHADOW_ADVISOR_PROFILE = "draftsmith"
_SHADOW_ADVISOR_MAX_CASES = 20
_SHADOW_ADVISOR_TOKEN_CACHE_LOCK = threading.Lock()
_SHADOW_ADVISOR_TOKEN_CACHE: Dict[str, Any] = {
    "token": None,
    "expires_at": 0.0,
    "source": "none",
}
_COMPARE_FEEDBACK_DB_LOCK = threading.Lock()
_LOCAL_LEARNING_RUNTIME = get_local_learning_runtime()
_AGENT_PRE_REVIEW_MAX_BOOST = 0.12
_AGENT_PRE_REVIEW_MAX_CANDIDATE_BOOSTS_PER_ACTION = 5
_AGENT_PRE_REVIEW_DEFAULT_PROFILE = "draftsmith"
_AGENT_PRE_REVIEW_DEFAULT_TIMEOUT_MS = 30000
_AGENT_PRE_REVIEW_DEFAULT_MAX_CASES = 20
_SEE_DWG_REFERENCE_PATTERN = re.compile(r"\bsee\s+dwg\b", re.IGNORECASE)
_TITLE_BLOCK_TEXT_PATTERN = re.compile(
    r"\b(revision|rev(?:ision)?|drawing\s+no|dwg\s+no|sheet\s+no|title|scale|date|checked|approved)\b",
    re.IGNORECASE,
)
_TITLE_BLOCK_ASSIGNMENT_PATTERNS: Dict[str, re.Pattern[str]] = {
    "drawing_number": re.compile(
        r"\b(?:drawing\s*(?:no|number)|dwg\s*(?:no|number)|dwgno)\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "sheet_number": re.compile(
        r"\b(?:sheet\s*(?:no|number)|sheet)\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "revision": re.compile(
        r"\b(?:rev(?:ision)?)\b(?:\s*(?:no|#))?\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "title": re.compile(
        r"\b(?:drawing\s+title|sheet\s+title|title)\b\s*[:=#-]\s*(?P<value>[^\n;]+)",
        re.IGNORECASE,
    ),
    "scale": re.compile(
        r"\bscale\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "date": re.compile(
        r"\bdate\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "checked_by": re.compile(
        r"\b(?:checked(?:\s+by)?|chkd)\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
    "approved_by": re.compile(
        r"\b(?:approved(?:\s+by)?|appr(?:oved)?)\b\s*[:=#-]\s*(?P<value>[^\n;,]+)",
        re.IGNORECASE,
    ),
}
_TITLE_BLOCK_FIELD_PATTERNS: Dict[str, re.Pattern[str]] = {
    "drawing_number": re.compile(
        r"\b(?:drawing\s*(?:no|number)|dwg\s*(?:no|number)|dwgno)\b",
        re.IGNORECASE,
    ),
    "sheet_number": re.compile(
        r"\b(?:sheet\s*(?:no|number)|sheet)\b",
        re.IGNORECASE,
    ),
    "revision": re.compile(r"\b(?:rev(?:ision)?)\b", re.IGNORECASE),
    "title": re.compile(r"\b(?:drawing\s+title|sheet\s+title|title)\b", re.IGNORECASE),
    "scale": re.compile(r"\bscale\b", re.IGNORECASE),
    "date": re.compile(r"\bdate\b", re.IGNORECASE),
    "checked_by": re.compile(r"\b(?:checked(?:\s+by)?|chkd)\b", re.IGNORECASE),
    "approved_by": re.compile(r"\b(?:approved(?:\s+by)?|appr(?:oved)?)\b", re.IGNORECASE),
}
_TITLE_BLOCK_ATTRIBUTE_TAG_CANDIDATES: Dict[str, List[str]] = {
    "drawing_number": ["DWG_NO", "DRAWING_NO", "DRAWINGNUMBER", "DRG_NO", "DWGNUM"],
    "sheet_number": ["SHEET_NO", "SHEETNUMBER", "SHEET", "SHT_NO", "SHT"],
    "revision": ["REV", "REVISION", "REV_NO", "CURRENT_REV", "SHEET_REV"],
    "title": ["TITLE", "DRAWING_TITLE", "SHEET_TITLE", "DWG_TITLE"],
    "scale": ["SCALE"],
    "date": ["DATE", "ISSUE_DATE", "DRAWN_DATE"],
    "checked_by": ["CHECKED", "CHECKED_BY", "CHKD", "CHECK"],
    "approved_by": ["APPROVED", "APPROVED_BY", "APP"],
}
_TITLE_BLOCK_REVISION_CONTEXT_FIELDS: Dict[str, Tuple[str, ...]] = {
    "drawing_number": ("drawing_number",),
    "sheet_number": ("sheet_number", "sheet"),
    "revision": ("revision",),
    "title": ("title",),
    "scale": ("scale",),
    "date": ("date",),
    "checked_by": ("checked_by", "checked"),
    "approved_by": ("approved_by", "approved"),
}
_DIMENSION_ONLY_PATTERN = re.compile(
    r"^\s*[-+]?\d+(?:\.\d+)?(?:['\"]|mm|cm|m|in|ft)?\s*$",
    re.IGNORECASE,
)
_PREPARE_TEXT_FALLBACK_MAX_MARKUPS = 32

_ANNOT_TEXT_SUBTYPES = {
    "/Text",
    "/FreeText",
    "/Highlight",
    "/Underline",
    "/StrikeOut",
}
_ANNOT_NOTE_TEXT_SUBTYPES = {
    "/Text",
    "/FreeText",
}
_ANNOT_HIGHLIGHT_SUBTYPES = {
    "/Highlight",
    "/Underline",
    "/StrikeOut",
}
_ANNOT_LINE_SUBTYPES = {
    "/Line",
}
_ANNOT_RECTANGLE_SUBTYPES = {
    "/Square",
    "/Circle",
}
_ANNOT_GEOMETRIC_SUBTYPES = {
    "/Polygon",
    "/PolyLine",
    "/Ink",
}
_ANNOT_CLOUD_SUBTYPES = {
    *_ANNOT_RECTANGLE_SUBTYPES,
    *_ANNOT_GEOMETRIC_SUBTYPES,
}
_ANNOT_NOTE_ANCHOR_SUBTYPES = {
    *_ANNOT_RECTANGLE_SUBTYPES,
    *_ANNOT_GEOMETRIC_SUBTYPES,
    "/Line",
}
_GENERIC_SUBJECT_VALUES = {
    "text",
    "text box",
    "textbox",
    "rectangle",
    "square",
    "circle",
    "polygon",
    "polyline",
    "line",
    "highlight",
    "markup",
}
_ANNOT_CLOUD_HINT_PATTERN = re.compile(r"\b(cloud|revision cloud|delta)\b", re.IGNORECASE)
_ANNOT_ARROW_HINT_PATTERN = re.compile(
    r"\b(arrow|leader|callout|pointer)\b",
    re.IGNORECASE,
)
_ANNOT_RECTANGLE_HINT_PATTERN = re.compile(
    r"\b(rectangle|square|box|circle|detail)\b",
    re.IGNORECASE,
)
_ANNOT_CALLOUT_HINT_PATTERN = re.compile(
    r"\b(callout|leader|note)\b",
    re.IGNORECASE,
)
_ARROW_LINE_ENDING_TOKENS = {
    "openarrow",
    "closedarrow",
    "ropenarrow",
    "rclosedarrow",
    "butt",
    "slash",
}
_TITLE_BLOCK_SUBJECT_HINT_PATTERN = re.compile(
    r"\b(title|revision|sheet|drawing|dwg)\b",
    re.IGNORECASE,
)

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


def _normalize_display_text(value: Any, max_length: int = 500) -> Optional[str]:
    if value is None:
        return None
    try:
        text = str(value)
    except Exception:
        return None
    if not text:
        return None
    text = html.unescape(text)
    text = _HTML_BREAK_PATTERN.sub(" ", text)
    text = _HTML_TAG_PATTERN.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    if len(text) > max_length:
        return f"{text[: max_length - 3].rstrip()}..."
    return text


def _extract_annotation_text_candidates(annotation: Any) -> List[Tuple[str, str]]:
    if not hasattr(annotation, "get"):
        return []
    candidates: List[Tuple[str, str]] = []
    seen: Set[str] = set()
    for source, key in (
        ("contents", "/Contents"),
        ("richtext", "/RC"),
        ("overlay_text", "/OverlayText"),
    ):
        text = _normalize_display_text(annotation.get(key))
        if not text:
            continue
        normalized = _normalize_text(text)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        candidates.append((source, text))

    subject_text = _normalize_display_text(annotation.get("/Subj"))
    subject_normalized = _normalize_text(subject_text)
    if (
        subject_text
        and subject_normalized
        and subject_normalized not in seen
        and subject_normalized not in _GENERIC_SUBJECT_VALUES
    ):
        candidates.append(("subject", subject_text))
    return candidates


def _collect_markup_semantic_text(markup: Dict[str, Any]) -> str:
    values: List[str] = []
    seen: Set[str] = set()
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    for value in (
        markup.get("text"),
        meta.get("subject") if isinstance(meta, dict) else None,
        meta.get("intent") if isinstance(meta, dict) else None,
        meta.get("overlay_text") if isinstance(meta, dict) else None,
    ):
        normalized = _normalize_display_text(value, max_length=800)
        token = _normalize_text(normalized)
        if not normalized or not token or token in seen:
            continue
        seen.add(token)
        values.append(normalized)
    return " ".join(values).strip()


def _normalize_execute_target_tags(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    seen: Set[str] = set()
    normalized_tags: List[str] = []
    for item in value:
        tag = str(item or "").strip().upper()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized_tags.append(tag)
    return normalized_tags


def _normalize_revision_context_payload(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {}
    normalized: Dict[str, str] = {}
    for key, item in value.items():
        key_text = _normalize_text(key)
        if not key_text:
            continue
        item_text = str(item or "").strip()
        if item_text:
            normalized[key_text] = item_text
    return normalized


def _resolve_title_block_field_key(text: str) -> str:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        return ""
    for field_key, pattern in _TITLE_BLOCK_FIELD_PATTERNS.items():
        if pattern.search(normalized_text):
            return field_key
    return ""


def _extract_title_block_value_from_text(text: str, field_key: str) -> str:
    pattern = _TITLE_BLOCK_ASSIGNMENT_PATTERNS.get(field_key)
    if not pattern:
        return ""
    match = pattern.search(str(text or ""))
    if not match:
        return ""
    return str(match.group("value") or "").strip()


def _resolve_title_block_value_from_revision_context(
    field_key: str, revision_context: Dict[str, str]
) -> str:
    for context_key in _TITLE_BLOCK_REVISION_CONTEXT_FIELDS.get(field_key, ()):
        candidate = str(revision_context.get(context_key) or "").strip()
        if candidate:
            return candidate
    return ""


def _build_title_block_execute_target(
    action: Dict[str, Any],
    *,
    revision_context: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    if _normalize_text(action.get("category")) != "title_block":
        return None

    raw_target = action.get("execute_target")
    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    markup_meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}

    if isinstance(raw_target, dict):
        kind = _normalize_text(raw_target.get("kind"))
        field_key = _normalize_text(raw_target.get("field_key"))
        attribute_tags = _normalize_execute_target_tags(raw_target.get("attribute_tags"))
        target_value = str(raw_target.get("target_value") or "").strip()
        block_name_hint = str(raw_target.get("block_name_hint") or "").strip()
        layout_hint = str(raw_target.get("layout_hint") or "").strip()
        if (
            kind == "title_block_attribute"
            and field_key
            and attribute_tags
            and target_value
        ):
            return {
                "kind": "title_block_attribute",
                "field_key": field_key,
                "attribute_tags": attribute_tags,
                "target_value": target_value,
                "block_name_hint": block_name_hint or None,
                "layout_hint": layout_hint or None,
            }

    candidate_texts = [
        value
        for value in [
            _collect_markup_semantic_text(markup),
            str(action.get("action") or "").strip(),
        ]
        if str(value or "").strip()
    ]
    field_key = ""
    source_text = ""
    for candidate_text in candidate_texts:
        field_key = _resolve_title_block_field_key(candidate_text)
        if field_key:
            source_text = candidate_text
            break
    if not field_key:
        return None

    target_value = _extract_title_block_value_from_text(source_text, field_key)
    if not target_value:
        for candidate_text in candidate_texts:
            if candidate_text == source_text:
                continue
            target_value = _extract_title_block_value_from_text(
                candidate_text, field_key
            )
            if target_value:
                break
    if not target_value:
        target_value = _resolve_title_block_value_from_revision_context(
            field_key, revision_context
        )
    if not target_value:
        return None

    attribute_tags = _TITLE_BLOCK_ATTRIBUTE_TAG_CANDIDATES.get(field_key, [])
    if not attribute_tags:
        return None

    block_name_hint = str(
        action.get("block_name_hint")
        or markup_meta.get("block_name_hint")
        or ""
    ).strip()
    layout_hint = str(
        action.get("layout_hint")
        or markup_meta.get("layout_hint")
        or ""
    ).strip()

    return {
        "kind": "title_block_attribute",
        "field_key": field_key,
        "attribute_tags": list(attribute_tags),
        "target_value": target_value,
        "block_name_hint": block_name_hint or None,
        "layout_hint": layout_hint or None,
    }


def _build_text_replacement_execute_target(
    action: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if _normalize_text(action.get("category")) != "add":
        return None

    raw_target = action.get("execute_target")
    if isinstance(raw_target, dict):
        kind = _normalize_text(raw_target.get("kind"))
        target_entity_id = str(
            raw_target.get("target_entity_id")
            or raw_target.get("entity_id")
            or ""
        ).strip()
        target_value = str(raw_target.get("target_value") or "").strip()
        current_value = str(
            raw_target.get("current_value")
            or raw_target.get("old_text")
            or ""
        ).strip()
        entity_type_hint = str(
            raw_target.get("entity_type_hint")
            or raw_target.get("entity_type")
            or ""
        ).strip()
        if kind == "text_replacement" and target_entity_id and target_value:
            return {
                "kind": "text_replacement",
                "target_entity_id": target_entity_id,
                "target_value": target_value,
                "current_value": current_value or None,
                "entity_type_hint": entity_type_hint or None,
            }

    replacement = action.get("replacement") if isinstance(action.get("replacement"), dict) else {}
    if _normalize_text(replacement.get("status")) != _REPLACEMENT_STATUS_RESOLVED:
        return None

    target_entity_id = str(replacement.get("target_entity_id") or "").strip()
    target_value = str(replacement.get("new_text") or "").strip()
    current_value = str(replacement.get("old_text") or "").strip()
    if not target_entity_id or not target_value:
        return None

    return {
        "kind": "text_replacement",
        "target_entity_id": target_entity_id,
        "target_value": target_value,
        "current_value": current_value or None,
        "entity_type_hint": "text",
    }


def _build_text_delete_execute_target(
    action: Dict[str, Any],
    *,
    cad_context: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if _normalize_text(action.get("category")) != "delete":
        return None

    raw_target = action.get("execute_target")
    if isinstance(raw_target, dict):
        kind = _normalize_text(raw_target.get("kind"))
        target_entity_id = str(
            raw_target.get("target_entity_id")
            or raw_target.get("entity_id")
            or ""
        ).strip()
        current_value = str(
            raw_target.get("current_value")
            or raw_target.get("old_text")
            or ""
        ).strip()
        entity_type_hint = str(
            raw_target.get("entity_type_hint")
            or raw_target.get("entity_type")
            or ""
        ).strip()
        if kind == "text_delete" and target_entity_id:
            return {
                "kind": "text_delete",
                "target_entity_id": target_entity_id,
                "current_value": current_value or None,
                "entity_type_hint": entity_type_hint or "text",
            }

    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    candidate = _resolve_single_text_like_execute_candidate(
        markup=markup,
        cad_context=cad_context_obj,
        entity_filter=lambda _entity: True,
    )
    if not candidate:
        return None

    target_entity_id = str(candidate.get("id") or "").strip()
    if not target_entity_id:
        return None
    current_value = str(candidate.get("text") or "").strip()
    return {
        "kind": "text_delete",
        "target_entity_id": target_entity_id,
        "current_value": current_value or None,
        "entity_type_hint": "text",
    }


def _build_dimension_text_execute_target(
    action: Dict[str, Any],
    *,
    cad_context: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if _normalize_text(action.get("category")) != "dimension":
        return None

    raw_target = action.get("execute_target")
    if isinstance(raw_target, dict):
        kind = _normalize_text(raw_target.get("kind"))
        target_entity_id = str(
            raw_target.get("target_entity_id")
            or raw_target.get("entity_id")
            or ""
        ).strip()
        target_value = str(raw_target.get("target_value") or "").strip()
        current_value = str(
            raw_target.get("current_value")
            or raw_target.get("old_text")
            or ""
        ).strip()
        entity_type_hint = str(
            raw_target.get("entity_type_hint")
            or raw_target.get("entity_type")
            or ""
        ).strip()
        if kind == "dimension_text_override" and target_entity_id and target_value:
            return {
                "kind": "dimension_text_override",
                "target_entity_id": target_entity_id,
                "target_value": target_value,
                "current_value": current_value or None,
                "entity_type_hint": entity_type_hint or "dimension",
            }

    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    markup_text = _normalize_display_text(markup.get("text"), max_length=120)
    target_value = str(markup_text or "").strip()
    if not target_value:
        return None

    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    candidate = _resolve_single_text_like_execute_candidate(
        markup=markup,
        cad_context=cad_context_obj,
        entity_filter=lambda entity: "dimension"
        in _normalize_text(entity.get("entity_type")),
    )
    if not candidate:
        return None

    target_entity_id = str(candidate.get("id") or "").strip()
    if not target_entity_id:
        return None

    return {
        "kind": "dimension_text_override",
        "target_entity_id": target_entity_id,
        "target_value": target_value,
        "current_value": str(candidate.get("text") or "").strip() or None,
        "entity_type_hint": "dimension",
    }


def _build_text_swap_execute_target(
    action: Dict[str, Any],
    *,
    cad_context: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if _normalize_text(action.get("category")) != "swap":
        return None

    raw_target = action.get("execute_target")
    if isinstance(raw_target, dict):
        kind = _normalize_text(raw_target.get("kind"))
        first_target_entity_id = str(
            raw_target.get("first_target_entity_id")
            or raw_target.get("left_target_entity_id")
            or raw_target.get("source_entity_id")
            or ""
        ).strip()
        second_target_entity_id = str(
            raw_target.get("second_target_entity_id")
            or raw_target.get("right_target_entity_id")
            or raw_target.get("target_entity_id")
            or ""
        ).strip()
        first_current_value = str(
            raw_target.get("first_current_value")
            or raw_target.get("left_current_value")
            or ""
        ).strip()
        second_current_value = str(
            raw_target.get("second_current_value")
            or raw_target.get("right_current_value")
            or ""
        ).strip()
        entity_type_hint = str(
            raw_target.get("entity_type_hint")
            or raw_target.get("entity_type")
            or ""
        ).strip()
        if (
            kind == "text_swap"
            and first_target_entity_id
            and second_target_entity_id
            and first_target_entity_id.lower() != second_target_entity_id.lower()
        ):
            return {
                "kind": "text_swap",
                "first_target_entity_id": first_target_entity_id,
                "first_current_value": first_current_value or None,
                "second_target_entity_id": second_target_entity_id,
                "second_current_value": second_current_value or None,
                "entity_type_hint": entity_type_hint or "text",
            }

    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    text_entities = _extract_text_entities(cad_context_obj)
    if len(text_entities) < 2:
        return None

    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    markup_meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    markup_bounds = _normalize_bounds(markup.get("bounds"))

    resolved_pair: Optional[List[Dict[str, Any]]] = None

    callout_points = _normalize_point_list(markup_meta.get("callout_points"))
    if len(callout_points) >= 2:
        farthest_pair = _farthest_point_pair(callout_points)
        endpoint_points = (
            [farthest_pair[0], farthest_pair[1]]
            if farthest_pair
            else [callout_points[0], callout_points[-1]]
        )
        search_radius = 36.0
        if markup_bounds:
            search_radius = max(
                search_radius,
                math.hypot(
                    float(markup_bounds.get("width") or 0.0),
                    float(markup_bounds.get("height") or 0.0),
                )
                * 2.5,
            )
        selected: List[Dict[str, Any]] = []
        used_ids: set[str] = set()
        for point in endpoint_points:
            best_candidate: Optional[Dict[str, Any]] = None
            best_distance = float("inf")
            for entity in text_entities:
                entity_id = str(entity.get("id") or "").strip()
                entity_bounds = (
                    entity.get("bounds") if isinstance(entity.get("bounds"), dict) else None
                )
                if not entity_id or entity_id in used_ids or not entity_bounds:
                    continue
                entity_center = _resolve_bounds_center(entity_bounds)
                distance = _distance_between_points(point, entity_center)
                if distance < best_distance:
                    best_candidate = entity
                    best_distance = distance
            if best_candidate and best_distance <= search_radius:
                selected.append(best_candidate)
                used_ids.add(str(best_candidate.get("id") or "").strip())
        if len(selected) == 2:
            resolved_pair = selected

    if resolved_pair is None and markup_bounds:
        candidates = [
            entity
            for entity in text_entities
            if _bounds_overlap(
                _expand_bounds(markup_bounds, 2.0),
                _expand_bounds(entity.get("bounds") or {}, 1.0),
            )
        ]
        if len(candidates) == 2:
            resolved_pair = sorted(
                candidates,
                key=lambda entity: (
                    float((entity.get("bounds") or {}).get("x") or 0.0),
                    float((entity.get("bounds") or {}).get("y") or 0.0),
                    str(entity.get("id") or ""),
                ),
            )

    if not resolved_pair or len(resolved_pair) != 2:
        return None

    first, second = resolved_pair
    first_target_entity_id = str(first.get("id") or "").strip()
    second_target_entity_id = str(second.get("id") or "").strip()
    if (
        not first_target_entity_id
        or not second_target_entity_id
        or first_target_entity_id.lower() == second_target_entity_id.lower()
    ):
        return None

    return {
        "kind": "text_swap",
        "first_target_entity_id": first_target_entity_id,
        "first_current_value": str(first.get("text") or "").strip() or None,
        "second_target_entity_id": second_target_entity_id,
        "second_current_value": str(second.get("text") or "").strip() or None,
        "entity_type_hint": "text",
    }


def _prepare_autodraft_execute_actions(
    actions: List[Dict[str, Any]],
    *,
    revision_context: Dict[str, str],
    cad_context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    prepared_actions: List[Dict[str, Any]] = []
    for action in actions:
        next_action = dict(action)
        category = _normalize_text(next_action.get("category"))
        if category == "title_block":
            execute_target = _build_title_block_execute_target(
                next_action,
                revision_context=revision_context,
            )
            if execute_target:
                next_action["execute_target"] = execute_target
            else:
                next_action.pop("execute_target", None)
        elif category == "add":
            execute_target = _build_text_replacement_execute_target(next_action)
            if execute_target:
                next_action["execute_target"] = execute_target
            elif (
                isinstance(next_action.get("execute_target"), dict)
                and _normalize_text(next_action["execute_target"].get("kind"))
                == "text_replacement"
            ):
                next_action.pop("execute_target", None)
        elif category == "delete":
            execute_target = _build_text_delete_execute_target(
                next_action,
                cad_context=cad_context,
            )
            if execute_target:
                next_action["execute_target"] = execute_target
            elif (
                isinstance(next_action.get("execute_target"), dict)
                and _normalize_text(next_action["execute_target"].get("kind"))
                == "text_delete"
            ):
                next_action.pop("execute_target", None)
        elif category == "dimension":
            execute_target = _build_dimension_text_execute_target(
                next_action,
                cad_context=cad_context,
            )
            if execute_target:
                next_action["execute_target"] = execute_target
            elif (
                isinstance(next_action.get("execute_target"), dict)
                and _normalize_text(next_action["execute_target"].get("kind"))
                == "dimension_text_override"
            ):
                next_action.pop("execute_target", None)
        elif category == "swap":
            execute_target = _build_text_swap_execute_target(
                next_action,
                cad_context=cad_context,
            )
            if execute_target:
                next_action["execute_target"] = execute_target
            elif (
                isinstance(next_action.get("execute_target"), dict)
                and _normalize_text(next_action["execute_target"].get("kind"))
                == "text_swap"
            ):
                next_action.pop("execute_target", None)
        prepared_actions.append(next_action)
    return prepared_actions


def _infer_page_position_zone(
    bounds: Dict[str, float],
    *,
    page_width: float,
    page_height: float,
) -> str:
    if page_width <= 0 or page_height <= 0:
        return "unknown"
    center = _bounds_center_payload(bounds)
    x_ratio = _clamp_value(float(center["x"]) / page_width, minimum=0.0, maximum=1.0)
    y_ratio = _clamp_value(float(center["y"]) / page_height, minimum=0.0, maximum=1.0)
    if x_ratio >= 0.66 and y_ratio <= 0.34:
        return "bottom-right"
    if x_ratio <= 0.34 and y_ratio <= 0.34:
        return "bottom-left"
    if x_ratio >= 0.66 and y_ratio >= 0.66:
        return "top-right"
    if x_ratio <= 0.34 and y_ratio >= 0.66:
        return "top-left"
    if y_ratio <= 0.2:
        return "bottom"
    if y_ratio >= 0.8:
        return "top"
    if x_ratio <= 0.2:
        return "left"
    if x_ratio >= 0.8:
        return "right"
    return "center"


def _infer_bounds_aspect(bounds: Dict[str, float]) -> str:
    width = _safe_float(bounds.get("width"))
    height = _safe_float(bounds.get("height"))
    if width is None or height is None or width <= 0 or height <= 0:
        return "unknown"
    ratio = width / max(height, 0.0001)
    if ratio >= 1.7:
        return "wide"
    if ratio <= 0.65:
        return "tall"
    if 0.8 <= ratio <= 1.25:
        return "square"
    return "normal"


def _enrich_markups_for_local_plan(markups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts_by_type: Dict[str, int] = {}
    counts_by_type_color: Dict[Tuple[str, str], int] = {}
    for markup in markups:
        markup_type = _normalize_text(markup.get("type")) or "unknown"
        markup_color = _normalize_text(markup.get("color")) or "unknown"
        counts_by_type[markup_type] = counts_by_type.get(markup_type, 0) + 1
        counts_by_type_color[(markup_type, markup_color)] = (
            counts_by_type_color.get((markup_type, markup_color), 0) + 1
        )

    enriched: List[Dict[str, Any]] = []
    for markup in markups:
        normalized_markup = dict(markup)
        meta = dict(markup.get("meta") or {}) if isinstance(markup.get("meta"), dict) else {}
        markup_type = _normalize_text(markup.get("type")) or "unknown"
        markup_color = _normalize_text(markup.get("color")) or "unknown"
        meta["rule_group_count_same_type"] = counts_by_type.get(markup_type, 1)
        meta["rule_group_count_same_type_color"] = counts_by_type_color.get(
            (markup_type, markup_color),
            1,
        )
        bounds = _normalize_bounds(markup.get("bounds"))
        page_width = _safe_float(meta.get("page_width"))
        page_height = _safe_float(meta.get("page_height"))
        if bounds:
            if not str(meta.get("aspect") or "").strip():
                meta["aspect"] = _infer_bounds_aspect(bounds)
            if (
                page_width is not None
                and page_height is not None
                and not str(meta.get("page_zone") or "").strip()
            ):
                meta["page_zone"] = _infer_page_position_zone(
                    bounds,
                    page_width=page_width,
                    page_height=page_height,
                )
        if meta:
            normalized_markup["meta"] = meta
        enriched.append(normalized_markup)
    return enriched


def _rule_matches(rule: Dict[str, Any], markup: Dict[str, Any]) -> bool:
    trigger = rule.get("trigger")
    if not isinstance(trigger, dict):
        return False

    markup_type = _normalize_text(markup.get("type"))
    markup_color = _normalize_text(markup.get("color"))
    markup_text = _normalize_text(_collect_markup_semantic_text(markup) or markup.get("text"))
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}

    trigger_type = _normalize_text(trigger.get("type"))
    if trigger_type and trigger_type != markup_type:
        return False

    trigger_color = _normalize_text(trigger.get("color"))
    if trigger_color and trigger_color != "any" and trigger_color != markup_color:
        return False

    contains = _normalize_text(trigger.get("text_contains"))
    if contains and contains not in markup_text:
        return False

    trigger_position = _normalize_text(trigger.get("position"))
    if trigger_position:
        page_zone = _normalize_text(meta.get("page_zone"))
        if trigger_position != page_zone:
            return False

    trigger_aspect = _normalize_text(trigger.get("aspect"))
    if trigger_aspect:
        aspect = _normalize_text(meta.get("aspect"))
        if trigger_aspect != aspect:
            return False

    trigger_count = _safe_float(trigger.get("count"))
    if trigger_count is not None:
        if trigger_color and trigger_color != "any":
            actual_count = int(
                _safe_float(meta.get("rule_group_count_same_type_color")) or 0
            )
        else:
            actual_count = int(_safe_float(meta.get("rule_group_count_same_type")) or 0)
        if actual_count != int(round(trigger_count)):
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


def _extract_paired_annotation_ids(markup: Dict[str, Any]) -> List[str]:
    meta = markup.get("meta")
    if not isinstance(meta, dict):
        return []
    raw_ids = meta.get("paired_annotation_ids")
    if not isinstance(raw_ids, list):
        return []
    output: List[str] = []
    seen: Set[str] = set()
    for value in raw_ids:
        if not isinstance(value, str):
            continue
        item = value.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def _is_note_text_candidate(markup: Dict[str, Any]) -> bool:
    if _normalize_text(markup.get("type")) != "text":
        return False
    meta = markup.get("meta")
    subtype = _normalize_text(meta.get("subtype")) if isinstance(meta, dict) else ""
    if subtype not in {"", "/freetext", "/text", "freetext", "text"}:
        return False
    markup_color = _normalize_text(markup.get("color"))
    if markup_color == "blue":
        return True
    if isinstance(meta, dict) and _normalize_point_list(meta.get("callout_points")):
        return True
    semantic_text = _normalize_text(_collect_markup_semantic_text(markup))
    return bool(_ANNOT_CALLOUT_HINT_PATTERN.search(semantic_text))


def _is_note_anchor_candidate(markup: Dict[str, Any]) -> bool:
    meta = markup.get("meta")
    subtype = _normalize_text(meta.get("subtype")) if isinstance(meta, dict) else ""
    markup_type = _normalize_text(markup.get("type"))
    if markup_type in {"rectangle", "cloud", "arrow"}:
        return True
    return subtype in {
        token.lower()
        for token in _ANNOT_NOTE_ANCHOR_SUBTYPES
    }


def _is_blue_note_candidate(markup: Dict[str, Any]) -> bool:
    return _normalize_text(markup.get("color")) == "blue" and _is_note_text_candidate(markup)


def _is_blue_rectangle_anchor(markup: Dict[str, Any]) -> bool:
    return _normalize_text(markup.get("color")) == "blue" and _is_note_anchor_candidate(markup)


def _bounds_center(bounds: Dict[str, float]) -> Dict[str, float]:
    return {
        "x": float(bounds["x"]) + (float(bounds["width"]) / 2.0),
        "y": float(bounds["y"]) + (float(bounds["height"]) / 2.0),
    }


def _distance_points(point_a: Dict[str, float], point_b: Dict[str, float]) -> float:
    dx = float(point_a["x"]) - float(point_b["x"])
    dy = float(point_a["y"]) - float(point_b["y"])
    return math.sqrt((dx * dx) + (dy * dy))


def _bounds_union(bounds_a: Dict[str, float], bounds_b: Dict[str, float]) -> Dict[str, float]:
    left = min(float(bounds_a["x"]), float(bounds_b["x"]))
    bottom = min(float(bounds_a["y"]), float(bounds_b["y"]))
    right = max(
        float(bounds_a["x"]) + float(bounds_a["width"]),
        float(bounds_b["x"]) + float(bounds_b["width"]),
    )
    top = max(
        float(bounds_a["y"]) + float(bounds_a["height"]),
        float(bounds_b["y"]) + float(bounds_b["height"]),
    )
    return {
        "x": left,
        "y": bottom,
        "width": max(0.0001, right - left),
        "height": max(0.0001, top - bottom),
    }


def _extract_callout_target_point(markup: Dict[str, Any]) -> Optional[Dict[str, float]]:
    meta = markup.get("meta")
    if not isinstance(meta, dict):
        return None
    raw_points = meta.get("callout_points")
    if not isinstance(raw_points, list):
        return None
    points: List[Dict[str, float]] = []
    for point in raw_points:
        if not isinstance(point, dict):
            continue
        x = _safe_float(point.get("x"))
        y = _safe_float(point.get("y"))
        if x is None or y is None:
            continue
        points.append({"x": x, "y": y})
    if not points:
        return None
    return points[-1]


def _point_within_bounds(
    point: Dict[str, float],
    bounds: Dict[str, float],
    *,
    padding: float = 0.0,
) -> bool:
    left = float(bounds["x"]) - padding
    right = float(bounds["x"]) + float(bounds["width"]) + padding
    bottom = float(bounds["y"]) - padding
    top = float(bounds["y"]) + float(bounds["height"]) + padding
    return left <= float(point["x"]) <= right and bottom <= float(point["y"]) <= top


def _score_note_anchor_pair(
    *,
    note_markup: Dict[str, Any],
    note_bounds: Dict[str, float],
    callout_target: Dict[str, float],
    anchor_markup: Dict[str, Any],
    anchor_bounds: Dict[str, float],
) -> Optional[Tuple[float, str]]:
    note_color = _normalize_text(note_markup.get("color"))
    anchor_color = _normalize_text(anchor_markup.get("color"))
    if (
        note_color
        and anchor_color
        and note_color != "unknown"
        and anchor_color != "unknown"
        and note_color != anchor_color
    ):
        return None

    anchor_center = _bounds_center(anchor_bounds)
    distance = _distance_points(callout_target, anchor_center)
    max_distance = max(
        10.0,
        _bounds_diagonal(note_bounds) * 2.6,
        _bounds_diagonal(anchor_bounds) * 1.9,
    )
    callout_padding = max(6.0, _bounds_diagonal(anchor_bounds) * 0.18)
    callout_hits_anchor = _point_within_bounds(
        callout_target,
        anchor_bounds,
        padding=callout_padding,
    )
    if distance > max_distance and not callout_hits_anchor:
        return None

    score = distance
    pairing_method = "proximity"
    if callout_hits_anchor:
        score -= max(8.0, _bounds_diagonal(anchor_bounds) * 0.4)
        pairing_method = "callout_target"
    if _bounds_overlap(_expand_bounds(note_bounds, 6.0), _expand_bounds(anchor_bounds, 6.0)):
        score -= 2.5
    return score, pairing_method


def _pair_blue_note_markups(markups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    anchor_entries: List[Tuple[int, Dict[str, Any], Dict[str, float]]] = []
    for index, markup in enumerate(markups):
        if not _is_note_anchor_candidate(markup):
            continue
        bounds = _normalize_bounds(markup.get("bounds"))
        if not bounds:
            continue
        anchor_entries.append((index, markup, bounds))

    used_anchor_indices: Set[int] = set()
    note_to_anchor: Dict[int, int] = {}

    for note_index, note_markup in enumerate(markups):
        if not _is_note_text_candidate(note_markup):
            continue
        note_bounds = _normalize_bounds(note_markup.get("bounds"))
        if not note_bounds:
            continue
        note_center = _bounds_center(note_bounds)
        callout_target = _extract_callout_target_point(note_markup) or note_center

        best_anchor_index: Optional[int] = None
        best_score: Optional[float] = None
        best_pairing_method = "proximity"
        for anchor_index, _anchor_markup, anchor_bounds in anchor_entries:
            if anchor_index in used_anchor_indices:
                continue
            score_result = _score_note_anchor_pair(
                note_markup=note_markup,
                note_bounds=note_bounds,
                callout_target=callout_target,
                anchor_markup=_anchor_markup,
                anchor_bounds=anchor_bounds,
            )
            if score_result is None:
                continue
            score, pairing_method = score_result
            if best_score is None or score < best_score:
                best_score = score
                best_anchor_index = anchor_index
                best_pairing_method = pairing_method
        if best_anchor_index is None:
            continue
        note_to_anchor[note_index] = best_anchor_index
        used_anchor_indices.add(best_anchor_index)
        note_meta = note_markup.get("meta") if isinstance(note_markup.get("meta"), dict) else {}
        if isinstance(note_meta, dict):
            note_meta["pairing_method"] = best_pairing_method

    if not note_to_anchor:
        return markups

    paired_markups: List[Dict[str, Any]] = []
    skipped_anchor_indices = set(note_to_anchor.values())
    for index, markup in enumerate(markups):
        if index in skipped_anchor_indices:
            continue
        anchor_index = note_to_anchor.get(index)
        if anchor_index is None:
            paired_markups.append(markup)
            continue
        anchor_markup = markups[anchor_index]
        note_bounds = _normalize_bounds(markup.get("bounds"))
        anchor_bounds = _normalize_bounds(anchor_markup.get("bounds"))
        combined = dict(markup)
        if note_bounds and anchor_bounds:
            combined["bounds"] = _bounds_union(note_bounds, anchor_bounds)

        combined_meta: Dict[str, Any] = {}
        if isinstance(markup.get("meta"), dict):
            combined_meta.update(markup.get("meta") or {})
        anchor_meta = anchor_markup.get("meta") if isinstance(anchor_markup.get("meta"), dict) else {}
        note_id = str(markup.get("id") or "").strip()
        anchor_id = str(anchor_markup.get("id") or "").strip()
        paired_ids = [
            value
            for value in (
                list(combined_meta.get("paired_annotation_ids") or [])
                + [note_id, anchor_id]
            )
            if isinstance(value, str) and value.strip()
        ]
        if paired_ids:
            combined_meta["paired_annotation_ids"] = list(dict.fromkeys(paired_ids))
        if isinstance(anchor_meta, dict):
            combined_meta["paired_anchor_subtype"] = anchor_meta.get("subtype")
        combined_meta["paired_anchor_type"] = anchor_markup.get("type")
        combined_meta["paired_anchor_color"] = anchor_markup.get("color")
        combined_meta["pairing_method"] = combined_meta.get("pairing_method") or "proximity"
        if combined_meta:
            combined["meta"] = combined_meta
        paired_markups.append(combined)
    return paired_markups


def _is_red_reference_add_markup(markup: Dict[str, Any]) -> bool:
    markup_text = str(markup.get("text") or "").strip()
    if not markup_text:
        return False
    return (
        _normalize_text(markup.get("color")) == "red"
        and _normalize_text(markup.get("type")) == "text"
        and bool(_SEE_DWG_REFERENCE_PATTERN.search(markup_text))
    )


def _resolve_markup_recognition_candidate(
    markup: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
    recognition_label = _normalize_text(recognition.get("label"))
    recognition_category = _RECOGNITION_LABEL_TO_CATEGORY.get(recognition_label)
    if not recognition_category:
        return None
    recognition_source = _normalize_text(recognition.get("source")) or "recognition"
    recognition_confidence = _safe_float(recognition.get("confidence")) or 0.0
    min_confidence = (
        _LOCAL_MODEL_RECOGNITION_MIN_CONFIDENCE
        if recognition_source == "local_model"
        else _RECOGNITION_FALLBACK_MIN_CONFIDENCE
    )
    low_signal_override_confidence = (
        _LOCAL_MODEL_RECOGNITION_LOW_SIGNAL_OVERRIDE_CONFIDENCE
        if recognition_source == "local_model"
        else min_confidence
    )
    return {
        "category": recognition_category,
        "label": recognition_label,
        "source": recognition_source,
        "confidence": recognition_confidence,
        "reason": f"recognition-{recognition_source}-{recognition_label}",
        "min_confidence": min_confidence,
        "low_signal_override_confidence": low_signal_override_confidence,
        "needs_review": bool(recognition.get("needs_review")),
    }


def _semantic_confidence_for_inferred_reason(markup: Dict[str, Any], reason: str) -> float:
    if str(reason or "").startswith("recognition-"):
        recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
        recognition_confidence = _safe_float(recognition.get("confidence"))
        if recognition_confidence is not None:
            return round(
                _clamp_value(recognition_confidence, minimum=0.0, maximum=1.0),
                4,
            )
        return 0.74
    if str(reason or "").startswith("keyword-"):
        return 0.76
    if str(reason or "").startswith("title-block-"):
        return 0.74
    return 0.64


def _semantic_status_for_inferred_reason(markup: Dict[str, Any], reason: str) -> str:
    if str(reason or "").startswith("recognition-"):
        recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
        if bool(recognition.get("needs_review")):
            return "needs_review"
    return "proposed"


def _build_semantic_action_item(
    *,
    action_id: str,
    markup: Dict[str, Any],
    category: str,
    reason: str,
) -> Dict[str, Any]:
    return {
        "id": action_id,
        "rule_id": f"semantic-{reason}",
        "category": category,
        "action": _semantic_action_message_for_category(category),
        "confidence": _semantic_confidence_for_inferred_reason(markup, reason),
        "markup": markup,
        "status": _semantic_status_for_inferred_reason(markup, reason),
    }


def _resolve_low_signal_rule_override(
    markup: Dict[str, Any],
    selected_rule: Dict[str, Any],
) -> Optional[Tuple[str, str]]:
    selected_rule_id = str(selected_rule.get("id") or "").strip()
    selected_category = str(selected_rule.get("category") or "").strip()
    if selected_rule_id not in _LOW_SIGNAL_DEFAULT_RULE_IDS or not selected_category:
        return None
    recognition_candidate = _resolve_markup_recognition_candidate(markup)
    if not recognition_candidate:
        return None
    if recognition_candidate["category"] == selected_category:
        return None
    if float(recognition_candidate["confidence"] or 0.0) < float(
        recognition_candidate["low_signal_override_confidence"] or 0.0
    ):
        return None
    return (
        str(recognition_candidate["category"]),
        str(recognition_candidate["reason"]),
    )


def _infer_semantic_category(markup: Dict[str, Any]) -> Tuple[Optional[str], str]:
    markup_text = _collect_markup_semantic_text(markup) or str(markup.get("text") or "")
    markup_color = _normalize_text(markup.get("color"))
    markup_type = _normalize_text(markup.get("type"))
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    page_zone = _normalize_text(meta.get("page_zone")) if isinstance(meta, dict) else ""
    aspect = _normalize_text(meta.get("aspect")) if isinstance(meta, dict) else ""
    paired_annotation_ids = _extract_paired_annotation_ids(markup)
    fill_color = _normalize_text(meta.get("fill_color")) if isinstance(meta, dict) else ""
    has_add_intent = bool(_ADD_INTENT_PATTERN.search(markup_text))
    has_delete_intent = bool(_DELETE_INTENT_PATTERN.search(markup_text))
    has_note_intent = bool(_NOTE_INTENT_PATTERN.search(markup_text))
    is_red_text_replacement = (
        markup_color == "red" and markup_type == "text" and bool(markup_text.strip())
    )
    recognition_candidate = _resolve_markup_recognition_candidate(markup)

    if markup_type == "rectangle" and page_zone == "bottom-right" and aspect == "wide":
        if _TITLE_BLOCK_TEXT_PATTERN.search(markup_text) or _TITLE_BLOCK_SUBJECT_HINT_PATTERN.search(
            markup_text
        ):
            return "TITLE_BLOCK", "title-block-rectangle-pattern"
    if markup_type == "text" and page_zone == "bottom-right" and _TITLE_BLOCK_TEXT_PATTERN.search(
        markup_text
    ):
        return "TITLE_BLOCK", "title-block-text-pattern"

    if has_add_intent and has_delete_intent:
        return None, "keyword-conflict"
    if has_delete_intent:
        return "DELETE", "keyword-delete"
    if has_add_intent:
        return "ADD", "keyword-add"
    if _is_red_reference_add_markup(markup):
        return "ADD", "keyword-see-dwg-reference"
    if is_red_text_replacement:
        return "ADD", "color-red-replacement"
    if paired_annotation_ids and markup_type == "text" and markup_color == "blue":
        return "NOTE", "paired-note-anchor"
    if has_note_intent:
        return "NOTE", "keyword-note"
    if fill_color == "yellow" and markup_type in {"text", "rectangle"}:
        return "NOTE", "fill-color-yellow"

    if (
        recognition_candidate
        and float(recognition_candidate["confidence"] or 0.0)
        >= float(recognition_candidate["min_confidence"] or 0.0)
    ):
        return (
            str(recognition_candidate["category"]),
            str(recognition_candidate["reason"]),
        )

    color_category = _DEFAULT_COLOR_TO_CATEGORY.get(markup_color)
    if color_category:
        return color_category, f"color-{markup_color}"
    return None, "no-semantic-match"


def _build_local_plan(markups: List[Dict[str, Any]]) -> Dict[str, Any]:
    effective_markups = _enrich_markups_for_local_plan(_pair_blue_note_markups(markups))
    for markup in effective_markups:
        if not isinstance(markup, dict):
            continue
        if not isinstance(markup.get("recognition"), dict):
            markup["recognition"] = _build_markup_recognition(
                markup,
                feature_source="local_plan_markups",
            )
    actions: List[Dict[str, Any]] = []
    for idx, markup in enumerate(effective_markups, start=1):
        paired_annotation_ids = _extract_paired_annotation_ids(markup)
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
                override = _resolve_low_signal_rule_override(markup, selected_rule)
                if override:
                    override_category, override_reason = override
                    action_item = _build_semantic_action_item(
                        action_id=f"action-{idx}",
                        markup=markup,
                        category=override_category,
                        reason=override_reason,
                    )
                else:
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
                inferred_category, inferred_reason = _infer_semantic_category(markup)
                if inferred_category:
                    action_item = _build_semantic_action_item(
                        action_id=f"action-{idx}",
                        markup=markup,
                        category=inferred_category,
                        reason=inferred_reason,
                    )
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

        if paired_annotation_ids:
            action_item["paired_annotation_ids"] = paired_annotation_ids

        actions.append(action_item)

    summary = {
        "total_markups": len(effective_markups),
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


def _recompute_plan_summary(plan_obj: Dict[str, Any]) -> None:
    actions = plan_obj.get("actions")
    if not isinstance(actions, list):
        actions = []
    classified = 0
    needs_review = 0
    for action in actions:
        if not isinstance(action, dict):
            continue
        rule_id = str(action.get("rule_id") or "").strip()
        if rule_id:
            classified += 1
        action_status = _normalize_text(action.get("status"))
        if action_status in {"review", "needs_review"} or not rule_id:
            needs_review += 1
    plan_obj["summary"] = {
        "total_markups": len(actions),
        "actions_proposed": len(actions),
        "classified": classified,
        "needs_review": needs_review,
    }


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


def _expand_bounds(bounds: Dict[str, float], padding: float) -> Dict[str, float]:
    if padding <= 0:
        return dict(bounds)
    return {
        "x": float(bounds["x"]) - padding,
        "y": float(bounds["y"]) - padding,
        "width": max(0.0001, float(bounds["width"]) + (padding * 2.0)),
        "height": max(0.0001, float(bounds["height"]) + (padding * 2.0)),
    }


def _bounds_intersection(
    bounds_a: Dict[str, float], bounds_b: Dict[str, float]
) -> Optional[Dict[str, float]]:
    left = max(float(bounds_a["x"]), float(bounds_b["x"]))
    bottom = max(float(bounds_a["y"]), float(bounds_b["y"]))
    right = min(
        float(bounds_a["x"]) + float(bounds_a["width"]),
        float(bounds_b["x"]) + float(bounds_b["width"]),
    )
    top = min(
        float(bounds_a["y"]) + float(bounds_a["height"]),
        float(bounds_b["y"]) + float(bounds_b["height"]),
    )
    if right <= left or top <= bottom:
        return None
    return {
        "x": left,
        "y": bottom,
        "width": max(0.0001, right - left),
        "height": max(0.0001, top - bottom),
    }


def _bounds_from_points(points: List[Dict[str, float]]) -> Optional[Dict[str, float]]:
    if not points:
        return None
    xs = [float(point["x"]) for point in points]
    ys = [float(point["y"]) for point in points]
    left = min(xs)
    right = max(xs)
    bottom = min(ys)
    top = max(ys)
    return {
        "x": left,
        "y": bottom,
        "width": max(0.0001, right - left),
        "height": max(0.0001, top - bottom),
    }


def _bounds_diagonal(bounds: Dict[str, float]) -> float:
    return math.hypot(float(bounds["width"]), float(bounds["height"]))


def _normalize_compare_roi(value: Any) -> Optional[Dict[str, float]]:
    return _normalize_bounds(value)


def _safe_float(value: Any) -> Optional[float]:
    try:
        parsed = float(value)
    except Exception:
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _rgb_triplet_to_color_name(rgb: Tuple[float, float, float]) -> str:
    r, g, b = rgb
    if max(r, g, b) < 0.05:
        return "black"
    if abs(r - g) < 0.08 and abs(g - b) < 0.08 and max(r, g, b) > 0.7:
        return "white"
    if r > g + 0.12 and r > b + 0.12:
        return "red"
    if g > r + 0.12 and g > b + 0.12:
        return "green"
    if b > r + 0.12 and b > g + 0.12:
        return "blue"
    if r > 0.7 and g > 0.7 and b < 0.45:
        return "yellow"
    return "unknown"


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _rgb_to_hex(rgb: Tuple[float, float, float]) -> str:
    red = int(round(_clamp_unit(rgb[0]) * 255))
    green = int(round(_clamp_unit(rgb[1]) * 255))
    blue = int(round(_clamp_unit(rgb[2]) * 255))
    return f"#{red:02X}{green:02X}{blue:02X}"


def _parse_rgb_channels(raw_values: List[Any], expected: int) -> Optional[List[float]]:
    if len(raw_values) < expected:
        return None
    parsed: List[float] = []
    for value in raw_values[:expected]:
        numeric = _safe_float(value)
        if numeric is None:
            return None
        parsed.append(_clamp_unit(numeric))
    return parsed


def _parse_cmyk_to_rgb(values: List[float]) -> Tuple[float, float, float]:
    c = _clamp_unit(values[0])
    m = _clamp_unit(values[1])
    y = _clamp_unit(values[2])
    k = _clamp_unit(values[3])
    return (
        1.0 - min(1.0, c + k),
        1.0 - min(1.0, m + k),
        1.0 - min(1.0, y + k),
    )


def _parse_annotation_array_color(value: Any) -> Optional[Tuple[float, float, float]]:
    if value is None:
        return None
    raw_values: List[Any]
    if isinstance(value, (list, tuple)):
        raw_values = list(value)
    elif hasattr(value, "__iter__") and not isinstance(value, (str, bytes, dict)):
        try:
            raw_values = list(value)
        except Exception:
            return None
    else:
        return None

    if not raw_values:
        return None
    cmyk_values = _parse_rgb_channels(raw_values, 4)
    if cmyk_values is not None:
        return _parse_cmyk_to_rgb(cmyk_values)
    rgb_values = _parse_rgb_channels(raw_values, 3)
    if rgb_values is not None:
        return (rgb_values[0], rgb_values[1], rgb_values[2])
    gray_values = _parse_rgb_channels(raw_values, 1)
    if gray_values is not None:
        gray = gray_values[0]
        return (gray, gray, gray)
    return None


def _parse_pdf_default_appearance_color(value: Any) -> Optional[Tuple[float, float, float]]:
    text = str(value or "").strip()
    if not text:
        return None
    cmyk_matches = list(_PDF_DA_CMYK_PATTERN.finditer(text))
    if cmyk_matches:
        last = cmyk_matches[-1]
        channels = _parse_rgb_channels([last.group(i) for i in range(1, 5)], 4)
        if channels is not None:
            return _parse_cmyk_to_rgb(channels)
    rgb_matches = list(_PDF_DA_RGB_PATTERN.finditer(text))
    if rgb_matches:
        last = rgb_matches[-1]
        channels = _parse_rgb_channels([last.group(i) for i in range(1, 4)], 3)
        if channels is not None:
            return (channels[0], channels[1], channels[2])
    gray_matches = list(_PDF_DA_GRAY_PATTERN.finditer(text))
    if gray_matches:
        last = gray_matches[-1]
        channels = _parse_rgb_channels([last.group(1)], 1)
        if channels is not None:
            gray = channels[0]
            return (gray, gray, gray)
    return None


def _parse_css_channel_value(raw_value: str) -> Optional[float]:
    value = raw_value.strip()
    if not value:
        return None
    if value.endswith("%"):
        numeric = _safe_float(value[:-1])
        if numeric is None:
            return None
        return _clamp_unit(numeric / 100.0)
    numeric = _safe_float(value)
    if numeric is None:
        return None
    return _clamp_unit(numeric / 255.0)


def _parse_css_color_rgb(value: Any) -> Optional[Tuple[float, float, float]]:
    text = str(value or "").strip()
    if not text:
        return None
    hex_match = _CSS_HEX_COLOR_PATTERN.search(text)
    if hex_match:
        hex_value = hex_match.group(1)
        if len(hex_value) == 3:
            hex_value = "".join(char * 2 for char in hex_value)
        try:
            red = int(hex_value[0:2], 16) / 255.0
            green = int(hex_value[2:4], 16) / 255.0
            blue = int(hex_value[4:6], 16) / 255.0
            return (_clamp_unit(red), _clamp_unit(green), _clamp_unit(blue))
        except Exception:
            return None

    rgb_match = _CSS_RGB_COLOR_PATTERN.search(text)
    if not rgb_match:
        return None
    red = _parse_css_channel_value(rgb_match.group(1))
    green = _parse_css_channel_value(rgb_match.group(2))
    blue = _parse_css_channel_value(rgb_match.group(3))
    if red is None or green is None or blue is None:
        return None
    return (red, green, blue)


def _extract_annotation_color(
    annotation: Any,
) -> Tuple[str, Optional[Tuple[float, float, float]], Optional[str], str]:
    color_details = _extract_annotation_color_details(annotation)
    return (
        str(color_details.get("color") or "unknown"),
        color_details.get("rgb"),
        color_details.get("color_hex"),
        str(color_details.get("color_source") or "unknown"),
    )


def _extract_annotation_color_details(annotation: Any) -> Dict[str, Any]:
    stroke_candidates: List[Tuple[str, Optional[Tuple[float, float, float]]]] = [
        ("C", _parse_annotation_array_color(annotation.get("/C"))),
        ("DA", _parse_pdf_default_appearance_color(annotation.get("/DA"))),
        ("DS", _parse_css_color_rgb(annotation.get("/DS"))),
        ("RC", _parse_css_color_rgb(annotation.get("/RC"))),
    ]
    fill_candidates: List[Tuple[str, Optional[Tuple[float, float, float]]]] = [
        ("IC", _parse_annotation_array_color(annotation.get("/IC"))),
    ]

    stroke_source = "unknown"
    stroke_rgb: Optional[Tuple[float, float, float]] = None
    for source, rgb in stroke_candidates:
        if rgb is None:
            continue
        stroke_source = source
        stroke_rgb = rgb
        break

    fill_source = "unknown"
    fill_rgb: Optional[Tuple[float, float, float]] = None
    for source, rgb in fill_candidates:
        if rgb is None:
            continue
        fill_source = source
        fill_rgb = rgb
        break

    primary_rgb = stroke_rgb or fill_rgb
    primary_source = stroke_source if stroke_rgb is not None else fill_source
    return {
        "color": _rgb_triplet_to_color_name(primary_rgb) if primary_rgb is not None else "unknown",
        "rgb": primary_rgb,
        "color_hex": _rgb_to_hex(primary_rgb) if primary_rgb is not None else None,
        "color_source": primary_source if primary_rgb is not None else "unknown",
        "stroke_color": _rgb_triplet_to_color_name(stroke_rgb) if stroke_rgb is not None else "unknown",
        "stroke_rgb": stroke_rgb,
        "stroke_color_hex": _rgb_to_hex(stroke_rgb) if stroke_rgb is not None else None,
        "stroke_color_source": stroke_source if stroke_rgb is not None else "unknown",
        "fill_color": _rgb_triplet_to_color_name(fill_rgb) if fill_rgb is not None else "unknown",
        "fill_rgb": fill_rgb,
        "fill_color_hex": _rgb_to_hex(fill_rgb) if fill_rgb is not None else None,
        "fill_color_source": fill_source if fill_rgb is not None else "unknown",
    }


def _normalize_annotation_callout_points(value: Any) -> Optional[List[Dict[str, float]]]:
    if value is None:
        return None
    raw_values: List[Any]
    if isinstance(value, (list, tuple)):
        raw_values = list(value)
    elif hasattr(value, "__iter__") and not isinstance(value, (str, bytes, dict)):
        try:
            raw_values = list(value)
        except Exception:
            return None
    else:
        return None

    if len(raw_values) < 2:
        return None
    points: List[Dict[str, float]] = []
    limit = len(raw_values) - (len(raw_values) % 2)
    for index in range(0, limit, 2):
        x = _safe_float(raw_values[index])
        y = _safe_float(raw_values[index + 1])
        if x is None or y is None:
            continue
        points.append({"x": x, "y": y})
    if not points:
        return None
    return points


def _normalize_annotation_line_points(value: Any) -> Optional[List[Dict[str, float]]]:
    points = _normalize_annotation_callout_points(value)
    if not points or len(points) < 2:
        return None
    return points[:2]


def _normalize_annotation_vertices(value: Any) -> Optional[List[Dict[str, float]]]:
    return _normalize_annotation_callout_points(value)


def _normalize_annotation_ink_strokes(value: Any) -> Optional[List[List[Dict[str, float]]]]:
    if value is None:
        return None
    raw_strokes: List[Any]
    if isinstance(value, (list, tuple)):
        raw_strokes = list(value)
    elif hasattr(value, "__iter__") and not isinstance(value, (str, bytes, dict)):
        try:
            raw_strokes = list(value)
        except Exception:
            return None
    else:
        return None
    strokes: List[List[Dict[str, float]]] = []
    for raw_stroke in raw_strokes:
        points = _normalize_annotation_callout_points(raw_stroke)
        if points:
            strokes.append(points)
    return strokes or None


def _normalize_annotation_line_endings(value: Any) -> List[str]:
    if value is None:
        return []
    raw_values: List[Any]
    if isinstance(value, (list, tuple)):
        raw_values = list(value)
    else:
        raw_values = [value]
    endings: List[str] = []
    for raw in raw_values:
        token = _normalize_text(raw).lstrip("/")
        if not token:
            continue
        endings.append(token)
    return list(dict.fromkeys(endings))


def _extract_annotation_geometry(annotation: Any) -> Dict[str, Any]:
    rect_bounds = _normalize_annotation_bounds(annotation.get("/Rect"))
    callout_points = _normalize_annotation_callout_points(annotation.get("/CL"))
    line_points = _normalize_annotation_line_points(annotation.get("/L"))
    vertices = _normalize_annotation_vertices(annotation.get("/Vertices"))
    ink_strokes = _normalize_annotation_ink_strokes(annotation.get("/InkList"))
    line_endings = _normalize_annotation_line_endings(annotation.get("/LE"))

    geometry_points: List[Dict[str, float]] = []
    if callout_points:
        geometry_points.extend(callout_points)
    if line_points:
        geometry_points.extend(line_points)
    if vertices:
        geometry_points.extend(vertices)
    if ink_strokes:
        for stroke in ink_strokes:
            geometry_points.extend(stroke)
    geometry_bounds = _bounds_from_points(geometry_points) if geometry_points else None

    bounds_source = "rect"
    bounds = rect_bounds
    if bounds is None and geometry_bounds is not None:
        bounds = geometry_bounds
        bounds_source = "geometry"
    elif bounds is None:
        bounds_source = "unknown"

    return {
        "bounds": bounds,
        "bounds_source": bounds_source,
        "geometry_bounds": geometry_bounds,
        "callout_points": callout_points,
        "line_points": line_points,
        "vertices": vertices,
        "ink_strokes": ink_strokes,
        "line_endings": line_endings,
        "geometry_point_count": len(geometry_points),
    }


def _classify_annotation_markup_type(
    *,
    subtype: str,
    intent: str,
    subject: str,
    text: str,
    line_endings: List[str],
    has_callout: bool,
    has_vertices: bool,
    has_fill: bool,
) -> Optional[str]:
    semantic_text = " ".join(
        entry
        for entry in [intent, subject, _normalize_text(text)]
        if entry
    )
    if subtype in _ANNOT_TEXT_SUBTYPES:
        return "text"
    if subtype in _ANNOT_LINE_SUBTYPES:
        return "arrow"
    if subtype in _ANNOT_RECTANGLE_SUBTYPES:
        if _ANNOT_CLOUD_HINT_PATTERN.search(semantic_text):
            return "cloud"
        if has_fill and not _ANNOT_RECTANGLE_HINT_PATTERN.search(semantic_text):
            return "rectangle"
        return "rectangle"
    if subtype in _ANNOT_GEOMETRIC_SUBTYPES:
        if any(token in _ARROW_LINE_ENDING_TOKENS for token in line_endings):
            return "arrow"
        if _ANNOT_ARROW_HINT_PATTERN.search(semantic_text):
            return "arrow"
        if _ANNOT_CLOUD_HINT_PATTERN.search(semantic_text) or has_vertices:
            return "cloud"
        return "cloud"
    if _ANNOT_CLOUD_HINT_PATTERN.search(semantic_text):
        return "cloud"
    if _ANNOT_ARROW_HINT_PATTERN.search(semantic_text) or any(
        token in _ARROW_LINE_ENDING_TOKENS for token in line_endings
    ):
        return "arrow"
    if has_callout:
        return "text"
    return None


def _normalize_annotation_bounds(rect_raw: Any) -> Optional[Dict[str, float]]:
    if not isinstance(rect_raw, (list, tuple)) or len(rect_raw) < 4:
        return None
    x0 = _safe_float(rect_raw[0])
    y0 = _safe_float(rect_raw[1])
    x1 = _safe_float(rect_raw[2])
    y1 = _safe_float(rect_raw[3])
    if x0 is None or y0 is None or x1 is None or y1 is None:
        return None
    left = min(x0, x1)
    right = max(x0, x1)
    bottom = min(y0, y1)
    top = max(y0, y1)
    width = right - left
    height = top - bottom
    if width <= 0 or height <= 0:
        return None
    return {"x": left, "y": bottom, "width": width, "height": height}


def _to_pdf_meta_text(value: Any, max_length: int = 220) -> Optional[str]:
    if value is None:
        return None
    try:
        text = str(value).strip()
    except Exception:
        return None
    if not text:
        return None
    if len(text) > max_length:
        return f"{text[: max_length - 3]}..."
    return text


def _extract_pdf_prepare_metadata(
    *,
    reader: Any,
    page: Any,
    page_index: int,
    page_width: float,
    page_height: float,
    annotation_total: int,
    annotation_supported: int,
    annotation_unsupported: int,
    annotation_subtype_counts: Dict[str, int],
) -> Dict[str, Any]:
    metadata_raw = getattr(reader, "metadata", None)
    metadata_map: Dict[str, Any] = {}
    if hasattr(metadata_raw, "items"):
        try:
            for raw_key, raw_value in metadata_raw.items():
                key = _to_pdf_meta_text(raw_key, 64)
                if not key:
                    continue
                metadata_map[key] = raw_value
        except Exception:
            metadata_map = {}

    def meta_text(*keys: str) -> Optional[str]:
        for key in keys:
            if key in metadata_map:
                normalized = _to_pdf_meta_text(metadata_map.get(key))
                if normalized:
                    return normalized
        return None

    xmp_raw = getattr(reader, "xmp_metadata", None)
    xmp_creator = _to_pdf_meta_text(getattr(xmp_raw, "xmp_creator_tool", None))
    xmp_producer = _to_pdf_meta_text(getattr(xmp_raw, "pdf_producer", None))
    xmp_text = _to_pdf_meta_text(xmp_raw, 5000)

    title = meta_text("/Title", "Title")
    author = meta_text("/Author", "Author")
    subject = meta_text("/Subject", "Subject")
    creator = meta_text("/Creator", "Creator") or xmp_creator
    producer = meta_text("/Producer", "Producer") or xmp_producer
    keywords = meta_text("/Keywords", "Keywords")
    created_utc = meta_text("/CreationDate", "CreationDate")
    modified_utc = meta_text("/ModDate", "ModDate")

    custom: Dict[str, str] = {}
    for raw_key, raw_value in metadata_map.items():
        key = _to_pdf_meta_text(raw_key, 64)
        value = _to_pdf_meta_text(raw_value)
        if not key or not value:
            continue
        if key in {
            "/Title",
            "Title",
            "/Author",
            "Author",
            "/Subject",
            "Subject",
            "/Creator",
            "Creator",
            "/Producer",
            "Producer",
            "/Keywords",
            "Keywords",
            "/CreationDate",
            "CreationDate",
            "/ModDate",
            "ModDate",
        }:
            continue
        if len(custom) >= 20:
            break
        custom[key] = value

    bluebeam_reasons: List[str] = []
    producer_text = (producer or "").lower()
    creator_text = (creator or "").lower()
    if "bluebeam" in producer_text:
        bluebeam_reasons.append("producer")
    if "bluebeam" in creator_text:
        bluebeam_reasons.append("creator")
    if not bluebeam_reasons:
        for value in custom.values():
            if "bluebeam" in value.lower():
                bluebeam_reasons.append("custom-metadata")
                break
    if not bluebeam_reasons and xmp_text and "bluebeam" in xmp_text.lower():
        bluebeam_reasons.append("xmp-metadata")

    page_rotation = _safe_float(page.get("/Rotate")) if isinstance(page, dict) else None
    page_user_unit = _safe_float(page.get("/UserUnit")) if isinstance(page, dict) else None
    crop_box = _normalize_annotation_bounds(page.get("/CropBox")) if isinstance(page, dict) else None

    return {
        "bluebeam_detected": len(bluebeam_reasons) > 0,
        "detection_reasons": bluebeam_reasons,
        "document": {
            "title": title,
            "author": author,
            "subject": subject,
            "creator": creator,
            "producer": producer,
            "keywords": keywords,
            "created_utc": created_utc,
            "modified_utc": modified_utc,
            "custom": custom,
        },
        "page": {
            "index": page_index,
            "rotation_deg": page_rotation if page_rotation is not None else 0.0,
            "user_unit": page_user_unit,
            "media_box": {"width": page_width, "height": page_height},
            "crop_box": crop_box,
            "annotation_counts": {
                "total": annotation_total,
                "supported": annotation_supported,
                "unsupported": annotation_unsupported,
                "by_subtype": annotation_subtype_counts,
            },
        },
    }


def _extract_measurement_seed(page_obj: Any) -> Dict[str, Any]:
    seed: Dict[str, Any] = {
        "available": False,
        "source": "none",
        "scale_hint": None,
        "rotation_hint_deg": None,
        "ratio_text": None,
        "notes": [],
    }
    measure_candidates: List[Any] = []
    if isinstance(page_obj, dict):
        page_measure = page_obj.get("/Measure")
        if page_measure is not None:
            measure_candidates.append(page_measure)
        raw_viewports = page_obj.get("/VP")
        if isinstance(raw_viewports, list):
            for viewport_obj in raw_viewports:
                viewport = viewport_obj.get_object() if hasattr(viewport_obj, "get_object") else viewport_obj
                if not isinstance(viewport, dict):
                    continue
                viewport_measure = viewport.get("/Measure")
                if viewport_measure is not None:
                    measure_candidates.append(viewport_measure)

    normalized_candidates: List[Dict[str, Any]] = []
    for candidate in measure_candidates:
        measure_obj = candidate.get_object() if hasattr(candidate, "get_object") else candidate
        if isinstance(measure_obj, dict):
            normalized_candidates.append(measure_obj)

    if not normalized_candidates:
        return seed

    seed["available"] = True
    seed["source"] = "pdf-measure"

    first = normalized_candidates[0]
    ratio_text = str(first.get("/R") or "").strip()
    if ratio_text:
        seed["ratio_text"] = ratio_text
        ratio_numbers = [float(entry) for entry in re.findall(r"[-+]?\d+(?:\.\d+)?", ratio_text)]
        if len(ratio_numbers) >= 2 and ratio_numbers[0] != 0:
            try:
                seed["scale_hint"] = abs(ratio_numbers[1] / ratio_numbers[0])
            except Exception:
                pass

    if seed["scale_hint"] is None:
        raw_x = first.get("/X")
        if isinstance(raw_x, list) and raw_x:
            first_x = raw_x[0]
            first_x_obj = first_x.get_object() if hasattr(first_x, "get_object") else first_x
            if isinstance(first_x_obj, dict):
                conversion = _safe_float(first_x_obj.get("/C"))
                if conversion is not None and conversion > 0:
                    seed["scale_hint"] = conversion

    if seed["scale_hint"] is None:
        seed["notes"].append("PDF measurement metadata found but no numeric scale hint was parsed.")
    else:
        seed["notes"].append("Scale hint parsed from PDF measurement metadata; confirm with two-point calibration.")

    return seed


def _build_prepare_auto_calibration_payload(seed: Dict[str, Any]) -> Dict[str, Any]:
    seed_obj = seed if isinstance(seed, dict) else {}
    notes: List[str] = []
    if bool(seed_obj.get("available")):
        notes.append(
            "Auto-calibration can use PDF measurement seed, but live CAD anchors are required at compare time."
        )
    else:
        notes.append("No PDF measurement seed detected; auto-calibration will rely on extents and anchor matching.")
    return _build_auto_calibration_payload(
        available=True,
        used=False,
        status="needs_manual",
        confidence=0.0,
        method="prepare-seed-scan",
        quality_notes=notes,
        suggested_pdf_points=[],
        suggested_cad_points=[],
    )


def _extract_pdf_compare_markups(
    *,
    pdf_stream: Any,
    page_index: int,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    if not _PYPDF_AVAILABLE or _PdfReader is None:
        return None, "pypdf is not installed on backend runtime.", 503

    try:
        reader = _PdfReader(pdf_stream)
    except Exception as exc:
        return None, f"Failed to read PDF: {str(exc)}", 400

    total_pages = len(reader.pages)
    if total_pages <= 0:
        return None, "PDF file has no pages.", 400
    if page_index < 0 or page_index >= total_pages:
        return None, f"page_index is out of range (0..{total_pages - 1}).", 400

    page = reader.pages[page_index]
    media_box = getattr(page, "mediabox", None)
    page_width = _safe_float(getattr(media_box, "width", None))
    page_height = _safe_float(getattr(media_box, "height", None))
    if page_width is None:
        page_width = 0.0
    if page_height is None:
        page_height = 0.0

    warnings: List[str] = []
    markups: List[Dict[str, Any]] = []
    annotation_total = 0
    annotation_supported = 0
    annotation_unsupported = 0
    annotation_subtype_counts: Dict[str, int] = {}
    annotation_type_counts: Dict[str, int] = {}
    prepare_feature_source = "pdf_annotations"

    raw_annots = page.get("/Annots")
    annotation_entries: Optional[List[Any]] = None
    if raw_annots is not None and hasattr(raw_annots, "get_object"):
        try:
            raw_annots = raw_annots.get_object()
        except Exception:
            raw_annots = None
    if isinstance(raw_annots, list):
        annotation_entries = raw_annots
    elif isinstance(raw_annots, tuple):
        annotation_entries = list(raw_annots)
    elif raw_annots is not None and not isinstance(raw_annots, (str, bytes, dict)):
        try:
            annotation_entries = list(raw_annots)
        except TypeError:
            annotation_entries = None

    if annotation_entries is not None:
        for idx, annot_ref in enumerate(annotation_entries, start=1):
            annotation_total += 1
            annot_obj = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
            if not isinstance(annot_obj, dict):
                annotation_unsupported += 1
                subtype_key = "unknown"
                annotation_subtype_counts[subtype_key] = annotation_subtype_counts.get(subtype_key, 0) + 1
                warnings.append(f"Annotation #{idx} skipped: unsupported object.")
                continue

            subtype = str(annot_obj.get("/Subtype") or "").strip()
            subtype_key = subtype or "unknown"
            annotation_subtype_counts[subtype_key] = annotation_subtype_counts.get(subtype_key, 0) + 1
            intent_text = _normalize_display_text(annot_obj.get("/IT"), max_length=120)
            intent = _normalize_text(intent_text)
            subject_text = _normalize_display_text(annot_obj.get("/Subj"), max_length=220)
            subject = _normalize_text(subject_text)
            overlay_text = _normalize_display_text(annot_obj.get("/OverlayText"))
            annotation_name = _normalize_display_text(annot_obj.get("/NM"), max_length=120)
            author_text = _normalize_display_text(annot_obj.get("/T"), max_length=120)
            text_candidates = _extract_annotation_text_candidates(annot_obj)
            text = text_candidates[0][1] if text_candidates else ""
            text_source = text_candidates[0][0] if text_candidates else "none"
            color_details = _extract_annotation_color_details(annot_obj)
            geometry = _extract_annotation_geometry(annot_obj)
            markup_type = _classify_annotation_markup_type(
                subtype=subtype,
                intent=intent,
                subject=subject,
                text=text,
                line_endings=list(geometry.get("line_endings") or []),
                has_callout=bool(geometry.get("callout_points")),
                has_vertices=bool(geometry.get("vertices")) or bool(geometry.get("ink_strokes")),
                has_fill=_normalize_text(color_details.get("fill_color")) not in {"", "unknown"},
            )
            if not markup_type:
                annotation_unsupported += 1
                warnings.append(f"Annotation #{idx} skipped: unsupported subtype {subtype or 'unknown'}.")
                continue

            bounds = geometry.get("bounds")
            if not bounds:
                annotation_unsupported += 1
                warnings.append(f"Annotation #{idx} skipped: missing/invalid annotation bounds.")
                continue

            color_name = str(color_details.get("color") or "unknown")
            rgb = color_details.get("rgb")
            color_hex = color_details.get("color_hex")
            color_source = str(color_details.get("color_source") or "unknown")
            callout_points = geometry.get("callout_points")
            page_zone = _infer_page_position_zone(
                bounds,
                page_width=page_width,
                page_height=page_height,
            )
            aspect = _infer_bounds_aspect(bounds)

            markup_payload: Dict[str, Any] = {
                "id": f"annot-{idx}",
                "type": markup_type,
                "color": color_name,
                "text": text,
                "bounds": bounds,
                "meta": {
                    "subtype": subtype or "unknown",
                    "intent": intent_text or None,
                    "subject": subject_text or None,
                    "overlay_text": overlay_text or None,
                    "annotation_name": annotation_name or None,
                    "author": author_text or None,
                    "text_source": text_source,
                    "text_sources": [source for source, _value in text_candidates],
                    "color_source": color_source,
                    "color_hex": color_hex,
                    "color_rgb": None,
                    "stroke_color": color_details.get("stroke_color"),
                    "stroke_color_source": color_details.get("stroke_color_source"),
                    "stroke_color_hex": color_details.get("stroke_color_hex"),
                    "stroke_color_rgb": None,
                    "fill_color": color_details.get("fill_color"),
                    "fill_color_source": color_details.get("fill_color_source"),
                    "fill_color_hex": color_details.get("fill_color_hex"),
                    "fill_color_rgb": None,
                    "page_index": page_index,
                    "page_width": page_width,
                    "page_height": page_height,
                    "page_bounds": dict(bounds),
                    "page_position": _bounds_center_payload(bounds),
                    "page_zone": page_zone,
                    "aspect": aspect,
                    "bounds_source": geometry.get("bounds_source"),
                    "geometry_bounds": geometry.get("geometry_bounds"),
                    "geometry_point_count": geometry.get("geometry_point_count"),
                    "line_endings": list(geometry.get("line_endings") or []),
                },
            }
            if rgb:
                rgb_payload = {
                    "r": rgb[0],
                    "g": rgb[1],
                    "b": rgb[2],
                }
                markup_payload["meta"]["rgb"] = rgb_payload
                markup_payload["meta"]["color_rgb"] = rgb_payload
            stroke_rgb = color_details.get("stroke_rgb")
            if stroke_rgb:
                markup_payload["meta"]["stroke_color_rgb"] = {
                    "r": stroke_rgb[0],
                    "g": stroke_rgb[1],
                    "b": stroke_rgb[2],
                }
            fill_rgb = color_details.get("fill_rgb")
            if fill_rgb:
                markup_payload["meta"]["fill_color_rgb"] = {
                    "r": fill_rgb[0],
                    "g": fill_rgb[1],
                    "b": fill_rgb[2],
                }
            if callout_points:
                markup_payload["meta"]["callout_points"] = callout_points
            if geometry.get("line_points"):
                markup_payload["meta"]["line_points"] = geometry.get("line_points")
            if geometry.get("vertices"):
                markup_payload["meta"]["vertices"] = geometry.get("vertices")
            if geometry.get("ink_strokes"):
                markup_payload["meta"]["ink_strokes"] = geometry.get("ink_strokes")
            markup_payload["recognition"] = _build_markup_recognition(
                markup_payload,
                feature_source="pdf_annotations",
            )
            markups.append(markup_payload)
            annotation_supported += 1
            annotation_type_counts[markup_type] = annotation_type_counts.get(markup_type, 0) + 1
    else:
        warnings.append(
            "No /Annots array was found on this page. If markups were flattened, annotation extraction returns 0."
        )

    pdf_metadata = _extract_pdf_prepare_metadata(
        reader=reader,
        page=page,
        page_index=page_index,
        page_width=page_width,
        page_height=page_height,
        annotation_total=annotation_total,
        annotation_supported=annotation_supported,
        annotation_unsupported=annotation_unsupported,
        annotation_subtype_counts=annotation_subtype_counts,
    )
    text_extraction = {
        "used": False,
        "source": "none",
        "feature_source": "pdf_annotations",
        "render_available": pdf_render_available(),
        "ocr_available": pdf_ocr_available(),
        "embedded_line_count": 0,
        "ocr_line_count": 0,
        "candidate_count": 0,
        "selected_line_count": 0,
        "skipped_without_bounds": 0,
        "selected_black_text_count": 0,
    }
    if annotation_supported <= 0:
        text_fallback = _extract_prepare_text_fallback_markups(
            pdf_stream=pdf_stream,
            page_index=page_index,
            page_width=page_width,
            page_height=page_height,
            pdf_metadata=pdf_metadata,
        )
        if isinstance(text_fallback.get("diagnostics"), dict):
            text_extraction.update(text_fallback.get("diagnostics") or {})
        warnings.extend(
            [
                item
                for item in (text_fallback.get("warnings") or [])
                if isinstance(item, str) and item.strip()
            ]
        )
        fallback_markups = (
            text_fallback.get("markups") if isinstance(text_fallback.get("markups"), list) else []
        )
        if fallback_markups:
            markups = [entry for entry in fallback_markups if isinstance(entry, dict)]
            prepare_feature_source = str(text_extraction.get("feature_source") or "pdf_text_fallback")

    page_metadata = pdf_metadata.get("page") if isinstance(pdf_metadata.get("page"), dict) else None
    if isinstance(page_metadata, dict):
        annotation_counts = (
            page_metadata.get("annotation_counts")
            if isinstance(page_metadata.get("annotation_counts"), dict)
            else None
        )
        if isinstance(annotation_counts, dict):
            annotation_counts["by_type"] = annotation_type_counts
        page_metadata["text_extraction"] = text_extraction

    calibration_seed = _extract_measurement_seed(page)
    payload = {
        "ok": True,
        "success": True,
        "page": {
            "index": page_index,
            "total_pages": total_pages,
            "width": page_width,
            "height": page_height,
        },
        "calibration_seed": calibration_seed,
        "auto_calibration": _build_prepare_auto_calibration_payload(calibration_seed),
        "pdf_metadata": pdf_metadata,
        "warnings": warnings,
        "markups": markups,
        "recognition": _compare_recognition_summary(
            markups,
            feature_source=prepare_feature_source,
            agent_hints_applied=False,
        ),
    }
    return payload, None, 200


def _normalize_point_pair_list(value: Any) -> Optional[List[Dict[str, float]]]:
    if not isinstance(value, list) or len(value) != 2:
        return None
    output: List[Dict[str, float]] = []
    for entry in value:
        if not isinstance(entry, dict):
            return None
        x = _safe_float(entry.get("x"))
        y = _safe_float(entry.get("y"))
        if x is None or y is None:
            return None
        output.append({"x": x, "y": y})
    return output


def _normalize_point_list(value: Any) -> List[Dict[str, float]]:
    if not isinstance(value, list):
        return []
    points: List[Dict[str, float]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        x = _safe_float(entry.get("x"))
        y = _safe_float(entry.get("y"))
        if x is None or y is None:
            continue
        points.append({"x": x, "y": y})
    return points


def _build_similarity_transform(
    *,
    pdf_points: List[Dict[str, float]],
    cad_points: List[Dict[str, float]],
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if len(pdf_points) != 2 or len(cad_points) != 2:
        return None, "Exactly two PDF points and two CAD points are required."

    p1 = pdf_points[0]
    p2 = pdf_points[1]
    c1 = cad_points[0]
    c2 = cad_points[1]

    pvx = p2["x"] - p1["x"]
    pvy = p2["y"] - p1["y"]
    cvx = c2["x"] - c1["x"]
    cvy = c2["y"] - c1["y"]
    pdf_distance = math.hypot(pvx, pvy)
    cad_distance = math.hypot(cvx, cvy)
    if pdf_distance <= 1e-6 or cad_distance <= 1e-6:
        return None, "Calibration points must not be identical."

    scale = cad_distance / pdf_distance
    pdf_angle = math.atan2(pvy, pvx)
    cad_angle = math.atan2(cvy, cvx)
    rotation = cad_angle - pdf_angle
    cos_t = math.cos(rotation)
    sin_t = math.sin(rotation)

    tx = c1["x"] - (scale * ((cos_t * p1["x"]) - (sin_t * p1["y"])))
    ty = c1["y"] - (scale * ((sin_t * p1["x"]) + (cos_t * p1["y"])))

    return (
        {
            "scale": scale,
            "rotation_rad": rotation,
            "rotation_deg": math.degrees(rotation),
            "translation": {"x": tx, "y": ty},
            "pdf_points": pdf_points,
            "cad_points": cad_points,
        },
        None,
    )


def _transform_point_to_cad(point: Dict[str, float], transform: Dict[str, Any]) -> Dict[str, float]:
    scale = float(transform.get("scale") or 1.0)
    rotation_rad = float(transform.get("rotation_rad") or 0.0)
    translation = transform.get("translation") if isinstance(transform.get("translation"), dict) else {}
    tx = _safe_float(translation.get("x")) or 0.0
    ty = _safe_float(translation.get("y")) or 0.0
    cos_t = math.cos(rotation_rad)
    sin_t = math.sin(rotation_rad)

    px = float(point["x"])
    py = float(point["y"])
    return {
        "x": (scale * ((cos_t * px) - (sin_t * py))) + tx,
        "y": (scale * ((sin_t * px) + (cos_t * py))) + ty,
    }


def _transform_bounds_to_cad(bounds: Dict[str, float], transform: Dict[str, Any]) -> Dict[str, float]:
    x0 = float(bounds["x"])
    y0 = float(bounds["y"])
    x1 = x0 + float(bounds["width"])
    y1 = y0 + float(bounds["height"])

    transformed_points = [
        _transform_point_to_cad({"x": x0, "y": y0}, transform),
        _transform_point_to_cad({"x": x1, "y": y0}, transform),
        _transform_point_to_cad({"x": x1, "y": y1}, transform),
        _transform_point_to_cad({"x": x0, "y": y1}, transform),
    ]
    xs = [point["x"] for point in transformed_points]
    ys = [point["y"] for point in transformed_points]
    left = min(xs)
    right = max(xs)
    bottom = min(ys)
    top = max(ys)
    return {
        "x": left,
        "y": bottom,
        "width": max(0.0001, right - left),
        "height": max(0.0001, top - bottom),
    }


def _normalize_compare_markups(markups_raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(markups_raw, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for index, entry in enumerate(markups_raw, start=1):
        if not isinstance(entry, dict):
            continue
        normalized_entry: Dict[str, Any] = {
            "id": str(entry.get("id") or f"markup-{index}"),
            "type": _normalize_text(entry.get("type")) or "unknown",
            "color": _normalize_text(entry.get("color")) or "unknown",
            "text": str(entry.get("text") or "").strip(),
            "meta": entry.get("meta") if isinstance(entry.get("meta"), dict) else {},
        }
        bounds = _normalize_bounds(entry.get("bounds"))
        if bounds:
            normalized_entry["bounds"] = bounds
        if isinstance(entry.get("layer"), str):
            layer_name = str(entry.get("layer") or "").strip()
            if layer_name:
                normalized_entry["layer"] = layer_name
        if isinstance(entry.get("recognition"), dict):
            normalized_entry["recognition"] = dict(entry.get("recognition") or {})
        normalized.append(normalized_entry)
    return normalized


def _bounds_center_payload(bounds: Dict[str, float]) -> Dict[str, float]:
    return {
        "x": float(bounds["x"]) + (float(bounds["width"]) / 2.0),
        "y": float(bounds["y"]) + (float(bounds["height"]) / 2.0),
    }


def _render_sample_to_color_name(rgb: Tuple[float, float, float]) -> str:
    r, g, b = rgb
    brightness = (r + g + b) / 3.0
    spread = max(r, g, b) - min(r, g, b)
    if brightness < 0.38 and spread < 0.18:
        return "black"
    if brightness > 0.97 and spread < 0.04:
        return "white"
    if r > 0.62 and g > 0.62 and b < 0.55:
        return "yellow"
    if r > g + 0.12 and r > b + 0.12:
        return "red"
    if g > r + 0.1 and g > b + 0.1:
        return "green"
    if b > r + 0.1 and b > g + 0.1:
        return "blue"
    return "unknown"


def _sample_rendered_line_color(
    image: Any,
    pixel_bounds: Optional[Dict[str, int]],
) -> Tuple[str, Optional[Tuple[float, float, float]], Optional[str], str]:
    if image is None or not pixel_bounds:
        return "unknown", None, None, "unknown"
    try:
        image_width, image_height = image.size
    except Exception:
        return "unknown", None, None, "unknown"

    left = max(0, int(pixel_bounds.get("left") or 0))
    top = max(0, int(pixel_bounds.get("top") or 0))
    width = max(1, int(pixel_bounds.get("width") or 0))
    height = max(1, int(pixel_bounds.get("height") or 0))
    right = min(image_width, left + width)
    bottom = min(image_height, top + height)
    if right <= left or bottom <= top:
        return "unknown", None, None, "unknown"

    crop = image.crop((left, top, right, bottom)).convert("RGB")
    if crop.width > 64 or crop.height > 32:
        crop.thumbnail((64, 32))

    counts = {
        "black": 0,
        "red": 0,
        "green": 0,
        "blue": 0,
        "yellow": 0,
    }
    ink_pixels: List[Tuple[float, float, float]] = []
    for raw_red, raw_green, raw_blue in crop.getdata():
        if min(raw_red, raw_green, raw_blue) >= 245:
            continue
        rgb = (raw_red / 255.0, raw_green / 255.0, raw_blue / 255.0)
        if max(rgb) > 0.98 and (max(rgb) - min(rgb)) < 0.04:
            continue
        ink_pixels.append(rgb)
        category = _render_sample_to_color_name(rgb)
        if category in counts:
            counts[category] += 1

    if not ink_pixels:
        return "unknown", None, None, "unknown"

    average_rgb = (
        sum(entry[0] for entry in ink_pixels) / len(ink_pixels),
        sum(entry[1] for entry in ink_pixels) / len(ink_pixels),
        sum(entry[2] for entry in ink_pixels) / len(ink_pixels),
    )
    dominant_color = max(counts.items(), key=lambda entry: entry[1])[0]
    if counts[dominant_color] <= 0:
        dominant_color = _render_sample_to_color_name(average_rgb)
    return dominant_color, average_rgb, _rgb_to_hex(average_rgb), "render_sample"


def _score_prepare_text_fallback_line(
    *,
    text: str,
    bounds: Dict[str, float],
    color_name: str,
    source: str,
    bluebeam_detected: bool,
    page_width: float,
    page_height: float,
) -> Tuple[float, float, List[str]]:
    score = 0.0
    reasons: List[str] = []
    alpha_count = sum(1 for char in text if char.isalpha())
    digit_count = sum(1 for char in text if char.isdigit())
    semantic_category, semantic_reason = _infer_semantic_category(
        {"type": "text", "color": color_name, "text": text}
    )

    if len(text) >= 3:
        score += 0.08
    if alpha_count >= 2:
        score += 0.08
    if bluebeam_detected:
        score += 0.12
        reasons.append("bluebeam_metadata")
    if source == "embedded_text":
        score += 0.06
        reasons.append("embedded_text_layer")
    elif source == "ocr":
        score += 0.04
        reasons.append("ocr_text_layer")

    if color_name in {"red", "green", "blue", "yellow"}:
        score += 0.46
        reasons.append(f"fallback_color:{color_name}")
    elif color_name == "black":
        score += 0.08
        reasons.append("fallback_color:black")
    else:
        score -= 0.14
        reasons.append("fallback_color:unknown")

    if semantic_category:
        score += 0.24
        reasons.append(f"semantic:{semantic_reason}")
    if _SEE_DWG_REFERENCE_PATTERN.search(text):
        score += 0.08
        reasons.append("see_dwg_reference")

    line_height = float(bounds.get("height") or 0.0)
    line_width = float(bounds.get("width") or 0.0)
    if 4.0 <= line_height <= max(18.0, page_height * 0.12):
        score += 0.04
    if line_width <= max(1.0, page_width * 0.8):
        score += 0.02

    lower_band = float(bounds.get("y") or 0.0) <= page_height * 0.22
    if lower_band and _TITLE_BLOCK_TEXT_PATTERN.search(text):
        score -= 0.42
        reasons.append("title_block_metadata_pattern")
    if _DIMENSION_ONLY_PATTERN.fullmatch(text):
        score -= 0.32
        reasons.append("dimension_like")
    if digit_count > max(2, alpha_count * 3) and alpha_count == 0:
        score -= 0.18
        reasons.append("numeric_heavy")

    threshold = 0.48
    if color_name == "black":
        threshold = 0.66
    elif color_name not in {"red", "green", "blue", "yellow"}:
        threshold = 0.74

    return round(score, 4), threshold, reasons


def _build_prepare_text_fallback_markups_from_lines(
    *,
    lines: List[Dict[str, Any]],
    source: str,
    page_index: int,
    page_width: float,
    page_height: float,
    bluebeam_detected: bool,
    image: Any,
    image_width: int,
    image_height: int,
) -> Dict[str, Any]:
    markups: List[Dict[str, Any]] = []
    skipped_without_bounds = 0
    selected_black_text_count = 0
    candidate_count = 0

    for index, line in enumerate(lines, start=1):
        text_value = str(line.get("text") or "").strip()
        bounds = _normalize_bounds(line.get("bounds"))
        if not text_value:
            continue
        if not bounds:
            skipped_without_bounds += 1
            continue

        pixel_bounds = (
            line.get("pixel_bounds") if isinstance(line.get("pixel_bounds"), dict) else None
        )
        if pixel_bounds is None and image is not None:
            pixel_bounds = pdf_bounds_to_pixel_bounds(
                bounds,
                page_width=page_width,
                page_height=page_height,
                image_width=image_width,
                image_height=image_height,
                padding=3,
            )

        color_name, rgb, color_hex, color_source = _sample_rendered_line_color(
            image,
            pixel_bounds,
        )
        score, threshold, score_reasons = _score_prepare_text_fallback_line(
            text=text_value,
            bounds=bounds,
            color_name=color_name,
            source=source,
            bluebeam_detected=bluebeam_detected,
            page_width=page_width,
            page_height=page_height,
        )
        if score < threshold:
            continue

        candidate_count += 1
        markup_payload: Dict[str, Any] = {
            "id": f"{source}-text-{index}",
            "type": "text",
            "color": color_name,
            "text": text_value,
            "bounds": bounds,
            "meta": {
                "subtype": "ocr_text_line" if source == "ocr" else "embedded_text_line",
                "intent": None,
                "subject": None,
                "color_source": color_source,
                "color_hex": color_hex,
                "color_rgb": None,
                "page_index": page_index,
                "page_bounds": dict(bounds),
                "page_position": _bounds_center_payload(bounds),
                "extraction_source": source,
                "candidate_score": score,
                "ocr_text": text_value if source == "ocr" else None,
            },
        }
        if rgb:
            rgb_payload = {"r": rgb[0], "g": rgb[1], "b": rgb[2]}
            markup_payload["meta"]["rgb"] = rgb_payload
            markup_payload["meta"]["color_rgb"] = rgb_payload

        recognition = _build_markup_recognition(
            markup_payload,
            feature_source="pdf_text_fallback",
        )
        recognition["confidence"] = round(
            min(float(recognition.get("confidence") or 0.0), score),
            4,
        )
        recognition["reason_codes"] = list(
            dict.fromkeys(
                list(recognition.get("reason_codes") or [])
                + ["prepare_text_fallback", f"text_source:{source}"]
                + score_reasons
            )
        )
        if source == "ocr" or color_name in {"black", "unknown"}:
            recognition["needs_review"] = True
            recognition["accepted"] = False
        markup_payload["recognition"] = recognition
        if color_name == "black":
            selected_black_text_count += 1
        markups.append(markup_payload)

    markups.sort(
        key=lambda entry: float(
            ((entry.get("meta") if isinstance(entry.get("meta"), dict) else {}).get("candidate_score") or 0.0)
        ),
        reverse=True,
    )

    return {
        "markups": markups[:_PREPARE_TEXT_FALLBACK_MAX_MARKUPS],
        "candidate_count": candidate_count,
        "skipped_without_bounds": skipped_without_bounds,
        "selected_black_text_count": selected_black_text_count,
        "truncated": max(0, len(markups) - _PREPARE_TEXT_FALLBACK_MAX_MARKUPS),
    }


def _extract_prepare_text_fallback_markups(
    *,
    pdf_stream: Any,
    page_index: int,
    page_width: float,
    page_height: float,
    pdf_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {
        "used": False,
        "source": "none",
        "feature_source": "pdf_annotations",
        "render_available": pdf_render_available(),
        "ocr_available": pdf_ocr_available(),
        "embedded_line_count": 0,
        "ocr_line_count": 0,
        "candidate_count": 0,
        "selected_line_count": 0,
        "skipped_without_bounds": 0,
        "selected_black_text_count": 0,
    }
    warnings: List[str] = []
    bluebeam_detected = bool(pdf_metadata.get("bluebeam_detected"))

    try:
        if hasattr(pdf_stream, "seek"):
            pdf_stream.seek(0)
    except Exception:
        pass

    with tempfile.TemporaryDirectory(prefix="autodraft_prepare_") as temp_dir:
        pdf_path = os.path.join(temp_dir, "prepare.pdf")
        try:
            raw_bytes = pdf_stream.read() if hasattr(pdf_stream, "read") else pdf_stream
            if isinstance(raw_bytes, str):
                raw_bytes = raw_bytes.encode("utf-8")
            if not isinstance(raw_bytes, (bytes, bytearray)):
                return {"markups": [], "warnings": warnings, "diagnostics": diagnostics}
            with open(pdf_path, "wb") as handle:
                handle.write(raw_bytes)
        except Exception:
            warnings.append("Text fallback extraction could not stage the uploaded PDF for OCR/text recovery.")
            return {"markups": [], "warnings": warnings, "diagnostics": diagnostics}

        embedded_payload = extract_embedded_text_page_lines(
            pdf_path,
            page_index=page_index,
        )
        embedded_lines = (
            embedded_payload.get("lines") if isinstance(embedded_payload.get("lines"), list) else []
        )
        diagnostics["embedded_line_count"] = len(embedded_lines)

        render_payload = render_pdf_page_to_png(
            pdf_path,
            page_index=page_index,
            output_dir=temp_dir,
            prefix="prepare-page",
        )
        image = None
        image_width = int(render_payload.get("image_width") or 0)
        image_height = int(render_payload.get("image_height") or 0)
        image_path = str(render_payload.get("path") or "").strip()
        if image_path and _PIL_AVAILABLE and Image is not None and os.path.isfile(image_path):
            image = Image.open(image_path)

        try:
            embedded_result = _build_prepare_text_fallback_markups_from_lines(
                lines=list(embedded_lines),
                source="embedded_text",
                page_index=page_index,
                page_width=page_width,
                page_height=page_height,
                bluebeam_detected=bluebeam_detected,
                image=image,
                image_width=image_width,
                image_height=image_height,
            )
            if embedded_result["markups"]:
                diagnostics.update(
                    {
                        "used": True,
                        "source": "embedded_text",
                        "feature_source": "pdf_text_fallback",
                        "candidate_count": int(embedded_result.get("candidate_count") or 0),
                        "selected_line_count": len(embedded_result["markups"]),
                        "skipped_without_bounds": int(
                            embedded_result.get("skipped_without_bounds") or 0
                        ),
                        "selected_black_text_count": int(
                            embedded_result.get("selected_black_text_count") or 0
                        ),
                    }
                )
                warnings.append(
                    "No supported annotations were detected. Embedded text fallback recovered text-only markup candidates; clouds/arrows still require native annotations or review."
                )
                if int(embedded_result.get("truncated") or 0) > 0:
                    warnings.append(
                        f"Embedded text fallback was truncated to {_PREPARE_TEXT_FALLBACK_MAX_MARKUPS} candidates."
                    )
                return {
                    "markups": embedded_result["markups"],
                    "warnings": warnings,
                    "diagnostics": diagnostics,
                }

            ocr_payload = (
                extract_ocr_page_lines_from_image(
                    image_path,
                    page_width=page_width,
                    page_height=page_height,
                )
                if image_path
                else {"lines": [], "source": "ocr_unavailable"}
            )
            ocr_lines = (
                ocr_payload.get("lines") if isinstance(ocr_payload.get("lines"), list) else []
            )
            diagnostics["ocr_line_count"] = len(ocr_lines)
            ocr_result = _build_prepare_text_fallback_markups_from_lines(
                lines=list(ocr_lines),
                source="ocr",
                page_index=page_index,
                page_width=page_width,
                page_height=page_height,
                bluebeam_detected=bluebeam_detected,
                image=image,
                image_width=image_width,
                image_height=image_height,
            )
            if ocr_result["markups"]:
                diagnostics.update(
                    {
                        "used": True,
                        "source": "ocr",
                        "feature_source": "pdf_text_fallback",
                        "candidate_count": int(ocr_result.get("candidate_count") or 0),
                        "selected_line_count": len(ocr_result["markups"]),
                        "skipped_without_bounds": int(ocr_result.get("skipped_without_bounds") or 0),
                        "selected_black_text_count": int(
                            ocr_result.get("selected_black_text_count") or 0
                        ),
                    }
                )
                warnings.append(
                    "No supported annotations were detected. OCR fallback recovered text-only markup candidates from flattened PDF content; review before trusting geometry actions."
                )
                if int(ocr_result.get("truncated") or 0) > 0:
                    warnings.append(
                        f"OCR fallback was truncated to {_PREPARE_TEXT_FALLBACK_MAX_MARKUPS} candidates."
                    )
                return {
                    "markups": ocr_result["markups"],
                    "warnings": warnings,
                    "diagnostics": diagnostics,
                }
        finally:
            if image is not None:
                image.close()

    if diagnostics["embedded_line_count"] > 0:
        warnings.append(
            "No supported annotations were detected, and text fallback could not isolate likely markup text lines with usable bounds."
        )
    elif not diagnostics["ocr_available"]:
        warnings.append(
            "No supported annotations were detected, and OCR fallback is unavailable on this backend runtime."
        )
    else:
        warnings.append(
            "No supported annotations or OCR-derived text candidates were detected on this page."
        )
    return {"markups": [], "warnings": warnings, "diagnostics": diagnostics}


def _markup_learning_features(markup: Dict[str, Any]) -> Dict[str, Any]:
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    bounds = _normalize_bounds(markup.get("bounds"))
    page_position = (
        meta.get("page_position") if isinstance(meta.get("page_position"), dict) else {}
    )
    line_endings = [
        _normalize_text(entry).lstrip("/")
        for entry in (meta.get("line_endings") or [])
        if isinstance(entry, str) and _normalize_text(entry).lstrip("/")
    ]
    line_points = _normalize_point_list(meta.get("line_points"))
    vertices = _normalize_point_list(meta.get("vertices"))
    ink_strokes_raw = meta.get("ink_strokes") if isinstance(meta.get("ink_strokes"), list) else []
    ink_stroke_count = 0
    for stroke in ink_strokes_raw:
        if isinstance(stroke, list):
            ink_stroke_count += len(_normalize_point_list(stroke))
    return {
        "type": _normalize_text(markup.get("type")) or "unknown",
        "color": _normalize_text(markup.get("color")) or "unknown",
        "subtype": _normalize_text(meta.get("subtype")) or "unknown",
        "intent": _normalize_text(meta.get("intent")) or "unknown",
        "subject": _normalize_text(meta.get("subject")) or "unknown",
        "text_source": _normalize_text(meta.get("text_source")) or "unknown",
        "page_zone": _normalize_text(meta.get("page_zone")) or "unknown",
        "aspect": _normalize_text(meta.get("aspect")) or "unknown",
        "bounds_source": _normalize_text(meta.get("bounds_source")) or "unknown",
        "fill_color": _normalize_text(meta.get("fill_color")) or "unknown",
        "line_ending": line_endings[0] if line_endings else "unknown",
        "has_callout": bool(_normalize_point_list(meta.get("callout_points"))),
        "has_line_points": bool(line_points),
        "has_fill_color": _normalize_text(meta.get("fill_color")) not in {"", "unknown"},
        "vertex_count_bucket": min(12, len(vertices) + ink_stroke_count),
        "paired_anchor_count": len(
            [
                entry
                for entry in (meta.get("paired_annotation_ids") or [])
                if isinstance(entry, str) and entry.strip()
            ]
        ),
        "pairing_method": _normalize_text(meta.get("pairing_method")) or "none",
        "page_index": int(_safe_float(meta.get("page_index")) or 0),
        "width_bucket": int(round((bounds.get("width") or 0.0) / 24.0)) if bounds else 0,
        "height_bucket": int(round((bounds.get("height") or 0.0) / 24.0)) if bounds else 0,
        "page_x_bucket": int(round((_safe_float(page_position.get("x")) or 0.0) / 48.0)),
        "page_y_bucket": int(round((_safe_float(page_position.get("y")) or 0.0) / 48.0)),
    }


def _heuristic_markup_recognition_confidence(markup: Dict[str, Any]) -> float:
    score = 0.42
    color_value = _normalize_text(markup.get("color"))
    markup_type = _normalize_text(markup.get("type"))
    text_value = str(markup.get("text") or "").strip()
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    features = _markup_learning_features(markup)
    if color_value and color_value != "unknown":
        score += 0.18
    if markup_type and markup_type != "unknown":
        score += 0.12
    if text_value:
        score += 0.08
    if _normalize_text(meta.get("subtype")) not in {"", "unknown"}:
        score += 0.06
    if _normalize_point_list(meta.get("callout_points")):
        score += 0.04
    if bool(features.get("has_fill_color")):
        score += 0.04
    if bool(features.get("has_line_points")):
        score += 0.03
    if int(features.get("vertex_count_bucket") or 0) > 0:
        score += 0.03
    if str(features.get("page_zone") or "unknown") != "unknown":
        score += 0.02
    if str(features.get("text_source") or "unknown") not in {"", "unknown", "none"}:
        score += 0.02
    return round(_clamp_value(score, minimum=0.0, maximum=0.98), 4)


def _build_markup_recognition(
    markup: Dict[str, Any],
    *,
    feature_source: str,
) -> Dict[str, Any]:
    features = _markup_learning_features(markup)
    reason_codes: List[str] = [
        f"color:{features.get('color') or 'unknown'}",
        f"type:{features.get('type') or 'unknown'}",
        f"subtype:{features.get('subtype') or 'unknown'}",
        f"text_source:{features.get('text_source') or 'unknown'}",
        f"page_zone:{features.get('page_zone') or 'unknown'}",
        f"aspect:{features.get('aspect') or 'unknown'}",
        f"bounds_source:{features.get('bounds_source') or 'unknown'}",
    ]
    if bool(features.get("has_callout")):
        reason_codes.append("callout_points_detected")
    if bool(features.get("has_fill_color")):
        reason_codes.append(f"fill_color:{features.get('fill_color') or 'unknown'}")
    if bool(features.get("has_line_points")):
        reason_codes.append("line_points_detected")
    if int(features.get("vertex_count_bucket") or 0) > 0:
        reason_codes.append("geometry_vertices_detected")
    if str(features.get("line_ending") or "unknown") != "unknown":
        reason_codes.append(f"line_ending:{features.get('line_ending')}")
    if int(features.get("paired_anchor_count") or 0) > 0:
        reason_codes.append("paired_anchor_ids_detected")
    if str(features.get("pairing_method") or "none") != "none":
        reason_codes.append(f"pairing_method:{features.get('pairing_method')}")

    prediction = _LOCAL_LEARNING_RUNTIME.predict_text_domain(
        domain="autodraft_markup",
        text=_collect_markup_semantic_text(markup) or str(markup.get("text") or ""),
        features=features,
    )
    if prediction is not None:
        confidence = round(
            _clamp_value(prediction.confidence, minimum=0.0, maximum=1.0),
            4,
        )
        reason_codes.extend(prediction.reason_codes)
        reason_codes.append(f"predicted_label:{prediction.label}")
        source = prediction.source
        model_version = prediction.model_version
    else:
        confidence = _heuristic_markup_recognition_confidence(markup)
        source = "deterministic"
        model_version = "deterministic-v1"
        reason_codes.append("deterministic_markup_features")

    needs_review = confidence < 0.62 or _normalize_text(markup.get("color")) == "unknown"
    return {
        "label": prediction.label if prediction is not None else "",
        "model_version": model_version,
        "confidence": confidence,
        "source": source,
        "feature_source": feature_source,
        "reason_codes": list(dict.fromkeys(reason_codes)),
        "needs_review": needs_review,
        "accepted": not needs_review,
        "override_reason": None,
    }


def _compare_recognition_summary(
    markups: List[Dict[str, Any]],
    *,
    feature_source: str,
    agent_hints_applied: bool,
) -> Dict[str, Any]:
    recognitions = [
        markup.get("recognition")
        for markup in markups
        if isinstance(markup, dict) and isinstance(markup.get("recognition"), dict)
    ]
    confidence_values = [
        _safe_float(recognition.get("confidence"))
        for recognition in recognitions
        if isinstance(recognition, dict)
    ]
    recognition_sources = sorted(
        {
            str(recognition.get("source") or "").strip()
            for recognition in recognitions
            if isinstance(recognition, dict) and str(recognition.get("source") or "").strip()
        }
    )
    model_versions = sorted(
        {
            str(recognition.get("model_version") or "").strip()
            for recognition in recognitions
            if isinstance(recognition, dict) and str(recognition.get("model_version") or "").strip()
        }
    )
    summary_reason_codes = ["markup_compare_ready"]
    if agent_hints_applied:
        summary_reason_codes.append("agent_hints_applied")
    if "local_model" in recognition_sources:
        summary_reason_codes.append("local_models_available")
    return {
        "model_version": model_versions[0] if len(model_versions) == 1 else ",".join(model_versions) or "deterministic-v1",
        "confidence": round(
            sum(value for value in confidence_values if value is not None)
            / max(1, len([value for value in confidence_values if value is not None])),
            4,
        ),
        "source": (
            "local_model"
            if "local_model" in recognition_sources
            else recognition_sources[0]
            if recognition_sources
            else "deterministic"
        ),
        "feature_source": feature_source,
        "reason_codes": summary_reason_codes,
        "needs_review": any(
            bool(recognition.get("needs_review"))
            for recognition in recognitions
            if isinstance(recognition, dict)
        ),
        "accepted": not any(
            bool(recognition.get("needs_review"))
            for recognition in recognitions
            if isinstance(recognition, dict)
        ),
        "override_reason": None,
        "agent_hints_applied": bool(agent_hints_applied),
    }


def _normalize_tolerance_profile(value: Any) -> str:
    profile = _normalize_text(value)
    if profile not in _COMPARE_TOLERANCE_PROFILES:
        return _COMPARE_TOLERANCE_PROFILE_MEDIUM
    return profile


def _normalize_calibration_mode(value: Any) -> str:
    mode = _normalize_text(value)
    if mode in _COMPARE_CALIBRATION_MODES:
        return mode
    return _COMPARE_CALIBRATION_MODE_AUTO


def _normalize_agent_review_mode(value: Any) -> str:
    mode = _normalize_text(value)
    if mode in _COMPARE_AGENT_REVIEW_MODES:
        return mode
    return _COMPARE_AGENT_REVIEW_MODE_PRE


def _normalize_boolean(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    raw_text = str(value or "").strip().lower()
    if not raw_text:
        return default
    return raw_text in {"1", "true", "yes", "on"}


def _copy_bounds(bounds: Dict[str, float]) -> Dict[str, float]:
    return {
        "x": float(bounds["x"]),
        "y": float(bounds["y"]),
        "width": float(bounds["width"]),
        "height": float(bounds["height"]),
    }


def _collect_markup_calibration_anchors(
    markups: List[Dict[str, Any]],
    *,
    roi: Optional[Dict[str, float]] = None,
) -> Tuple[List[Dict[str, float]], List[Dict[str, float]]]:
    anchors: List[Dict[str, float]] = []
    markup_bounds: List[Dict[str, float]] = []
    for markup in markups:
        if not isinstance(markup, dict):
            continue
        bounds = _normalize_bounds(markup.get("bounds"))
        if not bounds:
            continue
        if roi and not _bounds_overlap(bounds, roi):
            continue
        markup_bounds.append(bounds)
        callout_target = _extract_callout_target_point(markup)
        if callout_target:
            anchors.append(callout_target)
        anchors.append(_resolve_bounds_center(bounds))
    return anchors, markup_bounds


def _collect_cad_calibration_anchors(
    cad_context: Dict[str, Any],
    *,
    roi: Optional[Dict[str, float]] = None,
) -> Tuple[List[Dict[str, float]], List[Dict[str, float]]]:
    text_anchors: List[Dict[str, float]] = []
    geometry_anchors: List[Dict[str, float]] = []
    geometry_bounds: List[Dict[str, float]] = []
    for entity in _extract_entities(cad_context):
        bounds = _normalize_bounds(entity.get("bounds"))
        if not bounds:
            continue
        if roi and not _bounds_overlap(bounds, roi):
            continue
        geometry_bounds.append(bounds)
        center = _resolve_bounds_center(bounds)
        geometry_anchors.append(center)
        if str(entity.get("text") or "").strip():
            text_anchors.append(center)
    selected = text_anchors if text_anchors else geometry_anchors
    return selected, geometry_bounds


def _nearest_point(
    target: Dict[str, float], points: List[Dict[str, float]]
) -> Tuple[Optional[Dict[str, float]], float]:
    best_point: Optional[Dict[str, float]] = None
    best_distance = float("inf")
    for point in points:
        distance = _distance_between_points(target, point)
        if distance < best_distance:
            best_distance = distance
            best_point = point
    if best_point is None:
        return None, float("inf")
    return best_point, best_distance


def _farthest_point_pair(
    points: List[Dict[str, float]],
) -> Optional[Tuple[Dict[str, float], Dict[str, float]]]:
    if len(points) < 2:
        return None
    best_pair: Optional[Tuple[Dict[str, float], Dict[str, float]]] = None
    best_distance = -1.0
    for idx, point_a in enumerate(points):
        for point_b in points[idx + 1 :]:
            distance = _distance_between_points(point_a, point_b)
            if distance > best_distance:
                best_distance = distance
                best_pair = (point_a, point_b)
    return best_pair


def _build_auto_calibration_payload(
    *,
    status: str,
    confidence: float,
    method: str,
    quality_notes: List[str],
    available: bool = True,
    used: bool = False,
    suggested_pdf_points: Optional[List[Dict[str, float]]] = None,
    suggested_cad_points: Optional[List[Dict[str, float]]] = None,
    matched_anchor_count: int = 0,
    anchor_count: int = 0,
    residual_error: Optional[float] = None,
    transform: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "available": bool(available),
        "used": bool(used),
        "status": str(status or "needs_manual"),
        "confidence": round(_clamp_value(float(confidence or 0.0), minimum=0.0, maximum=1.0), 4),
        "method": str(method or "none"),
        "quality_notes": [str(note).strip() for note in quality_notes if str(note).strip()],
        "matched_anchor_count": max(0, int(matched_anchor_count or 0)),
        "anchor_count": max(0, int(anchor_count or 0)),
        "suggested_pdf_points": suggested_pdf_points if isinstance(suggested_pdf_points, list) else [],
        "suggested_cad_points": suggested_cad_points if isinstance(suggested_cad_points, list) else [],
    }
    if residual_error is not None and math.isfinite(float(residual_error)):
        payload["residual_error"] = round(float(residual_error), 4)
    if isinstance(transform, dict):
        payload["transform"] = transform
    return payload


def _sanitize_auto_calibration_payload(value: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(value or {})
    payload.pop("transform", None)
    return payload


def _run_auto_calibration_pass(
    *,
    markups: List[Dict[str, Any]],
    cad_context: Dict[str, Any],
    seed_scale: Optional[float] = None,
    pdf_roi: Optional[Dict[str, float]] = None,
    cad_roi: Optional[Dict[str, float]] = None,
    quality_notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    notes = [str(note).strip() for note in (quality_notes or []) if str(note).strip()]

    pdf_anchor_points, pdf_bounds_list = _collect_markup_calibration_anchors(
        markups,
        roi=pdf_roi,
    )
    cad_anchor_points, cad_bounds_list = _collect_cad_calibration_anchors(
        cad_context,
        roi=cad_roi,
    )
    if len(pdf_anchor_points) < 2:
        return _build_auto_calibration_payload(
            available=False,
            used=False,
            status="needs_manual",
            confidence=0.0,
            method="insufficient-pdf-anchors",
            quality_notes=notes
            + [
                "Auto-calibration requires at least two PDF anchors from prepared markups.",
            ],
        )
    if len(cad_anchor_points) < 2:
        cad_notes = list(notes)
        cad_notes.append(
            "Auto-calibration requires at least two CAD anchor points from live context."
        )
        if cad_roi:
            cad_notes.append(
                "Selected ROI did not provide enough CAD anchors; widen ROI or retry full-sheet auto mode."
            )
        return _build_auto_calibration_payload(
            available=False,
            used=False,
            status="needs_manual",
            confidence=0.0,
            method="insufficient-cad-anchors",
            quality_notes=cad_notes,
        )

    pdf_bounds = _bounds_from_points(pdf_anchor_points)
    cad_bounds = _bounds_from_points(cad_anchor_points)
    if not pdf_bounds or not cad_bounds:
        return _build_auto_calibration_payload(
            available=False,
            used=False,
            status="failed",
            confidence=0.0,
            method="anchor-bounds-failed",
            quality_notes=notes + ["Failed to resolve calibration bounds from anchor sets."],
        )

    pdf_pair = _farthest_point_pair(pdf_anchor_points)
    if not pdf_pair:
        return _build_auto_calibration_payload(
            available=False,
            used=False,
            status="needs_manual",
            confidence=0.0,
            method="insufficient-pdf-pair",
            quality_notes=notes + ["Could not derive a stable PDF point pair for calibration."],
        )

    extents_scale_x = max(1e-6, float(cad_bounds["width"])) / max(1e-6, float(pdf_bounds["width"]))
    extents_scale_y = max(1e-6, float(cad_bounds["height"])) / max(1e-6, float(pdf_bounds["height"]))
    extents_scale = (extents_scale_x + extents_scale_y) / 2.0
    if seed_scale is not None and seed_scale > 0:
        scale = seed_scale
        _append_unique_note(notes, "Used PDF measurement seed as primary scale hint.")
    else:
        scale = extents_scale
        _append_unique_note(notes, "Derived scale from PDF/CAD extents.")

    pdf_center = _resolve_bounds_center(pdf_bounds)
    cad_center = _resolve_bounds_center(cad_bounds)
    coarse_transform = {
        "scale": scale,
        "rotation_rad": 0.0,
        "rotation_deg": 0.0,
        "translation": {
            "x": cad_center["x"] - (scale * pdf_center["x"]),
            "y": cad_center["y"] - (scale * pdf_center["y"]),
        },
    }

    offsets: List[Dict[str, float]] = []
    transformed_anchor_points: List[Dict[str, float]] = []
    nearest_distances: List[float] = []
    for pdf_anchor in pdf_anchor_points:
        transformed = _transform_point_to_cad(pdf_anchor, coarse_transform)
        transformed_anchor_points.append(transformed)
        nearest, distance = _nearest_point(transformed, cad_anchor_points)
        nearest_distances.append(distance)
        if nearest:
            offsets.append(
                {
                    "x": nearest["x"] - transformed["x"],
                    "y": nearest["y"] - transformed["y"],
                }
            )

    median_offset_x = 0.0
    median_offset_y = 0.0
    if offsets:
        xs = sorted(entry["x"] for entry in offsets)
        ys = sorted(entry["y"] for entry in offsets)
        median_offset_x = xs[len(xs) // 2]
        median_offset_y = ys[len(ys) // 2]
    fine_transform = {
        "scale": float(coarse_transform["scale"]),
        "rotation_rad": 0.0,
        "rotation_deg": 0.0,
        "translation": {
            "x": float(coarse_transform["translation"]["x"]) + median_offset_x,
            "y": float(coarse_transform["translation"]["y"]) + median_offset_y,
        },
    }
    _append_unique_note(notes, "Applied anchor-based translation refinement.")

    refined_distances: List[float] = []
    matched_anchor_count = 0
    cad_diag = max(1.0, _bounds_diagonal(cad_bounds))
    match_radius = max(8.0, cad_diag * 0.06)
    for pdf_anchor in pdf_anchor_points:
        transformed = _transform_point_to_cad(pdf_anchor, fine_transform)
        _nearest, distance = _nearest_point(transformed, cad_anchor_points)
        refined_distances.append(distance)
        if distance <= match_radius:
            matched_anchor_count += 1
    residual_error = (
        sum(refined_distances) / len(refined_distances)
        if refined_distances
        else float("inf")
    )
    normalized_error = min(1.0, residual_error / max(match_radius, 1.0))
    match_ratio = matched_anchor_count / max(1, len(pdf_anchor_points))
    scale_consistency = 1.0 - min(
        1.0,
        abs(extents_scale_x - extents_scale_y) / max(abs(scale) if scale else 1.0, 1e-6),
    )
    confidence = _clamp_value(
        (0.45 * match_ratio) + (0.35 * (1.0 - normalized_error)) + (0.20 * scale_consistency),
        minimum=0.0,
        maximum=1.0,
    )

    status = "ready"
    if (
        confidence < _AUTO_CALIBRATION_READY_MIN_CONFIDENCE
        or match_ratio < _AUTO_CALIBRATION_READY_MIN_MATCH_RATIO
    ):
        status = "needs_manual"
        _append_unique_note(
            notes,
            "Auto-calibration confidence is below threshold; refine ROI or use manual two-point calibration.",
        )
    else:
        _append_unique_note(notes, "Auto-calibration confidence passed threshold.")

    suggested_pdf_pair = list(pdf_pair)
    suggested_cad_pair = [
        _transform_point_to_cad(suggested_pdf_pair[0], fine_transform),
        _transform_point_to_cad(suggested_pdf_pair[1], fine_transform),
    ]

    method_parts = []
    if seed_scale is not None and seed_scale > 0:
        method_parts.append("seed")
    method_parts.append("extents")
    method_parts.append("anchor-refine")
    if pdf_roi:
        method_parts.append("pdf-roi")
    if cad_roi:
        method_parts.append("cad-roi")
    method = "+".join(method_parts)

    return _build_auto_calibration_payload(
        available=True,
        used=status == "ready",
        status=status,
        confidence=confidence,
        method=method,
        quality_notes=notes,
        suggested_pdf_points=suggested_pdf_pair,
        suggested_cad_points=suggested_cad_pair,
        matched_anchor_count=matched_anchor_count,
        anchor_count=len(pdf_anchor_points),
        residual_error=residual_error if math.isfinite(residual_error) else None,
        transform=fine_transform,
    )


def _auto_calibrate_transform(
    *,
    markups: List[Dict[str, Any]],
    cad_context: Dict[str, Any],
    calibration_seed: Optional[Dict[str, Any]] = None,
    roi: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    seed_obj = calibration_seed if isinstance(calibration_seed, dict) else {}
    seed_scale = _safe_float(seed_obj.get("scale_hint"))
    if not roi:
        return _run_auto_calibration_pass(
            markups=markups,
            cad_context=cad_context,
            seed_scale=seed_scale,
        )

    prepass = _run_auto_calibration_pass(
        markups=markups,
        cad_context=cad_context,
        seed_scale=seed_scale,
        quality_notes=[
            "Full-sheet calibration prepass used to localize ROI in CAD space.",
        ],
    )
    prepass_transform = (
        prepass.get("transform") if isinstance(prepass.get("transform"), dict) else None
    )
    if not prepass_transform:
        prepass_notes = (
            prepass.get("quality_notes")
            if isinstance(prepass.get("quality_notes"), list)
            else []
        )
        _append_unique_note(
            prepass_notes,
            "ROI refinement could not localize CAD space because full-sheet auto-calibration did not produce a transform.",
        )
        prepass["quality_notes"] = prepass_notes
        return prepass

    cad_roi = _expand_bounds(
        _transform_bounds_to_cad(roi, prepass_transform),
        padding=max(6.0, _bounds_diagonal(roi) * 0.06),
    )
    roi_refined = _run_auto_calibration_pass(
        markups=markups,
        cad_context=cad_context,
        seed_scale=seed_scale,
        pdf_roi=roi,
        cad_roi=cad_roi,
        quality_notes=[
            "ROI refinement active for auto-calibration.",
            "Full-sheet calibration prepass used to localize ROI in CAD space.",
        ],
    )

    roi_status = _normalize_text(roi_refined.get("status"))
    prepass_status = _normalize_text(prepass.get("status"))
    if roi_status == "ready":
        return roi_refined
    if prepass_status == "ready":
        prepass_notes = (
            prepass.get("quality_notes")
            if isinstance(prepass.get("quality_notes"), list)
            else []
        )
        _append_unique_note(
            prepass_notes,
            "ROI refinement did not improve calibration confidence; using full-sheet auto-calibration.",
        )
        prepass["quality_notes"] = prepass_notes
        return prepass

    roi_confidence = _safe_float(roi_refined.get("confidence")) or 0.0
    prepass_confidence = _safe_float(prepass.get("confidence")) or 0.0
    if roi_confidence >= prepass_confidence:
        roi_notes = (
            roi_refined.get("quality_notes")
            if isinstance(roi_refined.get("quality_notes"), list)
            else []
        )
        _append_unique_note(
            roi_notes,
            "Full-sheet calibration prepass localized ROI in CAD space, but manual refinement is still required.",
        )
        roi_refined["quality_notes"] = roi_notes
        return roi_refined

    prepass_notes = (
        prepass.get("quality_notes")
        if isinstance(prepass.get("quality_notes"), list)
        else []
    )
    _append_unique_note(
        prepass_notes,
        "ROI refinement was attempted but full-sheet auto-calibration remained the more reliable candidate.",
    )
    prepass["quality_notes"] = prepass_notes
    return prepass


def _geometry_tolerance_for_profile(profile: str) -> float:
    if profile == _COMPARE_TOLERANCE_PROFILE_STRICT:
        return 0.0
    if profile == _COMPARE_TOLERANCE_PROFILE_LOOSE:
        return 8.0
    return 4.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _env_flag(name: str, *, default: bool = False) -> bool:
    raw_value = str(os.environ.get(name, "") or "").strip().lower()
    if not raw_value:
        return default
    return raw_value in {"1", "true", "yes", "on"}


_REVIEWED_RUN_SCHEMA = "autodraft_reviewed_run.v1"


def _resolve_compare_feedback_db_path() -> str:
    configured = str(os.environ.get("AUTODRAFT_COMPARE_FEEDBACK_DB_PATH", "") or "").strip()
    if not configured:
        configured = str(os.environ.get("AUTODRAFT_COMPARE_FEEDBACK_DB", "") or "").strip()
    if configured:
        candidate = Path(configured)
    else:
        candidate = (Path(__file__).resolve().parents[1] / "autodraft-compare-feedback.sqlite3")
    return str(candidate.resolve())


def _connect_compare_feedback_db(db_path: str) -> sqlite3.Connection:
    resolved_path = Path(db_path).resolve()
    resolved_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(resolved_path), timeout=8)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def _open_compare_feedback_db(db_path: str):
    connection = _connect_compare_feedback_db(db_path)
    try:
        yield connection
    finally:
        connection.close()


def _ensure_compare_feedback_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_utc TEXT NOT NULL,
            feedback_type TEXT NOT NULL DEFAULT 'replacement_review',
            request_id TEXT,
            action_id TEXT,
            review_status TEXT NOT NULL,
            new_text TEXT,
            selected_old_text TEXT,
            selected_entity_id TEXT,
            confidence REAL,
            note TEXT,
            candidates_json TEXT,
            selected_candidate_json TEXT,
            agent_suggestion_json TEXT,
            accepted_agent_suggestion INTEGER NOT NULL DEFAULT 0,
            payload_json TEXT
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS replacement_pairs (
            new_text_norm TEXT NOT NULL,
            old_text_norm TEXT NOT NULL,
            hit_count INTEGER NOT NULL DEFAULT 0,
            last_selected_utc TEXT NOT NULL,
            PRIMARY KEY (new_text_norm, old_text_norm)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS replacement_metrics (
            metric_key TEXT PRIMARY KEY,
            score REAL NOT NULL DEFAULT 0,
            updated_utc TEXT NOT NULL
        )
        """
    )
    existing_columns = {
        str(row[1] or "").strip().lower()
        for row in connection.execute("PRAGMA table_info(feedback_events)").fetchall()
    }
    if "agent_suggestion_json" not in existing_columns:
        connection.execute("ALTER TABLE feedback_events ADD COLUMN agent_suggestion_json TEXT")
    if "accepted_agent_suggestion" not in existing_columns:
        connection.execute(
            "ALTER TABLE feedback_events ADD COLUMN accepted_agent_suggestion INTEGER NOT NULL DEFAULT 0"
        )
    if "feedback_type" not in existing_columns:
        connection.execute(
            "ALTER TABLE feedback_events ADD COLUMN feedback_type TEXT NOT NULL DEFAULT 'replacement_review'"
        )
    if "payload_json" not in existing_columns:
        connection.execute("ALTER TABLE feedback_events ADD COLUMN payload_json TEXT")
    connection.commit()


def _normalize_learning_text(value: Any) -> str:
    text = str(value or "").strip().upper()
    text = re.sub(r"\s+", " ", text)
    return text


_MARKUP_LEARNING_LABEL_MAP: Dict[str, str] = {
    "add": "ADD",
    "insert": "ADD",
    "delete": "DELETE",
    "remove": "DELETE",
    "note": "NOTE",
    "title_block": "TITLE_BLOCK",
    "titleblock": "TITLE_BLOCK",
}


def _normalize_markup_learning_label(value: Any) -> str:
    token = _normalize_text(value).replace("-", "_").replace(" ", "_")
    return _MARKUP_LEARNING_LABEL_MAP.get(token, "")


def _build_markup_learning_markup(
    *,
    markup: Dict[str, Any],
    corrected_markup_class: str,
    corrected_color: str,
    paired_annotation_ids: List[str],
) -> Dict[str, Any]:
    normalized_markup = dict(markup)
    meta = dict(markup.get("meta") or {}) if isinstance(markup.get("meta"), dict) else {}
    if corrected_markup_class:
        normalized_markup["type"] = corrected_markup_class
        meta["corrected_markup_class"] = corrected_markup_class
    if corrected_color:
        normalized_markup["color"] = corrected_color
        meta["corrected_color"] = corrected_color
    if paired_annotation_ids:
        meta["paired_annotation_ids"] = list(dict.fromkeys(paired_annotation_ids))
    if meta:
        normalized_markup["meta"] = meta
    return normalized_markup


def _safe_json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return "[]"


def _safe_json_loads(raw: str) -> Any:
    try:
        return json.loads(str(raw or ""))
    except Exception:
        return None


def _clamp_value(value: float, *, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_replacement_tuning(value: Any) -> Dict[str, float]:
    defaults = dict(_REPLACEMENT_TUNING_DEFAULT)
    if not isinstance(value, dict):
        return defaults

    unresolved_threshold = _safe_float(value.get("unresolved_confidence_threshold"))
    ambiguity_margin = _safe_float(value.get("ambiguity_margin_threshold"))
    radius_multiplier = _safe_float(value.get("search_radius_multiplier"))
    min_search_radius = _safe_float(value.get("min_search_radius"))

    if unresolved_threshold is not None:
        defaults["unresolved_confidence_threshold"] = _clamp_value(
            unresolved_threshold,
            minimum=0.0,
            maximum=1.0,
        )
    if ambiguity_margin is not None:
        defaults["ambiguity_margin_threshold"] = _clamp_value(
            ambiguity_margin,
            minimum=0.0,
            maximum=1.0,
        )
    if radius_multiplier is not None:
        defaults["search_radius_multiplier"] = _clamp_value(
            radius_multiplier,
            minimum=0.5,
            maximum=8.0,
        )
    if min_search_radius is not None:
        defaults["min_search_radius"] = _clamp_value(
            min_search_radius,
            minimum=4.0,
            maximum=200.0,
        )
    return defaults


def _load_replacement_metric_scores(db_path: str) -> Dict[str, float]:
    with _COMPARE_FEEDBACK_DB_LOCK:
        with _open_compare_feedback_db(db_path) as connection:
            _ensure_compare_feedback_schema(connection)
            rows = connection.execute(
                "SELECT metric_key, score FROM replacement_metrics"
            ).fetchall()
    scores: Dict[str, float] = {}
    for row in rows:
        key = str(row["metric_key"] or "").strip()
        if not key:
            continue
        try:
            scores[key] = float(row["score"] or 0.0)
        except Exception:
            scores[key] = 0.0
    return scores


def _load_replacement_pair_hits(
    *,
    db_path: str,
    new_text_norm: str,
) -> Dict[str, int]:
    if not new_text_norm:
        return {}
    with _COMPARE_FEEDBACK_DB_LOCK:
        with _open_compare_feedback_db(db_path) as connection:
            _ensure_compare_feedback_schema(connection)
            rows = connection.execute(
                """
                SELECT old_text_norm, hit_count
                FROM replacement_pairs
                WHERE new_text_norm = ?
                """,
                (new_text_norm,),
            ).fetchall()
    result: Dict[str, int] = {}
    for row in rows:
        key = str(row["old_text_norm"] or "").strip()
        if not key:
            continue
        try:
            result[key] = max(0, int(row["hit_count"] or 0))
        except Exception:
            result[key] = 0
    return result


def _resolve_replacement_weights(metric_scores: Dict[str, float]) -> Dict[str, float]:
    pointer_score = float(metric_scores.get("pointer_hit", 0.0))
    overlap_score = float(metric_scores.get("overlap", 0.0))

    pointer_weight = _clamp_value(
        0.52 + (pointer_score * 0.01),
        minimum=0.32,
        maximum=0.66,
    )
    overlap_weight = _clamp_value(
        0.20 + (overlap_score * 0.008),
        minimum=0.10,
        maximum=0.34,
    )
    distance_weight = _clamp_value(
        1.0 - pointer_weight - overlap_weight,
        minimum=0.08,
        maximum=0.36,
    )
    normalization = pointer_weight + overlap_weight + distance_weight
    if normalization <= 1e-6:
        return {"pointer": 0.52, "overlap": 0.20, "distance": 0.28}
    return {
        "pointer": pointer_weight / normalization,
        "overlap": overlap_weight / normalization,
        "distance": distance_weight / normalization,
    }


def _extract_text_entities(cad_context: Dict[str, Any]) -> List[Dict[str, Any]]:
    entities = _extract_entities(cad_context)
    text_entities: List[Dict[str, Any]] = []
    for entry in entities:
        text_value = str(entry.get("text") or "").strip()
        if not text_value:
            continue
        bounds = _normalize_bounds(entry.get("bounds"))
        if not bounds:
            continue
        entity_id = str(
            entry.get("id") or entry.get("handle") or entry.get("uuid") or ""
        ).strip()
        if not entity_id:
            continue
        text_entities.append(
            {
                "id": entity_id,
                "text": text_value,
                "text_norm": _normalize_learning_text(text_value),
                "bounds": bounds,
                "entity_type": str(
                    entry.get("type") or entry.get("object_name") or ""
                ).strip(),
            }
        )
        layer_name = str(entry.get("layer") or "").strip()
        if layer_name:
            text_entities[-1]["layer"] = layer_name
    return text_entities


def _bounds_contains_point(bounds: Dict[str, float], point: Dict[str, float]) -> bool:
    x = float(point["x"])
    y = float(point["y"])
    left = float(bounds["x"])
    bottom = float(bounds["y"])
    right = left + float(bounds["width"])
    top = bottom + float(bounds["height"])
    return left <= x <= right and bottom <= y <= top


def _resolve_bounds_center(bounds: Dict[str, float]) -> Dict[str, float]:
    return {
        "x": float(bounds["x"]) + (float(bounds["width"]) / 2.0),
        "y": float(bounds["y"]) + (float(bounds["height"]) / 2.0),
    }


def _distance_between_points(point_a: Dict[str, float], point_b: Dict[str, float]) -> float:
    return math.hypot(
        float(point_a["x"]) - float(point_b["x"]),
        float(point_a["y"]) - float(point_b["y"]),
    )


def _resolve_replacement_target_point(
    *,
    markup: Dict[str, Any],
    bounds: Optional[Dict[str, float]],
) -> Tuple[Optional[Dict[str, float]], str]:
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    callout_points = (
        _normalize_point_list(meta.get("callout_points")) if isinstance(meta, dict) else []
    )
    if callout_points:
        return callout_points[-1], "callout-tail"

    if bounds:
        return _resolve_bounds_center(bounds), "bounds-center"
    return None, "unavailable"


def _resolve_strong_nearest_entity(
    entities: List[Dict[str, Any]],
    *,
    target_point: Optional[Dict[str, float]],
    max_distance: float,
) -> Optional[Dict[str, Any]]:
    if target_point is None or not entities:
        return None

    ranked: List[Tuple[float, Dict[str, Any]]] = []
    for entity in entities:
        bounds = entity.get("bounds") if isinstance(entity.get("bounds"), dict) else None
        if not bounds:
            continue
        distance = _distance_between_points(target_point, _resolve_bounds_center(bounds))
        if distance <= max_distance:
            ranked.append((distance, entity))

    ranked.sort(key=lambda item: (item[0], str(item[1].get("id") or "")))
    if len(ranked) == 1:
        return ranked[0][1]
    if len(ranked) < 2:
        return None

    first_distance, first_entity = ranked[0]
    second_distance, _second_entity = ranked[1]
    if (
        second_distance - first_distance >= 8.0
        or second_distance >= max(first_distance * 1.75, first_distance + 4.0)
    ) and first_distance <= max_distance:
        return first_entity
    return None


def _resolve_single_text_like_execute_candidate(
    *,
    markup: Dict[str, Any],
    cad_context: Dict[str, Any],
    entity_filter: Callable[[Dict[str, Any]], bool],
) -> Optional[Dict[str, Any]]:
    markup_bounds = _normalize_bounds(markup.get("bounds"))
    if not markup_bounds:
        return None

    entities = [
        entity
        for entity in _extract_text_entities(cad_context)
        if entity_filter(entity)
    ]
    if not entities:
        return None

    markup_layer = _normalize_text(markup.get("layer"))
    if markup_layer:
        same_layer_entities = [
            entity
            for entity in entities
            if _normalize_text(entity.get("layer")) == markup_layer
        ]
        if same_layer_entities:
            entities = same_layer_entities

    target_point, target_source = _resolve_replacement_target_point(
        markup=markup,
        bounds=markup_bounds,
    )
    if target_point is not None:
        pointer_hits = [
            entity
            for entity in entities
            if _bounds_contains_point(
                entity.get("bounds") if isinstance(entity.get("bounds"), dict) else {},
                target_point,
            )
        ]
        if len(pointer_hits) == 1:
            return pointer_hits[0]
        if len(pointer_hits) > 1:
            return None

    overlap_candidates = [
        entity
        for entity in entities
        if _bounds_overlap(
            _expand_bounds(markup_bounds, 2.0),
            _expand_bounds(entity.get("bounds") or {}, 1.0),
        )
    ]
    if len(overlap_candidates) == 1:
        return overlap_candidates[0]

    markup_diag = math.hypot(markup_bounds["width"], markup_bounds["height"])
    search_radius = max(24.0, markup_diag * 2.5)

    if target_source == "callout-tail":
        nearest_overlap = _resolve_strong_nearest_entity(
            overlap_candidates,
            target_point=target_point,
            max_distance=search_radius,
        )
        if nearest_overlap is not None:
            return nearest_overlap

        nearest_entity = _resolve_strong_nearest_entity(
            entities,
            target_point=target_point,
            max_distance=search_radius,
        )
        if nearest_entity is not None:
            return nearest_entity

    return None


def _is_replacement_markup_candidate(action: Dict[str, Any]) -> bool:
    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    if not isinstance(markup, dict):
        return False
    if _is_red_reference_add_markup(markup):
        return False
    color_name = _normalize_text(markup.get("color"))
    markup_type = _normalize_text(markup.get("type"))
    markup_text = str(markup.get("text") or "").strip()
    return color_name == "red" and markup_type == "text" and bool(markup_text)


def _resolve_replacement_model_adjustment(prediction: Any) -> float:
    if prediction is None:
        return 0.0
    confidence = _clamp_value(
        _safe_float(getattr(prediction, "confidence", None)) or 0.0,
        minimum=0.0,
        maximum=1.0,
    )
    if confidence < _REPLACEMENT_MODEL_MIN_CONFIDENCE:
        return 0.0
    normalized = (
        (confidence - _REPLACEMENT_MODEL_MIN_CONFIDENCE)
        / max(1e-6, 1.0 - _REPLACEMENT_MODEL_MIN_CONFIDENCE)
    )
    label = _normalize_text(getattr(prediction, "label", None))
    if label == "selected":
        return round(
            _REPLACEMENT_MODEL_MAX_BOOST * normalized,
            4,
        )
    if label == "not_selected":
        return round(
            -1.0 * _REPLACEMENT_MODEL_MAX_PENALTY * normalized,
            4,
        )
    return 0.0


def _build_replacement_selection_model_metadata(
    *,
    prediction: Any,
    adjustment: float,
) -> Optional[Dict[str, Any]]:
    if prediction is None:
        return None
    reason_codes = [
        value.strip()
        for value in (getattr(prediction, "reason_codes", None) or [])
        if isinstance(value, str) and value.strip()
    ]
    return {
        "label": str(getattr(prediction, "label", "") or "").strip() or "unknown",
        "confidence": round(
            _clamp_value(
                _safe_float(getattr(prediction, "confidence", None)) or 0.0,
                minimum=0.0,
                maximum=1.0,
            ),
            4,
        ),
        "model_version": str(getattr(prediction, "model_version", "") or "").strip()
        or "unknown",
        "feature_source": str(getattr(prediction, "feature_source", "") or "").strip()
        or "replacement_numeric_features",
        "source": str(getattr(prediction, "source", "") or "").strip() or "local_model",
        "reason_codes": reason_codes,
        "applied": abs(float(adjustment or 0.0)) > 1e-6,
        "adjustment": round(float(adjustment or 0.0), 4),
    }


def _infer_action_replacement(
    *,
    action: Dict[str, Any],
    text_entities: List[Dict[str, Any]],
    weights: Dict[str, float],
    db_path: str,
    tuning: Optional[Dict[str, float]] = None,
    agent_hint: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
    if not isinstance(markup, dict):
        return None
    new_text = str(markup.get("text") or "").strip()
    if not new_text:
        return None
    markup_bounds = _normalize_bounds(markup.get("bounds"))
    target_point, target_source = _resolve_replacement_target_point(
        markup=markup,
        bounds=markup_bounds,
    )

    if markup_bounds:
        markup_diag = math.hypot(markup_bounds["width"], markup_bounds["height"])
    else:
        markup_diag = 0.0
    effective_tuning = _normalize_replacement_tuning(tuning)
    search_radius = max(
        float(effective_tuning.get("min_search_radius") or 24.0),
        markup_diag * float(effective_tuning.get("search_radius_multiplier") or 2.5),
    )
    new_text_norm = _normalize_learning_text(new_text)
    pair_hits = _load_replacement_pair_hits(db_path=db_path, new_text_norm=new_text_norm)
    hint_obj = agent_hint if isinstance(agent_hint, dict) else {}
    hint_boosts = (
        hint_obj.get("candidate_boosts")
        if isinstance(hint_obj.get("candidate_boosts"), dict)
        else {}
    )
    hint_rationale = str(hint_obj.get("rationale") or "").strip()

    candidates: List[Dict[str, Any]] = []
    for entity in text_entities:
        entity_text = str(entity.get("text") or "").strip()
        entity_norm = _normalize_learning_text(entity_text)
        entity_bounds = entity.get("bounds") if isinstance(entity.get("bounds"), dict) else None
        if not entity_bounds:
            continue
        candidate_entity_id = str(entity.get("id") or "").strip()
        if not candidate_entity_id:
            continue
        entity_center = _resolve_bounds_center(entity_bounds)
        overlap = bool(markup_bounds and _bounds_overlap(markup_bounds, entity_bounds))
        pointer_hit = bool(target_point and _bounds_contains_point(entity_bounds, target_point))
        distance = (
            _distance_between_points(target_point, entity_center)
            if target_point is not None
            else _distance_between_points(_resolve_bounds_center(markup_bounds), entity_center)
            if markup_bounds is not None
            else 0.0
        )
        distance_score = _clamp_value(
            1.0 - (distance / search_radius),
            minimum=0.0,
            maximum=1.0,
        )
        overlap_score = 1.0 if overlap else 0.0
        pointer_score = 1.0 if pointer_hit else 0.0

        pair_hit_count = int(pair_hits.get(entity_norm, 0))
        pair_boost = min(0.25, pair_hit_count * 0.05)
        same_text_penalty = 0.45 if entity_norm and entity_norm == new_text_norm else 0.0
        distance_component = distance_score * float(weights.get("distance", 0.28))
        pointer_component = pointer_score * float(weights.get("pointer", 0.52))
        overlap_component = overlap_score * float(weights.get("overlap", 0.20))
        base_score = (
            pointer_component
            + overlap_component
            + distance_component
            + pair_boost
            - same_text_penalty
        )
        base_score = _clamp_value(base_score, minimum=0.0, maximum=1.0)
        raw_agent_boost = _safe_float(hint_boosts.get(candidate_entity_id))
        agent_boost = _clamp_value(
            raw_agent_boost or 0.0,
            minimum=0.0,
            maximum=_AGENT_PRE_REVIEW_MAX_BOOST,
        )
        score = _clamp_value(base_score + agent_boost, minimum=0.0, maximum=1.0)
        score_components = {
            "pointer": round(pointer_component, 4),
            "overlap": round(overlap_component, 4),
            "distance": round(distance_component, 4),
            "pair_boost": round(pair_boost, 4),
            "same_text_penalty": round(same_text_penalty, 4),
            "base_score": round(base_score, 4),
            "agent_boost": round(agent_boost, 4),
            "pre_model_score": round(score, 4),
            "final_score": round(score, 4),
        }
        candidate_obj = {
            "entity_id": candidate_entity_id,
            "text": entity_text,
            "score": round(score, 4),
            "distance": round(float(distance), 4),
            "pointer_hit": pointer_hit,
            "overlap": overlap,
            "pair_hit_count": pair_hit_count,
            "score_components": score_components,
        }
        if hint_rationale:
            candidate_obj["agent_rationale"] = hint_rationale
        candidates.append(candidate_obj)

    candidates.sort(
        key=lambda item: (
            -float(item.get("score") or 0.0),
            float(item.get("distance") or 0.0),
            str(item.get("entity_id") or ""),
        )
    )
    top_candidates = candidates[:_REPLACEMENT_MAX_CANDIDATES]
    if top_candidates:
        model_payload = {
            "markup": markup,
            "new_text": new_text,
            "candidates": top_candidates,
        }
        for candidate in top_candidates:
            score_components = (
                dict(candidate.get("score_components") or {})
                if isinstance(candidate.get("score_components"), dict)
                else {}
            )
            pre_model_score = (
                _safe_float(score_components.get("pre_model_score"))
                or _safe_float(candidate.get("score"))
                or 0.0
            )
            prediction = _LOCAL_LEARNING_RUNTIME.predict_replacement(
                features=_replacement_learning_features(
                    payload=model_payload,
                    candidate=candidate,
                )
            )
            model_adjustment = _resolve_replacement_model_adjustment(prediction)
            final_score = _clamp_value(
                pre_model_score + model_adjustment,
                minimum=0.0,
                maximum=1.0,
            )
            score_components["pre_model_score"] = round(pre_model_score, 4)
            score_components["model_adjustment"] = round(model_adjustment, 4)
            score_components["final_score"] = round(final_score, 4)
            candidate["score_components"] = score_components
            candidate["score"] = round(final_score, 4)
            selection_model = _build_replacement_selection_model_metadata(
                prediction=prediction,
                adjustment=model_adjustment,
            )
            if selection_model:
                candidate["selection_model"] = selection_model
        top_candidates.sort(
            key=lambda item: (
                -float(item.get("score") or 0.0),
                float(item.get("distance") or 0.0),
                str(item.get("entity_id") or ""),
            )
        )

    if not top_candidates:
        return {
            "new_text": new_text,
            "old_text": None,
            "target_entity_id": None,
            "confidence": 0.0,
            "status": _REPLACEMENT_STATUS_UNRESOLVED,
            "target_source": target_source,
            "candidates": [],
        }

    top = top_candidates[0]
    confidence = float(top.get("score") or 0.0)
    second_confidence = (
        float(top_candidates[1].get("score") or 0.0) if len(top_candidates) > 1 else 0.0
    )
    ambiguity_margin = confidence - second_confidence

    status = _REPLACEMENT_STATUS_RESOLVED
    unresolved_threshold = float(
        effective_tuning.get("unresolved_confidence_threshold") or 0.36
    )
    ambiguity_margin_threshold = float(
        effective_tuning.get("ambiguity_margin_threshold") or 0.08
    )
    if confidence < unresolved_threshold:
        status = _REPLACEMENT_STATUS_UNRESOLVED
    elif ambiguity_margin <= ambiguity_margin_threshold:
        status = _REPLACEMENT_STATUS_AMBIGUOUS

    old_text = str(top.get("text") or "").strip()
    target_entity_id = str(top.get("entity_id") or "").strip()
    if status == _REPLACEMENT_STATUS_UNRESOLVED:
        old_text = old_text or None
        target_entity_id = target_entity_id or None

    return {
        "new_text": new_text,
        "old_text": old_text or None,
        "target_entity_id": target_entity_id or None,
        "confidence": round(confidence, 4),
        "status": status,
        "target_source": target_source,
        "candidates": top_candidates,
    }


def _promote_finding_to_warn(finding: Dict[str, Any]) -> None:
    status = _normalize_text(finding.get("status"))
    if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
        finding["status"] = _BACKCHECK_WARN
        finding["severity"] = "medium"


def _append_unique_note(collection: List[str], value: str) -> None:
    normalized = str(value or "").strip()
    if not normalized:
        return
    if normalized in collection:
        return
    collection.append(normalized)


def _recompute_backcheck_summary(backcheck_obj: Dict[str, Any]) -> None:
    findings = backcheck_obj.get("findings")
    if not isinstance(findings, list):
        findings = []
    pass_count = 0
    warn_count = 0
    fail_count = 0
    for finding in findings:
        if not isinstance(finding, dict):
            continue
        status = _normalize_text(finding.get("status"))
        if status == _BACKCHECK_FAIL:
            fail_count += 1
        elif status == _BACKCHECK_WARN:
            warn_count += 1
        else:
            pass_count += 1
    backcheck_obj["summary"] = {
        "total_actions": pass_count + warn_count + fail_count,
        "pass_count": pass_count,
        "warn_count": warn_count,
        "fail_count": fail_count,
    }


def _recompute_compare_summary(compare_result: Dict[str, Any]) -> None:
    backcheck_obj = (
        compare_result.get("backcheck")
        if isinstance(compare_result.get("backcheck"), dict)
        else {}
    )
    summary_obj = (
        backcheck_obj.get("summary")
        if isinstance(backcheck_obj.get("summary"), dict)
        else {}
    )
    pass_count = int(summary_obj.get("pass_count") or 0)
    warn_count = int(summary_obj.get("warn_count") or 0)
    fail_count = int(summary_obj.get("fail_count") or 0)

    status = _BACKCHECK_PASS
    if fail_count > 0:
        status = _BACKCHECK_FAIL
    elif warn_count > 0:
        status = _BACKCHECK_WARN

    plan_obj = compare_result.get("plan") if isinstance(compare_result.get("plan"), dict) else {}
    plan_actions = plan_obj.get("actions") if isinstance(plan_obj.get("actions"), list) else []
    summary_existing = (
        compare_result.get("summary")
        if isinstance(compare_result.get("summary"), dict)
        else {}
    )
    total_markups = int(summary_existing.get("total_markups") or len(plan_actions))
    cad_context_available = bool(summary_existing.get("cad_context_available"))
    compare_result["summary"] = {
        "status": status,
        "total_markups": total_markups,
        "total_actions": len(plan_actions),
        "pass_count": pass_count,
        "warn_count": warn_count,
        "fail_count": fail_count,
        "cad_context_available": cad_context_available,
    }


def _filter_cad_context_by_bounds(
    cad_context: Dict[str, Any],
    *,
    bounds: Optional[Dict[str, float]],
) -> Tuple[Dict[str, Any], int]:
    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    if not bounds:
        return dict(cad_context_obj), int(
            len(cad_context_obj.get("entities"))
            if isinstance(cad_context_obj.get("entities"), list)
            else 0
        )
    entities = _extract_entities(cad_context_obj)
    filtered_entities: List[Dict[str, Any]] = []
    for entity in entities:
        entity_bounds = _normalize_bounds(entity.get("bounds"))
        if not entity_bounds:
            continue
        if _bounds_overlap(entity_bounds, bounds):
            filtered_entities.append(entity)
    next_context = dict(cad_context_obj)
    next_context["entities"] = filtered_entities
    next_context["roi_filter"] = {
        "x": float(bounds["x"]),
        "y": float(bounds["y"]),
        "width": float(bounds["width"]),
        "height": float(bounds["height"]),
    }
    return next_context, len(filtered_entities)


def _semantic_action_message_for_category(category: str) -> str:
    if category == "DELETE":
        return "Remove geometry associated with markup bounds."
    if category == "ADD":
        return "Add or verify geometry referenced by markup."
    if category == "NOTE":
        return "Review and acknowledge note intent before execution."
    return "Manual review required."


def _normalize_compare_result_semantics(compare_result: Dict[str, Any]) -> None:
    plan_obj = compare_result.get("plan")
    if not isinstance(plan_obj, dict):
        return
    actions = plan_obj.get("actions")
    if not isinstance(actions, list):
        return
    action_lookup: Dict[str, Dict[str, Any]] = {}
    for action in actions:
        if not isinstance(action, dict):
            continue
        action_id = str(action.get("id") or "").strip()
        if action_id:
            action_lookup[action_id] = action
        current_category = _normalize_text(action.get("category"))
        if current_category and current_category != "unclassified":
            continue
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        inferred_category, inferred_reason = _infer_semantic_category(markup)
        if not inferred_category:
            continue
        action["category"] = inferred_category
        action["rule_id"] = str(action.get("rule_id") or f"semantic-{inferred_reason}")
        action["action"] = _semantic_action_message_for_category(inferred_category)
        confidence = _safe_float(action.get("confidence")) or 0.0
        inferred_confidence = _semantic_confidence_for_inferred_reason(
            markup,
            inferred_reason,
        )
        if confidence < inferred_confidence:
            action["confidence"] = inferred_confidence
        if _normalize_text(action.get("status")) in {"", "review"}:
            action["status"] = _semantic_status_for_inferred_reason(
                markup,
                inferred_reason,
            )

    backcheck_obj = (
        compare_result.get("backcheck")
        if isinstance(compare_result.get("backcheck"), dict)
        else {}
    )
    findings = backcheck_obj.get("findings") if isinstance(backcheck_obj.get("findings"), list) else []
    for finding in findings:
        if not isinstance(finding, dict):
            continue
        action_id = str(finding.get("action_id") or "").strip()
        action = action_lookup.get(action_id)
        if not isinstance(action, dict):
            continue
        action_category = _normalize_text(action.get("category"))
        if not action_category or action_category == "unclassified":
            continue
        finding["category"] = action_category
        if _normalize_text(finding.get("status")) == _BACKCHECK_FAIL:
            _promote_finding_to_warn(finding)
            notes = finding.get("notes") if isinstance(finding.get("notes"), list) else []
            _append_unique_note(
                notes,
                "Category normalized by Flask compare wrapper for engine parity.",
            )
            finding["notes"] = notes

    _recompute_backcheck_summary(backcheck_obj)
    _recompute_plan_summary(plan_obj)
    compare_result["backcheck"] = backcheck_obj
    _recompute_compare_summary(compare_result)


def _markup_needs_compare_review(markup: Dict[str, Any]) -> bool:
    recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    feature_source = _normalize_text(
        recognition.get("input_feature_source") or recognition.get("feature_source")
    )
    extraction_source = _normalize_text(meta.get("extraction_source"))
    if bool(recognition.get("needs_review")):
        return True
    if "pdf_text_fallback" in feature_source:
        return True
    if extraction_source in {"ocr", "embedded_text"}:
        return True
    return False


def _build_markup_review_message(markup: Dict[str, Any]) -> str:
    recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    extraction_source = _normalize_text(meta.get("extraction_source"))
    feature_source = _normalize_text(
        recognition.get("input_feature_source") or recognition.get("feature_source")
    )
    if extraction_source == "ocr":
        return "OCR-derived fallback markup requires operator review before geometry execution."
    if extraction_source == "embedded_text":
        return "Embedded-text fallback markup requires operator review before geometry execution."
    if "pdf_text_fallback" in feature_source:
        return "Text-fallback markup requires operator review before geometry execution."
    return "Low-confidence markup recognition requires operator review before execution."


def _apply_markup_review_requirements(
    *,
    compare_result: Dict[str, Any],
    request_id: str,
    source_markups: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    plan_obj = compare_result.get("plan")
    if not isinstance(plan_obj, dict):
        compare_result["markup_review_queue"] = []
        return []

    actions = plan_obj.get("actions")
    if not isinstance(actions, list):
        compare_result["markup_review_queue"] = []
        return []

    markup_lookup: Dict[str, Dict[str, Any]] = {}
    for markup in source_markups:
        if not isinstance(markup, dict):
            continue
        markup_id = str(markup.get("id") or "").strip()
        if markup_id:
            markup_lookup[markup_id] = markup

    backcheck_obj = (
        compare_result.get("backcheck")
        if isinstance(compare_result.get("backcheck"), dict)
        else {}
    )
    findings = backcheck_obj.get("findings") if isinstance(backcheck_obj.get("findings"), list) else []
    findings_by_action_id: Dict[str, Dict[str, Any]] = {}
    for finding in findings:
        if not isinstance(finding, dict):
            continue
        action_id = str(finding.get("action_id") or "").strip()
        if action_id:
            findings_by_action_id[action_id] = finding

    review_items: List[Dict[str, Any]] = []
    flagged_count = 0
    for index, action in enumerate(actions, start=1):
        if not isinstance(action, dict):
            continue
        action_id = str(action.get("id") or f"action-{index}").strip()
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        markup_id = str(markup.get("id") or "").strip()
        source_markup = markup_lookup.get(markup_id)
        if isinstance(source_markup, dict):
            if not isinstance(markup.get("recognition"), dict) and isinstance(
                source_markup.get("recognition"),
                dict,
            ):
                markup["recognition"] = dict(source_markup.get("recognition") or {})
            if not isinstance(markup.get("meta"), dict) and isinstance(source_markup.get("meta"), dict):
                markup["meta"] = dict(source_markup.get("meta") or {})
            if not isinstance(markup.get("bounds"), dict) and isinstance(source_markup.get("bounds"), dict):
                markup["bounds"] = dict(source_markup.get("bounds") or {})
            if not str(markup.get("text") or "").strip():
                markup["text"] = str(source_markup.get("text") or "").strip()
            if not str(markup.get("color") or "").strip():
                markup["color"] = str(source_markup.get("color") or "").strip()
            if not str(markup.get("type") or "").strip():
                markup["type"] = str(source_markup.get("type") or "").strip()
            action["markup"] = markup

        if not _markup_needs_compare_review(markup):
            continue

        recognition = markup.get("recognition") if isinstance(markup.get("recognition"), dict) else {}
        reason_codes = [
            value.strip()
            for value in (recognition.get("reason_codes") or [])
            if isinstance(value, str) and value.strip()
        ]
        confidence = _safe_float(recognition.get("confidence"))
        flagged_count += 1
        action["status"] = "needs_review"
        action["review_type"] = "markup"
        if confidence is not None:
            action["confidence"] = min(float(action.get("confidence") or 1.0), confidence)
        if reason_codes:
            action["review_reason_codes"] = list(dict.fromkeys(reason_codes))

        finding = findings_by_action_id.get(action_id)
        if isinstance(finding, dict):
            finding["status"] = _BACKCHECK_FAIL
            finding["severity"] = "high"
            notes = finding.get("notes") if isinstance(finding.get("notes"), list) else []
            suggestions = (
                finding.get("suggestions") if isinstance(finding.get("suggestions"), list) else []
            )
            _append_unique_note(notes, _build_markup_review_message(markup))
            _append_unique_note(
                notes,
                "This action came from low-confidence markup recognition and is not execution-ready.",
            )
            _append_unique_note(
                suggestions,
                "Confirm markup text, color, and intent before execution.",
            )
            _append_unique_note(
                suggestions,
                "Capture compare feedback after review so the local model can learn this case.",
            )
            finding["notes"] = notes
            finding["suggestions"] = suggestions

        review_items.append(
            {
                "id": f"markup-review-{action_id or len(review_items) + 1}",
                "request_id": request_id,
                "action_id": action_id,
                "status": "needs_review",
                "confidence": round(confidence if confidence is not None else 0.0, 4),
                "message": _build_markup_review_message(markup),
                "markup_id": markup_id or None,
                "markup": markup,
                "recognition": recognition if recognition else None,
                "predicted_category": str(action.get("category") or "").strip() or None,
                "predicted_action": str(action.get("action") or "").strip() or None,
                "reason_codes": reason_codes,
            }
        )

    if flagged_count > 0:
        warnings = backcheck_obj.get("warnings") if isinstance(backcheck_obj.get("warnings"), list) else []
        _append_unique_note(
            warnings,
            f"Markup recognition flagged {flagged_count} action(s) for operator review.",
        )
        backcheck_obj["warnings"] = warnings

    _recompute_backcheck_summary(backcheck_obj)
    _recompute_plan_summary(plan_obj)
    compare_result["backcheck"] = backcheck_obj
    compare_result["markup_review_queue"] = review_items
    _recompute_compare_summary(compare_result)
    return review_items


def _extract_json_object_from_text(value: str) -> Optional[Dict[str, Any]]:
    text = str(value or "").strip()
    if not text:
        return None
    parsed = _safe_json_loads(text)
    if isinstance(parsed, dict):
        return parsed
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    subset = text[start : end + 1]
    parsed_subset = _safe_json_loads(subset)
    if isinstance(parsed_subset, dict):
        return parsed_subset
    return None


def _extract_shadow_text(payload: Dict[str, Any]) -> str:
    for key in ("response", "message", "text", "output"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    data_obj = payload.get("data")
    if isinstance(data_obj, dict):
        for key in ("response", "message", "text", "output"):
            value = data_obj.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _normalize_shadow_reviews(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    reviews: List[Dict[str, Any]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        action_id = str(entry.get("action_id") or "").strip()
        if not action_id:
            continue
        confidence = _safe_float(entry.get("confidence"))
        reviews.append(
            {
                "action_id": action_id,
                "suggested_old_text": str(entry.get("suggested_old_text") or "").strip() or None,
                "suggested_entity_id": str(entry.get("suggested_entity_id") or "").strip() or None,
                "confidence": round(confidence, 4) if confidence is not None else None,
                "rationale": str(entry.get("rationale") or "").strip() or None,
            }
        )
    return reviews


def _resolve_shadow_service_token_ttl_seconds() -> int:
    raw_value = str(
        os.environ.get("AUTODRAFT_COMPARE_SHADOW_SERVICE_TOKEN_TTL_SECONDS", "") or ""
    ).strip()
    try:
        parsed = int(raw_value)
    except Exception:
        parsed = 7 * 24 * 60 * 60
    return max(120, min(30 * 24 * 60 * 60, parsed))


def _resolve_shadow_service_token_cache_key() -> str:
    return (
        str(
            os.environ.get("AUTODRAFT_COMPARE_SHADOW_SERVICE_TOKEN_REDIS_KEY", "")
            or ""
        ).strip()
        or "suite:autodraft:shadow:token"
    )


def _resolve_shadow_token_redis_url() -> str:
    explicit = str(
        os.environ.get("AUTODRAFT_COMPARE_SHADOW_TOKEN_REDIS_URL", "") or ""
    ).strip()
    if explicit:
        return explicit
    fallback_keys = (
        "AGENT_SESSION_REDIS_URL",
        "REDIS_URL",
        "API_LIMITER_STORAGE_URI",
    )
    for key in fallback_keys:
        candidate = str(os.environ.get(key, "") or "").strip()
        if candidate.lower().startswith(("redis://", "rediss://")):
            return candidate
    return ""


def _load_shadow_service_token_from_redis(
    *,
    redis_url: str,
    key: str,
) -> Optional[Dict[str, Any]]:
    if redis is None or not redis_url:
        return None
    try:
        client = redis.Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        raw_value = client.get(key)
        if raw_value is None:
            return None
        parsed = _safe_json_loads(
            raw_value.decode("utf-8", errors="replace")
            if isinstance(raw_value, bytes)
            else str(raw_value)
        )
        if not isinstance(parsed, dict):
            return None
        token = str(parsed.get("token") or "").strip()
        expires_at = _safe_float(parsed.get("expires_at"))
        if not token or expires_at is None or expires_at <= (time.time() + 20):
            return None
        return {
            "token": token,
            "expires_at": float(expires_at),
            "source": "redis_cache",
        }
    except Exception:
        return None


def _save_shadow_service_token_to_redis(
    *,
    redis_url: str,
    key: str,
    token: str,
    expires_at: float,
) -> None:
    if redis is None or not redis_url:
        return
    ttl_seconds = max(1, int(expires_at - time.time()))
    if ttl_seconds <= 0:
        return
    try:
        client = redis.Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        client.set(
            key,
            json.dumps(
                {"token": token, "expires_at": float(expires_at)},
                ensure_ascii=True,
            ),
            ex=ttl_seconds,
        )
    except Exception:
        return


def _clear_shadow_service_token_from_redis(*, redis_url: str, key: str) -> None:
    if redis is None or not redis_url:
        return
    try:
        client = redis.Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        client.delete(key)
    except Exception:
        return


def _request_shadow_pairing_code(
    *,
    gateway_url: str,
    webhook_secret: str,
    timeout_seconds: int,
) -> Tuple[Optional[str], Optional[str]]:
    headers: Dict[str, str] = {}
    if webhook_secret:
        headers["X-Webhook-Secret"] = webhook_secret
    try:
        response = requests.post(
            f"{gateway_url}/pairing-code",
            headers=headers if headers else None,
            timeout=timeout_seconds,
        )
    except Exception as exc:
        return None, str(exc)
    if not response.ok:
        return None, _read_json_error(response)
    payload = _safe_json_loads(response.text)
    if not isinstance(payload, dict):
        return None, "Pairing code response was not valid JSON."
    pairing_code = str(payload.get("pairing_code") or "").strip()
    if not re.fullmatch(r"\d{6}", pairing_code):
        return None, "Pairing code response did not include a valid one-time code."
    return pairing_code, None


def _pair_shadow_service_token(
    *,
    gateway_url: str,
    pairing_code: str,
    timeout_seconds: int,
) -> Tuple[Optional[str], Optional[str]]:
    try:
        response = requests.post(
            f"{gateway_url}/pair",
            headers={"X-Pairing-Code": pairing_code},
            timeout=timeout_seconds,
        )
    except Exception as exc:
        return None, str(exc)
    if not response.ok:
        return None, _read_json_error(response)
    payload = _safe_json_loads(response.text)
    if not isinstance(payload, dict):
        return None, "Shadow pair response was not valid JSON."
    token = str(payload.get("token") or "").strip()
    if not token:
        return None, "Shadow pair response did not include bearer token."
    return token, None


def _clear_shadow_service_token_cache() -> None:
    redis_url = _resolve_shadow_token_redis_url()
    redis_key = _resolve_shadow_service_token_cache_key()
    with _SHADOW_ADVISOR_TOKEN_CACHE_LOCK:
        _SHADOW_ADVISOR_TOKEN_CACHE["token"] = None
        _SHADOW_ADVISOR_TOKEN_CACHE["expires_at"] = 0.0
        _SHADOW_ADVISOR_TOKEN_CACHE["source"] = "cleared"
    _clear_shadow_service_token_from_redis(redis_url=redis_url, key=redis_key)


def _get_shadow_service_token(
    *,
    gateway_url: str,
    webhook_secret: str,
    timeout_seconds: int,
) -> Tuple[Optional[str], str, Optional[str]]:
    now = time.time()
    with _SHADOW_ADVISOR_TOKEN_CACHE_LOCK:
        token = str(_SHADOW_ADVISOR_TOKEN_CACHE.get("token") or "").strip()
        expires_at = _safe_float(_SHADOW_ADVISOR_TOKEN_CACHE.get("expires_at")) or 0.0
        source = str(_SHADOW_ADVISOR_TOKEN_CACHE.get("source") or "memory")
        if token and expires_at > (now + 20):
            return token, source or "memory_cache", None

    redis_url = _resolve_shadow_token_redis_url()
    redis_key = _resolve_shadow_service_token_cache_key()
    cached = _load_shadow_service_token_from_redis(redis_url=redis_url, key=redis_key)
    if isinstance(cached, dict):
        cached_token = str(cached.get("token") or "").strip()
        cached_expires = _safe_float(cached.get("expires_at")) or 0.0
        if cached_token and cached_expires > (now + 20):
            with _SHADOW_ADVISOR_TOKEN_CACHE_LOCK:
                _SHADOW_ADVISOR_TOKEN_CACHE["token"] = cached_token
                _SHADOW_ADVISOR_TOKEN_CACHE["expires_at"] = cached_expires
                _SHADOW_ADVISOR_TOKEN_CACHE["source"] = "redis_cache"
            return cached_token, "redis_cache", None

    pairing_code, pairing_error = _request_shadow_pairing_code(
        gateway_url=gateway_url,
        webhook_secret=webhook_secret,
        timeout_seconds=timeout_seconds,
    )
    if not pairing_code:
        return None, "none", pairing_error or "Unable to request pairing code."

    token, pair_error = _pair_shadow_service_token(
        gateway_url=gateway_url,
        pairing_code=pairing_code,
        timeout_seconds=timeout_seconds,
    )
    if not token:
        return None, "none", pair_error or "Unable to pair shadow advisor token."

    ttl_seconds = _resolve_shadow_service_token_ttl_seconds()
    expires_at = now + float(ttl_seconds)
    with _SHADOW_ADVISOR_TOKEN_CACHE_LOCK:
        _SHADOW_ADVISOR_TOKEN_CACHE["token"] = token
        _SHADOW_ADVISOR_TOKEN_CACHE["expires_at"] = expires_at
        _SHADOW_ADVISOR_TOKEN_CACHE["source"] = "fresh_pair"

    _save_shadow_service_token_to_redis(
        redis_url=redis_url,
        key=redis_key,
        token=token,
        expires_at=expires_at,
    )
    return token, "fresh_pair", None


def _resolve_agent_pre_review_profile() -> str:
    configured = str(
        os.environ.get("AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_PROFILE", "") or ""
    ).strip()
    return configured or _AGENT_PRE_REVIEW_DEFAULT_PROFILE


def _resolve_agent_pre_review_timeout_seconds() -> int:
    raw_value = str(
        os.environ.get("AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_TIMEOUT_MS", "")
        or ""
    ).strip()
    fallback_ms = _AGENT_PRE_REVIEW_DEFAULT_TIMEOUT_MS
    try:
        parsed_ms = int(raw_value) if raw_value else fallback_ms
    except Exception:
        parsed_ms = fallback_ms
    return max(1, min(60, parsed_ms // 1000 or 1))


def _resolve_agent_pre_review_max_cases() -> int:
    raw_value = str(
        os.environ.get("AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_MAX_CASES", "")
        or ""
    ).strip()
    try:
        parsed = int(raw_value) if raw_value else _AGENT_PRE_REVIEW_DEFAULT_MAX_CASES
    except Exception:
        parsed = _AGENT_PRE_REVIEW_DEFAULT_MAX_CASES
    return max(1, min(100, parsed))


def _resolve_profile_primary_model(profile_id: str) -> str:
    normalized_profile = _normalize_text(profile_id)
    if not normalized_profile:
        return ""
    env_key = f"AGENT_MODEL_{normalized_profile.upper()}_PRIMARY"
    configured = str(os.environ.get(env_key, "") or "").strip()
    if configured:
        return configured
    defaults = {
        "koro": "qwen3:14b",
        "devstral": "devstral-small-2:latest",
        "sentinel": "gemma3:12b",
        "forge": "qwen2.5-coder:14b",
        "draftsmith": "joshuaokolo/C3Dv0:latest",
        "gridsage": "ALIENTELLIGENCE/electricalengineerv2:latest",
    }
    return defaults.get(normalized_profile, "")


def _extract_gateway_model_ids(payload: Any) -> Set[str]:
    ids: Set[str] = set()
    if isinstance(payload, dict):
        data_list = payload.get("data") if isinstance(payload.get("data"), list) else []
        model_list = (
            payload.get("models") if isinstance(payload.get("models"), list) else []
        )
        for entry in [*data_list, *model_list]:
            if not isinstance(entry, dict):
                continue
            for key in ("id", "model", "name"):
                value = str(entry.get(key) or "").strip()
                if value:
                    ids.add(value)
    elif isinstance(payload, list):
        for entry in payload:
            if isinstance(entry, str) and entry.strip():
                ids.add(entry.strip())
            elif isinstance(entry, dict):
                for key in ("id", "model", "name"):
                    value = str(entry.get(key) or "").strip()
                    if value:
                        ids.add(value)
    return ids


def _preflight_agent_pre_review_model(
    *,
    gateway_url: str,
    headers: Dict[str, str],
    profile_id: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    expected_model = _resolve_profile_primary_model(profile_id)
    preflight: Dict[str, Any] = {
        "checked": False,
        "available": False,
        "expected_model": expected_model or None,
        "reason": "not_checked",
    }
    if not expected_model:
        preflight["checked"] = True
        preflight["available"] = False
        preflight["reason"] = f"No configured primary model for profile `{profile_id}`."
        return preflight
    try:
        response = requests.get(
            f"{gateway_url}/v1/models",
            headers=headers if headers else None,
            timeout=max(1, min(timeout_seconds, 10)),
        )
    except Exception as exc:
        preflight["checked"] = True
        preflight["available"] = False
        preflight["reason"] = f"Model preflight failed: {exc}"
        return preflight

    preflight["checked"] = True
    if not response.ok:
        preflight["available"] = False
        preflight["reason"] = _read_json_error(response)
        return preflight
    payload = _safe_json_loads(response.text)
    model_ids = _extract_gateway_model_ids(payload)
    if expected_model in model_ids:
        preflight["available"] = True
        preflight["reason"] = "model_available"
    else:
        preflight["available"] = False
        preflight["reason"] = (
            f"Expected model `{expected_model}` was not listed by gateway `/v1/models`."
        )
    return preflight


def _normalize_agent_pre_review_hints(raw_value: Any) -> Dict[str, Dict[str, Any]]:
    if not isinstance(raw_value, list):
        return {}
    hints: Dict[str, Dict[str, Any]] = {}
    for raw_hint in raw_value:
        if not isinstance(raw_hint, dict):
            continue
        action_id = str(raw_hint.get("action_id") or "").strip()
        if not action_id:
            continue
        boosts: Dict[str, float] = {}
        raw_boosts = raw_hint.get("candidate_boosts")
        if isinstance(raw_boosts, dict):
            for entity_id_raw, boost_raw in raw_boosts.items():
                entity_id = str(entity_id_raw or "").strip()
                boost = _safe_float(boost_raw)
                if not entity_id or boost is None or boost <= 0:
                    continue
                boosts[entity_id] = _clamp_value(
                    boost,
                    minimum=0.0,
                    maximum=_AGENT_PRE_REVIEW_MAX_BOOST,
                )
        elif isinstance(raw_boosts, list):
            for entry in raw_boosts:
                if not isinstance(entry, dict):
                    continue
                entity_id = str(entry.get("entity_id") or "").strip()
                boost = _safe_float(entry.get("boost"))
                if not entity_id or boost is None or boost <= 0:
                    continue
                boosts[entity_id] = _clamp_value(
                    boost,
                    minimum=0.0,
                    maximum=_AGENT_PRE_REVIEW_MAX_BOOST,
                )
        if len(boosts) > _AGENT_PRE_REVIEW_MAX_CANDIDATE_BOOSTS_PER_ACTION:
            sorted_boosts = sorted(
                boosts.items(),
                key=lambda item: (-float(item[1]), str(item[0])),
            )
            boosts = dict(sorted_boosts[:_AGENT_PRE_REVIEW_MAX_CANDIDATE_BOOSTS_PER_ACTION])

        intent_hint = str(raw_hint.get("intent_hint") or "").strip().upper() or None
        if intent_hint and intent_hint not in {"ADD", "DELETE", "NOTE", "UNCLASSIFIED"}:
            intent_hint = None
        roi_hint = _normalize_bounds(raw_hint.get("roi_hint"))
        rationale = str(raw_hint.get("rationale") or "").strip()
        hints[action_id] = {
            "candidate_boosts": boosts,
            "intent_hint": intent_hint,
            "roi_hint": _copy_bounds(roi_hint) if roi_hint else None,
            "rationale": rationale or None,
        }
    return hints


def _run_agent_pre_review(
    *,
    request_id: str,
    review_cases: List[Dict[str, Any]],
    review_mode: str,
    logger: Any,
) -> Tuple[Dict[str, Any], Dict[str, Dict[str, Any]]]:
    profile_id = _resolve_agent_pre_review_profile()
    enabled_env = _env_flag("AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED", default=True)
    enabled = enabled_env and review_mode == _COMPARE_AGENT_REVIEW_MODE_PRE
    result: Dict[str, Any] = {
        "enabled": enabled,
        "attempted": False,
        "available": False,
        "used": False,
        "profile": profile_id,
        "latency_ms": None,
        "hints_count": 0,
        "error": None,
        "auth": {
            "mode": "service_token",
            "token_source": "none",
            "refresh_attempted": False,
        },
        "preflight": {
            "checked": False,
            "available": False,
            "expected_model": _resolve_profile_primary_model(profile_id) or None,
            "reason": "not_checked",
        },
    }
    if not enabled:
        result["error"] = (
            "Agent pre-review disabled by request."
            if review_mode == _COMPARE_AGENT_REVIEW_MODE_OFF
            else "Agent pre-review disabled by AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED."
        )
        return result, {}
    if not review_cases:
        result["available"] = True
        return result, {}

    gateway_url = str(os.environ.get("AGENT_GATEWAY_URL", "") or "").strip().rstrip("/")
    if not gateway_url:
        result["error"] = "AGENT_GATEWAY_URL is not configured."
        return result, {}

    timeout_seconds = _resolve_agent_pre_review_timeout_seconds()
    max_cases = _resolve_agent_pre_review_max_cases()
    result["attempted"] = True
    headers = {"Content-Type": "application/json"}
    webhook_secret = str(os.environ.get("AGENT_WEBHOOK_SECRET", "") or "").strip()
    if webhook_secret:
        headers["X-Webhook-Secret"] = webhook_secret

    token, token_source, token_error = _get_shadow_service_token(
        gateway_url=gateway_url,
        webhook_secret=webhook_secret,
        timeout_seconds=timeout_seconds,
    )
    result["auth"] = {
        "mode": "service_token",
        "token_source": token_source,
        "refresh_attempted": False,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif token_error:
        result["error"] = f"Agent pre-review token unavailable: {token_error}"
        return result, {}

    preflight = _preflight_agent_pre_review_model(
        gateway_url=gateway_url,
        headers=headers,
        profile_id=profile_id,
        timeout_seconds=timeout_seconds,
    )
    result["preflight"] = preflight
    if preflight.get("checked") and not bool(preflight.get("available")):
        result["error"] = str(preflight.get("reason") or "Agent model preflight failed.")
        return result, {}

    started_at = time.perf_counter()
    prompt_payload = {
        "task": "autodraft_compare_pre_review",
        "request_id": request_id,
        "instructions": (
            "Return strict JSON only. You are advisory only and must not override deterministic rules. "
            "Suggest bounded candidate boosts for likely replacement targets. "
            "Do not suggest replacing red SEE DWG reference notes."
        ),
        "cases": review_cases[:max_cases],
        "response_schema": {
            "hints": [
                {
                    "action_id": "string",
                    "candidate_boosts": [
                        {
                            "entity_id": "string",
                            "boost": "number 0..0.12",
                        }
                    ],
                    "intent_hint": "ADD|DELETE|NOTE|UNCLASSIFIED|null",
                    "roi_hint": {
                        "x": "number",
                        "y": "number",
                        "width": "number",
                        "height": "number",
                    },
                    "rationale": "string",
                }
            ]
        },
    }
    try:
        response = requests.post(
            f"{gateway_url}/webhook",
            headers=headers,
            json={
                "profile_id": profile_id,
                "message": json.dumps(prompt_payload, ensure_ascii=True),
            },
            timeout=timeout_seconds,
        )
    except Exception as exc:
        result["error"] = str(exc)
        result["latency_ms"] = round((time.perf_counter() - started_at) * 1000.0, 2)
        return result, {}
    result["latency_ms"] = round((time.perf_counter() - started_at) * 1000.0, 2)

    if response.status_code in {401, 403}:
        _clear_shadow_service_token_cache()
        refreshed_token, refreshed_source, refreshed_error = _get_shadow_service_token(
            gateway_url=gateway_url,
            webhook_secret=webhook_secret,
            timeout_seconds=timeout_seconds,
        )
        result["auth"] = {
            "mode": "service_token",
            "token_source": refreshed_source,
            "refresh_attempted": True,
        }
        if not refreshed_token:
            result["error"] = (
                "Agent pre-review auth refresh failed: "
                f"{refreshed_error or _read_json_error(response)}"
            )
            return result, {}
        retry_headers = dict(headers)
        retry_headers["Authorization"] = f"Bearer {refreshed_token}"
        try:
            response = requests.post(
                f"{gateway_url}/webhook",
                headers=retry_headers,
                json={
                    "profile_id": profile_id,
                    "message": json.dumps(prompt_payload, ensure_ascii=True),
                },
                timeout=timeout_seconds,
            )
        except Exception as exc:
            result["error"] = str(exc)
            return result, {}

    if not response.ok:
        result["error"] = _read_json_error(response)
        return result, {}

    payload = _safe_json_loads(response.text)
    if not isinstance(payload, dict):
        result["error"] = "Agent pre-review response was not JSON."
        return result, {}
    raw_hints: Any = payload.get("hints")
    if not isinstance(raw_hints, list):
        shadow_text = _extract_shadow_text(payload)
        extracted = _extract_json_object_from_text(shadow_text) if shadow_text else None
        if isinstance(extracted, dict):
            raw_hints = extracted.get("hints")
    hints_map = _normalize_agent_pre_review_hints(raw_hints)
    result["available"] = True
    result["used"] = bool(hints_map)
    result["hints_count"] = len(hints_map)
    if not hints_map:
        result["error"] = "Agent pre-review returned no structured hints."
        if logger is not None and hasattr(logger, "info"):
            logger.info(
                "AutoDraft compare pre-review returned empty hints request_id=%s",
                request_id,
            )
    return result, hints_map


def _run_shadow_advisor(
    *,
    request_id: str,
    review_cases: List[Dict[str, Any]],
    logger: Any,
) -> Dict[str, Any]:
    enabled = _env_flag("AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED", default=True)
    result: Dict[str, Any] = {
        "enabled": enabled,
        "available": False,
        "profile": _SHADOW_ADVISOR_PROFILE,
        "reviews": [],
        "error": None,
        "auth": {
            "mode": "service_token",
            "token_source": "none",
            "refresh_attempted": False,
        },
    }
    if not enabled:
        result["error"] = "Shadow advisor disabled by AUTODRAFT_COMPARE_SHADOW_ADVISOR_ENABLED."
        return result
    if not review_cases:
        result["available"] = True
        return result

    gateway_url = str(os.environ.get("AGENT_GATEWAY_URL", "") or "").strip().rstrip("/")
    if not gateway_url:
        result["error"] = "AGENT_GATEWAY_URL is not configured."
        return result

    timeout_ms_raw = str(os.environ.get("AUTODRAFT_COMPARE_SHADOW_TIMEOUT_MS", "8000") or "").strip()
    try:
        timeout_seconds = max(1, min(30, int(timeout_ms_raw) // 1000 or 8))
    except Exception:
        timeout_seconds = 8

    prompt_payload = {
        "task": "autodraft_compare_shadow_review",
        "request_id": request_id,
        "instructions": (
            "For each case, return one best suggestion in strict JSON. "
            "Do not include prose outside JSON."
        ),
        "cases": review_cases[:_SHADOW_ADVISOR_MAX_CASES],
        "response_schema": {
            "reviews": [
                {
                    "action_id": "string",
                    "suggested_old_text": "string|null",
                    "suggested_entity_id": "string|null",
                    "confidence": "number 0..1",
                    "rationale": "string",
                }
            ]
        },
    }
    headers = {"Content-Type": "application/json"}
    webhook_secret = str(os.environ.get("AGENT_WEBHOOK_SECRET", "") or "").strip()
    if webhook_secret:
        headers["X-Webhook-Secret"] = webhook_secret
    gateway_token, token_source, token_error = _get_shadow_service_token(
        gateway_url=gateway_url,
        webhook_secret=webhook_secret,
        timeout_seconds=timeout_seconds,
    )
    result["auth"] = {
        "mode": "service_token",
        "token_source": token_source,
        "refresh_attempted": False,
    }
    if gateway_token:
        headers["Authorization"] = f"Bearer {gateway_token}"
    elif token_error:
        result["error"] = f"Shadow advisor token unavailable: {token_error}"
        return result

    try:
        response = requests.post(
            f"{gateway_url}/webhook",
            headers=headers,
            json={
                "profile_id": _SHADOW_ADVISOR_PROFILE,
                "message": json.dumps(prompt_payload, ensure_ascii=True),
            },
            timeout=timeout_seconds,
        )
    except Exception as exc:
        result["error"] = str(exc)
        return result

    if response.status_code in {401, 403}:
        _clear_shadow_service_token_cache()
        refreshed_token, refreshed_source, refreshed_error = _get_shadow_service_token(
            gateway_url=gateway_url,
            webhook_secret=webhook_secret,
            timeout_seconds=timeout_seconds,
        )
        result["auth"] = {
            "mode": "service_token",
            "token_source": refreshed_source,
            "refresh_attempted": True,
        }
        if not refreshed_token:
            result["error"] = (
                f"Shadow advisor auth refresh failed: {refreshed_error or _read_json_error(response)}"
            )
            return result
        retry_headers = dict(headers)
        retry_headers["Authorization"] = f"Bearer {refreshed_token}"
        try:
            response = requests.post(
                f"{gateway_url}/webhook",
                headers=retry_headers,
                json={
                    "profile_id": _SHADOW_ADVISOR_PROFILE,
                    "message": json.dumps(prompt_payload, ensure_ascii=True),
                },
                timeout=timeout_seconds,
            )
        except Exception as exc:
            result["error"] = str(exc)
            return result

    if not response.ok:
        result["error"] = _read_json_error(response)
        return result

    payload = _safe_json_loads(response.text)
    if not isinstance(payload, dict):
        result["error"] = "Shadow advisor response was not JSON."
        return result

    reviews_raw: Any = payload.get("reviews")
    if not isinstance(reviews_raw, list):
        shadow_text = _extract_shadow_text(payload)
        extracted = _extract_json_object_from_text(shadow_text) if shadow_text else None
        if isinstance(extracted, dict):
            reviews_raw = extracted.get("reviews")

    reviews = _normalize_shadow_reviews(reviews_raw)
    result["available"] = True
    result["reviews"] = reviews
    if not reviews:
        result["error"] = "Shadow advisor returned no structured review suggestions."
    return result


def _build_replacement_review_message(replacement: Dict[str, Any]) -> str:
    new_text = str(replacement.get("new_text") or "").strip()
    old_text = str(replacement.get("old_text") or "").strip()
    status = _normalize_text(replacement.get("status"))
    if status == _REPLACEMENT_STATUS_RESOLVED and old_text:
        return f"Detected replacement candidate: '{old_text}' -> '{new_text}'."
    if status == _REPLACEMENT_STATUS_AMBIGUOUS:
        return (
            f"Replacement for '{new_text}' is ambiguous; multiple nearby CAD text candidates were found."
        )
    return f"Could not confidently determine the existing CAD text replaced by '{new_text}'."


def _build_agent_pre_review_cases(
    *,
    actions: List[Dict[str, Any]],
    baseline_replacements: Dict[str, Dict[str, Any]],
    max_cases: int,
) -> List[Dict[str, Any]]:
    cases: List[Dict[str, Any]] = []
    for action in actions:
        if not isinstance(action, dict):
            continue
        action_id = str(action.get("id") or "").strip()
        if not action_id:
            continue
        replacement = baseline_replacements.get(action_id)
        if not isinstance(replacement, dict):
            continue
        markup = action.get("markup") if isinstance(action.get("markup"), dict) else {}
        markup_bounds = _normalize_bounds(markup.get("bounds"))
        candidates = replacement.get("candidates") if isinstance(replacement.get("candidates"), list) else []
        cases.append(
            {
                "action_id": action_id,
                "new_text": str(replacement.get("new_text") or ""),
                "status": str(replacement.get("status") or ""),
                "confidence": float(_safe_float(replacement.get("confidence")) or 0.0),
                "markup": {
                    "id": str(markup.get("id") or "").strip() or None,
                    "type": str(markup.get("type") or "").strip() or "unknown",
                    "color": str(markup.get("color") or "").strip() or "unknown",
                    "text": str(markup.get("text") or "").strip(),
                    "bounds": _copy_bounds(markup_bounds) if markup_bounds else None,
                },
                "candidates": candidates[:_REPLACEMENT_MAX_CANDIDATES],
            }
        )
        if len(cases) >= max_cases:
            break
    return cases


def _enrich_compare_result_with_replacements(
    *,
    compare_result: Dict[str, Any],
    cad_context: Dict[str, Any],
    request_id: str,
    tuning: Optional[Dict[str, float]] = None,
    review_mode: str = _COMPARE_AGENT_REVIEW_MODE_PRE,
    logger: Any = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    plan_obj = compare_result.get("plan")
    if not isinstance(plan_obj, dict):
        return [], {
            "enabled": False,
            "attempted": False,
            "available": False,
            "used": False,
            "profile": _resolve_agent_pre_review_profile(),
            "latency_ms": None,
            "hints_count": 0,
            "error": "Plan payload unavailable for pre-review.",
            "auth": {
                "mode": "service_token",
                "token_source": "none",
                "refresh_attempted": False,
            },
            "preflight": {
                "checked": False,
                "available": False,
                "expected_model": _resolve_profile_primary_model(_resolve_agent_pre_review_profile()) or None,
                "reason": "not_checked",
            },
        }
    actions = plan_obj.get("actions")
    if not isinstance(actions, list):
        return [], {
            "enabled": False,
            "attempted": False,
            "available": False,
            "used": False,
            "profile": _resolve_agent_pre_review_profile(),
            "latency_ms": None,
            "hints_count": 0,
            "error": "Action payload unavailable for pre-review.",
            "auth": {
                "mode": "service_token",
                "token_source": "none",
                "refresh_attempted": False,
            },
            "preflight": {
                "checked": False,
                "available": False,
                "expected_model": _resolve_profile_primary_model(_resolve_agent_pre_review_profile()) or None,
                "reason": "not_checked",
            },
        }

    backcheck_obj = (
        compare_result.get("backcheck")
        if isinstance(compare_result.get("backcheck"), dict)
        else {}
    )
    findings = backcheck_obj.get("findings") if isinstance(backcheck_obj.get("findings"), list) else []
    finding_by_action_id: Dict[str, Dict[str, Any]] = {}
    for entry in findings:
        if not isinstance(entry, dict):
            continue
        action_id = str(entry.get("action_id") or "").strip()
        if action_id:
            finding_by_action_id[action_id] = entry

    db_path = _resolve_compare_feedback_db_path()
    metric_scores = _load_replacement_metric_scores(db_path)
    weights = _resolve_replacement_weights(metric_scores)
    text_entities = _extract_text_entities(cad_context)

    replacement_actions = [
        action
        for action in actions
        if isinstance(action, dict) and _is_replacement_markup_candidate(action)
    ]
    baseline_replacements: Dict[str, Dict[str, Any]] = {}
    for action in replacement_actions:
        action_id = str(action.get("id") or "").strip()
        if not action_id:
            continue
        baseline = _infer_action_replacement(
            action=action,
            text_entities=text_entities,
            weights=weights,
            db_path=db_path,
            tuning=tuning,
            agent_hint=None,
        )
        if isinstance(baseline, dict):
            baseline_replacements[action_id] = baseline

    pre_review_cases = _build_agent_pre_review_cases(
        actions=replacement_actions,
        baseline_replacements=baseline_replacements,
        max_cases=_resolve_agent_pre_review_max_cases(),
    )
    pre_review_result, hint_map = _run_agent_pre_review(
        request_id=request_id,
        review_cases=pre_review_cases,
        review_mode=review_mode,
        logger=logger,
    )

    review_queue: List[Dict[str, Any]] = []
    warned_count = 0
    for action in replacement_actions:
        action_id = str(action.get("id") or "").strip()
        if not action_id:
            continue
        action_hint = hint_map.get(action_id)
        replacement = _infer_action_replacement(
            action=action,
            text_entities=text_entities,
            weights=weights,
            db_path=db_path,
            tuning=tuning,
            agent_hint=action_hint,
        )
        if not replacement:
            continue
        action["replacement"] = replacement

        finding = finding_by_action_id.get(action_id)
        if isinstance(finding, dict):
            finding["replacement"] = replacement
            if _normalize_text(replacement.get("status")) in _REPLACEMENT_WARN_STATUSES:
                _promote_finding_to_warn(finding)
                notes = finding.get("notes") if isinstance(finding.get("notes"), list) else []
                suggestions = (
                    finding.get("suggestions")
                    if isinstance(finding.get("suggestions"), list)
                    else []
                )
                _append_unique_note(
                    notes,
                    _build_replacement_review_message(replacement),
                )
                _append_unique_note(
                    suggestions,
                    "Review replacement target and confirm old->new text mapping before execution.",
                )
                finding["notes"] = notes
                finding["suggestions"] = suggestions
                warned_count += 1

        review_queue.append(
            {
                "id": f"review-{action_id or len(review_queue) + 1}",
                "request_id": request_id,
                "action_id": action_id,
                "status": replacement.get("status"),
                "confidence": replacement.get("confidence"),
                "new_text": replacement.get("new_text"),
                "selected_old_text": replacement.get("old_text"),
                "selected_entity_id": replacement.get("target_entity_id"),
                "message": _build_replacement_review_message(replacement),
                "candidates": replacement.get("candidates")
                if isinstance(replacement.get("candidates"), list)
                else [],
                "agent_hint": action_hint if isinstance(action_hint, dict) else None,
                "shadow": None,
            }
        )

    if warned_count > 0:
        warnings = backcheck_obj.get("warnings") if isinstance(backcheck_obj.get("warnings"), list) else []
        _append_unique_note(
            warnings,
            f"Replacement inference flagged {warned_count} action(s) for operator review.",
        )
        backcheck_obj["warnings"] = warnings

    _recompute_backcheck_summary(backcheck_obj)
    compare_result["backcheck"] = backcheck_obj
    _recompute_compare_summary(compare_result)
    compare_result["review_queue"] = review_queue
    return review_queue, pre_review_result


def _normalize_feedback_items(raw_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_items = raw_payload.get("items")
    if isinstance(raw_items, list):
        iterable = raw_items
    else:
        iterable = [raw_payload]

    items: List[Dict[str, Any]] = []
    for entry in iterable:
        if not isinstance(entry, dict):
            continue
        action_id = str(entry.get("action_id") or "").strip()
        review_status = _normalize_text(entry.get("review_status"))
        feedback_type = _normalize_text(entry.get("feedback_type")) or "replacement_review"
        has_markup_learning_fields = any(
            key in entry
            for key in (
                "markup_id",
                "markup",
                "predicted_category",
                "predicted_action",
                "corrected_markup_class",
                "corrected_intent",
                "corrected_color",
                "paired_annotation_ids",
                "ocr_text",
                "corrected_text",
                "recognition",
                "override_reason",
            )
        )
        is_replacement_review = bool(action_id) and review_status in _REPLACEMENT_REVIEW_ACTIONS
        if not is_replacement_review and not has_markup_learning_fields:
            continue
        candidates = entry.get("candidates") if isinstance(entry.get("candidates"), list) else []
        selected_candidate = (
            entry.get("selected_candidate")
            if isinstance(entry.get("selected_candidate"), dict)
            else {}
        )
        agent_suggestion = (
            entry.get("agent_suggestion")
            if isinstance(entry.get("agent_suggestion"), dict)
            else {}
        )
        accepted_agent_suggestion = _normalize_boolean(
            entry.get("accepted_agent_suggestion"),
            default=False,
        )
        item = {
            "feedback_type": feedback_type if has_markup_learning_fields else "replacement_review",
            "request_id": str(entry.get("request_id") or raw_payload.get("requestId") or "").strip(),
            "action_id": action_id,
            "review_status": review_status if review_status in _REPLACEMENT_REVIEW_ACTIONS else "unresolved",
            "new_text": str(entry.get("new_text") or "").strip(),
            "selected_old_text": str(entry.get("selected_old_text") or "").strip(),
            "selected_entity_id": str(entry.get("selected_entity_id") or "").strip(),
            "confidence": _safe_float(entry.get("confidence")),
            "note": str(entry.get("note") or "").strip(),
            "candidates": candidates,
            "selected_candidate": selected_candidate,
            "agent_suggestion": agent_suggestion,
            "accepted_agent_suggestion": accepted_agent_suggestion,
            "markup_id": str(entry.get("markup_id") or "").strip(),
            "payload": dict(entry),
        }
        items.append(item)
    return items


def _text_similarity_ratio(left: Any, right: Any) -> float:
    import difflib

    left_text = _normalize_learning_text(left)
    right_text = _normalize_learning_text(right)
    if not left_text or not right_text:
        return 0.0
    return round(
        _clamp_value(
            difflib.SequenceMatcher(None, left_text, right_text).ratio(),
            minimum=0.0,
            maximum=1.0,
        ),
        4,
    )


def _replacement_learning_features(
    *,
    payload: Dict[str, Any],
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    markup = payload.get("markup") if isinstance(payload.get("markup"), dict) else {}
    bounds = _normalize_bounds(markup.get("bounds"))
    score_components = (
        candidate.get("score_components")
        if isinstance(candidate.get("score_components"), dict)
        else {}
    )
    candidates = payload.get("candidates") if isinstance(payload.get("candidates"), list) else []
    pre_model_score = _safe_float(score_components.get("pre_model_score"))
    return {
        "distance": _safe_float(candidate.get("distance")) or 0.0,
        "pointer_hit": 1.0 if bool(candidate.get("pointer_hit")) else 0.0,
        "overlap": 1.0 if bool(candidate.get("overlap")) else 0.0,
        "pair_hit_count": _safe_float(candidate.get("pair_hit_count")) or 0.0,
        "text_similarity": _text_similarity_ratio(
            payload.get("new_text"),
            candidate.get("text"),
        ),
        "same_color": 1.0 if _normalize_text(markup.get("color")) != "unknown" else 0.0,
        "same_type": 1.0 if _normalize_text(markup.get("type")) == "text" else 0.0,
        "cad_entity_count": float(len(candidates)),
        "base_score": _safe_float(score_components.get("base_score")) or _safe_float(candidate.get("score")) or 0.0,
        "final_score": pre_model_score
        if pre_model_score is not None
        else _safe_float(score_components.get("final_score"))
        or _safe_float(candidate.get("score"))
        or 0.0,
        "markup_width": float(bounds.get("width")) if bounds else 0.0,
        "markup_height": float(bounds.get("height")) if bounds else 0.0,
    }


def _build_feedback_learning_examples(
    *,
    items: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    markup_examples: List[Dict[str, Any]] = []
    replacement_examples: List[Dict[str, Any]] = []
    for item in items:
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        markup = payload.get("markup") if isinstance(payload.get("markup"), dict) else {}
        review_status = _normalize_text(item.get("review_status"))
        corrected_intent = _normalize_text(payload.get("corrected_intent"))
        corrected_markup_class = _normalize_text(payload.get("corrected_markup_class"))
        corrected_color = _normalize_text(payload.get("corrected_color"))
        corrected_text = str(payload.get("corrected_text") or "").strip()
        ocr_text = str(payload.get("ocr_text") or "").strip()
        predicted_category = str(payload.get("predicted_category") or "").strip()
        action_category = str(payload.get("action_category") or payload.get("category") or "").strip()
        markup_label = ""
        if review_status in {"approved", "corrected"}:
            markup_label = _normalize_markup_learning_label(corrected_intent)
            if not markup_label:
                markup_label = _normalize_markup_learning_label(
                    predicted_category
                ) or _normalize_markup_learning_label(action_category)
        if markup_label:
            paired_annotation_ids = [
                value.strip()
                for value in (payload.get("paired_annotation_ids") or [])
                if isinstance(value, str) and value.strip()
            ]
            learning_markup = _build_markup_learning_markup(
                markup=markup,
                corrected_markup_class=corrected_markup_class,
                corrected_color=corrected_color,
                paired_annotation_ids=paired_annotation_ids,
            )
            features = _markup_learning_features(learning_markup)
            if corrected_markup_class:
                features["corrected_markup_class"] = corrected_markup_class
            if corrected_color:
                features["corrected_color"] = corrected_color
            if review_status:
                features["review_status"] = review_status
            markup_examples.append(
                {
                    "label": markup_label,
                    "text": corrected_text or ocr_text or str(learning_markup.get("text") or ""),
                    "features": features,
                    "metadata": {
                        "feedback_type": item.get("feedback_type"),
                        "request_id": item.get("request_id"),
                        "action_id": item.get("action_id"),
                        "markup_id": item.get("markup_id") or payload.get("markup_id"),
                        "review_status": review_status or None,
                        "predicted_category": predicted_category or None,
                        "action_category": action_category or None,
                        "corrected_markup_class": corrected_markup_class or None,
                        "corrected_text": corrected_text or None,
                        "corrected_color": corrected_color or None,
                        "paired_annotation_ids": paired_annotation_ids,
                        "override_reason": payload.get("override_reason"),
                    },
                    "source": "compare_feedback",
                }
            )

        selected_entity_id = _normalize_text(item.get("selected_entity_id"))
        selected_old_text = _normalize_learning_text(item.get("selected_old_text"))
        candidates = item.get("candidates") if isinstance(item.get("candidates"), list) else []
        if review_status not in {"approved", "corrected"} or not candidates:
            continue
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            candidate_entity_id = _normalize_text(candidate.get("entity_id"))
            candidate_text_norm = _normalize_learning_text(candidate.get("text"))
            is_selected = bool(
                (selected_entity_id and candidate_entity_id == selected_entity_id)
                or (selected_old_text and candidate_text_norm == selected_old_text)
            )
            replacement_examples.append(
                {
                    "label": "selected" if is_selected else "not_selected",
                    "text": str(payload.get("new_text") or item.get("new_text") or ""),
                    "features": _replacement_learning_features(
                        payload={
                            **payload,
                            "new_text": payload.get("new_text") or item.get("new_text"),
                            "candidates": candidates,
                        },
                        candidate=candidate,
                    ),
                    "metadata": {
                        "request_id": item.get("request_id"),
                        "action_id": item.get("action_id"),
                        "entity_id": candidate.get("entity_id"),
                        "selected": is_selected,
                    },
                    "source": "compare_feedback",
                }
            )
    return {
        "autodraft_markup": markup_examples,
        "autodraft_replacement": replacement_examples,
    }


def _persist_feedback_items(
    *,
    db_path: str,
    items: List[Dict[str, Any]],
) -> int:
    if not items:
        return 0
    inserted = 0
    now_iso = _utc_now_iso()
    with _COMPARE_FEEDBACK_DB_LOCK:
        with _open_compare_feedback_db(db_path) as connection:
            _ensure_compare_feedback_schema(connection)
            for item in items:
                connection.execute(
                    """
                    INSERT INTO feedback_events (
                        created_utc,
                        feedback_type,
                        request_id,
                        action_id,
                        review_status,
                        new_text,
                        selected_old_text,
                        selected_entity_id,
                        confidence,
                        note,
                        candidates_json,
                        selected_candidate_json,
                        agent_suggestion_json,
                        accepted_agent_suggestion,
                        payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now_iso,
                        item.get("feedback_type") or "replacement_review",
                        item.get("request_id") or None,
                        item.get("action_id") or None,
                        item.get("review_status") or "unresolved",
                        item.get("new_text") or None,
                        item.get("selected_old_text") or None,
                        item.get("selected_entity_id") or None,
                        float(item.get("confidence") or 0.0),
                        item.get("note") or None,
                        _safe_json_dumps(item.get("candidates") or []),
                        _safe_json_dumps(item.get("selected_candidate") or {}),
                        _safe_json_dumps(item.get("agent_suggestion") or {}),
                        1 if bool(item.get("accepted_agent_suggestion")) else 0,
                        _safe_json_dumps(item.get("payload") or {}),
                    ),
                )
                inserted += 1

                review_status = str(item.get("review_status") or "").strip().lower()
                new_text_norm = _normalize_learning_text(item.get("new_text"))
                old_text_norm = _normalize_learning_text(item.get("selected_old_text"))
                if review_status in {"approved", "corrected"} and new_text_norm and old_text_norm:
                    connection.execute(
                        """
                        INSERT INTO replacement_pairs (
                            new_text_norm,
                            old_text_norm,
                            hit_count,
                            last_selected_utc
                        ) VALUES (?, ?, 1, ?)
                        ON CONFLICT(new_text_norm, old_text_norm)
                        DO UPDATE SET
                            hit_count = replacement_pairs.hit_count + 1,
                            last_selected_utc = excluded.last_selected_utc
                        """,
                        (new_text_norm, old_text_norm, now_iso),
                    )

                selected_candidate = (
                    item.get("selected_candidate")
                    if isinstance(item.get("selected_candidate"), dict)
                    else {}
                )
                if review_status in {"approved", "corrected"}:
                    pointer_hit = bool(selected_candidate.get("pointer_hit"))
                    overlap = bool(selected_candidate.get("overlap"))
                    metric_deltas = {
                        "pointer_hit": 1.0 if pointer_hit else -0.25,
                        "overlap": 1.0 if overlap else -0.25,
                    }
                    for metric_key, delta in metric_deltas.items():
                        connection.execute(
                            """
                            INSERT INTO replacement_metrics (metric_key, score, updated_utc)
                            VALUES (?, ?, ?)
                            ON CONFLICT(metric_key)
                            DO UPDATE SET
                                score = replacement_metrics.score + excluded.score,
                                updated_utc = excluded.updated_utc
                            """,
                            (metric_key, float(delta), now_iso),
                        )
            connection.commit()
    return inserted


def _export_feedback_data(
    *,
    db_path: str,
) -> Dict[str, Any]:
    with _COMPARE_FEEDBACK_DB_LOCK:
        with _open_compare_feedback_db(db_path) as connection:
            _ensure_compare_feedback_schema(connection)
            event_rows = connection.execute(
                """
                SELECT
                    id,
                    created_utc,
                    feedback_type,
                    request_id,
                    action_id,
                    review_status,
                    new_text,
                    selected_old_text,
                    selected_entity_id,
                    confidence,
                    note,
                    candidates_json,
                    selected_candidate_json,
                    agent_suggestion_json,
                    accepted_agent_suggestion,
                    payload_json
                FROM feedback_events
                ORDER BY id ASC
                """
            ).fetchall()
            pair_rows = connection.execute(
                """
                SELECT new_text_norm, old_text_norm, hit_count, last_selected_utc
                FROM replacement_pairs
                ORDER BY new_text_norm ASC, old_text_norm ASC
                """
            ).fetchall()
            metric_rows = connection.execute(
                """
                SELECT metric_key, score, updated_utc
                FROM replacement_metrics
                ORDER BY metric_key ASC
                """
            ).fetchall()

    events: List[Dict[str, Any]] = []
    for row in event_rows:
        events.append(
            {
                "id": int(row["id"]),
                "created_utc": str(row["created_utc"] or ""),
                "feedback_type": str(row["feedback_type"] or "replacement_review"),
                "request_id": str(row["request_id"] or ""),
                "action_id": str(row["action_id"] or ""),
                "review_status": str(row["review_status"] or ""),
                "new_text": str(row["new_text"] or ""),
                "selected_old_text": str(row["selected_old_text"] or ""),
                "selected_entity_id": str(row["selected_entity_id"] or ""),
                "confidence": float(row["confidence"] or 0.0),
                "note": str(row["note"] or ""),
                "candidates": _safe_json_loads(str(row["candidates_json"] or "[]")) or [],
                "selected_candidate": _safe_json_loads(
                    str(row["selected_candidate_json"] or "{}")
                )
                or {},
                "agent_suggestion": _safe_json_loads(
                    str(row["agent_suggestion_json"] or "{}")
                )
                or {},
                "accepted_agent_suggestion": bool(
                    int(_safe_float(row["accepted_agent_suggestion"]) or 0)
                ),
                "payload": _safe_json_loads(str(row["payload_json"] or "{}")) or {},
            }
        )
    pairs = [
        {
            "new_text_norm": str(row["new_text_norm"] or ""),
            "old_text_norm": str(row["old_text_norm"] or ""),
            "hit_count": int(row["hit_count"] or 0),
            "last_selected_utc": str(row["last_selected_utc"] or ""),
        }
        for row in pair_rows
    ]
    metrics = [
        {
            "metric_key": str(row["metric_key"] or ""),
            "score": float(row["score"] or 0.0),
            "updated_utc": str(row["updated_utc"] or ""),
        }
        for row in metric_rows
    ]
    return {
        "events": events,
        "pairs": pairs,
        "metrics": metrics,
    }


def _export_feedback_events_for_request(
    *,
    db_path: str,
    request_id: str,
) -> List[Dict[str, Any]]:
    normalized_request_id = str(request_id or "").strip()
    if not normalized_request_id:
        return []
    exported = _export_feedback_data(db_path=db_path)
    events = exported.get("events") if isinstance(exported.get("events"), list) else []
    return [
        dict(entry)
        for entry in events
        if isinstance(entry, dict)
        and str(entry.get("request_id") or "").strip() == normalized_request_id
    ]


def _feedback_items_from_exported_events(
    *,
    events: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    raw_items: List[Dict[str, Any]] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        payload = dict(event.get("payload") or {}) if isinstance(event.get("payload"), dict) else {}
        merged = dict(payload)
        for key in (
            "feedback_type",
            "request_id",
            "action_id",
            "review_status",
            "new_text",
            "selected_old_text",
            "selected_entity_id",
            "confidence",
            "note",
            "candidates",
            "selected_candidate",
            "agent_suggestion",
            "accepted_agent_suggestion",
            "created_utc",
        ):
            if key not in merged and key in event:
                merged[key] = event.get(key)
        raw_items.append(merged)
    return raw_items


def _build_reviewed_run_bundle(
    *,
    request_id: str,
    prepare_payload: Dict[str, Any],
    compare_payload: Dict[str, Any],
    feedback_items: List[Dict[str, Any]],
    normalized_feedback_items: List[Dict[str, Any]],
    feedback_events: List[Dict[str, Any]],
    label: str,
    notes: str,
) -> Dict[str, Any]:
    latest_event_utc = ""
    for event in feedback_events:
        if not isinstance(event, dict):
            continue
        created_utc = str(event.get("created_utc") or "").strip()
        if created_utc and created_utc > latest_event_utc:
            latest_event_utc = created_utc

    learning_examples = _build_feedback_learning_examples(items=normalized_feedback_items)
    feedback_count = len(normalized_feedback_items)
    prepare_markups = (
        prepare_payload.get("markups")
        if isinstance(prepare_payload.get("markups"), list)
        else []
    )
    compare_actions = (
        ((compare_payload.get("plan") or {}).get("actions") or [])
        if isinstance(compare_payload.get("plan"), dict)
        else []
    )
    markup_review_queue = (
        compare_payload.get("markup_review_queue")
        if isinstance(compare_payload.get("markup_review_queue"), list)
        else []
    )
    replacement_review_queue = (
        compare_payload.get("review_queue")
        if isinstance(compare_payload.get("review_queue"), list)
        else []
    )
    created_fragment = re.sub(r"[^0-9A-Za-z]+", "", latest_event_utc or _utc_now_iso())[-14:]
    bundle_id = f"{request_id}:{feedback_count}:{created_fragment or 'capture'}"
    learning_counts = {
        domain: len(examples)
        for domain, examples in learning_examples.items()
        if isinstance(examples, list)
    }
    return {
        "schema": _REVIEWED_RUN_SCHEMA,
        "bundle_id": bundle_id,
        "request_id": request_id,
        "captured_utc": _utc_now_iso(),
        "source": "autodraft-reviewed-run",
        "label": label or None,
        "notes": notes or None,
        "prepare": dict(prepare_payload),
        "compare": dict(compare_payload),
        "feedback": {
            "items": feedback_items,
            "event_count": feedback_count,
            "latest_event_utc": latest_event_utc or None,
        },
        "learning_examples": learning_examples,
        "summary": {
            "prepare_markup_count": len(prepare_markups),
            "compare_action_count": len(compare_actions),
            "markup_review_count": len(markup_review_queue),
            "replacement_review_count": len(replacement_review_queue),
            "feedback_item_count": feedback_count,
            "learning_example_counts": learning_counts,
        },
    }


def _import_feedback_data(
    *,
    db_path: str,
    payload: Dict[str, Any],
    mode: str,
) -> Dict[str, int]:
    raw_events = payload.get("events") if isinstance(payload.get("events"), list) else []
    raw_pairs = payload.get("pairs") if isinstance(payload.get("pairs"), list) else []
    raw_metrics = payload.get("metrics") if isinstance(payload.get("metrics"), list) else []
    imported_events = 0
    imported_pairs = 0
    imported_metrics = 0
    now_iso = _utc_now_iso()
    with _COMPARE_FEEDBACK_DB_LOCK:
        with _open_compare_feedback_db(db_path) as connection:
            _ensure_compare_feedback_schema(connection)
            if mode == "replace":
                connection.execute("DELETE FROM feedback_events")
                connection.execute("DELETE FROM replacement_pairs")
                connection.execute("DELETE FROM replacement_metrics")

            for entry in raw_events:
                if not isinstance(entry, dict):
                    continue
                review_status = _normalize_text(entry.get("review_status"))
                action_id = str(entry.get("action_id") or "").strip()
                feedback_type = _normalize_text(entry.get("feedback_type")) or "replacement_review"
                payload_json = entry.get("payload") if isinstance(entry.get("payload"), dict) else entry
                has_markup_learning_fields = any(
                    key in entry
                    for key in (
                        "markup_id",
                        "markup",
                        "corrected_markup_class",
                        "corrected_intent",
                        "corrected_color",
                        "paired_annotation_ids",
                        "ocr_text",
                        "corrected_text",
                        "recognition",
                        "override_reason",
                        "payload",
                    )
                )
                if (
                    (not action_id or review_status not in _REPLACEMENT_REVIEW_ACTIONS)
                    and not has_markup_learning_fields
                ):
                    continue
                connection.execute(
                    """
                    INSERT INTO feedback_events (
                        created_utc,
                        feedback_type,
                        request_id,
                        action_id,
                        review_status,
                        new_text,
                        selected_old_text,
                        selected_entity_id,
                        confidence,
                        note,
                        candidates_json,
                        selected_candidate_json,
                        agent_suggestion_json,
                        accepted_agent_suggestion,
                        payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(entry.get("created_utc") or now_iso),
                        feedback_type,
                        str(entry.get("request_id") or "").strip() or None,
                        action_id or None,
                        review_status if review_status in _REPLACEMENT_REVIEW_ACTIONS else "unresolved",
                        str(entry.get("new_text") or "").strip() or None,
                        str(entry.get("selected_old_text") or "").strip() or None,
                        str(entry.get("selected_entity_id") or "").strip() or None,
                        float(_safe_float(entry.get("confidence")) or 0.0),
                        str(entry.get("note") or "").strip() or None,
                        _safe_json_dumps(entry.get("candidates") or []),
                        _safe_json_dumps(entry.get("selected_candidate") or {}),
                        _safe_json_dumps(entry.get("agent_suggestion") or {}),
                        1
                        if _normalize_boolean(
                            entry.get("accepted_agent_suggestion"),
                            default=False,
                        )
                        else 0,
                        _safe_json_dumps(payload_json or {}),
                    ),
                )
                imported_events += 1

            for entry in raw_pairs:
                if not isinstance(entry, dict):
                    continue
                new_text_norm = _normalize_learning_text(entry.get("new_text_norm"))
                old_text_norm = _normalize_learning_text(entry.get("old_text_norm"))
                hit_count = max(0, int(_safe_float(entry.get("hit_count")) or 0))
                if not new_text_norm or not old_text_norm or hit_count <= 0:
                    continue
                connection.execute(
                    """
                    INSERT INTO replacement_pairs (
                        new_text_norm,
                        old_text_norm,
                        hit_count,
                        last_selected_utc
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(new_text_norm, old_text_norm)
                    DO UPDATE SET
                        hit_count = MAX(replacement_pairs.hit_count, excluded.hit_count),
                        last_selected_utc = excluded.last_selected_utc
                    """,
                    (
                        new_text_norm,
                        old_text_norm,
                        hit_count,
                        str(entry.get("last_selected_utc") or now_iso),
                    ),
                )
                imported_pairs += 1

            for entry in raw_metrics:
                if not isinstance(entry, dict):
                    continue
                metric_key = str(entry.get("metric_key") or "").strip()
                score = _safe_float(entry.get("score"))
                if not metric_key or score is None:
                    continue
                connection.execute(
                    """
                    INSERT INTO replacement_metrics (metric_key, score, updated_utc)
                    VALUES (?, ?, ?)
                    ON CONFLICT(metric_key)
                    DO UPDATE SET
                        score = excluded.score,
                        updated_utc = excluded.updated_utc
                    """,
                    (
                        metric_key,
                        float(score),
                        str(entry.get("updated_utc") or now_iso),
                    ),
                )
                imported_metrics += 1

            connection.commit()
    return {
        "events": imported_events,
        "pairs": imported_pairs,
        "metrics": imported_metrics,
    }


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
    max_entities: int = 500,
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
                    max_entities=max(50, min(5000, int(max_entities or 500))),
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
                entity_type = str(entry.get("type") or entry.get("object_name") or "").strip()
                if entity_type:
                    normalized_entry["type"] = entity_type
                entity_text = str(entry.get("text") or "").strip()
                if entity_text:
                    normalized_entry["text"] = entity_text
                    normalized_entry["text_norm"] = _normalize_learning_text(entity_text)
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


def _cad_context_is_available(cad_context: Optional[Dict[str, Any]]) -> bool:
    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    if not cad_context_obj:
        return False
    return bool(
        _extract_locked_layers(cad_context_obj)
        or _extract_entities(cad_context_obj)
        or cad_context_obj.get("drawing")
    )


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
    geometry_tolerance: float = 0.0,
) -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []
    warnings: List[str] = []

    cad_context_obj = cad_context if isinstance(cad_context, dict) else {}
    try:
        geometry_tolerance_value = max(0.0, float(geometry_tolerance))
    except Exception:
        geometry_tolerance_value = 0.0
    locked_layers = _extract_locked_layers(cad_context_obj)
    entities = _extract_entities(cad_context_obj)
    cad_available = _cad_context_is_available(cad_context_obj)

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
        paired_annotation_ids = [
            value.strip()
            for value in (action.get("paired_annotation_ids") or [])
            if isinstance(value, str) and value.strip()
        ]

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
            effective_markup_bounds = _expand_bounds(markup_bounds, geometry_tolerance_value)
            overlapping_count = 0
            for entity in entities:
                entity_bounds = _normalize_bounds(entity.get("bounds"))
                if entity_bounds and _bounds_overlap(effective_markup_bounds, entity_bounds):
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

        if cad_available and category == "note":
            if not markup_bounds:
                if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                    status = _BACKCHECK_WARN
                    severity = "medium"
                notes.append("NOTE action has no bounds for presence validation.")
                suggestions.append("Provide markup bounds to validate note placement context.")
            else:
                effective_note_bounds = _expand_bounds(markup_bounds, geometry_tolerance_value)
                note_overlap_count = 0
                for entity in entities:
                    entity_bounds = _normalize_bounds(entity.get("bounds"))
                    if entity_bounds and _bounds_overlap(effective_note_bounds, entity_bounds):
                        note_overlap_count += 1
                if note_overlap_count == 0:
                    if _finding_status_rank(_BACKCHECK_WARN) > _finding_status_rank(status):
                        status = _BACKCHECK_WARN
                        severity = "medium"
                    notes.append("NOTE action has no nearby CAD entity context.")
                    suggestions.append("Confirm note location against nearby CAD entities.")

        if markup_bounds:
            effective_markup_bounds = _expand_bounds(markup_bounds, geometry_tolerance_value)
            conflict_count = 0
            for other_action_id, other_bounds in action_bounds.items():
                if other_action_id == action_id:
                    continue
                effective_other_bounds = _expand_bounds(other_bounds, geometry_tolerance_value)
                if not _bounds_overlap(effective_markup_bounds, effective_other_bounds):
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

        finding = {
            "id": f"finding-{index}",
            "action_id": action_id,
            "status": status,
            "severity": severity,
            "category": category or "unclassified",
            "notes": notes,
            "suggestions": sorted(set(suggestions)),
        }
        if paired_annotation_ids:
            finding["paired_annotation_ids"] = paired_annotation_ids
        findings.append(finding)

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


def _normalize_compare_engine(value: Any) -> str:
    engine = _normalize_text(value)
    if engine in _COMPARE_SUPPORTED_ENGINES:
        return engine
    return _COMPARE_ENGINE_AUTO


def _build_compare_summary(
    *,
    markups: List[Dict[str, Any]],
    plan: Dict[str, Any],
    backcheck: Dict[str, Any],
    cad_available: bool,
) -> Dict[str, Any]:
    summary_obj = backcheck.get("summary") if isinstance(backcheck.get("summary"), dict) else {}
    pass_count = int(summary_obj.get("pass_count") or 0)
    warn_count = int(summary_obj.get("warn_count") or 0)
    fail_count = int(summary_obj.get("fail_count") or 0)
    actions_obj = plan.get("actions") if isinstance(plan.get("actions"), list) else []

    status = _BACKCHECK_PASS
    if fail_count > 0:
        status = _BACKCHECK_FAIL
    elif warn_count > 0:
        status = _BACKCHECK_WARN

    return {
        "status": status,
        "total_markups": len(markups),
        "total_actions": len(actions_obj),
        "pass_count": pass_count,
        "warn_count": warn_count,
        "fail_count": fail_count,
        "cad_context_available": cad_available,
    }


def _build_local_compare_report(
    *,
    markups: List[Dict[str, Any]],
    cad_context: Dict[str, Any],
    request_id: str,
    cad_context_source: str,
    tolerance_profile: str,
) -> Dict[str, Any]:
    plan = _build_local_plan(markups)
    plan["ok"] = True
    plan["source"] = "python-local-rules"
    actions = [entry for entry in (plan.get("actions") or []) if isinstance(entry, dict)]
    backcheck = _build_local_backcheck(
        actions=actions,
        cad_context=cad_context,
        request_id=request_id,
        cad_context_source=cad_context_source,
        geometry_tolerance=_geometry_tolerance_for_profile(tolerance_profile),
    )
    summary = _build_compare_summary(
        markups=markups,
        plan=plan,
        backcheck=backcheck,
        cad_available=_cad_context_is_available(cad_context),
    )
    return {
        "ok": True,
        "success": True,
        "requestId": request_id,
        "source": "python-compare",
        "mode": "cad-aware",
        "tolerance_profile": tolerance_profile,
        "plan": {
            "source": str(plan.get("source") or "python-local-rules"),
            "summary": plan.get("summary") if isinstance(plan.get("summary"), dict) else {},
            "actions": actions,
        },
        "backcheck": backcheck,
        "summary": summary,
    }


def create_autodraft_blueprint(
    *,
    require_api_key: Callable,
    limiter: Limiter,
    logger: Any,
    autodraft_dotnet_api_url: str,
    autodraft_execute_provider: str,
    send_autodraft_dotnet_command: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None,
    get_manager: Optional[Callable[[], Any]] = None,
) -> Blueprint:
    """Create /api/autodraft route group blueprint."""
    bp = Blueprint("autodraft_api", __name__, url_prefix="/api/autodraft")
    dotnet_base_url = (autodraft_dotnet_api_url or "").strip().rstrip("/")

    def _normalize_execute_provider(raw_value: str) -> str:
        normalized = str(raw_value or "").strip().lower().replace("-", "_")
        aliases = {
            "": "dotnet_bridge_fallback_api",
            "bridge": "dotnet_bridge",
            "dotnet_bridge": "dotnet_bridge",
            "bridge_fallback_api": "dotnet_bridge_fallback_api",
            "dotnet_bridge_fallback_api": "dotnet_bridge_fallback_api",
            "bridge_with_api_fallback": "dotnet_bridge_fallback_api",
            "api": "dotnet_api",
            "http": "dotnet_api",
            "dotnet_api": "dotnet_api",
        }
        resolved = aliases.get(normalized)
        if resolved is not None:
            return resolved
        logger.warning(
            "Unknown AUTODRAFT_EXECUTE_PROVIDER=%s; defaulting to dotnet_bridge_fallback_api.",
            raw_value,
        )
        return "dotnet_bridge_fallback_api"

    execute_provider = _normalize_execute_provider(autodraft_execute_provider)
    execute_bridge_enabled = execute_provider in {
        "dotnet_bridge",
        "dotnet_bridge_fallback_api",
    }
    execute_api_fallback_enabled = execute_provider == "dotnet_bridge_fallback_api"

    def _call_autodraft_execute_bridge(
        *,
        payload: Dict[str, Any],
        request_id: str,
    ) -> Dict[str, Any]:
        if send_autodraft_dotnet_command is None:
            raise RuntimeError(
                "AutoDraft .NET bridge is unavailable. Install pywin32 and ensure the named-pipe bridge is running."
            )

        started_at = time.time()
        response = send_autodraft_dotnet_command(
            "autodraft_execute",
            {
                **payload,
                "requestId": request_id,
            },
        )
        elapsed_ms = int((time.time() - started_at) * 1000)

        if not isinstance(response, dict):
            raise RuntimeError("Malformed response from AutoDraft .NET bridge.")
        if not response.get("ok"):
            raise RuntimeError(
                str(response.get("error") or "Unknown AutoDraft .NET bridge error.")
            )

        result_payload = response.get("result")
        if not isinstance(result_payload, dict):
            raise RuntimeError("AutoDraft .NET bridge returned invalid result payload.")

        data = result_payload.get("data") if isinstance(result_payload.get("data"), dict) else {}
        warnings = result_payload.get("warnings")
        normalized_warnings = warnings if isinstance(warnings, list) else []

        normalized_response: Dict[str, Any] = {
            "ok": bool(result_payload.get("success", True)),
            "source": "dotnet-bridge",
            "job_id": str(data.get("jobId") or response.get("id") or f"bridge-{request_id}"),
            "status": str(data.get("status") or "preflight-only"),
            "accepted": int(data.get("accepted") or 0),
            "skipped": int(data.get("skipped") or 0),
            "dry_run": bool(data.get("dryRun", payload.get("dry_run", True))),
            "message": str(
                data.get("message")
                or result_payload.get("message")
                or "AutoDraft bridge request completed."
            ),
            "requestId": request_id,
            "warnings": normalized_warnings,
            "meta": {
                **(result_payload.get("meta") if isinstance(result_payload.get("meta"), dict) else {}),
                "cad": data.get("cad") if isinstance(data.get("cad"), dict) else None,
                "commit": data.get("commit") if isinstance(data.get("commit"), dict) else None,
                "mode": str(data.get("mode") or ("preview" if payload.get("dry_run", True) else "commit")),
                "previewReadyCount": int(data.get("previewReady") or data.get("accepted") or 0),
                "bridgeMs": elapsed_ms,
                "providerPath": "dotnet_bridge",
                "requestId": request_id,
                "bridgeRequestId": str(response.get("id") or ""),
            },
        }
        return normalized_response

    def _resolve_cad_context_for_request(
        *,
        payload: Dict[str, Any],
        request_id: str,
        actions: Optional[List[Dict[str, Any]]] = None,
        max_entities: int = 500,
    ) -> Tuple[Optional[Dict[str, Any]], str]:
        client_cad_context = (
            payload.get("cad_context")
            if isinstance(payload.get("cad_context"), dict)
            else None
        )
        live_cad_context = _collect_live_cad_context(
            get_manager=get_manager,
            logger=logger,
            request_id=request_id,
            actions=actions,
            max_entities=max_entities,
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
        if isinstance(cad_context, dict):
            cad_context["source"] = cad_context_source
        return cad_context, cad_context_source

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
                    "mode": execute_provider,
                    "dotnet": dotnet_status,
                    "execute_provider": {
                        "provider": execute_provider,
                        "bridge_ready": bool(send_autodraft_dotnet_command),
                        "api_configured": bool(dotnet_base_url),
                        "api_fallback_enabled": execute_api_fallback_enabled,
                    },
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

    @bp.route("/compare/prepare", methods=["POST"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_autodraft_compare_prepare():
        request_id = _derive_request_id(
            {
                "requestId": request.form.get("requestId")
                or request.form.get("request_id")
                or request.args.get("requestId")
                or request.args.get("request_id"),
            }
        )
        uploaded_pdf = request.files.get("pdf")
        if uploaded_pdf is None:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="PDF file is required (`pdf`).",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/prepare"},
            )

        page_index_raw = request.form.get("page_index", "0")
        try:
            page_index = int(page_index_raw)
        except Exception:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="page_index must be an integer.",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/prepare"},
            )
        if page_index < 0:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="page_index must be >= 0.",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/prepare"},
            )

        try:
            if hasattr(uploaded_pdf, "stream") and hasattr(uploaded_pdf.stream, "seek"):
                uploaded_pdf.stream.seek(0)
        except Exception:
            pass

        prepared_payload, error, status_code = _extract_pdf_compare_markups(
            pdf_stream=getattr(uploaded_pdf, "stream", uploaded_pdf),
            page_index=page_index,
        )
        if prepared_payload is None:
            error_code = (
                "AUTODRAFT_COMPARE_PREPARE_UNAVAILABLE"
                if status_code >= 500
                else "AUTODRAFT_INVALID_REQUEST"
            )
            return _autodraft_error_response(
                code=error_code,
                message=str(error or "Compare prepare failed."),
                request_id=request_id,
                status_code=status_code,
                meta={"endpoint": "/api/autodraft/compare/prepare"},
            )

        prepared_payload["requestId"] = request_id
        prepared_payload["source"] = "python-compare-prepare"
        return jsonify(prepared_payload), status_code

    @bp.route("/compare", methods=["POST"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_autodraft_compare():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare"},
            )

        request_id = _derive_request_id(payload)
        engine_requested = _normalize_compare_engine(payload.get("engine"))
        tolerance_profile = _normalize_tolerance_profile(payload.get("tolerance_profile"))
        calibration_mode = _normalize_calibration_mode(payload.get("calibration_mode"))
        agent_review_mode = _normalize_agent_review_mode(payload.get("agent_review_mode"))
        manual_override = _normalize_boolean(payload.get("manual_override"), default=False)
        roi_bounds_pdf = _normalize_compare_roi(payload.get("roi"))
        calibration_seed = (
            payload.get("calibration_seed")
            if isinstance(payload.get("calibration_seed"), dict)
            else {}
        )
        replacement_tuning = _normalize_replacement_tuning(
            payload.get("replacement_tuning")
        )

        markups = _normalize_compare_markups(payload.get("markups"))
        if not markups:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="At least one normalized markup is required.",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare"},
            )

        cad_context, cad_context_source = _resolve_cad_context_for_request(
            payload=payload,
            request_id=request_id,
            actions=[],
            max_entities=2000,
        )
        if not _cad_context_is_available(cad_context):
            return _autodraft_error_response(
                code="AUTODRAFT_CAD_CONTEXT_UNAVAILABLE",
                message=(
                    "CAD context is required for compare but was unavailable from "
                    "request payload and live AutoCAD context."
                ),
                request_id=request_id,
                status_code=503,
                meta={
                    "endpoint": "/api/autodraft/compare",
                    "cadSource": cad_context_source,
                    "degraded": True,
                },
            )
        cad_context_obj = cad_context if isinstance(cad_context, dict) else {}

        pdf_points = _normalize_point_pair_list(payload.get("pdf_points"))
        cad_points = _normalize_point_pair_list(payload.get("cad_points"))
        transform: Optional[Dict[str, Any]] = None
        auto_calibration = _build_auto_calibration_payload(
            available=True,
            used=False,
            status="needs_manual",
            confidence=0.0,
            method="none",
            quality_notes=[],
            suggested_pdf_points=pdf_points or [],
            suggested_cad_points=cad_points or [],
        )
        manual_points_available = pdf_points is not None and cad_points is not None
        manual_transform_requested = calibration_mode == _COMPARE_CALIBRATION_MODE_MANUAL
        if manual_transform_requested:
            if pdf_points is None or cad_points is None:
                return _autodraft_error_response(
                    code="AUTODRAFT_INVALID_REQUEST",
                    message="Exactly two PDF points and two CAD points are required for manual calibration.",
                    request_id=request_id,
                    status_code=400,
                    meta={"endpoint": "/api/autodraft/compare"},
                )
            transform, transform_error = _build_similarity_transform(
                pdf_points=pdf_points,
                cad_points=cad_points,
            )
            if transform is None:
                return _autodraft_error_response(
                    code="AUTODRAFT_INVALID_REQUEST",
                    message=str(transform_error or "Calibration transform failed."),
                    request_id=request_id,
                    status_code=400,
                    meta={"endpoint": "/api/autodraft/compare"},
                )
            auto_calibration = _build_auto_calibration_payload(
                available=True,
                used=False,
                status="ready",
                confidence=1.0,
                method="manual-two-point",
                quality_notes=["Manual two-point calibration was used."],
                suggested_pdf_points=pdf_points,
                suggested_cad_points=cad_points,
                transform=transform,
            )
        else:
            auto_calibration = _auto_calibrate_transform(
                markups=markups,
                cad_context=cad_context_obj,
                calibration_seed=calibration_seed,
                roi=roi_bounds_pdf,
            )
            transform_candidate = (
                auto_calibration.get("transform")
                if isinstance(auto_calibration.get("transform"), dict)
                else None
            )
            auto_status = _normalize_text(auto_calibration.get("status"))
            if auto_status != "ready" or not transform_candidate:
                if manual_override and manual_points_available:
                    manual_transform, manual_transform_error = _build_similarity_transform(
                        pdf_points=pdf_points or [],
                        cad_points=cad_points or [],
                    )
                    if manual_transform is not None:
                        transform = manual_transform
                        auto_notes = (
                            auto_calibration.get("quality_notes")
                            if isinstance(auto_calibration.get("quality_notes"), list)
                            else []
                        )
                        _append_unique_note(
                            auto_notes,
                            "Auto-calibration was not ready; manual points supplied in request were used as fallback.",
                        )
                        auto_calibration = _build_auto_calibration_payload(
                            available=True,
                            used=True,
                            status="ready",
                            confidence=_safe_float(auto_calibration.get("confidence")) or 0.0,
                            method="auto-fallback-manual-two-point",
                            quality_notes=auto_notes,
                            suggested_pdf_points=pdf_points or [],
                            suggested_cad_points=cad_points or [],
                            matched_anchor_count=max(
                                0,
                                int(
                                    _safe_float(auto_calibration.get("matched_anchor_count"))
                                    or 0.0
                                ),
                            ),
                            anchor_count=max(
                                0,
                                int(
                                    _safe_float(auto_calibration.get("anchor_count"))
                                    or 0.0
                                ),
                            ),
                            residual_error=_safe_float(auto_calibration.get("residual_error")),
                            transform=manual_transform,
                        )
                    else:
                        logger.warning(
                            "AutoDraft compare manual fallback transform failed in auto mode: %s",
                            manual_transform_error,
                        )
                if transform is None:
                    return _autodraft_error_response(
                        code="AUTODRAFT_CALIBRATION_MANUAL_REQUIRED",
                        message=(
                            "Auto-calibration needs manual refinement. Capture two PDF points and two CAD points, "
                            "or refine ROI and retry auto mode."
                        ),
                        request_id=request_id,
                        status_code=422,
                        meta={
                            "endpoint": "/api/autodraft/compare",
                            "auto_calibration": _sanitize_auto_calibration_payload(
                                auto_calibration
                            ),
                            "manual_override_requested": bool(manual_override),
                        },
                    )
            if transform is None:
                transform = transform_candidate
                if pdf_points is None:
                    pdf_points = [
                        entry
                        for entry in (auto_calibration.get("suggested_pdf_points") or [])
                        if isinstance(entry, dict)
                    ]
                if cad_points is None:
                    cad_points = [
                        entry
                        for entry in (auto_calibration.get("suggested_cad_points") or [])
                        if isinstance(entry, dict)
                    ]

        if transform is None:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Calibration transform failed.",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare"},
            )

        transformed_markups: List[Dict[str, Any]] = []
        for markup in markups:
            next_markup = dict(markup)
            bounds = _normalize_bounds(markup.get("bounds"))
            if bounds:
                next_markup["bounds"] = _transform_bounds_to_cad(bounds, transform)
            raw_meta = markup.get("meta")
            if isinstance(raw_meta, dict):
                meta_obj = dict(raw_meta)
                callout_points = _normalize_point_list(meta_obj.get("callout_points"))
                if callout_points:
                    meta_obj["callout_points"] = [
                        _transform_point_to_cad(point, transform) for point in callout_points
                    ]
                page_position = (
                    meta_obj.get("page_position")
                    if isinstance(meta_obj.get("page_position"), dict)
                    else None
                )
                if isinstance(page_position, dict):
                    transformed_page_position = _transform_point_to_cad(page_position, transform)
                    meta_obj["cad_position"] = transformed_page_position
                meta_obj["cad_transform_applied"] = True
                next_markup["meta"] = meta_obj
            if isinstance(markup.get("recognition"), dict):
                recognition_obj = dict(markup.get("recognition") or {})
                original_feature_source = str(
                    recognition_obj.get("feature_source") or ""
                ).strip()
                if original_feature_source:
                    recognition_obj["input_feature_source"] = original_feature_source
                    recognition_obj["feature_source"] = (
                        f"{original_feature_source}+cad_context"
                    )
                else:
                    recognition_obj["feature_source"] = "prepared_markups+cad_context"
                next_markup["recognition"] = recognition_obj
            transformed_markups.append(next_markup)

        cad_context_for_compare = cad_context_obj
        cad_roi_bounds: Optional[Dict[str, float]] = None
        if roi_bounds_pdf:
            cad_roi_bounds = _transform_bounds_to_cad(roi_bounds_pdf, transform)
            filtered_context, filtered_entity_count = _filter_cad_context_by_bounds(
                cad_context_for_compare,
                bounds=cad_roi_bounds,
            )
            if filtered_entity_count <= 0:
                return _autodraft_error_response(
                    code="AUTODRAFT_ROI_EMPTY",
                    message=(
                        "Selected ROI did not intersect any CAD entities after calibration. "
                        "Refine ROI or retry without ROI filtering."
                    ),
                    request_id=request_id,
                    status_code=422,
                    meta={
                        "endpoint": "/api/autodraft/compare",
                        "auto_calibration": _sanitize_auto_calibration_payload(
                            auto_calibration
                        ),
                        "cad_roi": cad_roi_bounds,
                        "localized_roi_failure": {
                            "pdf_roi": roi_bounds_pdf,
                            "cad_roi": cad_roi_bounds,
                            "reason": "no_cad_entities_in_roi",
                        },
                    },
                )
            cad_context_for_compare = filtered_context
            auto_notes = (
                auto_calibration.get("quality_notes")
                if isinstance(auto_calibration.get("quality_notes"), list)
                else []
            )
            _append_unique_note(
                auto_notes,
                f"ROI filter active; compare used {filtered_entity_count} CAD entities in selected area.",
            )
            auto_calibration["quality_notes"] = auto_notes

        layer_entries = _normalize_layer_entries(
            cad_context_for_compare.get("layers")
            if isinstance(cad_context_for_compare, dict)
            else None
        )
        default_layer_name = ""
        for entry in layer_entries:
            if not bool(entry.get("locked")):
                default_layer_name = str(entry.get("name") or "").strip()
                if default_layer_name:
                    break
        if not default_layer_name and layer_entries:
            default_layer_name = str(layer_entries[0].get("name") or "").strip()
        if default_layer_name:
            for markup in transformed_markups:
                markup_type = _normalize_text(markup.get("type"))
                if markup_type in {"cloud", "arrow"} and not str(markup.get("layer") or "").strip():
                    markup["layer"] = default_layer_name
        effective_transformed_markups = _pair_blue_note_markups(transformed_markups)
        for markup in effective_transformed_markups:
            if not isinstance(markup, dict):
                continue
            if not isinstance(markup.get("recognition"), dict):
                markup["recognition"] = _build_markup_recognition(
                    markup,
                    feature_source="prepared_markups+cad_context",
                )

        engine_used = _COMPARE_ENGINE_PYTHON
        used_fallback = False
        compare_payload_for_engine: Dict[str, Any] = {
            "markups": effective_transformed_markups,
            "cad_context": cad_context_for_compare,
            "tolerance_profile": tolerance_profile,
            "replacement_tuning": replacement_tuning,
            "calibration_mode": calibration_mode,
            "agent_review_mode": agent_review_mode,
            "roi": _copy_bounds(roi_bounds_pdf) if roi_bounds_pdf else None,
            "auto_calibration": _sanitize_auto_calibration_payload(auto_calibration),
            "requestId": request_id,
        }

        compare_result: Optional[Dict[str, Any]] = None
        if engine_requested in {_COMPARE_ENGINE_AUTO, _COMPARE_ENGINE_DOTNET}:
            if not dotnet_base_url:
                if engine_requested == _COMPARE_ENGINE_DOTNET:
                    return _autodraft_error_response(
                        code="AUTODRAFT_COMPARE_NOT_CONFIGURED",
                        message=(
                            "Compare engine `dotnet` requires AUTODRAFT_DOTNET_API_URL."
                        ),
                        request_id=request_id,
                        status_code=503,
                        meta={"endpoint": "/api/autodraft/compare"},
                    )
            else:
                upstream, error, status = _proxy_json(
                    base_url=dotnet_base_url,
                    method="POST",
                    path="/api/autodraft/compare",
                    timeout_seconds=30,
                    payload=compare_payload_for_engine,
                )
                if upstream is not None:
                    engine_used = _COMPARE_ENGINE_DOTNET
                    compare_result = upstream
                elif engine_requested == _COMPARE_ENGINE_DOTNET:
                    return _autodraft_error_response(
                        code="AUTODRAFT_UPSTREAM_ERROR",
                        message=str(error or "Upstream compare request failed."),
                        request_id=request_id,
                        status_code=status,
                        meta={
                            "endpoint": "/api/autodraft/compare",
                            "upstream_status": status,
                            "engine": "dotnet",
                        },
                    )
                else:
                    used_fallback = True
                    logger.warning("AutoDraft compare dotnet fallback to python: %s", error)

        if compare_result is None:
            compare_result = _build_local_compare_report(
                markups=effective_transformed_markups,
                cad_context=cad_context_for_compare,
                request_id=request_id,
                cad_context_source=cad_context_source,
                tolerance_profile=tolerance_profile,
            )
            engine_used = _COMPARE_ENGINE_PYTHON
        _normalize_compare_result_semantics(compare_result)
        plan_obj = compare_result.get("plan") if isinstance(compare_result.get("plan"), dict) else {}
        plan_actions = plan_obj.get("actions") if isinstance(plan_obj.get("actions"), list) else []
        if plan_actions:
            plan_obj["actions"] = _prepare_autodraft_execute_actions(
                [item for item in plan_actions if isinstance(item, dict)],
                revision_context=_normalize_revision_context_payload(
                    payload.get("revision_context")
                ),
                cad_context=cad_context_for_compare,
            )
            compare_result["plan"] = plan_obj
        markup_review_queue = _apply_markup_review_requirements(
            compare_result=compare_result,
            request_id=request_id,
            source_markups=effective_transformed_markups,
        )

        review_queue: List[Dict[str, Any]] = []
        agent_pre_review_result: Dict[str, Any] = {
            "enabled": False,
            "attempted": False,
            "available": False,
            "used": False,
            "profile": _resolve_agent_pre_review_profile(),
            "latency_ms": None,
            "hints_count": 0,
            "error": "Replacement pre-review was not executed.",
            "auth": {
                "mode": "service_token",
                "token_source": "none",
                "refresh_attempted": False,
            },
            "preflight": {
                "checked": False,
                "available": False,
                "expected_model": _resolve_profile_primary_model(_resolve_agent_pre_review_profile()) or None,
                "reason": "not_checked",
            },
        }
        if isinstance(cad_context_for_compare, dict):
            review_queue, agent_pre_review_result = _enrich_compare_result_with_replacements(
                compare_result=compare_result,
                cad_context=cad_context_for_compare,
                request_id=request_id,
                tuning=replacement_tuning,
                review_mode=agent_review_mode,
                logger=logger,
            )

        shadow_result: Dict[str, Any] = {
            "enabled": False,
            "available": False,
            "profile": _SHADOW_ADVISOR_PROFILE,
            "reviews": [],
            "error": None,
        }
        if review_queue:
            shadow_result = _run_shadow_advisor(
                request_id=request_id,
                review_cases=review_queue,
                logger=logger,
            )
            reviews = (
                shadow_result.get("reviews")
                if isinstance(shadow_result.get("reviews"), list)
                else []
            )
            reviews_by_action_id = {
                str(entry.get("action_id") or "").strip(): entry
                for entry in reviews
                if isinstance(entry, dict) and str(entry.get("action_id") or "").strip()
            }
            for item in review_queue:
                action_id = str(item.get("action_id") or "").strip()
                if action_id in reviews_by_action_id:
                    item["shadow"] = reviews_by_action_id[action_id]

            if shadow_result.get("error"):
                backcheck_obj = (
                    compare_result.get("backcheck")
                    if isinstance(compare_result.get("backcheck"), dict)
                    else {}
                )
                warnings = (
                    backcheck_obj.get("warnings")
                    if isinstance(backcheck_obj.get("warnings"), list)
                    else []
                )
                _append_unique_note(
                    warnings,
                    f"Shadow advisor unavailable: {shadow_result.get('error')}",
                )
                backcheck_obj["warnings"] = warnings
                compare_result["backcheck"] = backcheck_obj

        compare_result["requestId"] = request_id
        compare_result["engine"] = {
            "requested": engine_requested,
            "used": engine_used,
            "used_fallback": used_fallback,
        }
        compare_result["calibration"] = {
            "pdf_points": pdf_points if isinstance(pdf_points, list) else [],
            "cad_points": cad_points if isinstance(cad_points, list) else [],
            "scale": transform.get("scale"),
            "rotation_deg": transform.get("rotation_deg"),
            "translation": transform.get("translation"),
        }
        compare_result["calibration_mode"] = calibration_mode
        compare_result["auto_calibration"] = _sanitize_auto_calibration_payload(auto_calibration)
        if roi_bounds_pdf:
            compare_result["roi"] = _copy_bounds(roi_bounds_pdf)
        if cad_roi_bounds:
            compare_result["cad_roi"] = _copy_bounds(cad_roi_bounds)
        compare_result["tolerance_profile"] = tolerance_profile
        compare_result["markups"] = {
            "input_count": len(markups),
            "transformed_count": len(effective_transformed_markups),
        }
        compare_result["replacement_tuning"] = replacement_tuning
        compare_result["markup_review_queue"] = markup_review_queue
        compare_result["review_queue"] = review_queue
        compare_result["agent_pre_review"] = agent_pre_review_result
        compare_result["shadow_advisor"] = shadow_result
        compare_result["recognition"] = _compare_recognition_summary(
            effective_transformed_markups,
            feature_source="prepared_markups+cad_context",
            agent_hints_applied=bool(agent_pre_review_result.get("used")),
        )
        return jsonify(compare_result), 200

    @bp.route("/compare/feedback", methods=["POST"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_autodraft_compare_feedback():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/feedback"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/feedback"},
            )
        request_id = _derive_request_id(payload)
        items = _normalize_feedback_items(payload)
        if not items:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message=(
                    "At least one compare feedback item is required. Replacement review items need "
                    "action_id + review_status, and markup-learning items can carry corrected "
                    "intent/class/color/text fields."
                ),
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/feedback"},
            )

        db_path = _resolve_compare_feedback_db_path()
        stored_count = _persist_feedback_items(db_path=db_path, items=items)
        metric_scores = _load_replacement_metric_scores(db_path)
        learning_examples = _build_feedback_learning_examples(items=items)
        learning_counts: Dict[str, int] = {}
        for domain, examples in learning_examples.items():
            if not examples:
                continue
            try:
                learning_counts[domain] = _LOCAL_LEARNING_RUNTIME.record_examples(
                    domain=domain,
                    examples=examples,
                )
            except Exception as exc:
                logger.warning(
                    "AutoDraft compare feedback learning capture failed (domain=%s): %s",
                    domain,
                    exc,
                )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-compare-feedback",
                    "stored": stored_count,
                    "metrics": metric_scores,
                    "learning": learning_counts,
                }
            ),
            200,
        )

    @bp.route("/compare/feedback/export", methods=["GET"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_autodraft_compare_feedback_export():
        request_id = _derive_request_id({})
        db_path = _resolve_compare_feedback_db_path()
        exported = _export_feedback_data(db_path=db_path)
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-compare-feedback",
                    **exported,
                }
            ),
            200,
        )

    @bp.route("/compare/reviewed-run/export", methods=["POST"])
    @require_api_key
    @limiter.limit("30 per hour")
    def api_autodraft_compare_reviewed_run_export():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/reviewed-run/export"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/reviewed-run/export"},
            )
        request_id = _derive_request_id(payload)
        prepare_payload = payload.get("prepare") if isinstance(payload.get("prepare"), dict) else {}
        compare_payload = payload.get("compare") if isinstance(payload.get("compare"), dict) else {}
        compare_request_id = (
            str(compare_payload.get("requestId") or payload.get("compareRequestId") or "").strip()
            or str(payload.get("requestId") or "").strip()
        )
        if not compare_request_id:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="A compare requestId is required to export a reviewed run bundle.",
                request_id=request_id,
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/reviewed-run/export"},
            )

        db_path = _resolve_compare_feedback_db_path()
        feedback_events = _export_feedback_events_for_request(
            db_path=db_path,
            request_id=compare_request_id,
        )
        feedback_items = _feedback_items_from_exported_events(events=feedback_events)
        normalized_feedback_items = _normalize_feedback_items({"items": feedback_items})
        if not normalized_feedback_items:
            return _autodraft_error_response(
                code="AUTODRAFT_REVIEWED_RUN_EMPTY",
                message=(
                    "No saved review feedback was found for this compare request. "
                    "Save at least one markup or replacement review before exporting a reviewed run."
                ),
                request_id=request_id,
                status_code=400,
                meta={
                    "endpoint": "/api/autodraft/compare/reviewed-run/export",
                    "compare_request_id": compare_request_id,
                },
            )

        bundle = _build_reviewed_run_bundle(
            request_id=compare_request_id,
            prepare_payload=prepare_payload,
            compare_payload=compare_payload,
            feedback_items=feedback_items,
            normalized_feedback_items=normalized_feedback_items,
            feedback_events=feedback_events,
            label=str(payload.get("label") or "").strip(),
            notes=str(payload.get("notes") or "").strip(),
        )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-reviewed-run",
                    "bundle": bundle,
                }
            ),
            200,
        )

    @bp.route("/compare/feedback/import", methods=["POST"])
    @require_api_key
    @limiter.limit("20 per hour")
    def api_autodraft_compare_feedback_import():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/feedback/import"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/compare/feedback/import"},
            )
        request_id = _derive_request_id(payload)
        mode = _normalize_text(payload.get("mode"))
        import_mode = "replace" if mode == "replace" else "merge"
        db_path = _resolve_compare_feedback_db_path()
        counts = _import_feedback_data(
            db_path=db_path,
            payload=payload,
            mode=import_mode,
        )
        metric_scores = _load_replacement_metric_scores(db_path)
        import_items = _normalize_feedback_items(
            {"items": payload.get("events") if isinstance(payload.get("events"), list) else []}
        )
        learning_counts: Dict[str, int] = {}
        learning_examples = _build_feedback_learning_examples(items=import_items)
        for domain, examples in learning_examples.items():
            if not examples:
                continue
            try:
                learning_counts[domain] = _LOCAL_LEARNING_RUNTIME.record_examples(
                    domain=domain,
                    examples=examples,
                )
            except Exception as exc:
                logger.warning(
                    "AutoDraft feedback import learning capture failed (domain=%s): %s",
                    domain,
                    exc,
                )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-compare-feedback",
                    "mode": import_mode,
                    "imported": counts,
                    "metrics": metric_scores,
                    "learning": learning_counts,
                }
            ),
            200,
        )

    @bp.route("/learning/train", methods=["POST"])
    @require_api_key
    @limiter.limit("20 per hour")
    def api_autodraft_learning_train():
        if not request.is_json:
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Expected JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/learning/train"},
            )
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _autodraft_error_response(
                code="AUTODRAFT_INVALID_REQUEST",
                message="Invalid JSON payload.",
                request_id=_derive_request_id({}),
                status_code=400,
                meta={"endpoint": "/api/autodraft/learning/train"},
            )
        request_id = _derive_request_id(payload)
        raw_domains = payload.get("domains")
        if isinstance(raw_domains, list):
            domains = [str(entry or "").strip() for entry in raw_domains if str(entry or "").strip()]
        else:
            single_domain = str(payload.get("domain") or "").strip()
            domains = [single_domain] if single_domain else list(
                (
                    "autodraft_markup",
                    "autodraft_replacement",
                    "transmittal_titleblock",
                )
            )
        try:
            results = _LOCAL_LEARNING_RUNTIME.train_domains(domains=domains)
        except Exception as exc:
            return _autodraft_error_response(
                code="AUTODRAFT_LEARNING_TRAIN_FAILED",
                message=f"Local learning train failed: {str(exc)}",
                request_id=request_id,
                status_code=500,
                meta={"endpoint": "/api/autodraft/learning/train"},
            )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-learning",
                    "results": results,
                }
            ),
            200,
        )

    @bp.route("/learning/models", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_autodraft_learning_models():
        request_id = _derive_request_id({})
        domain = str(request.args.get("domain") or "").strip() or None
        try:
            models = _LOCAL_LEARNING_RUNTIME.list_models(domain=domain)
        except Exception as exc:
            return _autodraft_error_response(
                code="AUTODRAFT_LEARNING_MODELS_FAILED",
                message=f"Failed to list local learning models: {str(exc)}",
                request_id=request_id,
                status_code=500,
                meta={"endpoint": "/api/autodraft/learning/models"},
            )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-learning",
                    "models": models,
                }
            ),
            200,
        )

    @bp.route("/learning/evaluations", methods=["GET"])
    @require_api_key
    @limiter.limit("120 per hour")
    def api_autodraft_learning_evaluations():
        request_id = _derive_request_id({})
        domain = str(request.args.get("domain") or "").strip() or None
        limit_raw = request.args.get("limit", "20")
        try:
            limit = int(limit_raw)
        except Exception:
            limit = 20
        try:
            evaluations = _LOCAL_LEARNING_RUNTIME.list_evaluations(
                domain=domain,
                limit=limit,
            )
        except Exception as exc:
            return _autodraft_error_response(
                code="AUTODRAFT_LEARNING_EVALUATIONS_FAILED",
                message=f"Failed to list local learning evaluations: {str(exc)}",
                request_id=request_id,
                status_code=500,
                meta={"endpoint": "/api/autodraft/learning/evaluations"},
            )
        return (
            jsonify(
                {
                    "ok": True,
                    "success": True,
                    "requestId": request_id,
                    "source": "autodraft-learning",
                    "evaluations": evaluations,
                }
            ),
            200,
        )

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
        revision_context = _normalize_revision_context_payload(
            payload.get("revision_context")
        )
        initial_prepared_actions = _prepare_autodraft_execute_actions(
            clean_actions,
            revision_context=revision_context,
        )
        client_cad_context = (
            payload.get("cad_context")
            if isinstance(payload.get("cad_context"), dict)
            else None
        )
        live_cad_context = _collect_live_cad_context(
            get_manager=get_manager,
            logger=logger,
            request_id=request_id,
            actions=initial_prepared_actions,
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
        prepared_actions = _prepare_autodraft_execute_actions(
            clean_actions,
            revision_context=revision_context,
            cad_context=cad_context,
        )
        backcheck_result = _build_local_backcheck(
            actions=prepared_actions,
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
        payload["actions"] = prepared_actions
        if execute_bridge_enabled:
            try:
                bridge_response = _call_autodraft_execute_bridge(
                    payload=payload,
                    request_id=request_id,
                )
                try:
                    receipt_summary = persist_autodraft_execution_receipt(
                        request_id=request_id,
                        payload=payload,
                        response_payload=bridge_response,
                        provider_path="dotnet_bridge",
                    )
                    if isinstance(bridge_response.get("meta"), dict):
                        bridge_response["meta"]["executionReceipt"] = receipt_summary
                    else:
                        bridge_response["meta"] = {"executionReceipt": receipt_summary}
                except Exception:
                    logger.exception(
                        "AutoDraft execute receipt persistence failed request_id=%s provider=%s",
                        request_id,
                        execute_provider,
                    )
                return jsonify(bridge_response), 200
            except Exception as bridge_exc:
                logger.warning(
                    "AutoDraft bridge execute failed request_id=%s provider=%s error=%s",
                    request_id,
                    execute_provider,
                    bridge_exc,
                )
                if not execute_api_fallback_enabled:
                    return _autodraft_error_response(
                        code="AUTODRAFT_UPSTREAM_ERROR",
                        message=str(bridge_exc),
                        request_id=request_id,
                        status_code=502,
                        meta={
                            "endpoint": "/api/autodraft/execute",
                            "provider": execute_provider,
                            "provider_path": "dotnet_bridge",
                        },
                    )

        if not dotnet_base_url:
            bridge_message = (
                "Execution requires AutoDraft .NET bridge or API integration. "
                "Configure AUTODRAFT_EXECUTE_PROVIDER and/or AUTODRAFT_DOTNET_API_URL."
            )
            return _autodraft_error_response(
                code="AUTODRAFT_EXECUTE_NOT_CONFIGURED",
                message=bridge_message,
                request_id=request_id,
                status_code=501,
                meta={
                    "endpoint": "/api/autodraft/execute",
                    "provider": execute_provider,
                },
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
                    "provider": execute_provider,
                    "provider_path": "dotnet_api",
                },
            )

        upstream.setdefault("requestId", request_id)
        upstream["source"] = "dotnet"
        if isinstance(upstream.get("meta"), dict):
            upstream["meta"]["providerPath"] = "dotnet_api"
        else:
            upstream["meta"] = {"providerPath": "dotnet_api"}
        try:
            receipt_summary = persist_autodraft_execution_receipt(
                request_id=request_id,
                payload=payload,
                response_payload=upstream,
                provider_path="dotnet_api",
            )
            upstream["meta"]["executionReceipt"] = receipt_summary
        except Exception:
            logger.exception(
                "AutoDraft execute receipt persistence failed request_id=%s provider=%s",
                request_id,
                execute_provider,
            )
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
