from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

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

DEFAULT_VIEW_PADDING = 20.0
VALID_OBSTACLE_TYPES = {
    "foundation",
    "building",
    "equipment_pad",
    "trench",
    "fence",
    "road",
}


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip()
    except Exception:
        return ""


def _safe_upper(value: Any) -> str:
    return _safe_str(value).upper()


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except Exception:
        return None


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return None


def _resolve_units(doc: Any) -> str:
    try:
        raw_units = doc.GetVariable("INSUNITS")
        parsed = _safe_int(raw_units)
        if parsed is None:
            return _safe_str(raw_units) or "Unknown"
        return INSUNITS_MAP.get(parsed, f"INSUNITS:{parsed}")
    except Exception:
        return "Unknown"


def _handle_for_entity(entity: Any) -> str:
    try:
        return _safe_upper(getattr(entity, "Handle", ""))
    except Exception:
        return ""


def _iter_selection_entities(doc: Any, dyn_fn: Any) -> Iterable[Any]:
    for key in ("PickfirstSelectionSet", "ActiveSelectionSet"):
        try:
            selection = dyn_fn(getattr(doc, key))
            count = int(selection.Count)
        except Exception:
            continue
        for index in range(count):
            try:
                yield dyn_fn(selection.Item(index))
            except Exception:
                continue


def _is_non_geometric_object(object_name: str) -> bool:
    upper = object_name.upper()
    skip_tokens = ("TEXT", "MTEXT", "DIMENSION", "MLEADER", "VIEWPORT", "ATTDEF", "ATTRIBUTE")
    return any(token in upper for token in skip_tokens)


def _classify_layer(layer_name: str, *, force_unknown_to_foundation: bool) -> Optional[str]:
    layer = layer_name.upper()
    if not layer:
        return None

    if "TRENCH" in layer:
        return "trench"
    if "FENCE" in layer:
        return "fence"
    if "ROAD" in layer:
        return "road"
    if "FOUND" in layer or "FNDN" in layer or layer.startswith("S-FNDN"):
        return "foundation"
    if "KEEPOUT" in layer or "KEEP-OUT" in layer:
        return "foundation"
    if "PAD" in layer or "S-CONC" in layer:
        return "equipment_pad"
    if (
        "BUILD" in layer
        or "A-WALL" in layer
        or layer.startswith("A-WALL")
        or "S-STRU" in layer
        or "S-STEEL" in layer
    ):
        return "building"
    if layer.startswith("E-CONDUIT") or layer == "E-CONDUIT":
        return "road"

    if force_unknown_to_foundation:
        return "foundation"
    return None


def _normalize_layer_type_overrides(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    overrides: Dict[str, str] = {}
    for layer_name, obstacle_type in raw.items():
        layer_key = _safe_upper(layer_name)
        if not layer_key:
            continue
        normalized_type = _safe_str(obstacle_type).lower()
        if normalized_type in VALID_OBSTACLE_TYPES:
            overrides[layer_key] = normalized_type
    return overrides


def _normalize_to_canvas(
    *,
    raw_obstacles: Sequence[Dict[str, Any]],
    canvas_width: float,
    canvas_height: float,
    padding: float,
) -> Dict[str, Any]:
    if not raw_obstacles:
        return {
            "obstacles": [],
            "viewport": {
                "canvasWidth": canvas_width,
                "canvasHeight": canvas_height,
                "padding": padding,
                "scale": 1.0,
                "worldMinX": 0.0,
                "worldMinY": 0.0,
                "worldMaxX": canvas_width,
                "worldMaxY": canvas_height,
            },
        }

    min_x = min(float(item["minx"]) for item in raw_obstacles)
    min_y = min(float(item["miny"]) for item in raw_obstacles)
    max_x = max(float(item["maxx"]) for item in raw_obstacles)
    max_y = max(float(item["maxy"]) for item in raw_obstacles)

    world_width = max(1.0, max_x - min_x)
    world_height = max(1.0, max_y - min_y)

    usable_width = max(120.0, canvas_width - padding * 2.0)
    usable_height = max(120.0, canvas_height - padding * 2.0)
    scale = min(usable_width / world_width, usable_height / world_height)
    if scale <= 0:
        scale = 1.0

    obstacles: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_obstacles):
        x = (float(item["minx"]) - min_x) * scale + padding
        y = (float(item["miny"]) - min_y) * scale + padding
        w = max(2.0, (float(item["maxx"]) - float(item["minx"])) * scale)
        h = max(2.0, (float(item["maxy"]) - float(item["miny"])) * scale)

        if x + w > canvas_width:
            w = max(2.0, canvas_width - x)
        if y + h > canvas_height:
            h = max(2.0, canvas_height - y)

        obstacles.append(
            {
                "id": f"acad_obs_{index + 1}",
                "type": item["type"],
                "x": round(x, 3),
                "y": round(y, 3),
                "w": round(w, 3),
                "h": round(h, 3),
                "label": item["label"],
            }
        )

    return {
        "obstacles": obstacles,
        "viewport": {
            "canvasWidth": canvas_width,
            "canvasHeight": canvas_height,
            "padding": padding,
            "scale": scale,
            "worldMinX": min_x,
            "worldMinY": min_y,
            "worldMaxX": max_x,
            "worldMaxY": max_y,
        },
    }


def scan_conduit_obstacles(
    *,
    doc: Any,
    modelspace: Any,
    dyn_fn: Any,
    entity_bbox_fn: Any,
    include_modelspace: bool = True,
    selection_only: bool = False,
    max_entities: int = 50000,
    canvas_width: float = 980.0,
    canvas_height: float = 560.0,
    layer_names: Optional[Sequence[str]] = None,
    layer_type_overrides: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    drawing_name = _safe_str(getattr(doc, "Name", "")) or "Unknown.dwg"
    units = _resolve_units(doc)
    warnings: List[str] = []

    allowed_layers = {
        _safe_upper(layer_name)
        for layer_name in (layer_names or [])
        if _safe_str(layer_name)
    }
    force_unknown_to_foundation = len(allowed_layers) > 0
    normalized_type_overrides = _normalize_layer_type_overrides(layer_type_overrides)

    scanned_entities = 0
    scanned_geometry_entities = 0
    matched_layer_entities = 0
    override_layer_entities = 0
    deduped_entities = 0

    seen_handles: set[str] = set()
    seen_bbox_keys: set[Tuple[str, str, float, float, float, float]] = set()
    raw_obstacles: List[Dict[str, Any]] = []

    def _consume_entity(entity: Any) -> None:
        nonlocal scanned_entities, scanned_geometry_entities, matched_layer_entities, deduped_entities, override_layer_entities
        scanned_entities += 1

        handle = _handle_for_entity(entity)
        if handle and handle in seen_handles:
            return
        if handle:
            seen_handles.add(handle)

        object_name = _safe_str(getattr(entity, "ObjectName", ""))
        if _is_non_geometric_object(object_name):
            return

        layer_name = _safe_upper(getattr(entity, "Layer", ""))
        if not layer_name:
            return

        if allowed_layers and layer_name not in allowed_layers:
            return

        obstacle_type = normalized_type_overrides.get(layer_name)
        if obstacle_type:
            override_layer_entities += 1
        else:
            obstacle_type = _classify_layer(
                layer_name,
                force_unknown_to_foundation=force_unknown_to_foundation,
            )
        if not obstacle_type:
            return
        matched_layer_entities += 1

        bbox = entity_bbox_fn(entity)
        if not bbox:
            return
        scanned_geometry_entities += 1
        minx, miny, _, maxx, maxy, _ = bbox
        width = maxx - minx
        height = maxy - miny
        if width <= 0.0001 and height <= 0.0001:
            return

        dedupe_key = (
            layer_name,
            obstacle_type,
            round(minx, 4),
            round(miny, 4),
            round(maxx, 4),
            round(maxy, 4),
        )
        if dedupe_key in seen_bbox_keys:
            deduped_entities += 1
            return
        seen_bbox_keys.add(dedupe_key)

        raw_obstacles.append(
            {
                "type": obstacle_type,
                "layer": layer_name,
                "label": layer_name,
                "minx": float(minx),
                "miny": float(miny),
                "maxx": float(maxx),
                "maxy": float(maxy),
            }
        )

    if selection_only:
        for selection_entity in _iter_selection_entities(doc, dyn_fn):
            _consume_entity(selection_entity)

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
                modelspace_entity = dyn_fn(modelspace.Item(index))
            except Exception:
                continue
            _consume_entity(modelspace_entity)

    normalized = _normalize_to_canvas(
        raw_obstacles=raw_obstacles,
        canvas_width=max(120.0, float(canvas_width)),
        canvas_height=max(120.0, float(canvas_height)),
        padding=DEFAULT_VIEW_PADDING,
    )

    total_obstacles = len(normalized["obstacles"])
    if total_obstacles == 0:
        message = (
            "No route obstacles found from AutoCAD layers. "
            "Expected layers like FOUNDATION, PAD, TRENCH, ROAD, or FENCE."
        )
    else:
        message = (
            f"Scanned {scanned_entities} entities and mapped {total_obstacles} obstacles."
        )

    return {
        "success": total_obstacles > 0,
        "code": "" if total_obstacles > 0 else "NO_OBSTACLES_FOUND",
        "message": message,
        "data": {
            "drawing": {"name": drawing_name, "units": units},
            "obstacles": normalized["obstacles"],
            "viewport": normalized["viewport"],
        },
        "meta": {
            "scannedEntities": scanned_entities,
            "scannedGeometryEntities": scanned_geometry_entities,
            "matchedLayerEntities": matched_layer_entities,
            "dedupedEntities": deduped_entities,
            "selectionOnly": bool(selection_only),
            "includeModelspace": bool(include_modelspace),
            "totalObstacles": total_obstacles,
            "overrideLayerEntities": override_layer_entities,
        },
        "warnings": warnings,
    }
