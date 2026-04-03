from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import requests

PROJECT_STANDARDS_PROFILE_SETTING_KEY = "project_standards_profile"
PROJECT_STANDARDS_LATEST_REVIEW_SETTING_KEY = "project_standards_latest_review"
DEFAULT_STANDARDS_CATEGORY = "NEC"
ALLOWED_STANDARDS_CATEGORIES = ("NEC", "IEEE", "IEC")
ALLOWED_REVIEW_STATUSES = ("pass", "warning", "fail")


def _timestamp_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_category(value: Any) -> str:
    candidate = _normalize_text(value).upper()
    if candidate in ALLOWED_STANDARDS_CATEGORIES:
        return candidate
    return DEFAULT_STANDARDS_CATEGORY


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: set[str] = set()
    normalized: list[str] = []
    for entry in value:
        item = _normalize_text(entry)
        if not item:
            continue
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(item)
    return normalized


def _normalize_review_status(value: Any) -> str:
    candidate = _normalize_text(value).lower()
    if candidate in ALLOWED_REVIEW_STATUSES:
        return candidate
    return "warning"


def _normalize_review_results(value: Any) -> list[Dict[str, Any]]:
    if not isinstance(value, list):
        return []

    seen: set[str] = set()
    normalized: list[Dict[str, Any]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue

        standard_id = _normalize_text(
            entry.get("standardId") or entry.get("standard_id")
        )
        if not standard_id:
            continue

        lowered = standard_id.lower()
        if lowered in seen:
            continue
        seen.add(lowered)

        normalized.append(
            {
                "standardId": standard_id,
                "status": _normalize_review_status(entry.get("status")),
                "message": _normalize_text(entry.get("message"))
                or "Native standards review did not return a detailed message.",
            }
        )

    return normalized


def _normalize_summary(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    normalized: Dict[str, Any] = {}
    for key in (
        "drawingCount",
        "inspectedDrawingCount",
        "dwsFileCount",
        "suspiciousLayerCount",
        "openFailureCount",
    ):
        raw = value.get(key)
        if raw is None:
            continue
        try:
            normalized[key] = max(0, int(raw))
        except Exception:
            continue

    for key in ("activeDocumentName", "providerPath"):
        text_value = _normalize_text(value.get(key))
        if text_value:
            normalized[key] = text_value

    return normalized


def _normalize_meta(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    normalized: Dict[str, Any] = {}
    for key, item in value.items():
        if not isinstance(key, str) or item is None:
            continue
        if isinstance(item, (str, int, float, bool)):
            normalized[key] = item
            continue
        if isinstance(item, list):
            normalized[key] = [
                entry
                for entry in item
                if isinstance(entry, (str, int, float, bool)) and entry is not None
            ]
            continue
        if isinstance(item, dict):
            normalized[key] = {
                str(nested_key): nested_value
                for nested_key, nested_value in item.items()
                if isinstance(nested_key, str)
                and isinstance(nested_value, (str, int, float, bool))
                and nested_value is not None
            }

    return normalized


def _resolve_overall_status(results: list[Dict[str, Any]]) -> str:
    statuses = {str(entry.get("status") or "").lower() for entry in results}
    if "fail" in statuses:
        return "fail"
    if "warning" in statuses:
        return "warning"
    if "pass" in statuses:
        return "pass"
    return "warning"


def build_default_profile_row(
    project_id: str,
    user_id: str,
    *,
    cad_family_id: str | None = None,
) -> Dict[str, Any]:
    timestamp = _timestamp_now()
    return {
        "id": f"project-standards-profile:{_normalize_text(project_id)}",
        "projectId": _normalize_text(project_id),
        "userId": _normalize_text(user_id) or "local",
        "cadFamilyId": _normalize_text(cad_family_id) or None,
        "standardsCategory": DEFAULT_STANDARDS_CATEGORY,
        "selectedStandardIds": [],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def _normalize_profile_row(
    row: Dict[str, Any] | None,
    *,
    project_id: str,
    user_id: str,
) -> Dict[str, Any]:
    default_row = build_default_profile_row(project_id, user_id)
    if not isinstance(row, dict):
        return default_row

    setting_value = row.get("setting_value")
    profile_value = setting_value if isinstance(setting_value, dict) else {}
    return {
        "id": _normalize_text(row.get("id")) or default_row["id"],
        "projectId": _normalize_text(row.get("project_id")) or default_row["projectId"],
        "userId": _normalize_text(row.get("user_id")) or default_row["userId"],
        "cadFamilyId": _normalize_text(profile_value.get("cadFamilyId")) or None,
        "standardsCategory": _normalize_category(
            profile_value.get("standardsCategory")
        ),
        "selectedStandardIds": _normalize_string_list(
            profile_value.get("selectedStandardIds")
        ),
        "createdAt": _normalize_text(row.get("created_at")) or default_row["createdAt"],
        "updatedAt": _normalize_text(row.get("updated_at")) or default_row["updatedAt"],
    }


def _supabase_headers(user_token: str, supabase_api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {user_token}",
        "apikey": supabase_api_key,
        "Content-Type": "application/json",
    }


def _supabase_rest_url(supabase_url: str, path: str) -> str:
    return f"{supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"


def _is_missing_profile_storage(error_message: str) -> bool:
    normalized = _normalize_text(error_message).lower()
    return "user_settings" in normalized and (
        "does not exist" in normalized
        or "not found" in normalized
        or "could not find" in normalized
    )


def fetch_profile_row(
    *,
    project_id: str,
    user_id: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    requests_module: Any = requests,
) -> Tuple[Dict[str, Any], Optional[str], int]:
    default_row = build_default_profile_row(project_id, user_id)
    if not project_id:
        return default_row, "Project id is required.", 400
    if not user_token:
        return default_row, "Authorization bearer token required.", 401
    if not supabase_url or not supabase_api_key:
        return default_row, "Supabase backend credentials are not configured.", 503

    try:
        response = requests_module.get(
            _supabase_rest_url(supabase_url, "user_settings"),
            headers=_supabase_headers(user_token, supabase_api_key),
            params={
                "select": "id,user_id,project_id,setting_key,setting_value,created_at,updated_at",
                "user_id": f"eq.{user_id}",
                "project_id": f"eq.{project_id}",
                "setting_key": f"eq.{PROJECT_STANDARDS_PROFILE_SETTING_KEY}",
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
        return _normalize_profile_row(payload[0], project_id=project_id, user_id=user_id), None, 200

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

    profile_value = {
        "cadFamilyId": _normalize_text(payload.get("cadFamilyId")) or None,
        "standardsCategory": _normalize_category(payload.get("standardsCategory")),
        "selectedStandardIds": _normalize_string_list(
            payload.get("selectedStandardIds")
        ),
    }

    try:
        response = requests_module.post(
            _supabase_rest_url(supabase_url, "rpc/upsert_user_setting"),
            headers=_supabase_headers(user_token, supabase_api_key),
            json={
                "p_user_id": user_id,
                "p_setting_key": PROJECT_STANDARDS_PROFILE_SETTING_KEY,
                "p_setting_value": profile_value,
                "p_project_id": project_id,
            },
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

    profile_row, error_message, status_code = fetch_profile_row(
        project_id=project_id,
        user_id=user_id,
        user_token=user_token,
        supabase_url=supabase_url,
        supabase_api_key=supabase_api_key,
        requests_module=requests_module,
    )
    if error_message:
        fallback_row = build_default_profile_row(
            project_id,
            user_id,
            cad_family_id=profile_value["cadFamilyId"],
        )
        fallback_row["standardsCategory"] = profile_value["standardsCategory"]
        fallback_row["selectedStandardIds"] = profile_value["selectedStandardIds"]
        return fallback_row, error_message, status_code
    return profile_row, None, 200


def build_default_latest_review_row(
    project_id: str,
    user_id: str,
) -> Dict[str, Any]:
    timestamp = _timestamp_now()
    return {
        "id": f"project-standards-review:{_normalize_text(project_id)}",
        "projectId": _normalize_text(project_id),
        "userId": _normalize_text(user_id) or "local",
        "requestId": "",
        "recordedAt": timestamp,
        "cadFamilyId": None,
        "standardsCategory": DEFAULT_STANDARDS_CATEGORY,
        "selectedStandardIds": [],
        "results": [],
        "warnings": [],
        "summary": {},
        "meta": {},
        "overallStatus": "warning",
    }


def _normalize_latest_review_row(
    row: Dict[str, Any] | None,
    *,
    project_id: str,
    user_id: str,
) -> Dict[str, Any]:
    default_row = build_default_latest_review_row(project_id, user_id)
    if not isinstance(row, dict):
        return default_row

    setting_value = row.get("setting_value")
    review_value = setting_value if isinstance(setting_value, dict) else {}
    results = _normalize_review_results(review_value.get("results"))

    return {
        "id": _normalize_text(row.get("id")) or default_row["id"],
        "projectId": _normalize_text(row.get("project_id")) or default_row["projectId"],
        "userId": _normalize_text(row.get("user_id")) or default_row["userId"],
        "requestId": _normalize_text(review_value.get("requestId")),
        "recordedAt": _normalize_text(review_value.get("recordedAt"))
        or _normalize_text(row.get("updated_at"))
        or default_row["recordedAt"],
        "cadFamilyId": _normalize_text(review_value.get("cadFamilyId")) or None,
        "standardsCategory": _normalize_category(
            review_value.get("standardsCategory")
        ),
        "selectedStandardIds": _normalize_string_list(
            review_value.get("selectedStandardIds")
        ),
        "results": results,
        "warnings": _normalize_string_list(review_value.get("warnings")),
        "summary": _normalize_summary(review_value.get("summary")),
        "meta": _normalize_meta(review_value.get("meta")),
        "overallStatus": _normalize_review_status(
            review_value.get("overallStatus") or _resolve_overall_status(results)
        ),
    }


def fetch_latest_review_row(
    *,
    project_id: str,
    user_id: str,
    user_token: str,
    supabase_url: str,
    supabase_api_key: str,
    requests_module: Any = requests,
) -> Tuple[Dict[str, Any], Optional[str], int]:
    default_row = build_default_latest_review_row(project_id, user_id)
    if not project_id:
        return default_row, "Project id is required.", 400
    if not user_token:
        return default_row, "Authorization bearer token required.", 401
    if not supabase_url or not supabase_api_key:
        return default_row, "Supabase backend credentials are not configured.", 503

    try:
        response = requests_module.get(
            _supabase_rest_url(supabase_url, "user_settings"),
            headers=_supabase_headers(user_token, supabase_api_key),
            params={
                "select": "id,user_id,project_id,setting_key,setting_value,created_at,updated_at",
                "user_id": f"eq.{user_id}",
                "project_id": f"eq.{project_id}",
                "setting_key": f"eq.{PROJECT_STANDARDS_LATEST_REVIEW_SETTING_KEY}",
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
        return (
            _normalize_latest_review_row(
                payload[0],
                project_id=project_id,
                user_id=user_id,
            ),
            None,
            200,
        )

    return default_row, None, 200


def upsert_latest_review_row(
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

    results = _normalize_review_results(payload.get("results"))
    review_value = {
        "requestId": _normalize_text(payload.get("requestId")),
        "recordedAt": _normalize_text(payload.get("recordedAt")) or _timestamp_now(),
        "cadFamilyId": _normalize_text(payload.get("cadFamilyId")) or None,
        "standardsCategory": _normalize_category(payload.get("standardsCategory")),
        "selectedStandardIds": _normalize_string_list(payload.get("selectedStandardIds")),
        "results": results,
        "warnings": _normalize_string_list(payload.get("warnings")),
        "summary": _normalize_summary(payload.get("summary")),
        "meta": _normalize_meta(payload.get("meta")),
        "overallStatus": _resolve_overall_status(results),
    }

    try:
        response = requests_module.post(
            _supabase_rest_url(supabase_url, "rpc/upsert_user_setting"),
            headers=_supabase_headers(user_token, supabase_api_key),
            json={
                "p_user_id": user_id,
                "p_setting_key": PROJECT_STANDARDS_LATEST_REVIEW_SETTING_KEY,
                "p_setting_value": review_value,
                "p_project_id": project_id,
            },
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

    review_row, error_message, status_code = fetch_latest_review_row(
        project_id=project_id,
        user_id=user_id,
        user_token=user_token,
        supabase_url=supabase_url,
        supabase_api_key=supabase_api_key,
        requests_module=requests_module,
    )
    if error_message:
        fallback_row = build_default_latest_review_row(project_id, user_id)
        fallback_row.update(review_value)
        return fallback_row, error_message, status_code
    return review_row, None, 200
