from __future__ import annotations

from typing import Any, Callable, Dict, Optional


def get_supabase_user_id(user: Dict[str, Any]) -> Optional[str]:
    return (user.get("id") or user.get("sub") or "").strip() or None


def get_supabase_user_email(
    user: Dict[str, Any], *, is_valid_email_fn: Callable[[str], bool]
) -> Optional[str]:
    email = str(user.get("email") or "").strip().lower()
    if not is_valid_email_fn(email):
        return None
    return email


def get_bearer_token(*, request_obj: Any) -> Optional[str]:
    auth = request_obj.headers.get("Authorization", "")
    if not auth:
        return None
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None
