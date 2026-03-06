from __future__ import annotations

import math
from typing import Any, Mapping, MutableMapping

GEOMETRY_VERSION = "v1.2"
SNAP_PRECISION = 3
AXIS_TOLERANCE = 0.005
MIN_VISIBLE_FILLET = 0.02
MAX_COLLAPSE_ITERS = 50
POINT_DEDUPE_TOLERANCE = 1e-6


def _snap_coord(value: float) -> float:
    return round(float(value), SNAP_PRECISION)


def _snap_point(point: tuple[float, float]) -> tuple[float, float]:
    return (_snap_coord(point[0]), _snap_coord(point[1]))


def _point_as_payload(point: tuple[float, float]) -> dict[str, float]:
    return {"x": float(point[0]), "y": float(point[1])}


def _to_float(value: Any, *, field_name: str) -> float:
    try:
        parsed = float(value)
    except Exception as exc:
        raise ValueError(f"Invalid numeric value for '{field_name}': {value!r}") from exc
    if not math.isfinite(parsed):
        raise ValueError(f"Non-finite numeric value for '{field_name}': {value!r}")
    return parsed


def _safe_upper(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text


def _route_layer_name(
    route: Mapping[str, Any],
    *,
    default_layer_name: str,
) -> str:
    candidate = str(route.get("layerName") or route.get("layer_name") or "").strip()
    if candidate:
        return candidate[:80]
    route_type = str(route.get("routeType") or route.get("route_type") or "").strip().lower()
    if route_type == "jumper":
        return "SUITE_WIRE_JUMPER"
    return default_layer_name


def _route_path_points(
    route: Mapping[str, Any],
    *,
    route_index: int,
) -> list[tuple[float, float]]:
    path = route.get("path")
    if not isinstance(path, list):
        raise ValueError(f"Route index {route_index} must provide 'path' array.")

    points: list[tuple[float, float]] = []
    for point_index, point in enumerate(path):
        if not isinstance(point, Mapping):
            continue
        x = _to_float(point.get("x"), field_name=f"routes[{route_index}].path[{point_index}].x")
        y = _to_float(point.get("y"), field_name=f"routes[{route_index}].path[{point_index}].y")
        point_xy = _snap_point((x, y))
        if points:
            px, py = points[-1]
            if math.hypot(point_xy[0] - px, point_xy[1] - py) <= POINT_DEDUPE_TOLERANCE:
                continue
        points.append(point_xy)

    if len(points) < 2:
        raise ValueError(f"Route index {route_index} path requires at least two valid points.")
    return points


def _resolve_aci_color(route: Mapping[str, Any]) -> int | None:
    raw = route.get("colorAci", route.get("color_aci"))
    if raw is None:
        return None
    try:
        color = int(raw)
    except Exception:
        return None
    if 1 <= color <= 255:
        return color
    return None


def _route_ref(route: Mapping[str, Any], *, route_index: int) -> str:
    value = str(route.get("ref") or "").strip()
    if value:
        return value
    return f"AUTO-{route_index + 1:03d}"


def _route_fillet_radius(route: Mapping[str, Any]) -> float:
    raw = route.get("filletRadius", route.get("fillet_radius", 0.1))
    try:
        value = float(raw)
    except Exception:
        return 0.1
    if not math.isfinite(value):
        return 0.1
    return max(0.0, value)


def _dedupe_points(
    points: list[tuple[float, float]],
    *,
    tolerance: float = POINT_DEDUPE_TOLERANCE,
) -> list[tuple[float, float]]:
    if len(points) <= 1:
        return points
    output: list[tuple[float, float]] = [points[0]]
    for point in points[1:]:
        prev = output[-1]
        if math.hypot(point[0] - prev[0], point[1] - prev[1]) > tolerance:
            output.append(point)
    return output


def _segment_axis(
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    tolerance: float = AXIS_TOLERANCE,
) -> str:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if abs(dx) <= tolerance and abs(dy) <= tolerance:
        return "z"
    if abs(dx) <= tolerance:
        return "v"
    if abs(dy) <= tolerance:
        return "h"
    return "d"


def _simplify_collinear_axis_points(
    points: list[tuple[float, float]],
    *,
    tolerance: float = AXIS_TOLERANCE,
) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points

    output: list[tuple[float, float]] = [points[0]]
    for index in range(1, len(points) - 1):
        prev = output[-1]
        current = points[index]
        nxt = points[index + 1]
        axis1 = _segment_axis(prev, current, tolerance=tolerance)
        axis2 = _segment_axis(current, nxt, tolerance=tolerance)
        if axis1 in {"h", "v"} and axis1 == axis2:
            continue
        output.append(current)
    output.append(points[-1])
    return _dedupe_points(output, tolerance=POINT_DEDUPE_TOLERANCE)


def _snap_near_axis_points(
    points: list[tuple[float, float]],
    *,
    tolerance: float = AXIS_TOLERANCE,
) -> list[tuple[float, float]]:
    if len(points) <= 1:
        return points

    output = [_snap_point(points[0])]
    for index in range(1, len(points)):
        x, y = _snap_point(points[index])
        px, py = output[-1]
        if abs(x - px) <= tolerance and abs(y - py) > tolerance:
            x = px
        if abs(y - py) <= tolerance and abs(x - px) > tolerance:
            y = py
        output.append(_snap_point((x, y)))
    return output


def _orthogonalize_points(
    points: list[tuple[float, float]],
    *,
    tolerance: float = AXIS_TOLERANCE,
    min_leg_length: float = 0.0,
) -> list[tuple[float, float]]:
    if len(points) <= 1:
        return points

    snapped = _snap_near_axis_points(points, tolerance=tolerance)
    output: list[tuple[float, float]] = [snapped[0]]
    for point in snapped[1:]:
        start = output[-1]
        axis = _segment_axis(start, point, tolerance=tolerance)
        if axis != "d":
            output.append(point)
            continue

        prev_axis = ""
        if len(output) >= 2:
            prev_axis = _segment_axis(output[-2], output[-1], tolerance=tolerance)

        dx = point[0] - start[0]
        dy = point[1] - start[1]
        if prev_axis == "h":
            elbow = (point[0], start[1])
        elif prev_axis == "v":
            elbow = (start[0], point[1])
        elif abs(dx) >= abs(dy):
            elbow = (point[0], start[1])
        else:
            elbow = (start[0], point[1])
        elbow = _snap_point(elbow)

        leg_a = math.hypot(elbow[0] - start[0], elbow[1] - start[1])
        leg_b = math.hypot(point[0] - elbow[0], point[1] - elbow[1])
        if min_leg_length > 0 and min(leg_a, leg_b) < min_leg_length:
            output.append(point)
            continue

        output.append(elbow)
        output.append(point)

    return _simplify_collinear_axis_points(
        _dedupe_points(output, tolerance=POINT_DEDUPE_TOLERANCE),
        tolerance=tolerance,
    )


def _collapse_short_corner_segments(
    points: list[tuple[float, float]],
    *,
    min_length: float,
    tolerance: float = AXIS_TOLERANCE,
) -> list[tuple[float, float]]:
    if len(points) <= 2 or min_length <= 0:
        return points

    output = list(points)
    changed = True
    iterations = 0
    while changed and len(output) > 2 and iterations < MAX_COLLAPSE_ITERS:
        iterations += 1
        changed = False
        index = 1
        while index < len(output) - 1:
            a = output[index - 1]
            b = output[index]
            c = output[index + 1]
            len1 = math.hypot(b[0] - a[0], b[1] - a[1])
            len2 = math.hypot(c[0] - b[0], c[1] - b[1])
            if min(len1, len2) >= min_length:
                index += 1
                continue

            axis1 = _segment_axis(a, b, tolerance=tolerance)
            axis2 = _segment_axis(b, c, tolerance=tolerance)
            new_b = None
            if axis1 == "v" and axis2 == "h":
                new_b = _snap_point((a[0], c[1]))
            elif axis1 == "h" and axis2 == "v":
                new_b = _snap_point((c[0], a[1]))
            elif axis1 in {"h", "v"} and axis1 == axis2:
                del output[index]
                changed = True
                continue
            else:
                del output[index]
                changed = True
                continue

            # BUG 3 FIX: if the collapse didn't actually move the vertex,
            # skip it to prevent the loop from re-processing it forever
            if new_b is not None and math.hypot(new_b[0] - b[0], new_b[1] - b[1]) < POINT_DEDUPE_TOLERANCE:
                index += 1
                continue

            output[index] = new_b
            changed = True
            output = _simplify_collinear_axis_points(
                _dedupe_points(output, tolerance=POINT_DEDUPE_TOLERANCE),
                tolerance=tolerance,
            )
            index = max(1, index - 1)

    return _simplify_collinear_axis_points(
        _dedupe_points(output, tolerance=POINT_DEDUPE_TOLERANCE),
        tolerance=tolerance,
    )


def _normalize_route_points_for_cad(
    points: list[tuple[float, float]],
    *,
    fillet_radius: float,
) -> list[tuple[float, float]]:
    normalized = [_snap_point(point) for point in points]
    normalized = _dedupe_points(normalized, tolerance=POINT_DEDUPE_TOLERANCE)
    if len(normalized) < 2:
        return normalized

    endpoint_start = normalized[0]
    endpoint_end = normalized[-1]
    min_corner_segment = max(0.05, fillet_radius * 2.5)
    normalized = _orthogonalize_points(
        normalized,
        tolerance=AXIS_TOLERANCE,
        min_leg_length=min_corner_segment,
    )
    normalized = _collapse_short_corner_segments(
        normalized,
        min_length=min_corner_segment,
        tolerance=AXIS_TOLERANCE,
    )
    if len(normalized) < 2:
        return [endpoint_start, endpoint_end]

    normalized[0] = endpoint_start
    normalized[-1] = endpoint_end
    normalized = _dedupe_points(normalized, tolerance=POINT_DEDUPE_TOLERANCE)
    return _simplify_collinear_axis_points(normalized, tolerance=AXIS_TOLERANCE)


def _entity_handle(entity: Any) -> str:
    try:
        return _safe_upper(getattr(entity, "Handle", ""))
    except Exception:
        return ""


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _draw_line_entity(
    *,
    modelspace: Any,
    start: tuple[float, float],
    end: tuple[float, float],
    layer_name: str,
    aci_color: int | None,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> str:
    if math.hypot(end[0] - start[0], end[1] - start[1]) <= 1e-9:
        return ""
    line = com_call_with_retry_fn(
        lambda: modelspace.AddLine(pt_fn(start[0], start[1], 0), pt_fn(end[0], end[1], 0))
    )
    line = dyn_fn(line)
    try:
        line.Layer = layer_name
    except Exception:
        pass
    try:
        line.Color = 256  # BYLAYER
    except Exception:
        pass
    return _entity_handle(line)


def _draw_arc_entity(
    *,
    modelspace: Any,
    center: tuple[float, float],
    radius: float,
    start: tuple[float, float],
    end: tuple[float, float],
    turn: float,
    layer_name: str,
    aci_color: int | None,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
    pt_fn: Any,
) -> str:
    if radius <= 1e-9:
        return ""

    start_angle = math.atan2(start[1] - center[1], start[0] - center[0])
    end_angle = math.atan2(end[1] - center[1], end[0] - center[0])
    start_angle, end_angle = _normalize_add_arc_angles(
        start_angle=start_angle,
        end_angle=end_angle,
        turn=turn,
    )

    arc = com_call_with_retry_fn(
        lambda: modelspace.AddArc(
            pt_fn(center[0], center[1], 0),
            float(radius),
            float(start_angle),
            float(end_angle),
        )
    )
    arc = dyn_fn(arc)
    try:
        arc.Layer = layer_name
    except Exception:
        pass
    try:
        arc.Color = 256  # BYLAYER
    except Exception:
        pass
    return _entity_handle(arc)


def _normalize_add_arc_angles(
    *,
    start_angle: float,
    end_angle: float,
    turn: float,
) -> tuple[float, float]:
    """Normalize start/end for AutoCAD AddArc CCW sweep semantics.

    AutoCAD AddArc always sweeps counterclockwise from start to end.
    For clockwise corner intent (turn < 0), swap angles first so the same
    physical minor arc is drawn using a CCW sweep.
    """
    sa = float(start_angle)
    ea = float(end_angle)
    if turn < 0:
        sa, ea = ea, sa
    while ea < sa:
        ea += math.tau
    return sa, ea


def _normalize_text_rotation_radians(angle_radians: float) -> float:
    angle = float(angle_radians)
    while angle <= -math.pi:
        angle += math.tau
    while angle > math.pi:
        angle -= math.tau
    if angle > (math.pi * 0.5):
        angle -= math.pi
    elif angle <= -(math.pi * 0.5):
        angle += math.pi
    return angle


def _route_center_label_anchor(
    points: list[tuple[float, float]],
) -> tuple[float, float, float] | None:
    if len(points) < 2:
        return None

    segments: list[tuple[tuple[float, float], tuple[float, float], float]] = []
    total_length = 0.0
    for index in range(1, len(points)):
        start = points[index - 1]
        end = points[index]
        seg_length = math.hypot(end[0] - start[0], end[1] - start[1])
        if seg_length <= 1e-9:
            continue
        segments.append((start, end, seg_length))
        total_length += seg_length

    if not segments or total_length <= 1e-9:
        return None

    target_distance = total_length * 0.5
    walked = 0.0
    for start, end, seg_length in segments:
        if walked + seg_length < target_distance:
            walked += seg_length
            continue
        ratio = _clamp((target_distance - walked) / seg_length, 0.0, 1.0)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        angle = _normalize_text_rotation_radians(math.atan2(dy, dx))
        return (
            start[0] + dx * ratio,
            start[1] + dy * ratio,
            angle,
        )

    tail_start, tail_end, _tail_length = segments[-1]
    tail_angle = _normalize_text_rotation_radians(
        math.atan2(tail_end[1] - tail_start[1], tail_end[0] - tail_start[0])
    )
    return (
        (tail_start[0] + tail_end[0]) * 0.5,
        (tail_start[1] + tail_end[1]) * 0.5,
        tail_angle,
    )


def _draw_route_label_entity(
    *,
    modelspace: Any,
    route_ref: str,
    anchor: tuple[float, float, float],
    text_height: float,
    layer_name: str,
    aci_color: int | None,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> tuple[str, str]:
    anchor_x, anchor_y, rotation = anchor
    point = pt_fn(anchor_x, anchor_y, 0)

    # Prefer MText so we can apply a background mask in CAD.
    try:
        mtext_width = max(1.0, float(text_height) * max(6.0, len(route_ref) * 0.9))
        label = com_call_with_retry_fn(
            lambda: modelspace.AddMText(point, float(mtext_width), route_ref)
        )
        label = dyn_fn(label)
        try:
            label.Layer = layer_name
        except Exception:
            pass
        try:
            label.Color = 256  # BYLAYER
        except Exception:
            pass
        try:
            label.AttachmentPoint = 5  # Middle Center
        except Exception:
            pass
        try:
            label.Rotation = float(rotation)
        except Exception:
            pass
        try:
            label.BackgroundFill = True
        except Exception:
            pass
        try:
            label.UseBackgroundColor = True
        except Exception:
            pass
        handle = _entity_handle(label)
        if handle:
            return handle, ""
    except Exception:
        pass

    # Fallback keeps route labeling available even if MText props are unsupported.
    try:
        label = com_call_with_retry_fn(
            lambda: modelspace.AddText(route_ref, point, float(text_height))
        )
        label = dyn_fn(label)
        try:
            label.Layer = layer_name
        except Exception:
            pass
        try:
            label.Color = 256  # BYLAYER
        except Exception:
            pass
        try:
            label.Alignment = 10  # Middle Center
        except Exception:
            pass
        try:
            label.TextAlignmentPoint = point
        except Exception:
            pass
        try:
            label.Rotation = float(rotation)
        except Exception:
            pass
        handle = _entity_handle(label)
        if handle:
            return handle, "MText mask unavailable; used Text fallback."
    except Exception:
        pass
    return "", "Unable to annotate route with centered label."


def _corner_fillet_geometry(
    *,
    prev: tuple[float, float],
    current: tuple[float, float],
    next_point: tuple[float, float],
    radius: float,
) -> tuple[dict[str, Any] | None, str]:
    dx1 = current[0] - prev[0]
    dy1 = current[1] - prev[1]
    dx2 = next_point[0] - current[0]
    dy2 = next_point[1] - current[1]
    len1 = math.hypot(dx1, dy1)
    len2 = math.hypot(dx2, dy2)
    if len1 <= 1e-9 or len2 <= 1e-9:
        return None, "degenerate_segment"

    u1x = -dx1 / len1
    u1y = -dy1 / len1
    u2x = dx2 / len2
    u2y = dy2 / len2

    dot = _clamp(u1x * u2x + u1y * u2y, -1.0, 1.0)
    if abs(dot) >= 0.9995:
        return None, "near_collinear"

    angle = math.acos(dot)
    half_angle = angle * 0.5
    tan_half = math.tan(half_angle)
    sin_half = math.sin(half_angle)
    if abs(tan_half) <= 1e-9 or abs(sin_half) <= 1e-9:
        return None, "invalid_corner_angle"

    tangent_len = min(radius / tan_half, len1 * 0.40, len2 * 0.40)
    if tangent_len <= 1e-6:
        return None, "insufficient_tangent_length"
    actual_radius = tangent_len * tan_half
    if actual_radius < MIN_VISIBLE_FILLET:
        return None, "below_visible_radius"

    entry = _snap_point((
        current[0] + u1x * tangent_len,
        current[1] + u1y * tangent_len,
    ))
    exit_point = _snap_point((
        current[0] + u2x * tangent_len,
        current[1] + u2y * tangent_len,
    ))

    bisector_x = u1x + u2x
    bisector_y = u1y + u2y
    bisector_len = math.hypot(bisector_x, bisector_y)
    if bisector_len <= 1e-9:
        return None, "invalid_bisector"

    center_distance = actual_radius / sin_half
    center = _snap_point((
        current[0] + (bisector_x / bisector_len) * center_distance,
        current[1] + (bisector_y / bisector_len) * center_distance,
    ))
    turn = dx1 * dy2 - dy1 * dx2

    return (
        {
            "entry": entry,
            "exit": exit_point,
            "center": center,
            "radius": float(actual_radius),
            "turn": float(turn),
        },
        "",
    )


def _point_from_payload(
    value: Any,
    *,
    field_name: str,
) -> tuple[float, float]:
    if not isinstance(value, Mapping):
        raise ValueError(f"Invalid point mapping for '{field_name}'.")
    x = _to_float(value.get("x"), field_name=f"{field_name}.x")
    y = _to_float(value.get("y"), field_name=f"{field_name}.y")
    return _snap_point((x, y))


def _line_primitive(
    *,
    start: tuple[float, float],
    end: tuple[float, float],
) -> dict[str, Any]:
    return {
        "kind": "line",
        "start": _point_as_payload(_snap_point(start)),
        "end": _point_as_payload(_snap_point(end)),
    }


def _arc_primitive(
    *,
    center: tuple[float, float],
    radius: float,
    start: tuple[float, float],
    end: tuple[float, float],
    turn: float,
) -> dict[str, Any]:
    return {
        "kind": "arc",
        "center": _point_as_payload(_snap_point(center)),
        "radius": float(radius),
        "start": _point_as_payload(_snap_point(start)),
        "end": _point_as_payload(_snap_point(end)),
        "turn": float(turn),
    }


def _coerce_primitive_list(
    route: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    raw_primitives = route.get("primitives")
    if not isinstance(raw_primitives, list):
        return [], warnings

    output: list[dict[str, Any]] = []
    for primitive_index, primitive in enumerate(raw_primitives):
        if not isinstance(primitive, Mapping):
            warnings.append(f"Ignoring invalid primitive at index {primitive_index} (not an object).")
            continue
        kind = str(primitive.get("kind") or "").strip().lower()
        if kind == "line":
            try:
                start = _point_from_payload(
                    primitive.get("start"),
                    field_name=f"route.primitives[{primitive_index}].start",
                )
                end = _point_from_payload(
                    primitive.get("end"),
                    field_name=f"route.primitives[{primitive_index}].end",
                )
            except ValueError as exc:
                warnings.append(str(exc))
                continue
            if math.hypot(end[0] - start[0], end[1] - start[1]) <= 1e-9:
                continue
            output.append(_line_primitive(start=start, end=end))
            continue

        if kind == "arc":
            try:
                center = _point_from_payload(
                    primitive.get("center"),
                    field_name=f"route.primitives[{primitive_index}].center",
                )
                start = _point_from_payload(
                    primitive.get("start"),
                    field_name=f"route.primitives[{primitive_index}].start",
                )
                end = _point_from_payload(
                    primitive.get("end"),
                    field_name=f"route.primitives[{primitive_index}].end",
                )
                radius = _to_float(
                    primitive.get("radius"),
                    field_name=f"route.primitives[{primitive_index}].radius",
                )
                turn = _to_float(
                    primitive.get("turn", 1.0),
                    field_name=f"route.primitives[{primitive_index}].turn",
                )
            except ValueError as exc:
                warnings.append(str(exc))
                continue
            if radius <= 1e-9:
                warnings.append(f"Ignoring arc primitive at index {primitive_index} with non-positive radius.")
                continue
            output.append(
                _arc_primitive(
                    center=center,
                    radius=radius,
                    start=start,
                    end=end,
                    turn=turn,
                )
            )
            continue

        warnings.append(f"Ignoring unsupported primitive kind at index {primitive_index}: '{kind}'.")

    return output, warnings


def _build_primitives_from_points(
    *,
    points: list[tuple[float, float]],
    fillet_radius: float,
    route_ref: str,
) -> tuple[list[dict[str, Any]], dict[str, int], list[str]]:
    warnings: list[str] = []
    primitives: list[dict[str, Any]] = []
    stats = {
        "drawnLines": 0,
        "drawnArcs": 0,
        "filletAppliedCorners": 0,
        "filletSkippedCorners": 0,
    }
    if len(points) < 2:
        return primitives, stats, warnings

    walk_start = points[0]
    for corner_index in range(1, len(points) - 1):
        current = points[corner_index]
        prev = points[corner_index - 1]
        next_point = points[corner_index + 1]

        if fillet_radius <= 0:
            primitives.append(_line_primitive(start=walk_start, end=current))
            walk_start = current
            continue

        fillet, skip_reason = _corner_fillet_geometry(
            prev=prev,
            current=current,
            next_point=next_point,
            radius=fillet_radius,
        )
        if fillet is None:
            if skip_reason and skip_reason != "near_collinear":
                stats["filletSkippedCorners"] += 1
                warnings.append(
                    f"Route '{route_ref}': fillet skipped at vertex {corner_index} ({skip_reason})."
                )
            primitives.append(_line_primitive(start=walk_start, end=current))
            walk_start = current
            continue

        entry = fillet["entry"]
        exit_point = fillet["exit"]
        center = fillet["center"]
        radius = float(fillet["radius"])
        turn = float(fillet["turn"])

        primitives.append(_line_primitive(start=walk_start, end=entry))
        primitives.append(
            _arc_primitive(
                center=center,
                radius=radius,
                start=entry,
                end=exit_point,
                turn=turn,
            )
        )
        walk_start = exit_point
        stats["filletAppliedCorners"] += 1

    primitives.append(_line_primitive(start=walk_start, end=points[-1]))
    compact: list[dict[str, Any]] = []
    for primitive in primitives:
        if primitive.get("kind") == "line":
            start = _point_from_payload(primitive.get("start"), field_name="line.start")
            end = _point_from_payload(primitive.get("end"), field_name="line.end")
            if math.hypot(end[0] - start[0], end[1] - start[1]) <= 1e-9:
                continue
        compact.append(primitive)

    stats["drawnLines"] = sum(1 for primitive in compact if primitive.get("kind") == "line")
    stats["drawnArcs"] = sum(1 for primitive in compact if primitive.get("kind") == "arc")
    return compact, stats, warnings


def canonicalize_route_for_sync(
    route: Mapping[str, Any],
    *,
    route_index: int = 0,
) -> tuple[dict[str, Any], list[str]]:
    route_ref = _route_ref(route, route_index=route_index)
    route_type = str(route.get("routeType") or route.get("route_type") or "conductor").strip().lower()
    fillet_radius = _route_fillet_radius(route)
    if route_type == "jumper":
        fillet_radius = 0.0
    points = _route_path_points(route, route_index=route_index)
    if route_type == "jumper":
        normalized_points = _dedupe_points(
            [_snap_point(point) for point in points],
            tolerance=POINT_DEDUPE_TOLERANCE,
        )
    else:
        normalized_points = _normalize_route_points_for_cad(points, fillet_radius=fillet_radius)
    primitives, stats, warnings = _build_primitives_from_points(
        points=normalized_points,
        fillet_radius=fillet_radius,
        route_ref=route_ref,
    )

    output_route = dict(route)
    output_route["path"] = [_point_as_payload(point) for point in normalized_points]
    output_route["filletRadius"] = float(fillet_radius)
    output_route["primitives"] = primitives
    output_route["geometryVersion"] = GEOMETRY_VERSION
    output_route["drawnLines"] = int(stats["drawnLines"])
    output_route["drawnArcs"] = int(stats["drawnArcs"])
    output_route["filletAppliedCorners"] = int(stats["filletAppliedCorners"])
    output_route["filletSkippedCorners"] = int(stats["filletSkippedCorners"])
    return output_route, warnings


def _draw_primitives(
    *,
    modelspace: Any,
    route_ref: str,
    primitives: list[dict[str, Any]],
    layer_name: str,
    aci_color: int | None,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> tuple[list[str], int, int, list[str]]:
    warnings: list[str] = []
    handles: list[str] = []
    drawn_lines = 0
    drawn_arcs = 0
    for primitive_index, primitive in enumerate(primitives):
        kind = str(primitive.get("kind") or "").strip().lower()
        if kind == "line":
            try:
                start = _point_from_payload(
                    primitive.get("start"),
                    field_name=f"route.primitives[{primitive_index}].start",
                )
                end = _point_from_payload(
                    primitive.get("end"),
                    field_name=f"route.primitives[{primitive_index}].end",
                )
            except ValueError as exc:
                warnings.append(f"Route '{route_ref}': {str(exc)}")
                continue
            handle = _draw_line_entity(
                modelspace=modelspace,
                start=start,
                end=end,
                layer_name=layer_name,
                aci_color=aci_color,
                pt_fn=pt_fn,
                dyn_fn=dyn_fn,
                com_call_with_retry_fn=com_call_with_retry_fn,
            )
            if handle:
                handles.append(handle)
                drawn_lines += 1
            continue

        if kind == "arc":
            try:
                center = _point_from_payload(
                    primitive.get("center"),
                    field_name=f"route.primitives[{primitive_index}].center",
                )
                start = _point_from_payload(
                    primitive.get("start"),
                    field_name=f"route.primitives[{primitive_index}].start",
                )
                end = _point_from_payload(
                    primitive.get("end"),
                    field_name=f"route.primitives[{primitive_index}].end",
                )
                radius = _to_float(
                    primitive.get("radius"),
                    field_name=f"route.primitives[{primitive_index}].radius",
                )
                turn = _to_float(
                    primitive.get("turn", 1.0),
                    field_name=f"route.primitives[{primitive_index}].turn",
                )
            except ValueError as exc:
                warnings.append(f"Route '{route_ref}': {str(exc)}")
                continue
            arc_handle = ""
            try:
                arc_handle = _draw_arc_entity(
                    modelspace=modelspace,
                    center=center,
                    radius=radius,
                    start=start,
                    end=end,
                    turn=turn,
                    layer_name=layer_name,
                    aci_color=aci_color,
                    dyn_fn=dyn_fn,
                    com_call_with_retry_fn=com_call_with_retry_fn,
                    pt_fn=pt_fn,
                )
            except Exception as exc:
                warnings.append(
                    f"Route '{route_ref}': failed to draw arc primitive {primitive_index} ({str(exc)})."
                )
            if arc_handle:
                handles.append(arc_handle)
                drawn_arcs += 1
                continue

            fallback = _draw_line_entity(
                modelspace=modelspace,
                start=start,
                end=end,
                layer_name=layer_name,
                aci_color=aci_color,
                pt_fn=pt_fn,
                dyn_fn=dyn_fn,
                com_call_with_retry_fn=com_call_with_retry_fn,
            )
            if fallback:
                handles.append(fallback)
                drawn_lines += 1
            warnings.append(
                f"Route '{route_ref}': arc primitive {primitive_index} fell back to straight segment."
            )
            continue

        warnings.append(f"Route '{route_ref}': ignoring unsupported primitive kind '{kind}'.")
    return handles, drawn_lines, drawn_arcs, warnings


def _delete_entity_handle(
    *,
    doc: Any,
    handle: str,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> bool:
    normalized = _safe_upper(handle)
    if not normalized:
        return False
    try:
        target = com_call_with_retry_fn(lambda: doc.HandleToObject(normalized))
    except Exception:
        return False
    if target is None:
        return False
    try:
        target = dyn_fn(target)
    except Exception:
        pass
    try:
        com_call_with_retry_fn(lambda: target.Delete())
        return True
    except Exception:
        return False


def _delete_handles_for_route(
    *,
    doc: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
    handles: list[str],
) -> tuple[int, list[str], list[str]]:
    deleted = 0
    deleted_handles: list[str] = []
    failed_handles: list[str] = []
    for handle in handles:
        normalized = _safe_upper(handle)
        if not normalized:
            continue
        ok = _delete_entity_handle(
            doc=doc,
            handle=normalized,
            dyn_fn=dyn_fn,
            com_call_with_retry_fn=com_call_with_retry_fn,
        )
        if ok:
            deleted += 1
            deleted_handles.append(normalized)
        else:
            failed_handles.append(normalized)
    return deleted, deleted_handles, failed_handles


def _draw_single_route(
    *,
    doc: Any,
    modelspace: Any,
    route: Mapping[str, Any],
    route_index: int,
    default_layer_name: str,
    annotate_refs: bool,
    text_height: float,
    ensure_layer_fn: Any,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> dict[str, Any]:
    warnings: list[str] = []
    ms = dyn_fn(modelspace)
    route_ref = _route_ref(route, route_index=route_index)

    canonical_route = dict(route)
    path_points: list[tuple[float, float]] = []
    primitives, primitive_warnings = _coerce_primitive_list(route)
    warnings.extend(primitive_warnings)

    try:
        path_points = _route_path_points(route, route_index=route_index)
    except ValueError:
        path_points = []

    if not primitives:
        try:
            canonical_route, canonical_warnings = canonicalize_route_for_sync(route, route_index=route_index)
            warnings.extend(canonical_warnings)
            path_points = [
                _point_from_payload(point, field_name=f"canonical.path[{index}]")
                for index, point in enumerate(canonical_route.get("path", []))
                if isinstance(point, Mapping)
            ]
            primitives, primitive_warnings = _coerce_primitive_list(canonical_route)
            warnings.extend(primitive_warnings)
        except ValueError as exc:
            return {
                "success": False,
                "drawn_routes": 0,
                "drawn_segments": 0,
                "drawn_lines": 0,
                "drawn_arcs": 0,
                "labels_drawn": 0,
                "fillet_applied_corners": 0,
                "fillet_skipped_corners": 0,
                "geometry_version": GEOMETRY_VERSION,
                "layers_used": [],
                "entity_handles": [],
                "warnings": [str(exc)],
            }

    if len(path_points) < 2:
        points_for_mid: list[tuple[float, float]] = []
        for primitive in primitives:
            if primitive.get("kind") != "line":
                continue
            try:
                points_for_mid.append(_point_from_payload(primitive.get("start"), field_name="primitive.start"))
                points_for_mid.append(_point_from_payload(primitive.get("end"), field_name="primitive.end"))
            except ValueError:
                continue
        path_points = _dedupe_points(points_for_mid, tolerance=POINT_DEDUPE_TOLERANCE)

    layer_name = _route_layer_name(canonical_route, default_layer_name=default_layer_name)
    aci_color = _resolve_aci_color(canonical_route)
    try:
        ensure_layer_fn(doc, layer_name, aci_color)
    except TypeError:
        ensure_layer_fn(doc, layer_name)

    entity_handles, drawn_lines, drawn_arcs, primitive_draw_warnings = _draw_primitives(
        modelspace=ms,
        route_ref=route_ref,
        primitives=primitives,
        layer_name=layer_name,
        aci_color=aci_color,
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )
    warnings.extend(primitive_draw_warnings)

    labels_drawn = 0
    if annotate_refs and route_ref and len(path_points) >= 2:
        anchor = _route_center_label_anchor(path_points)
        if anchor is None:
            warnings.append(f"Unable to compute route label anchor for '{route_ref}'.")
        else:
            handle, label_warning = _draw_route_label_entity(
                modelspace=ms,
                route_ref=route_ref,
                anchor=anchor,
                text_height=text_height,
                layer_name=layer_name,
                aci_color=aci_color,
                pt_fn=pt_fn,
                dyn_fn=dyn_fn,
                com_call_with_retry_fn=com_call_with_retry_fn,
            )
            if handle:
                entity_handles.append(handle)
                labels_drawn += 1
            if label_warning:
                warnings.append(f"Route '{route_ref}': {label_warning}")

    drawn_segments = drawn_lines + drawn_arcs
    fillet_applied = int(canonical_route.get("filletAppliedCorners", drawn_arcs) or 0)
    fillet_skipped = int(canonical_route.get("filletSkippedCorners", 0) or 0)
    geometry_version = str(canonical_route.get("geometryVersion") or GEOMETRY_VERSION)

    return {
        "success": drawn_segments > 0,
        "drawn_routes": 1 if drawn_segments > 0 else 0,
        "drawn_segments": drawn_segments,
        "drawn_lines": int(drawn_lines),
        "drawn_arcs": int(drawn_arcs),
        "labels_drawn": labels_drawn,
        "fillet_applied_corners": fillet_applied,
        "fillet_skipped_corners": fillet_skipped,
        "geometry_version": geometry_version,
        "layers_used": [layer_name],
        "entity_handles": entity_handles,
        "warnings": warnings,
    }


def _base_sync_data(
    *,
    operation: str,
    session_id: str,
    client_route_id: str,
    sync_status: str,
) -> dict[str, Any]:
    return {
        "operation": operation,
        "sessionId": session_id,
        "clientRouteId": client_route_id,
        "syncStatus": sync_status,
        "drawnRoutes": 0,
        "drawnSegments": 0,
        "drawnLines": 0,
        "drawnArcs": 0,
        "labelsDrawn": 0,
        "filletAppliedCorners": 0,
        "filletSkippedCorners": 0,
        "geometryVersion": GEOMETRY_VERSION,
        "deletedEntities": 0,
        "resetRoutes": 0,
        "layersUsed": [],
        "bindings": {},
    }


def sync_terminal_route_operation(
    *,
    doc: Any,
    modelspace: Any,
    payload: Mapping[str, Any],
    binding_store: MutableMapping[str, dict[str, list[str]]],
    ensure_layer_fn: Any,
    pt_fn: Any,
    dyn_fn: Any,
    com_call_with_retry_fn: Any,
) -> dict[str, Any]:
    operation = str(payload.get("operation") or "upsert").strip().lower()
    session_id = str(payload.get("sessionId") or "").strip()[:128]
    client_route_id = str(payload.get("clientRouteId") or "").strip()[:128]
    default_layer_name = str(payload.get("defaultLayerName") or "SUITE_WIRE_AUTO").strip()[:80]
    annotate_refs = bool(payload.get("annotateRefs", True))
    text_height = max(0.01, _to_float(payload.get("textHeight", 0.125), field_name="textHeight"))

    if not default_layer_name:
        default_layer_name = "SUITE_WIRE_AUTO"
    if operation not in {"upsert", "delete", "reset"}:
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "operation must be one of: upsert, delete, reset.",
            "data": _base_sync_data(
                operation=operation,
                session_id=session_id,
                client_route_id=client_route_id,
                sync_status="failed",
            ),
            "warnings": [],
        }
    if not session_id:
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "sessionId is required for terminal route sync operations.",
            "data": _base_sync_data(
                operation=operation,
                session_id="",
                client_route_id=client_route_id,
                sync_status="failed",
            ),
            "warnings": [],
        }

    session_bucket = binding_store.setdefault(session_id, {})
    warnings: list[str] = []

    if operation == "reset":
        deleted_entities = 0
        reset_routes = len(session_bucket)
        for route_id, handles in list(session_bucket.items()):
            deleted, _deleted_handles, failed_handles = _delete_handles_for_route(
                doc=doc,
                dyn_fn=dyn_fn,
                com_call_with_retry_fn=com_call_with_retry_fn,
                handles=list(handles),
            )
            deleted_entities += deleted
            if failed_handles:
                warnings.append(
                    f"Route {route_id}: could not delete {len(failed_handles)} CAD entity handle(s)."
                )
        binding_store.pop(session_id, None)
        data = _base_sync_data(
            operation=operation,
            session_id=session_id,
            client_route_id="",
            sync_status="reset",
        )
        data["deletedEntities"] = deleted_entities
        data["resetRoutes"] = reset_routes
        return {
            "success": True,
            "code": "",
            "message": f"Reset CAD sync session '{session_id}' ({reset_routes} route binding(s) cleared).",
            "data": data,
            "warnings": warnings,
        }

    if not client_route_id:
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "clientRouteId is required for upsert/delete operations.",
            "data": _base_sync_data(
                operation=operation,
                session_id=session_id,
                client_route_id="",
                sync_status="failed",
            ),
            "warnings": warnings,
        }

    existing_handles = list(session_bucket.get(client_route_id, []))

    if operation == "delete":
        deleted_entities, deleted_handles, failed_handles = _delete_handles_for_route(
            doc=doc,
            dyn_fn=dyn_fn,
            com_call_with_retry_fn=com_call_with_retry_fn,
            handles=existing_handles,
        )
        session_bucket.pop(client_route_id, None)
        if not session_bucket:
            binding_store.pop(session_id, None)
        if failed_handles:
            warnings.append(
                f"Route {client_route_id}: could not delete {len(failed_handles)} CAD entity handle(s)."
            )
        data = _base_sync_data(
            operation=operation,
            session_id=session_id,
            client_route_id=client_route_id,
            sync_status="deleted",
        )
        data["deletedEntities"] = deleted_entities
        data["bindings"] = {client_route_id: {"entityHandles": deleted_handles}}
        return {
            "success": True,
            "code": "",
            "message": f"Deleted CAD bindings for route '{client_route_id}' ({deleted_entities} entity(ies)).",
            "data": data,
            "warnings": warnings,
        }

    route = payload.get("route")
    if not isinstance(route, Mapping):
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "route object is required for upsert operation.",
            "data": _base_sync_data(
                operation=operation,
                session_id=session_id,
                client_route_id=client_route_id,
                sync_status="failed",
            ),
            "warnings": warnings,
        }

    deleted_entities, _deleted_handles, failed_handles = _delete_handles_for_route(
        doc=doc,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
        handles=existing_handles,
    )
    if failed_handles:
        warnings.append(
            f"Route {client_route_id}: could not delete {len(failed_handles)} stale CAD entity handle(s)."
        )

    draw_result = _draw_single_route(
        doc=doc,
        modelspace=modelspace,
        route=route,
        route_index=0,
        default_layer_name=default_layer_name,
        annotate_refs=annotate_refs,
        text_height=text_height,
        ensure_layer_fn=ensure_layer_fn,
        pt_fn=pt_fn,
        dyn_fn=dyn_fn,
        com_call_with_retry_fn=com_call_with_retry_fn,
    )
    warnings.extend(draw_result.get("warnings", []))
    entity_handles = [str(handle).strip().upper() for handle in draw_result.get("entity_handles", []) if str(handle).strip()]
    if draw_result.get("success"):
        session_bucket[client_route_id] = entity_handles
    else:
        session_bucket.pop(client_route_id, None)
        if not session_bucket:
            binding_store.pop(session_id, None)

    data = _base_sync_data(
        operation=operation,
        session_id=session_id,
        client_route_id=client_route_id,
        sync_status="synced" if draw_result.get("success") else "failed",
    )
    data["drawnRoutes"] = int(draw_result.get("drawn_routes", 0))
    data["drawnSegments"] = int(draw_result.get("drawn_segments", 0))
    data["drawnLines"] = int(draw_result.get("drawn_lines", 0))
    data["drawnArcs"] = int(draw_result.get("drawn_arcs", 0))
    data["labelsDrawn"] = int(draw_result.get("labels_drawn", 0))
    data["filletAppliedCorners"] = int(draw_result.get("fillet_applied_corners", 0))
    data["filletSkippedCorners"] = int(draw_result.get("fillet_skipped_corners", 0))
    data["geometryVersion"] = str(draw_result.get("geometry_version") or GEOMETRY_VERSION)
    data["deletedEntities"] = deleted_entities
    data["layersUsed"] = list(draw_result.get("layers_used", []))
    data["bindings"] = {
        client_route_id: {
            "entityHandles": entity_handles,
        }
    }

    return {
        "success": bool(draw_result.get("success")),
        "code": "" if draw_result.get("success") else "NO_VALID_ROUTES",
        "message": (
            f"Synced route '{client_route_id}' to CAD ({draw_result.get('drawn_segments', 0)} segment(s))."
            if draw_result.get("success")
            else f"Failed to sync route '{client_route_id}' to CAD."
        ),
        "data": data,
        "warnings": warnings,
    }
