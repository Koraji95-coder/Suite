from __future__ import annotations

import time
from typing import Any, Callable, Dict

from flask import Blueprint, jsonify, request
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

            started_at = time.time()
            result = manager.execute_layer_search(config)
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

    return bp
