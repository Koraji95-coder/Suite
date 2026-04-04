from __future__ import annotations

from functools import wraps
import time
from typing import Any, Callable, Dict, Optional

from .api_supabase_auth import SupabaseAuthProviderTimeoutError


def decorate_require_supabase_user(
    f: Callable,
    *,
    get_bearer_token_fn: Callable[[], Optional[str]],
    verify_supabase_user_token_fn: Callable[[str], Optional[Dict[str, Any]]],
    jsonify_fn: Callable[[Dict[str, Any]], Any],
    g_obj: Any,
    logger: Optional[Any] = None,
    get_request_id_fn: Optional[Callable[[], str]] = None,
    get_request_path_fn: Optional[Callable[[], str]] = None,
) -> Callable:
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_bearer_token_fn()
        if not token:
            return jsonify_fn({"error": "Authorization bearer token required"}), 401

        try:
            user = verify_supabase_user_token_fn(token)
        except SupabaseAuthProviderTimeoutError as exc:
            request_id = ""
            if callable(get_request_id_fn):
                try:
                    request_id = str(get_request_id_fn() or "").strip()
                except Exception:
                    request_id = ""
            if not request_id:
                request_id = f"auth-{int(time.time() * 1000):x}"

            request_path = ""
            if callable(get_request_path_fn):
                try:
                    request_path = str(get_request_path_fn() or "").strip()
                except Exception:
                    request_path = ""

            if logger is not None:
                logger.exception(
                    "Supabase auth provider timeout stage=require_supabase_user.verify_token request_id=%s path=%s",
                    request_id,
                    request_path or "unknown",
                )

            return (
                jsonify_fn(
                    {
                        "success": False,
                        "code": "AUTH_PROVIDER_TIMEOUT",
                        "message": "Authentication provider is temporarily unavailable. Please retry.",
                        "requestId": request_id,
                        "meta": {"retryable": True},
                    }
                ),
                503,
            )
        if not user:
            return jsonify_fn({"error": "Invalid or expired Supabase token"}), 401

        g_obj.supabase_user = user
        return f(*args, **kwargs)

    return decorated_function
