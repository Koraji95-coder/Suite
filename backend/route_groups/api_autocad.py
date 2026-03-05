from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable, Dict
import os

from flask import Blueprint, g, jsonify, request, send_file
from flask_limiter import Limiter
from .api_autocad_terminal_scan import scan_terminal_strips
from .api_conduit_route_compute import compute_conduit_route
from .api_conduit_route_obstacle_scan import scan_conduit_obstacles
from .api_autocad_entity_geometry import entity_bbox


def create_autocad_blueprint(
    *,
    require_autocad_auth: Callable,
    limiter: Limiter,
    issue_ws_ticket: Callable[..., Dict[str, Any]],
    logger: Any,
    get_manager: Callable[[], Any],
    connect_autocad: Callable[[], Any],
    dyn: Callable[[Any], Any],
    pythoncom: Any,
    validate_layer_config: Callable[[Any], Dict[str, Any]],
    traceback_module: Any,
) -> Blueprint:
    """Create AutoCAD backend route group blueprint under /api."""
    bp = Blueprint("autocad_api", __name__, url_prefix="/api")
    backend_exports_dir = Path(__file__).resolve().parents[1] / "exports"

    def _is_under_dir(path_value: Path, root_dir: Path) -> bool:
        try:
            path_value.relative_to(root_dir)
            return True
        except Exception:
            return False

    def _is_safe_export_path(path_value: Path, manager: Any) -> bool:
        name_lower = path_value.name.lower()
        if not name_lower.startswith("coordinates_"):
            return False
        if manager is not None:
            try:
                if bool(manager.is_allowed_export_path(str(path_value))):
                    return True
            except Exception:
                pass
        return _is_under_dir(path_value, backend_exports_dir)

    @bp.route("/status", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_status():
        """Health check endpoint with AutoCAD connection details."""
        manager = get_manager()
        status = manager.get_status()
        status["backend_id"] = "coordinates-grabber-api"
        status["backend_version"] = "1.0.0"

        http_code = 200 if status.get("autocad_running") else 503
        return jsonify(status), http_code

    @bp.route("/layers", methods=["GET"])
    @require_autocad_auth
    def api_layers():
        """List available layers in the active AutoCAD drawing."""
        manager = get_manager()
        success, layers, error = manager.get_layers()

        response = {
            "success": success,
            "layers": layers,
            "count": len(layers),
            "error": error,
        }
        return jsonify(response), 200 if success else 503

    @bp.route("/selection-count", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("120 per hour")
    def api_selection_count():
        """Get count of currently selected objects in AutoCAD (fresh COM)."""
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return jsonify({"success": False, "count": 0, "error": "No drawing open"}), 503

        if pythoncom is None:
            return (
                jsonify(
                    {
                        "success": False,
                        "count": 0,
                        "error": "AutoCAD COM bridge unavailable on this platform.",
                    }
                ),
                503,
            )

        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return (
                    jsonify({"success": False, "count": 0, "error": "Cannot connect to AutoCAD"}),
                    503,
                )

            doc = dyn(acad.ActiveDocument)

            try:
                old_ss = doc.SelectionSets.Item("TEMP_COUNT")
                old_ss.Delete()
            except Exception:
                pass

            ss = doc.SelectionSets.Add("TEMP_COUNT")
            ss.SelectOnScreen()
            count = ss.Count
            ss.Delete()

            return jsonify({"success": True, "count": count, "error": None})

        except Exception as exc:
            traceback_module.print_exc()
            return jsonify({"success": False, "count": 0, "error": f"COM error: {str(exc)}"}), 500
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    @bp.route("/execute", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("30 per hour")
    def api_execute():
        """
        Execute coordinate extraction using manager.execute_layer_search.
        """
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "No drawing open in AutoCAD",
                        "points_created": 0,
                        "error_details": "Please open a drawing before executing",
                    }
                ),
                400,
            )

        try:
            if not request.is_json:
                raise ValueError("Expected application/json payload")

            raw_config = request.get_json(silent=False)
            if not raw_config:
                raise ValueError("No configuration provided")

            config = validate_layer_config(raw_config)
            run_id = str(request.headers.get("X-Run-Id", "")).strip()[:80] or None

            started_at = time.time()
            result = manager.execute_layer_search(config, run_id=run_id)
            duration = time.time() - started_at

            if result.get("success"):
                blocks_inserted = result.get("blocks_inserted", 0)
                block_errors = result.get("block_errors")
                layers = result.get("layers", [])
                if layers:
                    message = (
                        f'Extracted {result["count"]} points from {len(layers)} layer(s): '
                        f'{", ".join(layers)}'
                    )
                else:
                    message = f'Extracted {result["count"]} points'
                if blocks_inserted > 0:
                    message += f", inserted {blocks_inserted} reference blocks"
                if block_errors:
                    message += f" (warnings: {len(block_errors)})"

                return (
                    jsonify(
                        {
                            "success": True,
                            "message": message,
                            "points_created": result["count"],
                            "blocks_inserted": blocks_inserted,
                            "excel_path": result.get("excel_path", ""),
                            "duration_seconds": round(duration, 2),
                            "points": result["points"],
                            "block_errors": block_errors,
                            "error_details": None,
                            "run_id": run_id,
                        }
                    ),
                    200,
                )

            return (
                jsonify(
                    {
                        "success": False,
                        "message": result.get("error", "No entities found"),
                        "points_created": 0,
                        "blocks_inserted": 0,
                        "excel_path": "",
                        "duration_seconds": round(duration, 2),
                        "points": [],
                        "error_details": result.get("error"),
                        "run_id": run_id,
                    }
                ),
                400,
            )

        except Exception as exc:
            traceback_module.print_exc()
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"Execution failed: {str(exc)}",
                        "points_created": 0,
                        "error_details": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/ground-grid/plot", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("30 per hour")
    def api_plot_ground_grid():
        """Plot generated ground-grid data into the active AutoCAD drawing."""
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "No drawing open in AutoCAD",
                        "error_details": "Please open a drawing before plotting",
                    }
                ),
                400,
            )

        try:
            if not request.is_json:
                raise ValueError("Expected application/json payload")

            payload = request.get_json(silent=False) or {}
            result = manager.plot_ground_grid(payload)

            if result.get("success"):
                return jsonify(result), 200

            return (
                jsonify(
                    {
                        "success": False,
                        "message": result.get("message", "Ground grid plot failed"),
                        "lines_drawn": result.get("lines_drawn", 0),
                        "blocks_inserted": result.get("blocks_inserted", 0),
                        "layer_name": result.get("layer_name", ""),
                        "test_well_block_name": result.get("test_well_block_name", ""),
                        "error_details": result.get("error"),
                    }
                ),
                400,
            )

        except Exception as exc:
            traceback_module.print_exc()
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"Ground grid plot failed: {str(exc)}",
                        "error_details": str(exc),
                    }
                ),
                500,
            )

    @bp.route("/trigger-selection", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("120 per hour")
    def api_trigger_selection():
        """Bring AutoCAD to foreground (fresh COM)."""
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return jsonify({"success": False, "message": "No drawing open"}), 503

        if pythoncom is None:
            return (
                jsonify({"success": False, "message": "AutoCAD COM bridge unavailable on this platform."}),
                503,
            )

        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return jsonify({"success": False, "message": "Cannot connect to AutoCAD"}), 503

            acad.Visible = True
            acad.WindowState = 1
            return jsonify({"success": True, "message": "AutoCAD activated"})

        except Exception as exc:
            traceback_module.print_exc()
            return jsonify({"success": False, "message": f"Error: {str(exc)}"}), 500
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    @bp.route("/download-result", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("60 per hour")
    def api_download_result():
        """Download a generated Excel file from an absolute path returned by /api/execute."""
        try:
            manager = get_manager()
            raw_path = str(request.args.get("path", "")).strip()
            if not raw_path:
                return jsonify({"success": False, "message": "Missing file path"}), 400

            resolved = Path(raw_path).expanduser()
            try:
                resolved = resolved.resolve(strict=True)
            except FileNotFoundError:
                return jsonify({"success": False, "message": "File not found"}), 404

            if not resolved.is_file():
                return jsonify({"success": False, "message": "Path is not a file"}), 400

            if resolved.suffix.lower() not in {".xlsx", ".xls", ".xlsm"}:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "Only Excel files can be downloaded from this endpoint",
                        }
                    ),
                    400,
                )
            if not _is_safe_export_path(resolved, manager):
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": (
                                "File path is outside allowed export scope. "
                                "Only generated coordinates export files are allowed."
                            ),
                        }
                    ),
                    403,
                )

            return send_file(
                str(resolved),
                as_attachment=True,
                download_name=resolved.name,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        except Exception as exc:
            return jsonify({"success": False, "message": f"Download failed: {exc}"}), 500

    @bp.route("/open-export-folder", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("60 per hour")
    def api_open_export_folder():
        """Open the folder containing a generated export file (Windows only)."""
        try:
            manager = get_manager()
            payload = request.get_json(silent=True) or {}
            raw_path = str(payload.get("path", "")).strip()
            if not raw_path:
                return jsonify({"success": False, "message": "Missing file path"}), 400

            resolved = Path(raw_path).expanduser()
            try:
                resolved = resolved.resolve(strict=True)
            except FileNotFoundError:
                return jsonify({"success": False, "message": "File not found"}), 404

            if not resolved.is_file():
                return jsonify({"success": False, "message": "Path is not a file"}), 400

            if resolved.suffix.lower() not in {".xlsx", ".xls", ".xlsm"}:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "Only Excel export files are supported for open-folder",
                        }
                    ),
                    400,
                )
            if not _is_safe_export_path(resolved, manager):
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": (
                                "File path is outside allowed export scope. "
                                "Only generated coordinates export files are allowed."
                            ),
                        }
                    ),
                    403,
                )

            folder = resolved.parent
            if not folder.exists():
                return jsonify({"success": False, "message": "Export folder not found"}), 404

            if os.name != "nt" or not hasattr(os, "startfile"):
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "Open-folder action is only available on Windows",
                        }
                    ),
                    501,
                )

            os.startfile(str(folder))
            return jsonify({"success": True, "message": f"Opened: {folder}"})
        except Exception as exc:
            return (
                jsonify({"success": False, "message": f"Could not open folder: {exc}"}),
                500,
            )

    @bp.route("/conduit-route/terminal-scan", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("240 per hour")
    def api_conduit_route_terminal_scan():
        """
        Scan terminal-strip blocks from AutoCAD and return normalized layout data
        for the Conduit Route terminal workflow UI.
        """
        manager = get_manager()
        status = manager.get_status()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")

        if not status.get("drawing_open"):
            logger.warning(
                "Terminal scan blocked: no drawing open (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "AUTOCAD_DRAWING_NOT_OPEN",
                        "message": "No drawing open in AutoCAD.",
                    }
                ),
                503,
            )

        if pythoncom is None:
            logger.warning(
                "Terminal scan blocked: COM unavailable (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "COM_UNAVAILABLE",
                        "message": "AutoCAD COM bridge unavailable on this platform.",
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) or {}
        selection_only = bool(
            payload.get("selectionOnly")
            if "selectionOnly" in payload
            else payload.get("selection_only", False)
        )
        include_modelspace = bool(
            payload.get("includeModelspace")
            if "includeModelspace" in payload
            else payload.get("include_modelspace", True)
        )
        max_entities_raw = payload.get("maxEntities", payload.get("max_entities", 50000))
        try:
            max_entities = int(max_entities_raw)
        except Exception:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "maxEntities must be an integer.",
                    }
                ),
                400,
            )
        max_entities = max(500, min(200000, max_entities))

        logger.info(
            "Terminal scan request received (remote=%s, auth_mode=%s, selection_only=%s, include_modelspace=%s, max_entities=%s)",
            remote_addr,
            auth_mode,
            selection_only,
            include_modelspace,
            max_entities,
        )

        started_at = time.time()
        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "AUTOCAD_CONNECT_FAILED",
                            "message": "Cannot connect to AutoCAD.",
                        }
                    ),
                    503,
                )

            doc = dyn(acad.ActiveDocument)
            modelspace = dyn(doc.ModelSpace)
            if doc is None or modelspace is None:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "AUTOCAD_DOCUMENT_UNAVAILABLE",
                            "message": "Cannot access ActiveDocument or ModelSpace.",
                        }
                    ),
                    503,
                )

            result = scan_terminal_strips(
                doc=doc,
                modelspace=modelspace,
                dyn_fn=dyn,
                include_modelspace=include_modelspace,
                selection_only=selection_only,
                max_entities=max_entities,
            )
            elapsed_ms = int((time.time() - started_at) * 1000)
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "scanMs": elapsed_ms,
                "source": "autocad",
            }

            if result.get("success"):
                logger.info(
                    "Terminal scan success (remote=%s, panels=%s, strips=%s, terminals=%s, elapsed_ms=%s)",
                    remote_addr,
                    result["meta"].get("totalPanels"),
                    result["meta"].get("totalStrips"),
                    result["meta"].get("totalTerminals"),
                    elapsed_ms,
                )
                return jsonify(result), 200

            logger.warning(
                "Terminal scan found no strips (remote=%s, scanned_entities=%s, block_refs=%s, elapsed_ms=%s)",
                remote_addr,
                result["meta"].get("scannedEntities"),
                result["meta"].get("scannedBlockReferences"),
                elapsed_ms,
            )
            # Return 200 for empty scans so UI can render diagnostics cleanly.
            return jsonify(result), 200
        except Exception as exc:
            logger.exception(
                "Terminal scan failed (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "TERMINAL_SCAN_FAILED",
                        "message": f"Terminal scan failed: {str(exc)}",
                    }
                ),
                500,
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    @bp.route("/conduit-route/route/compute", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("1800 per hour")
    def api_conduit_route_route_compute():
        """Compute a conduit route path for yard-routing workflow requests."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")

        if not request.is_json:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "Expected application/json payload.",
                    }
                ),
                400,
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "Request payload must be a JSON object.",
                    }
                ),
                400,
            )

        obstacle_source = str(payload.get("obstacleSource", "client") or "client").strip().lower()
        if obstacle_source not in {"client", "autocad"}:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "obstacleSource must be 'client' or 'autocad'.",
                    }
                ),
                400,
            )

        resolved_payload = dict(payload)
        obstacle_scan_result: Dict[str, Any] | None = None
        obstacle_scan_elapsed_ms: int | None = None

        if obstacle_source == "autocad":
            manager = get_manager()
            status = manager.get_status()
            if not status.get("drawing_open"):
                logger.warning(
                    "Conduit route compute blocked: no drawing open (remote=%s, auth_mode=%s)",
                    remote_addr,
                    auth_mode,
                )
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "AUTOCAD_DRAWING_NOT_OPEN",
                            "message": "No drawing open in AutoCAD.",
                        }
                    ),
                    503,
                )
            if pythoncom is None:
                logger.warning(
                    "Conduit route compute blocked: COM unavailable (remote=%s, auth_mode=%s)",
                    remote_addr,
                    auth_mode,
                )
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "COM_UNAVAILABLE",
                            "message": "AutoCAD COM bridge unavailable on this platform.",
                        }
                    ),
                    503,
                )

            scan_config = payload.get("obstacleScan")
            if not isinstance(scan_config, dict):
                scan_config = {}

            selection_only = bool(
                scan_config.get("selectionOnly")
                if "selectionOnly" in scan_config
                else scan_config.get("selection_only", False)
            )
            include_modelspace = bool(
                scan_config.get("includeModelspace")
                if "includeModelspace" in scan_config
                else scan_config.get("include_modelspace", True)
            )
            max_entities_raw = scan_config.get(
                "maxEntities",
                scan_config.get("max_entities", 50000),
            )
            try:
                max_entities = int(max_entities_raw)
            except Exception:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "obstacleScan.maxEntities must be an integer.",
                        }
                    ),
                    400,
                )
            max_entities = max(500, min(200000, max_entities))

            canvas_width_raw = payload.get("canvasWidth", 980)
            canvas_height_raw = payload.get("canvasHeight", 560)
            try:
                canvas_width = max(120.0, float(canvas_width_raw))
                canvas_height = max(120.0, float(canvas_height_raw))
            except Exception:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "canvasWidth/canvasHeight must be numbers.",
                        }
                    ),
                    400,
                )

            layer_names_raw = scan_config.get("layerNames")
            layer_names: list[str] = []
            if isinstance(layer_names_raw, list):
                layer_names = [str(layer).strip() for layer in layer_names_raw if str(layer).strip()]
            layer_type_overrides_raw = scan_config.get("layerTypeOverrides")
            layer_type_overrides: Dict[str, Any] = (
                layer_type_overrides_raw if isinstance(layer_type_overrides_raw, dict) else {}
            )

            try:
                scan_started_at = time.time()
                pythoncom.CoInitialize()
                acad = connect_autocad()
                if acad is None:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "code": "AUTOCAD_CONNECT_FAILED",
                                "message": "Cannot connect to AutoCAD.",
                            }
                        ),
                        503,
                    )

                doc = dyn(acad.ActiveDocument)
                modelspace = dyn(doc.ModelSpace)
                if doc is None or modelspace is None:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "code": "AUTOCAD_DOCUMENT_UNAVAILABLE",
                                "message": "Cannot access ActiveDocument or ModelSpace.",
                            }
                        ),
                        503,
                    )

                obstacle_scan_result = scan_conduit_obstacles(
                    doc=doc,
                    modelspace=modelspace,
                    dyn_fn=dyn,
                    entity_bbox_fn=lambda ent: entity_bbox(ent, dyn_fn=dyn),
                    include_modelspace=include_modelspace,
                    selection_only=selection_only,
                    max_entities=max_entities,
                    canvas_width=canvas_width,
                    canvas_height=canvas_height,
                    layer_names=layer_names,
                    layer_type_overrides=layer_type_overrides,
                )
                obstacle_scan_elapsed_ms = int((time.time() - scan_started_at) * 1000)
                resolved_payload["obstacles"] = (
                    obstacle_scan_result.get("data", {}).get("obstacles", [])
                    if obstacle_scan_result
                    else []
                )
            finally:
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        started_at = time.time()
        try:
            result = compute_conduit_route(resolved_payload)
            elapsed_ms = int((time.time() - started_at) * 1000)

            merged_warnings: list[str] = []
            if obstacle_scan_result:
                merged_warnings.extend(obstacle_scan_result.get("warnings", []) or [])
                if not obstacle_scan_result.get("success"):
                    merged_warnings.append(obstacle_scan_result.get("message", "No AutoCAD obstacles found."))
            merged_warnings.extend(result.get("warnings", []) or [])
            if merged_warnings:
                # Keep warning order but drop duplicates.
                result["warnings"] = list(dict.fromkeys(str(entry) for entry in merged_warnings if str(entry).strip()))

            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "requestMs": elapsed_ms,
                "source": "backend",
                "obstacleSource": obstacle_source,
                "obstacleScanMs": obstacle_scan_elapsed_ms,
                "resolvedObstacleCount": len((resolved_payload.get("obstacles") or [])),
            }

            if obstacle_scan_result:
                result["meta"]["obstacleScan"] = obstacle_scan_result.get("meta", {})
                if isinstance(result.get("data"), dict):
                    result["data"]["resolvedObstacles"] = obstacle_scan_result.get("data", {}).get(
                        "obstacles",
                        [],
                    )
                    result["data"]["obstacleViewport"] = obstacle_scan_result.get("data", {}).get(
                        "viewport",
                        {},
                    )

            if result.get("success"):
                logger.info(
                    "Conduit route compute success (remote=%s, auth_mode=%s, obstacle_source=%s, obstacle_count=%s, path_points=%s, bends=%s, fallback=%s, elapsed_ms=%s)",
                    remote_addr,
                    auth_mode,
                    obstacle_source,
                    result["meta"].get("resolvedObstacleCount"),
                    len((result.get("data") or {}).get("path", [])),
                    (result.get("data") or {}).get("bendCount"),
                    (result.get("meta") or {}).get("fallbackUsed"),
                    elapsed_ms,
                )
                return jsonify(result), 200

            logger.warning(
                "Conduit route compute rejected (remote=%s, auth_mode=%s, code=%s, message=%s)",
                remote_addr,
                auth_mode,
                result.get("code"),
                result.get("message"),
            )
            status_code = 400 if result.get("code") == "INVALID_REQUEST" else 422
            return jsonify(result), status_code
        except Exception:
            logger.exception(
                "Conduit route compute failed (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "ROUTE_COMPUTE_FAILED",
                        "message": "Conduit route computation failed unexpectedly.",
                    }
                ),
                500,
            )

    @bp.route("/conduit-route/obstacles/scan", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("240 per hour")
    def api_conduit_route_obstacles_scan():
        """Scan and normalize route obstacles from AutoCAD drawing layers."""
        manager = get_manager()
        status = manager.get_status()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")

        if not status.get("drawing_open"):
            logger.warning(
                "Conduit obstacle scan blocked: no drawing open (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "AUTOCAD_DRAWING_NOT_OPEN",
                        "message": "No drawing open in AutoCAD.",
                    }
                ),
                503,
            )
        if pythoncom is None:
            logger.warning(
                "Conduit obstacle scan blocked: COM unavailable (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "COM_UNAVAILABLE",
                        "message": "AutoCAD COM bridge unavailable on this platform.",
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) or {}

        selection_only = bool(
            payload.get("selectionOnly")
            if "selectionOnly" in payload
            else payload.get("selection_only", False)
        )
        include_modelspace = bool(
            payload.get("includeModelspace")
            if "includeModelspace" in payload
            else payload.get("include_modelspace", True)
        )

        max_entities_raw = payload.get("maxEntities", payload.get("max_entities", 50000))
        try:
            max_entities = int(max_entities_raw)
        except Exception:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "maxEntities must be an integer.",
                    }
                ),
                400,
            )
        max_entities = max(500, min(200000, max_entities))

        canvas_width_raw = payload.get("canvasWidth", 980)
        canvas_height_raw = payload.get("canvasHeight", 560)
        try:
            canvas_width = max(120.0, float(canvas_width_raw))
            canvas_height = max(120.0, float(canvas_height_raw))
        except Exception:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "canvasWidth/canvasHeight must be numbers.",
                    }
                ),
                400,
            )

        layer_names_raw = payload.get("layerNames")
        layer_names: list[str] = []
        if isinstance(layer_names_raw, list):
            layer_names = [str(layer).strip() for layer in layer_names_raw if str(layer).strip()]
        layer_type_overrides_raw = payload.get("layerTypeOverrides")
        layer_type_overrides: Dict[str, Any] = (
            layer_type_overrides_raw if isinstance(layer_type_overrides_raw, dict) else {}
        )

        logger.info(
            "Conduit obstacle scan request (remote=%s, auth_mode=%s, selection_only=%s, include_modelspace=%s, max_entities=%s)",
            remote_addr,
            auth_mode,
            selection_only,
            include_modelspace,
            max_entities,
        )

        started_at = time.time()
        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "AUTOCAD_CONNECT_FAILED",
                            "message": "Cannot connect to AutoCAD.",
                        }
                    ),
                    503,
                )

            doc = dyn(acad.ActiveDocument)
            modelspace = dyn(doc.ModelSpace)
            if doc is None or modelspace is None:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "AUTOCAD_DOCUMENT_UNAVAILABLE",
                            "message": "Cannot access ActiveDocument or ModelSpace.",
                        }
                    ),
                    503,
                )

            result = scan_conduit_obstacles(
                doc=doc,
                modelspace=modelspace,
                dyn_fn=dyn,
                entity_bbox_fn=lambda ent: entity_bbox(ent, dyn_fn=dyn),
                include_modelspace=include_modelspace,
                selection_only=selection_only,
                max_entities=max_entities,
                canvas_width=canvas_width,
                canvas_height=canvas_height,
                layer_names=layer_names,
                layer_type_overrides=layer_type_overrides,
            )
            elapsed_ms = int((time.time() - started_at) * 1000)
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "scanMs": elapsed_ms,
                "source": "autocad",
            }

            if result.get("success"):
                logger.info(
                    "Conduit obstacle scan success (remote=%s, total_obstacles=%s, elapsed_ms=%s)",
                    remote_addr,
                    result["meta"].get("totalObstacles"),
                    elapsed_ms,
                )
            else:
                logger.warning(
                    "Conduit obstacle scan no data (remote=%s, scanned_entities=%s, elapsed_ms=%s)",
                    remote_addr,
                    result["meta"].get("scannedEntities"),
                    elapsed_ms,
                )
            return jsonify(result), 200
        except Exception as exc:
            logger.exception(
                "Conduit obstacle scan failed (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "OBSTACLE_SCAN_FAILED",
                        "message": f"Conduit obstacle scan failed: {str(exc)}",
                    }
                ),
                500,
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    @bp.route("/autocad/ws-ticket", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("1200 per hour")
    def api_autocad_ws_ticket():
        """Issue a short-lived one-time websocket ticket for /ws authentication."""
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(user.get("id") or user.get("sub") or "").strip()
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        remote_addr = str(request.remote_addr or "unknown")

        try:
            ticket_payload = issue_ws_ticket(
                user_id=user_id,
                auth_mode=auth_mode,
                remote_addr=remote_addr,
            )
            return jsonify({"ok": True, **ticket_payload}), 200
        except Exception as exc:
            logger.exception("Failed to issue websocket ticket (remote=%s)", remote_addr)
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Failed to issue websocket ticket",
                        "code": "WS_TICKET_ISSUE_FAILED",
                        "message": str(exc),
                    }
                ),
                500,
            )

    return bp
