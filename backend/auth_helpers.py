"""Authentication helper decorators for the Coordinates Grabber API.

Provides factory functions for building Flask route decorators that enforce
bearer-token auth, API-key auth, and the hybrid AutoCAD/Watchdog auth pattern.

Usage::

    from backend.auth_helpers import (
        build_require_supabase_user_decorator,
        build_require_api_key_decorator,
        build_autocad_auth_decorator,
    )

    require_supabase_user = build_require_supabase_user_decorator(auth_runtime)
    require_api_key = build_require_api_key_decorator(security_runtime)
    require_autocad_auth = build_autocad_auth_decorator(
        get_bearer_token_fn=...,
        verify_supabase_token_fn=...,
        get_supabase_user_id_fn=...,
        is_valid_api_key_fn=...,
        allow_api_key_fallback=False,
        auth_label="AutoCAD",
        logger=logger,
    )
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable, Optional

from flask import g, jsonify, request

__all__ = [
    "build_require_supabase_user_decorator",
    "build_require_api_key_decorator",
    "build_autocad_auth_decorator",
]


def build_require_supabase_user_decorator(auth_runtime: Any) -> Callable:
    """Return a decorator that requires a valid Supabase bearer token."""

    def require_supabase_user(f):
        return auth_runtime.require_supabase_user(f)

    return require_supabase_user


def build_require_api_key_decorator(security_runtime: Any) -> Callable:
    """Return a decorator that requires a valid ``X-API-Key`` request header."""

    def require_api_key(f):
        return security_runtime.require_api_key(f)

    return require_api_key


def build_autocad_auth_decorator(
    *,
    get_bearer_token_fn: Callable[[], Optional[str]],
    verify_supabase_token_fn: Callable[[str], Optional[Any]],
    get_supabase_user_id_fn: Callable[[Any], Optional[str]],
    is_valid_api_key_fn: Callable[[Optional[str]], bool],
    allow_api_key_fallback: bool,
    auth_label: str,
    logger: logging.Logger,
) -> Callable:
    """Return a route decorator that enforces bearer-token (+ optional API-key) auth.

    Parameters
    ----------
    get_bearer_token_fn:
        Callable that extracts the bearer token from the current request context.
    verify_supabase_token_fn:
        Callable that verifies a raw bearer-token string and returns the user
        dict on success, or ``None`` on failure.
    get_supabase_user_id_fn:
        Callable that extracts the user ID string from a verified user dict.
    is_valid_api_key_fn:
        Callable that returns ``True`` when the provided key matches the server key.
    allow_api_key_fallback:
        When ``True``, an ``X-API-Key`` header is also accepted if no bearer
        token is present or if the bearer token is invalid.
    auth_label:
        Human-readable label used in log messages (e.g. ``"AutoCAD"``).
    logger:
        Application logger instance.
    """

    def _decorate(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                first_hop = forwarded_for.split(",", 1)[0].strip()
                remote_addr = first_hop or (request.remote_addr or "").strip() or "unknown"
            else:
                remote_addr = (request.remote_addr or "").strip() or "unknown"

            path = str(request.path or "")
            method = str(request.method or "GET")
            auth_header = str(request.headers.get("Authorization") or "").strip()

            if auth_header and not auth_header.lower().startswith("bearer "):
                logger.warning(
                    "%s auth rejected (invalid authorization scheme) %s %s from %s",
                    auth_label,
                    method,
                    path,
                    remote_addr,
                )
                return jsonify({"error": "Invalid Authorization header", "code": "AUTH_INVALID"}), 401

            bearer_token = get_bearer_token_fn()
            if bearer_token:
                user = verify_supabase_token_fn(bearer_token)
                if user is not None:
                    g.supabase_user = user
                    g.autocad_auth_mode = "bearer"
                    user_id = str(get_supabase_user_id_fn(user) or "unknown")
                    logger.info(
                        "%s auth success via bearer %s %s from %s (user_id=%s)",
                        auth_label,
                        method,
                        path,
                        remote_addr,
                        user_id,
                    )
                    return f(*args, **kwargs)

                logger.warning(
                    "%s bearer token rejected %s %s from %s",
                    auth_label,
                    method,
                    path,
                    remote_addr,
                )
                if not allow_api_key_fallback:
                    return (
                        jsonify({"error": "Invalid bearer token", "code": "AUTH_INVALID"}),
                        401,
                    )

            provided_key = str(request.headers.get("X-API-Key") or "").strip()
            if allow_api_key_fallback and provided_key:
                if is_valid_api_key_fn(provided_key):
                    g.autocad_auth_mode = "api_key"
                    logger.info(
                        "%s auth success via API key fallback %s %s from %s",
                        auth_label,
                        method,
                        path,
                        remote_addr,
                    )
                    return f(*args, **kwargs)
                logger.warning(
                    "%s API-key fallback rejected %s %s from %s",
                    auth_label,
                    method,
                    path,
                    remote_addr,
                )
                return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401

            auth_required_message = (
                "Authorization bearer token required"
                if not allow_api_key_fallback
                else "Authorization bearer token or API key required"
            )
            logger.warning(
                "%s auth missing credentials %s %s from %s (api_key_fallback=%s)",
                auth_label,
                method,
                path,
                remote_addr,
                allow_api_key_fallback,
            )
            return jsonify({"error": auth_required_message, "code": "AUTH_REQUIRED"}), 401

        return decorated_function

    return _decorate
