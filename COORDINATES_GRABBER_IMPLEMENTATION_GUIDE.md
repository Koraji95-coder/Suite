# AutoCAD Coordinates Grabber - Implementation Reference Guide

**For Developers Implementing the Fixes**

---

## QUICK REFERENCE: Line Numbers & Changes

### CRITICAL BUGS TO FIX (Do First)

| Line(s) | Function | Issue | Fix |
|---------|----------|-------|-----|
| 2201-2209 | `on_layer_search()` | Unpacking 3 values from function returning 2 | Update return statement |
| 1022-1030 | `build_rows_layer_search_per_block()` | Missing `start_number` param; returns 2 not 3 | Add param, return 3 values |
| 1145 | `build_rows_layer_search_per_block()` return | Returns only `(rows, any_3d)` | Return `(rows, any_3d, counter)` |
| 841-850 | `build_rows_layer_search_modelspace()` | Wrong params; returns 2 not 3 | Add params, return 3 values |
| 912 | `build_rows_layer_search_modelspace()` return | Returns only `(rows, any_3d)` | Return `(rows, any_3d, counter)` |

---

## PHASE 1 FIXES - COPY/PASTE READY CODE

### FIX 1: Update `build_rows_layer_search_per_block()` signature

**BEFORE (Line 1022-1030):**
```python
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool]:
```

**AFTER:**
```python
def build_rows_layer_search_per_block(
    cfg: Config,
    doc: Any,
    blockrefs: Sequence[Any],
    target_layer: str,
    start_number: int = None,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool, int]:
```

**AND change Line 1035:**
```python
# BEFORE:
counter = cfg.initial_number

# AFTER:
counter = start_number if start_number is not None else cfg.initial_number
```

**AND change Line 1145 return statement:**
```python
# BEFORE:
    if log_cb:
        log_cb(f"[LayerSearch/Blocks] Done. Block instances scanned={total}, points created={len(rows)}")
    return rows, any_3d

# AFTER:
    if log_cb:
        log_cb(f"[LayerSearch/Blocks] Done. Block instances scanned={total}, points created={len(rows)}")
    return rows, any_3d, counter
```

---

### FIX 2: Update `build_rows_layer_search_per_block()` call in `on_layer_search()`

**BEFORE (Line 2201-2209):**
```python
            rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(
                cfg=cfg,
                doc=self.doc,
                blockrefs=blockrefs,
                target_layer=layer_name,
                start_number=cfg.initial_number,
                progress_cb=prog_blocks,
                log_cb=log_cb,
            )
```

**AFTER** (No change needed! It already has correct parameters)
```python
            rows_in, has_3d_in, next_num = build_rows_layer_search_per_block(
                cfg=cfg,
                doc=self.doc,
                blockrefs=blockrefs,
                target_layer=layer_name,
                start_number=cfg.initial_number,
                progress_cb=prog_blocks,
                log_cb=log_cb,
            )
```
**Note:** Just update to receive 3 values from the fixed function.

---

### FIX 3: Update `build_rows_layer_search_modelspace()` signature

**BEFORE (Line 841-850):**
```python
def build_rows_layer_search_modelspace(
    cfg: Config,
    ents: Sequence[Any],
    target_layer: str,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool]:
```

**AFTER:**
```python
def build_rows_layer_search_modelspace(
    cfg: Config,
    doc: Any,
    ents: Sequence[Any],
    target_layer: str,
    start_number: int = None,
    handles: Optional[List[str]] = None,
    progress_cb=None,
    log_cb=None,
) -> Tuple[List[Row], bool, int]:
```

**AND change Line 853 (was: counter = cfg.initial_number):**
```python
    rows: List[Row] = []
    counter = start_number if start_number is not None else cfg.initial_number
    any_3d = False
```

**AND change Line 912 return statement:**
```python
# BEFORE:
    if log_cb:
        log_cb(f"[LayerSearch/ModelSpace] Done. Points created={len(rows)}")
    return rows, any_3d

# AFTER:
    if log_cb:
        log_cb(f"[LayerSearch/ModelSpace] Done. Points created={len(rows)}")
    return rows, any_3d, counter
```

---

### FIX 4: Update `build_rows_layer_search_modelspace()` call in `on_layer_search()`

**BEFORE (Line 2218-2226):**
```python
                rows_out, has_3d_out, next_num = build_rows_layer_search_modelspace(
                    cfg=cfg,
                    doc=self.doc,
                    target_layer=layer_name,
                    start_number=next_num,
                    handles=sel_handles,
                    ents=ms_ents,
                    progress_cb=prog_ms,
                    log_cb=log_cb,
                )
```

**AFTER** (No code change, just fix the function signature to accept these params)
```python
                rows_out, has_3d_out, next_num = build_rows_layer_search_modelspace(
                    cfg=cfg,
                    doc=self.doc,
                    target_layer=layer_name,
                    start_number=next_num,
                    handles=sel_handles,
                    ents=ms_ents,
                    progress_cb=prog_ms,
                    log_cb=log_cb,
                )
```

---

## PHASE 2 ENHANCEMENTS - 4-CORNER FEATURE

### ENHANCEMENT 1: Add Corner Extraction Function

**Insert after Line 572 (after `_center_from_points()`):**
```python
def _corners_from_points(points: List[Point3D]) -> Optional[Tuple[Point3D, Point3D, Point3D, Point3D]]:
    """
    Compute 4 corner points of the 2D bounding box from a set of points.
    
    Returns: ((min_x, min_y, z), (max_x, min_y, z), (min_x, max_y, z), (max_x, max_y, z))
    or None if fewer than 1 point.
    
    The Z coordinate is the median of all input points' Z values.
    Corner order: BL (bottom-left), BR (bottom-right), TL (top-left), TR (top-right)
    """
    if not points or len(points) < 1:
        return None
    
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    
    # Use median Z for stability (avoids extreme outliers)
    sorted_zs = sorted(zs)
    med_z = sorted_zs[len(sorted_zs) // 2]
    
    return (
        (min_x, min_y, med_z),  # BL (bottom-left)
        (max_x, min_y, med_z),  # BR (bottom-right)
        (min_x, max_y, med_z),  # TL (top-left)
        (max_x, max_y, med_z),  # TR (top-right)
    )
```

---

### ENHANCEMENT 2: Extend Row dataclass with corners

**Line 160, after `source_index: int`:**
```python
    # For 4-corner placement mode in layer_search:
    # If present, override single (east, north, elev) placement
    corner_points: Optional[Tuple[Point3D, Point3D, Point3D, Point3D]] = None
```

**Full updated Row class:**
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
    corner_points: Optional[Tuple[Point3D, Point3D, Point3D, Point3D]] = None
```

---

### ENHANCEMENT 3: Add config option

**Line 130-141, add to Config dataclass:**
```python
    layer_search_place_at_corners: bool = False  # Toggle 4-corner vs center placement
```

**Full Context:**
```python
@dataclass(frozen=True)
class Config:
    mode: str  # "polylines" | "blocks" | "layer_search"
    precision: int
    prefix: str
    initial_number: int
    table_options: TableOptions
    export: ExportOptions
    refblock: RefBlockOptions
    block_name_filter: str
    layer_search_name: str
    layer_search_use_selection: bool
    layer_search_include_modelspace: bool
    layer_search_place_at_corners: bool  # NEW: Toggle for 4-corner placement
    add_to_selection: bool
```

---

### ENHANCEMENT 4: Modify corner logic in `build_rows_layer_search_per_block()`

**Replace Lines 1115-1145 (the part that creates the Row after computing world_hits):**

**BEFORE:**
```python
        # Transform all local hits into world using this blockref's transform
        world_hits = [_apply_bref_local_transform(bref, p) for p in local_hits]
        center = _center_from_points(world_hits)
        if not center:
            if progress_cb:
                progress_cb(idx, total, len(local_hits), bname)
            continue

        any_3d = any_3d or abs(center[2]) > 1e-12

        src_handle = str(getattr(bref, "Handle", ""))
        point_name = f"{cfg.prefix}{counter}"
        counter += 1

        rows.append(
            Row(
                point_name=point_name,
                east=center[0],
                north=center[1],
                elev=center[2],
                segment_name="",
                dist_2d=None,
                dist_3d=None,
                bearing="",
                azimuth="",
                source_type=f"LayerSearchCenter/Blocks(layer={target_layer})",
                source_handle=src_handle,
                source_name=bname,
                source_index=idx - 1,
            )
        )

        if log_cb and len(rows) <= 10:
            log_cb(
                f"[LayerSearch/Blocks] + {point_name} from '{bname}' (handle={src_handle}) @ "
                f"({center[0]:.3f}, {center[1]:.3f}, {center[2]:.3f}) using {len(local_hits)} layer hits"
            )

        if progress_cb:
            progress_cb(idx, total, len(local_hits), bname)
```

**AFTER:**
```python
        # Transform all local hits into world using this blockref's transform
        world_hits = [_apply_bref_local_transform(bref, p) for p in local_hits]
        
        src_handle = str(getattr(bref, "Handle", ""))
        
        if cfg.layer_search_place_at_corners:
            # 4-corner mode: place blocks at bbox corners
            corners = _corners_from_points(world_hits)
            if not corners:
                if progress_cb:
                    progress_cb(idx, total, len(local_hits), bname)
                continue
            
            # Check if any corner has non-zero Z
            any_3d_local = any(abs(c[2]) > 1e-12 for c in corners)
            any_3d = any_3d or any_3d_local
            
            # Create ONE Row with corner_points set
            point_name = f"{cfg.prefix}{counter}"
            counter += 1
            
            rows.append(
                Row(
                    point_name=point_name,
                    east=corners[0][0],  # BL x
                    north=corners[0][1],  # BL y
                    elev=corners[0][2],  # BL z (median)
                    segment_name="",
                    dist_2d=None,
                    dist_3d=None,
                    bearing="",
                    azimuth="",
                    source_type=f"LayerSearchCorners/Blocks(layer={target_layer})",
                    source_handle=src_handle,
                    source_name=bname,
                    source_index=idx - 1,
                    corner_points=corners,  # NEW: Store all 4 corners
                )
            )
            
            if log_cb and len(rows) <= 10:
                log_cb(
                    f"[LayerSearch/Blocks] + {point_name} from '{bname}' (handle={src_handle}) @ "
                    f"corners BL:({corners[0][0]:.3f}, {corners[0][1]:.3f}, {corners[0][2]:.3f}) "
                    f"TR:({corners[3][0]:.3f}, {corners[3][1]:.3f}, {corners[3][2]:.3f}) using {len(local_hits)} layer hits"
                )
        
        else:
            # Original center-only mode
            center = _center_from_points(world_hits)
            if not center:
                if progress_cb:
                    progress_cb(idx, total, len(local_hits), bname)
                continue

            any_3d = any_3d or abs(center[2]) > 1e-12

            point_name = f"{cfg.prefix}{counter}"
            counter += 1

            rows.append(
                Row(
                    point_name=point_name,
                    east=center[0],
                    north=center[1],
                    elev=center[2],
                    segment_name="",
                    dist_2d=None,
                    dist_3d=None,
                    bearing="",
                    azimuth="",
                    source_type=f"LayerSearchCenter/Blocks(layer={target_layer})",
                    source_handle=src_handle,
                    source_name=bname,
                    source_index=idx - 1,
                    corner_points=None,  # Not using corners
                )
            )

            if log_cb and len(rows) <= 10:
                log_cb(
                    f"[LayerSearch/Blocks] + {point_name} from '{bname}' (handle={src_handle}) @ "
                    f"({center[0]:.3f}, {center[1]:.3f}, {center[2]:.3f}) using {len(local_hits)} layer hits"
                )

        if progress_cb:
            progress_cb(idx, total, len(local_hits), bname)
```

---

### ENHANCEMENT 5: Update placement function

**Replace `_place_refpoints_for_rows()` method (Line 1942-1965):**

**BEFORE:**
```python
    def _place_refpoints_for_rows(self, cfg: Config, rows: List[Row]) -> None:
        ref_path = os.path.abspath(cfg.refblock.ref_dwg_path or "")
        if not ref_path or not os.path.exists(ref_path):
            self._append_log(
                f"[PlaceRefPoints] WARNING: Reference DWG not found at '{ref_path}'. "
                "Skipping block placement (export will still proceed)."
            )
            return

        placed = 0
        for r in rows:
            try:
                insert_reference_block(
                    doc=self.doc,
                    ms=self.ms,
                    ref_dwg_path=ref_path,
                    layer_name=cfg.refblock.layer_name,
                    x=r.east,
                    y=r.north,
                    z=r.elev,
                    scale=cfg.refblock.scale,
                    rotation_deg=cfg.refblock.rotation_deg,
                )
                placed += 1
            except BaseException as exc:
                # Keep going; log the failure and continue.
                self._append_log(f"[PlaceRefPoints] Failed at {r.point_name}: {format_com_error(exc)}")

        try:
            self.doc.Regen(1)
        except Exception:
            pass

        self._append_log(f"[PlaceRefPoints] Placed reference points: {placed}/{len(rows)}")
```

**AFTER:**
```python
    def _place_refpoints_for_rows(self, cfg: Config, rows: List[Row]) -> None:
        ref_path = os.path.abspath(cfg.refblock.ref_dwg_path or "")
        if not ref_path or not os.path.exists(ref_path):
            self._append_log(
                f"[PlaceRefPoints] WARNING: Reference DWG not found at '{ref_path}'. "
                "Skipping block placement (export will still proceed)."
            )
            return

        placed = 0
        corner_names = ["BL", "BR", "TL", "TR"]  # Bottom-Left, Bottom-Right, Top-Left, Top-Right
        
        for r in rows:
            try:
                if cfg.layer_search_place_at_corners and r.corner_points:
                    # Place 4 blocks (one per corner)
                    for i, corner in enumerate(r.corner_points):
                        try:
                            insert_reference_block(
                                doc=self.doc,
                                ms=self.ms,
                                ref_dwg_path=ref_path,
                                layer_name=cfg.refblock.layer_name,
                                x=corner[0],
                                y=corner[1],
                                z=corner[2],
                                scale=cfg.refblock.scale,
                                rotation_deg=cfg.refblock.rotation_deg,
                            )
                            placed += 1
                        except BaseException as exc:
                            self._append_log(
                                f"[PlaceRefPoints] Failed at {r.point_name}-{corner_names[i]} "
                                f"({corner[0]:.3f}, {corner[1]:.3f}, {corner[2]:.3f}): {format_com_error(exc)}"
                            )
                else:
                    # Place single block at center (original behavior)
                    insert_reference_block(
                        doc=self.doc,
                        ms=self.ms,
                        ref_dwg_path=ref_path,
                        layer_name=cfg.refblock.layer_name,
                        x=r.east,
                        y=r.north,
                        z=r.elev,
                        scale=cfg.refblock.scale,
                        rotation_deg=cfg.refblock.rotation_deg,
                    )
                    placed += 1
            except BaseException as exc:
                # Keep going; log the failure and continue.
                self._append_log(f"[PlaceRefPoints] Failed at {r.point_name}: {format_com_error(exc)}")

        try:
            self.doc.Regen(1)
        except Exception:
            pass

        self._append_log(f"[PlaceRefPoints] Placed reference points: {placed}/{len(rows) * (4 if cfg.layer_search_place_at_corners else 1)}")
```

---

### ENHANCEMENT 6: Update UI

**Add checkbox in layer_search card (around line 1760-1800, adjust based on actual card creation):**

Find where `self.layer_card` is created and add:
```python
        # In the layer_card (after existing fields)
        self.chk_corner_placement = QCheckBox("Place reference blocks at 4 corners of found geometry")
        self.chk_corner_placement.setChecked(False)
        self.chk_corner_placement.setToolTip(
            "When enabled, places one reference block at each corner of the bounding box "
            "of found geometry (instead of one at the center)."
        )
        layer_layout.addWidget(self.chk_corner_placement)
```

**Update `_sync_mode_widgets()` (around line 1850) to show/hide checkbox:**
```python
    def _sync_mode_widgets(self) -> None:
        mode = self._current_mode()
        is_poly = mode == "polylines"

        for cb in (self.chk_segment, self.chk_dist, self.chk_dist3, self.chk_bearing, self.chk_az):
            cb.setEnabled(is_poly)

        # block filter visible for blocks + layer_search
        show_filter = mode in ("blocks", "layer_search")
        for i in range(self.block_filter_row.count()):
            w = self.block_filter_row.itemAt(i).widget()
            if w is not None:
                w.setVisible(show_filter)

        # layer search card + corner checkbox only for layer_search mode
        self.layer_card.setVisible(mode == "layer_search")
        self.chk_corner_placement.setVisible(mode == "layer_search")  # NEW
        self.btn_run_layer_search.setEnabled(mode == "layer_search")
```

**Update `_cfg_from_ui()` (around line 1930) to read checkbox:**
```python
    def _cfg_from_ui(self) -> Config:
        mode = self._current_mode()
        precision = int(self.spin_precision.value())
        prefix = (self.txt_prefix.text() or "P").strip()
        start = int(self.spin_start.value())

        opts = TableOptions(
            segment=bool(self.chk_segment.isChecked()),
            elevation=bool(self.chk_elev.isChecked()),
            distance=bool(self.chk_dist.isChecked()),
            distance_3d=bool(self.chk_dist3.isChecked()),
            bearing_quadrant=bool(self.chk_bearing.isChecked()),
            azimuth_from_north=bool(self.chk_az.isChecked()),
        )
        
        # ... existing code ...
        
        return Config(
            mode=mode,
            precision=precision,
            prefix=prefix,
            initial_number=start,
            table_options=opts,
            export=ExportOptions(
                excel_path=xlsx_path,
                replace_previous=bool(self.chk_replace_previous.isChecked()),
                auto_increment=bool(self.chk_autoinc.isChecked()),
            ),
            refblock=RefBlockOptions(
                ref_dwg_path=self.txt_ref_dwg.text(),
                layer_name=self.txt_ref_layer.text(),
                scale=float(self.spin_ref_scale.value()),
                rotation_deg=float(self.spin_ref_rot.value()),
            ),
            block_name_filter=(self.txt_block_filter.text() or "").strip(),
            layer_search_name=(self.cmb_layers.currentText() or "").strip(),
            layer_search_use_selection=bool(self.chk_selection_only.isChecked()),
            layer_search_include_modelspace=bool(self.chk_include_modelspace.isChecked()),
            layer_search_place_at_corners=bool(self.chk_corner_placement.isChecked()),  # NEW
            add_to_selection=bool(self.chk_add_selection.isChecked()),
        )
```

---

## VALIDATION CHECKLIST

### Before Submitting PR

- [ ] All 5 Phase 1 fixes applied (signatures + returns)
- [ ] Phase 1 tested: layer_search mode launches without errors
- [ ] Counter properly increments across inside-block + ModelSpace results
- [ ] Point IDs in Excel are sequential and unique
- [ ] All 6 Phase 2 enhancements applied (for 4-corner feature)
- [ ] Phase 2 tested:
  - [ ] Center mode works (checkbox OFF)
  - [ ] 4-corner mode works (checkbox ON)
  - [ ] 4 blocks placed per geometry in corner mode
  - [ ] Excel shows correct point names/coordinates
  - [ ] ModelSpace geometry included in corner mode
  - [ ] UI checkbox appears only in layer_search mode
  - [ ] Config object includes new field
- [ ] No new warnings/errors in IDE
- [ ] All imports remain in place

---

## DEBUGGING TIPS

### If unpacking error occurs:
```python
# Check return statement of the function you're calling
result = build_rows_layer_search_per_block(...)
print(f"Returned {len(result)} values: {result}")  # Should show 3 values
```

### If counter not incrementing correctly:
```python
# After each function call, log:
self._append_log(f"[LayerSearch] After blocks: next_num={next_num}")
self._append_log(f"[LayerSearch] After modelspace: next_num={next_num}")
```

### If 4 blocks not placed:
```python
# In _place_refpoints_for_rows, add debug:
self._append_log(f"[PlaceRefPoints] Row {r.point_name}: corner_points={r.corner_points}, mode={cfg.layer_search_place_at_corners}")
```

---

## COMMON MISTAKES TO AVOID

1. ❌ Forget to return 3 values from layer_search functions
2. ❌ Don't pass `start_number` parameter when calling
3. ❌ Forget to add `corner_points=None` to existing Row creations in other modes
4. ❌ Forget to make checkbox visible only for layer_search mode
5. ❌ Use wrong corner order (must be consistent: BL, BR, TL, TR)
6. ❌ Forget to update Excel export if using 4 rows per block
7. ❌ Don't check `hasattr()` before accessing `corner_points` on Row

