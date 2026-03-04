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
        allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    )


def resolve_limiter_default_limits(
    *,
    os_module: Any,
) -> List[str]:
    return [
        os_module.environ.get("API_RATE_LIMIT_DAY", "200 per day"),
        os_module.environ.get("API_RATE_LIMIT_HOUR", "50 per hour"),
    ]


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
