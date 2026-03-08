from __future__ import annotations

from typing import Any, Iterable, List


def default_allowed_origins() -> List[str]:
    return [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]


def configure_cors(
    *,
    app: Any,
    cors_fn: Any,
    allowed_origins: Iterable[str],
) -> None:
    cors_fn(
        app,
        origins=list(allowed_origins),
        supports_credentials=True,
        methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-API-Key",
            "X-Request-ID",
        ],
    )


def resolve_limiter_default_limits(
    *,
    os_module: Any,
) -> List[str]:
    return [
        os_module.environ.get("API_RATE_LIMIT_DAY", "200 per day"),
        os_module.environ.get("API_RATE_LIMIT_HOUR", "50 per hour"),
    ]


def resolve_limiter_storage_uri(
    *,
    os_module: Any,
    logger: Any,
) -> str:
    explicit_uri = (os_module.environ.get("API_LIMITER_STORAGE_URI") or "").strip()
    if explicit_uri:
        return explicit_uri

    redis_url = (os_module.environ.get("REDIS_URL") or "").strip()
    if redis_url:
        return redis_url

    mode = (
        (os_module.environ.get("API_ENV") or "")
        or (os_module.environ.get("FLASK_ENV") or "")
        or ""
    ).strip().lower()
    require_shared = (
        (os_module.environ.get("API_REQUIRE_SHARED_LIMITER_STORAGE") or "").strip().lower()
        in {"1", "true", "yes", "on"}
    )

    if require_shared or mode in {"production", "prod"}:
        raise RuntimeError(
            "Shared rate-limit storage is required in production mode. "
            "Set API_LIMITER_STORAGE_URI (or REDIS_URL) to a Redis-compatible backend."
        )

    logger.warning(
        "Using in-memory rate-limit storage (memory://). "
        "Set API_LIMITER_STORAGE_URI or REDIS_URL for shared limiter state."
    )
    return "memory://"


def apply_security_headers(response: Any) -> Any:
    # Prevent clickjacking attacks.
    response.headers["X-Frame-Options"] = "DENY"
    # Prevent MIME-type sniffing.
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Enable XSS protection.
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Content Security Policy.
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    # Referrer policy.
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
