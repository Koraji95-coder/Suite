from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from .api_auth_decorators import (
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


def create_auth_runtime(
    *,
    request_obj: Any,
    jsonify_fn: Any,
    g_obj: Any,
    is_valid_email_fn: Callable[[str], bool],
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
                getattr(g_obj, "request_id", "") or ""
            ).strip(),
            get_request_path_fn=lambda: str(getattr(request_obj, "path", "") or "").strip(),
        )

    return AuthRuntime(
        get_supabase_user_id=get_supabase_user_id,
        get_supabase_user_email=get_supabase_user_email,
        get_bearer_token=get_bearer_token,
        verify_supabase_user_token=verify_supabase_user_token,
        require_supabase_user=require_supabase_user,
    )
