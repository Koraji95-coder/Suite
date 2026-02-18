# Coordinates Grabber Analysis & Enhancement Proposal

**Date:** February 18, 2026  
**File:** `src/Ground-grid & coordinates grabber/coordinatesgrabber.py` (2,288 lines)  
**Status:** Functional but with bugs & feature gap (4-corner placement)

---

## Executive Summary

The coordinates grabber tool is a mature PySide6/AutoCAD integration for exporting geometry coordinates to Excel + placing reference blocks. It has **3 critical issues**:

1. **CRITICAL BUG:** Layer search mode crashes due to function signature mismatch (expects 3 return values, gets 2)
2. **FEATURE GAP:** Only places blocks at 1 center point; user needs 4-corner placement at geometry bounds
3. **CODE DEBT:** Incomplete parameter passing for row numbering across block + modelspace scans

**User Requirement:** Place reference blocks at **4 corners of bounding box** when searching by layer, with all coordinates exported to Excel.

---

## Issue #1: CRITICAL BUG — Function Return Type Mismatch

### Location
- **Line 2077-2083** (caller): `rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(...)`
- **Line 1069-1078** (function def): `def build_rows_layer_search_per_block(...) -> Tuple[List[Row], bool]:`

### Problem
Function returns 2 values `(List[Row], bool)` but caller expects 3 `(rows, has_3d, next_num)`.

**This will crash when user runs layer_search mode.**

### Root Cause
- Functions intended to support sequential numbering across block instances + modelspace geometry
- Signature was written to return only rows + has_3d flag
- Return type comment shows this was incomplete refactoring

### Code Snippet (Line 1069-1078)
```python
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool]:  # ← Only returns 2 values
    """..."""
    rows: List[Row] = []
    counter = cfg.initial_number  # ← Counter increments locally
    # ... finds rows ...
    return rows, any_3d  # ← Returns 2 values, not 3
```

### Impact
- **Severity:** CRITICAL
- **User Impact:** Layer search mode is completely broken; will crash on execution
- **Breaking:** Yes, if user tries to use layer_search mode

### Fix Required
- Change return type to `Tuple[List[Row], bool, int]` (add next counter)
- Return counter value at end: `return rows, any_3d, counter`
- Update function signature to accept `start_number` parameter
- Update modelspace function similarly
- Update caller to properly handle 3-value unpacking

---

## Issue #2: FEATURE GAP — Only 1 Center Block, User Wants 4 Corners

### Current Behavior
```python
# Line 1069-1144: build_rows_layer_search_per_block()
for bref in blockrefs:
    local_hits = _points_on_layer_in_blockdef(doc, bname, target_l)
    world_hits = [_apply_bref_local_transform(bref, p) for p in local_hits]
    center = _center_from_points(world_hits)  # ← Computes ONE center
    
    rows.append(Row(..., east=center[0], north=center[1], ...))  # ← ONE row per block
```

### Desired Behavior
```
User selects a rectangular boundary on layer "Search"
Layer Search finds that rectangle geometry
User wants reference blocks placed at:
  - Top-Left corner
  - Top-Right corner
  - Bottom-Left corner
  - Bottom-Right corner
All 4 coordinates exported to Excel with same block instance ID
```

### Root Cause
- Original design: "Find geometry on layer → compute single center → place 1 reference block"
- No logic for corner extraction from bounding box
- UI has no toggle for "center vs. 4-corners" mode

### Helper Function Gap (Line 542)
```python
def _center_from_points(points: List[Point3D]) -> Optional[Point3D]:
    """Compute a stable center from a set of points (bbox center)."""
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, (min(zs) + max(zs)) / 2.0)
    # ← Perfectly positioned to extract corners instead
```

### Impact
- **Severity:** HIGH
- **User Impact:** Layer search mode doesn't meet use case (needs 4 corners for ground grid surveying)
- **Breaking:** No, new feature; existing center-only code still works

---

## Issue #3: Code Debt — Incomplete Row Numbering Across Scans

### Location
- **Line 1069:** `counter = cfg.initial_number` (block scan counter)
- **Line 922:** `counter = cfg.initial_number` (modelspace scan counter) — both start at same number!
- **Line 2077–2097:** Caller tries to pass `next_num` between sequential calls, but functions don't support it

### Problem
When scanning blocks first, then modelspace, row names should increment continuously:
- Points 1-10 from blocks
- Points 11-20 from modelspace (NOT starting over at 1)

But current code has both start at `cfg.initial_number`.

### Code Snippet (Line 2077-2083)
```python
rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(
    cfg=cfg,
    doc=self.doc,
    blockrefs=blockrefs,
    target_layer=layer_name,
    start_number=cfg.initial_number,  # ← Parameter doesn't exist
    progress_cb=prog_blocks,
    log_cb=log_cb,
)
```

### Impact
- **Severity:** MEDIUM
- **User Impact:** Point names may duplicate (P1 appears twice)
- **Breaking:** No, but rows have duplicate names

---

## Proposed Implementation Path

### Phase 1: Fix Critical Bugs (Required Before Feature Work)

**1.1 Fix Layer Search Return Values**

**Files to Change:**
- `coordinatesgrabber.py` line 1069-1078, line 1146
- `coordinatesgrabber.py` line 922-950, line 975
- `coordinatesgrabber.py` line 2077-2097

**Changes:**
```python
# Line 1069 (function signature)
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    start_number: int = 1,  # ← ADD
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool, int]:  # ← CHANGE to 3-tuple
    """..."""
    rows: List[Row] = []
    counter = start_number  # ← USE parameter
    # ... existing logic ...
    return rows, any_3d, counter  # ← CHANGE return

# Similar for build_rows_layer_search_modelspace() at line 922
```

**Effort:** ~4 hours (find all call sites, trace data flow)  
**Risk:** Medium (touches core layer search logic)  
**Testing:** Run layer search mode with 10+ blocks, verify no crash and correct numbering

---

### Phase 2: Add 4-Corners Feature (Main User Request)

**2.1 Add Helper Function to Extract Corners**

```python
def _bbox_corners_from_points(points: List[Point3D]) -> List[Point3D]:
    """Extract 4 corners (top-left, top-right, bottom-left, bottom-right) from bounding box."""
    if len(points) < 2:
        return [points[0], points[0], points[0], points[0]] if points else []
    
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    z_avg = sum(zs) / len(zs)  # Avg Z for corners
    
    return [
        (minx, maxy, z_avg),  # Top-left (NW)
        (maxx, maxy, z_avg),  # Top-right (NE)
        (minx, miny, z_avg),  # Bottom-left (SW)
        (maxx, miny, z_avg),  # Bottom-right (SE)
    ]
```

**2.2 Add UI Toggle in CardSection "Layer Search"**

```python
# Around line 1656 (in _build_ui)
self.chk_layer_corners = QCheckBox(
    "Place blocks at 4 corners (instead of center)"
)
self.chk_layer_corners.setChecked(False)
self.layer_card.setContentLayout(layer_layout)
```

**2.3 Update `build_rows_layer_search_per_block()` to Support Corners**

```python
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    start_number: int = 1,
    use_corners: bool = False,  # ← NEW parameter
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool, int]:
    """..."""
    rows: List[Row] = []
    counter = start_number
    any_3d = False
    
    for idx, bref in enumerate(blockrefs, start=1):
        # ... existing geometry search logic ...
        
        if use_corners:
            corners = _bbox_corners_from_points(world_hits)
            corner_names = ['NW', 'NE', 'SW', 'SE']
            for corner, corner_name in zip(corners, corner_names):
                point_name = f"{cfg.prefix}{counter}_{corner_name}"
                counter += 1
                rows.append(Row(..., east=corner[0], north=corner[1], ...))
        else:
            # Original center logic
            center = _center_from_points(world_hits)
            point_name = f"{cfg.prefix}{counter}"
            counter += 1
            rows.append(Row(..., east=center[0], north=center[1], ...))
    
    return rows, any_3d, counter
```

**Effort:** ~8 hours (function, UI, testing)  
**Risk:** Low (additive feature, doesn't break existing center mode)  
**Testing:** 
- Layer search with toggle OFF → single center point (original behavior)
- Layer search with toggle ON → 4 corner points exported + placed
- Verify naming convention (P1_NW, P1_NE, etc.) or allow user config

---

### Phase 3: Polish & Integration (Optional)

**3.1 Allow User to Configure Corner Order/Names**

Add UI controls:
- Radio buttons to order corners: "NW/NE/SW/SE" vs "TL/TR/BL/BR" vs custom
- Checkbox to include corner names in point ID

**3.2 "Extract Corners from Selection" Quick Action**

Add button: "Extract corners from selected geometry" for users who manually draw bounds

**3.3 Ground Grid Integration**

- Move into Suite apps > Ground Grid section
- Connect to project/site management
- Auto-link coordinates to site points in database

---

## Data Model Changes Required

### New Column in Excel Output
If corners are used, add optional column:
```
| Point ID     | Corner | East (X) | North (Y) | ... |
|---|---|---|---|
| P1_NW        | NW     | 1000.123 | 2000.456 | ... |
| P1_NE        | NE     | 1050.234 | 2000.456 | ... |
| P1_SW        | SW     | 1000.123 | 1950.123 | ... |
| P1_SE        | SE     | 1050.234 | 1950.123 | ... |
```

### Config Changes
```python
@dataclass(frozen=True)
class LayerSearchOptions:
    use_corners: bool = False
    corner_order: str = "NWNESWSE"  # Customizable order
    include_corner_name_in_id: bool = True
    corner_abbreviations: Dict[str, str] = field(default_factory=lambda: {
        "NW": "NW", "NE": "NE", "SW": "SW", "SE": "SE"
    })
```

---

## Testing Checklist

### Bug Fixes (Phase 1)
- [ ] Layer search mode launches without crash
- [ ] Point IDs increment correctly across block + modelspace scans
- [ ] No duplicate point names in output

### Feature Addition (Phase 2)
- [ ] Center mode (toggle OFF): places 1 block per layer geometry found
- [ ] Corner mode (toggle ON): places 4 blocks per layer geometry found
- [ ] Naming convention correct (P1_NW, P1_NE, etc.)
- [ ] Excel exports all 4 rows per block instance
- [ ] Corner coordinates are accurate (verified against CAD)
- [ ] Reference block placement correct at all 4 corners

### Integration (Phase 3)
- [ ] Move to Suite app (if approved)
- [ ] Connect to project/site data
- [ ] Test with realistic ground grid survey data

---

## Risk Assessment

### Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Function return type change breaks other code | Low | High | Grep for all call sites; test thoroughly |
| Corner extraction has edge cases (1-point, collinear) | Medium | Medium | Handle edge cases in `_bbox_corners_from_points()` |
| Performance regression with 4x more blocks | Low | Low | Cache corner extraction; profile with 1000s of blocks |

### User Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users confused by toggle (center vs. corners) | Medium | Low | Add help text; default to center (existing behavior) |
| Corner coordinates don't match expectations | Low | Medium | Clear documentation on corner naming (NW = top-left in CAD coords) |

---

## Recommended Phase Order

1. **Phase 1 (DEBUG):** Fix bugs so layer search works at all
2. **Phase 2 (FEATURE):** Add 4-corners mode (main user request)
3. **Phase 3 (POLISH):** UI refinement + Suite integration

**Estimated Timeline:** 3–4 weeks (1 dev, part-time)

---

## Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `coordinatesgrabber.py` | 542 | Add `_bbox_corners_from_points()` |
| `coordinatesgrabber.py` | 922 | Update function signature: add `start_number`, change return type |
| `coordinatesgrabber.py` | 1069 | Update function signature: add `start_number`, `use_corners`, change return type |
| `coordinatesgrabber.py` | 1656 | Add UI checkbox for corners toggle |
| `coordinatesgrabber.py` | 2077 | Fix caller to unpack 3 values, pass `start_number` |

---

## Success Metrics

- [ ] Layer search mode no longer crashes
- [ ] User can export 4 corner coordinates per block with one click
- [ ] Excel file contains all corner points with proper naming
- [ ] Reference blocks placed accurately at all 4 corners
- [ ] Eventually integrated into Suite ground grid app

