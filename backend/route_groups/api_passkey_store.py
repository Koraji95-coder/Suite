from __future__ import annotations

import hashlib
from typing import Any, Callable, Dict, List, Optional, Tuple


_PASSKEY_SELECT_FIELDS = (
    "id,user_id,user_email,credential_id,public_key,sign_count,aaguid,"
    "device_type,backed_up,transports,friendly_name,last_used_at,revoked_at,created_at"
)


def fetch_active_passkeys_for_user_id(
    user_id: str,
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
    logger: Any,
) -> List[Dict[str, Any]]:
    normalized_user_id = user_id.strip()
    if not normalized_user_id:
        return []

    payload, error, status_code = supabase_service_rest_request(
        "GET",
        "user_passkeys",
        params={
            "select": _PASSKEY_SELECT_FIELDS,
            "user_id": f"eq.{normalized_user_id}",
            "revoked_at": "is.null",
            "order": "created_at.asc",
        },
    )
    if error:
        logger.warning(
            "Failed to query passkeys by user_id (status=%s user_id=%s): %s",
            status_code,
            normalized_user_id,
            error,
        )
        return []

    if not isinstance(payload, list):
        return []
    return [row for row in payload if isinstance(row, dict)]


def fetch_active_passkey_by_credential_id(
    credential_id: str,
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
    logger: Any,
) -> Optional[Dict[str, Any]]:
    normalized_credential_id = credential_id.strip()
    if not normalized_credential_id:
        return None

    payload, error, status_code = supabase_service_rest_request(
        "GET",
        "user_passkeys",
        params={
            "select": _PASSKEY_SELECT_FIELDS,
            "credential_id": f"eq.{normalized_credential_id}",
            "revoked_at": "is.null",
            "limit": "1",
        },
    )
    if error:
        logger.warning(
            "Failed to query passkey by credential_id (status=%s id_hash=%s): %s",
            status_code,
            hashlib.sha256(normalized_credential_id.encode("utf-8")).hexdigest()[:12],
            error,
        )
        return None

    if not isinstance(payload, list) or not payload:
        return None
    first = payload[0]
    return first if isinstance(first, dict) else None


def insert_user_passkey_row(
    passkey_row: Dict[str, Any],
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    payload, error, status_code = supabase_service_rest_request(
        "POST",
        "user_passkeys",
        payload=passkey_row,
        extra_headers={"Prefer": "return=representation"},
    )
    if error:
        return None, error, status_code

    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict):
            return first, None, status_code
    if isinstance(payload, dict):
        return payload, None, status_code
    return None, None, status_code


def update_user_passkey_row(
    passkey_id: str,
    patch: Dict[str, Any],
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
) -> Tuple[bool, Optional[str], int]:
    normalized_passkey_id = passkey_id.strip()
    if not normalized_passkey_id:
        return False, "passkey id is required.", 0

    _, error, status_code = supabase_service_rest_request(
        "PATCH",
        "user_passkeys",
        params={"id": f"eq.{normalized_passkey_id}"},
        payload=patch,
    )
    if error:
        return False, error, status_code
    return True, None, status_code
