from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
    exception_message as autocad_exception_message,
    log_autocad_exception as autocad_log_exception,
)
from .api_autocad_failures import (
    AutoCadConnectionError,
    AutoCadOperationError,
    AutoCadValidationError,
)
from .api_autocad_ground_grid_plot import (
    plot_ground_grid_entities as autocad_plot_ground_grid_entities_helper,
)
from .api_autocad_terminal_route_plot import (
    sync_terminal_route_operation as autocad_sync_terminal_route_operation_helper,
)
from .api_autocad_terminal_scan import (
    sync_terminal_strip_labels as autocad_sync_terminal_strip_labels_helper,
)


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
        ensure_layer_fn: Any | None = None,
        pt_fn: Any | None = None,
        com_call_with_retry_fn: Any | None = None,
        foundation_source_type: str,
        print_fn: Any = print,
        logger_fn: Any | None = None,
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
        self.ensure_layer = ensure_layer_fn or (lambda _doc, _layer_name: None)
        self.pt = pt_fn or (lambda x, y, z=0: [x, y, z])
        self.com_call_with_retry = com_call_with_retry_fn or (lambda fn: fn())
        self.foundation_source_type = foundation_source_type
        self.print_fn = print_fn
        self.logger = logger_fn

        self.start_time = self.time.time()
        self._lock = self.threading.Lock()
        self._cached_status = None
        self._cache_ttl = 2.0
        self.last_check_time = 0
        self._progress_lock = self.threading.Lock()
        self._progress_event_id = 0
        self._progress_events: List[Dict[str, Any]] = []
        self._progress_event_max = 500
        self._allowed_export_paths: List[str] = []
        self._allowed_export_paths_max = 200
        self._terminal_route_bindings: Dict[str, Dict[str, List[str]]] = {}
        self._progress_state: Dict[str, Any] = {
            "event_id": 0,
            "run_id": None,
            "stage": "idle",
            "progress": 0,
            "current_item": None,
            "message": "",
            "active": False,
            "timestamp": self.time.time(),
        }

        self.print_fn("[AutoCADManager] Initialized")

    def _normalize_path(self, path_value: str) -> str:
        return self.os.path.normcase(self.os.path.normpath(self.os.path.abspath(path_value or "")))

    def register_export_path(self, path_value: str) -> None:
        normalized = self._normalize_path(path_value)
        if not normalized:
            return
        with self._lock:
            self._allowed_export_paths.append(normalized)
            if len(self._allowed_export_paths) > self._allowed_export_paths_max:
                self._allowed_export_paths = self._allowed_export_paths[-self._allowed_export_paths_max :]

    def is_allowed_export_path(self, path_value: str) -> bool:
        normalized = self._normalize_path(path_value)
        if not normalized:
            return False
        with self._lock:
            return normalized in self._allowed_export_paths

    def resolve_allowed_export_path_by_name(self, file_name: str) -> Optional[str]:
        normalized_name = self.os.path.normcase(self.os.path.basename(file_name or ""))
        if not normalized_name:
            return None
        with self._lock:
            for candidate in reversed(self._allowed_export_paths):
                if self.os.path.normcase(self.os.path.basename(candidate)) == normalized_name:
                    return candidate
        return None

    def _set_progress(
        self,
        *,
        run_id: Optional[str],
        stage: str,
        progress: int,
        current_item: Optional[str] = None,
        message: str = "",
        active: bool = True,
    ) -> None:
        clamped = max(0, min(100, int(progress)))
        with self._progress_lock:
            self._progress_event_id += 1
            self._progress_state = {
                "event_id": self._progress_event_id,
                "run_id": run_id,
                "stage": stage,
                "progress": clamped,
                "current_item": current_item,
                "message": message,
                "active": active,
                "timestamp": self.time.time(),
            }
            self._progress_events.append(dict(self._progress_state))
            if len(self._progress_events) > self._progress_event_max:
                self._progress_events = self._progress_events[-self._progress_event_max :]

    def get_progress(self) -> Dict[str, Any]:
        with self._progress_lock:
            return dict(self._progress_state)

    def get_progress_events_since(self, last_event_id: int) -> List[Dict[str, Any]]:
        with self._progress_lock:
            return [
                dict(event)
                for event in self._progress_events
                if int(event.get("event_id") or 0) > int(last_event_id)
            ]

    def _resolve_request_id(self, payload: Any = None) -> str:
        if isinstance(payload, dict):
            raw_value = payload.get("requestId", payload.get("request_id", ""))
        else:
            raw_value = ""
        return autocad_derive_request_id(raw_value, time_module=self.time)

    def _error_payload(
        self,
        *,
        code: str,
        message: str,
        request_id: str,
        stage: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return autocad_build_error_payload(
            code=code,
            message=message,
            request_id=request_id,
            meta={
                "stage": stage,
                "source": "autocad_manager",
            },
            extra=extra,
        )

    def _log_exception(
        self,
        *,
        message: str,
        code: str,
        stage: str,
        request_id: str,
        exc: BaseException,
    ) -> None:
        if self.logger is not None:
            autocad_log_exception(
                logger=self.logger,
                message=message,
                request_id=request_id,
                remote_addr="autocad_manager",
                auth_mode="manager",
                stage=stage,
                code=code,
                provider="com",
            )
            return
        self.print_fn(
            f"[AutoCADManager] {message} "
            f"(request_id={request_id}, stage={stage}, code={code}, error={autocad_exception_message(exc)})"
        )

    def _log_ignored_exception(
        self,
        *,
        stage: str,
        reason: str,
        exc: BaseException,
    ) -> None:
        text = autocad_exception_message(exc)
        if self.logger is not None:
            self.logger.debug(
                "AutoCAD manager ignored recoverable exception (stage=%s, reason=%s, error=%s)",
                stage,
                reason,
                text,
            )
            return
        self.print_fn(
            f"[AutoCADManager] Ignored recoverable exception "
            f"(stage={stage}, reason={reason}, error={text})"
        )

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
                    except Exception as cleanup_exc:
                        self._log_ignored_exception(
                            stage="status_cleanup",
                            reason="CoUninitialize failed",
                            exc=cleanup_exc,
                        )

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
        ok, layer_entries, error = self.get_layer_snapshot()
        if not ok:
            return (False, [], error)
        layer_names = [
            str(entry.get("name") or "").strip()
            for entry in layer_entries
            if isinstance(entry, dict)
        ]
        return (True, sorted([name for name in layer_names if name]), None)

    def get_layer_snapshot(self) -> Tuple[bool, List[Dict[str, Any]], Optional[str]]:
        """
        Read-only layer snapshot for live CAD-aware validations.
        Returns tuples of (ok, layers, error), where layers include lock state.
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

            layers: List[Dict[str, Any]] = []
            layer_collection = self.dyn(doc.Layers)
            for i in range(int(layer_collection.Count)):
                layer = self.dyn(layer_collection.Item(i))
                layer_name = str(getattr(layer, "Name", "") or "").strip()
                if not layer_name:
                    continue
                locked = False
                try:
                    locked = bool(getattr(layer, "Lock"))
                except Exception:
                    try:
                        locked = bool(getattr(layer, "Locked"))
                    except Exception:
                        locked = False
                layers.append({"name": layer_name, "locked": locked})

            return (True, layers, None)

        except Exception as exc:
            return (False, [], f"COM error: {exc}")
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="get_layer_snapshot_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    def get_entity_snapshot(
        self,
        *,
        layer_names: Optional[List[str]] = None,
        max_entities: int = 500,
    ) -> Tuple[bool, List[Dict[str, Any]], Optional[str]]:
        """
        Read-only entity bounds snapshot for backcheck enrichment.
        """
        status = self.get_status()
        if not status["drawing_open"]:
            return (False, [], status.get("error", "No drawing open"))

        safe_max_entities = max(1, min(5000, int(max_entities or 500)))
        requested_layer_lookup = {
            str(layer_name).strip().lower()
            for layer_name in (layer_names or [])
            if str(layer_name).strip()
        }

        try:
            self.pythoncom.CoInitialize()

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace) if doc is not None else None

            if doc is None or ms is None:
                return (False, [], "Cannot access AutoCAD document or modelspace")

            entities: List[Dict[str, Any]] = []
            modelspace_count = int(ms.Count)

            def _extract_entity_text(entity_obj: Any, entity_type_name: str) -> str:
                text_value = ""
                type_name = str(entity_type_name or "").strip().lower()
                if type_name in {"acdbtext", "acdbmtext", "acdbattribute", "acdbattributedefinition"}:
                    for attr_name in ("TextString", "Text", "Contents", "MTextAttributeContent"):
                        try:
                            raw_value = getattr(entity_obj, attr_name)
                        except Exception:
                            continue
                        text_value = str(raw_value or "").strip()
                        if text_value:
                            return text_value
                if type_name == "acdbblockreference":
                    try:
                        raw_attrs = entity_obj.GetAttributes()
                    except Exception:
                        raw_attrs = None
                    if raw_attrs is None:
                        return ""
                    attr_entries: List[Any]
                    if isinstance(raw_attrs, (list, tuple)):
                        attr_entries = list(raw_attrs)
                    elif hasattr(raw_attrs, "__iter__"):
                        try:
                            attr_entries = list(raw_attrs)
                        except Exception:
                            attr_entries = []
                    else:
                        attr_entries = []
                    values: List[str] = []
                    for entry in attr_entries:
                        if entry is None:
                            continue
                        try:
                            value = str(getattr(entry, "TextString", "") or "").strip()
                        except Exception:
                            value = ""
                        if value:
                            values.append(value)
                    if values:
                        return " | ".join(values)
                if "dimension" in type_name:
                    for attr_name in ("TextOverride", "TextString", "Text"):
                        try:
                            raw_value = getattr(entity_obj, attr_name)
                        except Exception:
                            continue
                        text_value = str(raw_value or "").strip()
                        if text_value and text_value != "<>":
                            return text_value
                    try:
                        measurement = getattr(entity_obj, "Measurement")
                    except Exception:
                        measurement = None
                    if measurement is not None:
                        measurement_text = str(measurement).strip()
                        if measurement_text:
                            return measurement_text
                return text_value

            for idx in range(modelspace_count):
                if len(entities) >= safe_max_entities:
                    break
                try:
                    entity = self.dyn(ms.Item(idx))
                except Exception:
                    continue

                layer_name = ""
                try:
                    layer_name = str(getattr(entity, "Layer", "") or "").strip()
                except Exception:
                    layer_name = ""
                if requested_layer_lookup and layer_name.lower() not in requested_layer_lookup:
                    continue

                bounds_raw = self.entity_bbox(entity)
                if not bounds_raw:
                    continue
                try:
                    minx, miny, _minz, maxx, maxy, _maxz = bounds_raw
                    x = float(minx)
                    y = float(miny)
                    width = max(0.0, float(maxx) - float(minx))
                    height = max(0.0, float(maxy) - float(miny))
                except Exception:
                    continue
                if width <= 0.0 or height <= 0.0:
                    continue

                handle = ""
                try:
                    handle = str(getattr(entity, "Handle", "") or "").strip()
                except Exception:
                    handle = ""
                object_name = ""
                try:
                    object_name = str(getattr(entity, "ObjectName", "") or "").strip()
                except Exception:
                    object_name = ""
                entity_text = _extract_entity_text(entity, object_name)

                entity_id = handle or f"entity-{idx + 1}"
                entity_payload = {
                    "id": entity_id,
                    "handle": handle,
                    "layer": layer_name,
                    "type": object_name,
                    "bounds": {
                        "x": x,
                        "y": y,
                        "width": width,
                        "height": height,
                    },
                }
                if entity_text:
                    entity_payload["text"] = entity_text
                entities.append(entity_payload)

            return (True, entities, None)

        except Exception as exc:
            return (False, [], f"COM error: {exc}")
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="get_entity_snapshot_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    def execute_layer_search(self, config: Dict, run_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute layer search matching the desktop coordinatesgrabber.py logic:
        - Find entities on target layer in ModelSpace
        - Compute ONE center point per entity (not per vertex)
        - Insert reference blocks at each point
        - Export Excel and auto-open it
        """
        run_key = run_id or "default"
        request_id = self._resolve_request_id(config)
        try:
            self._set_progress(
                run_id=run_key,
                stage="initializing",
                progress=3,
                message="Initializing AutoCAD connection",
                active=True,
            )
            self.pythoncom.CoInitialize()

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace)

            if doc is None or ms is None:
                raise AutoCadConnectionError(
                    "Cannot access AutoCAD document or modelspace",
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    stage="execute_layer_search.connect",
                )

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
            self._set_progress(
                run_id=run_key,
                stage="preparing",
                progress=8,
                message=f"Resolved {len(requested_layers)} target layer(s)",
                active=True,
            )

            if not requested_layers:
                self._set_progress(
                    run_id=run_key,
                    stage="failed",
                    progress=100,
                    message="No layer names provided",
                    active=False,
                )
                raise AutoCadValidationError(
                    "No layer names provided",
                    stage="execute_layer_search.validation",
                    extra={
                        "points": [],
                        "count": 0,
                        "layers": [],
                        "excel_path": "",
                        "blocks_inserted": 0,
                        "error": "No layer names provided",
                    },
                )

            requested_layer_lookup = {layer.strip().lower() for layer in requested_layers}
            prefix = config.get("prefix", "P")
            start_num = int(config.get("initial_number", 1))
            precision = int(config.get("precision", 3))
            use_corners = config.get("layer_search_use_corners", False)
            use_selection_only = bool(config.get("layer_search_use_selection", False))
            include_modelspace = bool(config.get("layer_search_include_modelspace", True))

            if not include_modelspace and not use_selection_only:
                self._set_progress(
                    run_id=run_key,
                    stage="failed",
                    progress=100,
                    message="No scan source enabled (selection/modelspace)",
                    active=False,
                )
                raise AutoCadValidationError(
                    "No scan source enabled: enable modelspace or selection scan",
                    stage="execute_layer_search.validation",
                    extra={
                        "points": [],
                        "count": 0,
                        "layers": requested_layers,
                        "excel_path": "",
                        "blocks_inserted": 0,
                        "error": "No scan source enabled: enable modelspace or selection scan",
                    },
                )

            points = []
            point_num = start_num
            entities_scanned = 0

            def _entity_handle(entity_obj: Any) -> Optional[str]:
                try:
                    handle = str(entity_obj.Handle).strip().upper()
                    return handle or None
                except Exception:
                    return None

            selected_entities: List[Any] = []
            selected_handles: set[str] = set()
            if use_selection_only:
                selection_sets = []
                try:
                    selection_sets.append(self.dyn(doc.PickfirstSelectionSet))
                except Exception as pickfirst_exc:
                    self._log_ignored_exception(
                        stage="execute_layer_search",
                        reason="PickfirstSelectionSet unavailable",
                        exc=pickfirst_exc,
                    )
                try:
                    selection_sets.append(self.dyn(doc.ActiveSelectionSet))
                except Exception as active_exc:
                    self._log_ignored_exception(
                        stage="execute_layer_search",
                        reason="ActiveSelectionSet unavailable",
                        exc=active_exc,
                    )

                seen_selection_handles: set[str] = set()
                for ss in selection_sets:
                    if ss is None:
                        continue
                    try:
                        ss_count = int(ss.Count)
                    except Exception:
                        continue
                    for sel_idx in range(ss_count):
                        try:
                            sel_ent = self.dyn(ss.Item(sel_idx))
                        except Exception:
                            continue
                        sel_handle = _entity_handle(sel_ent)
                        if sel_handle and sel_handle in seen_selection_handles:
                            continue
                        if sel_handle:
                            seen_selection_handles.add(sel_handle)
                            selected_handles.add(sel_handle)
                        selected_entities.append(sel_ent)

                if not selected_entities and not include_modelspace:
                    self._set_progress(
                        run_id=run_key,
                        stage="failed",
                        progress=100,
                        message="No selected entities found",
                        active=False,
                    )
                    raise AutoCadValidationError(
                        (
                            "Selection scan enabled but no selected entities were found. "
                            "Select objects in AutoCAD first or enable modelspace scan."
                        ),
                        stage="execute_layer_search.validation",
                        extra={
                            "points": [],
                            "count": 0,
                            "layers": requested_layers,
                            "excel_path": "",
                            "blocks_inserted": 0,
                            "error": (
                                "Selection scan enabled but no selected entities were found. "
                                "Select objects in AutoCAD first or enable modelspace scan."
                            ),
                        },
                    )

            modelspace_count = int(ms.Count) if include_modelspace else 0
            total_sources = len(selected_entities) + modelspace_count
            if total_sources <= 0:
                self._set_progress(
                    run_id=run_key,
                    stage="failed",
                    progress=100,
                    message="No entities available to scan",
                    active=False,
                )
                raise AutoCadValidationError(
                    "No entities available to scan from configured sources",
                    stage="execute_layer_search.validation",
                    extra={
                        "points": [],
                        "count": 0,
                        "layers": requested_layers,
                        "excel_path": "",
                        "blocks_inserted": 0,
                        "error": "No entities available to scan from configured sources",
                    },
                )

            scan_step = max(1, total_sources // 25)
            source_parts = []
            if selected_entities:
                source_parts.append(f"{len(selected_entities)} selected")
            if include_modelspace:
                source_parts.append(f"{modelspace_count} modelspace")
            self._set_progress(
                run_id=run_key,
                stage="scanning",
                progress=12,
                message=f"Scanning {' + '.join(source_parts)} entities",
                active=True,
            )

            scanned_count = 0

            def _scan_entity(ent: Any, source_name: str, source_index: int) -> None:
                nonlocal point_num, entities_scanned
                try:
                    ent_layer = str(ent.Layer)
                except Exception:
                    return

                ent_layer_normalized = ent_layer.strip().lower()
                if ent_layer_normalized not in requested_layer_lookup:
                    return

                entities_scanned += 1

                if use_corners:
                    bbox = self.entity_bbox(ent)
                    if not bbox:
                        return
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
                        return
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

                if scanned_count % scan_step == 0 or scanned_count == total_sources:
                    pct = 12 + int((scanned_count / max(1, total_sources)) * 48)
                    self._set_progress(
                        run_id=run_key,
                        stage="scanning",
                        progress=pct,
                        message=(
                            f"Scanned {scanned_count}/{total_sources} entities "
                            f"({len(points)} point(s) found)"
                        ),
                        current_item=f"{source_name}:{source_index}",
                        active=True,
                    )

            for sel_idx, sel_ent in enumerate(selected_entities):
                scanned_count += 1
                try:
                    _scan_entity(sel_ent, "selection", sel_idx)
                except Exception as exc:
                    self.print_fn(f"[execute] Selection entity {sel_idx} error: {exc}")

            if include_modelspace:
                for idx in range(modelspace_count):
                    scanned_count += 1
                    try:
                        ent = self.dyn(ms.Item(idx))
                        if use_selection_only:
                            ent_handle = _entity_handle(ent)
                            if ent_handle and ent_handle in selected_handles:
                                if scanned_count % scan_step == 0 or scanned_count == total_sources:
                                    pct = 12 + int((scanned_count / max(1, total_sources)) * 48)
                                    self._set_progress(
                                        run_id=run_key,
                                        stage="scanning",
                                        progress=pct,
                                        message=(
                                            f"Scanned {scanned_count}/{total_sources} entities "
                                            f"({len(points)} point(s) found)"
                                        ),
                                        current_item=f"modelspace:{idx}",
                                        active=True,
                                    )
                                continue
                        _scan_entity(ent, "modelspace", idx)
                    except Exception as exc:
                        self.print_fn(f"[execute] ModelSpace entity {idx} error: {exc}")
                        continue

            self.print_fn(
                f"[execute] Scanned {entities_scanned} entities across layers {requested_layers}, extracted {len(points)} points"
            )

            if not points:
                self._set_progress(
                    run_id=run_key,
                    stage="failed",
                    progress=100,
                    message="No points found on requested layers",
                    active=False,
                )
                raise AutoCadValidationError(
                    f'No entities found on requested layers: {", ".join(requested_layers)}',
                    code="NO_POINTS_FOUND",
                    stage="execute_layer_search.validation",
                    extra={
                        "points": [],
                        "count": 0,
                        "layers": requested_layers,
                        "excel_path": "",
                        "blocks_inserted": 0,
                        "error": f'No entities found on requested layers: {", ".join(requested_layers)}',
                    },
                )

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
                total_blocks = max(1, len(points))
                self._set_progress(
                    run_id=run_key,
                    stage="inserting_blocks",
                    progress=65,
                    message=f"Inserting {len(points)} reference block(s)",
                    active=True,
                )
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
                        if blocks_inserted % max(1, total_blocks // 20) == 0 or blocks_inserted == total_blocks:
                            pct = 65 + int((blocks_inserted / total_blocks) * 20)
                            self._set_progress(
                                run_id=run_key,
                                stage="inserting_blocks",
                                progress=pct,
                                current_item=p.get("name"),
                                message=(
                                    f"Inserted {blocks_inserted}/{total_blocks} reference block(s)"
                                ),
                                active=True,
                            )
                    except Exception as exc:
                        block_errors.append(f"Block at {p['name']}: {exc}")
                        self.print_fn(f"[execute] Block insert error at {p['name']}: {exc}")

                try:
                    doc.Regen(1)
                except Exception as regen_exc:
                    self._log_ignored_exception(
                        stage="execute_layer_search",
                        reason="Document regen failed after block insertion",
                        exc=regen_exc,
                    )

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
            except Exception as drawing_path_exc:
                self._log_ignored_exception(
                    stage="execute_layer_search",
                    reason="Unable to resolve drawing directory for Excel export",
                    exc=drawing_path_exc,
                )

            excel_path = ""
            try:
                self._set_progress(
                    run_id=run_key,
                    stage="exporting_excel",
                    progress=90,
                    message="Exporting Excel output",
                    active=True,
                )
                excel_path = self.export_points_to_excel(points, precision, use_corners, drawing_dir)
                self.print_fn(f"[execute] Excel exported to: {excel_path}")
                self.register_export_path(excel_path)
                try:
                    if hasattr(self.os, "startfile"):
                        self.os.startfile(excel_path)
                except Exception as startfile_exc:
                    self._log_ignored_exception(
                        stage="execute_layer_search",
                        reason="Auto-open Excel export failed",
                        exc=startfile_exc,
                    )
            except Exception as exc:
                block_errors.append(f"Excel export: {exc}")
                self.print_fn(f"[execute] Excel export error: {exc}")

            self._set_progress(
                run_id=run_key,
                stage="completed",
                progress=100,
                message=f"Extracted {len(points)} point(s)",
                active=False,
            )
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

        except AutoCadOperationError as op_exc:
            error_message = str(op_exc)
            self._set_progress(
                run_id=run_key,
                stage="failed",
                progress=100,
                message=error_message,
                active=False,
            )
            return self._error_payload(
                code=op_exc.code,
                message=error_message,
                request_id=request_id,
                stage=op_exc.stage,
                extra={
                    "points": [],
                    "count": 0,
                    "layers": [],
                    "excel_path": "",
                    "blocks_inserted": 0,
                    "error": error_message,
                    **(op_exc.extra or {}),
                },
            )
        except Exception as exc:
            error_message = autocad_exception_message(exc)
            self._log_exception(
                message="Layer search execution failed",
                code="EXECUTE_LAYER_SEARCH_FAILED",
                stage="execute_layer_search",
                request_id=request_id,
                exc=exc,
            )
            self._set_progress(
                run_id=run_key,
                stage="failed",
                progress=100,
                message=error_message,
                active=False,
            )
            return self._error_payload(
                code="EXECUTE_LAYER_SEARCH_FAILED",
                message=f"Layer search execution failed: {error_message}",
                request_id=request_id,
                stage="execute_layer_search",
                extra={
                    "points": [],
                    "count": 0,
                    "layers": [],
                    "excel_path": "",
                    "blocks_inserted": 0,
                    "error": error_message,
                },
            )
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="execute_layer_search_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    def plot_ground_grid(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Plot generated ground-grid lines and block placements into active AutoCAD drawing."""
        request_id = self._resolve_request_id(payload)
        try:
            self.pythoncom.CoInitialize()

            conductors = payload.get("conductors")
            placements = payload.get("placements")
            config = payload.get("config") or {}

            if not isinstance(conductors, list):
                raise AutoCadValidationError(
                    "Payload field 'conductors' must be an array",
                    code="GROUND_GRID_PLOT_FAILED",
                    stage="ground_grid_plot",
                )
            if not isinstance(placements, list):
                raise AutoCadValidationError(
                    "Payload field 'placements' must be an array",
                    code="GROUND_GRID_PLOT_FAILED",
                    stage="ground_grid_plot",
                )
            if len(conductors) == 0 and len(placements) == 0:
                raise AutoCadValidationError(
                    "Nothing to plot: conductors and placements are both empty",
                    code="GROUND_GRID_PLOT_FAILED",
                    stage="ground_grid_plot",
                )

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace)
            if doc is None or ms is None:
                raise AutoCadConnectionError(
                    "Cannot access AutoCAD document or modelspace",
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    stage="ground_grid_plot.connect",
                )

            result = autocad_plot_ground_grid_entities_helper(
                doc=doc,
                modelspace=ms,
                conductors=conductors,
                placements=placements,
                config=config,
                ensure_layer_fn=self.ensure_layer,
                pt_fn=self.pt,
                dyn_fn=self.dyn,
                com_call_with_retry_fn=self.com_call_with_retry,
            )

            try:
                doc.Regen(1)
            except Exception as regen_exc:
                self._log_ignored_exception(
                    stage="terminal_route_draw",
                    reason="Document regen failed",
                    exc=regen_exc,
                )

            return {
                "success": True,
                "message": (
                    f"Plotted {result['lines_drawn']} conductor lines and "
                    f"{result['blocks_inserted']} placements on layer '{result['layer_name']}'"
                ),
                "lines_drawn": result["lines_drawn"],
                "blocks_inserted": result["blocks_inserted"],
                "layer_name": result["layer_name"],
                "test_well_block_name": result.get("test_well_block_name", ""),
            }

        except AutoCadOperationError as op_exc:
            error_message = str(op_exc)
            return self._error_payload(
                code=op_exc.code,
                message=error_message,
                request_id=request_id,
                stage=op_exc.stage,
                extra={
                    "lines_drawn": 0,
                    "blocks_inserted": 0,
                    "layer_name": "",
                    "test_well_block_name": "",
                    "error": error_message,
                    **(op_exc.extra or {}),
                },
            )
        except Exception as exc:
            error_message = autocad_exception_message(exc)
            self._log_exception(
                message="Ground grid plot failed",
                code="GROUND_GRID_PLOT_FAILED",
                stage="ground_grid_plot",
                request_id=request_id,
                exc=exc,
            )
            return self._error_payload(
                code="GROUND_GRID_PLOT_FAILED",
                message=f"Ground grid plot failed: {error_message}",
                request_id=request_id,
                stage="ground_grid_plot",
                extra={
                    "lines_drawn": 0,
                    "blocks_inserted": 0,
                    "layer_name": "",
                    "test_well_block_name": "",
                    "error": error_message,
                },
            )
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="ground_grid_plot_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    def plot_terminal_routes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply terminal route CAD sync operation (upsert/delete/reset)."""
        request_id = self._resolve_request_id(payload)
        try:
            self.pythoncom.CoInitialize()

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace)
            if doc is None or ms is None:
                raise AutoCadConnectionError(
                    "Cannot access AutoCAD document or modelspace",
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    stage="terminal_route_draw.connect",
                )

            result = autocad_sync_terminal_route_operation_helper(
                doc=doc,
                modelspace=ms,
                payload=payload,
                binding_store=self._terminal_route_bindings,
                ensure_layer_fn=self.ensure_layer,
                pt_fn=self.pt,
                dyn_fn=self.dyn,
                com_call_with_retry_fn=self.com_call_with_retry,
            )

            try:
                doc.Regen(1)
            except Exception as regen_exc:
                self._log_ignored_exception(
                    stage="ground_grid_plot",
                    reason="Document regen failed",
                    exc=regen_exc,
                )

            try:
                units_code = int(doc.GetVariable("INSUNITS"))
            except Exception:
                units_code = -1
            units_lookup = {
                1: "Inches",
                2: "Feet",
                3: "Miles",
                4: "Millimeters",
                5: "Centimeters",
                6: "Meters",
                7: "Kilometers",
            }
            units_value = units_lookup.get(units_code, "Unitless" if units_code >= 0 else "Unknown")

            drawing_name = "Unknown.dwg"
            try:
                drawing_name = str(doc.Name)
            except Exception as drawing_name_exc:
                self._log_ignored_exception(
                    stage="terminal_route_draw",
                    reason="Unable to resolve drawing name",
                    exc=drawing_name_exc,
                )

            return {
                "success": bool(result.get("success")),
                "code": str(result.get("code") or ""),
                "message": str(result.get("message") or "Terminal route CAD sync operation completed."),
                "data": {
                    "drawing": {
                        "name": drawing_name,
                        "units": units_value,
                    },
                    **(result.get("data") or {}),
                },
                "warnings": result.get("warnings", []),
            }

        except AutoCadOperationError as op_exc:
            error_message = str(op_exc)
            return self._error_payload(
                code=op_exc.code,
                message=error_message,
                request_id=request_id,
                stage=op_exc.stage,
                extra={
                    "data": {
                        "drawnRoutes": 0,
                        "drawnSegments": 0,
                        "labelsDrawn": 0,
                        "layersUsed": [],
                    },
                    "warnings": [],
                    "error": error_message,
                    **(op_exc.extra or {}),
                },
            )
        except Exception as exc:
            error_message = autocad_exception_message(exc)
            self._log_exception(
                message="Terminal route draw failed",
                code="TERMINAL_ROUTE_DRAW_FAILED",
                stage="terminal_route_draw",
                request_id=request_id,
                exc=exc,
            )
            return self._error_payload(
                code="TERMINAL_ROUTE_DRAW_FAILED",
                message=f"Terminal route draw failed: {error_message}",
                request_id=request_id,
                stage="terminal_route_draw",
                extra={
                    "data": {
                        "drawnRoutes": 0,
                        "drawnSegments": 0,
                        "labelsDrawn": 0,
                        "layersUsed": [],
                    },
                    "warnings": [],
                    "error": error_message,
                },
            )
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="terminal_route_draw_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    def sync_terminal_labels(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply terminal strip label updates to block attributes."""
        request_id = self._resolve_request_id(payload)
        try:
            self.pythoncom.CoInitialize()

            include_modelspace = bool(
                payload.get("includeModelspace", payload.get("include_modelspace", True))
            )
            selection_only = bool(
                payload.get("selectionOnly", payload.get("selection_only", False))
            )
            max_entities_raw = payload.get("maxEntities", payload.get("max_entities", 50000))
            try:
                max_entities = int(max_entities_raw)
            except (TypeError, ValueError):
                max_entities = 50000
            max_entities = max(100, min(max_entities, 250000))

            strips_payload = payload.get("strips")
            terminal_profile = payload.get("terminalProfile", payload.get("terminal_profile"))

            acad = self.connect_autocad()
            doc = self.dyn(acad.ActiveDocument)
            ms = self.dyn(doc.ModelSpace)
            if doc is None or ms is None:
                raise AutoCadConnectionError(
                    "Cannot access AutoCAD document or modelspace",
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    stage="terminal_label_sync.connect",
                )

            result = autocad_sync_terminal_strip_labels_helper(
                doc=doc,
                modelspace=ms,
                dyn_fn=self.dyn,
                strips_payload=strips_payload,
                include_modelspace=include_modelspace,
                selection_only=selection_only,
                max_entities=max_entities,
                terminal_profile=terminal_profile,
            )

            try:
                doc.Regen(1)
            except Exception as regen_exc:
                self._log_ignored_exception(
                    stage="terminal_label_sync",
                    reason="Document regen failed",
                    exc=regen_exc,
                )

            try:
                units_code = int(doc.GetVariable("INSUNITS"))
            except Exception:
                units_code = -1
            units_lookup = {
                1: "Inches",
                2: "Feet",
                3: "Miles",
                4: "Millimeters",
                5: "Centimeters",
                6: "Meters",
                7: "Kilometers",
            }
            units_value = units_lookup.get(units_code, "Unitless" if units_code >= 0 else "Unknown")

            drawing_name = "Unknown.dwg"
            try:
                drawing_name = str(doc.Name)
            except Exception as drawing_name_exc:
                self._log_ignored_exception(
                    stage="terminal_label_sync",
                    reason="Unable to resolve drawing name",
                    exc=drawing_name_exc,
                )

            return {
                "success": bool(result.get("success")),
                "code": str(result.get("code") or ""),
                "message": str(result.get("message") or "Terminal label sync completed."),
                "data": {
                    "drawing": {
                        "name": drawing_name,
                        "units": units_value,
                    },
                    **(result.get("data") or {}),
                },
                "meta": result.get("meta", {}),
                "warnings": result.get("warnings", []),
            }
        except AutoCadOperationError as op_exc:
            error_message = str(op_exc)
            return self._error_payload(
                code=op_exc.code,
                message=error_message,
                request_id=request_id,
                stage=op_exc.stage,
                extra={
                    "data": {
                        "updatedStrips": 0,
                        "matchedStrips": 0,
                        "targetStrips": 0,
                        "matchedBlocks": 0,
                        "updatedBlocks": 0,
                        "updatedAttributes": 0,
                        "unchangedAttributes": 0,
                        "missingAttributes": 0,
                        "failedAttributes": 0,
                    },
                    "warnings": [],
                    "error": error_message,
                    **(op_exc.extra or {}),
                },
            )
        except Exception as exc:
            error_message = autocad_exception_message(exc)
            self._log_exception(
                message="Terminal label sync failed",
                code="TERMINAL_LABEL_SYNC_FAILED",
                stage="terminal_label_sync",
                request_id=request_id,
                exc=exc,
            )
            return self._error_payload(
                code="TERMINAL_LABEL_SYNC_FAILED",
                message=f"Terminal label sync failed: {error_message}",
                request_id=request_id,
                stage="terminal_label_sync",
                extra={
                    "data": {
                        "updatedStrips": 0,
                        "matchedStrips": 0,
                        "targetStrips": 0,
                        "matchedBlocks": 0,
                        "updatedBlocks": 0,
                        "updatedAttributes": 0,
                        "unchangedAttributes": 0,
                        "missingAttributes": 0,
                        "failedAttributes": 0,
                    },
                    "warnings": [],
                    "error": error_message,
                },
            )
        finally:
            try:
                self.pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                self._log_ignored_exception(
                    stage="terminal_label_sync_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )


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
