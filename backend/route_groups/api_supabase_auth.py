from __future__ import annotations

import random
import time
from typing import Any, Dict, Optional

import requests


class SupabaseEmailLinkError(RuntimeError):
    """Raised when Supabase email-link delivery fails with structured context."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after_seconds = retry_after_seconds


class SupabaseAuthProviderTimeoutError(RuntimeError):
    """Raised when Supabase /auth/v1/user times out after retries."""

    def __init__(
        self,
        message: str = "Authentication provider timed out.",
    ) -> None:
        super().__init__(message)
        self.code = "AUTH_PROVIDER_TIMEOUT"
        self.retryable = True


def _parse_retry_after_seconds(headers: Any) -> Optional[int]:
    if headers is None:
        return None
    try:
        raw_value = str(headers.get("Retry-After", "")).strip()
    except Exception:
        return None
    if not raw_value:
        return None
    try:
        parsed = int(raw_value)
    except Exception:
        return None
    return parsed if parsed > 0 else None


def _extract_supabase_error_message(response: Any) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = None

    if isinstance(payload, dict):
        for key in ("message", "error_description", "error", "msg"):
            value = str(payload.get(key) or "").strip()
            if value:
                return value

    fallback = str(getattr(response, "text", "") or "").strip()
    if fallback:
        return fallback[:240]
    return "Supabase email auth request failed."


def _is_supabase_read_timeout(exc: Exception, requests_module: Any) -> bool:
    exceptions_obj = getattr(requests_module, "exceptions", None)
    read_timeout_type = getattr(exceptions_obj, "ReadTimeout", None)
    timeout_type = getattr(exceptions_obj, "Timeout", None)
    if read_timeout_type is not None and isinstance(exc, read_timeout_type):
        return True
    if timeout_type is not None and isinstance(exc, timeout_type):
        return True
    exc_name = str(type(exc).__name__ or "").strip().lower()
    if exc_name in {"readtimeout", "timeout"}:
        return True
    return "read timed out" in str(exc).strip().lower()


def send_supabase_email_link(
    email: str,
    flow: str,
    *,
    client_redirect_to: str,
    redirect_path: str,
    redirect_query: Optional[Dict[str, str]],
    require_redirect: bool = False,
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
    if require_redirect and not redirect_to:
        raise SupabaseEmailLinkError(
            "Verification redirect is not configured for this origin. "
            "Update AUTH_ALLOWED_REDIRECT_ORIGINS or AUTH_EMAIL_REDIRECT_URL.",
            status_code=400,
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
    params: Dict[str, str] = {}
    if redirect_to:
        # Supabase /auth/v1/otp uses redirect_to as query parameter.
        params["redirect_to"] = redirect_to
        # Keep the payload field for backward compatibility across GoTrue versions.
        payload["email_redirect_to"] = redirect_to

    response = requests_module.post(
        endpoint,
        headers=headers,
        json=payload,
        params=params if params else None,
        timeout=8,
    )
    if response.status_code >= 400:
        error_message = _extract_supabase_error_message(response)
        raise SupabaseEmailLinkError(
            f"Supabase email auth request failed ({response.status_code}): {error_message}",
            status_code=int(response.status_code),
            retry_after_seconds=_parse_retry_after_seconds(getattr(response, "headers", None)),
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
            lookup_headers = {
                "Authorization": f"Bearer {token}",
                "apikey": supabase_api_key,
            }
            lookup_timeouts = (5, 3)
            response = None

            for attempt_index, timeout_seconds in enumerate(lookup_timeouts, start=1):
                try:
                    response = requests_module.get(
                        url,
                        headers=lookup_headers,
                        timeout=timeout_seconds,
                    )
                    break
                except Exception as exc:
                    if _is_supabase_read_timeout(exc, requests_module):
                        if attempt_index < len(lookup_timeouts):
                            jitter_seconds = 0.08 + random.random() * 0.22
                            logger.warning(
                                "Supabase auth lookup timed out (stage=supabase_user_lookup attempt=%s/%s timeout=%ss); retrying in %.3fs",
                                attempt_index,
                                len(lookup_timeouts),
                                timeout_seconds,
                                jitter_seconds,
                            )
                            time.sleep(jitter_seconds)
                            continue
                        logger.exception(
                            "Supabase auth lookup timed out after retries (stage=supabase_user_lookup attempts=%s)",
                            len(lookup_timeouts),
                        )
                        raise SupabaseAuthProviderTimeoutError() from exc
                    raise

            if response is None:
                raise RuntimeError("Supabase auth lookup returned no response.")
            if response.status_code != 200:
                logger.warning(
                    "Supabase auth lookup failed: %s %s",
                    response.status_code,
                    response.text,
                )
                return None
            return response.json()
        except SupabaseAuthProviderTimeoutError:
            raise
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
