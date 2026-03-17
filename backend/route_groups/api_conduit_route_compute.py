from __future__ import annotations

import heapq
import math
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

VALID_ROUTING_MODES = {"plan_view", "cable_tag", "schematic"}
VALID_OBSTACLE_TYPES = {
    "foundation",
    "building",
    "equipment_pad",
    "trench",
    "fence",
    "road",
}

DEFAULT_CANVAS_WIDTH = 980.0
DEFAULT_CANVAS_HEIGHT = 560.0
DEFAULT_GRID_STEP = 8.0
DEFAULT_CLEARANCE = 18.0


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip()
    except Exception:
        return ""


def _safe_float(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except Exception:
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _clamp_int(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(max_value, value))


def _sign(value: float) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def _parse_point(raw: Any, *, field_name: str, errors: List[str]) -> Optional[Dict[str, float]]:
    if not isinstance(raw, dict):
        errors.append(f"{field_name} must be an object with numeric x and y.")
        return None
    x = _safe_float(raw.get("x"))
    y = _safe_float(raw.get("y"))
    if x is None or y is None:
        errors.append(f"{field_name}.x and {field_name}.y must be finite numbers.")
        return None
    return {"x": x, "y": y}


def _parse_obstacles(raw: Any, warnings: List[str]) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        warnings.append("obstacles payload was not an array; no obstacles applied.")
        return []

    obstacles: List[Dict[str, Any]] = []
    for index, candidate in enumerate(raw):
        if not isinstance(candidate, dict):
            warnings.append(f"Obstacle #{index + 1} was not an object and was ignored.")
            continue

        x = _safe_float(candidate.get("x"))
        y = _safe_float(candidate.get("y"))
        w = _safe_float(candidate.get("w"))
        h = _safe_float(candidate.get("h"))
        if x is None or y is None or w is None or h is None:
            warnings.append(
                f"Obstacle #{index + 1} had invalid geometry and was ignored."
            )
            continue
        if w <= 0 or h <= 0:
            warnings.append(
                f"Obstacle #{index + 1} had non-positive width/height and was ignored."
            )
            continue

        obstacle_type = _safe_str(candidate.get("type")).lower() or "foundation"
        if obstacle_type not in VALID_OBSTACLE_TYPES:
            warnings.append(
                f"Obstacle #{index + 1} type '{obstacle_type}' is unsupported; using foundation."
            )
            obstacle_type = "foundation"

        obstacles.append(
            {
                "id": _safe_str(candidate.get("id")) or f"obstacle_{index + 1}",
                "type": obstacle_type,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "label": _safe_str(candidate.get("label")),
            }
        )
    return obstacles


def _inflate_rect(obstacle: Dict[str, Any], clearance: float) -> Dict[str, float]:
    return {
        "x": float(obstacle["x"]) - clearance,
        "y": float(obstacle["y"]) - clearance,
        "w": float(obstacle["w"]) + clearance * 2,
        "h": float(obstacle["h"]) + clearance * 2,
    }


def _point_in_rect(point: Dict[str, float], rect: Dict[str, float]) -> bool:
    return (
        point["x"] >= rect["x"]
        and point["x"] <= rect["x"] + rect["w"]
        and point["y"] >= rect["y"]
        and point["y"] <= rect["y"] + rect["h"]
    )


def _to_grid_point(
    point: Dict[str, float],
    *,
    step: float,
    cols: int,
    rows: int,
) -> Tuple[int, int]:
    x = _clamp_int(int(round(point["x"] / step)), 0, cols - 1)
    y = _clamp_int(int(round(point["y"] / step)), 0, rows - 1)
    return (x, y)


def _from_grid_point(point: Tuple[int, int], *, step: float) -> Dict[str, float]:
    return {"x": point[0] * step, "y": point[1] * step}


def _build_cost_grid(
    *,
    obstacles: Sequence[Dict[str, Any]],
    clearance: float,
    mode: str,
    canvas_width: float,
    canvas_height: float,
    grid_step: float,
) -> Tuple[List[List[float]], int, int]:
    cols = max(4, int(math.ceil(canvas_width / grid_step)))
    rows = max(4, int(math.ceil(canvas_height / grid_step)))
    grid: List[List[float]] = [[0.0 for _ in range(cols)] for _ in range(rows)]

    for obstacle in obstacles:
        obstacle_type = str(obstacle.get("type", "foundation")).lower()

        if obstacle_type == "fence":
            continue
        if mode == "schematic" and obstacle_type != "building":
            continue

        if obstacle_type == "trench":
            x0 = _clamp_int(int(math.floor(float(obstacle["x"]) / grid_step)), 0, cols - 1)
            y0 = _clamp_int(int(math.floor(float(obstacle["y"]) / grid_step)), 0, rows - 1)
            x1 = _clamp_int(
                int(math.ceil((float(obstacle["x"]) + float(obstacle["w"])) / grid_step)),
                0,
                cols - 1,
            )
            y1 = _clamp_int(
                int(math.ceil((float(obstacle["y"]) + float(obstacle["h"])) / grid_step)),
                0,
                rows - 1,
            )
            for row in range(y0, y1 + 1):
                for col in range(x0, x1 + 1):
                    if grid[row][col] >= 999:
                        continue
                    grid[row][col] = min(grid[row][col], -0.55)
            continue

        effective_clearance = 8.0 if mode == "schematic" else clearance
        hard = _inflate_rect(obstacle, effective_clearance)
        soft = _inflate_rect(obstacle, effective_clearance * 1.75)

        hard_x0 = _clamp_int(int(math.floor(hard["x"] / grid_step)), 0, cols - 1)
        hard_y0 = _clamp_int(int(math.floor(hard["y"] / grid_step)), 0, rows - 1)
        hard_x1 = _clamp_int(int(math.ceil((hard["x"] + hard["w"]) / grid_step)), 0, cols - 1)
        hard_y1 = _clamp_int(int(math.ceil((hard["y"] + hard["h"]) / grid_step)), 0, rows - 1)
        for row in range(hard_y0, hard_y1 + 1):
            for col in range(hard_x0, hard_x1 + 1):
                grid[row][col] = 999.0

        soft_x0 = _clamp_int(int(math.floor(soft["x"] / grid_step)), 0, cols - 1)
        soft_y0 = _clamp_int(int(math.floor(soft["y"] / grid_step)), 0, rows - 1)
        soft_x1 = _clamp_int(int(math.ceil((soft["x"] + soft["w"]) / grid_step)), 0, cols - 1)
        soft_y1 = _clamp_int(int(math.ceil((soft["y"] + soft["h"]) / grid_step)), 0, rows - 1)
        for row in range(soft_y0, soft_y1 + 1):
            for col in range(soft_x0, soft_x1 + 1):
                if grid[row][col] >= 999:
                    continue
                world = _from_grid_point((col, row), step=grid_step)
                if not _point_in_rect(world, soft) or _point_in_rect(world, hard):
                    continue
                grid[row][col] = max(grid[row][col], 1.8)

    return (grid, cols, rows)


def _simplify_path(path: Sequence[Dict[str, float]]) -> List[Dict[str, float]]:
    if len(path) <= 2:
        return [{"x": float(point["x"]), "y": float(point["y"])} for point in path]

    simplified: List[Dict[str, float]] = [dict(path[0])]
    for index in range(1, len(path) - 1):
        prev = simplified[-1]
        current = path[index]
        nxt = path[index + 1]
        dx1 = _sign(current["x"] - prev["x"])
        dy1 = _sign(current["y"] - prev["y"])
        dx2 = _sign(nxt["x"] - current["x"])
        dy2 = _sign(nxt["y"] - current["y"])
        if dx1 != dx2 or dy1 != dy2:
            simplified.append(dict(current))
    simplified.append(dict(path[-1]))
    return simplified


def _route_path(
    *,
    start: Dict[str, float],
    end: Dict[str, float],
    grid: Sequence[Sequence[float]],
    cols: int,
    rows: int,
    grid_step: float,
    mode: str,
) -> Dict[str, Any]:
    start_cell = _to_grid_point(start, step=grid_step, cols=cols, rows=rows)
    end_cell = _to_grid_point(end, step=grid_step, cols=cols, rows=rows)

    turn_penalty = 2.4 if mode == "schematic" else 4.8
    max_iterations = cols * rows * 3
    directions = ((1, 0), (-1, 0), (0, 1), (0, -1))

    open_heap: List[Tuple[float, int, int, int, float, int, int]] = []
    heap_counter = 0
    heapq.heappush(open_heap, (0.0, heap_counter, start_cell[0], start_cell[1], 0.0, -1, -1))

    closed: set[Tuple[int, int]] = set()
    g_scores: Dict[Tuple[int, int], float] = {start_cell: 0.0}
    parents: Dict[Tuple[int, int], Tuple[int, int]] = {}

    iterations = 0
    while open_heap and iterations < max_iterations:
        iterations += 1
        _, _, cx, cy, g_cost, px, py = heapq.heappop(open_heap)
        current = (cx, cy)

        best = g_scores.get(current)
        if best is None or g_cost > (best + 1e-9):
            continue
        if current in closed:
            continue
        closed.add(current)

        if current == end_cell:
            path: List[Dict[str, float]] = []
            walk = current
            path.insert(0, _from_grid_point(walk, step=grid_step))
            while walk in parents:
                walk = parents[walk]
                path.insert(0, _from_grid_point(walk, step=grid_step))
            path[0] = dict(start)
            path[-1] = dict(end)
            return {
                "path": _simplify_path(path),
                "iterations": iterations,
                "visitedNodes": len(closed),
                "fallbackUsed": False,
                "routeValid": True,
            }

        for dx, dy in directions:
            nx = cx + dx
            ny = cy + dy
            if nx < 0 or nx >= cols or ny < 0 or ny >= rows:
                continue
            if grid[ny][nx] >= 999:
                continue
            neighbor = (nx, ny)
            if neighbor in closed:
                continue

            movement_cost = 1.0 + max(0.0, float(grid[ny][nx]) * 2.2)
            if grid[ny][nx] < 0:
                movement_cost = max(0.1, movement_cost - abs(float(grid[ny][nx])))

            if px >= 0:
                prev_dx = cx - px
                prev_dy = cy - py
                if prev_dx != dx or prev_dy != dy:
                    movement_cost += turn_penalty

            tentative_g = g_cost + movement_cost
            prev_best = g_scores.get(neighbor)
            if prev_best is not None and tentative_g >= prev_best:
                continue

            g_scores[neighbor] = tentative_g
            parents[neighbor] = current

            h = abs(nx - end_cell[0]) + abs(ny - end_cell[1])
            heap_counter += 1
            heapq.heappush(
                open_heap,
                (tentative_g + float(h), heap_counter, nx, ny, tentative_g, cx, cy),
            )

    return {
        "path": [],
        "iterations": iterations,
        "visitedNodes": len(closed),
        "fallbackUsed": False,
        "routeValid": False,
    }


def _path_length(path: Sequence[Dict[str, float]]) -> float:
    total = 0.0
    for index in range(1, len(path)):
        total += math.hypot(
            float(path[index]["x"]) - float(path[index - 1]["x"]),
            float(path[index]["y"]) - float(path[index - 1]["y"]),
        )
    return total


def _bend_count(path: Sequence[Dict[str, float]]) -> int:
    bends = 0
    for index in range(2, len(path)):
        dx1 = _sign(float(path[index - 1]["x"]) - float(path[index - 2]["x"]))
        dy1 = _sign(float(path[index - 1]["y"]) - float(path[index - 2]["y"]))
        dx2 = _sign(float(path[index]["x"]) - float(path[index - 1]["x"]))
        dy2 = _sign(float(path[index]["y"]) - float(path[index - 1]["y"]))
        if dx1 != dx2 or dy1 != dy2:
            bends += 1
    return bends


def _route_tag(path: Sequence[Dict[str, float]], text: str) -> Dict[str, Any]:
    if len(path) < 2:
        return {"text": text, "position": dict(path[0] if path else {"x": 0.0, "y": 0.0}), "angleDeg": 0.0}

    longest_index = 0
    longest_length = -1.0
    for index in range(len(path) - 1):
        length = math.hypot(
            float(path[index + 1]["x"]) - float(path[index]["x"]),
            float(path[index + 1]["y"]) - float(path[index]["y"]),
        )
        if length > longest_length:
            longest_length = length
            longest_index = index

    a = path[longest_index]
    b = path[longest_index + 1]
    angle = math.degrees(math.atan2(float(b["y"]) - float(a["y"]), float(b["x"]) - float(a["x"])))
    if angle > 90:
        angle -= 180
    if angle < -90:
        angle += 180

    return {
        "text": text,
        "position": {
            "x": (float(a["x"]) + float(b["x"])) / 2,
            "y": (float(a["y"]) + float(b["y"])) / 2,
        },
        "angleDeg": angle,
    }


def compute_conduit_route(payload: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    start = _parse_point(payload.get("start"), field_name="start", errors=errors)
    end = _parse_point(payload.get("end"), field_name="end", errors=errors)

    mode = _safe_str(payload.get("mode")).lower() or "plan_view"
    if mode not in VALID_ROUTING_MODES:
        errors.append("mode must be one of: plan_view, cable_tag, schematic.")

    clearance = _safe_float(payload.get("clearance"))
    if clearance is None:
        clearance = DEFAULT_CLEARANCE
    clearance = _clamp(clearance, 0.0, 200.0)

    canvas_width = _safe_float(payload.get("canvasWidth"))
    if canvas_width is None:
        canvas_width = DEFAULT_CANVAS_WIDTH
    canvas_width = _clamp(canvas_width, 120.0, 12000.0)

    canvas_height = _safe_float(payload.get("canvasHeight"))
    if canvas_height is None:
        canvas_height = DEFAULT_CANVAS_HEIGHT
    canvas_height = _clamp(canvas_height, 120.0, 12000.0)

    grid_step = _safe_float(payload.get("gridStep"))
    if grid_step is None:
        grid_step = DEFAULT_GRID_STEP
    grid_step = _clamp(grid_step, 2.0, 128.0)

    obstacles = _parse_obstacles(payload.get("obstacles"), warnings)

    if errors:
        return {
            "success": False,
            "code": "INVALID_REQUEST",
            "message": " ".join(errors),
            "warnings": warnings,
        }

    assert start is not None
    assert end is not None

    started_at = time.time()
    grid, cols, rows = _build_cost_grid(
        obstacles=obstacles,
        clearance=clearance,
        mode=mode,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        grid_step=grid_step,
    )
    route = _route_path(
        start=start,
        end=end,
        grid=grid,
        cols=cols,
        rows=rows,
        grid_step=grid_step,
        mode=mode,
    )
    elapsed_ms = int((time.time() - started_at) * 1000)

    path = route["path"]
    route_valid = bool(route.get("routeValid", len(path) >= 2))
    if not route_valid or len(path) < 2:
        return {
            "success": False,
            "code": "ROUTE_BLOCKED",
            "message": "No valid route was found for the requested points and obstacle constraints.",
            "warnings": warnings,
            "meta": {
                "computeMs": elapsed_ms,
                "iterations": route.get("iterations", 0),
                "visitedNodes": route.get("visitedNodes", 0),
                "fallbackUsed": bool(route.get("fallbackUsed")),
                "routeValid": False,
            },
        }

    length = _path_length(path)
    bends = _bend_count(path)

    tag_text = _safe_str(payload.get("tagText"))[:120]
    tag = _route_tag(path, tag_text) if mode == "cable_tag" and tag_text else None

    return {
        "success": True,
        "code": "",
        "message": "Route computed.",
        "data": {
            "path": path,
            "length": length,
            "bendCount": bends,
            "bendDegrees": bends * 90,
            "tag": tag,
        },
        "meta": {
            "computeMs": elapsed_ms,
            "iterations": route.get("iterations", 0),
            "visitedNodes": route.get("visitedNodes", 0),
            "fallbackUsed": bool(route.get("fallbackUsed")),
            "routeValid": True,
            "gridCols": cols,
            "gridRows": rows,
            "gridStep": grid_step,
            "obstacleCount": len(obstacles),
            "mode": mode,
            "clearance": clearance,
        },
        "warnings": warnings,
    }
