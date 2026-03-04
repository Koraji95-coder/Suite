from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple


def create_agent_session(
    token: str,
    user_id: str,
    *,
    purge_expired_agent_sessions_fn: Callable[[], None],
    token_urlsafe_fn: Callable[[int], str],
    now_fn: Callable[[], float],
    agent_session_ttl_seconds: int,
    agent_sessions_store: Dict[str, Dict[str, Any]],
) -> Tuple[str, int]:
    purge_expired_agent_sessions_fn()
    session_id = token_urlsafe_fn(32)
    expires_at = int(now_fn()) + agent_session_ttl_seconds
    agent_sessions_store[session_id] = {
        "token": token,
        "user_id": user_id,
        "expires_at": expires_at,
    }
    return session_id, expires_at


def get_agent_session(
    *,
    purge_expired_agent_sessions_fn: Callable[[], None],
    request_obj: Any,
    agent_session_cookie: str,
    now_fn: Callable[[], float],
    agent_sessions_store: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    purge_expired_agent_sessions_fn()
    session_id = request_obj.cookies.get(agent_session_cookie)
    if not session_id:
        return None

    session = agent_sessions_store.get(session_id)
    if not session:
        return None

    if session["expires_at"] <= now_fn():
        agent_sessions_store.pop(session_id, None)
        return None

    return session


def clear_agent_session_for_request(
    *,
    request_obj: Any,
    agent_session_cookie: str,
    agent_sessions_store: Dict[str, Dict[str, Any]],
) -> None:
    session_id = request_obj.cookies.get(agent_session_cookie)
    if session_id:
        agent_sessions_store.pop(session_id, None)
