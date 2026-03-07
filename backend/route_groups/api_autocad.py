from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
import os

from flask import Blueprint, g, jsonify, request, send_file
from flask_limiter import Limiter
from .api_autocad_terminal_scan import scan_terminal_strips
from .api_conduit_route_compute import compute_conduit_route
from .api_conduit_route_obstacle_scan import scan_conduit_obstacles
from .api_autocad_entity_geometry import entity_bbox
from .api_autocad_terminal_route_plot import canonicalize_route_for_sync


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
    conduit_route_autocad_provider: str,
    send_autocad_dotnet_command: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]],
    validate_layer_config: Callable[[Any], Dict[str, Any]],
    traceback_module: Any,
) -> Blueprint:
    """Create AutoCAD backend route group blueprint under /api."""
    bp = Blueprint("autocad_api", __name__, url_prefix="/api")
    backend_exports_dir = Path(__file__).resolve().parents[1] / "exports"
    repo_root_dir = Path(__file__).resolve().parents[2]
    etap_plugin_relative_candidates = (
        Path("src/components/apps/dxfer/bin/Debug/net8.0-windows/EtapDxfCleanup.dll"),
        Path("src/components/apps/dxfer/bin/Release/net8.0-windows/EtapDxfCleanup.dll"),
        Path("src/components/apps/dxfer/bin/Debug/net48/EtapDxfCleanup.dll"),
        Path("src/components/apps/dxfer/bin/Release/net48/EtapDxfCleanup.dll"),
    )

    def _is_under_dir(path_value: Path, root_dir: Path) -> bool:
        try:
            path_value.relative_to(root_dir)
            return True
        except Exception:
            return False

    def _resolve_default_etap_plugin_dll_path() -> str:
        env_path_raw = str(os.getenv("AUTOCAD_ETAP_PLUGIN_DLL_PATH", "") or "").strip().strip('"')
        if env_path_raw:
            try:
                env_path = Path(env_path_raw).expanduser().resolve()
            except Exception:
                env_path = Path(env_path_raw)
            if env_path.is_file():
                return str(env_path)

        for relative_candidate in etap_plugin_relative_candidates:
            candidate_path = (repo_root_dir / relative_candidate).resolve()
            if candidate_path.is_file():
                return str(candidate_path)

        return ""

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

    def _normalize_conduit_provider(raw_value: str) -> str:
        normalized = str(raw_value or "").strip().lower().replace("-", "_")
        provider_aliases = {
            "": "com",
            "com": "com",
            "dotnet": "dotnet",
            "net": "dotnet",
            ".net": "dotnet",
            "dotnet_fallback_com": "dotnet_fallback_com",
            "dotnet_with_com_fallback": "dotnet_fallback_com",
            "dotnet_fallback": "dotnet_fallback_com",
            "dotnet_com_fallback": "dotnet_fallback_com",
        }
        resolved = provider_aliases.get(normalized)
        if resolved is not None:
            return resolved
        logger.warning(
            "Unknown CONDUIT_ROUTE_AUTOCAD_PROVIDER=%s; defaulting to COM provider.",
            raw_value,
        )
        return "com"

    conduit_provider = _normalize_conduit_provider(conduit_route_autocad_provider)
    conduit_dotnet_enabled = conduit_provider in {"dotnet", "dotnet_fallback_com"}
    conduit_allow_com_fallback = conduit_provider == "dotnet_fallback_com"
    valid_obstacle_types = {
        "foundation",
        "building",
        "equipment_pad",
        "trench",
        "fence",
        "road",
    }
    conduit_layer_presets: Dict[str, Dict[str, Any]] = {
        "substation_default": {
            "label": "Substation Default",
            "description": "Typical substation yard foundation/pad/trench/road/fence layers.",
            "layerNames": [
                "S-FNDN-PRIMARY",
                "S-FNDN-SECONDARY",
                "S-CONC-PAD",
                "E-TRENCH",
                "C-ROAD",
                "S-FENCE",
                "A-BLDG",
                "A-WALL",
            ],
            "layerTypeOverrides": {
                "S-FNDN-PRIMARY": "foundation",
                "S-FNDN-SECONDARY": "foundation",
                "S-CONC-PAD": "equipment_pad",
                "E-TRENCH": "trench",
                "C-ROAD": "road",
                "S-FENCE": "fence",
                "A-BLDG": "building",
                "A-WALL": "building",
            },
        },
        "industrial_plant": {
            "label": "Industrial Plant",
            "description": "Plant area layers for slabs, trenches, roadways, and process structures.",
            "layerNames": [
                "P-FOUND",
                "P-PAD",
                "P-TRENCH",
                "P-ROAD",
                "P-FENCE",
                "P-BLDG",
            ],
            "layerTypeOverrides": {
                "P-FOUND": "foundation",
                "P-PAD": "equipment_pad",
                "P-TRENCH": "trench",
                "P-ROAD": "road",
                "P-FENCE": "fence",
                "P-BLDG": "building",
            },
        },
        "utility_yard": {
            "label": "Utility Yard",
            "description": "Utility yard layers for equipment pads, trenches, roads, and perimeter zones.",
            "layerNames": [
                "U-FOUND",
                "U-PAD",
                "U-TRENCH",
                "U-ROAD",
                "U-FENCE",
                "U-BLDG",
            ],
            "layerTypeOverrides": {
                "U-FOUND": "foundation",
                "U-PAD": "equipment_pad",
                "U-TRENCH": "trench",
                "U-ROAD": "road",
                "U-FENCE": "fence",
                "U-BLDG": "building",
            },
        },
    }
    conduit_layer_preset_aliases = {
        "substation": "substation_default",
        "default": "substation_default",
        "plant": "industrial_plant",
        "industrial": "industrial_plant",
        "yard": "utility_yard",
        "utility": "utility_yard",
    }

    logger.info(
        "Conduit route AutoCAD provider initialized (provider=%s, dotnet_enabled=%s, com_fallback=%s, dotnet_sender_ready=%s)",
        conduit_provider,
        conduit_dotnet_enabled,
        conduit_allow_com_fallback,
        bool(send_autocad_dotnet_command),
    )

    def _normalize_layer_names(raw_value: Any) -> list[str]:
        if not isinstance(raw_value, list):
            return []
        seen: set[str] = set()
        out: list[str] = []
        for item in raw_value:
            text = str(item).strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(text)
        return out

    def _normalize_layer_type_overrides(raw_value: Any) -> Dict[str, str]:
        if not isinstance(raw_value, dict):
            return {}
        out: Dict[str, str] = {}
        for raw_layer_name, raw_obstacle_type in raw_value.items():
            layer_name = str(raw_layer_name).strip()
            obstacle_type = str(raw_obstacle_type).strip().lower()
            if not layer_name or obstacle_type not in valid_obstacle_types:
                continue
            out[layer_name] = obstacle_type
        return out

    def _normalize_terminal_profile_tag_list(raw_value: Any) -> list[str]:
        if not isinstance(raw_value, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for item in raw_value:
            key = str(item).strip().upper()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(key)
        return out

    def _normalize_terminal_profile_bool(raw_value: Any, *, fallback: bool = False) -> bool:
        if isinstance(raw_value, bool):
            return raw_value
        if isinstance(raw_value, (int, float)):
            return bool(raw_value)
        text = str(raw_value or "").strip().lower()
        if text in {"1", "true", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "no", "n", "off"}:
            return False
        return fallback

    def _normalize_terminal_profile(raw_value: Any) -> Dict[str, Any]:
        if not isinstance(raw_value, dict):
            return {}

        profile: Dict[str, Any] = {}
        list_fields = (
            "panelIdKeys",
            "panelNameKeys",
            "sideKeys",
            "stripIdKeys",
            "stripNumberKeys",
            "terminalCountKeys",
            "terminalTagKeys",
            "terminalNameTokens",
            "blockNameAllowList",
        )
        for field_name in list_fields:
            normalized = _normalize_terminal_profile_tag_list(raw_value.get(field_name))
            if normalized:
                profile[field_name] = normalized

        default_panel_prefix = str(
            raw_value.get("defaultPanelPrefix", raw_value.get("default_panel_prefix", ""))
        ).strip()
        if default_panel_prefix:
            profile["defaultPanelPrefix"] = default_panel_prefix.upper()

        default_terminal_count_raw = raw_value.get(
            "defaultTerminalCount",
            raw_value.get("default_terminal_count"),
        )
        if default_terminal_count_raw is not None:
            try:
                default_terminal_count = int(default_terminal_count_raw)
            except Exception:
                default_terminal_count = 0
            if default_terminal_count > 0:
                profile["defaultTerminalCount"] = max(1, min(2000, default_terminal_count))

        profile["requireStripId"] = _normalize_terminal_profile_bool(
            raw_value.get("requireStripId", raw_value.get("require_strip_id", False)),
            fallback=False,
        )
        profile["requireTerminalCount"] = _normalize_terminal_profile_bool(
            raw_value.get("requireTerminalCount", raw_value.get("require_terminal_count", False)),
            fallback=False,
        )
        profile["requireSide"] = _normalize_terminal_profile_bool(
            raw_value.get("requireSide", raw_value.get("require_side", False)),
            fallback=False,
        )

        return profile

    def _normalize_layer_preset_name(raw_value: Any) -> str:
        normalized = str(raw_value or "").strip().lower().replace("-", "_")
        if normalized in {"", "none", "manual", "off"}:
            return ""
        return conduit_layer_preset_aliases.get(normalized, normalized)

    def _resolve_obstacle_layer_rules(
        *,
        raw_layer_names: Any,
        raw_layer_type_overrides: Any,
        raw_layer_preset: Any,
    ) -> tuple[list[str], Dict[str, str], Dict[str, Any]]:
        explicit_layer_names = _normalize_layer_names(raw_layer_names)
        explicit_layer_type_overrides = _normalize_layer_type_overrides(raw_layer_type_overrides)
        requested_preset = str(raw_layer_preset or "").strip()
        normalized_preset = _normalize_layer_preset_name(raw_layer_preset)
        preset_config = conduit_layer_presets.get(normalized_preset) if normalized_preset else None
        if normalized_preset and preset_config is None:
            logger.warning(
                "Unknown conduit layer preset requested: %s",
                raw_layer_preset,
            )

        merged_layer_names: list[str] = []
        seen_layers: set[str] = set()

        def _append_layer(layer_name: str) -> None:
            text = str(layer_name).strip()
            if not text:
                return
            key = text.lower()
            if key in seen_layers:
                return
            seen_layers.add(key)
            merged_layer_names.append(text)

        if preset_config:
            for layer_name in preset_config.get("layerNames", []):
                _append_layer(layer_name)
        for layer_name in explicit_layer_names:
            _append_layer(layer_name)

        merged_layer_type_overrides: Dict[str, str] = {}
        if preset_config:
            merged_layer_type_overrides.update(
                _normalize_layer_type_overrides(preset_config.get("layerTypeOverrides", {}))
            )
        merged_layer_type_overrides.update(explicit_layer_type_overrides)
        for layer_name in merged_layer_type_overrides.keys():
            _append_layer(layer_name)

        preset_meta: Dict[str, Any] = {
            "requestedPreset": requested_preset,
            "appliedPreset": normalized_preset if preset_config else "",
            "availablePresets": sorted(conduit_layer_presets.keys()),
            "explicitLayerCount": len(explicit_layer_names),
            "explicitOverrideCount": len(explicit_layer_type_overrides),
            "layerCount": len(merged_layer_names),
            "overrideCount": len(merged_layer_type_overrides),
            "presetApplied": bool(preset_config),
        }
        if preset_config:
            preset_meta["presetLabel"] = str(preset_config.get("label") or normalized_preset)
            preset_meta["presetDescription"] = str(preset_config.get("description") or "")

        return merged_layer_names, merged_layer_type_overrides, preset_meta

    def _request_correlation_id() -> str:
        raw_value = str(request.headers.get("X-Request-ID") or "").strip()
        if raw_value:
            return raw_value[:128]
        return f"req-{int(time.time() * 1000)}"

    def _call_dotnet_bridge_action(
        *,
        action: str,
        payload: Dict[str, Any],
        remote_addr: str,
        auth_mode: str,
        request_id: str,
    ) -> Dict[str, Any]:
        if send_autocad_dotnet_command is None:
            raise RuntimeError(
                "AutoCAD .NET command sender is not configured. "
                "Set CONDUIT_ROUTE_AUTOCAD_PROVIDER=com or configure AUTOCAD_DOTNET_* backend settings."
            )

        started_at = time.time()
        response = send_autocad_dotnet_command(
            action,
            {
                **payload,
                "requestId": request_id,
            },
        )
        elapsed_ms = int((time.time() - started_at) * 1000)

        if not isinstance(response, dict):
            raise RuntimeError("Malformed response from .NET bridge (expected JSON object).")

        if not response.get("ok"):
            error_message = str(
                response.get("error")
                or response.get("message")
                or "Unknown .NET bridge error."
            )
            raise RuntimeError(error_message)

        result_payload = response.get("result")
        if not isinstance(result_payload, dict):
            raise RuntimeError(".NET bridge returned invalid 'result' payload.")

        if not isinstance(result_payload.get("success"), bool):
            raise RuntimeError(".NET bridge result missing boolean 'success' field.")

        result_payload["meta"] = {
            **(result_payload.get("meta", {}) or {}),
            "bridgeMs": elapsed_ms,
            "source": "dotnet",
            "requestId": request_id,
            "bridgeRequestId": str(response.get("id") or ""),
        }
        logger.info(
            ".NET bridge action succeeded (request_id=%s, action=%s, remote=%s, auth_mode=%s, elapsed_ms=%s)",
            request_id,
            action,
            remote_addr,
            auth_mode,
            elapsed_ms,
        )
        return result_payload

    @bp.route("/status", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("3600 per hour")
    def api_status():
        """Health check endpoint with AutoCAD connection details."""
        manager = get_manager()
        status = manager.get_status()
        status["backend_id"] = "coordinates-grabber-api"
        status["backend_version"] = "1.0.0"
        status["conduit_route_provider"] = {
            "configured": conduit_provider,
            "dotnet_enabled": conduit_dotnet_enabled,
            "com_fallback": conduit_allow_com_fallback,
            "dotnet_sender_ready": bool(send_autocad_dotnet_command),
        }

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

    @bp.route("/conduit-route/obstacles/presets", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("600 per hour")
    def api_conduit_route_obstacle_presets():
        """Return built-in obstacle layer presets for project templates."""
        presets = []
        for preset_id in sorted(conduit_layer_presets.keys()):
            preset = conduit_layer_presets.get(preset_id, {})
            layer_names = _normalize_layer_names(preset.get("layerNames"))
            overrides = _normalize_layer_type_overrides(preset.get("layerTypeOverrides"))
            presets.append(
                {
                    "id": preset_id,
                    "label": str(preset.get("label") or preset_id),
                    "description": str(preset.get("description") or ""),
                    "layerNames": layer_names,
                    "layerTypeOverrides": overrides,
                }
            )

        return jsonify(
            {
                "success": True,
                "count": len(presets),
                "presets": presets,
                "aliases": dict(sorted(conduit_layer_preset_aliases.items())),
            }
        )

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
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

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
        terminal_profile = _normalize_terminal_profile(
            payload.get("terminalProfile", payload.get("terminal_profile"))
        )

        logger.info(
            "Terminal scan request received (request_id=%s, remote=%s, auth_mode=%s, provider=%s, selection_only=%s, include_modelspace=%s, max_entities=%s, terminal_profile_fields=%s)",
            request_id,
            remote_addr,
            auth_mode,
            conduit_provider,
            selection_only,
            include_modelspace,
            max_entities,
            sorted(terminal_profile.keys()),
        )

        if conduit_dotnet_enabled:
            dotnet_payload = {
                "selectionOnly": selection_only,
                "includeModelspace": include_modelspace,
                "maxEntities": max_entities,
                "terminalProfile": terminal_profile,
            }
            try:
                result = _call_dotnet_bridge_action(
                    action="conduit_route_terminal_scan",
                    payload=dotnet_payload,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                    request_id=request_id,
                )
                return jsonify(result), 200
            except Exception as exc:
                logger.warning(
                    "Terminal scan .NET provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "code": "DOTNET_BRIDGE_FAILED",
                                "message": f".NET terminal scan failed: {str(exc)}",
                            }
                        ),
                        503,
                    )

        manager = get_manager()
        status = manager.get_status()
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
                terminal_profile=terminal_profile,
            )
            elapsed_ms = int((time.time() - started_at) * 1000)
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "scanMs": elapsed_ms,
                "source": "autocad",
                "requestId": request_id,
                "terminalProfileRequest": terminal_profile,
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
        request_id = _request_correlation_id()

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
        layer_rules_meta: Dict[str, Any] = {}

        if obstacle_source == "autocad":
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

            layer_names, layer_type_overrides, layer_rules_meta = _resolve_obstacle_layer_rules(
                raw_layer_names=scan_config.get("layerNames"),
                raw_layer_type_overrides=scan_config.get("layerTypeOverrides"),
                raw_layer_preset=scan_config.get("layerPreset", scan_config.get("layer_preset", "")),
            )

            if conduit_dotnet_enabled:
                dotnet_payload = {
                    "selectionOnly": selection_only,
                    "includeModelspace": include_modelspace,
                    "maxEntities": max_entities,
                    "canvasWidth": canvas_width,
                    "canvasHeight": canvas_height,
                    "layerNames": layer_names,
                    "layerTypeOverrides": layer_type_overrides,
                    "layerPreset": layer_rules_meta.get("appliedPreset") or "",
                }
                try:
                    obstacle_scan_result = _call_dotnet_bridge_action(
                        action="conduit_route_obstacle_scan",
                        payload=dotnet_payload,
                        remote_addr=remote_addr,
                        auth_mode=auth_mode,
                        request_id=request_id,
                    )
                    dotnet_meta = obstacle_scan_result.get("meta", {}) if obstacle_scan_result else {}
                    scan_ms_candidate = (
                        dotnet_meta.get("scanMs")
                        if isinstance(dotnet_meta, dict)
                        else None
                    )
                    if scan_ms_candidate is None and isinstance(dotnet_meta, dict):
                        scan_ms_candidate = dotnet_meta.get("bridgeMs")
                    try:
                        obstacle_scan_elapsed_ms = int(scan_ms_candidate) if scan_ms_candidate is not None else None
                    except Exception:
                        obstacle_scan_elapsed_ms = None
                    obstacle_scan_result["meta"] = {
                        **(obstacle_scan_result.get("meta", {}) or {}),
                        "layerPreset": layer_rules_meta.get("appliedPreset") or "",
                        "layerRuleSummary": layer_rules_meta,
                    }
                    resolved_payload["obstacles"] = (
                        obstacle_scan_result.get("data", {}).get("obstacles", [])
                        if obstacle_scan_result
                        else []
                    )
                except Exception as exc:
                    logger.warning(
                        "Conduit route compute .NET obstacle scan failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                        request_id,
                        remote_addr,
                        auth_mode,
                        conduit_provider,
                        conduit_allow_com_fallback,
                        str(exc),
                    )
                    if not conduit_allow_com_fallback:
                        return (
                            jsonify(
                                {
                                    "success": False,
                                    "code": "DOTNET_BRIDGE_FAILED",
                                    "message": f".NET obstacle scan failed: {str(exc)}",
                                }
                            ),
                            503,
                        )

            if obstacle_scan_result is None:
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
                "requestId": request_id,
            }
            if obstacle_source == "autocad":
                result["meta"]["obstacleLayerPreset"] = layer_rules_meta.get("appliedPreset") or ""
                result["meta"]["obstacleLayerRuleSummary"] = layer_rules_meta

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

    @bp.route("/conduit-route/terminal-routes/draw", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("600 per hour")
    def api_conduit_route_terminal_routes_draw():
        """Apply terminal route CAD sync operation (upsert/delete/reset)."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

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

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"upsert", "delete", "reset"}:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "operation must be one of: upsert, delete, reset.",
                    }
                ),
                400,
            )

        session_id = str(payload.get("sessionId") or payload.get("session_id") or "").strip()[:128]
        if not session_id:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "sessionId is required.",
                    }
                ),
                400,
            )

        client_route_id = str(
            payload.get("clientRouteId") or payload.get("client_route_id") or ""
        ).strip()[:128]

        default_layer_name = str(payload.get("defaultLayerName") or "SUITE_WIRE_AUTO").strip()
        if not default_layer_name:
            default_layer_name = "SUITE_WIRE_AUTO"
        default_layer_name = default_layer_name[:80]

        annotate_refs = bool(payload.get("annotateRefs", True))
        text_height_raw = payload.get("textHeight", 0.125)
        try:
            text_height = max(0.01, float(text_height_raw))
        except Exception:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "textHeight must be a numeric value.",
                    }
                ),
                400,
            )

        warnings: list[str] = []
        normalized_payload: dict[str, Any] = {
            "operation": operation,
            "sessionId": session_id,
            "defaultLayerName": default_layer_name,
            "annotateRefs": annotate_refs,
            "textHeight": text_height,
        }
        route_candidates = 0

        if operation in {"upsert", "delete"}:
            if not client_route_id:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "clientRouteId is required for upsert/delete operations.",
                        }
                    ),
                    400,
                )
            normalized_payload["clientRouteId"] = client_route_id
            route_candidates = 1

        if operation == "upsert":
            route_payload = payload.get("route")
            if route_payload is None:
                routes_fallback = payload.get("routes")
                if isinstance(routes_fallback, list) and routes_fallback:
                    route_payload = routes_fallback[0]
            if not isinstance(route_payload, dict):
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "route object is required for upsert operation.",
                        }
                    ),
                    400,
                )

            path_raw = route_payload.get("path")
            if not isinstance(path_raw, list):
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "route.path must be an array.",
                        }
                    ),
                    400,
                )

            color_aci: int | None = None
            raw_color_aci = route_payload.get("colorAci")
            if raw_color_aci is not None:
                try:
                    candidate = int(raw_color_aci)
                    if 1 <= candidate <= 255:
                        color_aci = candidate
                except Exception:
                    color_aci = None

            raw_route_for_cad = {
                "ref": str(route_payload.get("ref") or "AUTO-001").strip(),
                "routeType": str(route_payload.get("routeType") or "conductor").strip().lower(),
                "wireFunction": str(route_payload.get("wireFunction") or "").strip(),
                "cableType": str(route_payload.get("cableType") or "").strip().upper(),
                "colorCode": str(route_payload.get("colorCode") or "").strip().upper(),
                "colorAci": color_aci,
                "layerName": str(route_payload.get("layerName") or "").strip()[:80],
                "filletRadius": route_payload.get("filletRadius", route_payload.get("fillet_radius", 0.1)),
                "path": path_raw,
            }
            try:
                normalized_route, canonical_warnings = canonicalize_route_for_sync(
                    raw_route_for_cad,
                    route_index=0,
                )
            except ValueError as exc:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": str(exc),
                        }
                    ),
                    400,
                )
            warnings.extend(canonical_warnings)
            normalized_payload["route"] = normalized_route

        logger.info(
            "Terminal route sync request received (request_id=%s, remote=%s, auth_mode=%s, provider=%s, operation=%s, session_id=%s, client_route_id=%s, route_candidates=%s, annotate_refs=%s, default_layer=%s)",
            request_id,
            remote_addr,
            auth_mode,
            conduit_provider,
            operation,
            session_id,
            client_route_id,
            route_candidates,
            annotate_refs,
            default_layer_name,
        )

        provider_path = "com"
        if conduit_dotnet_enabled:
            try:
                result = _call_dotnet_bridge_action(
                    action="conduit_route_terminal_routes_draw",
                    payload=normalized_payload,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                    request_id=request_id,
                )
                merged_warnings: list[str] = []
                merged_warnings.extend(result.get("warnings", []) or [])
                merged_warnings.extend(warnings)
                if merged_warnings:
                    result["warnings"] = list(
                        dict.fromkeys(str(entry) for entry in merged_warnings if str(entry).strip())
                    )
                result["meta"] = {
                    **(result.get("meta", {}) or {}),
                    "operation": operation,
                    "sessionId": session_id,
                    "clientRouteId": client_route_id,
                    "routeCandidates": route_candidates,
                    "providerPath": "dotnet",
                    "providerConfigured": conduit_provider,
                }
                if result.get("success"):
                    return jsonify(result), 200
                status_code = 400 if result.get("code") == "INVALID_REQUEST" else 422
                return jsonify(result), status_code
            except Exception as exc:
                logger.warning(
                    "Terminal route draw .NET provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "code": "DOTNET_BRIDGE_FAILED",
                                "message": f".NET terminal route draw failed: {str(exc)}",
                                "meta": {
                                    "source": "dotnet",
                                    "requestId": request_id,
                                    "operation": operation,
                                    "sessionId": session_id,
                                    "clientRouteId": client_route_id,
                                    "providerPath": "dotnet",
                                    "providerConfigured": conduit_provider,
                                },
                            }
                        ),
                        503,
                    )
                provider_path = "com_fallback"

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
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

        started_at = time.time()
        try:
            result = manager.plot_terminal_routes(normalized_payload)
            elapsed_ms = int((time.time() - started_at) * 1000)
            merged_warnings: list[str] = []
            merged_warnings.extend(result.get("warnings", []) or [])
            merged_warnings.extend(warnings)
            if merged_warnings:
                result["warnings"] = list(
                    dict.fromkeys(str(entry) for entry in merged_warnings if str(entry).strip())
                )
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "source": "autocad",
                "drawMs": elapsed_ms,
                "requestId": request_id,
                "operation": operation,
                "sessionId": session_id,
                "clientRouteId": client_route_id,
                "routeCandidates": route_candidates,
                "providerPath": provider_path,
                "providerConfigured": conduit_provider,
            }
            if result.get("success"):
                return jsonify(result), 200
            status_code = 400 if result.get("code") == "INVALID_REQUEST" else 422
            return jsonify(result), status_code
        except Exception as exc:
            logger.exception(
                "Terminal route draw failed (request_id=%s, remote=%s, auth_mode=%s)",
                request_id,
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "TERMINAL_ROUTE_DRAW_FAILED",
                        "message": f"Terminal route draw failed: {str(exc)}",
                    }
                ),
                500,
            )

    @bp.route("/etap/cleanup/run", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("300 per hour")
    def api_etap_cleanup_run():
        """
        Queue ETAP DXF cleanup command execution through the local .NET bridge.

        This endpoint is intended for in-app orchestration of AutoCAD-hosted ETAP cleanup commands
        (for example ETAPFIX) with optional plugin NETLOAD and completion wait.
        """
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

        if send_autocad_dotnet_command is None:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "DOTNET_BRIDGE_UNAVAILABLE",
                        "message": "AutoCAD .NET bridge command sender is not configured.",
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) if request.is_json else {}
        if payload is None:
            payload = {}
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

        command = str(payload.get("command") or "ETAPFIX").strip().upper()
        if not command:
            command = "ETAPFIX"

        plugin_dll_path_raw = payload.get("pluginDllPath", payload.get("plugin_dll_path"))
        plugin_dll_path = (
            str(plugin_dll_path_raw).strip()
            if plugin_dll_path_raw is not None
            else ""
        )

        wait_for_completion = _normalize_terminal_profile_bool(
            payload.get("waitForCompletion", payload.get("wait_for_completion", True)),
            fallback=True,
        )
        save_drawing = _normalize_terminal_profile_bool(
            payload.get("saveDrawing", payload.get("save_drawing", False)),
            fallback=False,
        )

        timeout_ms_raw = payload.get("timeoutMs", payload.get("timeout_ms", 90000))
        try:
            timeout_ms = int(timeout_ms_raw)
        except Exception:
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "INVALID_REQUEST",
                        "message": "timeoutMs must be an integer.",
                    }
                ),
                400,
            )
        timeout_ms = max(1000, min(600000, timeout_ms))

        dotnet_payload: Dict[str, Any] = {
            "command": command,
            "waitForCompletion": wait_for_completion,
            "timeoutMs": timeout_ms,
            "saveDrawing": save_drawing,
        }
        resolved_plugin_dll_path = plugin_dll_path or _resolve_default_etap_plugin_dll_path()
        plugin_dll_auto_discovered = bool(resolved_plugin_dll_path and not plugin_dll_path)

        if resolved_plugin_dll_path:
            dotnet_payload["pluginDllPath"] = resolved_plugin_dll_path

        logger.info(
            "ETAP cleanup run request received (request_id=%s, remote=%s, auth_mode=%s, command=%s, wait_for_completion=%s, timeout_ms=%s, plugin_dll_provided=%s, plugin_dll_auto_discovered=%s)",
            request_id,
            remote_addr,
            auth_mode,
            command,
            wait_for_completion,
            timeout_ms,
            bool(plugin_dll_path),
            plugin_dll_auto_discovered,
        )

        try:
            result = _call_dotnet_bridge_action(
                action="etap_dxf_cleanup_run",
                payload=dotnet_payload,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                request_id=request_id,
            )
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "providerPath": "dotnet",
                "providerConfigured": conduit_provider,
                "command": command,
                "waitForCompletion": wait_for_completion,
                "timeoutMs": timeout_ms,
                "pluginDllPath": resolved_plugin_dll_path or "",
                "pluginDllAutoDiscovered": plugin_dll_auto_discovered,
            }
            if result.get("success"):
                return jsonify(result), 200

            code = str(result.get("code") or "").strip().upper()
            if code == "INVALID_REQUEST":
                status_code = 400
            elif code == "PLUGIN_DLL_NOT_FOUND":
                status_code = 404
            elif code == "AUTOCAD_COMMAND_TIMEOUT":
                status_code = 504
            else:
                status_code = 422
            return jsonify(result), status_code
        except Exception as exc:
            logger.warning(
                "ETAP cleanup .NET bridge failed (request_id=%s, remote=%s, auth_mode=%s, error=%s)",
                request_id,
                remote_addr,
                auth_mode,
                str(exc),
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "DOTNET_BRIDGE_FAILED",
                        "message": f".NET ETAP cleanup action failed: {str(exc)}",
                        "meta": {
                            "source": "dotnet",
                            "requestId": request_id,
                            "providerPath": "dotnet",
                            "providerConfigured": conduit_provider,
                        },
                    }
                ),
                503,
            )

    @bp.route("/conduit-route/terminal-labels/sync", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("300 per hour")
    def api_conduit_route_terminal_labels_sync():
        """Sync terminal label attribute values onto scanned strip blocks."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

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
        max_entities = max(100, min(250000, max_entities))

        raw_strips = payload.get("strips")
        normalized_strips: list[dict[str, Any]] = []
        if raw_strips is not None:
            if not isinstance(raw_strips, list):
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "strips must be an array when provided.",
                        }
                    ),
                    400,
                )
            for entry in raw_strips:
                if not isinstance(entry, dict):
                    continue
                strip_id = str(entry.get("stripId") or entry.get("strip_id") or "").strip()
                if not strip_id:
                    continue
                terminal_count_raw = entry.get("terminalCount", entry.get("terminal_count", 12))
                try:
                    terminal_count = int(terminal_count_raw)
                except Exception:
                    terminal_count = 12
                terminal_count = max(1, min(2000, terminal_count))
                labels_raw = entry.get("labels")
                labels = []
                if isinstance(labels_raw, list):
                    labels = [str(value).strip() for value in labels_raw]
                normalized_strips.append(
                    {
                        "stripId": strip_id,
                        "terminalCount": terminal_count,
                        "labels": labels,
                    }
                )
            if raw_strips and not normalized_strips:
                return (
                    jsonify(
                        {
                            "success": False,
                            "code": "INVALID_REQUEST",
                            "message": "No valid strip entries were provided.",
                        }
                    ),
                    400,
                )

        terminal_profile = payload.get("terminalProfile", payload.get("terminal_profile"))
        normalized_payload: dict[str, Any] = {
            "selectionOnly": selection_only,
            "includeModelspace": include_modelspace,
            "maxEntities": max_entities,
            "terminalProfile": terminal_profile,
            "strips": normalized_strips,
        }

        logger.info(
            "Terminal label sync request received (request_id=%s, remote=%s, auth_mode=%s, strips=%s, selection_only=%s, include_modelspace=%s, max_entities=%s)",
            request_id,
            remote_addr,
            auth_mode,
            len(normalized_strips),
            selection_only,
            include_modelspace,
            max_entities,
        )

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
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

        started_at = time.time()
        try:
            result = manager.sync_terminal_labels(normalized_payload)
            elapsed_ms = int((time.time() - started_at) * 1000)
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "source": "autocad",
                "requestId": request_id,
                "requestMs": elapsed_ms,
                "providerPath": "com",
                "providerConfigured": conduit_provider,
                "selectionOnly": selection_only,
                "includeModelspace": include_modelspace,
                "targetStrips": len(normalized_strips),
            }
            if result.get("success"):
                return jsonify(result), 200
            status_code = 400 if result.get("code") == "INVALID_REQUEST" else 422
            return jsonify(result), status_code
        except Exception as exc:
            logger.exception(
                "Terminal label sync failed (request_id=%s, remote=%s, auth_mode=%s)",
                request_id,
                remote_addr,
                auth_mode,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "code": "TERMINAL_LABEL_SYNC_FAILED",
                        "message": f"Terminal label sync failed: {str(exc)}",
                    }
                ),
                500,
            )

    @bp.route("/conduit-route/obstacles/scan", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("240 per hour")
    def api_conduit_route_obstacles_scan():
        """Scan and normalize route obstacles from AutoCAD drawing layers."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

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

        layer_names, layer_type_overrides, layer_rules_meta = _resolve_obstacle_layer_rules(
            raw_layer_names=payload.get("layerNames"),
            raw_layer_type_overrides=payload.get("layerTypeOverrides"),
            raw_layer_preset=payload.get("layerPreset", payload.get("layer_preset", "")),
        )

        logger.info(
            "Conduit obstacle scan request (request_id=%s, remote=%s, auth_mode=%s, provider=%s, selection_only=%s, include_modelspace=%s, max_entities=%s, layer_preset=%s, layer_count=%s)",
            request_id,
            remote_addr,
            auth_mode,
            conduit_provider,
            selection_only,
            include_modelspace,
            max_entities,
            layer_rules_meta.get("appliedPreset") or "",
            len(layer_names),
        )

        if conduit_dotnet_enabled:
            dotnet_payload = {
                "selectionOnly": selection_only,
                "includeModelspace": include_modelspace,
                "maxEntities": max_entities,
                "canvasWidth": canvas_width,
                "canvasHeight": canvas_height,
                "layerNames": layer_names,
                "layerTypeOverrides": layer_type_overrides,
                "layerPreset": layer_rules_meta.get("appliedPreset") or "",
            }
            try:
                result = _call_dotnet_bridge_action(
                    action="conduit_route_obstacle_scan",
                    payload=dotnet_payload,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                    request_id=request_id,
                )
                result["meta"] = {
                    **(result.get("meta", {}) or {}),
                    "layerPreset": layer_rules_meta.get("appliedPreset") or "",
                    "layerRuleSummary": layer_rules_meta,
                }
                return jsonify(result), 200
            except Exception as exc:
                logger.warning(
                    "Conduit obstacle scan .NET provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "code": "DOTNET_BRIDGE_FAILED",
                                "message": f".NET obstacle scan failed: {str(exc)}",
                            }
                        ),
                        503,
                    )

        manager = get_manager()
        status = manager.get_status()
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
                "requestId": request_id,
                "layerPreset": layer_rules_meta.get("appliedPreset") or "",
                "layerRuleSummary": layer_rules_meta,
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
