from __future__ import annotations

from typing import Any, Dict, Optional

import requests


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
    requests_module: Any = requests,
) -> None:
    if not supabase_url or not supabase_api_key:
        raise RuntimeError("Supabase auth is not configured for backend email auth.")

    if flow not in {"signin", "signup"}:
        raise ValueError("Unsupported email auth flow.")

    redirect_to = build_auth_redirect_url_fn(
        redirect_path,
        client_redirect_to,
        query_params=redirect_query,
    )

    headers = {
        "Authorization": f"Bearer {supabase_api_key}",
        "apikey": supabase_api_key,
        "Content-Type": "application/json",
    }

    endpoint = f"{supabase_url.rstrip('/')}/auth/v1/otp"
    payload: Dict[str, Any] = {
        "email": email,
        "create_user": flow == "signup",
    }
    if redirect_to:
        payload["email_redirect_to"] = redirect_to

    response = requests_module.post(endpoint, headers=headers, json=payload, timeout=8)
    if response.status_code >= 400:
        raise RuntimeError(
            f"Supabase email auth request failed ({response.status_code})"
        )


def generate_supabase_magic_link_url(
    email: str,
    *,
    client_redirect_to: str,
    redirect_path: str,
    supabase_url: str,
    supabase_service_role_key: str,
    build_auth_redirect_url_fn: Any,
    requests_module: Any = requests,
) -> str:
    if not supabase_url or not supabase_service_role_key:
        raise RuntimeError("Supabase service role key is required for magic-link generation.")

    redirect_to = build_auth_redirect_url_fn(
        redirect_path,
        client_redirect_to,
    )

    headers = {
        "Authorization": f"Bearer {supabase_service_role_key}",
        "apikey": supabase_service_role_key,
        "Content-Type": "application/json",
    }

    endpoint = f"{supabase_url.rstrip('/')}/auth/v1/admin/generate_link"
    payload: Dict[str, Any] = {
        "type": "magiclink",
        "email": email,
    }

    params: Dict[str, str] = {}
    if redirect_to:
        params["redirect_to"] = redirect_to

    response = requests_module.post(
        endpoint,
        headers=headers,
        json=payload,
        params=params if params else None,
        timeout=8,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Supabase admin generate_link failed ({response.status_code})"
        )

    body = response.json() if response.content else {}
    action_link = str(body.get("action_link") or "").strip()
    if not action_link:
        raise RuntimeError("Supabase generate_link response missing action_link.")
    return action_link


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
    requests_module: Any = requests,
) -> Optional[Dict[str, Any]]:
    if not token:
        return None

    if supabase_jwt_secret and not looks_like_uuid_fn(supabase_jwt_secret):
        try:
            payload = jwt_module.decode(
                token,
                supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except Exception as exc:
            logger.warning("Supabase JWT validation failed (HS256): %s", exc)

    if supabase_url and supabase_api_key:
        try:
            url = supabase_url.rstrip("/") + "/auth/v1/user"
            response = requests_module.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": supabase_api_key,
                },
                timeout=5,
            )
            if response.status_code != 200:
                logger.warning(
                    "Supabase auth lookup failed: %s %s",
                    response.status_code,
                    response.text,
                )
                return None
            return response.json()
        except Exception as exc:
            logger.warning("Supabase auth lookup error: %s", exc)
            return None

    if supabase_url:
        try:
            jwks_client = get_supabase_jwks_client_fn()
            if jwks_client is not None:
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                algorithm = getattr(signing_key, "algorithm", None)
                algorithms = [algorithm] if algorithm else ["ES256", "RS256", "ES384", "RS384"]
                payload = jwt_module.decode(
                    token,
                    signing_key.key,
                    algorithms=algorithms,
                    options={"verify_aud": False},
                )
                return payload
        except Exception as exc:
            logger.warning("Supabase JWT validation failed (JWKS): %s", exc)

    logger.warning(
        "Supabase auth is not configured. Set SUPABASE_URL for JWKS verification or provide SUPABASE_JWT_SECRET/SUPABASE_SERVICE_ROLE_KEY."
    )
    return None
