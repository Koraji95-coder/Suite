"""Module-level constants extracted from api_autodraft.py.

No runtime dependencies. Import freely from any module.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Set

# ── Default rules ─────────────────────────────────────────

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

# ── Intent tokens ─────────────────────────────────────────

DELETE_INTENT_TOKEN = "delete"
ADD_INTENT_TOKEN = "add"

CLOUD_COLOR_TO_CATEGORY: Dict[str, str] = {
    "green": "DELETE",
    "red": "ADD",
}

DEFAULT_COLOR_TO_CATEGORY: Dict[str, str] = {
    "blue": "NOTE",
    "green": "DELETE",
    "red": "ADD",
    "yellow": "NOTE",
}

RECOGNITION_LABEL_TO_CATEGORY: Dict[str, str] = {
    "delete": "DELETE",
    "remove": "DELETE",
    "add": "ADD",
    "insert": "ADD",
    "note": "NOTE",
    "title_block": "TITLE_BLOCK",
    "titleblock": "TITLE_BLOCK",
}

# ── Recognition thresholds ────────────────────────────────

LOCAL_MODEL_RECOGNITION_MIN_CONFIDENCE = 0.66
LOCAL_MODEL_RECOGNITION_LOW_SIGNAL_OVERRIDE_CONFIDENCE = 0.80
RECOGNITION_FALLBACK_MIN_CONFIDENCE = 0.72
LOW_SIGNAL_DEFAULT_RULE_IDS: Set[str] = {"note-blue-text"}

# ── Intent detection patterns ─────────────────────────────

ADD_INTENT_PATTERN = re.compile(
    r"\b(add|install|insert|provide|new)\b", re.IGNORECASE
)
DELETE_INTENT_PATTERN = re.compile(
    r"\b(delete|remove|demolish|omit)\b", re.IGNORECASE
)
NOTE_INTENT_PATTERN = re.compile(
    r"\b(note|review|verify|confirm|check|coord(?:inate)?|see\s+dwg)\b",
    re.IGNORECASE,
)
SEE_DWG_REFERENCE_PATTERN = re.compile(r"\bsee\s+dwg\b", re.IGNORECASE)
TITLE_BLOCK_TEXT_PATTERN = re.compile(
    r"\b(revision|rev(?:ision)?|drawing\s+no|dwg\s+no|sheet\s+no|title|scale|date|checked|approved)\b",
    re.IGNORECASE,
)
DIMENSION_ONLY_PATTERN = re.compile(
    r"^\s*[-+]?\d+(?:\.\d+)?(?:['\"]|mm|cm|m|in|ft)?\s*$",
    re.IGNORECASE,
)

# ── PDF color parsing patterns ────────────────────────────

PDF_DA_RGB_PATTERN = re.compile(
    r"([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+rg\b",
    re.IGNORECASE,
)
PDF_DA_GRAY_PATTERN = re.compile(r"([-+]?\d*\.?\d+)\s+g\b", re.IGNORECASE)
PDF_DA_CMYK_PATTERN = re.compile(
    r"([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+k\b",
    re.IGNORECASE,
)
CSS_HEX_COLOR_PATTERN = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
CSS_RGB_COLOR_PATTERN = re.compile(
    r"rgb\(\s*([0-9]{1,3}%?)\s*,\s*([0-9]{1,3}%?)\s*,\s*([0-9]{1,3}%?)\s*\)",
    re.IGNORECASE,
)

# ── HTML parsing patterns ─────────────────────────────────

HTML_BREAK_PATTERN = re.compile(
    r"<\s*(?:br|/p|/div|/li|/tr|/td|/h[1-6])\b[^>]*>",
    re.IGNORECASE,
)
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

# ── Annotation subtypes ──────────────────────────────────

ANNOT_TEXT_SUBTYPES: Set[str] = {"/Text", "/FreeText", "/Highlight", "/Underline", "/StrikeOut"}
ANNOT_NOTE_TEXT_SUBTYPES: Set[str] = {"/Text", "/FreeText"}
ANNOT_HIGHLIGHT_SUBTYPES: Set[str] = {"/Highlight", "/Underline", "/StrikeOut"}
ANNOT_LINE_SUBTYPES: Set[str] = {"/Line"}
ANNOT_RECTANGLE_SUBTYPES: Set[str] = {"/Square", "/Circle"}
ANNOT_GEOMETRIC_SUBTYPES: Set[str] = {"/Polygon", "/PolyLine", "/Ink"}
ANNOT_CLOUD_SUBTYPES: Set[str] = {*ANNOT_RECTANGLE_SUBTYPES, *ANNOT_GEOMETRIC_SUBTYPES}
ANNOT_NOTE_ANCHOR_SUBTYPES: Set[str] = {*ANNOT_RECTANGLE_SUBTYPES, *ANNOT_GEOMETRIC_SUBTYPES, "/Line"}

GENERIC_SUBJECT_VALUES: Set[str] = {
    "text", "text box", "textbox", "rectangle", "square",
    "circle", "polygon", "polyline", "line", "highlight", "markup",
}

ANNOT_CLOUD_HINT_PATTERN = re.compile(r"\b(cloud|revision cloud|delta)\b", re.IGNORECASE)
ANNOT_ARROW_HINT_PATTERN = re.compile(r"\b(arrow|leader|callout|pointer)\b", re.IGNORECASE)
ANNOT_RECTANGLE_HINT_PATTERN = re.compile(r"\b(rectangle|square|box|circle|detail)\b", re.IGNORECASE)
ANNOT_CALLOUT_HINT_PATTERN = re.compile(r"\b(callout|leader|note)\b", re.IGNORECASE)
TITLE_BLOCK_SUBJECT_HINT_PATTERN = re.compile(r"\b(title|revision|sheet|drawing|dwg)\b", re.IGNORECASE)

ARROW_LINE_ENDING_TOKENS: Set[str] = {
    "openarrow", "closedarrow", "ropenarrow", "rclosedarrow", "butt", "slash",
}

# ── Backcheck statuses ────────────────────────────────────

BACKCHECK_PASS = "pass"
BACKCHECK_WARN = "warn"
BACKCHECK_FAIL = "fail"

# ── Compare engine / tolerance / calibration ──────────────

COMPARE_ENGINE_AUTO = "auto"
COMPARE_ENGINE_PYTHON = "python"
COMPARE_ENGINE_DOTNET = "dotnet"
COMPARE_SUPPORTED_ENGINES: Set[str] = {COMPARE_ENGINE_AUTO, COMPARE_ENGINE_PYTHON, COMPARE_ENGINE_DOTNET}

COMPARE_CALIBRATION_MODE_AUTO = "auto"
COMPARE_CALIBRATION_MODE_MANUAL = "manual"
COMPARE_CALIBRATION_MODES: Set[str] = {COMPARE_CALIBRATION_MODE_AUTO, COMPARE_CALIBRATION_MODE_MANUAL}

COMPARE_AGENT_REVIEW_MODE_OFF = "off"
COMPARE_AGENT_REVIEW_MODE_PRE = "pre"
COMPARE_AGENT_REVIEW_MODES: Set[str] = {COMPARE_AGENT_REVIEW_MODE_OFF, COMPARE_AGENT_REVIEW_MODE_PRE}

COMPARE_TOLERANCE_PROFILE_STRICT = "strict"
COMPARE_TOLERANCE_PROFILE_MEDIUM = "medium"
COMPARE_TOLERANCE_PROFILE_LOOSE = "loose"
COMPARE_TOLERANCE_PROFILES: Set[str] = {
    COMPARE_TOLERANCE_PROFILE_STRICT,
    COMPARE_TOLERANCE_PROFILE_MEDIUM,
    COMPARE_TOLERANCE_PROFILE_LOOSE,
}

AUTO_CALIBRATION_READY_MIN_CONFIDENCE = 0.56
AUTO_CALIBRATION_READY_MIN_MATCH_RATIO = 0.45

# ── Replacement scoring ──────────────────────────────────

REPLACEMENT_STATUS_RESOLVED = "resolved"
REPLACEMENT_STATUS_AMBIGUOUS = "ambiguous"
REPLACEMENT_STATUS_UNRESOLVED = "unresolved"
REPLACEMENT_WARN_STATUSES: Set[str] = {REPLACEMENT_STATUS_AMBIGUOUS, REPLACEMENT_STATUS_UNRESOLVED}
REPLACEMENT_REVIEW_ACTIONS: Set[str] = {"approved", "corrected", "unresolved"}
REPLACEMENT_MAX_CANDIDATES = 5
REPLACEMENT_TUNING_DEFAULT: Dict[str, float] = {
    "unresolved_confidence_threshold": 0.36,
    "ambiguity_margin_threshold": 0.08,
    "search_radius_multiplier": 2.5,
    "min_search_radius": 24.0,
}
REPLACEMENT_MODEL_MIN_CONFIDENCE = 0.58
REPLACEMENT_MODEL_MAX_BOOST = 0.14
REPLACEMENT_MODEL_MAX_PENALTY = 0.12

# ── Agent pre-review ─────────────────────────────────────

SHADOW_ADVISOR_PROFILE = "draftsmith"
SHADOW_ADVISOR_MAX_CASES = 20
AGENT_PRE_REVIEW_MAX_BOOST = 0.12
AGENT_PRE_REVIEW_MAX_CANDIDATE_BOOSTS_PER_ACTION = 5
AGENT_PRE_REVIEW_DEFAULT_PROFILE = "draftsmith"
AGENT_PRE_REVIEW_DEFAULT_TIMEOUT_MS = 30000
AGENT_PRE_REVIEW_DEFAULT_MAX_CASES = 20

# ── Text extraction ──────────────────────────────────────

PREPARE_TEXT_FALLBACK_MAX_MARKUPS = 32
