from __future__ import annotations

import socket
from typing import Any, Callable, Dict, Iterable, List, Optional
from urllib.parse import urlparse


def default_allowed_origins() -> List[str]:
    return [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3001",  # Suite-native gateway
        "http://localhost:3000",  # Legacy gateway compatibility
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3001",
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


def _parse_bool_env(raw_value: Optional[str], fallback: bool = False) -> bool:
    if raw_value is None:
        return fallback
    normalized = str(raw_value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def _resolve_limiter_strict_mode(
    *,
    os_module: Any,
) -> bool:
    mode = (
        (os_module.environ.get("API_ENV") or "")
        or (os_module.environ.get("FLASK_ENV") or "")
        or ""
    ).strip().lower()
    require_shared = _parse_bool_env(
        os_module.environ.get("API_REQUIRE_SHARED_LIMITER_STORAGE"),
        False,
    )
    return require_shared or mode in {"production", "prod"}


def _resolve_redis_probe_timeout_ms(
    *,
    os_module: Any,
    logger: Any,
) -> int:
    raw_timeout = (os_module.environ.get("API_LIMITER_REDIS_PROBE_TIMEOUT_MS") or "").strip()
    if not raw_timeout:
        return 800
    try:
        parsed = int(raw_timeout)
    except ValueError:
        logger.warning(
            "Invalid API_LIMITER_REDIS_PROBE_TIMEOUT_MS=%r; using 800ms fallback.",
            raw_timeout,
        )
        return 800
    if parsed < 100:
        logger.warning(
            "API_LIMITER_REDIS_PROBE_TIMEOUT_MS=%s is too low; using 100ms minimum.",
            parsed,
        )
        return 100
    return parsed


def probe_redis_storage_uri(
    storage_uri: str,
    timeout_ms: int,
) -> bool:
    parsed = urlparse(storage_uri)
    scheme = (parsed.scheme or "").strip().lower()
    if scheme not in {"redis", "rediss"}:
        return True

    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 6379
    timeout_seconds = max(timeout_ms / 1000.0, 0.05)
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False


def resolve_limiter_storage_runtime(
    *,
    os_module: Any,
    logger: Any,
    redis_probe_fn: Optional[Callable[[str, int], bool]] = None,
) -> Dict[str, Any]:
    strict_mode = _resolve_limiter_strict_mode(os_module=os_module)
    degrade_on_redis_failure = _parse_bool_env(
        os_module.environ.get("API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE"),
        True,
    )
    probe_timeout_ms = _resolve_redis_probe_timeout_ms(
        os_module=os_module,
        logger=logger,
    )

    explicit_uri = (os_module.environ.get("API_LIMITER_STORAGE_URI") or "").strip()
    redis_url = (os_module.environ.get("REDIS_URL") or "").strip()
    configured_uri = explicit_uri or redis_url

    probe = redis_probe_fn or probe_redis_storage_uri
    if configured_uri:
        parsed = urlparse(configured_uri)
        scheme = (parsed.scheme or "").strip().lower()
        if scheme in {"redis", "rediss"}:
            reachable = False
            try:
                reachable = probe(configured_uri, probe_timeout_ms)
            except Exception as exc:  # pragma: no cover - defensive probe wrapper
                logger.warning(
                    "Redis limiter probe raised an exception for %s: %s",
                    configured_uri,
                    exc,
                )
                reachable = False

            if reachable:
                return {
                    "storage_uri": configured_uri,
                    "degraded": False,
                    "reason": "redis_reachable",
                    "strict_mode": strict_mode,
                }

            diagnostic = (
                "Redis limiter storage is configured but unreachable "
                f"({configured_uri}, probe_timeout_ms={probe_timeout_ms}, strict_mode={strict_mode})."
            )
            if strict_mode:
                raise RuntimeError(
                    diagnostic
                    + " Shared limiter storage is required in strict mode."
                )
            if degrade_on_redis_failure:
                logger.warning(
                    "RATE LIMITER DEGRADED: %s Falling back to memory:// because "
                    "API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE=true.",
                    diagnostic,
                )
                return {
                    "storage_uri": "memory://",
                    "degraded": True,
                    "reason": "redis_unreachable_dev_degrade",
                    "strict_mode": strict_mode,
                }
            raise RuntimeError(
                diagnostic
                + " Set API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE=true to allow dev fallback."
            )

        return {
            "storage_uri": configured_uri,
            "degraded": False,
            "reason": "configured_non_redis_storage",
            "strict_mode": strict_mode,
        }

    if strict_mode:
        raise RuntimeError(
            "Shared rate-limit storage is required in production mode. "
            "Set API_LIMITER_STORAGE_URI (or REDIS_URL) to a Redis-compatible backend."
        )

    logger.warning(
        "Using in-memory rate-limit storage (memory://). "
        "Set API_LIMITER_STORAGE_URI or REDIS_URL for shared limiter state."
    )
    return {
        "storage_uri": "memory://",
        "degraded": False,
        "reason": "memory_storage_no_shared_backend_configured",
        "strict_mode": strict_mode,
    }


def resolve_limiter_storage_uri(
    *,
    os_module: Any,
    logger: Any,
    redis_probe_fn: Optional[Callable[[str, int], bool]] = None,
) -> str:
    runtime = resolve_limiter_storage_runtime(
        os_module=os_module,
        logger=logger,
        redis_probe_fn=redis_probe_fn,
    )
    return str(runtime["storage_uri"])


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
