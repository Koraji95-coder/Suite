"""Pure normalizer/helper functions extracted from api_autodraft.py.

No Flask, SQLite, or external service dependencies. Safe to import anywhere.

Migration: replace `from . import _normalize_text` etc. in api_autodraft.py
with `from .normalizers import normalize_text` etc. (drop underscore prefix
since these are now public module-level functions).
"""
from __future__ import annotations

import html
import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from .constants import (
    GENERIC_SUBJECT_VALUES,
    HTML_BREAK_PATTERN,
    HTML_TAG_PATTERN,
    COMPARE_SUPPORTED_ENGINES,
    COMPARE_ENGINE_AUTO,
    COMPARE_TOLERANCE_PROFILES,
    COMPARE_TOLERANCE_PROFILE_MEDIUM,
    COMPARE_CALIBRATION_MODES,
    COMPARE_CALIBRATION_MODE_AUTO,
    COMPARE_AGENT_REVIEW_MODES,
    COMPARE_AGENT_REVIEW_MODE_PRE,
    REPLACEMENT_TUNING_DEFAULT,
)


# ── Text normalization ────────────────────────────────────


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_display_text(value: Any, max_length: int = 500) -> Optional[str]:
    if value is None:
        return None
    try:
        text = str(value)
    except Exception:
        return None
    if not text:
        return None
    text = html.unescape(text)
    text = HTML_BREAK_PATTERN.sub(" ", text)
    text = HTML_TAG_PATTERN.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    if len(text) > max_length:
        return f"{text[: max_length - 3].rstrip()}..."
    return text


# ── Numeric helpers ───────────────────────────────────────


def safe_float(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def clamp_value(value: float, *, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


# ── Bounds helpers ────────────────────────────────────────


def normalize_bounds(value: Any) -> Optional[Dict[str, float]]:
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


def bounds_center_payload(bounds: Dict[str, float]) -> Dict[str, float]:
    x = float(bounds.get("x") or 0.0)
    y = float(bounds.get("y") or 0.0)
    width = float(bounds.get("width") or 0.0)
    height = float(bounds.get("height") or 0.0)
    return {"x": x + width / 2, "y": y + height / 2}


# ── Boolean normalization ─────────────────────────────────


def normalize_boolean(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


# ── Compare config normalization ──────────────────────────


def normalize_compare_engine(value: Any) -> str:
    normalized = normalize_text(value)
    return normalized if normalized in COMPARE_SUPPORTED_ENGINES else COMPARE_ENGINE_AUTO


def normalize_tolerance_profile(value: Any) -> str:
    normalized = normalize_text(value)
    return normalized if normalized in COMPARE_TOLERANCE_PROFILES else COMPARE_TOLERANCE_PROFILE_MEDIUM


def normalize_calibration_mode(value: Any) -> str:
    normalized = normalize_text(value)
    return normalized if normalized in COMPARE_CALIBRATION_MODES else COMPARE_CALIBRATION_MODE_AUTO


def normalize_agent_review_mode(value: Any) -> str:
    normalized = normalize_text(value)
    return normalized if normalized in COMPARE_AGENT_REVIEW_MODES else COMPARE_AGENT_REVIEW_MODE_PRE


def normalize_compare_roi(value: Any) -> Optional[Dict[str, float]]:
    return normalize_bounds(value)


def normalize_replacement_tuning(value: Any) -> Dict[str, float]:
    defaults = dict(REPLACEMENT_TUNING_DEFAULT)
    if not isinstance(value, dict):
        return defaults
    for key in defaults:
        raw = value.get(key)
        parsed = safe_float(raw)
        if parsed is not None:
            defaults[key] = parsed
    return defaults


def normalize_point_pair_list(
    value: Any,
) -> Optional[List[Dict[str, float]]]:
    if not isinstance(value, list):
        return None
    if len(value) != 2:
        return None
    parsed: List[Dict[str, float]] = []
    for entry in value:
        if not isinstance(entry, dict):
            return None
        x = safe_float(entry.get("x"))
        y = safe_float(entry.get("y"))
        if x is None or y is None:
            return None
        parsed.append({"x": x, "y": y})
    return parsed


# ── Semantic text extraction ──────────────────────────────


def extract_annotation_text_candidates(
    annotation: Any,
) -> List[Tuple[str, str]]:
    if not hasattr(annotation, "get"):
        return []
    candidates: List[Tuple[str, str]] = []
    seen: Set[str] = set()
    for source, key in (
        ("contents", "/Contents"),
        ("richtext", "/RC"),
        ("overlay_text", "/OverlayText"),
    ):
        text = normalize_display_text(annotation.get(key))
        if not text:
            continue
        normalized = normalize_text(text)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        candidates.append((source, text))

    subject_text = normalize_display_text(annotation.get("/Subj"))
    subject_normalized = normalize_text(subject_text)
    if (
        subject_text
        and subject_normalized
        and subject_normalized not in seen
        and subject_normalized not in GENERIC_SUBJECT_VALUES
    ):
        candidates.append(("subject", subject_text))
    return candidates


def collect_markup_semantic_text(markup: Dict[str, Any]) -> str:
    values: List[str] = []
    seen: Set[str] = set()
    meta = markup.get("meta") if isinstance(markup.get("meta"), dict) else {}
    for value in (
        markup.get("text"),
        meta.get("subject") if isinstance(meta, dict) else None,
        meta.get("intent") if isinstance(meta, dict) else None,
        meta.get("overlay_text") if isinstance(meta, dict) else None,
    ):
        normalized = normalize_display_text(value, max_length=800)
        token = normalize_text(normalized)
        if not normalized or not token or token in seen:
            continue
        seen.add(token)
        values.append(normalized)
    return " ".join(values).strip()


# ── Spatial helpers ───────────────────────────────────────


def infer_page_position_zone(
    bounds: Dict[str, float],
    *,
    page_width: float,
    page_height: float,
) -> str:
    if page_width <= 0 or page_height <= 0:
        return "unknown"
    center = bounds_center_payload(bounds)
    x_ratio = clamp_value(float(center["x"]) / page_width, minimum=0.0, maximum=1.0)
    y_ratio = clamp_value(float(center["y"]) / page_height, minimum=0.0, maximum=1.0)
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


def infer_bounds_aspect(bounds: Dict[str, float]) -> str:
    width = safe_float(bounds.get("width"))
    height = safe_float(bounds.get("height"))
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


# ── Utility ───────────────────────────────────────────────


def append_unique_note(collection: List[str], value: str) -> None:
    trimmed = str(value or "").strip()
    if trimmed and trimmed not in collection:
        collection.append(trimmed)
