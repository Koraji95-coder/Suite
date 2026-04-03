from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
import os

from flask import Blueprint, g, jsonify, request, send_file
from flask_limiter import Limiter
from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
    exception_message as autocad_exception_message,
    log_autocad_exception as autocad_log_exception,
)
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
    send_autocad_acade_command: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None,
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
            except Exception as manager_scope_exc:
                _log_ignored_exception(
                    stage="export_path_validation",
                    reason="Manager export-path scope check failed",
                    exc=manager_scope_exc,
                )
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
        "Conduit route AutoCAD provider initialized (provider=%s, dotnet_enabled=%s, com_fallback=%s, dotnet_sender_ready=%s, acade_sender_ready=%s)",
        conduit_provider,
        conduit_dotnet_enabled,
        conduit_allow_com_fallback,
        bool(send_autocad_dotnet_command),
        bool(send_autocad_acade_command),
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

    def _safe_backcheck_float(value: Any) -> float | None:
        try:
            numeric = float(value)
        except Exception:
            return None
        if not math.isfinite(numeric):
            return None
        return numeric

    def _normalize_backcheck_obstacles(raw_value: Any) -> list[Dict[str, Any]]:
        if not isinstance(raw_value, list):
            return []
        normalized: list[Dict[str, Any]] = []
        for index, candidate in enumerate(raw_value):
            if not isinstance(candidate, dict):
                continue
            x = _safe_backcheck_float(candidate.get("x"))
            y = _safe_backcheck_float(candidate.get("y"))
            w = _safe_backcheck_float(candidate.get("w"))
            h = _safe_backcheck_float(candidate.get("h"))
            if x is None or y is None or w is None or h is None:
                continue
            if w <= 0 or h <= 0:
                continue
            obstacle_type = str(candidate.get("type") or "foundation").strip().lower()
            if obstacle_type not in valid_obstacle_types:
                obstacle_type = "foundation"
            normalized.append(
                {
                    "id": str(candidate.get("id") or f"obstacle_{index + 1}").strip()
                    or f"obstacle_{index + 1}",
                    "type": obstacle_type,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "label": str(candidate.get("label") or "").strip(),
                }
            )
        return normalized

    def _point_inside_rect(*, x: float, y: float, rect: Dict[str, Any]) -> bool:
        left = float(rect.get("x", 0.0))
        top = float(rect.get("y", 0.0))
        width = max(0.0, float(rect.get("w", 0.0)))
        height = max(0.0, float(rect.get("h", 0.0)))
        return left <= x <= left + width and top <= y <= top + height

    def _segment_intersects_segment(
        *,
        a1: tuple[float, float],
        a2: tuple[float, float],
        b1: tuple[float, float],
        b2: tuple[float, float],
    ) -> bool:
        def _orientation(p: tuple[float, float], q: tuple[float, float], r: tuple[float, float]) -> int:
            value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
            if abs(value) < 1e-9:
                return 0
            return 1 if value > 0 else 2

        def _on_segment(p: tuple[float, float], q: tuple[float, float], r: tuple[float, float]) -> bool:
            return (
                min(p[0], r[0]) - 1e-9 <= q[0] <= max(p[0], r[0]) + 1e-9
                and min(p[1], r[1]) - 1e-9 <= q[1] <= max(p[1], r[1]) + 1e-9
            )

        o1 = _orientation(a1, a2, b1)
        o2 = _orientation(a1, a2, b2)
        o3 = _orientation(b1, b2, a1)
        o4 = _orientation(b1, b2, a2)

        if o1 != o2 and o3 != o4:
            return True
        if o1 == 0 and _on_segment(a1, b1, a2):
            return True
        if o2 == 0 and _on_segment(a1, b2, a2):
            return True
        if o3 == 0 and _on_segment(b1, a1, b2):
            return True
        if o4 == 0 and _on_segment(b1, a2, b2):
            return True
        return False

    def _segment_intersects_rect(
        *,
        ax: float,
        ay: float,
        bx: float,
        by: float,
        rect: Dict[str, Any],
    ) -> bool:
        if _point_inside_rect(x=ax, y=ay, rect=rect) or _point_inside_rect(x=bx, y=by, rect=rect):
            return True

        left = float(rect.get("x", 0.0))
        top = float(rect.get("y", 0.0))
        right = left + max(0.0, float(rect.get("w", 0.0)))
        bottom = top + max(0.0, float(rect.get("h", 0.0)))
        edges = (
            ((left, top), (right, top)),
            ((right, top), (right, bottom)),
            ((right, bottom), (left, bottom)),
            ((left, bottom), (left, top)),
        )
        a1 = (ax, ay)
        a2 = (bx, by)
        for edge_start, edge_end in edges:
            if _segment_intersects_segment(a1=a1, a2=a2, b1=edge_start, b2=edge_end):
                return True
        return False

    def _inflate_backcheck_obstacle(
        *,
        obstacle: Dict[str, Any],
        clearance: float,
    ) -> Dict[str, float]:
        return {
            "x": float(obstacle["x"]) - clearance,
            "y": float(obstacle["y"]) - clearance,
            "w": float(obstacle["w"]) + (clearance * 2.0),
            "h": float(obstacle["h"]) + (clearance * 2.0),
        }

    def _grid_cell_span_for_rect(
        *,
        rect: Dict[str, float],
        cell_size: float,
    ) -> tuple[int, int, int, int]:
        min_x = float(rect["x"])
        min_y = float(rect["y"])
        max_x = min_x + max(0.0, float(rect["w"]))
        max_y = min_y + max(0.0, float(rect["h"]))
        min_col = int(math.floor(min_x / cell_size))
        max_col = int(math.floor(max_x / cell_size))
        min_row = int(math.floor(min_y / cell_size))
        max_row = int(math.floor(max_y / cell_size))
        return min_col, max_col, min_row, max_row

    def _build_backcheck_obstacle_index(
        *,
        obstacles: list[Dict[str, Any]],
        clearance: float,
    ) -> tuple[dict[tuple[int, int], list[Dict[str, Any]]], float, list[Dict[str, Any]]]:
        if not obstacles:
            return {}, 128.0, []

        cell_size = max(64.0, min(512.0, clearance * 8.0 if clearance > 0 else 128.0))
        buckets: dict[tuple[int, int], list[Dict[str, Any]]] = {}
        indexed_entries: list[Dict[str, Any]] = []

        for obstacle in obstacles:
            obstacle_id = str(obstacle.get("id") or "").strip() or "obstacle"
            rect = _inflate_backcheck_obstacle(obstacle=obstacle, clearance=clearance)
            entry = {"id": obstacle_id, "rect": rect}
            indexed_entries.append(entry)

            min_col, max_col, min_row, max_row = _grid_cell_span_for_rect(
                rect=rect,
                cell_size=cell_size,
            )
            for col in range(min_col, max_col + 1):
                for row in range(min_row, max_row + 1):
                    key = (col, row)
                    bucket = buckets.setdefault(key, [])
                    bucket.append(entry)

        return buckets, cell_size, indexed_entries

    def _segment_backcheck_candidates(
        *,
        buckets: dict[tuple[int, int], list[Dict[str, Any]]],
        cell_size: float,
        fallback_entries: list[Dict[str, Any]],
        ax: float,
        ay: float,
        bx: float,
        by: float,
    ) -> list[Dict[str, Any]]:
        if not buckets:
            return fallback_entries

        min_col = int(math.floor(min(ax, bx) / cell_size))
        max_col = int(math.floor(max(ax, bx) / cell_size))
        min_row = int(math.floor(min(ay, by) / cell_size))
        max_row = int(math.floor(max(ay, by) / cell_size))

        col_span = (max_col - min_col) + 1
        row_span = (max_row - min_row) + 1
        if col_span <= 0 or row_span <= 0 or (col_span * row_span) > 4096:
            return fallback_entries

        candidates: list[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for col in range(min_col, max_col + 1):
            for row in range(min_row, max_row + 1):
                for entry in buckets.get((col, row), []):
                    entry_id = str(entry.get("id") or "").strip() or "obstacle"
                    if entry_id in seen_ids:
                        continue
                    seen_ids.add(entry_id)
                    candidates.append(entry)

        if candidates:
            return candidates
        return fallback_entries

    def _request_correlation_id() -> str:
        cached = str(getattr(g, "autocad_request_id", "") or "").strip()
        if cached:
            return cached
        request_id = autocad_derive_request_id(
            request.headers.get("X-Request-ID"),
            time_module=time,
        )
        g.autocad_request_id = request_id
        return request_id

    def _error_response(
        *,
        code: str,
        message: str,
        status_code: int,
        request_id: str,
        meta: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        payload = autocad_build_error_payload(
            code=code,
            message=message,
            request_id=request_id,
            meta=meta,
            extra=extra,
        )
        return jsonify(payload), status_code

    def _log_ignored_exception(*, stage: str, reason: str, exc: BaseException) -> None:
        logger.debug(
            "Ignored recoverable AutoCAD exception (stage=%s, reason=%s, error=%s)",
            stage,
            reason,
            autocad_exception_message(exc),
        )

    def _default_error_code(status_code: int) -> str:
        if status_code == 400:
            return "INVALID_REQUEST"
        if status_code == 401:
            return "AUTH_INVALID"
        if status_code == 403:
            return "FORBIDDEN"
        if status_code == 404:
            return "NOT_FOUND"
        if status_code == 409:
            return "CONFLICT"
        if status_code == 429:
            return "RATE_LIMITED"
        if status_code in {500, 502, 503, 504}:
            return "SERVICE_ERROR"
        return "REQUEST_FAILED"

    @bp.before_request
    def _autocad_bind_request_id():
        _request_correlation_id()

    @bp.after_request
    def _autocad_attach_request_id(response):
        request_id = str(getattr(g, "autocad_request_id", "") or "").strip()
        if not request_id or not response.is_json:
            return response

        payload = response.get_json(silent=True)
        if not isinstance(payload, dict):
            return response

        is_error_payload = (
            response.status_code >= 400
            or payload.get("success") is False
            or payload.get("ok") is False
        )
        if not is_error_payload:
            return response

        payload_changed = False
        if "requestId" not in payload:
            payload["requestId"] = request_id
            payload_changed = True

        if not str(payload.get("code") or "").strip():
            payload["code"] = _default_error_code(response.status_code)
            payload_changed = True

        if not str(payload.get("message") or "").strip():
            message_fallback = str(
                payload.get("error")
                or payload.get("detail")
                or f"Request failed ({response.status_code})"
            )
            payload["message"] = message_fallback
            payload_changed = True

        if payload_changed:
            response.set_data(json.dumps(payload))
            response.mimetype = "application/json"
        return response

    def _call_acade_host_action(
        *,
        action: str,
        payload: Dict[str, Any],
        remote_addr: str,
        auth_mode: str,
        request_id: str,
    ) -> Dict[str, Any]:
        if send_autocad_acade_command is None:
            raise RuntimeError(
                "AutoCAD in-process ACADE host is not configured. "
                "Configure AUTOCAD_DOTNET_ACADE_* backend settings."
            )

        started_at = time.time()
        response = send_autocad_acade_command(
            action,
            {
                **payload,
                "requestId": request_id,
            },
        )
        elapsed_ms = int((time.time() - started_at) * 1000)

        if not isinstance(response, dict):
            raise RuntimeError(
                "Malformed response from the AutoCAD in-process ACADE host (expected JSON object)."
            )

        if not response.get("ok"):
            error_message = str(
                response.get("error")
                or response.get("message")
                or "Unknown AutoCAD in-process ACADE host error."
            )
            raise RuntimeError(error_message)

        result_payload = response.get("result")
        if not isinstance(result_payload, dict):
            raise RuntimeError("In-process ACADE host returned invalid 'result' payload.")

        if not isinstance(result_payload.get("success"), bool):
            raise RuntimeError(
                "In-process ACADE host result missing boolean 'success' field."
            )

        result_payload["meta"] = {
            **(result_payload.get("meta", {}) or {}),
            "bridgeMs": elapsed_ms,
            "source": "dotnet",
            "requestId": request_id,
            "bridgeRequestId": str(response.get("id") or ""),
        }
        logger.info(
            "In-process ACADE host action succeeded (request_id=%s, action=%s, remote=%s, auth_mode=%s, elapsed_ms=%s)",
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
            "acade_sender_ready": bool(send_autocad_acade_command),
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
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            message = "No drawing open in AutoCAD."
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message=message,
                status_code=503,
                request_id=request_id,
                meta={"stage": "selection_count", "providerPath": "com"},
                extra={"count": 0, "error": message},
            )

        if pythoncom is None:
            message = "AutoCAD COM bridge unavailable on this platform."
            return _error_response(
                code="COM_UNAVAILABLE",
                message=message,
                status_code=503,
                request_id=request_id,
                meta={"stage": "selection_count", "providerPath": "com"},
                extra={"count": 0, "error": message},
            )

        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                message = "Cannot connect to AutoCAD."
                return _error_response(
                    code="AUTOCAD_CONNECT_FAILED",
                    message=message,
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "selection_count", "providerPath": "com"},
                    extra={"count": 0, "error": message},
                )

            doc = dyn(acad.ActiveDocument)

            try:
                old_ss = doc.SelectionSets.Item("TEMP_COUNT")
                old_ss.Delete()
            except Exception as selection_cleanup_exc:
                _log_ignored_exception(
                    stage="selection_count",
                    reason="Previous TEMP_COUNT selection set cleanup failed",
                    exc=selection_cleanup_exc,
                )

            ss = doc.SelectionSets.Add("TEMP_COUNT")
            ss.SelectOnScreen()
            count = ss.Count
            ss.Delete()

            return jsonify({"success": True, "count": count, "error": None})

        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Selection count failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="selection_count",
                code="SELECTION_COUNT_FAILED",
                provider="com",
            )
            return _error_response(
                code="SELECTION_COUNT_FAILED",
                message=f"Selection count failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "selection_count", "providerPath": "com"},
                extra={
                    "count": 0,
                    "error": f"COM error: {autocad_exception_message(exc)}",
                },
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                _log_ignored_exception(
                    stage="selection_count_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    @bp.route("/execute", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("30 per hour")
    def api_execute():
        """
        Execute coordinate extraction using manager.execute_layer_search.
        """
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD",
                status_code=400,
                request_id=request_id,
                meta={"stage": "execute_layer_search", "providerPath": "com"},
                extra={
                    "points_created": 0,
                    "error_details": "Please open a drawing before executing",
                },
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
            result = manager.execute_layer_search(
                {
                    **config,
                    "requestId": request_id,
                },
                run_id=run_id,
            )
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

            return _error_response(
                code=str(result.get("code") or "EXECUTE_LAYER_SEARCH_FAILED"),
                message=str(result.get("message") or result.get("error") or "No entities found"),
                status_code=400,
                request_id=request_id,
                meta={"stage": "execute_layer_search", "providerPath": "com"},
                extra={
                    "points_created": 0,
                    "blocks_inserted": 0,
                    "excel_path": "",
                    "duration_seconds": round(duration, 2),
                    "points": [],
                    "error_details": result.get("error") or result.get("message"),
                    "run_id": run_id,
                },
            )

        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Execute layer search failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="execute_layer_search",
                code="EXECUTE_LAYER_SEARCH_FAILED",
                provider="com",
            )
            return _error_response(
                code="EXECUTE_LAYER_SEARCH_FAILED",
                message=f"Execution failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "execute_layer_search", "providerPath": "com"},
                extra={
                    "points_created": 0,
                    "error_details": autocad_exception_message(exc),
                },
            )

    @bp.route("/ground-grid/plot", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("30 per hour")
    def api_plot_ground_grid():
        """Plot generated ground-grid data into the active AutoCAD drawing."""
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD",
                status_code=400,
                request_id=request_id,
                meta={"stage": "ground_grid_plot", "providerPath": "com"},
                extra={"error_details": "Please open a drawing before plotting"},
            )

        try:
            if not request.is_json:
                raise ValueError("Expected application/json payload")

            payload = request.get_json(silent=False) or {}
            result = manager.plot_ground_grid(
                {
                    **payload,
                    "requestId": request_id,
                }
            )

            if result.get("success"):
                return jsonify(result), 200

            return _error_response(
                code=str(result.get("code") or "GROUND_GRID_PLOT_FAILED"),
                message=str(result.get("message", "Ground grid plot failed")),
                status_code=400,
                request_id=request_id,
                meta={"stage": "ground_grid_plot", "providerPath": "com"},
                extra={
                    "lines_drawn": result.get("lines_drawn", 0),
                    "blocks_inserted": result.get("blocks_inserted", 0),
                    "layer_name": result.get("layer_name", ""),
                    "test_well_block_name": result.get("test_well_block_name", ""),
                    "error_details": result.get("error"),
                },
            )

        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Ground grid plot failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="ground_grid_plot",
                code="GROUND_GRID_PLOT_FAILED",
                provider="com",
            )
            return _error_response(
                code="GROUND_GRID_PLOT_FAILED",
                message=f"Ground grid plot failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "ground_grid_plot", "providerPath": "com"},
                extra={"error_details": autocad_exception_message(exc)},
            )

    @bp.route("/trigger-selection", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("120 per hour")
    def api_trigger_selection():
        """Bring AutoCAD to foreground (fresh COM)."""
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        manager = get_manager()
        status = manager.get_status()

        if not status.get("drawing_open"):
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "trigger_selection", "providerPath": "com"},
            )

        if pythoncom is None:
            return _error_response(
                code="COM_UNAVAILABLE",
                message="AutoCAD COM bridge unavailable on this platform.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "trigger_selection", "providerPath": "com"},
            )

        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return _error_response(
                    code="AUTOCAD_CONNECT_FAILED",
                    message="Cannot connect to AutoCAD.",
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "trigger_selection", "providerPath": "com"},
                )

            acad.Visible = True
            acad.WindowState = 1
            return jsonify({"success": True, "message": "AutoCAD activated"})

        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Trigger selection failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="trigger_selection",
                code="TRIGGER_SELECTION_FAILED",
                provider="com",
            )
            return _error_response(
                code="TRIGGER_SELECTION_FAILED",
                message=f"Error: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "trigger_selection", "providerPath": "com"},
                extra={"error": autocad_exception_message(exc)},
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                _log_ignored_exception(
                    stage="trigger_selection_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    @bp.route("/download-result", methods=["GET"])
    @require_autocad_auth
    @limiter.limit("60 per hour")
    def api_download_result():
        """Download a generated Excel file from an absolute path returned by /api/execute."""
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        try:
            manager = get_manager()
            raw_path = str(request.args.get("path", "")).strip()
            if not raw_path:
                return _error_response(
                    code="INVALID_REQUEST",
                    message="Missing file path.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "download_result"},
                )

            resolved = Path(raw_path).expanduser()
            try:
                resolved = resolved.resolve(strict=True)
            except FileNotFoundError:
                return _error_response(
                    code="FILE_NOT_FOUND",
                    message="File not found.",
                    status_code=404,
                    request_id=request_id,
                    meta={"stage": "download_result"},
                )

            if not resolved.is_file():
                return _error_response(
                    code="INVALID_REQUEST",
                    message="Path is not a file.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "download_result"},
                )

            if resolved.suffix.lower() not in {".xlsx", ".xls", ".xlsm"}:
                return (
                    _error_response(
                        code="INVALID_REQUEST",
                        message="Only Excel files can be downloaded from this endpoint.",
                        status_code=400,
                        request_id=request_id,
                        meta={"stage": "download_result"},
                    )
                )
            if not _is_safe_export_path(resolved, manager):
                return (
                    _error_response(
                        code="FORBIDDEN",
                        message=(
                            "File path is outside allowed export scope. "
                            "Only generated coordinates export files are allowed."
                        ),
                        status_code=403,
                        request_id=request_id,
                        meta={"stage": "download_result"},
                    )
                )

            return send_file(
                str(resolved),
                as_attachment=True,
                download_name=resolved.name,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Download result failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="download_result",
                code="DOWNLOAD_RESULT_FAILED",
                provider="com",
            )
            return _error_response(
                code="DOWNLOAD_RESULT_FAILED",
                message=f"Download failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "download_result"},
                extra={"error": autocad_exception_message(exc)},
            )

    @bp.route("/open-export-folder", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("60 per hour")
    def api_open_export_folder():
        """Open the folder containing a generated export file (Windows only)."""
        request_id = _request_correlation_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        try:
            manager = get_manager()
            payload = request.get_json(silent=True) or {}
            raw_path = str(payload.get("path", "")).strip()
            if not raw_path:
                return _error_response(
                    code="INVALID_REQUEST",
                    message="Missing file path.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "open_export_folder"},
                )

            resolved = Path(raw_path).expanduser()
            try:
                resolved = resolved.resolve(strict=True)
            except FileNotFoundError:
                return _error_response(
                    code="FILE_NOT_FOUND",
                    message="File not found.",
                    status_code=404,
                    request_id=request_id,
                    meta={"stage": "open_export_folder"},
                )

            if not resolved.is_file():
                return _error_response(
                    code="INVALID_REQUEST",
                    message="Path is not a file.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "open_export_folder"},
                )

            if resolved.suffix.lower() not in {".xlsx", ".xls", ".xlsm"}:
                return (
                    _error_response(
                        code="INVALID_REQUEST",
                        message="Only Excel export files are supported for open-folder.",
                        status_code=400,
                        request_id=request_id,
                        meta={"stage": "open_export_folder"},
                    )
                )
            if not _is_safe_export_path(resolved, manager):
                return (
                    _error_response(
                        code="FORBIDDEN",
                        message=(
                            "File path is outside allowed export scope. "
                            "Only generated coordinates export files are allowed."
                        ),
                        status_code=403,
                        request_id=request_id,
                        meta={"stage": "open_export_folder"},
                    )
                )

            folder = resolved.parent
            if not folder.exists():
                return _error_response(
                    code="FILE_NOT_FOUND",
                    message="Export folder not found.",
                    status_code=404,
                    request_id=request_id,
                    meta={"stage": "open_export_folder"},
                )

            if os.name != "nt" or not hasattr(os, "startfile"):
                return (
                    _error_response(
                        code="PLATFORM_UNSUPPORTED",
                        message="Open-folder action is only available on Windows.",
                        status_code=501,
                        request_id=request_id,
                        meta={"stage": "open_export_folder"},
                    )
                )

            os.startfile(str(folder))
            return jsonify({"success": True, "message": f"Opened: {folder}"})
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Open export folder failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="open_export_folder",
                code="OPEN_EXPORT_FOLDER_FAILED",
                provider="com",
            )
            return _error_response(
                code="OPEN_EXPORT_FOLDER_FAILED",
                message=f"Could not open folder: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "open_export_folder"},
                extra={"error": autocad_exception_message(exc)},
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

        raw_payload = request.get_json(silent=True)
        if raw_payload is None:
            payload: Dict[str, Any] = {}
        elif not isinstance(raw_payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_scan.validation"},
            )
        else:
            payload = raw_payload
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
            return _error_response(
                code="INVALID_REQUEST",
                message="maxEntities must be an integer.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_scan.validation"},
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
                result = _call_acade_host_action(
                    action="conduit_route_terminal_scan",
                    payload=dotnet_payload,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                    request_id=request_id,
                )
                return jsonify(result), 200
            except Exception as exc:
                logger.warning(
                    "Terminal scan in-process ACADE provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return _error_response(
                        code="DOTNET_BRIDGE_FAILED",
                        message=f".NET terminal scan via the in-process ACADE host failed: {str(exc)}",
                        status_code=503,
                        request_id=request_id,
                        meta={
                            "stage": "terminal_scan.dotnet",
                            "providerPath": "dotnet",
                            "providerConfigured": conduit_provider,
                        },
                    )

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
            logger.warning(
                "Terminal scan blocked: no drawing open (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_scan.status", "providerPath": "com"},
            )

        if pythoncom is None:
            logger.warning(
                "Terminal scan blocked: COM unavailable (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return _error_response(
                code="COM_UNAVAILABLE",
                message="AutoCAD COM bridge unavailable on this platform.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_scan.status", "providerPath": "com"},
            )

        started_at = time.time()
        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return _error_response(
                    code="AUTOCAD_CONNECT_FAILED",
                    message="Cannot connect to AutoCAD.",
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "terminal_scan.connect", "providerPath": "com"},
                )

            doc = dyn(acad.ActiveDocument)
            modelspace = dyn(doc.ModelSpace)
            if doc is None or modelspace is None:
                return _error_response(
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    message="Cannot access ActiveDocument or ModelSpace.",
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "terminal_scan.connect", "providerPath": "com"},
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
            autocad_log_exception(
                logger=logger,
                message="Terminal scan failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="terminal_scan",
                code="TERMINAL_SCAN_FAILED",
                provider="com",
            )
            return _error_response(
                code="TERMINAL_SCAN_FAILED",
                message=f"Terminal scan failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "terminal_scan", "providerPath": "com"},
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                _log_ignored_exception(
                    stage="terminal_scan_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    @bp.route("/conduit-route/route/compute", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("1800 per hour")
    def api_conduit_route_route_compute():
        """Compute a conduit route path for yard-routing workflow requests."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

        if not request.is_json:
            return _error_response(
                code="INVALID_REQUEST",
                message="Expected application/json payload.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_compute.validation"},
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_compute.validation"},
            )

        obstacle_source = str(payload.get("obstacleSource", "client") or "client").strip().lower()
        if obstacle_source not in {"client", "autocad"}:
            return _error_response(
                code="INVALID_REQUEST",
                message="obstacleSource must be 'client' or 'autocad'.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_compute.validation"},
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message="obstacleScan.maxEntities must be an integer.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "route_compute.obstacle_scan.validation"},
                )
            max_entities = max(500, min(200000, max_entities))

            canvas_width_raw = payload.get("canvasWidth", 980)
            canvas_height_raw = payload.get("canvasHeight", 560)
            try:
                canvas_width = max(120.0, float(canvas_width_raw))
                canvas_height = max(120.0, float(canvas_height_raw))
            except Exception:
                return _error_response(
                    code="INVALID_REQUEST",
                    message="canvasWidth/canvasHeight must be numbers.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "route_compute.obstacle_scan.validation"},
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
                    obstacle_scan_result = _call_acade_host_action(
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
                        "Conduit route compute in-process ACADE obstacle scan failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                        request_id,
                        remote_addr,
                        auth_mode,
                        conduit_provider,
                        conduit_allow_com_fallback,
                        str(exc),
                    )
                    if not conduit_allow_com_fallback:
                        return _error_response(
                            code="DOTNET_BRIDGE_FAILED",
                            message=f".NET obstacle scan via the in-process ACADE host failed: {str(exc)}",
                            status_code=503,
                            request_id=request_id,
                            meta={
                                "stage": "route_compute.obstacle_scan.dotnet",
                                "providerPath": "dotnet",
                                "providerConfigured": conduit_provider,
                            },
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
                        _error_response(
                            code="AUTOCAD_DRAWING_NOT_OPEN",
                            message="No drawing open in AutoCAD.",
                            status_code=503,
                            request_id=request_id,
                            meta={
                                "stage": "route_compute.obstacle_scan.status",
                                "providerPath": "com",
                            },
                        )
                    )
                if pythoncom is None:
                    logger.warning(
                        "Conduit route compute blocked: COM unavailable (remote=%s, auth_mode=%s)",
                        remote_addr,
                        auth_mode,
                    )
                    return (
                        _error_response(
                            code="COM_UNAVAILABLE",
                            message="AutoCAD COM bridge unavailable on this platform.",
                            status_code=503,
                            request_id=request_id,
                            meta={
                                "stage": "route_compute.obstacle_scan.status",
                                "providerPath": "com",
                            },
                        )
                    )

                try:
                    scan_started_at = time.time()
                    pythoncom.CoInitialize()
                    acad = connect_autocad()
                    if acad is None:
                        return _error_response(
                            code="AUTOCAD_CONNECT_FAILED",
                            message="Cannot connect to AutoCAD.",
                            status_code=503,
                            request_id=request_id,
                            meta={
                                "stage": "route_compute.obstacle_scan.connect",
                                "providerPath": "com",
                            },
                        )

                    doc = dyn(acad.ActiveDocument)
                    modelspace = dyn(doc.ModelSpace)
                    if doc is None or modelspace is None:
                        return _error_response(
                            code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                            message="Cannot access ActiveDocument or ModelSpace.",
                            status_code=503,
                            request_id=request_id,
                            meta={
                                "stage": "route_compute.obstacle_scan.connect",
                                "providerPath": "com",
                            },
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
                    except Exception as cleanup_exc:
                        _log_ignored_exception(
                            stage="route_compute_obstacle_scan_cleanup",
                            reason="CoUninitialize failed",
                            exc=cleanup_exc,
                        )

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
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Conduit route compute failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="route_compute",
                code="ROUTE_COMPUTE_FAILED",
                provider=conduit_provider,
            )
            return _error_response(
                code="ROUTE_COMPUTE_FAILED",
                message=f"Conduit route computation failed unexpectedly: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "route_compute", "providerConfigured": conduit_provider},
            )

    @bp.route("/conduit-route/backcheck", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("1800 per hour")
    def api_conduit_route_backcheck():
        """Run read-only quality checks against generated conduit routes."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

        if not request.is_json:
            return _error_response(
                code="INVALID_REQUEST",
                message="Expected application/json payload.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_backcheck.validation"},
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_backcheck.validation"},
            )

        raw_routes = payload.get("routes")
        if not isinstance(raw_routes, list) or len(raw_routes) == 0:
            return _error_response(
                code="INVALID_REQUEST",
                message="routes must be a non-empty array.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "route_backcheck.validation"},
            )

        obstacle_source = str(payload.get("obstacleSource") or "client").strip().lower()
        if obstacle_source not in {"client", "autocad"}:
            obstacle_source = "client"
        obstacles = _normalize_backcheck_obstacles(payload.get("obstacles"))
        clearance_raw = _safe_backcheck_float(payload.get("clearance"))
        clearance = 18.0 if clearance_raw is None else max(0.0, min(200.0, clearance_raw))
        warnings: list[str] = []
        if obstacle_source == "autocad" and len(obstacles) == 0:
            warnings.append(
                "AutoCAD obstacle source selected without obstacle payload; collision checks are limited."
            )
        obstacle_buckets, obstacle_cell_size, indexed_obstacles = _build_backcheck_obstacle_index(
            obstacles=obstacles,
            clearance=clearance,
        )

        findings: list[Dict[str, Any]] = []
        for index, raw_route in enumerate(raw_routes):
            route_id = f"route_{index + 1}"
            route_ref = route_id
            route_mode = "plan_view"
            issues: list[Dict[str, Any]] = []
            suggestions: list[str] = []
            metrics = {
                "length": 0.0,
                "bend_count": 0,
                "bend_degrees": 0,
                "point_count": 0,
                "segment_count": 0,
                "diagonal_segment_count": 0,
                "collision_count": 0,
            }

            if not isinstance(raw_route, dict):
                findings.append(
                    {
                        "routeId": route_id,
                        "ref": route_ref,
                        "mode": route_mode,
                        "status": "fail",
                        "issues": [
                            {
                                "code": "INVALID_ROUTE_OBJECT",
                                "severity": "fail",
                                "message": "Route entry must be a JSON object.",
                            }
                        ],
                        "suggestions": ["Resubmit route with id/ref/mode/path fields."],
                        "stats": metrics,
                    }
                )
                continue

            route_id = (
                str(raw_route.get("id") or raw_route.get("routeId") or route_id).strip() or route_id
            )
            route_ref = str(raw_route.get("ref") or route_id).strip() or route_id
            route_mode = str(raw_route.get("mode") or "plan_view").strip().lower() or "plan_view"
            path_raw = raw_route.get("path")
            path: list[Dict[str, float]] = []
            invalid_points = 0
            if isinstance(path_raw, list):
                for raw_point in path_raw:
                    if not isinstance(raw_point, dict):
                        invalid_points += 1
                        continue
                    x = _safe_backcheck_float(raw_point.get("x"))
                    y = _safe_backcheck_float(raw_point.get("y"))
                    if x is None or y is None:
                        invalid_points += 1
                        continue
                    path.append({"x": x, "y": y})
            else:
                issues.append(
                    {
                        "code": "MISSING_PATH",
                        "severity": "fail",
                        "message": "Route path must be an array of points.",
                    }
                )
                suggestions.append("Provide a route.path list containing at least two points.")

            if invalid_points > 0:
                issues.append(
                    {
                        "code": "INVALID_PATH_POINTS",
                        "severity": "warn",
                        "message": f"{invalid_points} path point(s) were ignored due to invalid coordinates.",
                    }
                )
                suggestions.append("Normalize path points so each includes finite numeric x/y.")

            if len(path) < 2:
                issues.append(
                    {
                        "code": "INSUFFICIENT_PATH_POINTS",
                        "severity": "fail",
                        "message": "Route requires at least two valid points for backcheck.",
                    }
                )
                suggestions.append("Recompute route before backcheck.")
            else:
                metrics["point_count"] = len(path)
                metrics["segment_count"] = max(0, len(path) - 1)

                total_length = 0.0
                bend_count = 0
                diagonal_segment_count = 0
                short_segment_count = 0
                colliding_obstacle_ids: list[str] = []
                colliding_obstacle_id_set: set[str] = set()

                for path_index in range(1, len(path)):
                    point_a = path[path_index - 1]
                    point_b = path[path_index]
                    dx = point_b["x"] - point_a["x"]
                    dy = point_b["y"] - point_a["y"]
                    segment_length = math.hypot(dx, dy)
                    total_length += segment_length
                    if segment_length < 1e-3:
                        short_segment_count += 1
                    if abs(dx) > 1e-6 and abs(dy) > 1e-6:
                        diagonal_segment_count += 1

                    segment_obstacles = _segment_backcheck_candidates(
                        buckets=obstacle_buckets,
                        cell_size=obstacle_cell_size,
                        fallback_entries=indexed_obstacles,
                        ax=point_a["x"],
                        ay=point_a["y"],
                        bx=point_b["x"],
                        by=point_b["y"],
                    )
                    for obstacle in segment_obstacles:
                        inflated = (
                            obstacle.get("rect")
                            if isinstance(obstacle.get("rect"), dict)
                            else None
                        )
                        if inflated is None:
                            continue
                        intersects = _segment_intersects_rect(
                            ax=point_a["x"],
                            ay=point_a["y"],
                            bx=point_b["x"],
                            by=point_b["y"],
                            rect=inflated,
                        )
                        if not intersects:
                            continue
                        obstacle_id = str(obstacle.get("id") or "").strip() or "obstacle"
                        if obstacle_id not in colliding_obstacle_id_set:
                            colliding_obstacle_id_set.add(obstacle_id)
                            colliding_obstacle_ids.append(obstacle_id)

                for path_index in range(2, len(path)):
                    previous = path[path_index - 2]
                    current = path[path_index - 1]
                    nxt = path[path_index]
                    dx1 = current["x"] - previous["x"]
                    dy1 = current["y"] - previous["y"]
                    dx2 = nxt["x"] - current["x"]
                    dy2 = nxt["y"] - current["y"]
                    if abs(dx1) < 1e-6 and abs(dy1) < 1e-6:
                        continue
                    if abs(dx2) < 1e-6 and abs(dy2) < 1e-6:
                        continue
                    dir1 = (0 if abs(dx1) < 1e-6 else (1 if dx1 > 0 else -1), 0 if abs(dy1) < 1e-6 else (1 if dy1 > 0 else -1))
                    dir2 = (0 if abs(dx2) < 1e-6 else (1 if dx2 > 0 else -1), 0 if abs(dy2) < 1e-6 else (1 if dy2 > 0 else -1))
                    if dir1 != dir2:
                        bend_count += 1

                bend_degrees = bend_count * 90
                metrics["length"] = round(total_length, 3)
                metrics["bend_count"] = bend_count
                metrics["bend_degrees"] = bend_degrees
                metrics["diagonal_segment_count"] = diagonal_segment_count
                metrics["collision_count"] = len(colliding_obstacle_ids)

                if bend_degrees > 360:
                    issues.append(
                        {
                            "code": "NEC_BEND_LIMIT_EXCEEDED",
                            "severity": "fail",
                            "message": f"Route total bend is {bend_degrees}°, exceeding the 360° pull guidance.",
                        }
                    )
                    suggestions.append("Split the route with a pull point or junction box.")
                elif bend_degrees > 270:
                    issues.append(
                        {
                            "code": "HIGH_BEND_LOAD",
                            "severity": "warn",
                            "message": f"Route total bend is {bend_degrees}°; review pull tension assumptions.",
                        }
                    )
                    suggestions.append("Review this route for pull-point opportunities.")

                if diagonal_segment_count > 0:
                    issues.append(
                        {
                            "code": "DIAGONAL_SEGMENTS_DETECTED",
                            "severity": "warn",
                            "message": f"{diagonal_segment_count} segment(s) are diagonal; expected orthogonal drafting path.",
                        }
                    )
                    suggestions.append("Recompute route in orthogonal mode or insert explicit corner points.")

                if short_segment_count > 0:
                    issues.append(
                        {
                            "code": "SHORT_SEGMENTS_DETECTED",
                            "severity": "warn",
                            "message": f"{short_segment_count} segment(s) are near zero length and may indicate duplicate points.",
                        }
                    )
                    suggestions.append("Clean duplicate points before issuing CAD sync.")

                if colliding_obstacle_ids:
                    preview_ids = ", ".join(colliding_obstacle_ids[:4])
                    if len(colliding_obstacle_ids) > 4:
                        preview_ids += ", ..."
                    issues.append(
                        {
                            "code": "OBSTACLE_COLLISION_DETECTED",
                            "severity": "fail",
                            "message": f"Route intersects {len(colliding_obstacle_ids)} obstacle envelope(s): {preview_ids}",
                            "meta": {
                                "obstacle_ids": colliding_obstacle_ids,
                            },
                        }
                    )
                    suggestions.append("Increase clearance or reroute around detected obstacles.")

            status = "pass"
            if any(str(issue.get("severity") or "").strip().lower() == "fail" for issue in issues):
                status = "fail"
            elif any(str(issue.get("severity") or "").strip().lower() == "warn" for issue in issues):
                status = "warn"

            findings.append(
                {
                    "routeId": route_id,
                    "ref": route_ref,
                    "mode": route_mode,
                    "status": status,
                    "issues": issues,
                    "suggestions": list(dict.fromkeys(suggestions)),
                    "stats": metrics,
                }
            )

        summary = {
            "total_routes": len(findings),
            "pass_count": sum(1 for finding in findings if finding.get("status") == "pass"),
            "warn_count": sum(1 for finding in findings if finding.get("status") == "warn"),
            "fail_count": sum(1 for finding in findings if finding.get("status") == "fail"),
        }
        warnings = list(dict.fromkeys(str(entry) for entry in warnings if str(entry).strip()))

        logger.info(
            "Conduit route backcheck completed (request_id=%s, remote=%s, auth_mode=%s, routes=%s, fails=%s, warns=%s, obstacle_source=%s, obstacle_count=%s)",
            request_id,
            remote_addr,
            auth_mode,
            summary["total_routes"],
            summary["fail_count"],
            summary["warn_count"],
            obstacle_source,
            len(obstacles),
        )

        return (
            jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "Conduit route backcheck completed.",
                    "requestId": request_id,
                    "source": "python-local-backcheck",
                    "summary": summary,
                    "findings": findings,
                    "warnings": warnings,
                    "meta": {
                        "clearance": clearance,
                        "obstacleSource": obstacle_source,
                        "obstacleCount": len(obstacles),
                    },
                }
            ),
            200,
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
            return _error_response(
                code="INVALID_REQUEST",
                message="Expected application/json payload.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.validation"},
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.validation"},
            )

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"upsert", "delete", "reset"}:
            return _error_response(
                code="INVALID_REQUEST",
                message="operation must be one of: upsert, delete, reset.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.validation"},
            )

        session_id = str(payload.get("sessionId") or payload.get("session_id") or "").strip()[:128]
        if not session_id:
            return _error_response(
                code="INVALID_REQUEST",
                message="sessionId is required.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.validation"},
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
            return _error_response(
                code="INVALID_REQUEST",
                message="textHeight must be a numeric value.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.validation"},
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message="clientRouteId is required for upsert/delete operations.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_route_draw.validation"},
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message="route object is required for upsert operation.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_route_draw.validation"},
                )

            path_raw = route_payload.get("path")
            if not isinstance(path_raw, list):
                return _error_response(
                    code="INVALID_REQUEST",
                    message="route.path must be an array.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_route_draw.validation"},
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message=str(exc),
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_route_draw.validation"},
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
                result = _call_acade_host_action(
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
                    "Terminal route draw in-process ACADE provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return _error_response(
                        code="DOTNET_BRIDGE_FAILED",
                        message=f".NET terminal route draw via the in-process ACADE host failed: {str(exc)}",
                        status_code=503,
                        request_id=request_id,
                        meta={
                            "source": "dotnet",
                            "operation": operation,
                            "sessionId": session_id,
                            "clientRouteId": client_route_id,
                            "providerPath": "dotnet",
                            "providerConfigured": conduit_provider,
                            "stage": "terminal_route_draw.dotnet",
                        },
                    )
                provider_path = "com_fallback"

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.status", "providerPath": provider_path},
            )

        if pythoncom is None:
            return _error_response(
                code="COM_UNAVAILABLE",
                message="AutoCAD COM bridge unavailable on this platform.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_route_draw.status", "providerPath": provider_path},
            )

        started_at = time.time()
        try:
            result = manager.plot_terminal_routes(
                {
                    **normalized_payload,
                    "requestId": request_id,
                }
            )
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
            autocad_log_exception(
                logger=logger,
                message="Terminal route draw failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="terminal_route_draw",
                code="TERMINAL_ROUTE_DRAW_FAILED",
                provider=provider_path,
            )
            return _error_response(
                code="TERMINAL_ROUTE_DRAW_FAILED",
                message=f"Terminal route draw failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={
                    "stage": "terminal_route_draw",
                    "providerPath": provider_path,
                    "providerConfigured": conduit_provider,
                },
            )

    @bp.route("/conduit-route/bridge/terminal-labels/sync", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("300 per hour")
    def api_conduit_route_bridge_terminal_labels_sync():
        """Compatibility alias for terminal label sync through the in-process ACADE host."""
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        request_id = _request_correlation_id()

        if send_autocad_acade_command is None:
            return _error_response(
                code="DOTNET_BRIDGE_UNAVAILABLE",
                message="AutoCAD in-process ACADE host command sender is not configured.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "bridge_terminal_label_sync.status", "providerPath": "dotnet"},
            )

        if not request.is_json:
            return _error_response(
                code="INVALID_REQUEST",
                message="Expected application/json payload.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "bridge_terminal_label_sync.validation"},
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "bridge_terminal_label_sync.validation"},
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
            return _error_response(
                code="INVALID_REQUEST",
                message="maxEntities must be an integer.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "bridge_terminal_label_sync.validation"},
            )
        max_entities = max(100, min(250000, max_entities))

        raw_strips = payload.get("strips")
        normalized_strips: list[dict[str, Any]] = []
        if raw_strips is not None:
            if not isinstance(raw_strips, list):
                return _error_response(
                    code="INVALID_REQUEST",
                    message="strips must be an array when provided.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "bridge_terminal_label_sync.validation"},
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
                except (TypeError, ValueError):
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message="No valid strip entries were provided.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "bridge_terminal_label_sync.validation"},
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
            "Compatibility terminal label sync request received (request_id=%s, remote=%s, auth_mode=%s, strips=%s, selection_only=%s, include_modelspace=%s, max_entities=%s)",
            request_id,
            remote_addr,
            auth_mode,
            len(normalized_strips),
            selection_only,
            include_modelspace,
            max_entities,
        )

        try:
            result = _call_acade_host_action(
                action="conduit_route_terminal_labels_sync",
                payload=normalized_payload,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                request_id=request_id,
            )
            result["meta"] = {
                **(result.get("meta", {}) or {}),
                "source": "dotnet",
                "requestId": request_id,
                "providerPath": "dotnet",
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
            logger.warning(
                "Compatibility terminal label sync via in-process ACADE host failed (request_id=%s, remote=%s, auth_mode=%s, stage=%s, code=%s, error=%s)",
                request_id,
                remote_addr,
                auth_mode,
                "bridge_terminal_label_sync",
                "DOTNET_BRIDGE_FAILED",
                autocad_exception_message(exc),
            )
            return _error_response(
                code="DOTNET_BRIDGE_FAILED",
                message=f".NET terminal label sync via the in-process ACADE host failed: {autocad_exception_message(exc)}",
                status_code=503,
                request_id=request_id,
                meta={
                    "source": "dotnet",
                    "providerPath": "dotnet",
                    "providerConfigured": conduit_provider,
                    "selectionOnly": selection_only,
                    "includeModelspace": include_modelspace,
                    "targetStrips": len(normalized_strips),
                    "stage": "bridge_terminal_label_sync",
                },
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
            return _error_response(
                code="INVALID_REQUEST",
                message="Expected application/json payload.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_label_sync.validation"},
            )

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error_response(
                code="INVALID_REQUEST",
                message="Request payload must be a JSON object.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_label_sync.validation"},
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
            return _error_response(
                code="INVALID_REQUEST",
                message="maxEntities must be an integer.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "terminal_label_sync.validation"},
            )
        max_entities = max(100, min(250000, max_entities))

        raw_strips = payload.get("strips")
        normalized_strips: list[dict[str, Any]] = []
        if raw_strips is not None:
            if not isinstance(raw_strips, list):
                return _error_response(
                    code="INVALID_REQUEST",
                    message="strips must be an array when provided.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_label_sync.validation"},
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
                return _error_response(
                    code="INVALID_REQUEST",
                    message="No valid strip entries were provided.",
                    status_code=400,
                    request_id=request_id,
                    meta={"stage": "terminal_label_sync.validation"},
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

        if conduit_dotnet_enabled:
            try:
                result = _call_acade_host_action(
                    action="conduit_route_terminal_labels_sync",
                    payload=normalized_payload,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                    request_id=request_id,
                )
                result["meta"] = {
                    **(result.get("meta", {}) or {}),
                    "source": "dotnet",
                    "requestId": request_id,
                    "providerPath": "dotnet",
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
                logger.warning(
                    "Terminal label sync in-process ACADE provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    autocad_exception_message(exc),
                )
                if not conduit_allow_com_fallback:
                    return _error_response(
                        code="DOTNET_BRIDGE_FAILED",
                        message=f".NET terminal label sync via the in-process ACADE host failed: {autocad_exception_message(exc)}",
                        status_code=503,
                        request_id=request_id,
                        meta={
                            "source": "dotnet",
                            "providerPath": "dotnet",
                            "providerConfigured": conduit_provider,
                            "selectionOnly": selection_only,
                            "includeModelspace": include_modelspace,
                            "targetStrips": len(normalized_strips),
                            "stage": "terminal_label_sync.dotnet",
                        },
                    )

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_label_sync.status", "providerPath": "com"},
            )

        if pythoncom is None:
            return _error_response(
                code="COM_UNAVAILABLE",
                message="AutoCAD COM bridge unavailable on this platform.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "terminal_label_sync.status", "providerPath": "com"},
            )

        started_at = time.time()
        try:
            result = manager.sync_terminal_labels(
                {
                    **normalized_payload,
                    "requestId": request_id,
                }
            )
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
            autocad_log_exception(
                logger=logger,
                message="Terminal label sync failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="terminal_label_sync",
                code="TERMINAL_LABEL_SYNC_FAILED",
                provider="com",
            )
            return _error_response(
                code="TERMINAL_LABEL_SYNC_FAILED",
                message=f"Terminal label sync failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={
                    "stage": "terminal_label_sync",
                    "providerPath": "com",
                    "providerConfigured": conduit_provider,
                },
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
            return _error_response(
                code="INVALID_REQUEST",
                message="maxEntities must be an integer.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "obstacle_scan.validation"},
            )
        max_entities = max(500, min(200000, max_entities))

        canvas_width_raw = payload.get("canvasWidth", 980)
        canvas_height_raw = payload.get("canvasHeight", 560)
        try:
            canvas_width = max(120.0, float(canvas_width_raw))
            canvas_height = max(120.0, float(canvas_height_raw))
        except Exception:
            return _error_response(
                code="INVALID_REQUEST",
                message="canvasWidth/canvasHeight must be numbers.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "obstacle_scan.validation"},
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
                result = _call_acade_host_action(
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
                    "Conduit obstacle scan in-process ACADE provider failed (request_id=%s, remote=%s, auth_mode=%s, provider=%s, fallback_to_com=%s, error=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    conduit_provider,
                    conduit_allow_com_fallback,
                    str(exc),
                )
                if not conduit_allow_com_fallback:
                    return _error_response(
                        code="DOTNET_BRIDGE_FAILED",
                        message=f".NET obstacle scan via the in-process ACADE host failed: {str(exc)}",
                        status_code=503,
                        request_id=request_id,
                        meta={
                            "stage": "obstacle_scan.dotnet",
                            "providerPath": "dotnet",
                            "providerConfigured": conduit_provider,
                        },
                    )

        manager = get_manager()
        status = manager.get_status()
        if not status.get("drawing_open"):
            logger.warning(
                "Conduit obstacle scan blocked: no drawing open (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return _error_response(
                code="AUTOCAD_DRAWING_NOT_OPEN",
                message="No drawing open in AutoCAD.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "obstacle_scan.status", "providerPath": "com"},
            )
        if pythoncom is None:
            logger.warning(
                "Conduit obstacle scan blocked: COM unavailable (remote=%s, auth_mode=%s)",
                remote_addr,
                auth_mode,
            )
            return _error_response(
                code="COM_UNAVAILABLE",
                message="AutoCAD COM bridge unavailable on this platform.",
                status_code=503,
                request_id=request_id,
                meta={"stage": "obstacle_scan.status", "providerPath": "com"},
            )

        started_at = time.time()
        try:
            pythoncom.CoInitialize()
            acad = connect_autocad()
            if acad is None:
                return _error_response(
                    code="AUTOCAD_CONNECT_FAILED",
                    message="Cannot connect to AutoCAD.",
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "obstacle_scan.connect", "providerPath": "com"},
                )

            doc = dyn(acad.ActiveDocument)
            modelspace = dyn(doc.ModelSpace)
            if doc is None or modelspace is None:
                return _error_response(
                    code="AUTOCAD_DOCUMENT_UNAVAILABLE",
                    message="Cannot access ActiveDocument or ModelSpace.",
                    status_code=503,
                    request_id=request_id,
                    meta={"stage": "obstacle_scan.connect", "providerPath": "com"},
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
            autocad_log_exception(
                logger=logger,
                message="Conduit obstacle scan failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="obstacle_scan",
                code="OBSTACLE_SCAN_FAILED",
                provider="com",
            )
            return _error_response(
                code="OBSTACLE_SCAN_FAILED",
                message=f"Conduit obstacle scan failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={
                    "stage": "obstacle_scan",
                    "providerPath": "com",
                    "providerConfigured": conduit_provider,
                },
            )
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception as cleanup_exc:
                _log_ignored_exception(
                    stage="obstacle_scan_cleanup",
                    reason="CoUninitialize failed",
                    exc=cleanup_exc,
                )

    @bp.route("/autocad/ws-ticket", methods=["POST"])
    @require_autocad_auth
    @limiter.limit("1200 per hour")
    def api_autocad_ws_ticket():
        """Issue a short-lived one-time websocket ticket for /ws authentication."""
        user = getattr(g, "supabase_user", {}) or {}
        user_id = str(user.get("id") or user.get("sub") or "").strip()
        auth_mode = str(getattr(g, "autocad_auth_mode", "unknown") or "unknown")
        remote_addr = str(request.remote_addr or "unknown")
        request_id = _request_correlation_id()

        try:
            ticket_payload = issue_ws_ticket(
                user_id=user_id,
                auth_mode=auth_mode,
                remote_addr=remote_addr,
            )
            return jsonify({"ok": True, **ticket_payload}), 200
        except Exception as exc:
            logger.exception("Failed to issue websocket ticket (remote=%s)", remote_addr)
            return _error_response(
                code="WS_TICKET_ISSUE_FAILED",
                message=str(exc),
                status_code=500,
                request_id=request_id,
                meta={"stage": "ws_ticket.issue"},
                extra={
                    "ok": False,
                    "error": "Failed to issue websocket ticket",
                },
            )

    return bp
