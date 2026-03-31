from __future__ import annotations

import os
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from flask import Blueprint, jsonify, request
from flask_limiter import Limiter

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
    exception_message as autocad_exception_message,
    log_autocad_exception as autocad_log_exception,
)

DEFAULT_BLOCK_NAME = "R3P-24x36BORDER&TITLE"
DEFAULT_WDL_LABELS = {
    "LINE1": "Client / Utility",
    "LINE2": "Facility / Site",
    "LINE4": "Project Number",
}
LEGACY_SUITE_STARTER_WDP_PREFIX = "; Suite starter AutoCAD Electrical project scaffold"
DEFAULT_WDP_CONFIG_LINES = (
    "+[1]%SL_DIR%NFPA/;%SL_DIR%NFPA/1-/;%SL_DIR%pneu_iso125/;%SL_DIR%hyd_iso125/;%SL_DIR%pid/",
    "+[2]ACE_NFPA_MENU.DAT",
    "+[3]%SL_DIR%panel/",
    "+[4]ACE_PANEL_MENU_NFPA.DAT",
    "+[5]1",
    "+[9]1,2,3",
    "+[10]0",
    "+[11]1",
    "+[12]0",
    "+[13]0",
    "+[14]0",
    "+[15]0",
    "+[18]0",
    "+[21]0",
    "+[22]",
    "+[23]0",
    "+[24]",
    "+[25]1",
    "+[26](0.00000 0.03125 0.00000 )",
    "+[29]0",
    "+[30]0.00",
)
PANEL_DRAWING_TITLE_HINTS = ("PANEL", "ELEVATION", "LAYOUT", "ENCLOSURE", "CABINET")
ACADE_OWNED_TAGS = ("DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ")
SUITE_OWNED_TAGS = (
    "CADNO",
    "REV",
    "SCALE",
    "DWNBY",
    "DWNDATE",
    "CHKBY",
    "CHKDATE",
    "ENGR",
    "ENGRDATE",
    "REV1",
    "DESC1",
    "BY1",
    "CHK1",
    "DATE1",
    "REV2",
    "DESC2",
    "BY2",
    "CHK2",
    "DATE2",
    "REV3",
    "DESC3",
    "BY3",
    "CHK3",
    "DATE3",
    "REV4",
    "DESC4",
    "BY4",
    "CHK4",
    "DATE4",
    "REV5",
    "DESC5",
    "BY5",
    "CHK5",
    "DATE5",
)
TITLE_BLOCK_SCAN_TAGS = (
    *ACADE_OWNED_TAGS,
    *SUITE_OWNED_TAGS,
    "WD_TB",
)
TITLE_BLOCK_FILE_EXTENSIONS = {".dwg", ".pdf", ".wdt", ".wdp"}
DRAWING_FILE_EXTENSIONS = {".dwg", ".pdf"}
DIRECTORY_SKIP_NAMES = {
    ".git",
    ".playwright-cli",
    ".runlogs",
    ".codex-runtime",
    "node_modules",
    "dist",
    "dist-ssr",
    "bin",
    "obj",
    "artifacts",
}
FILENAME_DRAWING_NUMBER_PATTERN = re.compile(r"(?i)\bR3P(?:[-_][A-Z0-9]+){2,8}\b")
WDT_ATTRIBUTE_ORDER = ("DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ")
WDT_FIELD_MAP = {
    "DWGNO": "DWGNAM",
    "TITLE1": "LINE1",
    "TITLE2": "LINE2",
    "TITLE3": "DWGDESC",
    "PROJ": "LINE4",
}
ACADE_OPEN_PROJECT_UNAVAILABLE_MESSAGE = (
    "Support files are ready, but ACADE did not register/open the project."
)
ACADE_OPEN_PROJECT_UNAVAILABLE_CODES = {
    "AUTOCAD_COMMAND_TIMEOUT",
    "AUTOCAD_LAUNCH_FAILED",
    "AUTOCAD_LAUNCH_TIMEOUT",
    "AUTOCAD_NOT_AVAILABLE",
    "PLUGIN_NOT_READY",
    "PLUGIN_RESULT_INVALID",
    "PLUGIN_RESULT_MISSING",
}


def create_title_block_sync_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    send_autocad_dotnet_command: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]],
) -> Blueprint:
    bp = Blueprint("title_block_sync_api", __name__, url_prefix="/api/title-block-sync")

    def _request_id() -> str:
        raw = request.headers.get("X-Request-ID") or request.headers.get("X-Request-Id")
        if not raw:
            try:
                payload = request.get_json(silent=True) or {}
                raw = payload.get("requestId") or payload.get("request_id")
            except Exception:
                raw = None
        return autocad_derive_request_id(raw)

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

    def _parse_json_body() -> Dict[str, Any]:
        payload = request.get_json(silent=True)
        if isinstance(payload, dict):
            return payload
        return {}

    def _normalize_text(value: Any) -> str:
        return str(value or "").strip()

    def _normalize_upper(value: Any) -> str:
        return _normalize_text(value).upper()

    def _normalize_drawing_key(value: Any) -> str:
        return re.sub(r"[^A-Z0-9]+", "", _normalize_upper(value))

    def _sanitize_acade_project_stem(value: Any) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            return ""
        normalized = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip().rstrip(". ")
        return normalized or "project"

    def _derive_cadno(dwgno: Any) -> str:
        return _normalize_drawing_key(dwgno)

    def _safe_date(value: Any) -> Optional[date]:
        text = _normalize_text(value)
        if not text:
            return None
        for candidate in (text, text[:10]):
            try:
                return datetime.fromisoformat(candidate).date()
            except Exception:
                continue
        for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, fmt).date()
            except Exception:
                continue
        return None

    def _safe_datetime(value: Any) -> Optional[datetime]:
        text = _normalize_text(value)
        if not text:
            return None
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        except Exception:
            return None

    def _safe_int(value: Any, fallback: int = 0) -> int:
        try:
            return int(value)
        except Exception:
            return fallback

    def _call_dotnet_bridge_action(
        *,
        action: str,
        payload: Dict[str, Any],
        request_id: str,
        remote_addr: str,
        auth_mode: str,
    ) -> Dict[str, Any]:
        if send_autocad_dotnet_command is None:
            raise RuntimeError("AutoCAD .NET bridge is not configured.")

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
            raise RuntimeError("Malformed response from .NET bridge.")
        if not response.get("ok"):
            raise RuntimeError(
                str(response.get("error") or response.get("message") or "Unknown .NET bridge error.")
            )

        result_payload = response.get("result")
        if not isinstance(result_payload, dict):
            raise RuntimeError("Invalid .NET bridge result payload.")
        if not isinstance(result_payload.get("success"), bool):
            raise RuntimeError("Invalid .NET bridge result envelope.")

        result_payload["meta"] = {
            **(result_payload.get("meta", {}) or {}),
            "source": "dotnet",
            "requestId": request_id,
            "bridgeRequestId": str(response.get("id") or ""),
            "bridgeMs": elapsed_ms,
            "action": action,
        }

        logger.info(
            "Title block .NET bridge action completed (request_id=%s, action=%s, remote=%s, auth_mode=%s, elapsed_ms=%s, result_success=%s)",
            request_id,
            action,
            remote_addr,
            auth_mode,
            elapsed_ms,
            bool(result_payload.get("success")),
        )
        return result_payload

    def _resolve_project_root(payload: Dict[str, Any]) -> Path:
        raw_profile = payload.get("profile")
        profile = raw_profile if isinstance(raw_profile, dict) else {}
        raw = _normalize_text(
            payload.get("projectRootPath")
            or payload.get("project_root_path")
            or profile.get("projectRootPath")
            or profile.get("project_root_path")
        )
        if not raw:
            raise ValueError("projectRootPath is required.")
        project_root = Path(raw).expanduser()
        if not project_root.is_absolute():
            raise ValueError("projectRootPath must be an absolute path.")
        if not project_root.exists() or not project_root.is_dir():
            raise ValueError(f"projectRootPath does not exist or is not a directory: {project_root}")
        return project_root

    def _discover_project_files(project_root: Path) -> List[Path]:
        files: List[Path] = []
        for current_root, dir_names, file_names in os.walk(project_root):
            dir_names[:] = [
                name
                for name in dir_names
                if name not in DIRECTORY_SKIP_NAMES and not name.startswith(".")
            ]
            current_dir = Path(current_root)
            for file_name in file_names:
                path = current_dir / file_name
                if path.suffix.lower() not in TITLE_BLOCK_FILE_EXTENSIONS:
                    continue
                files.append(path)
        files.sort(key=lambda item: str(item).lower())
        return files

    def _relative_path(project_root: Path, absolute_path: Path) -> str:
        try:
            return str(absolute_path.relative_to(project_root)).replace("\\", "/")
        except Exception:
            return absolute_path.name

    def _find_filename_drawing_number(stem: str) -> str:
        match = FILENAME_DRAWING_NUMBER_PATTERN.search(stem.upper())
        return match.group(0).replace("_", "-") if match else ""

    def _derive_filename_title(stem: str, drawing_number: str) -> str:
        if not drawing_number:
            return stem.replace("_", " ").strip()
        upper_stem = stem.upper()
        idx = upper_stem.find(drawing_number.upper())
        if idx < 0:
            return stem.replace("_", " ").strip()
        title = stem[idx + len(drawing_number) :].strip(" _-")
        return title.replace("_", " ").strip()

    def _resolve_wdp_path(
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
    ) -> Tuple[Path, bool]:
        configured_path = _normalize_text(
            profile.get("acadeProjectFilePath") or profile.get("acade_project_file_path")
        )
        if configured_path:
            candidate = Path(configured_path).expanduser()
            if not candidate.is_absolute():
                candidate = project_root / candidate
            if candidate.exists() and candidate.is_dir():
                candidate = candidate / f"{project_root.name or 'project'}.wdp"
            elif candidate.suffix.lower() != ".wdp":
                candidate = candidate.with_suffix(".wdp")
            return candidate, candidate.exists()

        wdp_files = [path for path in discovered_files if path.suffix.lower() == ".wdp"]
        if wdp_files:
            return wdp_files[0], True

        stem = _sanitize_acade_project_stem(profile.get("projectName")) or _sanitize_acade_project_stem(project_root.name)
        candidate = project_root / f"{stem}.wdp"
        return candidate, candidate.exists()

    def _build_mapping_paths(
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
    ) -> Tuple[Path, Path, Path, bool]:
        wdp_path, wdp_exists = _resolve_wdp_path(project_root, discovered_files, profile)
        return wdp_path, wdp_path.with_suffix(".wdt"), wdp_path.with_suffix(".wdl"), wdp_exists

    def _read_profile(payload: Dict[str, Any], project_root: Path) -> Dict[str, str | None]:
        raw_profile = payload.get("profile")
        profile = raw_profile if isinstance(raw_profile, dict) else {}
        return {
            "projectName": _normalize_text(
                profile.get("projectName")
                or profile.get("project_name")
                or payload.get("projectName")
                or payload.get("project_name")
            ),
            "blockName": _normalize_text(profile.get("blockName") or profile.get("block_name")) or DEFAULT_BLOCK_NAME,
            "projectRootPath": _normalize_text(profile.get("projectRootPath") or profile.get("project_root_path"))
            or str(project_root),
            "acadeProjectFilePath": _normalize_text(
                profile.get("acadeProjectFilePath") or profile.get("acade_project_file_path")
            ),
            "acadeLine1": _normalize_text(profile.get("acadeLine1") or profile.get("acade_line1")),
            "acadeLine2": _normalize_text(profile.get("acadeLine2") or profile.get("acade_line2")),
            "acadeLine4": _normalize_text(profile.get("acadeLine4") or profile.get("acade_line4")),
            "signerDrawnBy": _normalize_text(profile.get("signerDrawnBy") or profile.get("signer_drawn_by")),
            "signerCheckedBy": _normalize_text(profile.get("signerCheckedBy") or profile.get("signer_checked_by")),
            "signerEngineer": _normalize_text(profile.get("signerEngineer") or profile.get("signer_engineer")),
        }

    def _build_wdt_text(profile: Dict[str, str | None]) -> str:
        lines = [f"BLOCK = {profile.get('blockName') or DEFAULT_BLOCK_NAME}"]
        for attribute_tag in WDT_ATTRIBUTE_ORDER:
            lines.append(f"{attribute_tag} = {WDT_FIELD_MAP[attribute_tag]}")
        return "\n".join(lines) + "\n"

    def _build_wdl_text() -> str:
        lines = [f"{key} = {value}" for key, value in DEFAULT_WDL_LABELS.items()]
        return "\n".join(lines) + "\n"

    def _build_wdp_text(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
        wdp_path: Path,
        wdt_path: Path,
        wdl_path: Path,
    ) -> str:
        project_name = wdp_path.stem or project_root.name or "Project"
        project_desc = _normalize_text(profile.get("acadeLine2")) or project_name
        project_owner = _normalize_text(profile.get("acadeLine1")) or project_name
        project_number = _normalize_text(profile.get("acadeLine4"))
        drawing_paths = [
            _relative_path(project_root, path)
            for path in discovered_files
            if path.suffix.lower() == ".dwg"
        ]
        lines: List[str] = [f"*[1]{project_owner}"]
        if project_desc:
            lines.append(f"*[2]{project_desc}")
        if project_number:
            lines.append(f"*[4]{project_number}")
        lines.extend(DEFAULT_WDP_CONFIG_LINES)
        if drawing_paths:
            for relative_path in drawing_paths:
                stem = Path(relative_path).stem
                drawing_number = _find_filename_drawing_number(stem)
                drawing_title = _derive_filename_title(stem, drawing_number) or stem.replace("_", " ").strip()
                subtype_context = f"{relative_path} {drawing_title}".upper()
                subtype = (
                    "PANEL"
                    if any(hint in subtype_context for hint in PANEL_DRAWING_TITLE_HINTS)
                    else "SCHEMATIC"
                )
                lines.append(f"==={drawing_title}")
                lines.append(f"=====SUB={subtype}")
                lines.append(relative_path)
        return "\n".join(lines) + "\n"

    def _is_legacy_suite_starter_wdp(text: str | None) -> bool:
        normalized = (text or "").lstrip()
        return normalized.startswith(LEGACY_SUITE_STARTER_WDP_PREFIX)

    def _normalize_text_for_compare(text: str | None) -> str:
        if text is None:
            return ""
        return text.replace("\r\n", "\n").replace("\r", "\n").strip()

    def _read_optional_text(path: Path) -> str | None:
        if not path.exists() or not path.is_file():
            return None
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            return None

    def _resolve_wdp_state(path: Path, existing_text: str | None, generated_text: str | None = None) -> str:
        if not path.exists():
            return "starter"
        if _is_legacy_suite_starter_wdp(existing_text):
            return "starter"
        if generated_text and _normalize_text_for_compare(existing_text) == _normalize_text_for_compare(generated_text):
            return "starter"
        return "existing"

    def _resolve_existing_or_generated_text(path: Path, generated_text: str) -> str:
        return _read_optional_text(path) or generated_text

    def _resolve_wdp_preview_text(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
        wdp_path: Path,
        wdt_path: Path,
        wdl_path: Path,
        wdp_exists: bool,
    ) -> str:
        if wdp_exists:
            existing_text = _read_optional_text(wdp_path)
            if existing_text is not None and not _is_legacy_suite_starter_wdp(existing_text):
                return existing_text
        return _build_wdp_text(
            project_root=project_root,
            discovered_files=discovered_files,
            profile=profile,
            wdp_path=wdp_path,
            wdt_path=wdt_path,
            wdl_path=wdl_path,
        )

    def _read_revision_entries(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw = payload.get("revisionEntries") or payload.get("revision_entries")
        if not isinstance(raw, list):
            return []
        return [entry for entry in raw if isinstance(entry, dict)]

    def _read_scan_rows(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw = payload.get("rows") or payload.get("drawings")
        if not isinstance(raw, list):
            return []
        return [entry for entry in raw if isinstance(entry, dict)]

    def _match_revision_entries(
        *,
        revision_entries: Sequence[Dict[str, Any]],
        drawing_number: str,
        file_name: str,
        relative_path: str,
    ) -> List[Dict[str, Any]]:
        drawing_key = _normalize_drawing_key(drawing_number)
        file_name_key = _normalize_upper(file_name)
        relative_path_key = relative_path.replace("\\", "/").lower()

        matched: List[Dict[str, Any]] = []
        for entry in revision_entries:
            entry_drawing_key = _normalize_drawing_key(entry.get("drawing_number"))
            entry_source_ref = str(entry.get("source_ref") or "").replace("\\", "/").lower()
            entry_title = _normalize_upper(entry.get("title"))
            entry_file_name = Path(entry_source_ref).name.upper() if entry_source_ref else ""

            if drawing_key and entry_drawing_key == drawing_key:
                matched.append(entry)
                continue
            if relative_path_key and entry_source_ref.endswith(relative_path_key):
                matched.append(entry)
                continue
            if file_name_key and entry_file_name == file_name_key:
                matched.append(entry)
                continue
            if file_name_key and entry_title and entry_title == Path(file_name).stem.upper():
                matched.append(entry)

        matched.sort(
            key=lambda item: (
                _safe_date(item.get("revision_date")) or date.min,
                _safe_int(item.get("revision_sort_order"), 0),
                _safe_datetime(item.get("created_at")) or datetime.min,
            )
        )
        return matched[-5:]

    def _build_revision_slot_values(
        revision_entries: Sequence[Dict[str, Any]],
        current_top_level_revision: str,
    ) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
        updates: Dict[str, str] = {}
        display_rows: List[Dict[str, str]] = []
        for idx in range(1, 6):
            updates[f"REV{idx}"] = ""
            updates[f"DESC{idx}"] = ""
            updates[f"BY{idx}"] = ""
            updates[f"CHK{idx}"] = ""
            updates[f"DATE{idx}"] = ""

        for idx, entry in enumerate(revision_entries[:5], start=1):
            revision_value = _normalize_text(entry.get("revision"))
            date_value = _normalize_text(entry.get("revision_date"))
            if not date_value:
                created_at = _safe_datetime(entry.get("created_at"))
                if created_at is not None:
                    date_value = created_at.date().isoformat()
            updates[f"REV{idx}"] = revision_value
            updates[f"DESC{idx}"] = _normalize_text(entry.get("revision_description"))
            updates[f"BY{idx}"] = _normalize_text(entry.get("revision_by"))
            updates[f"CHK{idx}"] = _normalize_text(entry.get("revision_checked_by"))
            updates[f"DATE{idx}"] = date_value
            display_rows.append(
                {
                    "revision": revision_value,
                    "description": updates[f"DESC{idx}"],
                    "by": updates[f"BY{idx}"],
                    "checkedBy": updates[f"CHK{idx}"],
                    "date": date_value,
                }
            )

        latest_revision = current_top_level_revision
        for entry in reversed(revision_entries):
            candidate = _normalize_text(entry.get("revision"))
            if candidate:
                latest_revision = candidate
                break
        updates["REV"] = latest_revision
        return updates, display_rows

    def _build_desired_row_state(
        *,
        row: Dict[str, Any],
        profile: Dict[str, str | None],
        revision_entries: Sequence[Dict[str, Any]],
    ) -> Dict[str, Any]:
        current_attributes = row.get("currentAttributes")
        if not isinstance(current_attributes, dict):
            current_attributes = {}
        editable_fields = row.get("editableFields")
        if not isinstance(editable_fields, dict):
            editable_fields = {}

        drawing_number = (
            _normalize_text(row.get("filenameDrawingNumber"))
            or _normalize_text(current_attributes.get("DWGNO"))
            or _normalize_text(row.get("drawingNumber"))
        )
        drawing_title = (
            _normalize_text(row.get("filenameTitle"))
            or _normalize_text(current_attributes.get("TITLE3"))
            or Path(str(row.get("fileName") or "")).stem
        )

        suite_updates = {
            "CADNO": _derive_cadno(drawing_number),
            "SCALE": _normalize_text(editable_fields.get("scale") or current_attributes.get("SCALE")),
            "DWNBY": _normalize_text(
                editable_fields.get("drawnBy")
                or current_attributes.get("DWNBY")
                or profile.get("signerDrawnBy")
            ),
            "DWNDATE": _normalize_text(editable_fields.get("drawnDate") or current_attributes.get("DWNDATE")),
            "CHKBY": _normalize_text(
                editable_fields.get("checkedBy")
                or current_attributes.get("CHKBY")
                or profile.get("signerCheckedBy")
            ),
            "CHKDATE": _normalize_text(editable_fields.get("checkedDate") or current_attributes.get("CHKDATE")),
            "ENGR": _normalize_text(
                editable_fields.get("engineer")
                or current_attributes.get("ENGR")
                or profile.get("signerEngineer")
            ),
            "ENGRDATE": _normalize_text(editable_fields.get("engineerDate") or current_attributes.get("ENGRDATE")),
        }

        revision_updates, revision_rows = _build_revision_slot_values(
            revision_entries=revision_entries,
            current_top_level_revision=_normalize_text(current_attributes.get("REV") or row.get("filenameRevision")),
        )
        suite_updates.update(revision_updates)

        acade_values = {
            "DWGNAM": drawing_number,
            "LINE1": _normalize_text(profile.get("acadeLine1")),
            "LINE2": _normalize_text(profile.get("acadeLine2")),
            "DWGDESC": drawing_title,
            "LINE4": _normalize_text(profile.get("acadeLine4")),
        }
        acade_expected_tags = {
            "DWGNO": acade_values["DWGNAM"],
            "TITLE1": acade_values["LINE1"],
            "TITLE2": acade_values["LINE2"],
            "TITLE3": acade_values["DWGDESC"],
            "PROJ": acade_values["LINE4"],
        }

        pending_suite_writes = []
        pending_acade_writes = []
        for tag, next_value in suite_updates.items():
            previous_value = _normalize_text(current_attributes.get(tag))
            if previous_value != next_value:
                pending_suite_writes.append(
                    {
                        "attributeTag": tag,
                        "previousValue": previous_value,
                        "nextValue": next_value,
                    }
                )
        for tag, next_value in acade_expected_tags.items():
            previous_value = _normalize_text(current_attributes.get(tag))
            if previous_value != next_value:
                pending_acade_writes.append(
                    {
                        "attributeTag": tag,
                        "previousValue": previous_value,
                        "nextValue": next_value,
                    }
                )

        return {
            "drawingNumber": drawing_number,
            "drawingTitle": drawing_title,
            "acadeValues": acade_values,
            "suiteUpdates": suite_updates,
            "pendingSuiteWrites": pending_suite_writes,
            "pendingAcadeWrites": pending_acade_writes,
            "revisionRows": revision_rows,
        }

    def _build_scan_rows(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
        bridge_drawings_by_path: Dict[str, Dict[str, Any]],
        revision_entries: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []

        for absolute_path in discovered_files:
            relative_path = _relative_path(project_root, absolute_path)
            file_type = absolute_path.suffix.lower().lstrip(".")
            stem = absolute_path.stem
            filename_drawing_number = _find_filename_drawing_number(stem)
            filename_title = _derive_filename_title(stem, filename_drawing_number)
            bridge_row = bridge_drawings_by_path.get(str(absolute_path).lower(), {})
            current_attributes = {
                _normalize_upper(key): _normalize_text(value)
                for key, value in (bridge_row.get("attributes") or {}).items()
                if _normalize_text(key)
            }
            matched_revision_entries = _match_revision_entries(
                revision_entries=revision_entries,
                drawing_number=_normalize_text(current_attributes.get("DWGNO")) or filename_drawing_number,
                file_name=absolute_path.name,
                relative_path=relative_path,
            )
            issues: List[str] = []
            if file_type == "dwg" and not bridge_row.get("titleBlockFound"):
                issues.append("Title block not found in drawing scan.")
            if bridge_row.get("hasWdTb"):
                issues.append("WD_TB attribute detected. Embedded mapping conflicts with external .WDT.")
            title_block_dwgno = _normalize_text(current_attributes.get("DWGNO"))
            if filename_drawing_number and title_block_dwgno:
                if _normalize_drawing_key(filename_drawing_number) != _normalize_drawing_key(title_block_dwgno):
                    issues.append("Filename drawing number does not match title block DWGNO.")
            title_block_project_number = _normalize_text(current_attributes.get("PROJ"))
            expected_project_number = _normalize_text(profile.get("acadeLine4"))
            if title_block_project_number and expected_project_number:
                if title_block_project_number != expected_project_number:
                    issues.append("Project number does not match the configured ACADE PROJ value.")
            if file_type == "pdf":
                issues.append("PDF rows are filename-only in v1.")

            editable_fields = {
                "scale": _normalize_text(current_attributes.get("SCALE")),
                "drawnBy": _normalize_text(current_attributes.get("DWNBY") or profile.get("signerDrawnBy")),
                "drawnDate": _normalize_text(current_attributes.get("DWNDATE")),
                "checkedBy": _normalize_text(current_attributes.get("CHKBY") or profile.get("signerCheckedBy")),
                "checkedDate": _normalize_text(current_attributes.get("CHKDATE")),
                "engineer": _normalize_text(current_attributes.get("ENGR") or profile.get("signerEngineer")),
                "engineerDate": _normalize_text(current_attributes.get("ENGRDATE")),
            }

            row = {
                "id": f"title-block-row:{relative_path}",
                "fileName": absolute_path.name,
                "relativePath": relative_path,
                "absolutePath": str(absolute_path),
                "fileType": file_type,
                "filenameDrawingNumber": filename_drawing_number,
                "filenameTitle": filename_title,
                "filenameRevision": "",
                "titleBlockFound": bool(bridge_row.get("titleBlockFound")),
                "effectiveBlockName": _normalize_text(bridge_row.get("blockName")),
                "layoutName": _normalize_text(bridge_row.get("layoutName")),
                "titleBlockHandle": _normalize_text(bridge_row.get("handle")),
                "hasWdTbConflict": bool(bridge_row.get("hasWdTb")),
                "currentAttributes": current_attributes,
                "editableFields": editable_fields,
                "issues": issues,
                "warnings": list(bridge_row.get("warnings") or []),
                "revisionEntryCount": len(matched_revision_entries),
            }
            row.update(
                _build_desired_row_state(
                    row=row,
                    profile=profile,
                    revision_entries=matched_revision_entries,
                )
            )
            rows.append(row)

        return rows

    def _rebuild_rows_for_preview_or_apply(
        *,
        rows: Sequence[Dict[str, Any]],
        profile: Dict[str, str | None],
        revision_entries: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        next_rows: List[Dict[str, Any]] = []
        for row in rows:
            matched_revision_entries = _match_revision_entries(
                revision_entries=revision_entries,
                drawing_number=_normalize_text(row.get("drawingNumber") or row.get("filenameDrawingNumber") or (row.get("currentAttributes") or {}).get("DWGNO")),
                file_name=_normalize_text(row.get("fileName")),
                relative_path=_normalize_text(row.get("relativePath")),
            )
            next_row = dict(row)
            next_row["revisionEntryCount"] = len(matched_revision_entries)
            next_row.update(
                _build_desired_row_state(
                    row=next_row,
                    profile=profile,
                    revision_entries=matched_revision_entries,
                )
            )
            next_rows.append(next_row)
        return next_rows

    def _summarize_rows(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        dwg_rows = [row for row in rows if _normalize_text(row.get("fileType")) == "dwg"]
        flagged = [row for row in rows if row.get("issues")]
        suite_changes = sum(len(row.get("pendingSuiteWrites") or []) for row in rows)
        acade_changes = sum(len(row.get("pendingAcadeWrites") or []) for row in rows)
        wd_tb_conflicts = sum(1 for row in rows if row.get("hasWdTbConflict"))
        return {
            "totalFiles": len(rows),
            "drawingFiles": len(dwg_rows),
            "flaggedFiles": len(flagged),
            "suiteWriteCount": suite_changes,
            "acadeWriteCount": acade_changes,
            "wdTbConflictCount": wd_tb_conflicts,
        }

    def _resolve_selected_rows(
        rows: Sequence[Dict[str, Any]],
        payload: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        selected = payload.get("selectedRelativePaths") or payload.get("selected_relative_paths")
        if not isinstance(selected, list) or not selected:
            return [row for row in rows if _normalize_text(row.get("fileType")) == "dwg"]
        selected_keys = {
            _normalize_text(item).replace("\\", "/").lower()
            for item in selected
            if _normalize_text(item)
        }
        return [
            row
            for row in rows
            if _normalize_text(row.get("relativePath")).replace("\\", "/").lower() in selected_keys
        ]

    def _write_project_mapping_files(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
    ) -> Dict[str, Any]:
        wdp_path, wdt_path, wdl_path, _ = _build_mapping_paths(project_root, discovered_files, profile)
        wdp_text = _build_wdp_text(
            project_root=project_root,
            discovered_files=discovered_files,
            profile=profile,
            wdp_path=wdp_path,
            wdt_path=wdt_path,
            wdl_path=wdl_path,
        )
        wdt_text = _build_wdt_text(profile)
        wdl_text = _build_wdl_text()
        wdp_path.write_text(wdp_text, encoding="utf-8", newline="\n")
        wdt_path.write_text(wdt_text, encoding="utf-8", newline="\n")
        wdl_path.write_text(wdl_text, encoding="utf-8", newline="\n")
        return {
            "wdpPath": str(wdp_path),
            "wdtPath": str(wdt_path),
            "wdlPath": str(wdl_path),
            "wdpText": wdp_text,
            "wdtText": wdt_text,
            "wdlText": wdl_text,
            "wdpState": "starter",
        }

    def _ensure_project_mapping_files(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
    ) -> Dict[str, Any]:
        wdp_path, wdt_path, wdl_path, _ = _build_mapping_paths(project_root, discovered_files, profile)
        generated_wdp_text = _build_wdp_text(
            project_root=project_root,
            discovered_files=discovered_files,
            profile=profile,
            wdp_path=wdp_path,
            wdt_path=wdt_path,
            wdl_path=wdl_path,
        )
        generated_wdt_text = _build_wdt_text(profile)
        generated_wdl_text = _build_wdl_text()
        current_wdp_text = _read_optional_text(wdp_path)

        if not wdp_path.exists() or _is_legacy_suite_starter_wdp(current_wdp_text):
            wdp_path.write_text(generated_wdp_text, encoding="utf-8", newline="\n")
            current_wdp_text = generated_wdp_text
        if not wdt_path.exists():
            wdt_path.write_text(generated_wdt_text, encoding="utf-8", newline="\n")
        if not wdl_path.exists():
            wdl_path.write_text(generated_wdl_text, encoding="utf-8", newline="\n")

        return {
            "wdpPath": str(wdp_path),
            "wdtPath": str(wdt_path),
            "wdlPath": str(wdl_path),
            "wdpText": current_wdp_text or generated_wdp_text,
            "wdtText": _resolve_existing_or_generated_text(wdt_path, generated_wdt_text),
            "wdlText": _resolve_existing_or_generated_text(wdl_path, generated_wdl_text),
            "wdpState": _resolve_wdp_state(wdp_path, current_wdp_text, generated_wdp_text),
        }

    def _build_mapping_artifact_preview(
        *,
        project_root: Path,
        discovered_files: Sequence[Path],
        profile: Dict[str, str | None],
    ) -> Dict[str, Any]:
        wdp_path, wdt_path, wdl_path, wdp_exists = _build_mapping_paths(project_root, discovered_files, profile)
        existing_wdp_text = _read_optional_text(wdp_path) if wdp_exists else None
        generated_wdp_text = _build_wdp_text(
            project_root=project_root,
            discovered_files=discovered_files,
            profile=profile,
            wdp_path=wdp_path,
            wdt_path=wdt_path,
            wdl_path=wdl_path,
        )
        generated_wdt_text = _build_wdt_text(profile)
        generated_wdl_text = _build_wdl_text()
        return {
            "wdpPath": str(wdp_path),
            "wdtPath": str(wdt_path),
            "wdlPath": str(wdl_path),
            "wdpText": existing_wdp_text
            or _resolve_wdp_preview_text(
                project_root=project_root,
                discovered_files=discovered_files,
                profile=profile,
                wdp_path=wdp_path,
                wdt_path=wdt_path,
                wdl_path=wdl_path,
                wdp_exists=wdp_exists,
            ),
            "wdtText": _resolve_existing_or_generated_text(wdt_path, generated_wdt_text),
            "wdlText": _resolve_existing_or_generated_text(wdl_path, generated_wdl_text),
            "wdpState": _resolve_wdp_state(wdp_path, existing_wdp_text, generated_wdp_text),
        }

    def _build_bridge_scan_payload(rows: Sequence[Path], profile: Dict[str, str | None]) -> Dict[str, Any]:
        return {
            "blockNameHint": profile.get("blockName") or DEFAULT_BLOCK_NAME,
            "attributeTags": list(TITLE_BLOCK_SCAN_TAGS),
            "drawingPaths": [str(path) for path in rows if path.suffix.lower() == ".dwg"],
        }

    @bp.route("/scan", methods=["POST"])
    @require_supabase_user
    @limiter.limit("240 per hour")
    def api_title_block_scan():
        request_id = _request_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = "supabase"
        payload = _parse_json_body()

        try:
            project_root = _resolve_project_root(payload)
            profile = _read_profile(payload, project_root)
            revision_entries = _read_revision_entries(payload)
            discovered_files = _discover_project_files(project_root)
            bridge_drawings_by_path: Dict[str, Dict[str, Any]] = {}
            warnings: List[str] = []

            dwg_files = [path for path in discovered_files if path.suffix.lower() == ".dwg"]
            if dwg_files and send_autocad_dotnet_command is not None:
                try:
                    bridge_result = _call_dotnet_bridge_action(
                        action="suite_drawing_list_scan",
                        payload=_build_bridge_scan_payload(dwg_files, profile),
                        request_id=request_id,
                        remote_addr=remote_addr,
                        auth_mode=auth_mode,
                    )
                    bridge_data = bridge_result.get("data") or {}
                    for drawing in bridge_data.get("drawings") or []:
                        if not isinstance(drawing, dict):
                            continue
                        path_key = _normalize_text(drawing.get("path")).lower()
                        if path_key:
                            bridge_drawings_by_path[path_key] = drawing
                    warnings.extend(
                        [
                            _normalize_text(item)
                            for item in bridge_result.get("warnings") or []
                            if _normalize_text(item)
                        ]
                    )
                except Exception as exc:
                    logger.warning(
                        "Title block scan bridge fell back to filename metadata (request_id=%s, remote=%s, auth_mode=%s, detail=%s)",
                        request_id,
                        remote_addr,
                        auth_mode,
                        autocad_exception_message(exc),
                    )
                    warnings.append(
                        "Live DWG metadata is unavailable right now, so Suite is using filename fallback for drawing rows."
                    )
            elif dwg_files:
                logger.warning(
                    "Title block scan bridge is not configured; using filename metadata fallback (request_id=%s, remote=%s, auth_mode=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                )
                warnings.append(
                    "Live DWG metadata is unavailable right now, so Suite is using filename fallback for drawing rows."
                )

            rows = _build_scan_rows(
                project_root=project_root,
                discovered_files=discovered_files,
                profile=profile,
                bridge_drawings_by_path=bridge_drawings_by_path,
                revision_entries=revision_entries,
            )
            artifacts_preview = _build_mapping_artifact_preview(
                project_root=project_root,
                discovered_files=discovered_files,
                profile=profile,
            )
            summary = _summarize_rows(rows)

            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "Title block scan completed.",
                    "requestId": request_id,
                    "data": {
                        "projectRootPath": str(project_root),
                        "profile": profile,
                        "drawings": rows,
                        "summary": summary,
                        "artifacts": artifacts_preview,
                    },
                    "warnings": warnings,
                    "meta": {
                        "stage": "scan",
                        "providerPath": "dotnet" if send_autocad_dotnet_command else "filesystem",
                    },
                }
            ), 200
        except ValueError as exc:
            return _error_response(
                code="INVALID_REQUEST",
                message=str(exc),
                status_code=400,
                request_id=request_id,
                meta={"stage": "scan.validate"},
            )
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Title block scan failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="title_block_scan",
                code="TITLE_BLOCK_SCAN_FAILED",
                provider="filesystem",
            )
            return _error_response(
                code="TITLE_BLOCK_SCAN_FAILED",
                message=f"Title block scan failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "scan"},
            )

    @bp.route("/preview", methods=["POST"])
    @require_supabase_user
    @limiter.limit("240 per hour")
    def api_title_block_preview():
        request_id = _request_id()
        payload = _parse_json_body()
        try:
            project_root = _resolve_project_root(payload)
            profile = _read_profile(payload, project_root)
            revision_entries = _read_revision_entries(payload)
            rows = _read_scan_rows(payload)
            if not rows:
                raise ValueError("rows are required for preview.")

            preview_rows = _rebuild_rows_for_preview_or_apply(
                rows=rows,
                profile=profile,
                revision_entries=revision_entries,
            )
            artifacts = _build_mapping_artifact_preview(
                project_root=project_root,
                discovered_files=_discover_project_files(project_root),
                profile=profile,
            )
            summary = _summarize_rows(preview_rows)

            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "Title block preview is ready.",
                    "requestId": request_id,
                    "data": {
                        "projectRootPath": str(project_root),
                        "profile": profile,
                        "drawings": preview_rows,
                        "summary": summary,
                        "artifacts": artifacts,
                    },
                    "warnings": [],
                    "meta": {
                        "stage": "preview",
                    },
                }
            ), 200
        except ValueError as exc:
            return _error_response(
                code="INVALID_REQUEST",
                message=str(exc),
                status_code=400,
                request_id=request_id,
                meta={"stage": "preview.validate"},
            )
        except Exception as exc:
            return _error_response(
                code="TITLE_BLOCK_PREVIEW_FAILED",
                message=f"Title block preview failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "preview"},
            )

    @bp.route("/apply", methods=["POST"])
    @require_supabase_user
    @limiter.limit("120 per hour")
    def api_title_block_apply():
        request_id = _request_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = "supabase"
        payload = _parse_json_body()

        try:
            project_root = _resolve_project_root(payload)
            profile = _read_profile(payload, project_root)
            revision_entries = _read_revision_entries(payload)
            rows = _read_scan_rows(payload)
            if not rows:
                raise ValueError("rows are required for apply.")
            if send_autocad_dotnet_command is None:
                raise RuntimeError("AutoCAD bridge is not configured.")

            preview_rows = _rebuild_rows_for_preview_or_apply(
                rows=rows,
                profile=profile,
                revision_entries=revision_entries,
            )
            selected_rows = _resolve_selected_rows(preview_rows, payload)
            if not selected_rows:
                raise ValueError("No DWG rows were selected for apply.")
            wd_tb_conflicts = [row for row in selected_rows if row.get("hasWdTbConflict")]
            if wd_tb_conflicts:
                conflict_paths = ", ".join(_normalize_text(row.get("relativePath")) for row in wd_tb_conflicts[:5])
                raise ValueError(
                    f"WD_TB conflicts must be removed before apply. Conflicted drawings: {conflict_paths}"
                )

            discovered_files = _discover_project_files(project_root)
            artifacts = _ensure_project_mapping_files(
                project_root=project_root,
                discovered_files=discovered_files,
                profile=profile,
            )

            apply_payload = {
                "blockNameHint": profile.get("blockName") or DEFAULT_BLOCK_NAME,
                "triggerAcadeUpdate": bool(payload.get("triggerAcadeUpdate", True)),
                "projectRootPath": str(project_root),
                "expectedWdtPath": artifacts["wdtPath"],
                "expectedWdlPath": artifacts["wdlPath"],
                "files": [
                    {
                        "path": row.get("absolutePath"),
                        "relativePath": row.get("relativePath"),
                        "updates": row.get("suiteUpdates") or {},
                        "expectedAcadeValues": {
                            "DWGNO": _normalize_text(
                                (row.get("acadeValues") or {}).get("DWGNAM")
                            ),
                            "TITLE1": _normalize_text(
                                (row.get("acadeValues") or {}).get("LINE1")
                            ),
                            "TITLE2": _normalize_text(
                                (row.get("acadeValues") or {}).get("LINE2")
                            ),
                            "TITLE3": _normalize_text(
                                (row.get("acadeValues") or {}).get("DWGDESC")
                            ),
                            "PROJ": _normalize_text(
                                (row.get("acadeValues") or {}).get("LINE4")
                            ),
                        },
                    }
                    for row in selected_rows
                ],
            }
            bridge_result = _call_dotnet_bridge_action(
                action="suite_title_block_apply",
                payload=apply_payload,
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
            )
            if not bridge_result.get("success", False):
                if _normalize_upper(bridge_result.get("code")) == "INVALID_REQUEST":
                    raise ValueError(_normalize_text(bridge_result.get("message")) or "Title block apply bridge validation failed.")
                raise RuntimeError(
                    _normalize_text(bridge_result.get("message"))
                    or "Title block apply bridge execution failed."
                )

            bridge_data = bridge_result.get("data") or {}
            bridge_warnings = [
                _normalize_text(item)
                for item in bridge_result.get("warnings") or []
                if _normalize_text(item)
            ]

            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "Title block sync apply completed.",
                    "requestId": request_id,
                    "data": {
                        "projectRootPath": str(project_root),
                        "profile": profile,
                        "drawings": preview_rows,
                        "selectedRelativePaths": [row.get("relativePath") for row in selected_rows],
                        "summary": _summarize_rows(preview_rows),
                        "artifacts": artifacts,
                        "apply": bridge_data,
                    },
                    "warnings": bridge_warnings,
                    "meta": {
                        "stage": "apply",
                        "providerPath": "dotnet",
                    },
                }
            ), 200
        except ValueError as exc:
            return _error_response(
                code="INVALID_REQUEST",
                message=str(exc),
                status_code=400,
                request_id=request_id,
                meta={"stage": "apply.validate"},
            )
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Title block apply failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="title_block_apply",
                code="TITLE_BLOCK_APPLY_FAILED",
                provider="dotnet",
            )
            return _error_response(
                code="TITLE_BLOCK_APPLY_FAILED",
                message=f"Title block apply failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "apply", "providerPath": "dotnet"},
            )

    @bp.route("/ensure-artifacts", methods=["POST"])
    @require_supabase_user
    @limiter.limit("240 per hour")
    def api_title_block_ensure_artifacts():
        request_id = _request_id()
        payload = _parse_json_body()
        try:
            project_root = _resolve_project_root(payload)
            profile = _read_profile(payload, project_root)
            artifacts = _ensure_project_mapping_files(
                project_root=project_root,
                discovered_files=_discover_project_files(project_root),
                profile=profile,
            )
            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "ACADE support artifacts are ready.",
                    "requestId": request_id,
                    "data": {
                        "projectRootPath": str(project_root),
                        "profile": profile,
                        "drawings": [],
                        "summary": _summarize_rows([]),
                        "artifacts": artifacts,
                    },
                    "warnings": [],
                    "meta": {
                        "stage": "ensure-artifacts",
                    },
                }
            ), 200
        except ValueError as exc:
            return _error_response(
                code="INVALID_REQUEST",
                message=str(exc),
                status_code=400,
                request_id=request_id,
                meta={"stage": "ensure-artifacts.validate"},
            )
        except Exception as exc:
            return _error_response(
                code="TITLE_BLOCK_ARTIFACTS_FAILED",
                message=f"ACADE support artifact creation failed: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "ensure-artifacts"},
            )

    @bp.route("/open-project", methods=["POST"])
    @require_supabase_user
    @limiter.limit("240 per hour")
    def api_title_block_open_project():
        request_id = _request_id()
        remote_addr = str(request.remote_addr or "unknown")
        auth_mode = "supabase"
        payload = _parse_json_body()
        try:
            project_root = _resolve_project_root(payload)
            profile = _read_profile(payload, project_root)
            logger.info(
                "Title block open project ensuring artifacts (request_id=%s, remote=%s, auth_mode=%s, stage=%s)",
                request_id,
                remote_addr,
                auth_mode,
                "ensure-artifacts",
            )
            artifacts = _ensure_project_mapping_files(
                project_root=project_root,
                discovered_files=_discover_project_files(project_root),
                profile=profile,
            )
            wdp_path = Path(str(artifacts.get("wdpPath") or "")).expanduser()
            if not wdp_path.exists():
                raise ValueError("ACADE project definition could not be created.")
            response_data = {
                "projectRootPath": str(project_root),
                "profile": profile,
                "drawings": [],
                "summary": _summarize_rows([]),
                "artifacts": artifacts,
            }
            if send_autocad_dotnet_command is None:
                return _error_response(
                    code="ACADE_PROJECT_OPEN_UNAVAILABLE",
                    message=ACADE_OPEN_PROJECT_UNAVAILABLE_MESSAGE,
                    status_code=503,
                    request_id=request_id,
                    meta={
                        "stage": "bridge-open-project",
                        "providerPath": "dotnet",
                    },
                    extra={
                        "warnings": ["AutoCAD .NET bridge is not configured."],
                        "data": response_data,
                    },
                )

            logger.info(
                "Title block open project dispatching bridge action (request_id=%s, remote=%s, auth_mode=%s, stage=%s, wdp_path=%s)",
                request_id,
                remote_addr,
                auth_mode,
                "bridge-open-project",
                str(wdp_path),
            )
            try:
                bridge_result = _call_dotnet_bridge_action(
                    action="suite_acade_project_open",
                    payload={
                        "projectRootPath": str(project_root),
                        "wdpPath": str(wdp_path),
                        "launchIfNeeded": True,
                        "uiMode": "project_manager_only",
                    },
                    request_id=request_id,
                    remote_addr=remote_addr,
                    auth_mode=auth_mode,
                )
            except Exception as exc:
                logger.warning(
                    "Title block open project bridge unavailable (request_id=%s, remote=%s, auth_mode=%s, stage=%s, detail=%s)",
                    request_id,
                    remote_addr,
                    auth_mode,
                    "bridge-open-project",
                    autocad_exception_message(exc),
                )
                return _error_response(
                    code="ACADE_PROJECT_OPEN_UNAVAILABLE",
                    message=ACADE_OPEN_PROJECT_UNAVAILABLE_MESSAGE,
                    status_code=503,
                    request_id=request_id,
                    meta={
                        "stage": "bridge-open-project",
                        "providerPath": "dotnet",
                    },
                    extra={
                        "warnings": [autocad_exception_message(exc)],
                        "data": response_data,
                    },
                )

            bridge_warnings = [
                _normalize_text(item)
                for item in bridge_result.get("warnings") or []
                if _normalize_text(item)
            ]
            bridge_data = bridge_result.get("data")
            open_project = bridge_data if isinstance(bridge_data, dict) else {}
            if open_project:
                response_data["openProject"] = open_project
            bridge_code = _normalize_upper(bridge_result.get("code"))
            bridge_meta = {
                **(bridge_result.get("meta") or {}),
                "stage": "bridge-open-project",
                "providerPath": "dotnet",
            }
            if not bridge_result.get("success", False):
                detail = _normalize_text(bridge_result.get("message"))
                warnings = list(dict.fromkeys([
                    *(bridge_warnings or []),
                    *( [detail] if detail else [] ),
                ]))
                status_code = 400
                error_code = bridge_code or "INVALID_REQUEST"
                if bridge_code != "INVALID_REQUEST":
                    status_code = (
                        503
                        if bridge_code in ACADE_OPEN_PROJECT_UNAVAILABLE_CODES
                        else 502
                    )
                    error_code = bridge_code or (
                        "ACADE_PROJECT_OPEN_UNAVAILABLE"
                        if status_code == 503
                        else "ACADE_PROJECT_OPEN_FAILED"
                    )
                return _error_response(
                    code=error_code,
                    message=ACADE_OPEN_PROJECT_UNAVAILABLE_MESSAGE,
                    status_code=status_code,
                    request_id=request_id,
                    meta=bridge_meta,
                    extra={
                        "warnings": warnings,
                        "data": response_data,
                    },
                )

            verification = open_project.get("verification")
            verification_data = verification if isinstance(verification, dict) else {}
            command_completed = bool(verification_data.get("commandCompleted"))
            aepx_observed = bool(verification_data.get("aepxObserved"))
            last_proj_observed = bool(verification_data.get("lastProjObserved"))
            logger.info(
                "Title block open project verification completed (request_id=%s, remote=%s, auth_mode=%s, stage=%s, command_completed=%s, aepx_observed=%s, lastproj_observed=%s)",
                request_id,
                remote_addr,
                auth_mode,
                "verify-open-project",
                command_completed,
                aepx_observed,
                last_proj_observed,
            )
            if (
                not bool(open_project.get("projectActivated"))
                or not command_completed
                or not (aepx_observed or last_proj_observed)
            ):
                warnings = list(dict.fromkeys([
                    *(bridge_warnings or []),
                    "ACADE did not produce a verified project-open side effect.",
                ]))
                return _error_response(
                    code="ACADE_PROJECT_NOT_VERIFIED",
                    message=ACADE_OPEN_PROJECT_UNAVAILABLE_MESSAGE,
                    status_code=502,
                    request_id=request_id,
                    meta={
                        **bridge_meta,
                        "stage": "verify-open-project",
                    },
                    extra={
                        "warnings": warnings,
                        "data": response_data,
                    },
                )

            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "ACADE opened and project activated.",
                    "requestId": request_id,
                    "data": response_data,
                    "warnings": bridge_warnings,
                    "meta": {
                        "stage": "open-project",
                        "providerPath": "dotnet",
                    },
                }
            ), 200
        except ValueError as exc:
            return _error_response(
                code="INVALID_REQUEST",
                message=str(exc),
                status_code=400,
                request_id=request_id,
                meta={"stage": "open-project.validate"},
            )
        except Exception as exc:
            autocad_log_exception(
                logger=logger,
                message="Title block open project failed",
                request_id=request_id,
                remote_addr=remote_addr,
                auth_mode=auth_mode,
                stage="title_block_open_project",
                code="TITLE_BLOCK_OPEN_PROJECT_FAILED",
                provider="dotnet",
            )
            return _error_response(
                code="TITLE_BLOCK_OPEN_PROJECT_FAILED",
                message=f"Unable to launch ACADE and activate the project: {autocad_exception_message(exc)}",
                status_code=500,
                request_id=request_id,
                meta={"stage": "open-project"},
            )

    return bp
