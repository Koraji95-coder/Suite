from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable, Dict
import os

from flask import Blueprint, jsonify, request, send_file
from flask_limiter import Limiter


def create_autocad_blueprint(
    *,
    require_api_key: Callable,
    limiter: Limiter,
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
    @require_api_key
    def api_status():
        """Health check endpoint with AutoCAD connection details."""
        manager = get_manager()
        status = manager.get_status()
        status["backend_id"] = "coordinates-grabber-api"
        status["backend_version"] = "1.0.0"

        http_code = 200 if status.get("autocad_running") else 503
        return jsonify(status), http_code

    @bp.route("/layers", methods=["GET"])
    @require_api_key
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
    @require_api_key
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
    @require_api_key
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
    @require_api_key
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
    @require_api_key
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
    @require_api_key
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
    @require_api_key
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

    return bp
