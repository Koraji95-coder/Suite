# -*- coding: utf-8 -*-
"""
pdf_to_autocad_v5.py
====================
PDF (vector) -> AutoCAD DWG  -- v5: arcs + extend-to-intersect + auto-join

New in v5:
  - ARC/CIRCLE detection: recognizes linearized curves and writes real AutoCAD arcs
  - Extend-to-intersect: dead-end lines get extended to meet nearby lines
  - Improved connectivity = more closed polylines = easier extrusion

Carried from v4:
  - Border/title block auto-detection and removal
  - Smart view separation using gap-based spatial clustering
  - Auto-join endpoints into polylines (proximity tolerance)
  - Per-view layers with color coding
  - Fixed -PDFATTACH (no GUI dialog)

Usage:
    python pdf_to_autocad_v5.py BESS_container.pdf --known-dim 6058 --separate-views --join
    python pdf_to_autocad_v5.py BESS_container.pdf --known-dim 6058 --separate-views --join --extend

Requirements:
    pip install pypdf pywin32 pandas openpyxl
"""

from __future__ import annotations
import argparse, csv, math, os, sys, time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

try:
    from pypdf import PdfReader
    PYPDF_OK = True
except ImportError:
    PYPDF_OK = False; print("ERROR: pypdf required.  pip install pypdf")

try:
    import pythoncom, win32com.client
    COM_OK = True
except ImportError:
    COM_OK = False; print("WARNING: pywin32 not found - AutoCAD output disabled.")

try:
    import pandas as pd
    PANDAS_OK = True
except ImportError:
    PANDAS_OK = False

# =============================================================================
# Config
# =============================================================================
@dataclass
class Config:
    input_path: str = ""
    page_number: int = 1
    min_line_len_pt: float = 4.0
    include_curves: bool = True
    curve_min_len_pt: float = 10.0
    known_dim_mm: Optional[float] = None
    scale_mm: float = 1.0
    autocad_origin_x: float = 0.0
    autocad_origin_y: float = 0.0
    separate_views: bool = False
    view_gap_factor: float = 0.04     # fraction of extent = gap threshold
    join_lines: bool = False
    join_tol_pt: float = 2.0         # endpoint snap tolerance (PDF pts)
    extend_lines: bool = False        # extend dead-end lines to nearest intersection
    extend_max_pt: float = 8.0       # max extension distance (PDF pts)
    detect_arcs: bool = True          # detect linearized arcs/circles
    arc_max_error: float = 0.10       # max relative error for arc fit (fraction of radius)
    layer_base: str = "BESS"
    report_format: str = "xlsx"
    write_scr: bool = True
    underlay_only: bool = False
    attach_underlay: bool = True
    remove_border: bool = True

# =============================================================================
# Geometry helpers
# =============================================================================
def mat_mul(a, b):
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]

def apply_mat(m, x, y):
    return m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]

IDENTITY = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]

def bezier_pts(p0, p1, p2, p3, steps=8):
    out = []
    for i in range(steps+1):
        t = i/steps; u = 1-t
        x = u**3*p0[0]+3*u**2*t*p1[0]+3*u*t**2*p2[0]+t**3*p3[0]
        y = u**3*p0[1]+3*u**2*t*p1[1]+3*u*t**2*p2[1]+t**3*p3[1]
        out.append((x,y))
    return out

def pdist(p1, p2):
    return math.hypot(p2[0]-p1[0], p2[1]-p1[1])

# =============================================================================
# Data types
# =============================================================================
@dataclass
class Seg:
    x1: float; y1: float; x2: float; y2: float
    kind: str = "line"
    @property
    def length(self): return math.hypot(self.x2-self.x1, self.y2-self.y1)
    @property
    def p1(self): return (self.x1, self.y1)
    @property
    def p2(self): return (self.x2, self.y2)
    @property
    def cx(self): return (self.x1+self.x2)/2
    @property
    def cy(self): return (self.y1+self.y2)/2
    @property
    def is_h(self): return abs(self.y2-self.y1) < 1.0
    @property
    def is_v(self): return abs(self.x2-self.x1) < 1.0

@dataclass
class Chain:
    """Connected sequence of segments forming a polyline."""
    seg_indices: List[int]
    points: List[Tuple[float,float]]
    is_closed: bool = False
    view: str = ""

@dataclass
class ArcEntity:
    """A detected arc or circle."""
    cx: float; cy: float; r: float
    start_angle: float  # degrees, AutoCAD convention (0=east, CCW)
    end_angle: float
    is_circle: bool = False
    start_pt: Tuple[float,float] = (0.,0.)
    end_pt: Tuple[float,float] = (0.,0.)

# =============================================================================
# Step 1b: Detect arcs/circles from linearized paths
# =============================================================================
def _angle_at(p1, p2, p3):
    """Signed turning angle at p2 between p1->p2 and p2->p3 (degrees)."""
    dx1, dy1 = p2[0]-p1[0], p2[1]-p1[1]
    dx2, dy2 = p3[0]-p2[0], p3[1]-p2[1]
    cross = dx1*dy2 - dy1*dx2
    dot = dx1*dx2 + dy1*dy2
    return math.degrees(math.atan2(cross, dot))

def _fit_circle(points):
    """Least-squares circle fit. Returns (cx, cy, r, max_error, avg_error) or None."""
    n = len(points)
    if n < 3: return None
    sx = sum(p[0] for p in points) / n
    sy = sum(p[1] for p in points) / n
    Suu = sum((p[0]-sx)**2 for p in points)
    Svv = sum((p[1]-sy)**2 for p in points)
    Suv = sum((p[0]-sx)*(p[1]-sy) for p in points)
    Suuu = sum((p[0]-sx)**3 for p in points)
    Svvv = sum((p[1]-sy)**3 for p in points)
    Suvv = sum((p[0]-sx)*(p[1]-sy)**2 for p in points)
    Svuu = sum((p[1]-sy)*(p[0]-sx)**2 for p in points)
    det = Suu*Svv - Suv*Suv
    if abs(det) < 1e-10: return None
    uc = (Svv*(Suuu+Suvv) - Suv*(Svvv+Svuu)) / (2*det)
    vc = (Suu*(Svvv+Svuu) - Suv*(Suuu+Suvv)) / (2*det)
    cx = uc + sx; cy = vc + sy
    r = math.sqrt(uc**2 + vc**2 + (Suu+Svv)/n)
    if r < 0.5: return None
    max_dev = max(abs(math.hypot(p[0]-cx, p[1]-cy) - r) for p in points)
    avg_dev = sum(abs(math.hypot(p[0]-cx, p[1]-cy) - r) for p in points) / n
    return cx, cy, r, max_dev, avg_dev


def detect_arcs(segs: List[Seg], cfg: Config, border=None) -> Tuple[List[Seg], List[ArcEntity]]:
    """
    Scan segments for sequences that form arcs/circles.
    Returns (remaining_segs, arcs) where remaining_segs excludes arc segments.
    
    Strategy: rebuild original PDF paths, detect arc-like paths (consistent
    turning angle + good circle fit), replace with ArcEntity objects.
    """
    if not cfg.detect_arcs:
        return segs, []

    print(f"[1b/6] Detecting arcs ...")

    # Rebuild paths from segments by chaining connected endpoints
    # Two segs are in the same path if they share an endpoint (within 0.1pt)
    tol = 0.3

    def snap(p):
        return (round(p[0]/tol)*tol, round(p[1]/tol)*tol)

    # Build adjacency
    graph = defaultdict(list)
    for i, s in enumerate(segs):
        graph[snap(s.p1)].append((i, 0))  # 0 = p1 end
        graph[snap(s.p2)].append((i, 1))  # 1 = p2 end

    # Trace paths (sequences of connected segments)
    used = set()
    paths = []

    def trace(start_seg, start_end):
        chain = [start_seg]
        s = segs[start_seg]
        points = [s.p1, s.p2] if start_end == 0 else [s.p2, s.p1]
        used.add(start_seg)
        while True:
            tip = snap(points[-1])
            neighbors = [(si, se) for si, se in graph[tip] if si not in used]
            if len(neighbors) != 1: break
            si, se = neighbors[0]
            used.add(si)
            chain.append(si)
            s2 = segs[si]
            points.append(s2.p2 if se == 0 else s2.p1)
        return chain, points

    # Start from degree-1 or degree-3+ nodes
    for pt, entries in sorted(graph.items()):
        active = [(si, se) for si, se in entries if si not in used]
        if len(active) == 1:
            idx, pts = trace(active[0][0], active[0][1])
            paths.append((idx, pts))
    # Remaining loops
    for pt, entries in graph.items():
        for si, se in entries:
            if si not in used:
                idx, pts = trace(si, se)
                paths.append((idx, pts))

    # Now check each path for arc-like behavior
    arcs_found = []
    arc_seg_indices = set()

    # Max radius in PDF pts: if known_dim is set, use 30% of it as limit
    # Otherwise use 100pt (about 35mm at typical scale)
    # This prevents border lines from being detected as giant arcs
    max_radius_pt = 100.0  # safe default
    if cfg.known_dim_mm is not None:
        # We don't know scale yet, but we can estimate from drawing extent
        all_x = [s.x1 for s in segs] + [s.x2 for s in segs]
        extent_pt = max(all_x) - min(all_x)
        if extent_pt > 10:
            est_scale = cfg.known_dim_mm / extent_pt  # mm per pt
            max_radius_pt = min(cfg.known_dim_mm * 0.25 / est_scale, 200.0)
    
    min_radius_pt = 2.0  # ignore tiny noise arcs

    for seg_indices, points in paths:
        if len(points) < 4:  # need at least 3 segments (4 points)
            continue

        # Check turning angles
        angles = [_angle_at(points[i-1], points[i], points[i+1])
                  for i in range(1, len(points)-1)]
        if not angles:
            continue

        # Total turning must be significant (> 45°) to be an arc
        total_turn = sum(angles)
        if abs(total_turn) < 45:
            continue

        avg_angle = sum(angles) / len(angles)
        if abs(avg_angle) < 5:  # per-vertex turn must be meaningful
            continue

        # CRITICAL: reject paths with sharp corners (> 70° per vertex).
        # Real arcs have gentle, consistent curvature (20-60° per vertex).
        # Rectangle corners (90°) and U-turns (180°) are NOT arcs, even 
        # though their vertices fit on a circle (circumscribed circle of a polygon).
        if any(abs(a) > 70 for a in angles):
            continue

        # All same sign (all turning one direction)?
        if not (all(a > 0 for a in angles) or all(a < 0 for a in angles)):
            continue

        # Consistent magnitude (within 50% of mean)?
        max_dev = max(abs(a - avg_angle) for a in angles)
        if max_dev >= abs(avg_angle) * 0.5:
            continue

        # Segment lengths should be roughly similar (arc segments are equal-ish)
        seg_lens = [pdist(points[i], points[i+1]) for i in range(len(points)-1)]
        avg_len = sum(seg_lens) / len(seg_lens)
        if avg_len < 1.0:
            continue
        max_len_dev = max(abs(l - avg_len) for l in seg_lens)
        if max_len_dev > avg_len * 0.8:  # segments too different in length
            continue

        # Fit circle
        fit = _fit_circle(points)
        if fit is None:
            continue
        cx, cy, r, max_err, avg_err = fit
        
        # Radius bounds
        if r < min_radius_pt or r > max_radius_pt:
            continue
        
        rel_err = max_err / r
        if rel_err > cfg.arc_max_error:
            continue

        # It's a real arc! Compute angles
        # A full circle if: total turn is ~360° OR start and end points coincide
        start_end_gap = pdist(points[0], points[-1])
        is_circle = abs(abs(total_turn) - 360) < 45 or start_end_gap < 0.5

        # Quality filter based on point count:
        # A 4-point "circle" is really a quadrilateral - need 6+ for reliable circles
        # A 4-point 300° arc is just 3 lines curving - need 5+ for large-span arcs
        n_pts = len(points)
        if is_circle and n_pts < 6:
            continue  # too few points to be a reliable circle
        if not is_circle and abs(total_turn) > 270 and n_pts < 5:
            continue  # nearly-complete arc from too few segments

        start_angle = math.degrees(math.atan2(points[0][1] - cy, points[0][0] - cx))
        end_angle = math.degrees(math.atan2(points[-1][1] - cy, points[-1][0] - cx))

        # For non-circle arcs, ensure we have the correct sweep direction
        # If total_turn is positive (CCW), end_angle should be > start_angle
        # If total_turn is negative (CW), end_angle should be < start_angle
        if not is_circle:
            # Normalize angles to 0-360 range
            sa = start_angle % 360
            ea = end_angle % 360
            
            if total_turn > 0:  # CCW sweep
                # AutoCAD arcs go CCW from start to end
                if ea <= sa:
                    ea += 360
            else:  # CW sweep
                # Swap start/end so AutoCAD draws CCW in the other direction
                sa, ea = ea, sa
                if ea <= sa:
                    ea += 360
            
            start_angle = sa
            end_angle = ea

        # Filter: skip arcs centered near border corners (junk from border removal)
        if border:
            bxmin, bymin, bxmax, bymax = border
            corner_tol = 15.0
            at_corner = False
            for bx, by in [(bxmin, bymin), (bxmin, bymax), (bxmax, bymin), (bxmax, bymax)]:
                if abs(cx - bx) < corner_tol and abs(cy - by) < corner_tol:
                    at_corner = True; break
            if at_corner:
                continue

        arc = ArcEntity(
            cx=cx, cy=cy, r=r,
            start_angle=start_angle, end_angle=end_angle,
            is_circle=is_circle,
            start_pt=points[0], end_pt=points[-1],
        )
        arcs_found.append(arc)
        arc_seg_indices.update(seg_indices)

    # Remove arc segments from segment list
    remaining = [s for i, s in enumerate(segs) if i not in arc_seg_indices]
    n_circles = sum(1 for a in arcs_found if a.is_circle)
    n_arcs = len(arcs_found) - n_circles

    print(f"   Found {n_circles} circles + {n_arcs} arcs ({len(arc_seg_indices)} segs replaced)")
    print(f"   Remaining line segments: {len(remaining)}")

    return remaining, arcs_found


# =============================================================================
# Step 4c: Extend dead-end lines to nearest intersection
# =============================================================================
def _line_seg_intersect(ray_start, ray_end, seg_p1, seg_p2):
    """
    Intersect ray (ray_start -> ray_end extended) with line segment seg_p1-seg_p2.
    Returns (ix, iy, t_ray, u_seg) or None.
    t_ray > 0 = forward from ray_start. 0 <= u_seg <= 1 = on segment.
    """
    x1, y1 = ray_start; x2, y2 = ray_end
    x3, y3 = seg_p1; x4, y4 = seg_p2
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
    ix = x1 + t * (x2 - x1)
    iy = y1 + t * (y2 - y1)
    return ix, iy, t, u


def extend_to_intersections(segs: List[Seg], cfg: Config) -> List[Seg]:
    """
    For each dead-end endpoint, project the line forward and extend it
    to the nearest intersection with another line segment.
    Modifies segment endpoints in-place.
    """
    if not cfg.extend_lines:
        return segs

    print(f"[4c/6] Extending dead ends to intersections (max {cfg.extend_max_pt}pt) ...")

    tol = cfg.join_tol_pt  # use same tolerance as join

    def snap(p):
        return (round(p[0] / tol) * tol, round(p[1] / tol) * tol)

    # Build endpoint connectivity
    ep_map = defaultdict(list)
    for i, s in enumerate(segs):
        ep_map[snap(s.p1)].append((i, 0))
        ep_map[snap(s.p2)].append((i, 1))

    # Find dead ends
    dead_ends = []
    for key, entries in ep_map.items():
        if len(entries) == 1:
            idx, which_end = entries[0]
            dead_ends.append((idx, which_end))

    extended_count = 0
    max_ext = cfg.extend_max_pt

    # Build a simple spatial index: divide space into grid cells
    cell_size = 20.0
    grid = defaultdict(list)
    for i, s in enumerate(segs):
        cx, cy = (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2
        half_diag = s.length / 2 + max_ext
        for gx in range(int((cx - half_diag) / cell_size) - 1,
                        int((cx + half_diag) / cell_size) + 2):
            for gy in range(int((cy - half_diag) / cell_size) - 1,
                            int((cy + half_diag) / cell_size) + 2):
                grid[(gx, gy)].append(i)

    for seg_idx, which_end in dead_ends:
        s = segs[seg_idx]
        if which_end == 0:
            dead_pt = s.p1; other_pt = s.p2
        else:
            dead_pt = s.p2; other_pt = s.p1

        # Ray direction: from other_pt through dead_pt
        dx = dead_pt[0] - other_pt[0]
        dy = dead_pt[1] - other_pt[1]
        seg_len = math.hypot(dx, dy)
        if seg_len < 0.5:
            continue

        # Normalize
        ndx, ndy = dx / seg_len, dy / seg_len
        ray_end = (dead_pt[0] + ndx * max_ext, dead_pt[1] + ndy * max_ext)

        # Find nearby segments via grid
        gx = int(dead_pt[0] / cell_size)
        gy = int(dead_pt[1] / cell_size)
        nearby = set()
        for dgx in range(-2, 3):
            for dgy in range(-2, 3):
                nearby.update(grid.get((gx + dgx, gy + dgy), []))

        # Find nearest forward intersection
        best_dist = max_ext
        best_pt = None

        for j in nearby:
            if j == seg_idx:
                continue
            s2 = segs[j]
            result = _line_seg_intersect(dead_pt, ray_end, s2.p1, s2.p2)
            if result is None:
                continue
            ix, iy, t_ray, u_seg = result
            if t_ray < 0.01:
                continue  # behind us
            if u_seg < -0.02 or u_seg > 1.02:
                continue  # not on the target segment
            d = math.hypot(ix - dead_pt[0], iy - dead_pt[1])
            if d < best_dist and d > 0.1:  # must be a real extension
                best_dist = d
                best_pt = (ix, iy)

        if best_pt:
            # Extend the segment
            if which_end == 0:
                segs[seg_idx] = Seg(best_pt[0], best_pt[1], s.x2, s.y2, s.kind)
            else:
                segs[seg_idx] = Seg(s.x1, s.y1, best_pt[0], best_pt[1], s.kind)
            extended_count += 1

    print(f"   Extended {extended_count} / {len(dead_ends)} dead ends")
    return segs


def bridge_gaps(segs: List[Seg], cfg: Config) -> List[Seg]:
    """
    Find pairs of dead-end endpoints that are close together and add
    short bridging line segments to connect them. This closes gaps where
    two lines almost meet but don't quite touch and aren't collinear
    (so extend_to_intersections wouldn't catch them).
    
    Also snaps dead-end endpoints to the nearest point on a nearby line
    (perpendicular snap), creating T-junctions.
    """
    if not cfg.extend_lines:
        return segs

    bridge_max = cfg.extend_max_pt
    tol = cfg.join_tol_pt

    def snap(p):
        return (round(p[0] / tol) * tol, round(p[1] / tol) * tol)

    # Build endpoint connectivity
    ep_map = defaultdict(list)
    for i, s in enumerate(segs):
        ep_map[snap(s.p1)].append((i, 0))
        ep_map[snap(s.p2)].append((i, 1))

    # Find dead ends
    dead_ends = []
    for key, entries in ep_map.items():
        if len(entries) == 1:
            idx, which_end = entries[0]
            s = segs[idx]
            pt = s.p1 if which_end == 0 else s.p2
            dead_ends.append((idx, which_end, pt))

    # === Part 1: Bridge dead-end to dead-end ===
    # For each pair of dead ends within bridge_max distance, add a bridging segment
    bridged = 0
    used_dead = set()

    # Build spatial index of dead ends
    de_grid = defaultdict(list)
    cell = bridge_max * 1.5
    for i, (idx, we, pt) in enumerate(dead_ends):
        gx, gy = int(pt[0] / cell), int(pt[1] / cell)
        de_grid[(gx, gy)].append(i)

    for i, (idx1, we1, pt1) in enumerate(dead_ends):
        if i in used_dead:
            continue
        gx, gy = int(pt1[0] / cell), int(pt1[1] / cell)

        best_dist = bridge_max
        best_j = -1

        for dgx in range(-1, 2):
            for dgy in range(-1, 2):
                for j in de_grid.get((gx + dgx, gy + dgy), []):
                    if j <= i or j in used_dead:
                        continue
                    idx2, we2, pt2 = dead_ends[j]
                    if idx2 == idx1:
                        continue  # same segment
                    d = pdist(pt1, pt2)
                    if d < best_dist and d > 0.1:
                        best_dist = d
                        best_j = j

        if best_j >= 0:
            idx2, we2, pt2 = dead_ends[best_j]
            # Add a bridging segment
            segs.append(Seg(pt1[0], pt1[1], pt2[0], pt2[1], "line"))
            used_dead.add(i)
            used_dead.add(best_j)
            bridged += 1

    # === Part 2: Snap dead-end to nearest line (T-junction) ===
    # For remaining dead ends, find the nearest point on any nearby segment
    # and extend to create a T-junction
    snapped = 0
    remaining_dead = [(idx, we, pt) for i, (idx, we, pt) in enumerate(dead_ends)
                      if i not in used_dead]

    # Spatial index for all segments
    seg_grid = defaultdict(list)
    for i, s in enumerate(segs):
        cx, cy = (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2
        r = s.length / 2 + bridge_max
        for gx in range(int((cx - r) / cell) - 1, int((cx + r) / cell) + 2):
            for gy in range(int((cy - r) / cell) - 1, int((cy + r) / cell) + 2):
                seg_grid[(gx, gy)].append(i)

    for idx, we, pt in remaining_dead:
        gx, gy = int(pt[0] / cell), int(pt[1] / cell)
        nearby = set()
        for dgx in range(-1, 2):
            for dgy in range(-1, 2):
                nearby.update(seg_grid.get((gx + dgx, gy + dgy), []))

        best_dist = bridge_max
        best_snap = None

        for j in nearby:
            if j == idx:
                continue
            s2 = segs[j]
            # Find closest point on segment s2 to pt
            dx, dy = s2.x2 - s2.x1, s2.y2 - s2.y1
            len_sq = dx * dx + dy * dy
            if len_sq < 0.01:
                continue
            t = ((pt[0] - s2.x1) * dx + (pt[1] - s2.y1) * dy) / len_sq
            t = max(0.0, min(1.0, t))
            closest = (s2.x1 + t * dx, s2.y1 + t * dy)
            d = pdist(pt, closest)
            if d < best_dist and d > 0.3:  # don't snap to self
                best_dist = d
                best_snap = closest

        if best_snap:
            # Extend the dead end to the snap point
            s = segs[idx]
            if we == 0:
                segs[idx] = Seg(best_snap[0], best_snap[1], s.x2, s.y2, s.kind)
            else:
                segs[idx] = Seg(s.x1, s.y1, best_snap[0], best_snap[1], s.kind)
            snapped += 1

    print(f"   Bridged {bridged} dead-end pairs, snapped {snapped} T-junctions")
    return segs

# =============================================================================
# Step 1: Extract vector paths from PDF
# =============================================================================
def extract_paths(cfg: Config) -> Tuple[List[Seg], float, float]:
    print(f"[1/6] Reading PDF ...")
    reader = PdfReader(cfg.input_path)
    page = reader.pages[cfg.page_number-1]
    mb = page.mediabox
    pw, ph = float(mb.width), float(mb.height)
    print(f"   Page: {pw:.1f} x {ph:.1f} pts  ({pw/72*25.4:.1f} x {ph/72*25.4:.1f} mm)")

    content_obj = page.get("/Contents")
    all_bytes = b""
    items = list(content_obj) if hasattr(content_obj, '__iter__') else [content_obj]
    for s in items:
        try: all_bytes += s.get_object().get_data()
        except: pass
    tokens = all_bytes.decode('latin-1', errors='replace').split()
    print(f"   Tokens: {len(tokens):,}")

    ctm_stack = []; ctm = IDENTITY[:]
    path = []; start = None
    segs = []; buf = []
    MIN = cfg.min_line_len_pt; CMIN = cfg.curve_min_len_pt

    def stroke():
        for j in range(len(path)-1):
            x1,y1 = path[j]; x2,y2 = path[j+1]
            if math.hypot(x2-x1,y2-y1) >= MIN:
                segs.append(Seg(x1,y1,x2,y2,"line"))

    def close_path():
        if path and start and pdist(path[-1], start) > 0.1:
            path.append(start)

    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok == 'cm':
            if len(buf)>=6: ctm = mat_mul(ctm, [float(buf[-6+k]) for k in range(6)])
            buf = []
        elif tok == 'q': ctm_stack.append(ctm[:]); buf = []
        elif tok == 'Q':
            if ctm_stack: ctm = ctm_stack.pop()
            buf = []
        elif tok == 'm':
            if len(buf)>=2:
                px,py = apply_mat(ctm, float(buf[-2]), float(buf[-1]))
                path = [(px,py)]; start = (px,py)
            buf = []
        elif tok == 'l':
            if len(buf)>=2: path.append(apply_mat(ctm, float(buf[-2]), float(buf[-1])))
            buf = []
        elif tok == 'h': close_path(); buf = []
        elif tok == 're':
            if len(buf)>=4:
                x,y,w,h = float(buf[-4]),float(buf[-3]),float(buf[-2]),float(buf[-1])
                corners = [(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)]
                tx = [apply_mat(ctm,cx,cy) for cx,cy in corners]
                for j in range(4):
                    x1,y1=tx[j]; x2,y2=tx[j+1]
                    if math.hypot(x2-x1,y2-y1) >= MIN:
                        segs.append(Seg(x1,y1,x2,y2,"line"))
            buf = []
        elif tok == 'c':
            if len(buf)>=6 and cfg.include_curves:
                p0 = path[-1] if path else (0.,0.)
                c1 = apply_mat(ctm, float(buf[-6]), float(buf[-5]))
                c2 = apply_mat(ctm, float(buf[-4]), float(buf[-3]))
                p3 = apply_mat(ctm, float(buf[-2]), float(buf[-1]))
                if pdist(p0,p3) >= CMIN:
                    pts = bezier_pts(p0,c1,c2,p3)
                    for j in range(len(pts)-1):
                        if pdist(pts[j],pts[j+1]) >= 1:
                            segs.append(Seg(pts[j][0],pts[j][1],pts[j+1][0],pts[j+1][1],"curve"))
                if len(buf)>=2: path.append(apply_mat(ctm, float(buf[-2]), float(buf[-1])))
            buf = []
        elif tok in ('v','y'):
            if len(buf)>=4 and cfg.include_curves:
                p0 = path[-1] if path else (0.,0.)
                if tok=='v': c1=p0; c2=apply_mat(ctm,float(buf[-4]),float(buf[-3]))
                else: c1=apply_mat(ctm,float(buf[-4]),float(buf[-3])); c2=None
                p3 = apply_mat(ctm, float(buf[-2]), float(buf[-1]))
                if c2 is None: c2=p3
                if pdist(p0,p3) >= CMIN:
                    pts = bezier_pts(p0,c1,c2,p3)
                    for j in range(len(pts)-1):
                        if pdist(pts[j],pts[j+1])>=1:
                            segs.append(Seg(pts[j][0],pts[j][1],pts[j+1][0],pts[j+1][1],"curve"))
                if len(buf)>=2: path.append(apply_mat(ctm,float(buf[-2]),float(buf[-1])))
            buf = []
        elif tok in ('S','B','B*'):
            stroke(); path=[]; start=None; buf=[]
        elif tok in ('s','b','b*'):
            close_path(); stroke(); path=[]; start=None; buf=[]
        elif tok in ('f','F','f*','n','W','W*'):
            path=[]; start=None; buf=[]
        else:
            try: float(tok); buf.append(tok)
            except ValueError: buf=[]
        i += 1

    print(f"   Raw: {len(segs):,}  ", end="")
    # Dedup
    seen = set(); out = []
    for s in segs:
        x1,y1,x2,y2 = s.x1,s.y1,s.x2,s.y2
        if (x1,y1)>(x2,y2): x1,y1,x2,y2=x2,y2,x1,y1
        k = (round(x1,1),round(y1,1),round(x2,1),round(y2,1),s.kind)
        if k not in seen: seen.add(k); out.append(s)
    print(f"after dedup: {len(out):,}")
    return out, pw, ph

# =============================================================================
# Step 2: Remove border / title block
# =============================================================================
def remove_border(segs: List[Seg], cfg: Config) -> Tuple[List[Seg], Optional[Tuple]]:
    if not cfg.remove_border:
        return segs, None
    print(f"[2/6] Detecting border ...")

    if len(segs) < 10:
        print("   Too few segments"); return segs, None

    lengths = sorted([s.length for s in segs], reverse=True)

    # Border lines are typically the longest on the sheet
    # Look for long H and V lines
    long_thresh = lengths[0] * 0.6
    long_h = sorted([s for s in segs if s.is_h and s.length >= long_thresh], key=lambda s: -s.length)
    long_v = sorted([s for s in segs if s.is_v and s.length >= long_thresh], key=lambda s: -s.length)

    if len(long_h) < 2 or len(long_v) < 2:
        long_thresh = lengths[0] * 0.4
        long_h = sorted([s for s in segs if s.is_h and s.length >= long_thresh], key=lambda s: -s.length)
        long_v = sorted([s for s in segs if s.is_v and s.length >= long_thresh], key=lambda s: -s.length)

    if len(long_h) < 2 or len(long_v) < 2:
        print("   No clear border detected"); return segs, None

    # Get unique Y values of horizontal border lines and X values of vertical
    h_ys = sorted(set(round(s.y1, 0) for s in long_h))
    v_xs = sorted(set(round(s.x1, 0) for s in long_v))

    # Use innermost rect as the drawing border
    if len(h_ys) >= 2 and len(v_xs) >= 2:
        # If nested (outer + inner border), use the inner one
        if len(h_ys) > 2:
            border_ymin = sorted(h_ys)[1]
            border_ymax = sorted(h_ys)[-2]
        else:
            border_ymin, border_ymax = h_ys[0], h_ys[-1]
        if len(v_xs) > 2:
            border_xmin = sorted(v_xs)[1]
            border_xmax = sorted(v_xs)[-2]
        else:
            border_xmin, border_xmax = v_xs[0], v_xs[-1]

        border = (border_xmin, border_ymin, border_xmax, border_ymax)
        bw = border_xmax - border_xmin
        bh = border_ymax - border_ymin
        print(f"   Border: ({border_xmin:.0f},{border_ymin:.0f})-({border_xmax:.0f},{border_ymax:.0f})")
        print(f"   Size: {bw:.1f} x {bh:.1f} pts  ({bw/72*25.4:.0f} x {bh/72*25.4:.0f} mm)")

        tol = 3.0
        all_border_ys = set(h_ys)
        all_border_xs = set(v_xs)

        def is_on_border(s):
            if s.is_h and s.length > bw * 0.3:
                for by in all_border_ys:
                    if abs(s.y1 - by) < tol: return True
            if s.is_v and s.length > bh * 0.3:
                for bx in all_border_xs:
                    if abs(s.x1 - bx) < tol: return True
            return False

        before = len(segs)
        filtered = [s for s in segs if not is_on_border(s)]
        print(f"   Removed {before - len(filtered)} border segments, {len(filtered)} remain")
        return filtered, border

    print("   Could not determine border"); return segs, None

# =============================================================================
# Step 3: Scale computation
# =============================================================================
def compute_scale(segs: List[Seg], cfg: Config) -> float:
    if cfg.known_dim_mm is not None:
        line_segs = [s for s in segs if s.kind == "line"] or segs

        # Find the widest view cluster
        ys = sorted(set(round(s.cy, 0) for s in line_segs))
        y_clusters = _cluster_1d(ys, 15.0)

        best_w = 0.0
        for yc in y_clusters:
            ylo, yhi = min(yc)-15, max(yc)+15
            vs = [s for s in line_segs if ylo <= s.cy <= yhi]
            if not vs: continue
            xs = [s.x1 for s in vs] + [s.x2 for s in vs]
            w = max(xs) - min(xs)
            if w > best_w: best_w = w

        all_xs = [s.x1 for s in line_segs] + [s.x2 for s in line_segs]
        best_w = max(best_w, max(all_xs) - min(all_xs))

        if best_w > 0:
            scale = cfg.known_dim_mm / best_w
            print(f"[3/6] Scale: widest = {best_w:.1f}pt -> {cfg.known_dim_mm}mm -> {scale:.4f} mm/pt")
            return scale

    scale = cfg.scale_mm / (72.0/25.4)
    print(f"[3/6] Scale: {scale:.4f} mm/pt  (paper-size -- use --known-dim)")
    return scale

def _cluster_1d(vals, gap):
    if not vals: return []
    clusters = []; g = [vals[0]]
    for v in vals[1:]:
        if v - g[-1] > gap: clusters.append(g); g = [v]
        else: g.append(v)
    clusters.append(g)
    return clusters

# =============================================================================
# Step 4: View separation
# =============================================================================
_VIEW_COLORS = {
    "FRONT":1, "END":5, "PLAN":3, "BOTTOM":3, "TOP":3,
    "DETAIL":2, "ISO":6, "3D":6, "OUTLINE":7, "MISC":8,
    "LINES":5, "CURVES":4, "ARC":4,
}

def _layer_color(name):
    for k,c in _VIEW_COLORS.items():
        if k in name.upper(): return c
    return 7

def assign_views(segs: List[Seg], cfg: Config, scale_mm: float) -> Dict[str, List[Seg]]:
    if not cfg.separate_views:
        lines = [s for s in segs if s.kind == "line"]
        curves = [s for s in segs if s.kind == "curve"]
        result = {}
        if lines: result[f"{cfg.layer_base}_LINES"] = lines
        if curves: result[f"{cfg.layer_base}_CURVES"] = curves
        return result

    print(f"[4/6] Separating views ...")

    all_xs = [s.x1 for s in segs] + [s.x2 for s in segs]
    all_ys = [s.y1 for s in segs] + [s.y2 for s in segs]
    ext_h = max(all_ys) - min(all_ys)
    gap_y = ext_h * cfg.view_gap_factor

    # === Pass 1: Split into Y-bands (rows) ===
    cy_vals = sorted(set(round(s.cy, 0) for s in segs))
    y_clusters = _cluster_1d(cy_vals, gap_y)
    y_ranges = [(min(c) - gap_y/2, max(c) + gap_y/2) for c in y_clusters]

    # Filter out tiny bands (< 2% of extent or < 10 segs)
    sig_bands = []
    for lo, hi in y_ranges:
        band_segs = [s for s in segs if lo <= s.cy <= hi]
        if len(band_segs) >= 10 and (hi - lo) > ext_h * 0.02:
            sig_bands.append((lo, hi, band_segs))
    # Sort by Y descending (high Y = top of PDF page = visual top)
    sig_bands.sort(key=lambda b: -b[0])

    # Also collect orphan segments not in any significant band
    orphans = []
    for s in segs:
        if not any(lo <= s.cy <= hi for lo, hi, _ in sig_bands):
            orphans.append(s)

    print(f"   {len(sig_bands)} significant Y-bands, {len(orphans)} orphans")

    # === Pass 2: Within each Y-band, find biggest X gap to split L/R ===
    views = []  # list of (name, seg_list)

    for band_idx, (ylo, yhi, band_segs) in enumerate(sig_bands):
        # Get endpoint X positions (more reliable than centroids for gap detection)
        x_endpoints = sorted(set(
            [round(s.x1, 0) for s in band_segs] +
            [round(s.x2, 0) for s in band_segs]
        ))

        # Find all X gaps
        x_gaps = [(x_endpoints[i], x_endpoints[i+1], x_endpoints[i+1] - x_endpoints[i])
                  for i in range(len(x_endpoints) - 1)]
        x_gaps.sort(key=lambda g: -g[2])

        # Split if biggest gap is significantly larger than median
        split_x = None
        if x_gaps:
            biggest = x_gaps[0][2]
            gap_vals = sorted([g[2] for g in x_gaps])
            median_gap = gap_vals[len(gap_vals) // 2]
            if biggest > max(median_gap * 3, 12):
                split_x = x_gaps[0][0] + x_gaps[0][2] / 2

        if split_x is not None:
            left = [s for s in band_segs if s.cx < split_x]
            right = [s for s in band_segs if s.cx >= split_x]
            # Name based on row position
            if band_idx == 0:  # top row = elevations
                views.append(("FRONT_ELEV", left))
                views.append(("END_ELEV", right))
            elif band_idx == 1:  # second row = plans
                views.append(("PLAN_LEFT", left))
                views.append(("PLAN_RIGHT", right))
            else:
                views.append((f"VIEW_R{band_idx}_LEFT", left))
                views.append((f"VIEW_R{band_idx}_RIGHT", right))
        else:
            # No X split - whole row is one view
            if band_idx == 0:
                views.append(("FRONT_ELEV", band_segs))
            elif band_idx == 1:
                views.append(("PLAN_VIEW", band_segs))
            else:
                views.append((f"VIEW_R{band_idx}", band_segs))

    if orphans:
        views.append(("MISC", orphans))

    # === Build layer dict ===
    result = defaultdict(list)
    for vname, vsegs in views:
        for s in vsegs:
            suffix = "_CURVES" if s.kind == "curve" else ""
            layer = f"{cfg.layer_base}_{vname}{suffix}"
            result[layer].append(s)

    for layer, ss in sorted(result.items()):
        xs = [s.x1 for s in ss] + [s.x2 for s in ss]
        ys = [s.y1 for s in ss] + [s.y2 for s in ss]
        w = (max(xs) - min(xs)) * scale_mm
        h = (max(ys) - min(ys)) * scale_mm
        print(f"   {layer}: {len(ss)} segs  ({w:.0f} x {h:.0f} mm)")

    return dict(result)

# =============================================================================
# Step 5: Join endpoints into polylines
# =============================================================================
def join_into_chains(segs: List[Seg], tol: float) -> List[Chain]:
    """
    Join line segments into polyline chains by snapping nearby endpoints.
    Returns list of Chain objects with sequential point lists.
    """
    if not segs:
        return []

    # Round endpoint to tolerance grid
    def snap(p):
        return (round(p[0]/tol)*tol, round(p[1]/tol)*tol)

    # Build adjacency graph: snapped_endpoint -> list of (seg_index, which_end)
    # which_end: 0 = p1, 1 = p2
    graph = defaultdict(list)
    for i, s in enumerate(segs):
        graph[snap(s.p1)].append((i, 0))
        graph[snap(s.p2)].append((i, 1))

    # Trace chains starting from dead ends (degree 1) or junctions (degree 3+)
    used = set()
    chains = []

    def other_end(seg_idx, end):
        s = segs[seg_idx]
        return s.p2 if end == 0 else s.p1

    def trace(start_seg, start_end):
        """Trace a chain from one end of a segment."""
        chain_indices = [start_seg]
        # Build point list
        s = segs[start_seg]
        if start_end == 0:
            points = [s.p1, s.p2]
        else:
            points = [s.p2, s.p1]
        used.add(start_seg)

        # Follow the chain
        while True:
            tip = snap(points[-1])
            neighbors = [(si, se) for si, se in graph[tip] if si not in used]
            if len(neighbors) != 1:
                break  # dead end, junction, or no more
            si, se = neighbors[0]
            used.add(si)
            chain_indices.append(si)
            points.append(other_end(si, se))

        return chain_indices, points

    # Start from dead ends first (degree-1 nodes)
    start_points = []
    for pt, entries in graph.items():
        active = [(si, se) for si, se in entries if si not in used]
        if len(active) == 1:
            start_points.append((pt, active[0]))

    for pt, (si, se) in start_points:
        if si in used:
            continue
        indices, points = trace(si, se)
        chains.append(Chain(indices, points))

    # Then trace remaining (loops - all degree-2)
    for pt, entries in graph.items():
        for si, se in entries:
            if si not in used:
                indices, points = trace(si, se)
                chains.append(Chain(indices, points))

    # Any orphan segments not yet used
    for i in range(len(segs)):
        if i not in used:
            s = segs[i]
            chains.append(Chain([i], [s.p1, s.p2]))

    # Check which chains are closed (first point == last point within tolerance)
    for ch in chains:
        if len(ch.points) >= 3 and pdist(ch.points[0], ch.points[-1]) <= tol * 2:
            ch.is_closed = True
            # Snap the last point to the first
            ch.points[-1] = ch.points[0]

    return chains


def analyze_chains(chains: List[Chain]):
    """Print chain statistics."""
    closed = sum(1 for c in chains if c.is_closed)
    open_c = len(chains) - closed
    sizes = sorted([len(c.seg_indices) for c in chains], reverse=True)

    print(f"   Chains: {len(chains)} total ({closed} closed, {open_c} open)")
    print(f"   Longest chains: {sizes[:10]}")
    if closed > 0:
        closed_sizes = sorted([len(c.seg_indices) for c in chains if c.is_closed], reverse=True)
        print(f"   Closed chain sizes: {closed_sizes[:10]}")


# =============================================================================
# Step 6: Write to AutoCAD
# =============================================================================
def _pt(x, y, z=0.0):
    return win32com.client.VARIANT(
        pythoncom.VT_ARRAY | pythoncom.VT_R8, (float(x), float(y), float(z)))

def _dbl_array(coords):
    """Create a VARIANT double array for polyline points."""
    return win32com.client.VARIANT(
        pythoncom.VT_ARRAY | pythoncom.VT_R8, tuple(float(c) for c in coords))

def _retry(fn, retries=12, delay=0.05):
    d = delay
    for _ in range(retries):
        try: return fn()
        except pythoncom.com_error as e:
            if e.args and e.args[0] == -2147418111:
                time.sleep(d); d = min(d*1.5, 0.5)
            else: raise
    raise RuntimeError("COM call rejected after retries")

def _ensure_layer(doc, name, aci=7):
    try: layer = doc.Layers.Item(name)
    except: layer = doc.Layers.Add(name)
    try: layer.Color = aci
    except: pass
    return layer

def pts_to_model(px, py, scale_mm, cfg):
    return cfg.autocad_origin_x + px * scale_mm, cfg.autocad_origin_y + py * scale_mm


def write_to_autocad(view_layers: Dict[str, List[Seg]], chains_by_layer: Dict[str, List[Chain]],
                     arcs: List[ArcEntity],
                     scale_mm: float, cfg: Config) -> List[Dict[str, Any]]:
    if not COM_OK:
        print("[5/6] COM not available."); return []

    use_chains = cfg.join_lines and chains_by_layer
    total = sum(len(v) for v in view_layers.values())
    mode = "polylines" if use_chains else "line segments"
    print(f"[5/6] Writing to AutoCAD ({mode} + {len(arcs)} arcs) ...")

    pythoncom.CoInitialize()
    records = []

    try:
        acad = win32com.client.Dispatch("AutoCAD.Application")
        acad.Visible = True
        
        # Ensure we have a valid document with ModelSpace
        doc = None
        for _attempt in range(3):
            try:
                doc = acad.ActiveDocument
                # Test that ModelSpace is accessible
                _ = doc.ModelSpace.Count
                break
            except Exception:
                try:
                    doc = acad.Documents.Add()
                    time.sleep(1.0)
                    _ = doc.ModelSpace.Count
                    break
                except Exception:
                    time.sleep(2.0)
                    doc = None
        
        if doc is None:
            print("   ERROR: Cannot access AutoCAD ModelSpace.")
            print("   >> Make sure AutoCAD has a drawing open (File > New)")
            print("   >> Then re-run the script.")
            return []
        
        ms = doc.ModelSpace

        # Create layers
        all_layers = set(view_layers.keys())
        if use_chains:
            all_layers |= set(chains_by_layer.keys())
        arc_layer = f"{cfg.layer_base}_ARCS"
        all_layers.add(arc_layer)
        for ln in all_layers:
            _ensure_layer(doc, ln, _layer_color(ln))

        skip = 0

        # --- Write arcs/circles ---
        for arc in arcs:
            try:
                acx, acy = pts_to_model(arc.cx, arc.cy, scale_mm, cfg)
                ar = arc.r * scale_mm
                if arc.is_circle:
                    def _draw_circle(x=acx, y=acy, r=ar, ln=arc_layer):
                        e = ms.AddCircle(_pt(x, y), r)
                        e.Layer = ln; return e
                    _retry(_draw_circle)
                    records.append({"type": "CIRCLE", "layer": arc_layer,
                                    "radius_mm": round(ar, 1), "closed": True})
                else:
                    # AutoCAD AddArc(center, radius, start_angle_rad, end_angle_rad)
                    sa = math.radians(arc.start_angle)
                    ea = math.radians(arc.end_angle)
                    def _draw_arc(x=acx, y=acy, r=ar, s=sa, e=ea, ln=arc_layer):
                        ent = ms.AddArc(_pt(x, y), r, s, e)
                        ent.Layer = ln; return ent
                    _retry(_draw_arc)
                    records.append({"type": "ARC", "layer": arc_layer,
                                    "radius_mm": round(ar, 1), "closed": False})
            except Exception:
                skip += 1

        if arcs:
            print(f"   Wrote {sum(1 for r in records if r['type'] in ('ARC','CIRCLE'))} arcs/circles")

        if use_chains:
            # Write chains as polylines (or single lines for 1-seg chains)
            chain_count = 0
            for layer_name, chain_list in chains_by_layer.items():
                for ch in chain_list:
                    pts_model = [pts_to_model(p[0], p[1], scale_mm, cfg) for p in ch.points]

                    if len(pts_model) == 2:
                        # Single line
                        try:
                            ax1, ay1 = pts_model[0]
                            ax2, ay2 = pts_model[1]
                            def _draw(a1=ax1,b1=ay1,a2=ax2,b2=ay2,ln=layer_name):
                                e = ms.AddLine(_pt(a1,b1), _pt(a2,b2))
                                e.Layer = ln; return e
                            _retry(_draw)
                            records.append({"type": "LINE", "layer": layer_name,
                                            "points": 2, "closed": ch.is_closed})
                        except: skip += 1
                    else:
                        # Polyline (lightweight 2D)
                        try:
                            # AddLightWeightPolyline takes flat array of x,y pairs
                            flat = []
                            for p in pts_model:
                                flat.extend([p[0], p[1]])
                            def _draw_pl(f=flat, ln=layer_name, closed=ch.is_closed):
                                e = ms.AddLightWeightPolyline(_dbl_array(f))
                                e.Layer = ln
                                if closed:
                                    e.Closed = True
                                return e
                            _retry(_draw_pl)
                            chain_count += 1
                            records.append({"type": "PLINE", "layer": layer_name,
                                            "points": len(pts_model), "closed": ch.is_closed})
                        except Exception as ex:
                            # Fallback: write as individual lines
                            for j in range(len(pts_model)-1):
                                try:
                                    ax1,ay1 = pts_model[j]; ax2,ay2 = pts_model[j+1]
                                    def _draw(a1=ax1,b1=ay1,a2=ax2,b2=ay2,ln=layer_name):
                                        e = ms.AddLine(_pt(a1,b1), _pt(a2,b2))
                                        e.Layer = ln; return e
                                    _retry(_draw)
                                    records.append({"type": "LINE", "layer": layer_name,
                                                    "points": 2, "closed": False})
                                except: skip += 1

            print(f"   Wrote {chain_count} polylines + {sum(1 for r in records if r['type']=='LINE')} lines")

        else:
            # Write individual line segments
            for layer_name, ss in view_layers.items():
                for s in ss:
                    ax1, ay1 = pts_to_model(s.x1, s.y1, scale_mm, cfg)
                    ax2, ay2 = pts_to_model(s.x2, s.y2, scale_mm, cfg)
                    try:
                        def _draw(a1=ax1,b1=ay1,a2=ax2,b2=ay2,ln=layer_name):
                            e = ms.AddLine(_pt(a1,b1), _pt(a2,b2))
                            e.Layer = ln; return e
                        _retry(_draw)
                        records.append({"type": "LINE", "layer": layer_name,
                                        "x1": round(ax1,3), "y1": round(ay1,3),
                                        "x2": round(ax2,3), "y2": round(ay2,3)})
                    except: skip += 1

        if skip: print(f"   {skip} entities skipped (COM errors)")

        # PDF underlay
        if cfg.attach_underlay:
            _attach_pdf_underlay(doc, cfg.input_path, cfg.autocad_origin_x, cfg.autocad_origin_y)

        try:
            doc.Regen(1)
            doc.SendCommand("_.ZOOM _E \n")
        except: pass

        print(f"   OK - {len(records)} entities written")
        return records

    finally:
        pythoncom.CoUninitialize()


def _attach_pdf_underlay(doc, pdf_path, ox, oy):
    print("   Attaching PDF underlay ...")
    try:
        pdf_abs = str(Path(pdf_path).resolve())
        cmd = (f'_.-PDFATTACH\n{pdf_abs}\n1\n{ox},{oy}\n1\n0\n')
        doc.SendCommand(cmd)
        time.sleep(2.0)
        print("   PDF underlay attached via -PDFATTACH.")
    except Exception as e:
        print(f"   WARN: -PDFATTACH failed ({e}), trying script fallback ...")
        try:
            scr_file = Path(pdf_path).parent / "_tmp_attach.scr"
            with open(scr_file, "w", encoding="ascii", errors="replace") as f:
                f.write(f"_.-PDFATTACH\n{str(Path(pdf_path).resolve())}\n1\n{ox},{oy}\n1\n0\n")
            doc.SendCommand(f"_.SCRIPT {str(scr_file.resolve())}\n")
            time.sleep(2.0)
            try: scr_file.unlink()
            except: pass
            print("   PDF underlay attached via script.")
        except Exception as e2:
            print(f"   WARN: underlay failed: {e2}")
            print(f"   >> Attach manually: -PDFATTACH, select {pdf_path}")


# =============================================================================
# Step 6b: Report + cleanup script
# =============================================================================
def write_report(records, cfg):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = Path(cfg.input_path).stem
    out_dir = Path(cfg.input_path).parent

    if cfg.report_format == "xlsx" and PANDAS_OK:
        out = out_dir / f"{base}_v4_report_{ts}.xlsx"
        pd.DataFrame(records).to_excel(str(out), index=False, engine="openpyxl")
    else:
        out = out_dir / f"{base}_v4_report_{ts}.csv"
        if records:
            with open(str(out), "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(records[0].keys()))
                w.writeheader(); w.writerows(records)
    print(f"   Report: {out}")
    try: os.startfile(str(out))
    except: pass


def write_cleanup_script(cfg, layer_names, has_chains):
    """Write a .scr AutoCAD script for cleanup."""
    out_dir = Path(cfg.input_path).parent
    scr = out_dir / f"{Path(cfg.input_path).stem}_cleanup.scr"

    lines = []
    lines.append("; Cleanup script for BESS import v4")
    lines.append("; Run: type SCRIPT in AutoCAD command line, then select this file")

    # Step 1: OVERKILL to remove overlapping geometry
    lines.append("_.-OVERKILL")
    lines.append("_ALL")
    lines.append("")    # end selection
    lines.append("")    # accept default tolerance

    # Step 2: If lines were NOT pre-joined, add PEDIT join per layer
    if not has_chains:
        lines.append("; Join lines into polylines per layer")
        line_layers = [ln for ln in layer_names if "CURVE" not in ln.upper()]
        for ln in line_layers:
            # Select all on this layer, then PEDIT Multiple Join
            # Using QSELECT via script is tricky, so we use a filter approach:
            # _PEDIT _M (select by layer filter) then _J
            # Actually the most reliable way in a .scr:
            #   1. Set current layer
            #   2. SELECT by property
            # This is complex in .scr. Better to give manual instructions.
            pass
        lines.append("; To join lines manually per layer:")
        lines.append(";   1. Select all lines on a layer (right-click > Quick Select > Layer = xxx)")
        lines.append(";   2. Type PEDIT > M (multiple) > Y > J (join) > 0.5 (fuzz) > Enter > Enter")

    # Step 3: Zoom
    lines.append("_.ZOOM _E")
    lines.append("; Done")

    with open(str(scr), "w", encoding="ascii", errors="replace") as f:
        f.write("\n".join(lines) + "\n")

    print(f"   Cleanup script: {scr}")
    return str(scr)


# =============================================================================
# Underlay-only mode
# =============================================================================
def attach_underlay_only(cfg):
    if not COM_OK: return
    pythoncom.CoInitialize()
    try:
        acad = win32com.client.Dispatch("AutoCAD.Application")
        acad.Visible = True
        try: doc = acad.ActiveDocument
        except: doc = acad.Documents.Add()
        _attach_pdf_underlay(doc, cfg.input_path, cfg.autocad_origin_x, cfg.autocad_origin_y)
        doc.SendCommand("_.ZOOM _E \n")
    finally:
        pythoncom.CoUninitialize()


# =============================================================================
# CLI
# =============================================================================
def pick_file():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw()
        p = filedialog.askopenfilename(title="Select PDF drawing",
                                        filetypes=[("PDF","*.pdf"),("All","*.*")])
        root.destroy(); return p or ""
    except: return ""

def build_parser():
    p = argparse.ArgumentParser(
        description="Import vector PDF into AutoCAD (v5 - arcs + extend + auto-join)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full featured import (recommended):
  python pdf_to_autocad_v5.py BESS_container.pdf --known-dim 6058 --separate-views --join --extend

  # Basic import at real scale:
  python pdf_to_autocad_v5.py BESS_container.pdf --known-dim 6058

  # Without arc detection:
  python pdf_to_autocad_v5.py BESS_container.pdf --known-dim 6058 --join --no-arcs

  # Just underlay:
  python pdf_to_autocad_v5.py BESS_container.pdf --underlay-only

Scale note:
  --known-dim is the REAL mm of the widest visible dimension.
  Common: 20ft container=6058, 40ft=12192
        """)
    p.add_argument("input", nargs="?", default="")
    p.add_argument("--page", type=int, default=1)
    p.add_argument("--known-dim", type=float, default=None,
                   help="Real mm width of widest view (auto-scales drawing)")
    p.add_argument("--scale-mm", type=float, default=1.0)
    p.add_argument("--min-len", type=float, default=4.0,
                   help="Min stroke length in PDF pts (default 4)")
    p.add_argument("--no-curves", action="store_true")
    p.add_argument("--separate-views", action="store_true",
                   help="Put each view on its own layer")
    p.add_argument("--join", action="store_true",
                   help="Auto-join line endpoints into polylines")
    p.add_argument("--join-tol", type=float, default=2.0,
                   help="Join tolerance in PDF pts (default 2.0)")
    p.add_argument("--extend", action="store_true",
                   help="Extend dead-end lines to nearest intersection")
    p.add_argument("--extend-max", type=float, default=8.0,
                   help="Max extension distance in PDF pts (default 8.0)")
    p.add_argument("--no-arcs", action="store_true",
                   help="Disable arc/circle detection")
    p.add_argument("--origin-x", type=float, default=0.0)
    p.add_argument("--origin-y", type=float, default=0.0)
    p.add_argument("--underlay-only", action="store_true")
    p.add_argument("--no-underlay", action="store_true")
    p.add_argument("--keep-border", action="store_true",
                   help="Do not remove border/title block lines")
    p.add_argument("--report", choices=["xlsx","csv"], default="xlsx")
    p.add_argument("--layer-base", default="BESS")
    return p


def main():
    parser = build_parser()
    args = parser.parse_args()

    inp = args.input
    if not inp:
        print("No file specified -- opening picker ...")
        inp = pick_file()
    if not inp or not Path(inp).exists():
        print(f"File not found: {inp}"); sys.exit(1)

    known_dim = args.known_dim
    if known_dim is None and not args.underlay_only:
        try:
            raw = input(
                "\nReal-world width of container in mm?\n"
                "  20ft BESS = 6058   40ft = 12192   Skip = press Enter\n> "
            ).strip()
            if raw: known_dim = float(raw)
        except: pass

    cfg = Config(
        input_path=inp,
        page_number=args.page,
        min_line_len_pt=args.min_len,
        include_curves=not args.no_curves,
        known_dim_mm=known_dim,
        scale_mm=args.scale_mm,
        autocad_origin_x=args.origin_x,
        autocad_origin_y=args.origin_y,
        separate_views=args.separate_views,
        join_lines=args.join,
        join_tol_pt=args.join_tol,
        extend_lines=args.extend,
        extend_max_pt=args.extend_max,
        detect_arcs=not args.no_arcs,
        layer_base=args.layer_base,
        underlay_only=args.underlay_only,
        attach_underlay=not args.no_underlay,
        remove_border=not args.keep_border,
        report_format=args.report,
    )

    if cfg.underlay_only:
        attach_underlay_only(cfg); return

    # Step 1: Extract
    segs, pw, ph = extract_paths(cfg)

    # Step 2: Remove border
    segs, border = remove_border(segs, cfg)

    # Step 1b: Detect arcs
    segs, arcs = detect_arcs(segs, cfg, border)

    # Step 3: Scale
    scale_mm = compute_scale(segs, cfg)

    # Step 4: Assign views
    if cfg.separate_views:
        view_layers = assign_views(segs, cfg, scale_mm)
    else:
        print(f"[4/6] Single-layer mode")
        view_layers = assign_views(segs, cfg, scale_mm)

    # Step 4c: Extend dead ends to intersections (per layer)
    if cfg.extend_lines:
        for layer_name in view_layers:
            view_layers[layer_name] = extend_to_intersections(view_layers[layer_name], cfg)
        # Second pass: bridge remaining gaps
        print(f"[4d/6] Bridging remaining gaps ...")
        for layer_name in view_layers:
            view_layers[layer_name] = bridge_gaps(view_layers[layer_name], cfg)

    # Step 5: Join into chains (per layer)
    chains_by_layer = {}
    if cfg.join_lines:
        print(f"[4b/6] Joining endpoints (tolerance={cfg.join_tol_pt}pt = {cfg.join_tol_pt * scale_mm:.2f}mm) ...")
        for layer_name, layer_segs in view_layers.items():
            chains = join_into_chains(layer_segs, cfg.join_tol_pt)
            chains_by_layer[layer_name] = chains
            closed = sum(1 for c in chains if c.is_closed)
            multi = sum(1 for c in chains if len(c.seg_indices) > 1)
            print(f"   {layer_name}: {len(chains)} chains ({closed} closed, {multi} multi-seg)")
    else:
        print(f"[4b/6] Skipping join (use --join to enable)")

    # Step 6: Write to AutoCAD
    records = write_to_autocad(view_layers, chains_by_layer, arcs, scale_mm, cfg)

    # Step 7: Report + cleanup script
    print(f"[6/6] Writing outputs ...")
    write_report(records, cfg)
    if cfg.write_scr:
        write_cleanup_script(cfg, list(view_layers.keys()), bool(chains_by_layer))

    # Summary
    n_lines = sum(1 for r in records if r.get("type") == "LINE")
    n_plines = sum(1 for r in records if r.get("type") == "PLINE")
    n_closed = sum(1 for r in records if r.get("closed"))
    n_arcs = sum(1 for r in records if r.get("type") == "ARC")
    n_circles = sum(1 for r in records if r.get("type") == "CIRCLE")

    print(f"""
{'='*60}
Import complete (v5).
  Line segments : {n_lines}
  Polylines     : {n_plines}  ({n_closed} closed)
  Arcs          : {n_arcs}
  Circles       : {n_circles}
  Scale         : {scale_mm:.4f} mm/pt
  Views/layers  : {len(view_layers)}
{'='*60}

Next steps in AutoCAD:
  1. Run cleanup script: SCRIPT >> {Path(inp).stem}_cleanup.scr
  2. Check scale: DIST between two known container corners
  3. If not pre-joined: PEDIT > M > Y > J to join lines per layer
  4. For 3D: EXTRUDE closed polylines
""")


if __name__ == "__main__":
    main()
