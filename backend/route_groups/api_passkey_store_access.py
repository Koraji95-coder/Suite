from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from .api_passkey_store import (
    fetch_active_passkey_by_credential_id as passkey_store_fetch_active_passkey_by_credential_id,
    fetch_active_passkeys_for_user_id as passkey_store_fetch_active_passkeys_for_user_id,
    insert_user_passkey_row as passkey_store_insert_user_passkey_row,
    update_user_passkey_row as passkey_store_update_user_passkey_row,
)


def fetch_active_passkeys_for_user_id(
    user_id: str,
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
    logger: Any,
) -> List[Dict[str, Any]]:
    return passkey_store_fetch_active_passkeys_for_user_id(
        user_id,
        supabase_service_rest_request=supabase_service_rest_request,
        logger=logger,
    )


def fetch_active_passkey_by_credential_id(
    credential_id: str,
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
    logger: Any,
) -> Optional[Dict[str, Any]]:
    return passkey_store_fetch_active_passkey_by_credential_id(
        credential_id,
        supabase_service_rest_request=supabase_service_rest_request,
        logger=logger,
    )


def insert_user_passkey_row(
    passkey_row: Dict[str, Any],
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    return passkey_store_insert_user_passkey_row(
        passkey_row,
        supabase_service_rest_request=supabase_service_rest_request,
    )


def update_user_passkey_row(
    passkey_id: str,
    patch: Dict[str, Any],
    *,
    supabase_service_rest_request: Callable[..., Tuple[Optional[Any], Optional[str], int]],
) -> Tuple[bool, Optional[str], int]:
    return passkey_store_update_user_passkey_row(
        passkey_id,
        patch,
        supabase_service_rest_request=supabase_service_rest_request,
    )
