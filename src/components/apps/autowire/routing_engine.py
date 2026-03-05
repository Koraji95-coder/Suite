"""
ConduitRoute — Routing Engine
==============================
Core pathfinding engine with multiple routing modes:

  1. SCHEMATIC mode  — Wire routing on wiring diagrams (Manhattan, jumps)
  2. PLAN VIEW mode  — Conduit routing around foundations/geometry with clearance
  3. CABLE TAG mode   — Line + text annotation (cable run markers on plan views)

The engine reads obstacle geometry (foundations, equipment pads, structures)
from AutoCAD layers and inflates them by a configurable clearance buffer
before routing. Routes are computed using A* on a discretized grid with
weighted turn penalties and corridor preferences.

Usage:
    from routing_engine import RoutingEngine, RoutingMode, RouteRequest

    engine = RoutingEngine()

    # Load obstacles from AutoCAD scan (or JSON export)
    engine.load_obstacles_from_json("obstacles.json")

    # Route in plan view mode with foundation avoidance
    result = engine.route(RouteRequest(
        start=(10.0, 25.0),
        end=(85.0, 60.0),
        mode=RoutingMode.PLAN_VIEW,
        clearance=3.0,         # 3-foot clearance from foundations
        cable_ref="487B-001",
        cable_tag="487B-001 Z01",  # For cable tag mode
    ))

    # result.path = [(10,25), (10,30), (30,30), (30,55), (85,55), (85,60)]
    # result.length = 142.5  (total path length in drawing units)
    # result.bends = 4
    # result.segments = [Segment(...), ...]
"""

from __future__ import annotations

import heapq
import json
import logging
import math
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, Union

logger = logging.getLogger("conduitroute.routing")


# ═══════════════════════════════════════════════════════════════════════════════
# Data Types
# ═══════════════════════════════════════════════════════════════════════════════

class RoutingMode(str, Enum):
    SCHEMATIC = "schematic"      # Wiring diagram wire routing
    PLAN_VIEW = "plan_view"      # Physical conduit routing (yard plan)
    CABLE_TAG = "cable_tag"      # Line + text annotation only


class ObstacleType(str, Enum):
    FOUNDATION = "foundation"          # Equipment foundations
    EQUIPMENT_PAD = "equipment_pad"    # Concrete pads
    STRUCTURE = "structure"            # Steel structures, columns
    BUILDING = "building"              # Control house, buildings
    EXISTING_CONDUIT = "existing_conduit"  # Already-routed conduit
    TRENCH = "trench"                  # Existing trenches (may be routable)
    FENCE = "fence"                    # Perimeter fencing
    KEEPOUT = "keepout"                # Generic exclusion zone
    ROAD = "road"                      # Access roads


# Layers in AutoCAD that typically contain these obstacle types
OBSTACLE_LAYER_MAP = {
    "S-FNDN": ObstacleType.FOUNDATION,
    "S-FOUNDATION": ObstacleType.FOUNDATION,
    "FNDN": ObstacleType.FOUNDATION,
    "FOUNDATION": ObstacleType.FOUNDATION,
    "S-CONC": ObstacleType.EQUIPMENT_PAD,
    "CONCRETE": ObstacleType.EQUIPMENT_PAD,
    "PAD": ObstacleType.EQUIPMENT_PAD,
    "S-STRU": ObstacleType.STRUCTURE,
    "S-STEEL": ObstacleType.STRUCTURE,
    "STRUCTURE": ObstacleType.STRUCTURE,
    "A-WALL": ObstacleType.BUILDING,
    "BUILDING": ObstacleType.BUILDING,
    "CTRL-HOUSE": ObstacleType.BUILDING,
    "E-CONDUIT": ObstacleType.EXISTING_CONDUIT,
    "E-TRENCH": ObstacleType.TRENCH,
    "TRENCH": ObstacleType.TRENCH,
    "FENCE": ObstacleType.FENCE,
    "S-FENCE": ObstacleType.FENCE,
    "ROAD": ObstacleType.ROAD,
    "KEEPOUT": ObstacleType.KEEPOUT,
}

# Default clearance per obstacle type (in drawing units, typically feet)
DEFAULT_CLEARANCES = {
    ObstacleType.FOUNDATION: 3.0,
    ObstacleType.EQUIPMENT_PAD: 2.0,
    ObstacleType.STRUCTURE: 2.5,
    ObstacleType.BUILDING: 1.0,       # Can route close to building walls
    ObstacleType.EXISTING_CONDUIT: 1.0,
    ObstacleType.TRENCH: 0.0,         # Trenches are routable corridors
    ObstacleType.FENCE: 4.0,
    ObstacleType.KEEPOUT: 0.5,
    ObstacleType.ROAD: 2.0,
}

# ─── Wire color standards ────────────────────────────────────────────────────

WIRE_COLORS = {
    "AC": {
        "Phase A":    {"code": "BK",    "acad_color": 7,  "hex": "#1a1a1a"},
        "Phase B":    {"code": "RD",    "acad_color": 1,  "hex": "#dc2626"},
        "Phase C":    {"code": "BL",    "acad_color": 5,  "hex": "#2563eb"},
        "Neutral":    {"code": "WH",    "acad_color": 9,  "hex": "#e5e5e5"},
        "Ground":     {"code": "GN",    "acad_color": 3,  "hex": "#16a34a"},
        "Ground Alt": {"code": "GN/YL", "acad_color": 82, "hex": "#a3e635"},
    },
    "DC": {
        "Positive":    {"code": "RD",    "acad_color": 1,  "hex": "#dc2626"},
        "Negative":    {"code": "BK",    "acad_color": 7,  "hex": "#1a1a1a"},
        "Pos Alt":     {"code": "BL",    "acad_color": 5,  "hex": "#2563eb"},
        "Neg Alt":     {"code": "WH",    "acad_color": 9,  "hex": "#e5e5e5"},
        "Ground":      {"code": "GN",    "acad_color": 3,  "hex": "#16a34a"},
        "Return":      {"code": "WH/BK", "acad_color": 8,  "hex": "#9ca3af"},
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# Geometry Primitives
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Point:
    x: float
    y: float

    def dist_to(self, other: Point) -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def __add__(self, other):
        return Point(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Point(self.x - other.x, self.y - other.y)


@dataclass
class BoundingBox:
    """Axis-aligned bounding box."""
    min_x: float
    min_y: float
    max_x: float
    max_y: float

    @property
    def width(self) -> float:
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        return self.max_y - self.min_y

    @property
    def center(self) -> Point:
        return Point((self.min_x + self.max_x) / 2, (self.min_y + self.max_y) / 2)

    def inflated(self, clearance: float) -> BoundingBox:
        """Return a new bbox expanded by clearance on all sides."""
        return BoundingBox(
            self.min_x - clearance,
            self.min_y - clearance,
            self.max_x + clearance,
            self.max_y + clearance,
        )

    def contains_point(self, p: Point) -> bool:
        return self.min_x <= p.x <= self.max_x and self.min_y <= p.y <= self.max_y

    def overlaps(self, other: BoundingBox) -> bool:
        return not (
            self.max_x < other.min_x or other.max_x < self.min_x or
            self.max_y < other.min_y or other.max_y < self.min_y
        )


@dataclass
class Polygon:
    """Closed polygon defined by ordered vertices."""
    points: list[Point]

    @property
    def bbox(self) -> BoundingBox:
        xs = [p.x for p in self.points]
        ys = [p.y for p in self.points]
        return BoundingBox(min(xs), min(ys), max(xs), max(ys))

    def contains_point(self, p: Point) -> bool:
        """Ray casting point-in-polygon test."""
        n = len(self.points)
        inside = False
        j = n - 1
        for i in range(n):
            pi, pj = self.points[i], self.points[j]
            if ((pi.y > p.y) != (pj.y > p.y)) and \
               (p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x):
                inside = not inside
            j = i
        return inside

    def inflated(self, clearance: float) -> BoundingBox:
        """Simplified: return inflated bounding box for clearance zone."""
        # For production: use proper polygon offset (Minkowski sum)
        # For now: bbox + clearance is a good enough approximation
        return self.bbox.inflated(clearance)


# ═══════════════════════════════════════════════════════════════════════════════
# Obstacle Model
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Obstacle:
    """An obstacle in the drawing that routes must avoid."""
    id: str
    obstacle_type: ObstacleType
    geometry: Union[BoundingBox, Polygon]
    layer: str = ""
    label: str = ""
    clearance_override: Optional[float] = None  # Override default clearance

    @property
    def clearance(self) -> float:
        if self.clearance_override is not None:
            return self.clearance_override
        return DEFAULT_CLEARANCES.get(self.obstacle_type, 2.0)

    @property
    def exclusion_zone(self) -> BoundingBox:
        """Bounding box inflated by clearance — the actual no-go zone."""
        if isinstance(self.geometry, BoundingBox):
            return self.geometry.inflated(self.clearance)
        else:
            return self.geometry.inflated(self.clearance)

    def blocks_point(self, p: Point) -> bool:
        """Check if a point falls within the exclusion zone."""
        zone = self.exclusion_zone
        return zone.contains_point(p)


# ═══════════════════════════════════════════════════════════════════════════════
# Route Request & Result
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class RouteRequest:
    """Input to the routing engine."""
    start: tuple[float, float]
    end: tuple[float, float]
    mode: RoutingMode = RoutingMode.PLAN_VIEW
    clearance: float = 3.0           # Global clearance override (0 = use defaults)
    cable_type: str = "DC"           # AC or DC
    wire_function: str = "Positive"  # Wire function for color
    cable_ref: str = ""              # Cable reference (e.g. "DC-001")
    cable_tag: str = ""              # Full tag text for CABLE_TAG mode
    waypoints: list[tuple[float, float]] = field(default_factory=list)
    prefer_trench: bool = True       # Prefer routing through existing trenches
    max_bends: int = 360             # NEC max total bends between pull points
    grid_resolution: float = 1.0     # Grid cell size (smaller = finer routing)


@dataclass
class RouteSegment:
    """A single segment of a computed route."""
    start: Point
    end: Point
    direction: str  # "N", "S", "E", "W"
    length: float
    is_bend: bool = False
    bend_angle: float = 0.0  # Degrees (90 for right angle)

    @property
    def midpoint(self) -> Point:
        return Point((self.start.x + self.end.x) / 2, (self.start.y + self.end.y) / 2)


@dataclass
class RouteResult:
    """Output from the routing engine."""
    success: bool
    path: list[Point]                # Ordered waypoints
    segments: list[RouteSegment]     # Individual segments
    length: float                    # Total path length
    bend_count: int                  # Number of direction changes
    total_bend_degrees: float        # Cumulative bend angle
    request: RouteRequest
    obstacles_avoided: list[str]     # IDs of obstacles that influenced the route
    warnings: list[str] = field(default_factory=list)

    # For CABLE_TAG mode
    tag_position: Optional[Point] = None  # Where to place the tag text
    tag_angle: float = 0.0                # Rotation for the tag text


# ═══════════════════════════════════════════════════════════════════════════════
# A* Pathfinder with Obstacle Avoidance
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(order=True)
class _AStarNode:
    f: float
    g: float = field(compare=False)
    x: int = field(compare=False)
    y: int = field(compare=False)
    parent: Optional[_AStarNode] = field(compare=False, default=None)


class GridRouter:
    """
    A* grid-based router with obstacle avoidance and clearance buffers.

    The routing area is discretized into a grid. Each cell is marked as
    blocked if it falls within any obstacle's exclusion zone. The A*
    algorithm then finds the optimal path through unblocked cells with
    weighted turn penalties to produce clean orthogonal routes.
    """

    def __init__(
        self,
        bounds: BoundingBox,
        resolution: float = 1.0,
        turn_penalty: float = 5.0,
        proximity_penalty_factor: float = 0.5,
    ):
        self.bounds = bounds
        self.resolution = resolution
        self.turn_penalty = turn_penalty
        self.proximity_penalty_factor = proximity_penalty_factor

        # Grid dimensions
        self.cols = max(1, int(math.ceil(bounds.width / resolution)))
        self.rows = max(1, int(math.ceil(bounds.height / resolution)))

        # Grid: 0 = free, 1 = hard blocked, 0-1 = soft cost
        self.grid = [[0.0] * self.cols for _ in range(self.rows)]

        # Trench corridors get a routing bonus (lower cost)
        self.trench_bonus = [[0.0] * self.cols for _ in range(self.rows)]

        self._obstacles: list[Obstacle] = []

    def world_to_grid(self, p: Point) -> tuple[int, int]:
        gx = int((p.x - self.bounds.min_x) / self.resolution)
        gy = int((p.y - self.bounds.min_y) / self.resolution)
        return (
            max(0, min(self.cols - 1, gx)),
            max(0, min(self.rows - 1, gy)),
        )

    def grid_to_world(self, gx: int, gy: int) -> Point:
        return Point(
            self.bounds.min_x + gx * self.resolution + self.resolution / 2,
            self.bounds.min_y + gy * self.resolution + self.resolution / 2,
        )

    def add_obstacle(self, obstacle: Obstacle, global_clearance: float = 0.0):
        """
        Rasterize an obstacle onto the grid.

        The obstacle's exclusion zone (geometry + clearance) is marked as
        blocked. An additional proximity gradient is applied around the
        exclusion zone to discourage routes from passing too close.
        """
        self._obstacles.append(obstacle)

        clearance = global_clearance if global_clearance > 0 else obstacle.clearance
        zone = obstacle.geometry
        if isinstance(zone, BoundingBox):
            hard_zone = zone.inflated(clearance)
        else:
            hard_zone = zone.inflated(clearance)

        # Soft zone: additional gradient for proximity penalty
        soft_clearance = clearance * 1.5
        if isinstance(zone, BoundingBox):
            soft_zone = zone.inflated(soft_clearance)
        else:
            soft_zone = zone.inflated(soft_clearance)

        # Rasterize hard block
        gx_min, gy_min = self.world_to_grid(Point(hard_zone.min_x, hard_zone.min_y))
        gx_max, gy_max = self.world_to_grid(Point(hard_zone.max_x, hard_zone.max_y))

        for gy in range(gy_min, min(gy_max + 1, self.rows)):
            for gx in range(gx_min, min(gx_max + 1, self.cols)):
                wp = self.grid_to_world(gx, gy)
                if hard_zone.contains_point(wp):
                    self.grid[gy][gx] = 1.0  # Hard block

        # Rasterize soft proximity gradient
        sgx_min, sgy_min = self.world_to_grid(Point(soft_zone.min_x, soft_zone.min_y))
        sgx_max, sgy_max = self.world_to_grid(Point(soft_zone.max_x, soft_zone.max_y))

        for gy in range(sgy_min, min(sgy_max + 1, self.rows)):
            for gx in range(sgx_min, min(sgx_max + 1, self.cols)):
                if self.grid[gy][gx] >= 1.0:
                    continue  # Already hard-blocked
                wp = self.grid_to_world(gx, gy)
                if soft_zone.contains_point(wp) and not hard_zone.contains_point(wp):
                    # Proximity cost: closer to obstacle = higher cost
                    dist_to_hard = self._distance_to_box(wp, hard_zone)
                    gradient_width = soft_clearance - clearance
                    if gradient_width > 0:
                        proximity = 1.0 - (dist_to_hard / gradient_width)
                        cost = max(0, proximity * self.proximity_penalty_factor)
                        self.grid[gy][gx] = max(self.grid[gy][gx], cost)

    def add_trench_corridor(self, bbox: BoundingBox, bonus: float = 0.3):
        """Mark a trench as a preferred routing corridor (lower cost)."""
        gx_min, gy_min = self.world_to_grid(Point(bbox.min_x, bbox.min_y))
        gx_max, gy_max = self.world_to_grid(Point(bbox.max_x, bbox.max_y))

        for gy in range(gy_min, min(gy_max + 1, self.rows)):
            for gx in range(gx_min, min(gx_max + 1, self.cols)):
                if self.grid[gy][gx] < 1.0:
                    self.trench_bonus[gy][gx] = bonus

    def route(
        self,
        start: Point,
        end: Point,
        waypoints: Optional[list[Point]] = None,
    ) -> Optional[list[Point]]:
        """
        Find optimal path from start to end, optionally through waypoints.

        Returns list of world-coordinate Points, or None if no path found.
        """
        points_to_route = [start]
        if waypoints:
            points_to_route.extend(waypoints)
        points_to_route.append(end)

        full_path: list[Point] = []

        for i in range(len(points_to_route) - 1):
            seg_start = points_to_route[i]
            seg_end = points_to_route[i + 1]

            seg_path = self._astar(seg_start, seg_end)
            if seg_path is None:
                logger.warning(
                    f"No path found between "
                    f"({seg_start.x:.1f},{seg_start.y:.1f}) and "
                    f"({seg_end.x:.1f},{seg_end.y:.1f})"
                )
                return None

            # Avoid duplicating shared waypoints
            if full_path and seg_path:
                seg_path = seg_path[1:]
            full_path.extend(seg_path)

        # Simplify path: remove collinear intermediate points
        simplified = self._simplify_path(full_path)
        return simplified

    def _astar(self, start: Point, end: Point) -> Optional[list[Point]]:
        """Core A* implementation on the grid."""
        sx, sy = self.world_to_grid(start)
        ex, ey = self.world_to_grid(end)

        # Ensure start/end aren't blocked (force-clear them)
        # This handles cases where terminals are on top of geometry
        self.grid[sy][sx] = min(self.grid[sy][sx], 0.5)
        self.grid[ey][ex] = min(self.grid[ey][ex], 0.5)

        # Directions: N, S, E, W
        dirs = [(0, -1), (0, 1), (1, 0), (-1, 0)]

        start_node = _AStarNode(f=0, g=0, x=sx, y=sy)
        open_heap = [start_node]
        g_scores: dict[tuple[int, int], float] = {(sx, sy): 0}
        parents: dict[tuple[int, int], tuple[int, int, int, int]] = {}
        closed: set[tuple[int, int]] = set()

        def heuristic(ax: int, ay: int) -> float:
            return abs(ax - ex) + abs(ay - ey)

        iterations = 0
        max_iterations = self.cols * self.rows * 3

        while open_heap and iterations < max_iterations:
            iterations += 1
            current = heapq.heappop(open_heap)
            cx, cy = current.x, current.y

            if cx == ex and cy == ey:
                # Reconstruct path
                path = [self.grid_to_world(ex, ey)]
                pos = (ex, ey)
                while pos in parents:
                    px, py, _, _ = parents[pos]
                    path.append(self.grid_to_world(px, py))
                    pos = (px, py)
                path.reverse()
                # Snap first/last to exact start/end
                path[0] = start
                path[-1] = end
                return path

            if (cx, cy) in closed:
                continue
            closed.add((cx, cy))

            for dx, dy in dirs:
                nx, ny = cx + dx, cy + dy
                if nx < 0 or nx >= self.cols or ny < 0 or ny >= self.rows:
                    continue
                if (nx, ny) in closed:
                    continue
                if self.grid[ny][nx] >= 1.0:
                    continue  # Hard blocked

                # Movement cost
                base_cost = 1.0
                # Add soft obstacle cost
                base_cost += self.grid[ny][nx] * 3.0
                # Subtract trench bonus
                base_cost -= self.trench_bonus[ny][nx]
                base_cost = max(0.1, base_cost)

                # Turn penalty
                turn_cost = 0.0
                if (cx, cy) in parents:
                    ppx, ppy, pdx, pdy = parents[(cx, cy)]
                    prev_dx, prev_dy = cx - ppx, cy - ppy
                    if (prev_dx != dx or prev_dy != dy):
                        turn_cost = self.turn_penalty

                tentative_g = current.g + base_cost + turn_cost
                existing_g = g_scores.get((nx, ny))

                if existing_g is None or tentative_g < existing_g:
                    g_scores[(nx, ny)] = tentative_g
                    h = heuristic(nx, ny)
                    f = tentative_g + h
                    heapq.heappush(open_heap, _AStarNode(f=f, g=tentative_g, x=nx, y=ny))
                    parents[(nx, ny)] = (cx, cy, dx, dy)

        logger.warning(f"A* exhausted after {iterations} iterations")
        return None

    def _simplify_path(self, path: list[Point]) -> list[Point]:
        """Remove collinear intermediate points."""
        if len(path) <= 2:
            return path

        simplified = [path[0]]
        for i in range(1, len(path) - 1):
            prev = simplified[-1]
            curr = path[i]
            next_p = path[i + 1]

            # Check if prev->curr->next are collinear
            dx1 = curr.x - prev.x
            dy1 = curr.y - prev.y
            dx2 = next_p.x - curr.x
            dy2 = next_p.y - curr.y

            # Normalize to direction
            def sign(v):
                if abs(v) < 1e-9:
                    return 0
                return 1 if v > 0 else -1

            if sign(dx1) != sign(dx2) or sign(dy1) != sign(dy2):
                simplified.append(curr)

        simplified.append(path[-1])
        return simplified

    @staticmethod
    def _distance_to_box(p: Point, box: BoundingBox) -> float:
        """Distance from point to nearest edge of bounding box."""
        dx = max(box.min_x - p.x, 0, p.x - box.max_x)
        dy = max(box.min_y - p.y, 0, p.y - box.max_y)
        return math.hypot(dx, dy)

    def get_blocked_cells_for_debug(self) -> list[dict]:
        """Export blocked cells for visualization."""
        cells = []
        for gy in range(self.rows):
            for gx in range(self.cols):
                val = self.grid[gy][gx]
                if val > 0.01:
                    wp = self.grid_to_world(gx, gy)
                    cells.append({
                        "x": wp.x, "y": wp.y,
                        "gx": gx, "gy": gy,
                        "cost": val,
                        "blocked": val >= 1.0,
                    })
        return cells


# ═══════════════════════════════════════════════════════════════════════════════
# Route Post-Processing
# ═══════════════════════════════════════════════════════════════════════════════

def compute_segments(path: list[Point]) -> list[RouteSegment]:
    """Convert a path of points into directional segments."""
    segments = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        dx = b.x - a.x
        dy = b.y - a.y
        length = math.hypot(dx, dy)

        if abs(dx) > abs(dy):
            direction = "E" if dx > 0 else "W"
        else:
            direction = "N" if dy < 0 else "S"  # Y-up convention

        is_bend = False
        bend_angle = 0.0
        if i > 0:
            prev_seg = segments[-1]
            if prev_seg.direction != direction:
                is_bend = True
                bend_angle = 90.0  # Manhattan routing = always 90°

        segments.append(RouteSegment(
            start=a, end=b,
            direction=direction,
            length=length,
            is_bend=is_bend,
            bend_angle=bend_angle,
        ))

    return segments


def compute_tag_placement(path: list[Point]) -> tuple[Point, float]:
    """
    For CABLE_TAG mode: determine the best position and angle
    for the cable tag text along the route.

    Strategy: place at the midpoint of the longest straight segment.
    """
    if len(path) < 2:
        return Point(0, 0), 0.0

    segments = compute_segments(path)
    if not segments:
        return path[0], 0.0

    # Find longest segment
    longest = max(segments, key=lambda s: s.length)
    mid = longest.midpoint

    # Angle of segment
    dx = longest.end.x - longest.start.x
    dy = longest.end.y - longest.start.y
    angle = math.degrees(math.atan2(dy, dx))

    # Keep text readable (not upside down)
    if angle > 90:
        angle -= 180
    elif angle < -90:
        angle += 180

    return mid, angle


# ═══════════════════════════════════════════════════════════════════════════════
# Main Engine
# ═══════════════════════════════════════════════════════════════════════════════

class RoutingEngine:
    """
    Top-level routing engine that manages obstacles and computes routes.
    """

    def __init__(self):
        self.obstacles: list[Obstacle] = []
        self._bounds: Optional[BoundingBox] = None
        self._cable_counter = {"AC": 0, "DC": 0}

    def set_bounds(self, min_x: float, min_y: float, max_x: float, max_y: float):
        """Set the routing area bounds (typically from drawing extents)."""
        self._bounds = BoundingBox(min_x, min_y, max_x, max_y)

    def add_obstacle(self, obstacle: Obstacle):
        """Add an obstacle to the routing model."""
        self.obstacles.append(obstacle)
        logger.debug(f"Added obstacle: {obstacle.id} ({obstacle.obstacle_type.value})")

    def load_obstacles_from_acad(self, acad_connector) -> int:
        """
        Scan AutoCAD drawing for obstacles on known layers.

        Uses the acad_connector module to iterate through entities
        on foundation/structure/building layers and extract their geometry.
        """
        if not acad_connector.is_connected():
            raise RuntimeError("AutoCAD not connected")

        count = 0
        model_space = acad_connector.model_space
        total_entities = model_space.Count

        for i in range(total_entities):
            try:
                entity = model_space.Item(i)
                layer = entity.Layer.upper()

                # Check if this layer contains obstacles
                obs_type = None
                for layer_pattern, otype in OBSTACLE_LAYER_MAP.items():
                    if layer_pattern in layer:
                        obs_type = otype
                        break

                if obs_type is None:
                    continue

                # Extract geometry based on entity type
                entity_type = entity.EntityName

                if entity_type in ("AcDbPolyline", "AcDbLWPolyline", "AcDb2dPolyline"):
                    # Closed polyline = polygon obstacle
                    coords = entity.Coordinates
                    points = []
                    for j in range(0, len(coords), 2):
                        points.append(Point(coords[j], coords[j + 1]))
                    if len(points) >= 3:
                        geom = Polygon(points)
                    else:
                        continue

                elif entity_type == "AcDbCircle":
                    # Circle → bounding box
                    center = entity.Center
                    radius = entity.Radius
                    geom = BoundingBox(
                        center[0] - radius, center[1] - radius,
                        center[0] + radius, center[1] + radius,
                    )

                elif entity_type in ("AcDbLine",):
                    # Lines on obstacle layers: treat as thin rectangle
                    sp = entity.StartPoint
                    ep = entity.EndPoint
                    min_x = min(sp[0], ep[0]) - 0.5
                    min_y = min(sp[1], ep[1]) - 0.5
                    max_x = max(sp[0], ep[0]) + 0.5
                    max_y = max(sp[1], ep[1]) + 0.5
                    geom = BoundingBox(min_x, min_y, max_x, max_y)

                elif entity_type == "AcDbBlockReference":
                    # Block reference: use its bounding box
                    try:
                        bb = entity.GetBoundingBox()
                        min_pt, max_pt = bb
                        geom = BoundingBox(
                            min_pt[0], min_pt[1],
                            max_pt[0], max_pt[1],
                        )
                    except Exception:
                        continue
                else:
                    continue

                obs_id = f"{layer}_{entity.Handle}"
                self.add_obstacle(Obstacle(
                    id=obs_id,
                    obstacle_type=obs_type,
                    geometry=geom,
                    layer=layer,
                ))
                count += 1

            except Exception as e:
                logger.debug(f"Skipping entity {i}: {e}")
                continue

        logger.info(f"Loaded {count} obstacles from AutoCAD")
        return count

    def load_obstacles_from_json(self, filepath: str | Path):
        """Load obstacles from a JSON export (for testing without AutoCAD)."""
        data = json.loads(Path(filepath).read_text())
        for obs_data in data.get("obstacles", []):
            geom_data = obs_data["geometry"]
            if geom_data["type"] == "bbox":
                geom = BoundingBox(**geom_data["coords"])
            elif geom_data["type"] == "polygon":
                geom = Polygon([Point(p[0], p[1]) for p in geom_data["points"]])
            else:
                continue

            self.add_obstacle(Obstacle(
                id=obs_data["id"],
                obstacle_type=ObstacleType(obs_data["type"]),
                geometry=geom,
                layer=obs_data.get("layer", ""),
                label=obs_data.get("label", ""),
                clearance_override=obs_data.get("clearance"),
            ))

    def next_cable_ref(self, cable_type: str = "DC") -> str:
        self._cable_counter[cable_type] = self._cable_counter.get(cable_type, 0) + 1
        return f"{cable_type}-{self._cable_counter[cable_type]:03d}"

    def route(self, request: RouteRequest) -> RouteResult:
        """
        Compute a route for the given request.

        Handles all three modes:
        - SCHEMATIC: Simple A* with turn penalties, no obstacle inflation
        - PLAN_VIEW: Full obstacle avoidance with clearance buffers
        - CABLE_TAG: Same pathfinding as PLAN_VIEW, but output is
                     line + text annotation instead of conduit geometry
        """
        start = Point(*request.start)
        end = Point(*request.end)

        # Determine routing bounds
        if self._bounds:
            bounds = self._bounds
        else:
            # Auto-compute from obstacles + endpoints with padding
            all_x = [start.x, end.x]
            all_y = [start.y, end.y]
            for obs in self.obstacles:
                zone = obs.exclusion_zone
                all_x.extend([zone.min_x, zone.max_x])
                all_y.extend([zone.min_y, zone.max_y])
            padding = 10.0
            bounds = BoundingBox(
                min(all_x) - padding, min(all_y) - padding,
                max(all_x) + padding, max(all_y) + padding,
            )

        # Create grid router
        resolution = request.grid_resolution
        if request.mode == RoutingMode.SCHEMATIC:
            resolution = max(resolution, 0.5)  # Finer grid for schematics

        router = GridRouter(
            bounds=bounds,
            resolution=resolution,
            turn_penalty=5.0 if request.mode != RoutingMode.SCHEMATIC else 3.0,
        )

        # Add obstacles
        obstacles_used = []
        if request.mode != RoutingMode.SCHEMATIC:
            for obs in self.obstacles:
                clearance = request.clearance if request.clearance > 0 else 0
                router.add_obstacle(obs, global_clearance=clearance)
                obstacles_used.append(obs.id)

                # If obstacle is a trench and prefer_trench is on, add as corridor
                if obs.obstacle_type == ObstacleType.TRENCH and request.prefer_trench:
                    if isinstance(obs.geometry, BoundingBox):
                        router.add_trench_corridor(obs.geometry)

        # Compute path
        waypoints_p = [Point(*wp) for wp in request.waypoints] if request.waypoints else None
        path = router.route(start, end, waypoints_p)

        if path is None:
            return RouteResult(
                success=False,
                path=[],
                segments=[],
                length=0,
                bend_count=0,
                total_bend_degrees=0,
                request=request,
                obstacles_avoided=obstacles_used,
                warnings=["No valid path found. Try reducing clearance or adding waypoints."],
            )

        # Post-process
        segments = compute_segments(path)
        total_length = sum(s.length for s in segments)
        bends = [s for s in segments if s.is_bend]
        bend_count = len(bends)
        total_bend_deg = sum(s.bend_angle for s in bends)

        warnings = []
        if total_bend_deg > request.max_bends:
            warnings.append(
                f"Total bends ({total_bend_deg:.0f}°) exceed NEC limit "
                f"({request.max_bends}°). Add a pull point."
            )

        # Cable tag placement
        tag_pos = None
        tag_angle = 0.0
        if request.mode == RoutingMode.CABLE_TAG:
            tag_pos, tag_angle = compute_tag_placement(path)

        return RouteResult(
            success=True,
            path=path,
            segments=segments,
            length=total_length,
            bend_count=bend_count,
            total_bend_degrees=total_bend_deg,
            request=request,
            obstacles_avoided=obstacles_used,
            warnings=warnings,
            tag_position=tag_pos,
            tag_angle=tag_angle,
        )

    def export_route_for_acad(self, result: RouteResult) -> dict:
        """
        Export route data in a format ready for AutoCAD drawing.

        Returns a dict that the .NET bridge or COM connector can consume
        to draw the actual entities in AutoCAD.
        """
        if not result.success:
            return {"success": False, "error": result.warnings}

        req = result.request
        wire_data = WIRE_COLORS.get(req.cable_type, {}).get(req.wire_function, {})

        output = {
            "success": True,
            "mode": req.mode.value,
            "cable_ref": req.cable_ref,
            "cable_type": req.cable_type,
            "wire_function": req.wire_function,
            "wire_color_code": wire_data.get("code", ""),
            "acad_color": wire_data.get("acad_color", 7),
            "points": [(p.x, p.y) for p in result.path],
            "length": result.length,
            "bend_count": result.bend_count,
            "total_bend_degrees": result.total_bend_degrees,
            "warnings": result.warnings,
        }

        # Mode-specific data
        if req.mode == RoutingMode.PLAN_VIEW:
            # Layer for conduit polyline
            output["layer"] = "CR-CONDUIT"
            output["entity_type"] = "lwpolyline"  # Lightweight polyline with arcs
            output["lineweight"] = 35  # 0.35mm

        elif req.mode == RoutingMode.SCHEMATIC:
            # Layer based on wire type
            fn_map = {
                "Phase A": "PHA", "Phase B": "PHB", "Phase C": "PHC",
                "Neutral": "NEU", "Ground": "GND",
                "Positive": "POS", "Negative": "NEG", "Return": "RET",
            }
            fn_suffix = fn_map.get(req.wire_function, "MISC")
            output["layer"] = f"CR-WIRE-{req.cable_type}-{fn_suffix}"
            output["entity_type"] = "lwpolyline"
            output["lineweight"] = 25  # 0.25mm

        elif req.mode == RoutingMode.CABLE_TAG:
            output["layer"] = "CR-CABLE-TAG"
            output["entity_type"] = "line_with_text"
            output["lineweight"] = 18  # 0.18mm thin line
            output["tag_text"] = req.cable_tag or req.cable_ref
            output["tag_position"] = (result.tag_position.x, result.tag_position.y) if result.tag_position else None
            output["tag_angle"] = result.tag_angle
            output["tag_height"] = 0.125  # Text height (adjust for scale)
            # For cable tag mode, the line style is typically dashed or phantom
            output["linetype"] = "PHANTOM"

        return output

    def export_debug_grid(self, bounds: Optional[BoundingBox] = None, resolution: float = 1.0) -> dict:
        """Export the obstacle grid for frontend visualization."""
        if bounds is None:
            bounds = self._bounds or BoundingBox(0, 0, 100, 100)

        router = GridRouter(bounds=bounds, resolution=resolution)
        for obs in self.obstacles:
            router.add_obstacle(obs)

        return {
            "bounds": {
                "min_x": bounds.min_x, "min_y": bounds.min_y,
                "max_x": bounds.max_x, "max_y": bounds.max_y,
            },
            "resolution": resolution,
            "cols": router.cols,
            "rows": router.rows,
            "blocked_cells": router.get_blocked_cells_for_debug(),
            "obstacles": [
                {
                    "id": obs.id,
                    "type": obs.obstacle_type.value,
                    "zone": {
                        "min_x": obs.exclusion_zone.min_x,
                        "min_y": obs.exclusion_zone.min_y,
                        "max_x": obs.exclusion_zone.max_x,
                        "max_y": obs.exclusion_zone.max_y,
                    },
                }
                for obs in self.obstacles
            ],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CLI Test
# ═══════════════════════════════════════════════════════════════════════════════

def _demo():
    """Quick demo with mock obstacles."""
    logging.basicConfig(level=logging.INFO)

    engine = RoutingEngine()
    engine.set_bounds(0, 0, 100, 80)

    # Add some foundations
    engine.add_obstacle(Obstacle(
        id="FNDN-001", obstacle_type=ObstacleType.FOUNDATION,
        geometry=BoundingBox(20, 15, 35, 35), label="XFMR-1 Foundation",
    ))
    engine.add_obstacle(Obstacle(
        id="FNDN-002", obstacle_type=ObstacleType.FOUNDATION,
        geometry=BoundingBox(50, 20, 65, 40), label="Breaker Foundation",
    ))
    engine.add_obstacle(Obstacle(
        id="BLDG-001", obstacle_type=ObstacleType.BUILDING,
        geometry=BoundingBox(75, 55, 95, 75), label="Control House",
    ))
    engine.add_obstacle(Obstacle(
        id="TRENCH-001", obstacle_type=ObstacleType.TRENCH,
        geometry=BoundingBox(10, 45, 80, 48), label="Main Trench",
    ))

    # Plan view route
    result = engine.route(RouteRequest(
        start=(5, 25),
        end=(90, 65),
        mode=RoutingMode.PLAN_VIEW,
        clearance=3.0,
        cable_ref="487B-001",
    ))

    print(f"\nPlan View Route: {'SUCCESS' if result.success else 'FAILED'}")
    print(f"  Length: {result.length:.1f} ft")
    print(f"  Bends: {result.bend_count} ({result.total_bend_degrees:.0f}°)")
    print(f"  Path: {len(result.path)} points")
    if result.warnings:
        for w in result.warnings:
            print(f"  ⚠ {w}")

    # Cable tag route
    tag_result = engine.route(RouteRequest(
        start=(5, 25),
        end=(90, 65),
        mode=RoutingMode.CABLE_TAG,
        cable_ref="487B-001",
        cable_tag="487B-001 Z01",
    ))

    if tag_result.success:
        acad_data = engine.export_route_for_acad(tag_result)
        print(f"\nCable Tag Export:")
        print(f"  Tag: {acad_data['tag_text']}")
        print(f"  Position: {acad_data['tag_position']}")
        print(f"  Angle: {acad_data['tag_angle']:.1f}°")
        print(f"  Linetype: {acad_data['linetype']}")


if __name__ == "__main__":
    _demo()
