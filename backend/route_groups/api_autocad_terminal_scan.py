from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

TERMINAL_TAG_KEYS = (
    "STRIP_ID",
    "STRIP",
    "TERMINAL_STRIP",
    "TB_ID",
    "TS_ID",
    "STRIP_NO",
    "STRIP_NUM",
    "TERMINAL_COUNT",
    "TERMINALS",
    "TERM_COUNT",
    "PANEL",
    "PANEL_ID",
    "PANEL_NAME",
    "SIDE",
    "PANEL_SIDE",
    "SECTION",
)

PANEL_ID_KEYS = (
    "PANEL_ID",
    "PANEL",
    "PANEL_NAME",
    "CABINET",
    "BOARD",
    "RELAY_PANEL",
)

PANEL_NAME_KEYS = (
    "PANEL_NAME",
    "PANEL_DESC",
    "DESCRIPTION",
    "CABINET_NAME",
    "BOARD_NAME",
)

SIDE_KEYS = ("SIDE", "PANEL_SIDE", "SECTION", "LR")

STRIP_ID_KEYS = (
    "STRIP_ID",
    "STRIP",
    "TERMINAL_STRIP",
    "TB_ID",
    "TS_ID",
    "TERMINAL_BLOCK",
)

STRIP_NUMBER_KEYS = (
    "STRIP_NO",
    "STRIP_NUM",
    "STRIP_NUMBER",
    "NUMBER",
    "NO",
)

TERMINAL_COUNT_KEYS = (
    "TERMINAL_COUNT",
    "TERMINALS",
    "TERM_COUNT",
    "WAYS",
    "POINT_COUNT",
)

TERMINAL_NAME_TOKENS = (
    "TERMINAL",
    "TERMS",
    "TB",
    "TS",
    "MARSHALLING",
)

TERMINAL_LABEL_TAG_PATTERN = re.compile(r"^TERM[_-]?0*(\d+)[_-]?LABEL$")

JUMPER_NAME_TOKENS = (
    "JUMPER",
    "JMP",
)

JUMPER_ID_KEYS = (
    "JUMPER_ID",
    "JUMPER",
    "JMP_ID",
    "JMP_REF",
    "JMP",
)

JUMPER_PANEL_ID_KEYS = (
    "PANEL_ID",
    "PANEL",
)

JUMPER_FROM_STRIP_KEYS = (
    "FROM_STRIP_ID",
    "FROM_STRIP",
    "FROM_TB",
    "FROM_TB_ID",
    "STRIP_ID_FROM",
)

JUMPER_TO_STRIP_KEYS = (
    "TO_STRIP_ID",
    "TO_STRIP",
    "TO_TB",
    "TO_TB_ID",
    "STRIP_ID_TO",
)

JUMPER_FROM_TERM_KEYS = (
    "FROM_TERM",
    "FROM_TERMINAL",
    "FROM_POS",
    "FROM_POSITION",
    "TERM_FROM",
    "FROM",
)

JUMPER_TO_TERM_KEYS = (
    "TO_TERM",
    "TO_TERMINAL",
    "TO_POS",
    "TO_POSITION",
    "TERM_TO",
    "TO",
)

PANEL_COLOR_PALETTE = (
    "#f59e0b",
    "#3b82f6",
    "#22c55e",
    "#ef4444",
    "#a855f7",
    "#14b8a6",
    "#f97316",
    "#84cc16",
)

INSUNITS_MAP = {
    0: "Unitless",
    1: "Inches",
    2: "Feet",
    3: "Miles",
    4: "Millimeters",
    5: "Centimeters",
    6: "Meters",
    7: "Kilometers",
}

DEFAULT_PANEL_PREFIX = "PANEL"
DEFAULT_TERMINAL_COUNT = 12
AFFINE2D_IDENTITY = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)


class TerminalScanValidationError(ValueError):
    """Typed terminal-scan input validation failure."""


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    try:
        text = str(value).strip()
    except (TypeError, ValueError):
        return ""
    return text


def _safe_upper(value: Any) -> str:
    return _safe_str(value).upper()


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _safe_bool(value: Any, *, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = _safe_upper(value)
    if text in {"1", "TRUE", "YES", "Y", "ON"}:
        return True
    if text in {"0", "FALSE", "NO", "N", "OFF"}:
        return False
    return fallback


def _normalize_tag_keys(raw_value: Any, *, fallback: Sequence[str]) -> tuple[str, ...]:
    if not isinstance(raw_value, list):
        return tuple(str(item).strip().upper() for item in fallback if str(item).strip())
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_value:
        key = _safe_upper(item)
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    if normalized:
        return tuple(normalized)
    return tuple(str(item).strip().upper() for item in fallback if str(item).strip())


def _normalize_name_tokens(raw_value: Any, *, fallback: Sequence[str]) -> tuple[str, ...]:
    if not isinstance(raw_value, list):
        return tuple(str(item).strip().upper() for item in fallback if str(item).strip())
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_value:
        token = _safe_upper(item)
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    if normalized:
        return tuple(normalized)
    return tuple(str(item).strip().upper() for item in fallback if str(item).strip())


def _resolve_terminal_profile(raw_profile: Any) -> Dict[str, Any]:
    profile = raw_profile if isinstance(raw_profile, dict) else {}

    default_panel_prefix = _safe_upper(
        profile.get("defaultPanelPrefix", profile.get("default_panel_prefix", DEFAULT_PANEL_PREFIX))
    )
    if not default_panel_prefix:
        default_panel_prefix = DEFAULT_PANEL_PREFIX

    default_terminal_count = _safe_int(
        profile.get(
            "defaultTerminalCount",
            profile.get("default_terminal_count", DEFAULT_TERMINAL_COUNT),
        )
    )
    if default_terminal_count is None or default_terminal_count <= 0:
        default_terminal_count = DEFAULT_TERMINAL_COUNT
    default_terminal_count = max(1, min(2000, default_terminal_count))

    return {
        "panelIdKeys": _normalize_tag_keys(profile.get("panelIdKeys"), fallback=PANEL_ID_KEYS),
        "panelNameKeys": _normalize_tag_keys(profile.get("panelNameKeys"), fallback=PANEL_NAME_KEYS),
        "sideKeys": _normalize_tag_keys(profile.get("sideKeys"), fallback=SIDE_KEYS),
        "stripIdKeys": _normalize_tag_keys(profile.get("stripIdKeys"), fallback=STRIP_ID_KEYS),
        "stripNumberKeys": _normalize_tag_keys(
            profile.get("stripNumberKeys"),
            fallback=STRIP_NUMBER_KEYS,
        ),
        "terminalCountKeys": _normalize_tag_keys(
            profile.get("terminalCountKeys"),
            fallback=TERMINAL_COUNT_KEYS,
        ),
        "terminalTagKeys": _normalize_tag_keys(
            profile.get("terminalTagKeys"),
            fallback=TERMINAL_TAG_KEYS,
        ),
        "terminalNameTokens": _normalize_name_tokens(
            profile.get("terminalNameTokens"),
            fallback=TERMINAL_NAME_TOKENS,
        ),
        "blockNameAllowList": _normalize_name_tokens(
            profile.get("blockNameAllowList", profile.get("block_name_allow_list")),
            fallback=(),
        ),
        "requireStripId": _safe_bool(
            profile.get("requireStripId", profile.get("require_strip_id")),
            fallback=False,
        ),
        "requireTerminalCount": _safe_bool(
            profile.get("requireTerminalCount", profile.get("require_terminal_count")),
            fallback=False,
        ),
        "requireSide": _safe_bool(
            profile.get("requireSide", profile.get("require_side")),
            fallback=False,
        ),
        "defaultPanelPrefix": default_panel_prefix,
        "defaultTerminalCount": default_terminal_count,
    }


def _terminal_profile_summary(profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "defaultPanelPrefix": str(profile.get("defaultPanelPrefix") or DEFAULT_PANEL_PREFIX),
        "defaultTerminalCount": int(profile.get("defaultTerminalCount") or DEFAULT_TERMINAL_COUNT),
        "panelIdKeys": list(profile.get("panelIdKeys") or []),
        "panelNameKeys": list(profile.get("panelNameKeys") or []),
        "sideKeys": list(profile.get("sideKeys") or []),
        "stripIdKeys": list(profile.get("stripIdKeys") or []),
        "stripNumberKeys": list(profile.get("stripNumberKeys") or []),
        "terminalCountKeys": list(profile.get("terminalCountKeys") or []),
        "terminalTagKeys": list(profile.get("terminalTagKeys") or []),
        "terminalNameTokens": list(profile.get("terminalNameTokens") or []),
        "blockNameAllowList": list(profile.get("blockNameAllowList") or []),
        "requireStripId": bool(profile.get("requireStripId")),
        "requireTerminalCount": bool(profile.get("requireTerminalCount")),
        "requireSide": bool(profile.get("requireSide")),
    }


def _first_attr(attrs: Dict[str, str], keys: Sequence[str]) -> str:
    for key in keys:
        value = attrs.get(key, "")
        if value:
            return value
    return ""


def _iter_attribute_objects(raw: Any, dyn_fn: Any) -> Iterable[Any]:
    if raw is None:
        return []
    try:
        for item in raw:
            yield dyn_fn(item)
        return
    except Exception:
        pass

    try:
        count = int(raw.Count)
    except Exception:
        return []

    for index in range(count):
        try:
            yield dyn_fn(raw.Item(index))
        except Exception:
            continue


def _attributes_for_entity(entity: Any, dyn_fn: Any) -> Dict[str, str]:
    attrs: Dict[str, str] = {}
    try:
        raw_attrs = entity.GetAttributes()
    except Exception:
        return attrs

    for attr in _iter_attribute_objects(raw_attrs, dyn_fn):
        try:
            tag = _safe_upper(getattr(attr, "TagString", ""))
            text = _safe_str(getattr(attr, "TextString", ""))
        except Exception:
            continue
        if tag and text:
            attrs[tag] = text

    return attrs


def _extract_insertion_point(entity: Any) -> Optional[Tuple[float, float]]:
    try:
        point = getattr(entity, "InsertionPoint")
    except Exception:
        return None

    if isinstance(point, (list, tuple)) and len(point) >= 2:
        x = _safe_float(point[0])
        y = _safe_float(point[1])
        if x is None or y is None:
            return None
        return (x, y)

    return None


def _to_point2(raw: Any) -> Optional[Tuple[float, float]]:
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        return None
    x = _safe_float(raw[0])
    y = _safe_float(raw[1])
    if x is None or y is None:
        return None
    if not math.isfinite(x) or not math.isfinite(y):
        return None
    return (x, y)


def _block_insert_transform(
    entity: Any,
    *,
    fallback_insertion: Optional[Tuple[float, float]] = None,
) -> Tuple[float, float, float, float, float, float]:
    insertion = _extract_insertion_point(entity)
    if insertion is None:
        insertion = fallback_insertion or (0.0, 0.0)

    try:
        sx = _safe_float(getattr(entity, "XScaleFactor", 1.0))
    except Exception:
        sx = 1.0
    try:
        sy = _safe_float(getattr(entity, "YScaleFactor", 1.0))
    except Exception:
        sy = 1.0
    try:
        rotation = _safe_float(getattr(entity, "Rotation", 0.0))
    except Exception:
        rotation = 0.0

    sx = 1.0 if sx is None or abs(sx) <= 1e-9 else sx
    sy = 1.0 if sy is None or abs(sy) <= 1e-9 else sy
    rotation = 0.0 if rotation is None else rotation

    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)
    return (
        cos_r * sx,
        -sin_r * sy,
        insertion[0],
        sin_r * sx,
        cos_r * sy,
        insertion[1],
    )


def _compose_affine2d(
    parent: Tuple[float, float, float, float, float, float],
    child: Tuple[float, float, float, float, float, float],
) -> Tuple[float, float, float, float, float, float]:
    a00, a01, a02, a10, a11, a12 = parent
    b00, b01, b02, b10, b11, b12 = child
    return (
        a00 * b00 + a01 * b10,
        a00 * b01 + a01 * b11,
        a00 * b02 + a01 * b12 + a02,
        a10 * b00 + a11 * b10,
        a10 * b01 + a11 * b11,
        a10 * b02 + a11 * b12 + a12,
    )


def _apply_affine2d(
    transform: Tuple[float, float, float, float, float, float],
    point: Tuple[float, float],
) -> Tuple[float, float]:
    m00, m01, m02, m10, m11, m12 = transform
    x, y = point
    return (m00 * x + m01 * y + m02, m10 * x + m11 * y + m12)


def _iter_collection_items(collection: Any, dyn_fn: Any) -> Iterable[Any]:
    if collection is None:
        return []
    try:
        count = int(collection.Count)
    except Exception:
        return []

    for index in range(count):
        try:
            yield dyn_fn(collection.Item(index))
        except Exception:
            continue


def _extract_polyline_points(entity: Any, object_name: str) -> List[Tuple[float, float]]:
    points: List[Tuple[float, float]] = []

    try:
        raw_coords = list(getattr(entity, "Coordinates"))
    except Exception:
        raw_coords = []

    if raw_coords:
        stride = 3 if "3DPOLYLINE" in object_name else 2
        if stride == 2 and len(raw_coords) % 2 != 0 and len(raw_coords) % 3 == 0:
            stride = 3

        for index in range(0, len(raw_coords), stride):
            if index + 1 >= len(raw_coords):
                break
            x = _safe_float(raw_coords[index])
            y = _safe_float(raw_coords[index + 1])
            if x is None or y is None:
                continue
            if not math.isfinite(x) or not math.isfinite(y):
                continue
            points.append((x, y))

        if len(points) >= 2:
            return points

    try:
        vertex_count = int(getattr(entity, "NumberOfVertices"))
    except Exception:
        return points

    for index in range(vertex_count):
        try:
            vertex = getattr(entity, "Coordinate")(index)
        except Exception:
            continue
        parsed = _to_point2(vertex)
        if parsed is None:
            continue
        points.append(parsed)

    return points


def _polyline_closed(entity: Any) -> bool:
    try:
        raw_closed = getattr(entity, "Closed")
    except Exception:
        return False

    if isinstance(raw_closed, bool):
        return raw_closed
    if isinstance(raw_closed, (int, float)):
        return bool(raw_closed)
    return _safe_upper(raw_closed) in {"1", "TRUE", "YES", "Y", "ON"}


def _transform_geometry_primitives(
    primitives: Sequence[Dict[str, Any]],
    transform: Tuple[float, float, float, float, float, float],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for primitive in primitives:
        raw_points = primitive.get("points")
        if not isinstance(raw_points, list):
            continue

        transformed_points: List[Tuple[float, float]] = []
        for raw_point in raw_points:
            if not isinstance(raw_point, tuple) or len(raw_point) < 2:
                continue
            x = _safe_float(raw_point[0])
            y = _safe_float(raw_point[1])
            if x is None or y is None:
                continue
            world_x, world_y = _apply_affine2d(transform, (x, y))
            if not math.isfinite(world_x) or not math.isfinite(world_y):
                continue
            transformed_points.append((world_x, world_y))

        if len(transformed_points) < 2:
            continue

        payload: Dict[str, Any] = {
            "kind": "polyline"
            if _safe_upper(primitive.get("kind")) == "POLYLINE"
            else "line",
            "points": transformed_points,
        }
        if payload["kind"] == "polyline" and bool(primitive.get("closed")):
            payload["closed"] = True
        out.append(payload)
    return out


def _serialize_geometry_primitives(primitives: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    serialized: List[Dict[str, Any]] = []
    for primitive in primitives:
        raw_points = primitive.get("points")
        if not isinstance(raw_points, list):
            continue

        points_payload: List[Dict[str, float]] = []
        for raw_point in raw_points:
            if not isinstance(raw_point, tuple) or len(raw_point) < 2:
                continue
            x = _safe_float(raw_point[0])
            y = _safe_float(raw_point[1])
            if x is None or y is None:
                continue
            if not math.isfinite(x) or not math.isfinite(y):
                continue
            points_payload.append({"x": round(float(x), 6), "y": round(float(y), 6)})

        if len(points_payload) < 2:
            continue

        kind = (
            "polyline"
            if _safe_upper(primitive.get("kind")) == "POLYLINE"
            else "line"
        )
        payload: Dict[str, Any] = {"kind": kind, "points": points_payload}
        if kind == "polyline" and bool(primitive.get("closed")):
            payload["closed"] = True
        serialized.append(payload)

    return serialized


def _collect_block_definition_geometry(
    *,
    doc: Any,
    block_name: str,
    dyn_fn: Any,
    cache: Dict[str, List[Dict[str, Any]]],
    active_stack: set[str],
) -> List[Dict[str, Any]]:
    key = _safe_upper(block_name)
    if not key:
        return []
    if key in cache:
        return cache[key]
    if key in active_stack:
        return []

    active_stack.add(key)
    primitives: List[Dict[str, Any]] = []
    try:
        try:
            blocks = dyn_fn(getattr(doc, "Blocks"))
        except Exception:
            cache[key] = []
            return []

        block_def = None
        for candidate_name in (block_name, key):
            if not candidate_name:
                continue
            try:
                block_def = dyn_fn(blocks.Item(candidate_name))
                break
            except Exception:
                continue

        if block_def is None:
            cache[key] = []
            return []

        for child_entity in _iter_collection_items(block_def, dyn_fn):
            object_name = _safe_upper(getattr(child_entity, "ObjectName", ""))
            if not object_name:
                continue

            if "BLOCKREFERENCE" in object_name:
                nested_name = _block_name_for_entity(child_entity, dyn_fn)
                if not nested_name:
                    continue
                nested_primitives = _collect_block_definition_geometry(
                    doc=doc,
                    block_name=nested_name,
                    dyn_fn=dyn_fn,
                    cache=cache,
                    active_stack=active_stack,
                )
                if not nested_primitives:
                    continue
                nested_transform = _block_insert_transform(child_entity)
                primitives.extend(
                    _transform_geometry_primitives(nested_primitives, nested_transform)
                )
                continue

            if "POLYLINE" in object_name:
                points = _extract_polyline_points(child_entity, object_name)
                if len(points) < 2:
                    continue
                primitive: Dict[str, Any] = {
                    "kind": "polyline",
                    "points": points,
                }
                if _polyline_closed(child_entity):
                    primitive["closed"] = True
                primitives.append(primitive)
                continue

            if object_name == "ACDBLINE":
                start_point = _to_point2(getattr(child_entity, "StartPoint", None))
                end_point = _to_point2(getattr(child_entity, "EndPoint", None))
                if start_point is None or end_point is None:
                    continue
                primitives.append(
                    {
                        "kind": "line",
                        "points": [start_point, end_point],
                    }
                )
                continue

        cache[key] = primitives
        return primitives
    finally:
        active_stack.discard(key)


def _extract_terminal_geometry(
    *,
    entity: Any,
    doc: Any,
    block_name: str,
    dyn_fn: Any,
    cache: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    if not block_name:
        return []

    insertion = _extract_insertion_point(entity) or (0.0, 0.0)
    transform = _compose_affine2d(
        AFFINE2D_IDENTITY,
        _block_insert_transform(entity, fallback_insertion=insertion),
    )
    local_primitives = _collect_block_definition_geometry(
        doc=doc,
        block_name=block_name,
        dyn_fn=dyn_fn,
        cache=cache,
        active_stack=set(),
    )
    if not local_primitives:
        return []

    world_primitives = _transform_geometry_primitives(local_primitives, transform)
    return _serialize_geometry_primitives(world_primitives)


def _normalize_side(raw_side: str) -> str:
    text = _safe_upper(raw_side)
    if not text:
        return "C"
    if text in {"LEFT", "L", "A"}:
        return "L"
    if text in {"RIGHT", "R", "B"}:
        return "R"
    if text in {"CENTER", "CENTRE", "C", "MID"}:
        return "C"
    if text.startswith("L"):
        return "L"
    if text.startswith("R"):
        return "R"
    return "C"


def _panel_color(panel_id: str) -> str:
    if not panel_id:
        return PANEL_COLOR_PALETTE[0]
    checksum = sum(ord(char) for char in panel_id.upper())
    return PANEL_COLOR_PALETTE[checksum % len(PANEL_COLOR_PALETTE)]


def _derive_panel_from_strip_id(strip_id: str) -> str:
    text = _safe_upper(strip_id)
    if not text:
        return ""
    match = re.match(r"^([A-Z]+[0-9]+)", text)
    return match.group(1) if match else ""


def _derive_side_from_strip_id(strip_id: str) -> str:
    text = _safe_upper(strip_id)
    if not text:
        return "C"
    match = re.search(r"([LRC])[0-9]*$", text)
    if match:
        return _normalize_side(match.group(1))
    return "C"


def _extract_int_from_text(text: str) -> Optional[int]:
    if not text:
        return None
    match = re.search(r"(\d+)", text)
    if not match:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _strip_number(strip_id: str, attrs: Dict[str, str], strip_number_keys: Sequence[str]) -> int:
    for key in strip_number_keys:
        value = attrs.get(key, "")
        parsed = _extract_int_from_text(value)
        if parsed is not None:
            return parsed

    # Common strip-id shape is PANEL+SIDE+NUMBER (e.g., RP1L6, JB2R12).
    # Prefer the terminal-side suffix number over earlier panel digits.
    text = _safe_upper(strip_id)
    suffix_match = re.search(r"[LRC](\d+)$", text)
    if suffix_match:
        try:
            return int(suffix_match.group(1))
        except (TypeError, ValueError):
            pass

    trailing_match = re.search(r"(\d+)$", text)
    if trailing_match:
        try:
            return int(trailing_match.group(1))
        except (TypeError, ValueError):
            pass

    parsed = _extract_int_from_text(text)
    return parsed if parsed is not None else 1


def _next_unique_strip_id(strip_id: str, seen_strip_ids: set[str]) -> str:
    """Prefer side-index increment (RP1L1 -> RP1L2) before suffix fallback."""
    normalized = _safe_upper(strip_id)
    if not normalized:
        normalized = "STRIP"

    side_suffix_match = re.match(r"^(.*?)([LRC])(\d+)$", normalized)
    if side_suffix_match:
        prefix = _safe_upper(side_suffix_match.group(1))
        side = _safe_upper(side_suffix_match.group(2))
        try:
            number = int(side_suffix_match.group(3))
        except (TypeError, ValueError):
            number = 1

        candidate = normalized
        next_number = max(1, number)
        while candidate in seen_strip_ids:
            next_number += 1
            candidate = f"{prefix}{side}{next_number}"
        return candidate

    suffix = 2
    candidate = f"{normalized}_{suffix}"
    while candidate in seen_strip_ids:
        suffix += 1
        candidate = f"{normalized}_{suffix}"
    return candidate


def _terminal_count(
    attrs: Dict[str, str],
    terminal_count_keys: Sequence[str],
    default_terminal_count: int,
) -> int:
    for key in terminal_count_keys:
        value = attrs.get(key, "")
        parsed = _extract_int_from_text(value)
        if parsed is not None and parsed > 0:
            return min(parsed, 2000)

    inferred = 0
    for key in attrs.keys():
        if re.fullmatch(r"(TERM|T)[_-]?[0-9]+", key):
            inferred += 1
    if inferred > 0:
        return min(inferred, 2000)

    return max(1, min(2000, int(default_terminal_count)))


def _terminal_labels(attrs: Dict[str, str], terminal_count: int) -> List[str]:
    labels_by_index: Dict[int, str] = {}
    for key, raw_value in attrs.items():
        match = TERMINAL_LABEL_TAG_PATTERN.fullmatch(_safe_upper(key))
        if not match:
            continue
        try:
            index = int(match.group(1))
        except (TypeError, ValueError):
            continue
        if index <= 0:
            continue
        label_text = _safe_str(raw_value)
        if not label_text:
            continue
        labels_by_index[index] = label_text

    count = max(1, int(terminal_count))
    return [labels_by_index.get(index, "") for index in range(1, count + 1)]


def _terminal_index_from_text(raw_value: str) -> Optional[int]:
    parsed = _extract_int_from_text(_safe_str(raw_value))
    if parsed is None or parsed <= 0:
        return None
    return min(parsed, 2000)


def _looks_like_jumper_block(block_name: str, attrs: Dict[str, str]) -> bool:
    name = _safe_upper(block_name)
    if any(token in name for token in JUMPER_NAME_TOKENS):
        return True

    has_from_strip = bool(_first_attr(attrs, JUMPER_FROM_STRIP_KEYS))
    has_to_strip = bool(_first_attr(attrs, JUMPER_TO_STRIP_KEYS))
    has_from_term = bool(_first_attr(attrs, JUMPER_FROM_TERM_KEYS))
    has_to_term = bool(_first_attr(attrs, JUMPER_TO_TERM_KEYS))
    return has_from_strip and has_to_strip and has_from_term and has_to_term


def _extract_jumper_record(
    *,
    attrs: Dict[str, str],
    block_name: str,
    handle: str,
    default_panel_prefix: str,
) -> Optional[Dict[str, Any]]:
    from_strip = _safe_upper(_first_attr(attrs, JUMPER_FROM_STRIP_KEYS))
    to_strip = _safe_upper(_first_attr(attrs, JUMPER_TO_STRIP_KEYS))
    from_terminal = _terminal_index_from_text(_first_attr(attrs, JUMPER_FROM_TERM_KEYS))
    to_terminal = _terminal_index_from_text(_first_attr(attrs, JUMPER_TO_TERM_KEYS))

    if not from_strip or not to_strip or from_terminal is None or to_terminal is None:
        return None

    panel_id = (
        _safe_upper(_first_attr(attrs, JUMPER_PANEL_ID_KEYS))
        or _derive_panel_from_strip_id(from_strip)
        or _derive_panel_from_strip_id(to_strip)
        or default_panel_prefix
    )
    jumper_id = _safe_str(_first_attr(attrs, JUMPER_ID_KEYS))
    if not jumper_id:
        jumper_id = f"JMP_{handle or from_strip + '_' + str(from_terminal)}"

    return {
        "jumper_id": jumper_id,
        "panel_id": panel_id,
        "from_strip_id": from_strip,
        "from_terminal": from_terminal,
        "to_strip_id": to_strip,
        "to_terminal": to_terminal,
        "source_block_name": _safe_str(block_name),
    }


def _geometry_vertical_bounds(geometry: Any) -> Optional[Tuple[float, float]]:
    if not isinstance(geometry, list) or not geometry:
        return None
    min_y = float("inf")
    max_y = float("-inf")
    found = False
    for primitive in geometry:
        if not isinstance(primitive, dict):
            continue
        points = primitive.get("points")
        if not isinstance(points, list):
            continue
        for point in points:
            if not isinstance(point, dict):
                continue
            y = _safe_float(point.get("y"))
            if y is None or not math.isfinite(y):
                continue
            found = True
            min_y = min(min_y, y)
            max_y = max(max_y, y)
    if not found:
        return None
    return (min_y, max_y)


def _strip_center(record: Dict[str, Any]) -> Tuple[float, float]:
    x = _safe_float(record.get("x"))
    y = _safe_float(record.get("y"))
    if x is None:
        x = 0.0
    if y is None:
        y = 0.0

    geometry_bounds = _geometry_vertical_bounds(record.get("geometry"))
    if geometry_bounds is None:
        return (x, y)

    min_y, max_y = geometry_bounds
    if not math.isfinite(min_y) or not math.isfinite(max_y):
        return (x, y)
    return (x, (min_y + max_y) / 2.0)


def _infer_terminal_index_from_y(record: Dict[str, Any], y_value: float) -> int:
    terminal_count = max(1, min(2000, int(record.get("terminal_count") or 1)))
    geometry_bounds = _geometry_vertical_bounds(record.get("geometry"))
    if geometry_bounds is not None:
        min_y, max_y = geometry_bounds
        span = max_y - min_y
        if span > 1e-6 and math.isfinite(span):
            normalized = (y_value - min_y) / span
            normalized = max(0.0, min(1.0, normalized))
            return max(1, min(terminal_count, int(round(normalized * (terminal_count - 1))) + 1))

    strip_y = _safe_float(record.get("y"))
    if strip_y is None or not math.isfinite(strip_y):
        return max(1, min(terminal_count, int(round(terminal_count / 2.0))))

    guessed = int(round(((y_value - strip_y) / 12.0) + 1.0))
    return max(1, min(terminal_count, guessed))


def _resolve_positional_jumper_record(
    *,
    candidate: Dict[str, Any],
    records: Sequence[Dict[str, Any]],
    default_panel_prefix: str,
) -> Optional[Dict[str, Any]]:
    x = _safe_float(candidate.get("x"))
    y = _safe_float(candidate.get("y"))
    if x is None or y is None or not math.isfinite(x) or not math.isfinite(y):
        return None
    if len(records) < 2:
        return None

    panel_hint = _safe_upper(candidate.get("panel_hint"))
    eligible_records = list(records)
    if panel_hint:
        filtered = [
            record
            for record in records
            if _safe_upper(record.get("panel_id")) == panel_hint
        ]
        if len(filtered) >= 2:
            eligible_records = filtered
    if len(eligible_records) < 2:
        return None

    def _distance_to_candidate(record: Dict[str, Any]) -> float:
        center_x, center_y = _strip_center(record)
        return math.hypot(center_x - x, center_y - y)

    first_strip = min(eligible_records, key=_distance_to_candidate)
    first_side = _normalize_side(_safe_str(first_strip.get("side")))
    first_panel = _safe_upper(first_strip.get("panel_id"))

    second_candidates = [
        record
        for record in eligible_records
        if _safe_upper(record.get("strip_id")) != _safe_upper(first_strip.get("strip_id"))
    ]
    if not second_candidates:
        return None

    def _second_score(record: Dict[str, Any]) -> float:
        score = _distance_to_candidate(record)
        panel_penalty = 0.0 if _safe_upper(record.get("panel_id")) == first_panel else 250.0
        side_penalty = 0.0 if _normalize_side(_safe_str(record.get("side"))) != first_side else 35.0
        return score + panel_penalty + side_penalty

    second_strip = min(second_candidates, key=_second_score)

    from_strip_id = _safe_upper(first_strip.get("strip_id"))
    to_strip_id = _safe_upper(second_strip.get("strip_id"))
    if not from_strip_id or not to_strip_id or from_strip_id == to_strip_id:
        return None

    panel_id = (
        panel_hint
        or _safe_upper(first_strip.get("panel_id"))
        or _safe_upper(second_strip.get("panel_id"))
        or _safe_upper(default_panel_prefix)
        or "PANEL"
    )
    jumper_id = _safe_str(candidate.get("jumper_id"))
    handle = _safe_str(candidate.get("handle"))
    if not jumper_id:
        jumper_id = f"JMP_{handle or from_strip_id + '_' + str(_infer_terminal_index_from_y(first_strip, y))}"

    return {
        "jumper_id": jumper_id,
        "panel_id": panel_id,
        "from_strip_id": from_strip_id,
        "from_terminal": _infer_terminal_index_from_y(first_strip, y),
        "to_strip_id": to_strip_id,
        "to_terminal": _infer_terminal_index_from_y(second_strip, y),
        "source_block_name": _safe_str(candidate.get("block_name")),
        "resolution": "position",
        "x": x,
        "y": y,
    }


def _is_terminal_block(
    block_name: str,
    attrs: Dict[str, str],
    *,
    terminal_tag_keys: Sequence[str],
    terminal_name_tokens: Sequence[str],
    block_name_allow_list: Sequence[str],
    strip_id_keys: Sequence[str],
    terminal_count_keys: Sequence[str],
    side_keys: Sequence[str],
    require_strip_id: bool,
    require_terminal_count: bool,
    require_side: bool,
) -> bool:
    name = _safe_upper(block_name)
    if not name and not attrs:
        return False

    if block_name_allow_list:
        normalized_allow = {_safe_upper(entry) for entry in block_name_allow_list if _safe_upper(entry)}
        if normalized_allow and name not in normalized_allow:
            return False

    if require_strip_id and not _first_attr(attrs, strip_id_keys):
        return False
    if require_terminal_count and not _first_attr(attrs, terminal_count_keys):
        return False
    if require_side and not _first_attr(attrs, side_keys):
        return False

    tokens = [token for token in re.split(r"[^A-Z0-9]+", name) if token]
    token_set = set(tokens)
    token_hints = {_safe_upper(token) for token in terminal_name_tokens if _safe_upper(token)}
    has_terminal_name = any(
        token in token_hints
        or token.startswith("TB")
        or token.startswith("TS")
        for token in token_set
    )
    if has_terminal_name:
        return True

    return any(key in attrs for key in terminal_tag_keys)


def _handle_for_entity(entity: Any) -> str:
    try:
        return _safe_upper(getattr(entity, "Handle", ""))
    except Exception:
        return ""


def _block_name_for_entity(entity: Any, dyn_fn: Any) -> str:
    for key in ("EffectiveName", "Name"):
        try:
            value = _safe_str(getattr(entity, key, ""))
            if value:
                return value
        except Exception:
            continue

    try:
        block_obj = dyn_fn(entity)
        value = _safe_str(getattr(block_obj, "EffectiveName", ""))
        if value:
            return value
        return _safe_str(getattr(block_obj, "Name", ""))
    except Exception:
        return ""


def _resolve_units(doc: Any) -> str:
    try:
        raw_units = doc.GetVariable("INSUNITS")
        parsed = _safe_int(raw_units)
        if parsed is None:
            return _safe_str(raw_units) or "Unknown"
        return INSUNITS_MAP.get(parsed, f"INSUNITS:{parsed}")
    except Exception:
        return "Unknown"


def _collect_selection_entities(doc: Any, dyn_fn: Any) -> List[Any]:
    entities: List[Any] = []
    seen_handles: set[str] = set()
    sources = []
    for key in ("PickfirstSelectionSet", "ActiveSelectionSet"):
        try:
            sources.append(dyn_fn(getattr(doc, key)))
        except Exception:
            continue

    for selection in sources:
        try:
            count = int(selection.Count)
        except Exception:
            continue
        for index in range(count):
            try:
                entity = dyn_fn(selection.Item(index))
            except Exception:
                continue
            handle = _handle_for_entity(entity)
            if handle and handle in seen_handles:
                continue
            if handle:
                seen_handles.add(handle)
            entities.append(entity)
    return entities


def _top_block_counts(block_counts: Dict[str, int], *, limit: int = 20) -> List[Dict[str, Any]]:
    ranked = sorted(
        (
            {"blockName": block_name, "count": count}
            for block_name, count in block_counts.items()
            if block_name
        ),
        key=lambda item: (-int(item["count"]), str(item["blockName"])),
    )
    return ranked[: max(1, int(limit))]


def scan_terminal_strips(
    *,
    doc: Any,
    modelspace: Any,
    dyn_fn: Any,
    include_modelspace: bool = True,
    selection_only: bool = False,
    max_entities: int = 50000,
    terminal_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    drawing_name = _safe_str(getattr(doc, "Name", "")) or "Unknown.dwg"
    units = _resolve_units(doc)
    profile = _resolve_terminal_profile(terminal_profile)

    records: List[Dict[str, Any]] = []
    jumpers: List[Dict[str, Any]] = []
    pending_positional_jumpers: List[Dict[str, Any]] = []
    geometry_cache: Dict[str, List[Dict[str, Any]]] = {}
    seen_strip_ids: set[str] = set()
    seen_jumper_signatures: set[str] = set()
    seen_entity_handles: set[str] = set()
    warnings: List[str] = []

    scanned_entities = 0
    scanned_block_refs = 0
    skipped_non_block_entities = 0
    skipped_non_terminal_blocks = 0
    skipped_missing_insertion_point_blocks = 0
    terminal_candidate_blocks = 0
    jumper_candidate_blocks = 0
    skipped_invalid_jumper_blocks = 0
    positional_jumper_candidates = 0
    resolved_positional_jumpers = 0
    total_labeled_terminals = 0
    total_geometry_primitives = 0
    scanned_block_name_counts: Dict[str, int] = {}

    selection_entities = _collect_selection_entities(doc, dyn_fn) if selection_only else []

    def _try_record_entity(entity: Any) -> None:
        nonlocal scanned_entities
        nonlocal scanned_block_refs
        nonlocal skipped_non_block_entities
        nonlocal skipped_non_terminal_blocks
        nonlocal skipped_missing_insertion_point_blocks
        nonlocal terminal_candidate_blocks
        nonlocal jumper_candidate_blocks
        nonlocal skipped_invalid_jumper_blocks
        nonlocal positional_jumper_candidates
        nonlocal resolved_positional_jumpers
        nonlocal total_labeled_terminals
        nonlocal total_geometry_primitives
        scanned_entities += 1
        handle = _handle_for_entity(entity)
        if handle and handle in seen_entity_handles:
            return
        if handle:
            seen_entity_handles.add(handle)

        object_name = _safe_upper(getattr(entity, "ObjectName", ""))
        if "BLOCKREFERENCE" not in object_name:
            skipped_non_block_entities += 1
            return
        scanned_block_refs += 1

        attrs = _attributes_for_entity(entity, dyn_fn)
        block_name = _block_name_for_entity(entity, dyn_fn)
        block_name_key = _safe_upper(block_name) or "<UNKNOWN>"
        scanned_block_name_counts[block_name_key] = (
            scanned_block_name_counts.get(block_name_key, 0) + 1
        )

        if _looks_like_jumper_block(block_name, attrs):
            jumper_candidate_blocks += 1
            jumper_record = _extract_jumper_record(
                attrs=attrs,
                block_name=block_name,
                handle=handle,
                default_panel_prefix=str(profile["defaultPanelPrefix"]),
            )
            if jumper_record is None:
                insertion = _extract_insertion_point(entity)
                if insertion is not None:
                    positional_jumper_candidates += 1
                    pending_positional_jumpers.append(
                        {
                            "x": insertion[0],
                            "y": insertion[1],
                            "panel_hint": _safe_upper(_first_attr(attrs, JUMPER_PANEL_ID_KEYS)),
                            "jumper_id": _safe_str(_first_attr(attrs, JUMPER_ID_KEYS)),
                            "handle": handle,
                            "block_name": _safe_str(block_name),
                        }
                    )
                    return
                skipped_invalid_jumper_blocks += 1
                warnings.append(
                    "Skipping jumper block "
                    f"{block_name or '<unknown>'} (missing FROM/TO attributes and insertion point)."
                )
                return

            signature = (
                f"{jumper_record['panel_id']}|{jumper_record['from_strip_id']}|"
                f"{jumper_record['from_terminal']}|{jumper_record['to_strip_id']}|"
                f"{jumper_record['to_terminal']}"
            )
            if signature in seen_jumper_signatures:
                return
            seen_jumper_signatures.add(signature)
            jumpers.append(jumper_record)
            return

        if not _is_terminal_block(
            block_name,
            attrs,
            terminal_tag_keys=profile["terminalTagKeys"],
            terminal_name_tokens=profile["terminalNameTokens"],
            block_name_allow_list=profile["blockNameAllowList"],
            strip_id_keys=profile["stripIdKeys"],
            terminal_count_keys=profile["terminalCountKeys"],
            side_keys=profile["sideKeys"],
            require_strip_id=bool(profile.get("requireStripId")),
            require_terminal_count=bool(profile.get("requireTerminalCount")),
            require_side=bool(profile.get("requireSide")),
        ):
            skipped_non_terminal_blocks += 1
            return
        terminal_candidate_blocks += 1

        insertion = _extract_insertion_point(entity)
        if insertion is None:
            skipped_missing_insertion_point_blocks += 1
            warnings.append(
                f"Skipping block {block_name or '<unknown>'} (missing insertion point)."
            )
            return

        strip_id_raw = _first_attr(attrs, profile["stripIdKeys"])
        strip_id = _safe_upper(strip_id_raw) or _safe_upper(block_name) or f"STRIP_{handle or scanned_block_refs}"

        if strip_id in seen_strip_ids:
            strip_id = _next_unique_strip_id(strip_id, seen_strip_ids)
        seen_strip_ids.add(strip_id)

        panel_id_raw = _first_attr(attrs, profile["panelIdKeys"])
        panel_id = (
            _safe_upper(panel_id_raw)
            or _derive_panel_from_strip_id(strip_id)
            or str(profile["defaultPanelPrefix"])
        )
        panel_name = _first_attr(attrs, profile["panelNameKeys"]) or panel_id
        side_raw = _first_attr(attrs, profile["sideKeys"]) or _derive_side_from_strip_id(strip_id)
        side = _normalize_side(side_raw)

        terminal_count = _terminal_count(
            attrs,
            profile["terminalCountKeys"],
            int(profile["defaultTerminalCount"]),
        )
        terminal_labels = _terminal_labels(attrs, terminal_count)
        total_labeled_terminals += sum(1 for label in terminal_labels if label)
        geometry = _extract_terminal_geometry(
            entity=entity,
            doc=doc,
            block_name=block_name,
            dyn_fn=dyn_fn,
            cache=geometry_cache,
        )
        total_geometry_primitives += len(geometry)

        record = {
            "panel_id": panel_id,
            "panel_name": panel_name,
            "side": side,
            "strip_id": strip_id,
            "strip_number": _strip_number(strip_id, attrs, profile["stripNumberKeys"]),
            "terminal_count": terminal_count,
            "terminal_labels": terminal_labels,
            "geometry": geometry,
            "x": insertion[0],
            "y": insertion[1],
        }
        records.append(record)

    for entity in selection_entities:
        _try_record_entity(entity)

    if include_modelspace:
        try:
            modelspace_count = int(modelspace.Count)
        except Exception:
            modelspace_count = 0

        capped_count = min(modelspace_count, max_entities)
        if modelspace_count > max_entities:
            warnings.append(
                f"ModelSpace scan capped at {max_entities} entities (of {modelspace_count})."
            )
        for index in range(capped_count):
            try:
                entity = dyn_fn(modelspace.Item(index))
            except Exception:
                continue
            _try_record_entity(entity)

    for candidate in pending_positional_jumpers:
        resolved = _resolve_positional_jumper_record(
            candidate=candidate,
            records=records,
            default_panel_prefix=str(profile["defaultPanelPrefix"]),
        )
        if resolved is None:
            skipped_invalid_jumper_blocks += 1
            warnings.append(
                "Skipping jumper block "
                f"{candidate.get('block_name') or '<unknown>'} "
                "(could not resolve nearest strip pair from insertion point)."
            )
            continue
        signature = (
            f"{resolved['panel_id']}|{resolved['from_strip_id']}|"
            f"{resolved['from_terminal']}|{resolved['to_strip_id']}|"
            f"{resolved['to_terminal']}"
        )
        if signature in seen_jumper_signatures:
            continue
        seen_jumper_signatures.add(signature)
        jumpers.append(resolved)
        resolved_positional_jumpers += 1

    panels: Dict[str, Dict[str, Any]] = {}
    for record in sorted(
        records,
        key=lambda item: (
            _safe_upper(item.get("panel_id")),
            _safe_upper(item.get("side")),
            int(item.get("strip_number") or 0),
            float(item.get("y") or 0.0),
        ),
    ):
        panel_id = _safe_upper(record.get("panel_id")) or "PANEL"
        side = _normalize_side(_safe_str(record.get("side")))

        panel_entry = panels.setdefault(
            panel_id,
            {
                "fullName": _safe_str(record.get("panel_name")) or panel_id,
                "color": _panel_color(panel_id),
                "sides": {},
            },
        )
        side_entry = panel_entry["sides"].setdefault(side, {"strips": []})
        side_entry["strips"].append(
            {
                "stripId": _safe_str(record.get("strip_id")),
                "stripNumber": int(record.get("strip_number") or 1),
                "terminalCount": int(record.get("terminal_count") or 12),
                "terminalLabels": list(record.get("terminal_labels") or []),
                "geometry": list(record.get("geometry") or []),
                "x": float(record.get("x") or 0.0),
                "y": float(record.get("y") or 0.0),
            }
        )

    total_strips = sum(
        len(side.get("strips", []))
        for panel in panels.values()
        for side in panel.get("sides", {}).values()
    )
    total_terminals = sum(
        int(strip.get("terminalCount") or 0)
        for panel in panels.values()
        for side in panel.get("sides", {}).values()
        for strip in side.get("strips", [])
    )
    jumpers_payload: List[Dict[str, Any]] = []
    for jumper in sorted(
        jumpers,
        key=lambda item: (
            _safe_upper(item.get("panel_id")),
            _safe_upper(item.get("from_strip_id")),
            int(item.get("from_terminal") or 0),
            _safe_upper(item.get("to_strip_id")),
            int(item.get("to_terminal") or 0),
        ),
    ):
        payload: Dict[str, Any] = {
            "jumperId": _safe_str(jumper.get("jumper_id")),
            "panelId": _safe_str(jumper.get("panel_id")),
            "fromStripId": _safe_str(jumper.get("from_strip_id")),
            "fromTerminal": int(jumper.get("from_terminal") or 0),
            "toStripId": _safe_str(jumper.get("to_strip_id")),
            "toTerminal": int(jumper.get("to_terminal") or 0),
            "sourceBlockName": _safe_str(jumper.get("source_block_name")),
            "resolution": _safe_str(jumper.get("resolution")) or "attribute",
        }
        x = _safe_float(jumper.get("x"))
        y = _safe_float(jumper.get("y"))
        if x is not None and y is not None and math.isfinite(x) and math.isfinite(y):
            payload["x"] = float(x)
            payload["y"] = float(y)
        jumpers_payload.append(payload)
    total_jumpers = len(jumpers_payload)

    no_data_message = (
        "No terminal-strip block references were detected. "
        "Check block naming/attributes (e.g., STRIP_ID, TERMINAL_COUNT, PANEL_ID)."
    )
    top_scanned_block_names = _top_block_counts(scanned_block_name_counts, limit=12)
    if total_strips == 0 and top_scanned_block_names:
        sample_names = ", ".join(
            item.get("blockName", "") for item in top_scanned_block_names[:6] if item.get("blockName")
        )
        if sample_names:
            no_data_message = f"{no_data_message} Scanned block names sample: {sample_names}."

    return {
        "success": total_strips > 0,
        "code": "" if total_strips > 0 else "NO_TERMINAL_STRIPS_FOUND",
        "message": (
            f"Scanned {scanned_entities} entities and found {total_strips} terminal strips."
            if total_strips > 0
            else no_data_message
        ),
        "data": {
            "drawing": {"name": drawing_name, "units": units},
            "panels": panels,
            "jumpers": jumpers_payload,
        },
        "meta": {
            "scannedEntities": scanned_entities,
            "scannedBlockReferences": scanned_block_refs,
            "skippedNonBlockEntities": skipped_non_block_entities,
            "skippedNonTerminalBlocks": skipped_non_terminal_blocks,
            "skippedMissingInsertionPointBlocks": skipped_missing_insertion_point_blocks,
            "terminalCandidateBlocks": terminal_candidate_blocks,
            "jumperCandidateBlocks": jumper_candidate_blocks,
            "skippedInvalidJumperBlocks": skipped_invalid_jumper_blocks,
            "positionalJumperCandidates": positional_jumper_candidates,
            "resolvedPositionalJumpers": resolved_positional_jumpers,
            "selectionOnly": bool(selection_only),
            "includeModelspace": bool(include_modelspace),
            "totalPanels": len(panels),
            "totalStrips": total_strips,
            "totalTerminals": total_terminals,
            "totalJumpers": total_jumpers,
            "totalLabeledTerminals": total_labeled_terminals,
            "totalGeometryPrimitives": total_geometry_primitives,
            "topScannedBlockNames": top_scanned_block_names,
            "terminalProfile": _terminal_profile_summary(profile),
        },
        "warnings": warnings,
    }


def _normalize_terminal_label_values(raw_labels: Any, terminal_count: int) -> List[str]:
    count = max(1, min(2000, int(terminal_count or 1)))
    labels: List[str] = []
    for index in range(count):
        value = ""
        if isinstance(raw_labels, list) and index < len(raw_labels):
            value = _safe_str(raw_labels[index])
        labels.append(value if value else str(index + 1))
    return labels


def _build_target_strip_label_map(strips_payload: Any) -> Dict[str, List[str]]:
    if strips_payload is None:
        return {}
    if not isinstance(strips_payload, list):
        raise TerminalScanValidationError("strips payload must be an array when provided.")

    target: Dict[str, List[str]] = {}
    for strip in strips_payload:
        if not isinstance(strip, dict):
            continue
        strip_id = _safe_upper(strip.get("stripId") or strip.get("strip_id"))
        if not strip_id:
            continue
        terminal_count = _safe_int(
            strip.get("terminalCount", strip.get("terminal_count"))
        )
        labels_raw = strip.get("labels")
        if terminal_count is None or terminal_count <= 0:
            if isinstance(labels_raw, list) and len(labels_raw) > 0:
                terminal_count = len(labels_raw)
            else:
                terminal_count = DEFAULT_TERMINAL_COUNT
        target[strip_id] = _normalize_terminal_label_values(labels_raw, terminal_count)
    return target


def _write_terminal_labels_to_entity(
    *,
    entity: Any,
    dyn_fn: Any,
    desired_labels: Sequence[str],
) -> Dict[str, int]:
    updated = 0
    unchanged = 0
    missing = 0
    failed = 0

    try:
        raw_attrs = entity.GetAttributes()
    except Exception:
        return {
            "updated": 0,
            "unchanged": 0,
            "missing": len(desired_labels),
            "failed": 0,
        }

    attrs_by_index: Dict[int, Any] = {}
    for attr in _iter_attribute_objects(raw_attrs, dyn_fn):
        tag = _safe_upper(getattr(attr, "TagString", ""))
        match = TERMINAL_LABEL_TAG_PATTERN.fullmatch(tag)
        if not match:
            continue
        try:
            index = int(match.group(1))
        except (TypeError, ValueError):
            continue
        if index <= 0:
            continue
        attrs_by_index[index] = attr

    for index, next_value in enumerate(desired_labels, start=1):
        attr = attrs_by_index.get(index)
        if attr is None:
            missing += 1
            continue

        try:
            current_value = _safe_str(getattr(attr, "TextString", ""))
        except Exception:
            current_value = ""

        if current_value == next_value:
            unchanged += 1
            continue

        try:
            attr.TextString = next_value
            try:
                attr.Update()
            except Exception:
                pass  # Attribute visual refresh is best-effort; value is already set
            updated += 1
        except Exception:
            failed += 1

    if updated > 0:
        try:
            entity.Update()
        except Exception:
            pass  # Entity visual refresh is best-effort; attribute values are already committed

    return {
        "updated": updated,
        "unchanged": unchanged,
        "missing": missing,
        "failed": failed,
    }


def sync_terminal_strip_labels(
    *,
    doc: Any,
    modelspace: Any,
    dyn_fn: Any,
    strips_payload: Any = None,
    include_modelspace: bool = True,
    selection_only: bool = False,
    max_entities: int = 50000,
    terminal_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    profile = _resolve_terminal_profile(terminal_profile)
    try:
        target_strip_labels = _build_target_strip_label_map(strips_payload)
    except TerminalScanValidationError as exc:
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "Invalid terminal scan request.",
            "data": {
                "updatedStrips": 0,
                "matchedStrips": 0,
                "targetStrips": 0,
                "matchedBlocks": 0,
                "updatedBlocks": 0,
                "updatedAttributes": 0,
                "unchangedAttributes": 0,
                "missingAttributes": 0,
                "failedAttributes": 0,
            },
            "meta": {
                "scannedEntities": 0,
                "scannedBlockReferences": 0,
                "skippedNonBlockEntities": 0,
                "skippedNonTerminalBlocks": 0,
                "terminalCandidateBlocks": 0,
                "selectionOnly": bool(selection_only),
                "includeModelspace": bool(include_modelspace),
                "terminalProfile": _terminal_profile_summary(profile),
            },
            "warnings": [],
        }
    target_strip_ids = set(target_strip_labels.keys())
    unresolved_target_ids = set(target_strip_ids)

    warnings: List[str] = []
    seen_entity_handles: set[str] = set()
    matched_strips: set[str] = set()
    updated_strips: set[str] = set()

    scanned_entities = 0
    scanned_block_references = 0
    skipped_non_block_entities = 0
    skipped_non_terminal_blocks = 0
    terminal_candidate_blocks = 0
    matched_terminal_blocks = 0
    updated_blocks = 0
    updated_attributes = 0
    unchanged_attributes = 0
    missing_attributes = 0
    failed_attributes = 0

    selection_entities = _collect_selection_entities(doc, dyn_fn) if selection_only else []

    def _desired_labels_for_strip(strip_id: str, terminal_count: int) -> Optional[List[str]]:
        if target_strip_labels:
            labels = target_strip_labels.get(strip_id)
            if labels is None:
                return None
            return _normalize_terminal_label_values(labels, terminal_count)
        return _normalize_terminal_label_values([], terminal_count)

    def _try_sync_entity(entity: Any) -> None:
        nonlocal scanned_entities
        nonlocal scanned_block_references
        nonlocal skipped_non_block_entities
        nonlocal skipped_non_terminal_blocks
        nonlocal terminal_candidate_blocks
        nonlocal matched_terminal_blocks
        nonlocal updated_blocks
        nonlocal updated_attributes
        nonlocal unchanged_attributes
        nonlocal missing_attributes
        nonlocal failed_attributes

        scanned_entities += 1
        handle = _handle_for_entity(entity)
        if handle and handle in seen_entity_handles:
            return
        if handle:
            seen_entity_handles.add(handle)

        object_name = _safe_upper(getattr(entity, "ObjectName", ""))
        if "BLOCKREFERENCE" not in object_name:
            skipped_non_block_entities += 1
            return
        scanned_block_references += 1

        attrs = _attributes_for_entity(entity, dyn_fn)
        block_name = _block_name_for_entity(entity, dyn_fn)
        if _looks_like_jumper_block(block_name, attrs):
            skipped_non_terminal_blocks += 1
            return

        is_terminal = _is_terminal_block(
            block_name,
            attrs,
            terminal_tag_keys=profile["terminalTagKeys"],
            terminal_name_tokens=profile["terminalNameTokens"],
            block_name_allow_list=profile["blockNameAllowList"],
            strip_id_keys=profile["stripIdKeys"],
            terminal_count_keys=profile["terminalCountKeys"],
            side_keys=profile["sideKeys"],
            require_strip_id=bool(profile["requireStripId"]),
            require_terminal_count=bool(profile["requireTerminalCount"]),
            require_side=bool(profile["requireSide"]),
        )
        if not is_terminal:
            skipped_non_terminal_blocks += 1
            return
        terminal_candidate_blocks += 1

        strip_id = _safe_upper(_first_attr(attrs, profile["stripIdKeys"]))
        if not strip_id:
            skipped_non_terminal_blocks += 1
            return

        terminal_count = _terminal_count(
            attrs,
            profile["terminalCountKeys"],
            int(profile["defaultTerminalCount"]),
        )
        desired_labels = _desired_labels_for_strip(strip_id, terminal_count)
        if desired_labels is None:
            return

        unresolved_target_ids.discard(strip_id)
        matched_terminal_blocks += 1
        matched_strips.add(strip_id)

        write_result = _write_terminal_labels_to_entity(
            entity=entity,
            dyn_fn=dyn_fn,
            desired_labels=desired_labels,
        )
        updated_attributes += int(write_result.get("updated") or 0)
        unchanged_attributes += int(write_result.get("unchanged") or 0)
        missing_attributes += int(write_result.get("missing") or 0)
        failed_attributes += int(write_result.get("failed") or 0)
        if int(write_result.get("updated") or 0) > 0:
            updated_blocks += 1
            updated_strips.add(strip_id)

    for entity in selection_entities:
        _try_sync_entity(entity)

    if include_modelspace:
        try:
            modelspace_count = int(modelspace.Count)
        except Exception:
            modelspace_count = 0
        capped_count = min(modelspace_count, max_entities)
        if modelspace_count > max_entities:
            warnings.append(
                f"ModelSpace scan capped at {max_entities} entities (of {modelspace_count})."
            )
        for index in range(capped_count):
            try:
                entity = dyn_fn(modelspace.Item(index))
            except Exception:
                continue
            _try_sync_entity(entity)

    if unresolved_target_ids:
        unresolved_sample = ", ".join(sorted(unresolved_target_ids)[:8])
        warnings.append(
            f"{len(unresolved_target_ids)} target strip(s) were not matched in drawing: {unresolved_sample}"
        )

    if target_strip_ids and matched_terminal_blocks == 0:
        success = False
        code = "NO_TARGET_STRIPS_MATCHED"
        message = "No terminal strips matched requested label-sync targets."
    elif terminal_candidate_blocks == 0:
        success = False
        code = "NO_TERMINAL_STRIPS_FOUND"
        message = "No terminal-strip block references were found for label sync."
    else:
        success = True
        code = ""
        message = (
            f"Processed {matched_terminal_blocks} terminal block(s): "
            f"{updated_blocks} block(s) updated, {unchanged_attributes} attribute value(s) unchanged."
        )

    return {
        "success": success,
        "code": code,
        "message": message,
        "data": {
            "updatedStrips": len(updated_strips),
            "matchedStrips": len(matched_strips),
            "targetStrips": len(target_strip_ids),
            "matchedBlocks": matched_terminal_blocks,
            "updatedBlocks": updated_blocks,
            "updatedAttributes": updated_attributes,
            "unchangedAttributes": unchanged_attributes,
            "missingAttributes": missing_attributes,
            "failedAttributes": failed_attributes,
        },
        "meta": {
            "scannedEntities": scanned_entities,
            "scannedBlockReferences": scanned_block_references,
            "skippedNonBlockEntities": skipped_non_block_entities,
            "skippedNonTerminalBlocks": skipped_non_terminal_blocks,
            "terminalCandidateBlocks": terminal_candidate_blocks,
            "selectionOnly": bool(selection_only),
            "includeModelspace": bool(include_modelspace),
            "terminalProfile": _terminal_profile_summary(profile),
        },
        "warnings": warnings,
    }
