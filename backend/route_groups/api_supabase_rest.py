from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import requests


def supabase_rest_base_url(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/rest/v1"


def supabase_service_rest_headers(
    supabase_url: str,
    supabase_service_role_key: str,
    *,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, str]]:
    if not supabase_url or not supabase_service_role_key:
        return None

    headers = {
        "Authorization": f"Bearer {supabase_service_role_key}",
        "apikey": supabase_service_role_key,
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    return headers


def extract_supabase_error_message(response: Any) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            for key in ("msg", "message", "error_description", "error", "hint", "details"):
                value = str(payload.get(key) or "").strip()
                if value:
                    return value
    except Exception:
        pass

    body = str(getattr(response, "text", "") or "").strip()
    if body:
        return body[:240]
    status_code = int(getattr(response, "status_code", 0) or 0)
    return f"HTTP {status_code}"


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
    requests_module: Any = requests,
    extract_supabase_error_message_fn: Any = extract_supabase_error_message,
) -> Tuple[Optional[Any], Optional[str], int]:
    headers = supabase_service_rest_headers(
        supabase_url,
        supabase_service_role_key,
        extra_headers=extra_headers,
    )
    if not headers:
        return None, "Supabase service role credentials are not configured.", 0

    endpoint = f"{supabase_rest_base_url(supabase_url)}/{table_path.lstrip('/')}"
    try:
        response = requests_module.request(
            method=method,
            url=endpoint,
            headers=headers,
            params=params,
            json=payload,
            timeout=timeout,
        )
    except Exception as exc:
        return None, f"Supabase REST request failed: {exc}", 0

    if response.status_code >= 400:
        return None, extract_supabase_error_message_fn(response), response.status_code

    if response.status_code == 204 or not response.content:
        return None, None, response.status_code

    try:
        return response.json(), None, response.status_code
    except Exception:
        return response.text, None, response.status_code
