from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

from .api_agent_session import (
    clear_agent_session_for_request as agent_session_clear_for_request_helper,
    create_agent_session as agent_session_create_helper,
    get_agent_session as agent_session_get_helper,
)
from .api_auth_decorators import (
    decorate_require_agent_session as auth_decorators_require_agent_session_helper,
    decorate_require_supabase_user as auth_decorators_require_supabase_user_helper,
)
from .api_auth_identity import (
    get_bearer_token as auth_identity_get_bearer_token_helper,
    get_supabase_user_email as auth_identity_get_supabase_user_email_helper,
    get_supabase_user_id as auth_identity_get_supabase_user_id_helper,
)
from .api_supabase_auth_access import (
    verify_supabase_user_token as supabase_verify_user_token_helper,
)


@dataclass(frozen=True)
class AuthRuntime:
    get_supabase_user_id: Callable[[Dict[str, Any]], Optional[str]]
    get_supabase_user_email: Callable[[Dict[str, Any]], Optional[str]]
    get_bearer_token: Callable[[], Optional[str]]
    verify_supabase_user_token: Callable[[str], Optional[Dict[str, Any]]]
    require_supabase_user: Callable[[Callable[..., Any]], Callable[..., Any]]
    create_agent_session: Callable[[str, str], Tuple[str, int]]
    get_agent_session: Callable[[], Optional[Dict[str, Any]]]
    clear_agent_session_for_request: Callable[[], None]
    require_agent_session: Callable[[Callable[..., Any]], Callable[..., Any]]


def create_auth_runtime(
    *,
    request_obj: Any,
    jsonify_fn: Any,
    g_obj: Any,
    is_valid_email_fn: Callable[[str], bool],
    purge_expired_agent_sessions_fn: Callable[[], None],
    token_urlsafe_fn: Callable[[int], str],
    now_fn: Callable[[], float],
    agent_session_ttl_seconds: int,
    agent_sessions_store: Dict[str, Dict[str, Any]],
    agent_session_cookie: str,
    supabase_jwt_secret: str,
    supabase_url: str,
    supabase_api_key: str,
    looks_like_uuid_fn: Any,
    get_supabase_jwks_client_fn: Any,
    jwt_module: Any,
    logger: Any,
    requests_module: Any,
    verify_supabase_user_token_fn: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None,
) -> AuthRuntime:
    def get_supabase_user_id(user: Dict[str, Any]) -> Optional[str]:
        return auth_identity_get_supabase_user_id_helper(user)

    def get_supabase_user_email(user: Dict[str, Any]) -> Optional[str]:
        return auth_identity_get_supabase_user_email_helper(
            user,
            is_valid_email_fn=is_valid_email_fn,
        )

    def get_bearer_token() -> Optional[str]:
        return auth_identity_get_bearer_token_helper(request_obj=request_obj)

    def verify_supabase_user_token(token: str) -> Optional[Dict[str, Any]]:
        if verify_supabase_user_token_fn is not None:
            return verify_supabase_user_token_fn(token)
        return supabase_verify_user_token_helper(
            token,
            supabase_jwt_secret=supabase_jwt_secret,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            looks_like_uuid_fn=looks_like_uuid_fn,
            get_supabase_jwks_client_fn=get_supabase_jwks_client_fn,
            jwt_module=jwt_module,
            logger=logger,
            requests_module=requests_module,
        )

    def require_supabase_user(f):
        return auth_decorators_require_supabase_user_helper(
            f,
            get_bearer_token_fn=get_bearer_token,
            verify_supabase_user_token_fn=verify_supabase_user_token,
            jsonify_fn=jsonify_fn,
            g_obj=g_obj,
            logger=logger,
            get_request_id_fn=lambda: str(
                getattr(g_obj, "agent_request_id", "") or ""
            ).strip(),
            get_request_path_fn=lambda: str(getattr(request_obj, "path", "") or "").strip(),
        )

    def create_agent_session(token: str, user_id: str) -> Tuple[str, int]:
        return agent_session_create_helper(
            token,
            user_id,
            purge_expired_agent_sessions_fn=purge_expired_agent_sessions_fn,
            token_urlsafe_fn=token_urlsafe_fn,
            now_fn=now_fn,
            agent_session_ttl_seconds=agent_session_ttl_seconds,
            agent_sessions_store=agent_sessions_store,
        )

    def get_agent_session() -> Optional[Dict[str, Any]]:
        return agent_session_get_helper(
            purge_expired_agent_sessions_fn=purge_expired_agent_sessions_fn,
            request_obj=request_obj,
            agent_session_cookie=agent_session_cookie,
            now_fn=now_fn,
            agent_sessions_store=agent_sessions_store,
        )

    def clear_agent_session_for_request() -> None:
        return agent_session_clear_for_request_helper(
            request_obj=request_obj,
            agent_session_cookie=agent_session_cookie,
            agent_sessions_store=agent_sessions_store,
        )

    def require_agent_session(f):
        return auth_decorators_require_agent_session_helper(
            f,
            get_agent_session_fn=get_agent_session,
            get_supabase_user_id_fn=get_supabase_user_id,
            jsonify_fn=jsonify_fn,
            g_obj=g_obj,
        )

    return AuthRuntime(
        get_supabase_user_id=get_supabase_user_id,
        get_supabase_user_email=get_supabase_user_email,
        get_bearer_token=get_bearer_token,
        verify_supabase_user_token=verify_supabase_user_token,
        require_supabase_user=require_supabase_user,
        create_agent_session=create_agent_session,
        get_agent_session=get_agent_session,
        clear_agent_session_for_request=clear_agent_session_for_request,
        require_agent_session=require_agent_session,
    )
