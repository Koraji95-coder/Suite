from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any, Callable, Dict, Optional

from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
    exception_message as autocad_exception_message,
    log_autocad_exception as autocad_log_exception,
)

MENU_INDEX_SCHEMA_VERSION = "suite.autodesk.acade.menu-index.v1"
LOOKUP_INDEX_SCHEMA_VERSION = "suite.autodesk.acade.lookup-index.v1"
DEFAULT_MENU_INDEX_PATH = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "development"
    / "autocad-electrical-2026-menu-index.generated.json"
)
DEFAULT_LOOKUP_INDEX_PATH = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "development"
    / "autocad-electrical-2026-lookup-index.generated.json"
)


def _resolve_menu_index_path(menu_index_path: Optional[Path] = None) -> Path:
    if menu_index_path is not None:
        return Path(menu_index_path)
    return DEFAULT_MENU_INDEX_PATH


def _resolve_lookup_index_path(lookup_index_path: Optional[Path] = None) -> Path:
    if lookup_index_path is not None:
        return Path(lookup_index_path)
    return DEFAULT_LOOKUP_INDEX_PATH


def _read_menu_index_payload(menu_index_path: Path) -> dict[str, Any]:
    payload = json.loads(menu_index_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("AutoCAD menu index payload must be a JSON object.")
    if str(payload.get("schemaVersion") or "").strip() != MENU_INDEX_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported AutoCAD menu index schema: {payload.get('schemaVersion')!r}"
        )
    return payload


def _read_lookup_index_payload(lookup_index_path: Path) -> dict[str, Any]:
    payload = json.loads(lookup_index_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("AutoCAD lookup index payload must be a JSON object.")
    if str(payload.get("schemaVersion") or "").strip() != LOOKUP_INDEX_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported AutoCAD lookup index schema: {payload.get('schemaVersion')!r}"
        )
    return payload


def _normalize_filter_value(value: Any) -> str:
    return str(value or "").strip().lower()


def _matches_menu_query(menu: dict[str, Any], query: str) -> bool:
    normalized_query = _normalize_filter_value(query)
    if not normalized_query:
        return True

    searchable_parts = [
        menu.get("fileName"),
        menu.get("title"),
        menu.get("familyId"),
        menu.get("familyLabel"),
        menu.get("kind"),
    ]
    searchable_parts.extend(menu.get("topCategories") or [])
    searchable_text = " ".join(str(part or "").lower() for part in searchable_parts)
    return all(token in searchable_text for token in normalized_query.split())


def _matches_lookup_query(database: dict[str, Any], query: str) -> bool:
    normalized_query = _normalize_filter_value(query)
    if not normalized_query:
        return True

    searchable_parts = [
        database.get("fileName"),
        database.get("roleId"),
        database.get("roleLabel"),
        database.get("label"),
        database.get("description"),
    ]
    searchable_parts.extend(database.get("tableNames") or [])
    for table in database.get("interestingTables") or []:
        if not isinstance(table, dict):
            continue
        searchable_parts.append(table.get("name"))
        searchable_parts.extend(table.get("columns") or [])
    searchable_text = " ".join(str(part or "").lower() for part in searchable_parts)
    return all(token in searchable_text for token in normalized_query.split())


def _filter_menus(
    menu_index: dict[str, Any],
    *,
    kind: str = "",
    family: str = "",
    query: str = "",
) -> list[dict[str, Any]]:
    normalized_kind = _normalize_filter_value(kind)
    normalized_family = _normalize_filter_value(family)
    menus = menu_index.get("menus") or []
    if not isinstance(menus, list):
        return []

    filtered: list[dict[str, Any]] = []
    for entry in menus:
        if not isinstance(entry, dict):
            continue
        if normalized_kind and _normalize_filter_value(entry.get("kind")) != normalized_kind:
            continue
        if normalized_family and _normalize_filter_value(entry.get("familyId")) != normalized_family:
            continue
        if not _matches_menu_query(entry, query):
            continue
        filtered.append(entry)
    return filtered


def _filter_lookup_databases(
    lookup_index: dict[str, Any],
    *,
    role: str = "",
    query: str = "",
) -> list[dict[str, Any]]:
    normalized_role = _normalize_filter_value(role)
    databases = lookup_index.get("databases") or []
    if not isinstance(databases, list):
        return []

    filtered: list[dict[str, Any]] = []
    for entry in databases:
        if not isinstance(entry, dict):
            continue
        if normalized_role and _normalize_filter_value(entry.get("roleId")) != normalized_role:
            continue
        if not _matches_lookup_query(entry, query):
            continue
        filtered.append(entry)
    return filtered


def _lookup_database_summary(database: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": database.get("id"),
        "fileName": database.get("fileName"),
        "filePath": database.get("filePath"),
        "roleId": database.get("roleId"),
        "roleLabel": database.get("roleLabel"),
        "label": database.get("label"),
        "description": database.get("description"),
        "isOptional": bool(database.get("isOptional")),
        "hasError": bool(database.get("hasError")),
        "error": database.get("error") or "",
        "tableCount": int(database.get("tableCount") or 0),
        "interestingTableCount": int(database.get("interestingTableCount") or 0),
        "tableNames": database.get("tableNames") or [],
        "interestingTables": database.get("interestingTables") or [],
    }


def create_autocad_reference_catalog_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    menu_index_path: Optional[Path] = None,
    lookup_index_path: Optional[Path] = None,
) -> Blueprint:
    """Create read-only AutoCAD reference catalog endpoints under /api/autocad/reference."""

    bp = Blueprint("autocad_reference_catalog_api", __name__, url_prefix="/api/autocad/reference")
    resolved_menu_index_path = _resolve_menu_index_path(menu_index_path)
    resolved_lookup_index_path = _resolve_lookup_index_path(lookup_index_path)

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
    ):
        payload = autocad_build_error_payload(
            code=code,
            message=message,
            request_id=request_id,
            meta=meta,
        )
        return jsonify(payload), status_code

    def _load_menu_index_or_error(*, request_id: str, stage: str) -> dict[str, Any]:
        try:
            return _read_menu_index_payload(resolved_menu_index_path)
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="AutoCAD reference catalog request failed",
                request_id=request_id,
                remote_addr=str(request.remote_addr or ""),
                auth_mode="supabase",
                stage=stage,
                code="REFERENCE_CATALOG_UNAVAILABLE",
                provider="reference_catalog",
            )
            raise RuntimeError(autocad_exception_message(exc)) from exc

    def _load_lookup_index_or_error(*, request_id: str, stage: str) -> dict[str, Any]:
        try:
            return _read_lookup_index_payload(resolved_lookup_index_path)
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="AutoCAD lookup catalog request failed",
                request_id=request_id,
                remote_addr=str(request.remote_addr or ""),
                auth_mode="supabase",
                stage=stage,
                code="REFERENCE_LOOKUP_UNAVAILABLE",
                provider="reference_catalog",
            )
            raise RuntimeError(autocad_exception_message(exc)) from exc

    @bp.before_request
    def _autocad_reference_bind_request_id():
        _request_correlation_id()

    @bp.after_request
    def _autocad_reference_attach_request_id(response):
        request_id = str(getattr(g, "autocad_request_id", "") or "").strip()
        if request_id:
            response.headers.setdefault("X-Request-ID", request_id)
        return response

    @bp.route("/menu-index", methods=["GET"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def get_autocad_menu_index():
        request_id = _request_correlation_id()
        try:
            menu_index = _load_menu_index_or_error(
                request_id=request_id,
                stage="menu_index_load",
            )
        except RuntimeError as exc:
            return _error_response(
                code="REFERENCE_CATALOG_UNAVAILABLE",
                message="AutoCAD menu index is unavailable on this workstation.",
                status_code=503,
                request_id=request_id,
                meta={
                    "catalogPath": str(resolved_menu_index_path),
                    "error": str(exc),
                },
            )

        kind = request.args.get("kind", "")
        family = request.args.get("family", "")
        query = request.args.get("q", "")
        filtered_menus = _filter_menus(
            menu_index,
            kind=kind,
            family=family,
            query=query,
        )
        payload = {
            "success": True,
            "requestId": request_id,
            "schemaVersion": menu_index.get("schemaVersion"),
            "generatedAt": menu_index.get("generatedAt"),
            "source": menu_index.get("source") or {},
            "filters": {
                "kind": _normalize_filter_value(kind),
                "family": _normalize_filter_value(family),
                "q": str(query or "").strip(),
            },
            "counts": {
                "totalMenus": len(menu_index.get("menus") or []),
                "filteredMenus": len(filtered_menus),
                "families": len(menu_index.get("families") or []),
                "standards": len(menu_index.get("standards") or []),
            },
            "availableKinds": menu_index.get("availableKinds") or [],
            "families": menu_index.get("families") or [],
            "recommendedDefaults": menu_index.get("recommendedDefaults") or {},
            "menus": filtered_menus,
        }
        return jsonify(payload), 200

    @bp.route("/standards", methods=["GET"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def get_autocad_reference_standards():
        request_id = _request_correlation_id()
        try:
            menu_index = _load_menu_index_or_error(
                request_id=request_id,
                stage="standards_load",
            )
        except RuntimeError as exc:
            return _error_response(
                code="REFERENCE_CATALOG_UNAVAILABLE",
                message="AutoCAD standards reference catalog is unavailable on this workstation.",
                status_code=503,
                request_id=request_id,
                meta={
                    "catalogPath": str(resolved_menu_index_path),
                    "error": str(exc),
                },
            )

        payload = {
            "success": True,
            "requestId": request_id,
            "schemaVersion": menu_index.get("schemaVersion"),
            "generatedAt": menu_index.get("generatedAt"),
            "source": menu_index.get("source") or {},
            "recommendedDefaults": (menu_index.get("recommendedDefaults") or {}).get(
                "schematic", []
            ),
            "count": len(menu_index.get("standards") or []),
            "standards": menu_index.get("standards") or [],
        }
        return jsonify(payload), 200

    @bp.route("/lookups/summary", methods=["GET"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def get_autocad_lookup_summary():
        request_id = _request_correlation_id()
        try:
            lookup_index = _load_lookup_index_or_error(
                request_id=request_id,
                stage="lookup_summary_load",
            )
        except RuntimeError as exc:
            return _error_response(
                code="REFERENCE_LOOKUP_UNAVAILABLE",
                message="AutoCAD lookup catalog is unavailable on this workstation.",
                status_code=503,
                request_id=request_id,
                meta={
                    "catalogPath": str(resolved_lookup_index_path),
                    "error": str(exc),
                },
            )

        role = request.args.get("role", "")
        query = request.args.get("q", "")
        filtered_databases = _filter_lookup_databases(
            lookup_index,
            role=role,
            query=query,
        )
        payload = {
            "success": True,
            "requestId": request_id,
            "schemaVersion": lookup_index.get("schemaVersion"),
            "generatedAt": lookup_index.get("generatedAt"),
            "source": lookup_index.get("source") or {},
            "filters": {
                "role": _normalize_filter_value(role),
                "q": str(query or "").strip(),
            },
            "counts": {
                "totalDatabases": len(lookup_index.get("databases") or []),
                "filteredDatabases": len(filtered_databases),
                "roles": len(lookup_index.get("roles") or []),
                "tables": int((lookup_index.get("counts") or {}).get("tables") or 0),
            },
            "availableRoleIds": lookup_index.get("availableRoleIds") or [],
            "recommendedDefaults": lookup_index.get("recommendedDefaults") or {},
            "roles": lookup_index.get("roles") or [],
            "databases": [_lookup_database_summary(database) for database in filtered_databases],
        }
        return jsonify(payload), 200

    @bp.route("/lookups/<lookup_id>", methods=["GET"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def get_autocad_lookup_detail(lookup_id: str):
        request_id = _request_correlation_id()
        try:
            lookup_index = _load_lookup_index_or_error(
                request_id=request_id,
                stage="lookup_detail_load",
            )
        except RuntimeError as exc:
            return _error_response(
                code="REFERENCE_LOOKUP_UNAVAILABLE",
                message="AutoCAD lookup catalog is unavailable on this workstation.",
                status_code=503,
                request_id=request_id,
                meta={
                    "catalogPath": str(resolved_lookup_index_path),
                    "error": str(exc),
                },
            )

        lookup_id_value = str(lookup_id or "").strip().lower()
        databases = lookup_index.get("databases") or []
        selected_database = next(
            (
                database
                for database in databases
                if isinstance(database, dict)
                and _normalize_filter_value(database.get("id")) == lookup_id_value
            ),
            None,
        )
        if not isinstance(selected_database, dict):
            return _error_response(
                code="REFERENCE_LOOKUP_NOT_FOUND",
                message=f"AutoCAD lookup database '{lookup_id}' is not available on this workstation.",
                status_code=404,
                request_id=request_id,
                meta={
                    "lookupId": lookup_id_value,
                    "catalogPath": str(resolved_lookup_index_path),
                },
            )

        payload = {
            "success": True,
            "requestId": request_id,
            "schemaVersion": lookup_index.get("schemaVersion"),
            "generatedAt": lookup_index.get("generatedAt"),
            "source": lookup_index.get("source") or {},
            "lookup": selected_database,
        }
        return jsonify(payload), 200

    return bp
