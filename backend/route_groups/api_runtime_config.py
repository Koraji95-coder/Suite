from __future__ import annotations

from typing import Any, Callable, Iterable

AUTODRAFT_DOTNET_API_DEFAULT_URL = "http://127.0.0.1:5275"


def resolve_api_key(
    *,
    os_module: Any,
    logger: Any,
) -> str:
    api_key = (os_module.environ.get("API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(
            "FATAL: API_KEY environment variable is not set.\n"
            "Please set your API key before starting the server:\n"
            "  export API_KEY='your-secure-api-key-here'\n"
            "Then start the server again."
        )
    return api_key


def resolve_supabase_url(
    *,
    os_module: Any,
    logger: Any,
) -> str:
    supabase_url = (os_module.environ.get("SUPABASE_URL") or "").strip()
    if not supabase_url:
        dev_supabase_url = (os_module.environ.get("VITE_SUPABASE_URL") or "").strip()
        if dev_supabase_url:
            supabase_url = dev_supabase_url
            logger.warning(
                "SUPABASE_URL not set; using VITE_SUPABASE_URL for development. "
                "Set SUPABASE_URL in backend env for production."
            )
    return supabase_url


def resolve_supabase_api_key(
    *,
    supabase_service_role_key: str,
    supabase_anon_key: str,
    logger: Any,
) -> str:
    supabase_api_key = supabase_service_role_key or supabase_anon_key
    if supabase_api_key == supabase_anon_key and supabase_api_key:
        logger.warning(
            "Using SUPABASE_ANON_KEY for backend auth lookups. "
            "Prefer SUPABASE_SERVICE_ROLE_KEY in production."
        )
    return supabase_api_key


def resolve_agent_webhook_secret(
    *,
    os_module: Any,
    logger: Any,
) -> str:
    secret = (os_module.environ.get("AGENT_WEBHOOK_SECRET") or "").strip()
    if secret:
        return secret

    dev_webhook_secret = (os_module.environ.get("VITE_AGENT_WEBHOOK_SECRET") or "").strip()
    if dev_webhook_secret:
        logger.warning(
            "AGENT_WEBHOOK_SECRET not set; using VITE_AGENT_WEBHOOK_SECRET for development. "
            "Set AGENT_WEBHOOK_SECRET in backend env for production."
        )
        return dev_webhook_secret

    return ""


def normalize_auth_passkey_provider(
    *,
    raw_value: str,
    logger: Any,
) -> str:
    provider = (raw_value or "supabase").strip().lower() or "supabase"
    if provider not in {"supabase", "external", "first-party"}:
        logger.warning(
            "Unsupported AUTH_PASSKEY_PROVIDER=%r; falling back to 'supabase'.",
            provider,
        )
        return "supabase"
    return provider


def derive_default_passkey_rp_id(
    *,
    auth_passkey_allowed_origins: Iterable[str],
    urlparse_fn: Callable[[str], Any],
) -> str:
    for candidate_origin in auth_passkey_allowed_origins:
        try:
            parsed_origin = urlparse_fn(candidate_origin)
        except Exception:
            continue
        if parsed_origin.scheme in {"http", "https"} and parsed_origin.hostname:
            return parsed_origin.hostname.strip().lower()
    return ""


def resolve_auth_email_require_turnstile(
    *,
    os_module: Any,
    auth_email_turnstile_secret: str,
) -> bool:
    default_require_turnstile = "true" if auth_email_turnstile_secret else "false"
    return (
        (os_module.environ.get("AUTH_EMAIL_REQUIRE_TURNSTILE") or default_require_turnstile)
        .strip()
        .lower()
        != "false"
    )


def resolve_autodraft_dotnet_api_url(
    *,
    os_module: Any,
) -> str:
    configured = (os_module.environ.get("AUTODRAFT_DOTNET_API_URL") or "").strip()
    return configured or AUTODRAFT_DOTNET_API_DEFAULT_URL
