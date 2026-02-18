# AutoCAD Coordinates Grabber Tool - Detailed Analysis Report

**Date:** February 18, 2026  
**Tool:** coordinatesgrabber.py (2288 lines)  
**Focus:** Layer Search Mode + 4-Corner Reference Block Placement

---

## EXECUTIVE SUMMARY

| Finding | Severity | Impact |
|---------|----------|--------|
| **Function signature mismatches** in layer_search mode calls | 🔴 CRITICAL | Tool will crash at runtime when layer_search is executed |
| **Missing 3-corner calculation logic** for reference block placement | 🔴 CRITICAL | Feature request cannot be implemented without new code |
| **Incomplete refactoring** of layer_search functions | 🔴 CRITICAL | Functions return 2 values but callsite expects 3 |
| **No corner extraction mechanism** in data model or placement logic | 🟠 HIGH | Row objects store only single (east, north, elev) point; no 4-corner support |
| **UI doesn't expose corner placement option** | 🟠 HIGH | Users have no way to select between 1-center vs 4-corner placement |

---

## 1. CODE QUALITY ISSUES

### 1.1 **CRITICAL: Function Signature Mismatch in `on_layer_search()`**
**Location:** [Lines 2201-2226](coordinatesgrabber.py#L2201-L2226)

**Problem:**
```python
# LINES 2201-2209 (FUNCTION CALL)
rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(
    cfg=cfg,
    doc=self.doc,
    blockrefs=blockrefs,
    target_layer=layer_name,
    start_number=cfg.initial_number,  # ← NOT IN FUNCTION SIGNATURE
    progress_cb=prog_blocks,
    log_cb=log_cb,
)

# ❌ EXPECTED 3 values, but function returns 2
# ❌ Function does NOT accept 'start_number' parameter
```

**Function Definition:** [Lines 1022-1030](coordinatesgrabber.py#L1022-L1030)
```python
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool]:  # ← RETURNS 2 VALUES ONLY
```

**Return statement:** [Line 1145](coordinatesgrabber.py#L1145)
```python
return rows, any_3d  # ← Only 2 values
```

**Impact:** 
- `ValueError: not enough values to unpack` will occur at line 2201
- If fixed to accept 2 values, `next_num` is used at line 2210, causing `NameError`

---

### 1.2 **CRITICAL: Function Signature Mismatch in `build_rows_layer_search_modelspace()`**
**Location:** [Lines 2218-2226](coordinatesgrabber.py#L2218-L2226)

**Problem:**
```python
# LINES 2218-2226 (FUNCTION CALL)
rows_out, has_3d_out, next_num = build_rows_layer_search_modelspace(
    cfg=cfg,
    doc=self.doc,                    # ← NOT IN FUNCTION SIGNATURE
    target_layer=layer_name,
    start_number=next_num,           # ← NOT IN FUNCTION SIGNATURE
    handles=sel_handles,             # ← NOT IN FUNCTION SIGNATURE
    ents=ms_ents,
    progress_cb=prog_ms,
    log_cb=log_cb,
)

# ❌ Function doesn't accept: doc, start_number, handles
# ❌ Expected 3 values, function returns 2
```

**Function Definition:** [Lines 841-850](coordinatesgrabber.py#L841-L850)
```python
def build_rows_layer_search_modelspace(
    cfg: Config,
    ents: Sequence[Any],
    target_layer: str,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool]:  # ← RETURNS 2 VALUES, NOT 3
```

**Return statement:** [Line 912](coordinatesgrabber.py#L912)
```python
return rows, any_3d
```

**Impact:**
- `TypeError: build_rows_layer_search_modelspace() got unexpected keyword arguments: doc, start_number, handles`
- Code will never execute successfully in layer_search mode

---

### 1.3 **HIGH: Incomplete Counter Management Across Function Calls**
**Location:** [Lines 2201-2226](coordinatesgrabber.py#L2201-L2226)

**Problem:**
The code intends to maintain a continuous point ID counter across:
1. Inside-block rows (start: `cfg.initial_number`)
2. ModelSpace rows (start: `next_num` from previous result)

**Current State:**
- `build_rows_layer_search_per_block()` uses local `counter = cfg.initial_number` internally
- Does NOT return `next_num` (the next available counter value)
- `build_rows_layer_search_modelspace()` does NOT accept `start_number` parameter
- Each function independently manages `counter`, causing **point ID collisions**

**Example Failure Scenario:**
```python
cfg.initial_number = 1
# Inside-block function:
#   Creates P1, P2, P3 (counter goes 1→4)
#   But returns: (rows, bool) — no next_counter

# Next call tries to use undefined 'next_num'
# Or if fallback used: ModelSpace ALSO starts at 1
#   Creates P1, P2... (DUPLICATE NAMES)
```

---

### 1.4 **HIGH: Missing Row Tuple for 4-Corner Placement**

**Location:** [Lines 145-160](coordinatesgrabber.py#L145-L160) - Row dataclass

**Problem:**
```python
@dataclass(frozen=True)
class Row:
    point_name: str
    east: float
    north: float
    elev: float
    segment_name: str
    dist_2d: Optional[float]
    dist_3d: Optional[float]
    bearing: str
    azimuth: str
    source_type: str
    source_handle: str
    source_name: str
    source_index: int
```

**Why It's a Problem:**
- Row stores ONLY a single point: `(east, north, elev)`
- User wants 4 reference blocks placed at bbox corners: `(min_x, min_y)`, `(max_x, min_y)`, `(min_x, max_y)`, `(max_x, max_y)`
- Current design doesn't support multiple placement points per Row
- Cannot represent: which 4 points, which corner is which, or their z-elevations

**Current Data Flow:**
```
Points from layer → _center_from_points() → SINGLE center (east, north, elev) → One Row
                                                    ↓
                                         Loses all corner info!
```

---

### 1.5 **HIGH: `_center_from_points()` Doesn't Expose Corner Coordinates**

**Location:** [Lines 560-572](coordinatesgrabber.py#L560-L572)

**Current Implementation:**
```python
def _center_from_points(points: List[Point3D]) -> Optional[Point3D]:
    """Compute a stable center from a set of points (bbox center)."""
    if not points:
        return None
    if len(points) == 1:
        return points[0]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, (min(zs) + max(zs)) / 2.0)
```

**Problem:**
- Function computes bbox but only returns center point
- Calculates `min(xs)`, `max(xs)`, `min(ys)`, `max(ys)` internally but discards them
- To support 4-corner placement, we need access to those bbox bounds

---

---

## 2. FEATURE GAP ANALYSIS

### 2.1 Why Does Layer Search Only Place 1 Center Point?

**Root Cause:**
The layer_search mode was designed to find geometry on a named layer within block definitions and place ONE reference block at the geometric center. This is a deliberate single-point-per-block design:

```python
# LINES 1080-1145 (build_rows_layer_search_per_block)
for idx, bref in enumerate(blockrefs, start=1):
    local_hits = _points_on_layer_in_blockdef(doc, bname, target_l)
    
    if not local_hits:
        continue
    
    # Transform hits into world coords
    world_hits = [_apply_bref_local_transform(bref, p) for p in local_hits]
    
    # Compute SINGLE center
    center = _center_from_points(world_hits)
    
    # Create ONE Row with that center
    rows.append(Row(point_name=..., east=center[0], north=center[1], elev=center[2], ...))
```

**User's Desired Behavior:**
Instead of 1 center point, place 4 reference blocks at the corners of the bounding box of `world_hits`.

---

### 2.2 What Code Changes Are Needed for 4-Corner Placement?

#### **A. Helper Function: Extract Fourth Corners**
Need new function to compute 4 corner coordinates from points:

```python
def _corners_from_points(points: List[Point3D]) -> Optional[List[Point3D]]:
    """
    Compute 4 corner points of the 2D bounding box (project to Z=median or min_z).
    Returns [(min_x, min_y, z), (max_x, min_y, z), (min_x, max_y, z), (max_x, max_y, z)]
    or None if insufficient points.
    """
```

#### **B. Modify Row Dataclass**
Option 1A (Store multiple points): Add optional corners field
```python
@dataclass(frozen=True)
class Row:
    point_name: str  # Name of first/center point
    east: float
    north: float
    elev: float
    # ... other fields ...
    corner_points: Optional[List[Tuple[float, float, float]]] = None  # For 4-corner mode
```

Option 1B (Create 4 Row objects): Duplicate row for each corner
- Simpler, no schema change
- More rows in spreadsheet
- More reference blocks inserted

#### **C. Modify Reference Block Placement**
Update `_place_refpoints_for_rows()` to detect corner placement mode and iterate over corners:

```python
def _place_refpoints_for_rows(self, cfg: Config, rows: List[Row]) -> None:
    # ...
    for r in rows:
        if cfg.layer_search_place_at_corners and r.corner_points:
            # Place 4 blocks (one per corner)
            for pt in r.corner_points:
                insert_reference_block(..., x=pt[0], y=pt[1], z=pt[2], ...)
        else:
            # Place 1 block (original behavior)
            insert_reference_block(..., x=r.east, y=r.north, z=r.elev, ...)
```

#### **D. UI Changes**
Add checkbox in "Layer Search" section:
- `☑ Place reference blocks at 4 corners of geometry (instead of center)`

---

### 2.3 Are UI Changes Needed?

**YES, Required Changes:**

| UI Element | Current | Needed |
|-----------|---------|--------|
| **Mode Selection** | ✓ Exists (polylines, blocks, layer_search) | No change |
| **Layer Selection** | ✓ Exists (combobox of layers) | No change |
| **Reference Block Options** | ✓ Exists (DWG path, scale, rotation) | No change |
| **Corner Placement Option** | ❌ Missing | **Add checkbox: "Place at 4 corners"** |
| **Point Numbering Mode** | ❌ Missing | Optional: "Append point suffix" (P1-tl, P1-tr, P1-bl, P1-br) vs (P1, P2, P3, P4) |

**New UI Section** (in `CoordinatesGrabberWindow.__init__()`):
```python
# In layer_search config
self.chk_corner_placement = QCheckBox("Place reference blocks at 4 corners of found geometry")
self.chk_corner_placement.setChecked(False)
```

---

---

## 3. DATA FLOW TRACING

### Current Flow (Polylines Mode)
```
User selects polylines
    ↓
on_select() → ss.SelectOnScreen()
    ↓
_run_export_for_entities(entities)
    ↓
build_rows_polylines(cfg, polylines)
    ├─ For each polyline: extract vertices
    ├─ For each vertex: create Row(point_name, east, north, elev, ...)
    └─ Return: List[Row], bool (has_3d)
    ↓
_place_refpoints_for_rows(cfg, rows)
    ├─ For each Row:
    │   └─ insert_reference_block(doc, ..., x=row.east, y=row.north, z=row.elev, ...)
    └─ doc.Regen()
    ↓
export_excel(cfg, rows, has_3d, ...)
    ├─ Create workbook
    ├─ For each Row: populate columns (Point ID, E, N, Z, Segment, Dist, ...)
    └─ Save to .xlsx
    ↓
Open file in Excel
```

### Current Flow (Layer_Search Mode)
```
User selects blocks + picks layer + clicks "Run Layer Search"
    ↓
on_layer_search()
    ├─ Collect block references from ModelSpace (or selection)
    ├─ Determine ModelSpace layer entities (optional)
    ├─ Call build_rows_layer_search_per_block() ← CRASH HERE (signature mismatch)
    │   └─ [Never executes due to TypeError]
    ├─ Call build_rows_layer_search_modelspace() ← CRASH HERE (wrong params)
    │   └─ [Never executes]
    ├─ Combine rows
    ├─ _place_refpoints_for_rows(cfg, rows)
    └─ export_excel(cfg, rows, ...)
```

### Proposed Flow (Layer_Search Mode + 4-Corner)
```
User selects blocks + picks layer + checks "Place at 4 corners" + clicks "Run Layer Search"
    ↓
on_layer_search()
    ├─ Collect block references
    ├─ (Fixed) build_rows_layer_search_per_block() → returns (row_list, has_3d)
    │   ├─ For each block reference:
    │   │   ├─ Find entities on target layer inside block def
    │   │   ├─ Transform to world coords
    │   │   ├─ Compute bbox corners (NEW)
    │   │   └─ Create Row with corner_points=(4 points)
    │   └─ Return rows
    │
    ├─ (Fixed) build_rows_layer_search_modelspace() → returns (row_list, has_3d)
    │   └─ (similar)
    │
    ├─ Combine rows
    ├─ _place_refpoints_for_rows(cfg, rows)  ← Enhanced
    │   ├─ For each Row:
    │   │   ├─ If corner_placement mode:
    │   │   │   └─ For each of 4 corners: insert_reference_block()
    │   │   └─ Else:
    │   │       └─ insert_reference_block() at center
    │   └─ doc.Regen()
    │
    └─ export_excel(cfg, rows, has_3d)
        ├─ If corner_placement mode:
        │   ├─ Create 4 rows per block (P1-0, P1-1, P1-2, P1-3)
        │   └─ Or: Create 1 row with all 4 coords in extra columns
        └─ Save to .xlsx
```

---

---

## 4. USER WORKFLOW ASSESSMENT

### Current Workflow (Layer_Search Mode) - BROKEN
```
1. Open AutoCAD drawing with:
   - Block references with internal geometry on named layer (e.g., "SearchBox")
   
2. Run tool:
   - Select blocks (or "use all blocks")
   - Select layer name ("SearchBox")
   - Check "Include ModelSpace" if needed
   - Click "Run Layer Search"
   
3. Expected: Tool finds geometry on SearchBox layer inside blocks, places 
            reference blocks at centers, exports Excel
            
4. Actual: TypeError at line 2201 → Tool crashes
```

### Desired Workflow (Layer_Search Mode + 4 Corners) - PROPOSED
```
1. Open AutoCAD, same block setup

2. Run tool (enhanced UI):
   - Select blocks
   - Select layer name ("SearchBox")
   - [NEW] Check "Place reference blocks at 4 corners of found geometry"
   - Check "Include ModelSpace" if needed
   - Click "Run Layer Search"
   
3. Expected Behavior:
   a) For each selected block:
      - Find all entities on "SearchBox" layer inside that block's definition
      - Compute 2D bounding box of those entities
      - Extract 4 corner points: {min_x,min_y}, {max_x,min_y}, {min_x,max_y}, {max_x,max_y}
      - Use median (or min) z-elevation from geometry
      - Place 4 reference blocks (one at each corner in world coords)
      
   b) Export Excel with:
      Option A: 4 rows per block (P1, P2, P3, P4 for each original block)
      Option B: 1 row per block with 4 coordinate pairs shown
      
   c) Result in drawing: 4 reference blocks forming a rectangle at corners
   
4. User can now:
   - Use the 4-corner pattern for layout/inspection
   - Verify geometry bounds via auto-placed blocks
   - Measure diagonals and confirm expected size
```

### Logic Changes Required

| Current Step | Current Logic | Proposed Logic |
|-------------|---------------|-----------------|
| Find geometry in block | Get all entities on layer | Same |
| Transform to world | Apply block ref transform | Same |
| Compute point | `center = _center_from_points()` | `corners = _corners_from_points()` |
| Create Row | `Row(east=center[0], north=center[1], ...)` | `Row(..., corner_points=corners)` |
| Place blocks | `for r in rows: insert_at(r.east, r.north, r.elev)` | `for r in rows: if corners: for c in corners: insert_at(c[0], c[1], c[2])` |
| Export Excel | 1 row per block | 4 rows per block OR 1 row with 4 coords |

---

---

## 5. SOLUTION RECOMMENDATION

### Approach 1: Minimal Quick-Fix (Unblock layer_search, no 4-corner feature yet)
**Goal:** Fix the crashes so layer_search mode works, defer 4-corner feature for later

**Changes:**
1. Change line 2201: Remove `start_number=...` parameter (inline initial_number usage)
2. Modify `build_rows_layer_search_per_block()` to return `(rows, any_3d, next_counter)`
3. Modify `build_rows_layer_search_modelspace()` signature to accept `doc`, `start_number`, `handles`
4. Change lines 2200, 2218 to unpack 3 values
5. No UI changes, no Row changes

**Effort:** 2-3 hours  
**Risk:** Low (isolated function fixes, preserves existing behavior)  
**Integration Impact:** None (backward compatible)  
**Breaking Changes:** None  
**Pros:**
- Quick, unblocks testing
- No architectural changes
- Easy to validate (just test layer_search launches)

**Cons:**
- Doesn't implement 4-corner feature requested by user
- Must refactor again soon

---

### Approach 2: Full Implementation with 4-Corner Support (Recommended)
**Goal:** Fix crashes AND implement 4-corner reference block placement

**Phase 1 (Hour 0-1): Fix Function Signatures**
1. [Line 1022] Add `start_number=cfg.initial_number` parameter to `build_rows_layer_search_per_block()`
2. [Line 1035] Use parameter: `counter = start_number`
3. [Line 1145] Return 3 values: `return rows, any_3d, counter`
4. [Line 841] Add parameters to `build_rows_layer_search_modelspace()`: `doc, start_number, handles`
5. [Line 853] Use passed parameters (ignore `handles`, use `doc` if needed)
6. [Line 912] Return 3 values: `return rows, any_3d, counter`
7. [Lines 2201, 2218] Update unpacking to receive 3 values

**Phase 2 (Hour 1-2): Add Corner Extraction Logic**
1. [Line 572 after] Create new function `_corners_from_points()`:
   - Input: `List[Point3D]` (the found geometry points)
   - Output: `Tuple[Point3D, Point3D, Point3D, Point3D]` (4 corners in consistent order)
   - Logic: Extract bbox min/max, compute 4 corners, use median Z
   
2. [Lines 1090-1140] Modify `build_rows_layer_search_per_block()`:
   - If `cfg.layer_search_place_at_corners`: call `_corners_from_points(world_hits)`
   - Store in new Row field: `corner_points=(4 points)` OR `corner_points=None` (for center mode)

3. [Line 850 similar] Modify `build_rows_layer_search_modelspace()`:
   - Similar logic if corners mode enabled

**Phase 3 (Hour 2-3): Update Data Model & Placement**
1. [Line 145] Extend Row dataclass:
   ```python
   corner_points: Optional[Tuple[Point3D, Point3D, Point3D, Point3D]] = None
   ```
   OR
   ```python
   corner_points: Optional[List[Point3D]] = None  # List of 4 or fewer points
   ```

2. [Line 1942] Enhance `_place_refpoints_for_rows()`:
   - Check if `cfg.layer_search_place_at_corners`
   - If True and `r.corner_points` exists: loop over 4 corners, insert 4 blocks
   - Otherwise: use `(r.east, r.north, r.elev)` (existing behavior)

**Phase 4 (Hour 3-4): UI & Config**
1. [Line 130] Add to Config dataclass:
   ```python
   layer_search_place_at_corners: bool = False
   ```

2. [Line 1940] Add UI widget in CoordinatesGrabberWindow:
   ```python
   # In layer_card creation
   self.chk_corner_placement = QCheckBox("Place reference blocks at 4 corners of geometry")
   self.chk_corner_placement.setChecked(False)
   layer_layout.addWidget(self.chk_corner_placement)
   ```

3. [Line 1943 in _cfg_from_ui] Include in Config:
   ```python
   layer_search_place_at_corners=bool(self.chk_corner_placement.isChecked()),
   ```

4. [Line 2010 in _sync_mode_widgets] Update visibility:
   ```python
   self.chk_corner_placement.setVisible(mode == "layer_search")
   ```

**Phase 5 (Hour 4-5): Excel Export Handling**
Option A (Simpler): Export 4 rows per block when corners mode enabled
- Modify `export_excel()` to duplicate row-writing per corner
- Change point names: `P1` → `P1-TL`, `P1-TR`, `P1-BL`, `P1-BR` (or P1a, P1b, P1c, P1d)

Option B (More Complex): Keep 1 row, add new Excel columns for corners
- Modify worksheet schema
- Requires changes to column creation logic

**Recommendation:** Option A (simpler, backward compatible with existing Excel readers)

**Effort:** 5-6 hours  
**Risk:** Medium (touches data model, placement logic, UI)  
**Integration Impact:** Backward compatible if old configs have `layer_search_place_at_corners=False`  
**Breaking Changes:** None (new field defaults to False)  
**Pros:**
- Complete feature implementation
- User gets requested 4-corner placement
- Unblocks layer_search mode entirely
- Clean separation: center mode vs corner mode

**Cons:**
- More implementation time
- Must test both modes thoroughly
- UI/Config complexity

---

### Approach 3: Refactor to Support Multiple Placement Points (Architecture Change)
**Goal:** Generic multi-point support (extensible beyond 4 corners)

**Changes:**
- New dataclass `PlacementPoint(name, east, north, elev, role)` with role="corner_TL", "corner_TR", etc.
- Row contains `List[PlacementPoint]` instead of single (east, north, elev)
- Refactor all placement/export logic to iterate over placement points
- UI supports arbitrary point selection strategies (center, corners, custom)

**Effort:** 8-10 hours  
**Risk:** High (major refactoring, affects all modes)  
**Integration Impact:** Breaking changes (must update all row builders)  
**Breaking Changes:** YES (all `build_rows_*` functions change signature)  
**Pros:**
- Extensible for future features (custom point layouts, etc.)
- Clean, logical architecture
- Single code path for all placement scenarios

**Cons:**
- High refactoring effort
- Complex testing (all 3 modes must work)
- Over-engineered for current need
- Difficult to review/test

---

## RECOMMENDATION PRIORITY

**Immediate (Must Fix):**
1. ✅ Approach 1 (Minimal fix) — **Do this in next 2-3 hours**
   - Unblocks layer_search mode so it doesn't crash
   - Allows testing of existing layer_search logic
   - Low risk

**Short-term (1-2 weeks):**
2. ✅ Approach 2 (Full implementation) — **Do this after Phase 1 works**
   - Implements requested 4-corner feature
   - Same code base, iterative improvement
   - Realistic effort for developer

**Future (Not Recommended Now):**
3. ❌ Approach 3 (Refactor) — **Only if more features requested**
   - Too much effort for current scope
   - Can be done incrementally later
   - Would apply Approach 2 first, then refactor in Phase 2

---

---

## 6. IMPLEMENTATION PATH

### Phase A: Approach 1 (Quick Fix) - **Do First**
**Estimated Time:** 2.5 hours

#### Step 1: Fix `build_rows_layer_search_per_block()` signature and return (45 min)
- [Line 1022-1030] Add `start_number=cfg.initial_number` param
- [Line 1035] Change: `counter = start_number` (was `cfg.initial_number`)
- [Line 1145] Change return: `return rows, any_3d, counter`
- [Line 2201-2209] Update call to pass `start_number=cfg.initial_number`
- [Line 2200] Update unpacking: `rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(...)`

#### Step 2: Fix `build_rows_layer_search_modelspace()` signature and return (45 min)
- [Line 841-850] Add params: `doc: Any,`, `start_number=cfg.initial_number,`, `handles: Optional[List[str]] = None,`
- Update return type: `-> Tuple[List[Row], bool, int]:`
- [Line 912] Change return: `return rows, any_3d, counter`
- [Line 2218-2226] Update call and unpacking

#### Step 3: Wire counter passing between functions (15 min)
- [Line 2210] Use returned `next_num` as start for ModelSpace function
- Verify: `start_number=next_num` in line 2220

#### Step 4: Test (30 min)
- Select blocks in AutoCAD
- Pick a layer with geometry
- Click "Run Layer Search"
- Verify: No crash, points appear, Excel exports with correct numbering

---

### Phase B: Approach 2 (Full 4-Corner) - **Do After Phase A**
**Estimated Time:** 5-6 hours

#### Step 5: Create corner extraction function (1 hour)
- [After Line 572] Add `_corners_from_points(points: List[Point3D]) -> Tuple[Point3D, Point3D, Point3D, Point3D]`
- Logic:
  ```python
  def _corners_from_points(points: List[Point3D]) -> Tuple[Point3D, Point3D, Point3D, Point3D]:
      """Return (TL, TR, BL, BR) corners of 2D bbox."""
      if len(points) < 1:
          return None
      xs = [p[0] for p in points]
      ys = [p[1] for p in points]
      zs = [p[2] for p in points]
      min_x, max_x = min(xs), max(xs)
      min_y, max_y = min(ys), max(ys)
      med_z = sorted(zs)[len(zs)//2]  # Median Z
      return (
          (min_x, max_y, med_z),  # TL (top-left if Y increases upward)
          (max_x, max_y, med_z),  # TR
          (min_x, min_y, med_z),  # BL
          (max_x, min_y, med_z),  # BR
      )
  ```

#### Step 6: Extend Row dataclass (30 min)
- [Line 160] Add: `corner_points: Optional[Tuple[Point3D, Point3D, Point3D, Point3D]] = None`

#### Step 7: Extend Config dataclass (15 min)
- [Line 130] Add: `layer_search_place_at_corners: bool = False`

#### Step 8: Modify build_rows_layer_search_per_block() (1 hour)
- [Lines 1115-1140] 
  ```python
  world_hits = [_apply_bref_local_transform(bref, p) for p in local_hits]
  
  if cfg.layer_search_place_at_corners:
      corners = _corners_from_points(world_hits)
      # Create 4 Row objects, or 1 with corner_points set
      # Use 4 consecutive point IDs
  else:
      center = _center_from_points(world_hits)
      # Create 1 Row (existing logic)
  ```

#### Step 9: Modify build_rows_layer_search_modelspace() (45 min)
- Similar logic as Step 8

#### Step 10: Update _place_refpoints_for_rows() (45 min)
- [Line 1953-1965]
  ```python
  for r in rows:
      if cfg.layer_search_place_at_corners and hasattr(r, 'corner_points') and r.corner_points:
          for corner_pt in r.corner_points:
              insert_reference_block(..., x=corner_pt[0], y=corner_pt[1], z=corner_pt[2], ...)
      else:
          insert_reference_block(..., x=r.east, y=r.north, z=r.elev, ...)
  ```

#### Step 11: Update UI (1 hour)
- [Layer card section] Add checkbox for corner placement
- [_sync_mode_widgets()] Make checkbox visible only for layer_search mode
- [_cfg_from_ui()] Read checkbox state into Config

#### Step 12: Update Excel export (45 min)
- Option A: Duplicate rows with point names P1-TL, P1-TR, P1-BL, P1-BR
- Or Option B: Add 3 extra columns for additional corner coordinates

#### Step 13: Test (1.5 hours)
- Layer search with corners OFF → should match Phase A behavior
- Layer search with corners ON → should place 4 blocks per geometry
- Verify Excel output has correct naming and coordinates
- Test with ModelSpace geometry included
- Test with block selection filter

---

## 7. TESTING CHECKLIST

### Unit Tests (if applicable)
- [ ] `_corners_from_points()` returns 4 distinct corners for various bbox shapes
- [ ] `_corners_from_points()` handles single-point input gracefully
- [ ] `build_rows_layer_search_per_block()` returns correct counter for next call
- [ ] Counter doesn't collide across inside-block and ModelSpace rows

### Integration Tests (Manual, in AutoCAD)

**Test 1: Basic Layer Search (Center Mode)**
- [ ] Create block with internal rectangle on "TestLayer"
- [ ] Insert 3 block instances in ModelSpace
- [ ] Run tool: select blocks, pick "TestLayer", uncheck "Place at corners"
- [ ] Verify: 3 reference blocks placed at centers, Excel has 3 rows (P1, P2, P3)

**Test 2: Layer Search with Corner Mode**
- [ ] Same setup as Test 1
- [ ] Run tool: select blocks, pick "TestLayer", CHECK "Place at 4 corners"
- [ ] Verify: 12 reference blocks placed (3 blocks × 4 corners)
- [ ] Verify: Excel has 12 rows with proper naming scheme
- [ ] Manually check one corner block location against geometry bounds

**Test 3: ModelSpace Geometry**
- [ ] Draw rectangle directly in ModelSpace on "TestLayer"
- [ ] Run layer search: uncheck "selection only", check "include ModelSpace"
- [ ] Verify: Reference blocks placed at rectangle corners (if corners mode)

**Test 4: Counter Continuity**
- [ ] Inside-block results: points P1-P5
- [ ] ModelSpace results (same run): points P6-P8 (not restarting at P1)
- [ ] Excel confirms all IDs are unique and sequential

**Test 5: Block Name Filter**
- [ ] Multiple block types in drawing
- [ ] Set filter to specific block prefix
- [ ] Verify: Only matching blocks scanned, others ignored

**Test 6: Elevation Handling**
- [ ] 3D blocks with Z coordinates in geometry
- [ ] Verify: Reference points placed at correct Z (median of local points)

---

## 8. SPECIFIC CODE LOCATIONS - REFERENCE

| Task | File | Lines | Current Issue | Fix Required |
|------|------|-------|---------------|--------------|
| Fix function return values | coordinatesgrabber.py | 2201-2226 | Unpacking 3 from 2 values | Update functions to return 3 |
| Fix parameter passing | coords... | 2201-2226 | Passing unknown params | Update function signatures |
| Extract corners | coords... | ~572 | Missing function | Create `_corners_from_points()` |
| Store corners in Row | coords... | 145-160 | Single point only | Add `corner_points` field |
| Place corners | coords... | 1942-1965 | Only places 1 block | Add loop for 4 corners |
| UI checkbox | coords... | ~1750 | No corner option | Add `chk_corner_placement` |
| Config support | coords... | ~130 | No config field | Add `layer_search_place_at_corners` |

---

## SUMMARY

The AutoCAD Coordinates Grabber tool has **critical runtime errors** in layer_search mode preventing any execution. Additionally, the user's request for 4-corner reference block placement requires architectural changes to the data model and placement logic.

**Recommended approach:** Implement **Approach 1 (Quick Fix)** immediately to unblock layer_search mode, then **Approach 2 (Full 4-Corner)** to implement the requested feature. Both can be done iteratively with low risk of regression.

Estimated total development time: **8-9 hours** (2.5 hrs quick fix + 5.5-6 hrs full feature)
