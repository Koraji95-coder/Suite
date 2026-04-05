from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests

from backend.runtime_paths import is_absolute_path_value, normalize_runtime_path
from .constants import (
    DEFAULT_BLOCK_NAME,
    DEFAULT_WDL_LABELS,
    DETERMINISTIC_WDT_SOURCE_KEYS,
    FILENAME_DRAWING_NUMBER_PATTERN,
    PANEL_DRAWING_TITLE_HINTS,
    TITLE_BLOCK_FILE_EXTENSIONS,
    WDT_ATTRIBUTE_ORDER,
    WDT_FIELD_MAP,
)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_upper(value: Any) -> str:
    return _normalize_text(value).upper()


def _normalize_drawing_key(value: Any) -> str:
    return "".join(ch for ch in _normalize_upper(value) if ch.isalnum())


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


def _sanitize_acade_project_stem(value: Any) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return ""
    sanitized = []
    for char in normalized:
        if char in '<>:"/\\|?*' or ord(char) < 32:
            sanitized.append("-")
        else:
            sanitized.append(char)
    collapsed = " ".join("".join(sanitized).split()).rstrip(". ")
    return collapsed or "project"


def _build_default_profile_values(
    project_id: str,
    user_id: str,
    project_root_path: str | None = None,
) -> Dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "id": f"title-block-profile-{int(time.time() * 1000)}",
        "project_id": _normalize_text(project_id),
        "user_id": _normalize_text(user_id) or "local",
        "block_name": DEFAULT_BLOCK_NAME,
        "project_root_path": _normalize_text(project_root_path) or None,
        "acade_project_file_path": None,
        "acade_line1": "",
        "acade_line2": "",
        "acade_line4": "",
        "signer_drawn_by": "",
        "signer_checked_by": "",
        "signer_engineer": "",
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def build_default_profile_row(
    project_id: str,
    user_id: str,
    *,
    project_root_path: str | None = None,
) -> Dict[str, Any]:
    return _build_default_profile_values(project_id, user_id, project_root_path)


def _read_profile(
    payload: Dict[str, Any],
    project_root_path: str,
) -> Dict[str, str | None]:
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
        or project_root_path,
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


def _candidate_wdl_paths(wdp_path: Path) -> Tuple[Path, Path]:
    project_stem = wdp_path.stem or "project"
    project_root = wdp_path.parent
    return (
        project_root / f"{project_stem}_wdtitle.wdl",
        wdp_path.with_suffix(".wdl"),
    )


def _resolve_wdp_path(
    project_root: Path,
    discovered_files: Sequence[Path],
    profile: Dict[str, str | None],
    artifacts: Dict[str, Any],
) -> Tuple[Path, bool]:
    configured_path = _normalize_text(
        profile.get("acadeProjectFilePath") or profile.get("acade_project_file_path")
    )
    if configured_path:
        configured_name = PurePosixPath(configured_path.replace("\\", "/")).name
        if configured_name:
            return project_root / configured_name, bool(artifacts.get("wdpExists"))

    artifact_path = _normalize_text(artifacts.get("wdpPath"))
    if artifact_path:
        artifact_name = PurePosixPath(artifact_path.replace("\\", "/")).name
        if artifact_name:
            return project_root / artifact_name, bool(artifacts.get("wdpExists"))

    wdp_files = [path for path in discovered_files if path.suffix.lower() == ".wdp"]
    if wdp_files:
        return wdp_files[0], True

    stem = _sanitize_acade_project_stem(profile.get("projectName")) or _sanitize_acade_project_stem(project_root.name)
    return project_root / f"{stem}.wdp", False


def _resolve_wdl_path(
    discovered_files: Sequence[Path],
    wdp_path: Path,
) -> Path:
    discovered_wdl_paths = {
        str(path).lower(): path
        for path in discovered_files
        if path.suffix.lower() == ".wdl"
    }
    for candidate in _candidate_wdl_paths(wdp_path):
        existing = discovered_wdl_paths.get(str(candidate).lower())
        if existing is not None:
            return existing
    return _candidate_wdl_paths(wdp_path)[0]


def _build_mapping_paths(
    project_root: Path,
    discovered_files: Sequence[Path],
    profile: Dict[str, str | None],
    artifacts: Dict[str, Any],
) -> Tuple[Path, Path, Path, bool]:
    wdp_path, wdp_exists = _resolve_wdp_path(project_root, discovered_files, profile, artifacts)
    return (
        wdp_path,
        wdp_path.with_suffix(".wdt"),
        _resolve_wdl_path(discovered_files, wdp_path),
        wdp_exists,
    )


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
    config_lines = (
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
    lines: List[str] = [f"*[1]{project_owner}"]
    if project_desc:
        lines.append(f"*[2]{project_desc}")
    if project_number:
        lines.append(f"*[4]{project_number}")
    lines.extend(config_lines)
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


def _resolve_existing_or_generated_text(existing_text: str | None, generated_text: str) -> str:
    return existing_text or generated_text


def _resolve_wdp_state(*, wdp_exists: bool, existing_text: str | None, generated_text: str) -> str:
    if not wdp_exists:
        return "starter"
    normalized_existing = (existing_text or "").replace("\r\n", "\n").strip()
    normalized_generated = (generated_text or "").replace("\r\n", "\n").strip()
    if not normalized_existing or normalized_existing == normalized_generated:
        return "starter"
    return "existing"


def _parse_wdt_definition_text(wdt_text: str, wdt_path: str) -> Dict[str, Any]:
    sections: List[Dict[str, Any]] = []
    current_section: Optional[Dict[str, Any]] = None
    for raw_line in str(wdt_text or "").replace("\r\n", "\n").split("\n"):
        line = raw_line.strip()
        if not line or line.startswith(";") or "=" not in line:
            continue
        raw_key, raw_value = line.split("=", 1)
        key = _normalize_upper(raw_key.lstrip("`"))
        value = _normalize_text(raw_value).strip('"')
        if not key:
            continue
        if key == "BLOCK":
            block_names = [_normalize_text(part) for part in value.split(",") if _normalize_text(part)]
            current_section = {"blockNames": block_names, "attributeMap": {}}
            sections.append(current_section)
            continue
        if current_section is None:
            continue
        attribute_map = current_section.get("attributeMap")
        if isinstance(attribute_map, dict):
            attribute_map[key] = _normalize_upper(value)
    return {"path": wdt_path, "sections": sections}


def _resolve_wdt_section(
    *,
    wdt_definition: Dict[str, Any],
    block_name: str,
    current_attributes: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    sections = [
        section
        for section in (wdt_definition.get("sections") or [])
        if isinstance(section, dict)
    ]
    if not sections:
        return None
    if len(sections) == 1:
        return sections[0]

    normalized_block_name = "".join(ch for ch in _normalize_text(block_name).upper() if ch.isalnum())
    if normalized_block_name:
        exact_match: Optional[Dict[str, Any]] = None
        contains_match: Optional[Dict[str, Any]] = None
        for section in sections:
            block_names = section.get("blockNames") or []
            for candidate in block_names:
                normalized_candidate = "".join(ch for ch in _normalize_text(candidate).upper() if ch.isalnum())
                if not normalized_candidate:
                    continue
                if normalized_block_name == normalized_candidate:
                    exact_match = section
                    break
                if normalized_candidate in normalized_block_name:
                    contains_match = section
            if exact_match is not None:
                break
        if exact_match is not None:
            return exact_match
        if contains_match is not None:
            return contains_match

    best_section = sections[0]
    best_score = -1
    current_attribute_tags = {
        _normalize_upper(tag)
        for tag in current_attributes.keys()
        if _normalize_text(tag)
    }
    for section in sections:
        attribute_map = section.get("attributeMap")
        if not isinstance(attribute_map, dict):
            continue
        score = sum(
            1
            for attribute_tag in attribute_map.keys()
            if _normalize_upper(attribute_tag) in current_attribute_tags
        )
        if score > best_score:
            best_score = score
            best_section = section
    return best_section


def _resolve_row_wdt_attribute_map(
    row: Dict[str, Any],
    wdt_definition: Dict[str, Any],
) -> Dict[str, str]:
    existing_attribute_map = row.get("wdtAttributeMap")
    if isinstance(existing_attribute_map, dict) and existing_attribute_map:
        return {
            _normalize_upper(key): _normalize_upper(value)
            for key, value in existing_attribute_map.items()
            if _normalize_text(key) and _normalize_text(value)
        }

    current_attributes = row.get("currentAttributes")
    normalized_current_attributes = (
        {
            _normalize_upper(key): _normalize_text(value)
            for key, value in current_attributes.items()
            if _normalize_text(key)
        }
        if isinstance(current_attributes, dict)
        else {}
    )
    section = _resolve_wdt_section(
        wdt_definition=wdt_definition,
        block_name=_normalize_text(row.get("effectiveBlockName")),
        current_attributes=normalized_current_attributes,
    )
    if not isinstance(section, dict):
        return {}
    attribute_map = section.get("attributeMap")
    if not isinstance(attribute_map, dict):
        return {}
    return {
        _normalize_upper(key): _normalize_upper(value)
        for key, value in attribute_map.items()
        if _normalize_text(key) and _normalize_text(value)
    }


def _extract_current_acade_values(
    current_attributes: Dict[str, str],
    wdt_attribute_map: Dict[str, str],
) -> Dict[str, str]:
    current_values: Dict[str, str] = {}
    for attribute_tag, source_key in wdt_attribute_map.items():
        attribute_value = _normalize_text(current_attributes.get(attribute_tag))
        if not attribute_value or not source_key:
            continue
        current_values.setdefault(source_key, attribute_value)

    if not current_values.get("DWGNAM"):
        current_values["DWGNAM"] = _normalize_text(
            current_attributes.get("DWGNO") or current_attributes.get("DWG_NO")
        )
    if not current_values.get("DWGDESC"):
        current_values["DWGDESC"] = _normalize_text(
            current_attributes.get("TITLE3")
            or current_attributes.get("TITLE2")
            or current_attributes.get("TITLE5")
        )
    if not current_values.get("LINE1"):
        current_values["LINE1"] = _normalize_text(current_attributes.get("TITLE1"))
    if not current_values.get("LINE2"):
        current_values["LINE2"] = _normalize_text(current_attributes.get("TITLE2"))
    if not current_values.get("LINE4"):
        current_values["LINE4"] = _normalize_text(current_attributes.get("PROJ"))
    return current_values


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


def _derive_cadno(dwgno: Any) -> str:
    return _normalize_drawing_key(dwgno)


def _build_desired_row_state(
    *,
    row: Dict[str, Any],
    profile: Dict[str, str | None],
    revision_entries: Sequence[Dict[str, Any]],
    wdt_attribute_map: Dict[str, str],
) -> Dict[str, Any]:
    current_attributes = row.get("currentAttributes")
    if not isinstance(current_attributes, dict):
        current_attributes = {}
    editable_fields = row.get("editableFields")
    if not isinstance(editable_fields, dict):
        editable_fields = {}

    current_acade_values = _extract_current_acade_values(current_attributes, wdt_attribute_map)
    filename_drawing_number = _normalize_text(row.get("filenameDrawingNumber"))
    filename_title = _normalize_text(row.get("filenameTitle"))

    drawing_number = (
        filename_drawing_number
        or current_acade_values.get("DWGNAM", "")
        or _normalize_text(row.get("drawingNumber"))
    )
    if filename_drawing_number:
        drawing_title = (
            filename_title
            or current_acade_values.get("DWGDESC", "")
            or Path(str(row.get("fileName") or "")).stem
        )
    else:
        drawing_title = (
            current_acade_values.get("DWGDESC", "")
            or filename_title
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
    acade_expected_tags: Dict[str, str] = {}
    for attribute_tag, source_key in wdt_attribute_map.items():
        normalized_source_key = _normalize_upper(source_key)
        if normalized_source_key not in DETERMINISTIC_WDT_SOURCE_KEYS:
            continue
        next_value = _normalize_text(acade_values.get(normalized_source_key))
        if normalized_source_key in {"LINE1", "LINE2", "LINE4"} and not next_value:
            continue
        acade_expected_tags[_normalize_upper(attribute_tag)] = next_value
    if not acade_expected_tags:
        if acade_values["DWGNAM"]:
            acade_expected_tags["DWGNO"] = acade_values["DWGNAM"]
        if acade_values["LINE1"]:
            acade_expected_tags["TITLE1"] = acade_values["LINE1"]
        if acade_values["LINE2"]:
            acade_expected_tags["TITLE2"] = acade_values["LINE2"]
        if acade_values["DWGDESC"]:
            acade_expected_tags["TITLE3"] = acade_values["DWGDESC"]
        if acade_values["LINE4"]:
            acade_expected_tags["PROJ"] = acade_values["LINE4"]

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
        "acadeExpectedTags": acade_expected_tags,
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
    wdt_definition: Dict[str, Any],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    for absolute_path in discovered_files:
        relative_path = _relative_path(project_root, absolute_path)
        file_type = absolute_path.suffix.lower().lstrip(".")
        stem = absolute_path.stem
        filename_drawing_number = _find_filename_drawing_number(stem)
        filename_title = _derive_filename_title(stem, filename_drawing_number)
        bridge_row = bridge_drawings_by_path.get(normalize_runtime_path(str(absolute_path)), {})
        current_attributes = {
            _normalize_upper(key): _normalize_text(value)
            for key, value in (bridge_row.get("attributes") or {}).items()
            if _normalize_text(key)
        }
        wdt_section = _resolve_wdt_section(
            wdt_definition=wdt_definition,
            block_name=_normalize_text(bridge_row.get("blockName")),
            current_attributes=current_attributes,
        )
        wdt_attribute_map = (
            {
                _normalize_upper(key): _normalize_upper(value)
                for key, value in (wdt_section.get("attributeMap") or {}).items()
                if _normalize_text(key) and _normalize_text(value)
            }
            if isinstance(wdt_section, dict)
            else {}
        )
        current_acade_values = _extract_current_acade_values(current_attributes, wdt_attribute_map)
        matched_revision_entries = _match_revision_entries(
            revision_entries=revision_entries,
            drawing_number=current_acade_values.get("DWGNAM", "") or filename_drawing_number,
            file_name=absolute_path.name,
            relative_path=relative_path,
        )
        issues: List[str] = []
        if file_type == "dwg" and not bridge_row.get("titleBlockFound"):
            issues.append("Title block not found in drawing scan.")
        if bridge_row.get("hasWdTb"):
            issues.append("WD_TB attribute detected. Embedded mapping conflicts with external .WDT.")
        title_block_dwgno = current_acade_values.get("DWGNAM", "")
        if filename_drawing_number and title_block_dwgno:
            if _normalize_drawing_key(filename_drawing_number) != _normalize_drawing_key(title_block_dwgno):
                issues.append("Filename drawing number does not match title block DWGNO.")
        title_block_project_number = current_acade_values.get("LINE4", "")
        expected_project_number = _normalize_text(profile.get("acadeLine4"))
        if title_block_project_number and expected_project_number and title_block_project_number != expected_project_number:
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
            "wdtBlockNames": list((wdt_section or {}).get("blockNames") or []),
            "wdtAttributeMap": wdt_attribute_map,
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
                wdt_attribute_map=wdt_attribute_map,
            )
        )
        rows.append(row)

    return rows


def _rebuild_rows_for_preview_or_apply(
    *,
    rows: Sequence[Dict[str, Any]],
    profile: Dict[str, str | None],
    revision_entries: Sequence[Dict[str, Any]],
    wdt_definition: Dict[str, Any],
) -> List[Dict[str, Any]]:
    next_rows: List[Dict[str, Any]] = []
    for row in rows:
        wdt_attribute_map = _resolve_row_wdt_attribute_map(row, wdt_definition)
        current_attributes = row.get("currentAttributes")
        normalized_current_attributes = (
            {
                _normalize_upper(key): _normalize_text(value)
                for key, value in current_attributes.items()
                if _normalize_text(key)
            }
            if isinstance(current_attributes, dict)
            else {}
        )
        current_acade_values = _extract_current_acade_values(normalized_current_attributes, wdt_attribute_map)
        matched_revision_entries = _match_revision_entries(
            revision_entries=revision_entries,
            drawing_number=(
                _normalize_text(row.get("drawingNumber"))
                or _normalize_text(row.get("filenameDrawingNumber"))
                or current_acade_values.get("DWGNAM", "")
            ),
            file_name=_normalize_text(row.get("fileName")),
            relative_path=_normalize_text(row.get("relativePath")),
        )
        next_row = dict(row)
        next_row["wdtAttributeMap"] = wdt_attribute_map
        next_row["revisionEntryCount"] = len(matched_revision_entries)
        next_row.update(
            _build_desired_row_state(
                row=next_row,
                profile=profile,
                revision_entries=matched_revision_entries,
                wdt_attribute_map=wdt_attribute_map,
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


def _normalize_snapshot_file_entries(
    project_root: Path,
    files: Iterable[Dict[str, Any]],
) -> List[Path]:
    normalized: List[Path] = []
    seen: set[str] = set()
    for entry in files:
        absolute_path = _normalize_text(entry.get("absolutePath") or entry.get("path"))
        if not absolute_path:
            relative_path = _normalize_text(entry.get("relativePath"))
            if relative_path:
                absolute_path = str(project_root / relative_path.replace("/", "\\"))
        if not absolute_path:
            continue
        try:
            path = Path(absolute_path)
        except Exception:
            continue
        if path.suffix.lower() not in TITLE_BLOCK_FILE_EXTENSIONS:
            continue
        key = normalize_runtime_path(str(path))
        if key in seen:
            continue
        seen.add(key)
        normalized.append(path)
    normalized.sort(key=lambda item: str(item).lower())
    return normalized


def _normalize_bridge_rows(
    rows: Iterable[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    normalized: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        path_value = _normalize_text(row.get("path") or row.get("absolutePath"))
        if not path_value:
            continue
        normalized[normalize_runtime_path(path_value)] = dict(row)
    return normalized


def _build_artifact_preview_from_snapshot(
    *,
    project_root: Path,
    discovered_files: Sequence[Path],
    profile: Dict[str, str | None],
    artifacts_input: Dict[str, Any],
) -> Dict[str, Any]:
    wdp_path, wdt_path, wdl_path, wdp_exists = _build_mapping_paths(
        project_root,
        discovered_files,
        profile,
        artifacts_input,
    )
    generated_wdp_text = _build_wdp_text(
        project_root=project_root,
        discovered_files=discovered_files,
        profile=profile,
        wdp_path=wdp_path,
    )
    generated_wdt_text = _build_wdt_text(profile)
    generated_wdl_text = _build_wdl_text()
    existing_wdp_text = _normalize_text(artifacts_input.get("wdpText")) or None
    existing_wdt_text = _normalize_text(artifacts_input.get("wdtText")) or None
    existing_wdl_text = _normalize_text(artifacts_input.get("wdlText")) or None
    return {
        "wdpPath": str(wdp_path),
        "wdtPath": str(wdt_path),
        "wdlPath": str(wdl_path),
        "wdpText": _resolve_existing_or_generated_text(existing_wdp_text, generated_wdp_text),
        "wdtText": _resolve_existing_or_generated_text(existing_wdt_text, generated_wdt_text),
        "wdlText": _resolve_existing_or_generated_text(existing_wdl_text, generated_wdl_text),
        "wdpState": _resolve_wdp_state(
            wdp_exists=bool(artifacts_input.get("wdpExists", wdp_exists)),
            existing_text=existing_wdp_text,
            generated_text=generated_wdp_text,
        ),
        "wdPickPrjDlgFolder": _normalize_text(artifacts_input.get("wdPickPrjDlgFolder")) or str(wdp_path.parent),
        "wdPickPrjDlgUpdatedPaths": list(artifacts_input.get("wdPickPrjDlgUpdatedPaths") or []),
    }


def _read_scan_snapshot(payload: Dict[str, Any]) -> Dict[str, Any]:
    snapshot = payload.get("scanSnapshot") or payload.get("scan_snapshot")
    return snapshot if isinstance(snapshot, dict) else {}


def build_preview_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    project_root_path = _normalize_text(payload.get("projectRootPath") or payload.get("project_root_path"))
    if not project_root_path:
        raise ValueError("projectRootPath is required.")
    if not is_absolute_path_value(project_root_path):
        raise ValueError("projectRootPath must be an absolute path.")

    project_root = Path(project_root_path)
    profile = _read_profile(payload, project_root_path)
    revision_entries = _read_revision_entries(payload)
    provided_rows = _read_scan_rows(payload)
    scan_snapshot = _read_scan_snapshot(payload)
    snapshot_files = scan_snapshot.get("files")
    files = snapshot_files if isinstance(snapshot_files, list) else []
    bridge_rows_raw = scan_snapshot.get("bridgeDrawings") or scan_snapshot.get("bridge_drawings") or []
    bridge_rows = bridge_rows_raw if isinstance(bridge_rows_raw, list) else []
    artifacts_input = scan_snapshot.get("artifacts")
    artifacts_input = artifacts_input if isinstance(artifacts_input, dict) else {}
    discovered_files = _normalize_snapshot_file_entries(project_root, files)
    if not discovered_files and not provided_rows:
        raise ValueError("scanSnapshot.files must contain at least one project file.")

    artifacts = _build_artifact_preview_from_snapshot(
        project_root=project_root,
        discovered_files=discovered_files,
        profile=profile,
        artifacts_input=artifacts_input,
    )
    wdt_definition = _parse_wdt_definition_text(
        _normalize_text(artifacts.get("wdtText")) or _build_wdt_text(profile),
        _normalize_text(artifacts.get("wdtPath")),
    )

    if provided_rows:
        rows = _rebuild_rows_for_preview_or_apply(
            rows=provided_rows,
            profile=profile,
            revision_entries=revision_entries,
            wdt_definition=wdt_definition,
        )
    else:
        bridge_drawings_by_path = _normalize_bridge_rows(bridge_rows)
        rows = _build_scan_rows(
            project_root=project_root,
            discovered_files=discovered_files,
            profile=profile,
            bridge_drawings_by_path=bridge_drawings_by_path,
            revision_entries=revision_entries,
            wdt_definition=wdt_definition,
        )

    warnings = []
    for source in (payload.get("warnings"), scan_snapshot.get("warnings")):
        if isinstance(source, list):
            warnings.extend(_normalize_text(item) for item in source if _normalize_text(item))

    return {
        "projectRootPath": project_root_path,
        "profile": profile,
        "drawings": rows,
        "summary": _summarize_rows(rows),
        "artifacts": artifacts,
        "warnings": warnings,
    }


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _canonical_ticket_payload(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def create_ticket_payload(
    *,
    secret: str,
    user_id: str,
    action: str,
    request_id: str,
    origin: str | None,
    project_id: str | None = None,
    ttl_seconds: int = 180,
) -> Dict[str, Any]:
    issued_at = int(time.time())
    expires_at = issued_at + max(30, int(ttl_seconds or 180))
    claims = {
        "userId": _normalize_text(user_id),
        "action": _normalize_text(action),
        "requestId": _normalize_text(request_id),
        "origin": _normalize_text(origin),
        "projectId": _normalize_text(project_id),
        "issuedAt": issued_at,
        "expiresAt": expires_at,
    }
    encoded_payload = _base64url_encode(_canonical_ticket_payload(claims))
    signature = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "ticket": f"{encoded_payload}.{signature}",
        "requestId": claims["requestId"],
        "action": claims["action"],
        "issuedAt": claims["issuedAt"],
        "expiresAt": claims["expiresAt"],
        "ttlSeconds": claims["expiresAt"] - claims["issuedAt"],
        "projectId": claims["projectId"] or None,
    }


def _supabase_headers(user_token: str, supabase_api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {user_token}",
        "apikey": supabase_api_key,
        "Content-Type": "application/json",
    }


def _supabase_rest_url(supabase_url: str, table_path: str) -> str:
    return f"{supabase_url.rstrip('/')}/rest/v1/{table_path.lstrip('/')}"


def _is_missing_profile_storage(error_message: str) -> bool:
    normalized = _normalize_text(error_message).lower()
    return (
        "project_title_block_profiles" in normalized
        and ("does not exist" in normalized or "not found" in normalized or "could not find" in normalized)
    )


def fetch_profile_row(
    *,
    project_id: str,
    user_id: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    project_root_path: str | None = None,
    requests_module: Any = requests,
) -> Tuple[Dict[str, Any], Optional[str], int]:
    default_row = _build_default_profile_values(project_id, user_id, project_root_path)
    if not project_id:
        return default_row, "Project id is required.", 400
    if not user_token:
        return default_row, "Authorization bearer token required.", 401
    if not supabase_url or not supabase_api_key:
        return default_row, "Supabase backend credentials are not configured.", 503

    try:
        response = requests_module.get(
            _supabase_rest_url(supabase_url, "project_title_block_profiles"),
            headers=_supabase_headers(user_token, supabase_api_key),
            params={
                "select": "*",
                "project_id": f"eq.{project_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
            timeout=8,
        )
    except Exception as exc:
        return default_row, f"Supabase REST request failed: {exc}", 0

    if response.status_code >= 400:
        try:
            message = str((response.json() or {}).get("message") or response.text or "").strip()
        except Exception:
            message = str(response.text or "").strip()
        if _is_missing_profile_storage(message):
            return default_row, None, 200
        return default_row, message or f"HTTP {response.status_code}", response.status_code

    try:
        payload = response.json() if response.content else []
    except Exception:
        payload = []

    if isinstance(payload, list) and payload:
        row = payload[0]
        if project_root_path and not row.get("project_root_path"):
            row["project_root_path"] = project_root_path
        return row, None, 200

    return default_row, None, 200


def upsert_profile_row(
    *,
    project_id: str,
    user_id: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    payload: Dict[str, Any],
    requests_module: Any = requests,
) -> Tuple[Dict[str, Any], Optional[str], int]:
    if not project_id:
        return {}, "Project id is required.", 400
    if not user_token:
        return {}, "Authorization bearer token required.", 401
    if not supabase_url or not supabase_api_key:
        return {}, "Supabase backend credentials are not configured.", 503

    row_payload = {
        "project_id": project_id,
        "user_id": user_id,
        "block_name": _normalize_text(payload.get("blockName")) or DEFAULT_BLOCK_NAME,
        "project_root_path": _normalize_text(payload.get("projectRootPath")) or None,
        "acade_project_file_path": _normalize_text(payload.get("acadeProjectFilePath")) or None,
        "acade_line1": _normalize_text(payload.get("acadeLine1")),
        "acade_line2": _normalize_text(payload.get("acadeLine2")),
        "acade_line4": _normalize_text(payload.get("acadeLine4")),
        "signer_drawn_by": _normalize_text(payload.get("signerDrawnBy")),
        "signer_checked_by": _normalize_text(payload.get("signerCheckedBy")),
        "signer_engineer": _normalize_text(payload.get("signerEngineer")),
    }

    try:
        response = requests_module.post(
            _supabase_rest_url(supabase_url, "project_title_block_profiles"),
            headers={
                **_supabase_headers(user_token, supabase_api_key),
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
            params={"on_conflict": "project_id"},
            json=row_payload,
            timeout=8,
        )
    except Exception as exc:
        return {}, f"Supabase REST request failed: {exc}", 0

    if response.status_code >= 400:
        try:
            message = str((response.json() or {}).get("message") or response.text or "").strip()
        except Exception:
            message = str(response.text or "").strip()
        return {}, message or f"HTTP {response.status_code}", response.status_code

    try:
        payload_json = response.json() if response.content else []
    except Exception:
        payload_json = []

    if isinstance(payload_json, list) and payload_json:
        return payload_json[0], None, response.status_code
    return row_payload, None, response.status_code
