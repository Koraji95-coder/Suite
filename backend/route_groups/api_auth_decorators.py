from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict, Optional


def decorate_require_supabase_user(
    f: Callable,
    *,
    get_bearer_token_fn: Callable[[], Optional[str]],
    verify_supabase_user_token_fn: Callable[[str], Optional[Dict[str, Any]]],
    jsonify_fn: Callable[[Dict[str, str]], Any],
    g_obj: Any,
) -> Callable:
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_bearer_token_fn()
        if not token:
            return jsonify_fn({"error": "Authorization bearer token required"}), 401

        user = verify_supabase_user_token_fn(token)
        if not user:
            return jsonify_fn({"error": "Invalid or expired Supabase token"}), 401

        g_obj.supabase_user = user
        return f(*args, **kwargs)

    return decorated_function


def decorate_require_agent_session(
    f: Callable,
    *,
    get_agent_session_fn: Callable[[], Optional[Dict[str, Any]]],
    get_supabase_user_id_fn: Callable[[Dict[str, Any]], Optional[str]],
    jsonify_fn: Callable[[Dict[str, str]], Any],
    g_obj: Any,
) -> Callable:
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session = get_agent_session_fn()
        user = getattr(g_obj, "supabase_user", None)
        user_id = get_supabase_user_id_fn(user or {})
        if not session or not user_id or session.get("user_id") != user_id:
            return jsonify_fn({"error": "Agent session required"}), 401

        g_obj.agent_session = session
        return f(*args, **kwargs)

    return decorated_function
