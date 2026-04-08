"""Security middleware and CORS/rate-limit configuration for the Coordinates Grabber API.

Provides thin factory helpers that apply security headers, configure CORS, and
resolve rate-limiter settings. The actual policies live in
``route_groups.api_http_hardening`` so this module stays free of magic numbers.

Usage::

    from backend.security_middleware import (
        configure_app_cors,
        build_after_request_security_headers,
        resolve_limiter_config,
    )

    configure_app_cors(
        app,
        configure_cors_fn=http_hardening_configure_cors_helper,
        allowed_origins=ALLOWED_ORIGINS,
    )

    add_security_headers = build_after_request_security_headers(
        apply_security_headers_fn=http_hardening_apply_security_headers_helper,
    )
    app.after_request(add_security_headers)

    limiter_cfg = resolve_limiter_config(
        resolve_storage_fn=http_hardening_resolve_limiter_storage_runtime_helper,
        resolve_limits_fn=http_hardening_resolve_limiter_default_limits_helper,
        os_module=os,
    )
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List

__all__ = [
    "configure_app_cors",
    "build_after_request_security_headers",
    "resolve_limiter_config",
]


def configure_app_cors(
    app: Any,
    *,
    configure_cors_fn: Callable,
    allowed_origins: List[str],
) -> None:
    """Configure Flask-CORS on *app* using the resolved origins list."""
    configure_cors_fn(app, allowed_origins=allowed_origins)


def build_after_request_security_headers(
    apply_security_headers_fn: Callable,
) -> Callable:
    """Return an ``after_request`` handler that delegates to *apply_security_headers_fn*.

    Register the returned function via ``app.after_request(...)`` or the
    ``@app.after_request`` decorator.
    """

    def add_security_headers(response: Any) -> Any:
        """Apply security headers (CSP, HSTS, X-Frame-Options, …) to every response."""
        return apply_security_headers_fn(response)

    return add_security_headers


def resolve_limiter_config(
    *,
    resolve_storage_fn: Callable,
    resolve_limits_fn: Callable,
    os_module: Any,
) -> Dict[str, Any]:
    """Resolve Flask-Limiter storage URI and default rate-limit strings.

    Returns a dict with keys:
    - ``"storage_uri"`` – the backend URI string (e.g. ``"memory://"`` or ``"redis://…"``)
    - ``"storage_runtime"`` – the full runtime dict returned by *resolve_storage_fn*
    - ``"default_limits"`` – list of limit strings (e.g. ``["200 per day"]``)
    """
    storage_runtime: Dict[str, Any] = resolve_storage_fn(os_module=os_module)
    return {
        "storage_uri": str(storage_runtime.get("uri") or "memory://"),
        "storage_runtime": storage_runtime,
        "default_limits": resolve_limits_fn(os_module=os_module),
    }
