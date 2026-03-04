from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from .api_supabase_rest import (
    extract_supabase_error_message as supabase_rest_extract_supabase_error_message,
    supabase_rest_base_url as supabase_rest_base_url_helper,
    supabase_service_rest_headers as supabase_service_rest_headers_helper,
    supabase_service_rest_request as supabase_service_rest_request_helper,
)


def supabase_rest_base_url(*, supabase_url: str) -> str:
    return supabase_rest_base_url_helper(supabase_url)


def supabase_service_rest_headers(
    *,
    supabase_url: str,
    supabase_service_role_key: str,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, str]]:
    return supabase_service_rest_headers_helper(
        supabase_url,
        supabase_service_role_key,
        extra_headers=extra_headers,
    )


def extract_supabase_error_message(response: Any) -> str:
    return supabase_rest_extract_supabase_error_message(response)


def supabase_service_rest_request(
    method: str,
    table_path: str,
    *,
    supabase_url: str,
    supabase_service_role_key: str,
    params: Optional[Dict[str, str]] = None,
    payload: Optional[Any] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    timeout: int = 8,
    requests_module: Any,
    extract_supabase_error_message_fn: Optional[Any] = None,
) -> Tuple[Optional[Any], Optional[str], int]:
    return supabase_service_rest_request_helper(
        method,
        table_path,
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        params=params,
        payload=payload,
        extra_headers=extra_headers,
        timeout=timeout,
        requests_module=requests_module,
        extract_supabase_error_message_fn=(
            extract_supabase_error_message
            if extract_supabase_error_message_fn is None
            else extract_supabase_error_message_fn
        ),
    )
