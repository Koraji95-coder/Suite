from __future__ import annotations

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


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    try:
        text = str(value).strip()
    except Exception:
        return ""
    return text


def _safe_upper(value: Any) -> str:
    return _safe_str(value).upper()


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except Exception:
        return None


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
    except Exception:
        return None


def _strip_number(strip_id: str, attrs: Dict[str, str]) -> int:
    for key in STRIP_NUMBER_KEYS:
        value = attrs.get(key, "")
        parsed = _extract_int_from_text(value)
        if parsed is not None:
            return parsed
    parsed = _extract_int_from_text(strip_id)
    return parsed if parsed is not None else 1


def _terminal_count(attrs: Dict[str, str]) -> int:
    for key in TERMINAL_COUNT_KEYS:
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

    return 12


def _is_terminal_block(block_name: str, attrs: Dict[str, str]) -> bool:
    name = _safe_upper(block_name)
    if not name and not attrs:
        return False

    tokens = [token for token in re.split(r"[^A-Z0-9]+", name) if token]
    token_set = set(tokens)
    has_terminal_name = any(
        token in {"TERMINAL", "TERMS", "TB", "TS", "MARSHALLING"}
        or token.startswith("TB")
        or token.startswith("TS")
        for token in token_set
    )
    if has_terminal_name:
        return True

    return any(key in attrs for key in TERMINAL_TAG_KEYS)


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


def scan_terminal_strips(
    *,
    doc: Any,
    modelspace: Any,
    dyn_fn: Any,
    include_modelspace: bool = True,
    selection_only: bool = False,
    max_entities: int = 50000,
) -> Dict[str, Any]:
    drawing_name = _safe_str(getattr(doc, "Name", "")) or "Unknown.dwg"
    units = _resolve_units(doc)

    records: List[Dict[str, Any]] = []
    seen_strip_ids: set[str] = set()
    seen_entity_handles: set[str] = set()
    warnings: List[str] = []

    scanned_entities = 0
    scanned_block_refs = 0
    skipped_non_terminal_blocks = 0

    selection_entities = _collect_selection_entities(doc, dyn_fn) if selection_only else []

    def _try_record_entity(entity: Any) -> None:
        nonlocal scanned_entities, scanned_block_refs, skipped_non_terminal_blocks
        scanned_entities += 1
        handle = _handle_for_entity(entity)
        if handle and handle in seen_entity_handles:
            return
        if handle:
            seen_entity_handles.add(handle)

        object_name = _safe_upper(getattr(entity, "ObjectName", ""))
        if "BLOCKREFERENCE" not in object_name:
            return
        scanned_block_refs += 1

        attrs = _attributes_for_entity(entity, dyn_fn)
        block_name = _block_name_for_entity(entity, dyn_fn)
        if not _is_terminal_block(block_name, attrs):
            skipped_non_terminal_blocks += 1
            return

        insertion = _extract_insertion_point(entity)
        if insertion is None:
            warnings.append(
                f"Skipping block {block_name or '<unknown>'} (missing insertion point)."
            )
            return

        strip_id_raw = _first_attr(attrs, STRIP_ID_KEYS)
        strip_id = _safe_upper(strip_id_raw) or _safe_upper(block_name) or f"STRIP_{handle or scanned_block_refs}"

        if strip_id in seen_strip_ids:
            suffix = 2
            candidate = f"{strip_id}_{suffix}"
            while candidate in seen_strip_ids:
                suffix += 1
                candidate = f"{strip_id}_{suffix}"
            strip_id = candidate
        seen_strip_ids.add(strip_id)

        panel_id_raw = _first_attr(attrs, PANEL_ID_KEYS)
        panel_id = _safe_upper(panel_id_raw) or _derive_panel_from_strip_id(strip_id) or "PANEL"
        panel_name = _first_attr(attrs, PANEL_NAME_KEYS) or panel_id
        side_raw = _first_attr(attrs, SIDE_KEYS) or _derive_side_from_strip_id(strip_id)
        side = _normalize_side(side_raw)

        record = {
            "panel_id": panel_id,
            "panel_name": panel_name,
            "side": side,
            "strip_id": strip_id,
            "strip_number": _strip_number(strip_id, attrs),
            "terminal_count": _terminal_count(attrs),
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

    no_data_message = (
        "No terminal-strip block references were detected. "
        "Check block naming/attributes (e.g., STRIP_ID, TERMINAL_COUNT, PANEL_ID)."
    )

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
        },
        "meta": {
            "scannedEntities": scanned_entities,
            "scannedBlockReferences": scanned_block_refs,
            "skippedNonTerminalBlocks": skipped_non_terminal_blocks,
            "selectionOnly": bool(selection_only),
            "includeModelspace": bool(include_modelspace),
            "totalPanels": len(panels),
            "totalStrips": total_strips,
            "totalTerminals": total_terminals,
        },
        "warnings": warnings,
    }
