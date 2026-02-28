# file: scripts/create_ground_grid_autoinfer_and_report.py
import csv
import math
import os
from datetime import datetime
from typing import Dict, Iterable, List, Tuple, Set, Any

import pythoncom
import win32com.client
import time

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

Point2D = Tuple[float, float]
Line2D = Tuple[Point2D, Point2D]

# ----------------------------
# Config
# ----------------------------
LAYER_NAME = "Ground Grid"
ACI_GRID = 3

T_BLOCK = "GND - MAIN GRID TEE"
ROD_BLOCK = "Ground Rod"
CROSS_BLOCK = "GND - MAIN GRID CROSS"

BLOCK_SCALE_SETTING = 8.33

# Toggle these
PLACE_TEES = True
PLACE_CROSSES = True  # optional; set False if you don't want auto-crosses

# Units
INCHES_PER_FOOT = 12.0

# Origin (GRID(0,0) in AutoCAD inches)
ORIGIN_X_FEET = 491.0
ORIGIN_X_INCHES = 4.0 + 15.0 / 16.0
ORIGIN_Y_FEET = -390.0
ORIGIN_Y_INCHES = -(9.0 + 3.0 / 8.0)

ORIGIN_X_UNITS = ORIGIN_X_FEET * INCHES_PER_FOOT + ORIGIN_X_INCHES
ORIGIN_Y_UNITS = ORIGIN_Y_FEET * INCHES_PER_FOOT + ORIGIN_Y_INCHES

# TOP-LEFT grid (y increases downward). We compute GRID_MAX_Y from your data.
GRID_MAX_Y = 0.0

# Tolerances
EPS_MATCH = 1e-6  # stricter because your data is clean integers/halves

# ----------------------------
# YOUR TABLES (paste as-is)
# ----------------------------
RODS_TXT = r"""
R1	20	0	0	1.5	0	0
R2	20	286	0	1.5	286	0
R3	20	0	281	1.5	0	281
R4	20	286	281	1.5	286	281
R5	20	33	0	1.5	33	0
R6	20	253	0	1.5	253	0
R7	20	33	281	1.5	33	281
R8	20	250	281	1.5	250	281
R9	20	286	245	1.5	286	245
R10	20	286	35	1.5	286	35
R11	20	0	245	1.5	0	245
R12	20	0	35	1.5	0	35
R13	20	110	281	1.5	110	281
R14	20	178	281	1.5	178	281
R15	20	110	0	1.5	110	0
R16	20	178	0	1.5	178	0
R17	20	286	100	1.5	286	100
R18	20	286	184	1.5	286	184
R19	20	0	100	1.5	0	100
R20	20	0	184	1.5	0	184
R21	20	138	100	1.5	138	100
R22	20	33	35	1.5	33	35
R23	20	33	245	1.5	33	245
R24	20	253	35	1.5	253	35
R25	20	218	100	1.5	218	100
R26	20	250	245	1.5	250	245
R27	20	258	132	1.5	258	132
R28	20	178	132	1.5	178	132
R29	20	98	132	1.5	98	132
R30	20	58	100	1.5	58	100
R31	20	138	212	1.5	138	212
R32	20	58	132	1.5	58	132
R33	20	138	132	1.5	138	132
R34	20	218	132	1.5	218	132
R35	20	98	100	1.5	98	100
R36	20	178	100	1.5	178	100
R37	20	258	100	1.5	258	100
R38	20	86	35	1.5	86	35
R39	20	203	35	1.5	203	35
R40	20	203	245	1.5	203	245
R41	20	86	245	1.5	86	245
R42	20	278	212	1.5	278	212
R43	20	8	212	1.5	8	212
R44	20	278	66	1.5	278	66
R45	20	8	66	1.5	8	66
R46	20	250	212	1.5	250	212
R47	20	33	212	1.5	33	212
R48	20	8	155	1.5	8	155
R49	20	33	125	1.5	33	125
R50	20	138	245	1.5	138	245
""".strip()

CONDUCTORS_TXT = r"""
1	C1	286	0	0	1.5	286	0
2	C2	286	0	8	1.5	286	8
3	C3	286	0	35	1.5	286	35
4	C6	58	0	125	1.5	58	125
5	C7	58	0	155	1.5	58	155
6	C8	286	0	184	1.5	286	184
7	C9	286	0	212	1.5	286	212
8	C10	286	0	245	1.5	286	245
9	C11	286	0	273	1.5	286	273
10	C12	286	0	281	1.5	286	281
11	C13	281	0	0	1.5	0	281
12	C14	281	8	0	1.5	8	281
13	C15	281	33	0	1.5	33	281
14	C16	281	58	0	1.5	58	281
15	C17	100	86	0	1.5	86	100
16	C18	281	110	0	1.5	110	281
17	C20	281	178	0	1.5	178	281
18	C21	281	203	0	1.5	203	281
19	C22	35	228	0	1.5	228	35
20	C23	281	278	0	1.5	278	281
21	C24	281	286	0	1.5	286	281
22	C25	35	253	0	1.5	253	35
23	C26	35	153	0	1.5	153	35
24	T1-1	40	58	132	1.5	98	132
25	T1-3	149	98	35	1.5	98	184
26	C27	149	86	132	1.5	86	281
27	C29	40	98	125	1.5	138	125
28	C30	40	98	155	1.5	138	155
29	T2-1	281	138	0	1.5	138	281
30	T2-3	40	138	132	1.5	178	132
31	C31	149	165	132	1.5	165	281
32	C33	40	178	125	1.5	218	125
33	C34	40	178	155	1.5	218	155
34	T3-1	149	218	35	1.5	218	184
35	T3-2	149	258	35	1.5	258	184
36	C35	40	218	132	1.5	258	132
37	C37	28	258	125	1.5	286	125
38	C38	28	258	155	1.5	286	155
39	C39	97	228	184	1.5	228	281
40	C40	149	250	132	1.5	250	281
41	T1-4	286	0	100	1.5	286	100
42	C41	65	165	35	1.5	165	100
43	C42	65	245	35	1.5	245	100
44	C64	40	58	160	1.5	98	160
45	C65	40	138	160	1.5	178	160
46	C66	40	218	160	1.5	258	160
47	C67	286	0	66	1.5	286	66
""".strip()

# ----------------------------
# Parsing
# ----------------------------
def _split_row(raw: str) -> List[str]:
    return [p for p in raw.replace(",", "\t").split() if p]

def parse_rods_table(txt: str) -> List[Point2D]:
    pts: List[Point2D] = []
    for raw in txt.splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        parts = _split_row(raw)
        if len(parts) < 3:
            continue
        x = float(parts[-2])
        y = float(parts[-1])
        pts.append((x, y))
    return pts

def parse_conductors_table(txt: str) -> List[Tuple[str, Line2D]]:
    out: List[Tuple[str, Line2D]] = []
    for raw in txt.splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        parts = _split_row(raw)
        if len(parts) < 8:
            continue
        name = parts[1]
        x1 = float(parts[3]); y1 = float(parts[4])
        x2 = float(parts[6]); y2 = float(parts[7])
        out.append((name, ((x1, y1), (x2, y2))))
    return out

rod_points = parse_rods_table(RODS_TXT)
conductor_rows = parse_conductors_table(CONDUCTORS_TXT)
grid_lines: List[Line2D] = [ln for _, ln in conductor_rows]

# ----------------------------
# Mapping (TOP-LEFT grid -> AutoCAD)
# ----------------------------
def grid_to_autocad(gx: float, gy: float) -> Tuple[float, float]:
    y_flipped = GRID_MAX_Y - gy
    return ORIGIN_X_UNITS + gx * INCHES_PER_FOOT, ORIGIN_Y_UNITS + y_flipped * INCHES_PER_FOOT

def autocad_to_grid(ax: float, ay: float) -> Tuple[float, float]:
    gx = (ax - ORIGIN_X_UNITS) / INCHES_PER_FOOT
    gy_flipped = (ay - ORIGIN_Y_UNITS) / INCHES_PER_FOOT
    gy = GRID_MAX_Y - gy_flipped
    return gx, gy

# ----------------------------
# COM Helpers
# ----------------------------
def pt(x: float, y: float, z: float = 0.0):
    return win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, (float(x), float(y), float(z)))

def get_acad_and_doc():
    acad = win32com.client.Dispatch("AutoCAD.Application")
    acad.Visible = True
    try:
        doc = acad.ActiveDocument
    except pythoncom.com_error:
        doc = None
    if not doc:
        doc = acad.Documents.Add()
    return acad, doc

def ensure_layer(doc, name: str, aci: int):
    try:
        layer = doc.Layers.Item(name)
    except pythoncom.com_error:
        layer = doc.Layers.Add(name)
    try:
        layer.Color = int(aci)
    except Exception:
        pass
    return layer

def com_call_with_retry(callable_func, max_retries=10, initial_delay=0.05):
    delay = initial_delay
    for _ in range(max_retries):
        try:
            return callable_func()
        except pythoncom.com_error as e:
            if e[0] == -2147418111:  # RPC_E_CALL_REJECTED
                time.sleep(delay)
                delay *= 1.5
            else:
                raise
    raise RuntimeError("Call rejected by callee too many times.")

def ensure_block(doc, name: str, builder):
    try:
        return doc.Blocks.Item(name)
    except pythoncom.com_error:
        blk = doc.Blocks.Add(pt(0, 0, 0), name)
        builder(blk)
        return blk

# ----------------------------
# Scale + Block builders
# ----------------------------
BLOCK_SCALE = 12.0
TEE_HALF = 1.5 * BLOCK_SCALE
TEE_STEM = 1.2 * BLOCK_SCALE
ROD_RADIUS = 0.6 * BLOCK_SCALE
ROD_TICK = 1.4 * BLOCK_SCALE
CROSS_ARM = 1.5 * BLOCK_SCALE

def calculate_block_scale_from_grid(lines_grid: List[Line2D]) -> float:
    # Use smallest non-zero spacing in X or Y between unique grid lines
    xs: Set[float] = set()
    ys: Set[float] = set()
    for (x1, y1), (x2, y2) in lines_grid:
        if abs(y1 - y2) <= EPS_MATCH:
            ys.add(y1)
        if abs(x1 - x2) <= EPS_MATCH:
            xs.add(x1)
    xs_sorted = sorted(xs)
    ys_sorted = sorted(ys)

    def min_spacing(vals: List[float]) -> float:
        best = None
        for i in range(1, len(vals)):
            d = abs(vals[i] - vals[i-1])
            if d > EPS_MATCH and (best is None or d < best):
                best = d
        return best if best is not None else 12.0

    ms = min(min_spacing(xs_sorted), min_spacing(ys_sorted))

    if isinstance(BLOCK_SCALE_SETTING, str):
        s = BLOCK_SCALE_SETTING.lower()
        if s == "auto":
            return ms * 0.15
        if s == "small":
            return ms * 0.08
        if s == "medium":
            return ms * 0.12
        if s == "large":
            return ms * 0.20
        try:
            return float(s)
        except ValueError:
            return ms * 0.15

    v = float(BLOCK_SCALE_SETTING)
    return ms * v if v <= 1.0 else v

def build_tee_block(block):
    # Bar along X, stem DOWN (negative Y)
    block.AddLine(pt(-TEE_HALF, 0), pt(TEE_HALF, 0))
    block.AddLine(pt(0, 0), pt(0, -TEE_STEM))

def build_rod_block(block):
    block.AddCircle(pt(0, 0), float(ROD_RADIUS))
    block.AddLine(pt(-ROD_TICK * 0.5, 0), pt(ROD_TICK * 0.5, 0))

def build_cross_block(block):
    a = CROSS_ARM
    block.AddLine(pt(-a, 0), pt(a, 0))
    block.AddLine(pt(0, -a), pt(0, a))

# ----------------------------
# Topology: split at intersections, classify nodes
# ----------------------------
def quant(v: float, nd: int = 6) -> int:
    return int(round(v * (10 ** nd)))

def qpt(p: Point2D, nd: int = 6) -> Tuple[int, int]:
    return (quant(p[0], nd), quant(p[1], nd))

def is_h(line: Line2D) -> bool:
    (x1, y1), (x2, y2) = line
    return abs(y1 - y2) <= EPS_MATCH and abs(x1 - x2) > EPS_MATCH

def is_v(line: Line2D) -> bool:
    (x1, y1), (x2, y2) = line
    return abs(x1 - x2) <= EPS_MATCH and abs(y1 - y2) > EPS_MATCH

def line_bounds(line: Line2D):
    (x1, y1), (x2, y2) = line
    return min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)

def intersection_points(lines: List[Line2D]) -> Dict[Tuple[int, int], Point2D]:
    """
    Returns all endpoints + all H/V intersections as unique points.
    """
    pts: Dict[Tuple[int, int], Point2D] = {}

    hs = [ln for ln in lines if is_h(ln)]
    vs = [ln for ln in lines if is_v(ln)]

    # add endpoints
    for (a, b) in lines:
        pts[qpt(a)] = a
        pts[qpt(b)] = b

    # add H/V intersections
    for h in hs:
        hx1, hx2, hy1, hy2 = line_bounds(h)
        y = hy1
        for v in vs:
            vx1, vx2, vy1, vy2 = line_bounds(v)
            x = vx1
            if (hx1 - EPS_MATCH) <= x <= (hx2 + EPS_MATCH) and (vy1 - EPS_MATCH) <= y <= (vy2 + EPS_MATCH):
                p = (x, y)
                pts[qpt(p)] = p

    return pts

def split_lines_at_points(lines: List[Line2D], pts: Dict[Tuple[int, int], Point2D]) -> List[Line2D]:
    """
    Split each original line into atomic segments between consecutive points along it.
    Only supports axis-aligned lines (your data is).
    """
    atomic: List[Line2D] = []

    for ln in lines:
        (x1, y1), (x2, y2) = ln
        bx1, bx2, by1, by2 = line_bounds(ln)

        if is_h(ln):
            y = y1
            # gather points that lie on this horizontal
            xs = []
            for p in pts.values():
                px, py = p
                if abs(py - y) <= EPS_MATCH and (bx1 - EPS_MATCH) <= px <= (bx2 + EPS_MATCH):
                    xs.append(px)
            xs = sorted(set(xs))
            for i in range(1, len(xs)):
                a = (xs[i-1], y)
                b = (xs[i], y)
                if abs(a[0] - b[0]) > EPS_MATCH:
                    atomic.append((a, b))

        elif is_v(ln):
            x = x1
            ys = []
            for p in pts.values():
                px, py = p
                if abs(px - x) <= EPS_MATCH and (by1 - EPS_MATCH) <= py <= (by2 + EPS_MATCH):
                    ys.append(py)
            ys = sorted(set(ys))
            for i in range(1, len(ys)):
                a = (x, ys[i-1])
                b = (x, ys[i])
                if abs(a[1] - b[1]) > EPS_MATCH:
                    atomic.append((a, b))

        else:
            # ignore non-axis aligned (not expected here)
            pass

    # de-dupe
    seen = set()
    out: List[Line2D] = []
    for (a, b) in atomic:
        ka = qpt(a, 6)
        kb = qpt(b, 6)
        key = (ka, kb) if ka <= kb else (kb, ka)
        if key not in seen:
            seen.add(key)
            out.append((a, b))
    return out

def build_direction_map(segments: List[Line2D]) -> Dict[Tuple[int, int], Set[str]]:
    """
    For each node, record which of N/S/E/W connect from that node.
    """
    dirs: Dict[Tuple[int, int], Set[str]] = {}

    def add_dir(p: Point2D, d: str):
        k = qpt(p, 6)
        dirs.setdefault(k, set()).add(d)

    for (a, b) in segments:
        (x1, y1), (x2, y2) = a, b
        if abs(y1 - y2) <= EPS_MATCH:  # horizontal
            if x2 > x1:
                add_dir(a, "E"); add_dir(b, "W")
            else:
                add_dir(a, "W"); add_dir(b, "E")
        elif abs(x1 - x2) <= EPS_MATCH:  # vertical
            if y2 > y1:
                add_dir(a, "S"); add_dir(b, "N")
            else:
                add_dir(a, "N"); add_dir(b, "S")

    return dirs

def classify_nodes(dir_map: Dict[Tuple[int, int], Set[str]]) -> Tuple[List[Point2D], List[Point2D]]:
    """
    Returns (tee_points, cross_points) in GRID coordinates.
    """
    tees: List[Point2D] = []
    crosses: List[Point2D] = []
    for k, ds in dir_map.items():
        if len(ds) == 3:
            tees.append((k[0] / 1e6, k[1] / 1e6))
        elif len(ds) == 4:
            crosses.append((k[0] / 1e6, k[1] / 1e6))
    return tees, crosses

def tee_rotation_from_dirs(ds: Set[str]) -> float:
    """
    Our tee block stem is DOWN by default (negative AutoCAD Y).

    ds is in GRID directions (N/S/E/W) where:
      - GRID Y increases DOWN (top-left origin)

    Because we flip Y when mapping to AutoCAD, GRID North/South are inverted
    relative to AutoCAD. So we swap N<->S for rotation purposes.
    """
    hasE = "E" in ds
    hasW = "W" in ds
    hasN = "N" in ds
    hasS = "S" in ds

    # Determine which direction is the branch (the "single" direction)
    if hasE and hasW and (hasN ^ hasS):
        branch = "N" if hasN else "S"
    elif hasN and hasS and (hasE ^ hasW):
        branch = "E" if hasE else "W"
    else:
        if hasN and not hasS: branch = "N"
        elif hasS and not hasN: branch = "S"
        elif hasE and not hasW: branch = "E"
        else: branch = "W"

    # IMPORTANT: swap N/S because GRID y-down is flipped into AutoCAD y-up
    if branch == "N":
        branch = "S"
    elif branch == "S":
        branch = "N"

    # Map branch direction to rotation (stem should point to branch)
    # Stem-down (negative AutoCAD Y) is rotation 0.
    if branch == "S": return 0.0
    if branch == "N": return math.pi
    if branch == "E": return math.pi / 2.0
    return -math.pi / 2.0


# ----------------------------
# Drawing ops
# ----------------------------
def add_line(ms, a: Point2D, b: Point2D, layer: str):
    def add():
        return ms.AddLine(pt(a[0], a[1]), pt(b[0], b[1]))
    ln = com_call_with_retry(add)
    ln.Layer = layer
    return ln

def insert_block(ms, name: str, x: float, y: float, layer: str, rot: float = 0.0):
    def insert():
        return ms.InsertBlock(pt(x, y), name, BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE, 0.0)
    br = com_call_with_retry(insert)
    br.Layer = layer
    if abs(rot) > 1e-9:
        def setrot():
            br.Rotation = rot
        try:
            com_call_with_retry(setrot)
        except Exception:
            pass
    return br

def zoom_extents(doc):
    try:
        doc.SendCommand("_.ZOOM _E ")
    except Exception:
        try:
            doc.Application.ZoomExtents()
        except Exception:
            pass

# ----------------------------
# Reporting
# ----------------------------
def report_path_in_dwg_folder(doc, extension: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    try:
        dwg_dir = os.path.dirname(doc.FullName)
    except Exception:
        dwg_dir = ""
    if not dwg_dir:
        dwg_dir = os.getcwd()
    return os.path.join(dwg_dir, f"ground_grid_report_{ts}.{extension}")

def open_file(path: str):
    try:
        os.startfile(path)  # type: ignore[attr-defined]
        print(f"Opening: {path}")
    except Exception as e:
        print(f"Could not auto-open file: {e}")

def save_report_csv(rows: List[Dict[str, Any]], file_path: str):
    fieldnames = ["type", "grid_x", "grid_y", "autocad_x", "autocad_y", "rotation_deg"]
    with open(file_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

def save_report_xlsx(rows: List[Dict[str, Any]], file_path: str):
    if not PANDAS_AVAILABLE:
        return False
    try:
        df = pd.DataFrame(rows)
        df.to_excel(file_path, index=False, engine="openpyxl")
        return True
    except Exception as e:
        print(f"Error creating XLSX file: {e}")
        return False

# ----------------------------
# Main
# ----------------------------
def main():
    pythoncom.CoInitialize()
    try:
        if not grid_lines:
            raise RuntimeError("No conductors parsed from CONDUCTORS_TXT")

        # Compute GRID_MAX_Y from your data (lines + rods)
        global GRID_MAX_Y
        ys = []
        for (a, b) in grid_lines:
            ys.extend([a[1], b[1]])
        ys.extend([p[1] for p in rod_points])
        GRID_MAX_Y = float(max(ys))
        print(f"GRID_MAX_Y (from your tables) = {GRID_MAX_Y}")

        # Compute scale in GRID units -> convert to AutoCAD units by multiplying after mapping
        global BLOCK_SCALE, TEE_HALF, TEE_STEM, ROD_RADIUS, ROD_TICK, CROSS_ARM
        # block scale in AutoCAD units, so compute grid spacing, then multiply by 12
        grid_scale = calculate_block_scale_from_grid(grid_lines)
        BLOCK_SCALE = float(BLOCK_SCALE_SETTING)  # 8.33
        TEE_HALF = 1.5 * BLOCK_SCALE
        TEE_STEM = 1.2 * BLOCK_SCALE
        ROD_RADIUS = 0.6 * BLOCK_SCALE
        ROD_TICK = 1.4 * BLOCK_SCALE
        CROSS_ARM = 1.5 * BLOCK_SCALE


        _, doc = get_acad_and_doc()
        ms = doc.ModelSpace

        ensure_layer(doc, LAYER_NAME, ACI_GRID)

        # Blocks
        ensure_block(doc, T_BLOCK, build_tee_block)
        ensure_block(doc, ROD_BLOCK, build_rod_block)
        ensure_block(doc, CROSS_BLOCK, build_cross_block)

        # Draw conductors EXACTLY from your table
        for _, ((x1, y1), (x2, y2)) in conductor_rows:
            a = grid_to_autocad(x1, y1)
            b = grid_to_autocad(x2, y2)
            add_line(ms, a, b, LAYER_NAME)

        # --- Build correct topology by splitting at intersections (in GRID space)
        pts = intersection_points(grid_lines)
        segments = split_lines_at_points(grid_lines, pts)
        dir_map = build_direction_map(segments)
        tees_grid, crosses_grid = classify_nodes(dir_map)

        placements: List[Dict[str, Any]] = []

        # Place rods
        for (gx, gy) in rod_points:
            ax, ay = grid_to_autocad(gx, gy)
            insert_block(ms, ROD_BLOCK, ax, ay, LAYER_NAME, 0.0)
            placements.append({
                "type": "ROD",
                "grid_x": gx, "grid_y": gy,
                "autocad_x": ax, "autocad_y": ay,
                "rotation_deg": 0.0
            })

        # Place tees only where node has exactly 3 directions
        if PLACE_TEES:
            for (gx, gy) in tees_grid:
                ds = dir_map.get(qpt((gx, gy), 6), set())
                rot = tee_rotation_from_dirs(ds)
                ax, ay = grid_to_autocad(gx, gy)
                insert_block(ms, T_BLOCK, ax, ay, LAYER_NAME, rot)
                placements.append({
                    "type": "TEE",
                    "grid_x": gx, "grid_y": gy,
                    "autocad_x": ax, "autocad_y": ay,
                    "rotation_deg": round(math.degrees(rot), 6)
                })

        # Optional crosses (4-way only)
        if PLACE_CROSSES:
            for (gx, gy) in crosses_grid:
                ax, ay = grid_to_autocad(gx, gy)
                insert_block(ms, CROSS_BLOCK, ax, ay, LAYER_NAME, 0.0)
                placements.append({
                    "type": "CROSS",
                    "grid_x": gx, "grid_y": gy,
                    "autocad_x": ax, "autocad_y": ay,
                    "rotation_deg": 0.0
                })

        print(f"Segments after split: {len(segments)}")
        print(f"TEE nodes: {len(tees_grid)}  CROSS nodes: {len(crosses_grid)}  RODS: {len(rod_points)}")

        try:
            doc.Regen(1)
        except Exception:
            pass
        zoom_extents(doc)

        # Report
        if PANDAS_AVAILABLE:
            out_xlsx = report_path_in_dwg_folder(doc, "xlsx")
            if save_report_xlsx(placements, out_xlsx):
                print(f"XLSX report written to: {out_xlsx}")
                open_file(out_xlsx)
            else:
                out_csv = report_path_in_dwg_folder(doc, "csv")
                save_report_csv(placements, out_csv)
                print(f"CSV report written to: {out_csv}")
                open_file(out_csv)
        else:
            out_csv = report_path_in_dwg_folder(doc, "csv")
            save_report_csv(placements, out_csv)
            print(f"CSV report written to: {out_csv}")
            open_file(out_csv)

    finally:
        pythoncom.CoUninitialize()

if __name__ == "__main__":
    main()
