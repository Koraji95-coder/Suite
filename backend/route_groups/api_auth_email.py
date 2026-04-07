from __future__ import annotations

import time
from typing import Any, Callable, Dict, Tuple

from flask import Blueprint, jsonify, request
from flask_limiter import Limiter


def create_auth_email_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    supabase_url: str,
    supabase_api_key: str,
    auth_email_honeypot_field: str,
    auth_email_turnstile_secret: str,
    auth_email_require_turnstile: bool,
    apply_auth_email_response_floor: Callable[[float], None],
    auth_email_generic_response: Callable[[], Dict[str, Any]],
    is_valid_email: Callable[[str], bool],
    get_request_ip: Callable[[], str],
    is_auth_email_request_allowed: Callable[[str, str], Tuple[bool, str]],
    email_fingerprint: Callable[[str], str],
    verify_turnstile_token: Callable[[str, str], bool],
    send_supabase_email_link: Callable[..., None],
) -> Blueprint:
    """Create /api/auth email-link route group blueprint."""
    bp = Blueprint("auth_email_api", __name__, url_prefix="/api/auth")

    @bp.route("/email-link", methods=["POST"])
    @limiter.limit("12 per hour")
    def api_auth_email_link():
        started_at = time.perf_counter()

        def _finalize(payload: Dict[str, Any], status: int):
            apply_auth_email_response_floor(started_at)
            return jsonify(payload), status

        if not supabase_url or not supabase_api_key:
            return _finalize(
                {
                    "error": "Email authentication backend is not configured.",
                    "missing": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY"],
                },
                503,
            )

        if not request.is_json:
            return _finalize({"error": "Expected JSON payload."}, 400)

        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        flow = str(payload.get("flow") or "signin").strip().lower()
        client_redirect_to = str(payload.get("redirectTo") or payload.get("redirect_to") or "").strip()
        captcha_token = str(payload.get("captchaToken") or payload.get("turnstileToken") or "").strip()
        honeypot_value = str(payload.get(auth_email_honeypot_field) or "").strip()

        if flow not in {"signin", "signup"}:
            return _finalize({"error": "Invalid flow. Use signin or signup."}, 400)

        if not is_valid_email(email):
            return _finalize({"error": "Enter a valid email address."}, 400)

        if honeypot_value:
            logger.warning(
                "Auth email honeypot triggered for flow=%s ip=%s",
                flow,
                get_request_ip(),
            )
            return _finalize(auth_email_generic_response(), 202)

        client_ip = get_request_ip()
        email_hash = email_fingerprint(email)
        allowed, reason = is_auth_email_request_allowed(email, client_ip)
        if not allowed:
            logger.warning(
                "Auth email throttled flow=%s reason=%s ip=%s email_hash=%s",
                flow,
                reason,
                client_ip,
                email_hash,
            )
            return _finalize(auth_email_generic_response(), 202)

        if auth_email_turnstile_secret:
            captcha_ok = verify_turnstile_token(captcha_token, client_ip)
            if not captcha_ok:
                logger.warning(
                    "Auth email captcha verification failed flow=%s ip=%s email_hash=%s",
                    flow,
                    client_ip,
                    email_hash,
                )
                if auth_email_require_turnstile:
                    return _finalize(auth_email_generic_response(), 202)

        try:
            send_supabase_email_link(email, flow, client_redirect_to=client_redirect_to)
            logger.info(
                "Auth email request dispatched flow=%s ip=%s email_hash=%s redirect_supplied=%s",
                flow,
                client_ip,
                email_hash,
                "yes" if client_redirect_to else "no",
            )
        except Exception:
            logger.exception(
                "Email auth request failed flow=%s ip=%s email_hash=%s redirect_supplied=%s",
                flow,
                client_ip,
                email_hash,
                "yes" if client_redirect_to else "no",
            )
            return _finalize(auth_email_generic_response(), 202)

        return _finalize(auth_email_generic_response(), 202)

    return bp
