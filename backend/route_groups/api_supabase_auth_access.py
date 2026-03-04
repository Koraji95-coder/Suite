from __future__ import annotations

from typing import Any, Dict, Optional

from .api_supabase_auth import (
    generate_supabase_magic_link_url as supabase_auth_generate_magic_link_url,
    send_supabase_email_link as supabase_auth_send_email_link,
    verify_supabase_user_token as supabase_auth_verify_user_token,
)


def send_supabase_email_link(
    email: str,
    flow: str,
    *,
    client_redirect_to: str,
    redirect_path: str,
    redirect_query: Optional[Dict[str, str]],
    supabase_url: str,
    supabase_api_key: str,
    build_auth_redirect_url_fn: Any,
    requests_module: Any,
) -> None:
    return supabase_auth_send_email_link(
        email,
        flow,
        client_redirect_to=client_redirect_to,
        redirect_path=redirect_path,
        redirect_query=redirect_query,
        supabase_url=supabase_url,
        supabase_api_key=supabase_api_key,
        build_auth_redirect_url_fn=build_auth_redirect_url_fn,
        requests_module=requests_module,
    )


def generate_supabase_magic_link_url(
    email: str,
    *,
    client_redirect_to: str,
    redirect_path: str,
    supabase_url: str,
    supabase_service_role_key: str,
    build_auth_redirect_url_fn: Any,
    requests_module: Any,
) -> str:
    return supabase_auth_generate_magic_link_url(
        email,
        client_redirect_to=client_redirect_to,
        redirect_path=redirect_path,
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        build_auth_redirect_url_fn=build_auth_redirect_url_fn,
        requests_module=requests_module,
    )


def verify_supabase_user_token(
    token: str,
    *,
    supabase_jwt_secret: str,
    supabase_url: str,
    supabase_api_key: str,
    looks_like_uuid_fn: Any,
    get_supabase_jwks_client_fn: Any,
    jwt_module: Any,
    logger: Any,
    requests_module: Any,
) -> Optional[Dict[str, Any]]:
    return supabase_auth_verify_user_token(
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
