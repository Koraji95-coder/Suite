from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple


class AutoCADManager:
    """
    Thread-safe AutoCAD connection manager.
    Uses late-bound COM (dynamic dispatch) to avoid gen_py cache issues.
    """

    def __init__(
        self,
        *,
        time_module: Any,
        threading_module: Any,
        psutil_module: Any,
        pythoncom_module: Any,
        traceback_module: Any,
        os_module: Any,
        re_module: Any,
        autocad_com_available: bool,
        connect_autocad_fn: Any,
        dyn_fn: Any,
        entity_bbox_fn: Any,
        entity_center_fn: Any,
        default_ref_dwg_path_fn: Any,
        insert_reference_block_fn: Any,
        add_point_label_fn: Any,
        export_points_to_excel_fn: Any,
        foundation_source_type: str,
        print_fn: Any = print,
    ) -> None:
        self.time = time_module
        self.threading = threading_module
        self.psutil = psutil_module
        self.pythoncom = pythoncom_module
        self.traceback = traceback_module
        self.os = os_module
        self.re = re_module
        self.autocad_com_available = autocad_com_available
        self.connect_autocad = connect_autocad_fn
        self.dyn = dyn_fn
        self.entity_bbox = entity_bbox_fn
        self.entity_center = entity_center_fn
        self.default_ref_dwg_path = default_ref_dwg_path_fn
        self.insert_reference_block = insert_reference_block_fn
        self.add_point_label = add_point_label_fn
        self.export_points_to_excel = export_points_to_excel_fn
        self.foundation_source_type = foundation_source_type
        self.print_fn = print_fn

        self.start_time = self.time.time()
        self._lock = self.threading.Lock()
        self._cached_status = None
        self._cache_ttl = 2.0
        self.last_check_time = 0

        self.print_fn("[AutoCADManager] Initialized")

    def is_autocad_process_running(self) -> Tuple[bool, Optional[str]]:
        """
        Check if acad.exe process is running on Windows.
        Returns: (is_running, process_exe_path)
        """
        try:
            for proc in self.psutil.process_iter(["name", "exe"]):
                try:
                    proc_name = proc.info.get("name", "").lower()
                    if proc_name == "acad.exe":
                        return (True, proc.info.get("exe"))
                except (self.psutil.NoSuchProcess, self.psutil.AccessDenied):
                    continue
        except Exception as exc:
            self.print_fn(f"[AutoCADManager] Error checking process: {exc}")

        return (False, None)

    def _fresh_com_connection(self) -> Tuple[Any, Any, bool, Optional[str], Optional[str]]:
        """
        Get a fresh late-bound COM connection every time.
        Never caches COM objects across calls (avoids stale ref issues).
        Returns: (acad, doc, drawing_open, drawing_name, error_message)
        """
        if not self.autocad_com_available:
            return (
                None,
                None,
                False,
                None,
                "AutoCAD COM is unavailable in this environment (Windows + pywin32 required)",
            )
        try:
            acad = self.connect_autocad()

            try:
                doc = self.dyn(acad.ActiveDocument)
                if doc is None:
                    return (acad, None, False, None, "No drawing is open")

                try:
                    drawing_name = str(doc.Name)
                except Exception:
                    drawing_name = "Unknown"

                return (acad, doc, True, drawing_name, None)

            except Exception as exc:
                return (acad, None, False, None, f"Cannot access ActiveDocument: {exc}")

        except Exception as exc:
            return (None, None, False, None, f"Cannot connect to AutoCAD: {exc}")

    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get comprehensive AutoCAD status.
        Uses process-level caching only; COM refs are always fresh.
        """
        with self._lock:
            current_time = self.time.time()

            if not force_refresh and self._cached_status is not None:
                if current_time - self._cached_status["timestamp"] < self._cache_ttl:
                    return self._cached_status

            if not self.autocad_com_available:
                status = {
                    "connected": False,
                    "autocad_running": False,
                    "drawing_open": False,
                    "drawing_name": None,
                    "autocad_path": None,
                    "error": "AutoCAD COM unavailable (run on Windows with pywin32 and AutoCAD)",
                    "checks": {"process": False, "com": False, "document": False},
                    "backend_uptime": current_time - self.start_time,
                    "timestamp": current_time,
                    "degraded_mode": True,
                }
                self._cached_status = status
                self.last_check_time = current_time
                return status

            process_running, acad_path = self.is_autocad_process_running()

            if not process_running:
                status = {
                    "connected": False,
                    "autocad_running": False,
                    "drawing_open": False,
                    "drawing_name": None,
                    "autocad_path": None,
                    "error": "AutoCAD process (acad.exe) not detected",
                    "checks": {"process": False, "com": False, "document": False},
                    "backend_uptime": current_time - self.start_time,
                    "timestamp": current_time,
                }
            else:
                try:
                    self.pythoncom.CoInitialize()
                    acad, _doc, drawing_ok, drawing_name, error = self._fresh_com_connection()
                    com_ok = acad is not None
                except Exception as exc:
                    com_ok, drawing_ok, drawing_name, error = False, False, None, str(exc)
                finally:
                    try:
                        self.pythoncom.CoUninitialize()
                    except Exception:
                        pass

                status = {
                    "connected": com_ok,
                    "autocad_running": process_running,
                    "drawing_open": drawing_ok,
                    "drawing_name": drawing_name,
                    "autocad_path": acad_path,
                    "error": error,
                    "checks": {
                        "process": process_running,
                        "com": com_ok,
                        "document": drawing_ok,
                    },
                    "backend_uptime": current_time - self.start_time,
                    "timestamp": current_time,
                }

            self._cached_status = status
            self.last_check_time = current_time
            return status

    def get_layers(self) -> Tuple[bool, List[str], Optional[str]]:
        """
        Get list of layer names from active drawing.
        Uses fresh late-bound COM connection every call.
        """
        status = self.get_status()

        if not status["drawing_open"]:
            return (False, [], status.get("error", "No drawing open"))

        try:
            self.pythoncom.CoInitialize()

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)

            if doc is None:
                return (False, [], "Document reference lost")

            layers = []
            layer_collection = self.dyn(doc.Layers)
            for i in range(int(layer_collection.Count)):
                layer = self.dyn(layer_collection.Item(i))
                layers.append(str(layer.Name))

            return (True, sorted(layers), None)

        except Exception as exc:
            return (False, [], f"COM error: {exc}")
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception:
                pass

    def execute_layer_search(self, config: Dict) -> Dict[str, Any]:
        """
        Execute layer search matching the desktop coordinatesgrabber.py logic:
        - Find entities on target layer in ModelSpace
        - Compute ONE center point per entity (not per vertex)
        - Insert reference blocks at each point
        - Export Excel and auto-open it
        """
        try:
            self.pythoncom.CoInitialize()

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace)

            if doc is None or ms is None:
                raise RuntimeError("Cannot access AutoCAD document or modelspace")

            raw_layers = config.get("layer_search_names")
            requested_layers = []
            if isinstance(raw_layers, list):
                requested_layers.extend(
                    [str(layer).strip() for layer in raw_layers if str(layer).strip()]
                )

            fallback_layers_raw = str(config.get("layer_search_name", "")).strip()
            if fallback_layers_raw:
                for part in self.re.split(r"[;,\n]+", fallback_layers_raw):
                    layer_name_part = part.strip()
                    if layer_name_part:
                        requested_layers.append(layer_name_part)

            requested_layers = list(dict.fromkeys(requested_layers))

            if not requested_layers:
                return {
                    "success": False,
                    "points": [],
                    "count": 0,
                    "layers": [],
                    "excel_path": "",
                    "blocks_inserted": 0,
                    "error": "No layer names provided",
                }

            requested_layer_lookup = {layer.strip().lower() for layer in requested_layers}
            prefix = config.get("prefix", "P")
            start_num = int(config.get("initial_number", 1))
            precision = int(config.get("precision", 3))
            use_corners = config.get("layer_search_use_corners", False)

            points = []
            point_num = start_num
            entities_scanned = 0

            entity_count = int(ms.Count)
            for idx in range(entity_count):
                try:
                    ent = self.dyn(ms.Item(idx))

                    try:
                        ent_layer = str(ent.Layer)
                    except Exception:
                        continue

                    ent_layer_normalized = ent_layer.strip().lower()
                    if ent_layer_normalized not in requested_layer_lookup:
                        continue

                    entities_scanned += 1

                    if use_corners:
                        bbox = self.entity_bbox(ent)
                        if not bbox:
                            continue
                        minx, miny, minz, maxx, maxy, maxz = bbox
                        z_val = (minz + maxz) / 2.0
                        corner_defs = [
                            (minx, maxy, "NW"),
                            (maxx, maxy, "NE"),
                            (minx, miny, "SW"),
                            (maxx, miny, "SE"),
                        ]
                        for cx, cy, corner_name in corner_defs:
                            points.append(
                                {
                                    "name": f"{prefix}{point_num}_{corner_name}",
                                    "x": round(cx, precision),
                                    "y": round(cy, precision),
                                    "z": round(z_val, precision),
                                    "corner": corner_name,
                                    "source_type": self.foundation_source_type,
                                    "layer": ent_layer.strip(),
                                }
                            )
                            point_num += 1
                    else:
                        center = self.entity_center(ent)
                        if not center:
                            continue
                        cx, cy, cz = center
                        points.append(
                            {
                                "name": f"{prefix}{point_num}",
                                "x": round(cx, precision),
                                "y": round(cy, precision),
                                "z": round(cz, precision),
                                "source_type": self.foundation_source_type,
                                "layer": ent_layer.strip(),
                            }
                        )
                        point_num += 1

                except Exception as exc:
                    self.print_fn(f"[execute] Entity {idx} error: {exc}")
                    continue

            self.print_fn(
                f"[execute] Scanned {entities_scanned} entities across layers {requested_layers}, extracted {len(points)} points"
            )

            if not points:
                return {
                    "success": False,
                    "points": [],
                    "count": 0,
                    "layers": requested_layers,
                    "excel_path": "",
                    "blocks_inserted": 0,
                    "error": f'No entities found on requested layers: {", ".join(requested_layers)}',
                }

            ref_dwg = config.get("ref_dwg_path", "").strip()
            if not ref_dwg:
                ref_dwg = self.default_ref_dwg_path()
            ref_layer = config.get("ref_layer_name", "Coordinate Reference Point")
            ref_scale = float(config.get("ref_scale", 1.0))
            ref_rotation = float(config.get("ref_rotation_deg", 0))

            blocks_inserted = 0
            block_errors = []
            if self.os.path.exists(ref_dwg):
                self.print_fn(f"[execute] Inserting reference blocks from: {ref_dwg}")
                for p in points:
                    try:
                        self.insert_reference_block(
                            doc,
                            ms,
                            ref_dwg,
                            ref_layer,
                            p["x"],
                            p["y"],
                            p["z"],
                            ref_scale,
                            ref_rotation,
                        )
                        try:
                            self.add_point_label(
                                ms,
                                ref_layer,
                                p["name"],
                                p["x"],
                                p["y"],
                                p["z"],
                                ref_scale,
                            )
                        except Exception as label_err:
                            self.print_fn(f"[execute] Label at {p['name']}: {label_err}")
                        blocks_inserted += 1
                    except Exception as exc:
                        block_errors.append(f"Block at {p['name']}: {exc}")
                        self.print_fn(f"[execute] Block insert error at {p['name']}: {exc}")

                try:
                    doc.Regen(1)
                except Exception:
                    pass

                if blocks_inserted > 0:
                    self.print_fn(f"[execute] Inserted {blocks_inserted} reference blocks")
            else:
                block_errors.append(f"Reference DWG not found: {ref_dwg}")
                self.print_fn(
                    f"[execute] WARNING: Reference DWG not found at {ref_dwg}, skipping block insertion"
                )

            drawing_dir = None
            try:
                drawing_path = str(doc.FullName)
                if drawing_path:
                    drawing_dir = self.os.path.dirname(drawing_path)
            except Exception:
                pass

            excel_path = ""
            try:
                excel_path = self.export_points_to_excel(points, precision, use_corners, drawing_dir)
                self.print_fn(f"[execute] Excel exported to: {excel_path}")
                try:
                    if hasattr(self.os, "startfile"):
                        self.os.startfile(excel_path)
                except Exception:
                    pass
            except Exception as exc:
                block_errors.append(f"Excel export: {exc}")
                self.print_fn(f"[execute] Excel export error: {exc}")

            return {
                "success": True,
                "points": points,
                "count": len(points),
                "layers": requested_layers,
                "excel_path": excel_path,
                "blocks_inserted": blocks_inserted,
                "block_errors": block_errors if block_errors else None,
                "error": None,
            }

        except Exception as exc:
            self.traceback.print_exc()
            return {
                "success": False,
                "points": [],
                "count": 0,
                "layers": [],
                "excel_path": "",
                "blocks_inserted": 0,
                "error": str(exc),
            }
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception:
                pass


_manager: Optional[AutoCADManager] = None


def get_manager(*, create_manager_fn: Callable[[], AutoCADManager]) -> AutoCADManager:
    global _manager
    if _manager is None:
        _manager = create_manager_fn()
    return _manager


def reset_manager_for_tests() -> None:
    global _manager
    _manager = None


def create_autocad_manager(**kwargs: Any) -> AutoCADManager:
    return AutoCADManager(**kwargs)
