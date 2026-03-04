from __future__ import annotations

from typing import Any, Optional


def looks_like_uuid(value: str) -> bool:
    if not value:
        return False
    if len(value) != 36:
        return False
    if value.count("-") != 4:
        return False
    return True


def get_supabase_jwks_client(
    *,
    supabase_jwks_url: str,
    cached_client: Optional[Any],
    py_jwk_client_cls: Any,
) -> Optional[Any]:
    if not supabase_jwks_url:
        return None
    if cached_client is None:
        return py_jwk_client_cls(supabase_jwks_url)
    return cached_client
