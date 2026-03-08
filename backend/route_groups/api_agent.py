from __future__ import annotations

import json
import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict
from urllib.parse import urlparse

import requests
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter


def create_agent_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    require_agent_session: Callable,
    deps: Dict[str, Any],
) -> Blueprint:
    """Create /api/agent route group blueprint."""
    bp = Blueprint("agent_api", __name__, url_prefix="/api/agent")

    _logger = logger or logging.getLogger(__name__)
    requests_module = deps.get("requests_module", requests)
    json_module = deps.get("json_module", json)

    _agent_broker_config_status = deps.get(
        "_agent_broker_config_status",
        lambda: {"ok": False, "missing": ["agent_deps_missing"], "warnings": []},
    )
    _list_agent_profiles = deps.get("_list_agent_profiles", lambda: [])
    _resolve_agent_profile_route = deps.get(
        "_resolve_agent_profile_route",
        lambda _profile_id: None,
    )
    _get_supabase_user_id = deps.get("_get_supabase_user_id", lambda _user: None)
    _get_supabase_user_email = deps.get("_get_supabase_user_email", lambda _user: None)
    _get_request_ip = deps.get("_get_request_ip", lambda: "unknown")
    _is_agent_pairing_action_allowed = deps.get(
        "_is_agent_pairing_action_allowed",
        lambda _user_id, _action: (False, "not-configured", 30),
    )
    _create_agent_pairing_challenge = deps.get(
        "_create_agent_pairing_challenge",
        lambda **_kwargs: ("", 0.0),
    )
    _build_auth_redirect_url = deps.get(
        "_build_auth_redirect_url",
        lambda _path, _client_redirect_to="", query_params=None: None,
    )
    _send_supabase_email_link = deps.get("_send_supabase_email_link", lambda *_args, **_kwargs: None)
    _email_fingerprint = deps.get("_email_fingerprint", lambda value: str(value or ""))
    _request_gateway_pairing_code = deps.get(
        "_request_gateway_pairing_code",
        lambda: (None, "Gateway pairing code helper unavailable", 503),
    )
    _is_agent_pairing_confirm_blocked = deps.get(
        "_is_agent_pairing_confirm_blocked",
        lambda _user_id, _client_ip: (False, 0),
    )
    _consume_agent_pairing_challenge = deps.get(
        "_consume_agent_pairing_challenge",
        lambda **_kwargs: (None, "missing"),
    )
    _register_agent_pairing_confirm_failure = deps.get(
        "_register_agent_pairing_confirm_failure",
        lambda _user_id, _client_ip: (False, 0),
    )
    _pair_agent_session_for_user = deps.get(
        "_pair_agent_session_for_user",
        lambda _pairing_code, _user_id, extra_payload=None: (jsonify({"error": "Pairing unavailable"}), 503),
    )
    _get_agent_session = deps.get("_get_agent_session", lambda: None)
    _revoke_gateway_agent_token = deps.get(
        "_revoke_gateway_agent_token",
        lambda _token: (jsonify({"revoked": False, "paired": False}), 200),
    )
    _clear_agent_session_for_request = deps.get("_clear_agent_session_for_request", lambda: None)
    _clear_agent_pairing_confirm_failures = deps.get(
        "_clear_agent_pairing_confirm_failures",
        lambda _user_id, _client_ip: None,
    )
    _is_admin_user = deps.get("_is_admin_user", lambda _user: False)
    _is_agent_task_allowed = deps.get("_is_agent_task_allowed", lambda _task_name, _user: False)

    PAIRING_CODE_PATTERN = deps.get(
        "PAIRING_CODE_PATTERN",
        re.compile(r"^\d{6}$"),
    )
    PAIRING_CHALLENGE_ID_PATTERN = deps.get(
        "PAIRING_CHALLENGE_ID_PATTERN",
        re.compile(r"^[A-Za-z0-9_-]{16,128}$"),
    )
    AGENT_PAIRING_REDIRECT_PATH = deps.get(
        "AGENT_PAIRING_REDIRECT_PATH",
        "/login",
    )
    AGENT_PAIRING_CHALLENGE_LOCK = deps.get("AGENT_PAIRING_CHALLENGE_LOCK", threading.Lock())
    AGENT_PAIRING_CHALLENGES = deps.get("AGENT_PAIRING_CHALLENGES", {})

    AGENT_SESSION_COOKIE = deps.get("AGENT_SESSION_COOKIE", "suite_agent_session")
    AGENT_DEFAULT_TIMEOUT_SECONDS = int(deps.get("AGENT_DEFAULT_TIMEOUT_SECONDS", 45))
    AGENT_MAX_TIMEOUT_SECONDS = int(deps.get("AGENT_MAX_TIMEOUT_SECONDS", 180))
    AGENT_REQUIRE_WEBHOOK_SECRET = bool(deps.get("AGENT_REQUIRE_WEBHOOK_SECRET", False))
    AGENT_WEBHOOK_SECRET = str(deps.get("AGENT_WEBHOOK_SECRET", "") or "")
    AGENT_GATEWAY_URL = str(deps.get("AGENT_GATEWAY_URL", "") or "")
    AGENT_SESSIONS = deps.get("AGENT_SESSIONS", {})
    ALLOWED_PAIRING_REDIRECT_PATHS = {
        "/login",
        "/agent/pairing-callback",
        "/app/agent/pairing-callback",
        "/app/agent",
        "/app/settings",
    }

    def _utc_iso(ts: float) -> str:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    def _normalize_model_candidates(values: Any) -> list[str]:
        if isinstance(values, (list, tuple)):
            raw_values = values
        elif values is None:
            raw_values = []
        else:
            raw_values = [values]

        deduped: list[str] = []
        seen: set[str] = set()
        for candidate in raw_values:
            text = str(candidate or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            deduped.append(text)
        return deduped

    def _derive_request_id(payload: Any = None) -> str:
        payload_dict = payload if isinstance(payload, dict) else {}
        request_id = (
            str(payload_dict.get("requestId") or payload_dict.get("request_id") or "").strip()
            or str(request.args.get("requestId") or request.args.get("request_id") or "").strip()
            or str(request.headers.get("X-Request-ID") or request.headers.get("X-Request-Id") or "").strip()
        )
        if request_id:
            return request_id[:160]
        timestamp_ms = int(time.time() * 1000)
        return f"agent-{timestamp_ms:x}"

    def _request_id() -> str:
        request_id = str(getattr(g, "agent_request_id", "") or "").strip()
        if request_id:
            return request_id
        request_id = _derive_request_id()
        g.agent_request_id = request_id
        return request_id

    @bp.before_request
    def _agent_bind_request_id():
        payload = request.get_json(silent=True) if request.is_json else None
        g.agent_request_id = _derive_request_id(payload)

    @bp.after_request
    def _agent_attach_request_id(response):
        request_id = _request_id()
        if request_id:
            response.headers.setdefault("X-Request-ID", request_id)
        if not request_id or not response.is_json:
            return response
        payload = response.get_json(silent=True)
        if not isinstance(payload, dict) or "requestId" in payload:
            return response
        payload["requestId"] = request_id
        response.set_data(json_module.dumps(payload))
        response.mimetype = "application/json"
        return response

    @bp.route("/pairing-challenge", methods=["POST"])
    @require_supabase_user
    @limiter.limit("12 per hour")
    def api_agent_pairing_challenge():
        """Request an email link to authorize a pair/unpair action."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )

        if not request.is_json:
            return jsonify({"error": "Expected JSON payload"}), 400

        payload = request.get_json(silent=True) or {}
        request_id = _request_id()
        action = str(payload.get("action") or "").strip().lower()
        if action not in {"pair", "unpair"}:
            return jsonify({"error": "Invalid action. Use pair or unpair."}), 400

        user = getattr(g, "supabase_user", {}) or {}
        user_id = _get_supabase_user_id(user)
        user_email = _get_supabase_user_email(user)
        if not user_id or not user_email:
            return jsonify({"error": "Authenticated user must have a valid email address."}), 400
        client_ip = _get_request_ip()

        client_redirect_to = str(payload.get("redirectTo") or payload.get("redirect_to") or "").strip()
        requested_redirect_path = str(
            payload.get("redirectPath") or payload.get("redirect_path") or ""
        ).strip()
        redirect_path = AGENT_PAIRING_REDIRECT_PATH
        if requested_redirect_path in ALLOWED_PAIRING_REDIRECT_PATHS:
            redirect_path = requested_redirect_path
        elif requested_redirect_path:
            _logger.warning(
                "Pairing challenge requested redirect path rejected request_id=%s requested_redirect_path=%s allowed_paths=%s",
                request_id,
                requested_redirect_path,
                sorted(ALLOWED_PAIRING_REDIRECT_PATHS),
            )
        allowed, reason, retry_after_seconds = _is_agent_pairing_action_allowed(user_id, action)
        if not allowed:
            _logger.warning(
                "Pairing challenge throttled request_id=%s action=%s reason=%s throttle_source=%s user=%s ip=%s",
                request_id,
                action,
                reason,
                "local-abuse",
                _email_fingerprint(user_email),
                client_ip,
            )
            response = jsonify(
                {
                    "error": "Too many verification requests. Please wait and try again.",
                    "reason": reason,
                    "code": "pairing-challenge-throttled",
                    "throttle_source": "local-abuse",
                    "retry_after_seconds": retry_after_seconds,
                }
            )
            if retry_after_seconds > 0:
                response.headers["Retry-After"] = str(retry_after_seconds)
            return response, 429

        pairing_code = ""
        if action == "pair":
            pairing_code, gateway_error, gateway_status = _request_gateway_pairing_code()
            if not pairing_code:
                _logger.warning(
                    "Pairing challenge code request failed request_id=%s user=%s ip=%s status=%s err=%s",
                    request_id,
                    _email_fingerprint(user_email),
                    client_ip,
                    gateway_status,
                    gateway_error,
                )
                return (
                    jsonify({"error": gateway_error or "Unable to request pairing code from gateway."}),
                    gateway_status if gateway_status >= 400 else 502,
                )

        challenge_id, expires_at = _create_agent_pairing_challenge(
            action=action,
            user_id=user_id,
            email=user_email,
            pairing_code=pairing_code,
            client_ip=client_ip,
        )

        resolved_redirect_url = ""
        selected_redirect_origin = ""
        if callable(_build_auth_redirect_url):
            resolved_redirect_url = str(
                _build_auth_redirect_url(
                    redirect_path,
                    client_redirect_to,
                    query_params={"agent_action": action, "agent_challenge": challenge_id},
                )
                or ""
            ).strip()
        if resolved_redirect_url:
            parsed_redirect = urlparse(resolved_redirect_url)
            if parsed_redirect.scheme and parsed_redirect.netloc:
                selected_redirect_origin = f"{parsed_redirect.scheme}://{parsed_redirect.netloc}"

        if not resolved_redirect_url:
            _logger.warning(
                "Pairing challenge redirect unresolved request_id=%s action=%s user=%s ip=%s requested_redirect_path=%s client_redirect_supplied=%s",
                request_id,
                action,
                _email_fingerprint(user_email),
                client_ip,
                redirect_path,
                bool(client_redirect_to),
            )
        else:
            _logger.info(
                "Pairing challenge email dispatch request_id=%s action=%s user=%s ip=%s selected_redirect_origin=%s final_redirect_path=%s",
                request_id,
                action,
                _email_fingerprint(user_email),
                client_ip,
                selected_redirect_origin or "unknown",
                redirect_path,
            )

        try:
            _send_supabase_email_link(
                user_email,
                "signin",
                client_redirect_to=client_redirect_to,
                redirect_path=redirect_path,
                redirect_query={"agent_action": action, "agent_challenge": challenge_id},
                require_redirect=True,
            )
        except Exception as exc:
            status_code = int(getattr(exc, "status_code", 0) or 0)
            retry_after_seconds = int(getattr(exc, "retry_after_seconds", 0) or 0)
            safe_status = status_code if 400 <= status_code <= 599 else 502
            throttle_source = "supabase" if safe_status == 429 else "none"
            _logger.warning(
                "Agent pairing challenge email failed request_id=%s action=%s throttle_source=%s user=%s ip=%s status=%s retry_after=%s error=%s",
                request_id,
                action,
                throttle_source,
                _email_fingerprint(user_email),
                client_ip,
                safe_status,
                retry_after_seconds,
                exc,
            )
            with AGENT_PAIRING_CHALLENGE_LOCK:
                AGENT_PAIRING_CHALLENGES.pop(challenge_id, None)
            message = str(exc or "").strip()
            if not message:
                message = "Unable to send verification email right now. Please retry."
            payload = {
                "error": message,
                "code": "pairing-email-delivery-failed",
                "throttle_source": throttle_source,
            }
            if retry_after_seconds > 0:
                payload["retry_after_seconds"] = retry_after_seconds
            response = jsonify(payload)
            if retry_after_seconds > 0:
                response.headers["Retry-After"] = str(retry_after_seconds)
            return response, safe_status

        return (
            jsonify(
                {
                    "ok": True,
                    "action": action,
                    "message": "Verification link sent to your email.",
                    "expires_at": _utc_iso(expires_at),
                }
            ),
            202,
        )

    @bp.route("/pairing-code/request", methods=["POST"])
    @require_supabase_user
    @limiter.limit("6 per hour")
    def api_agent_pairing_code_request():
        """Request a one-time gateway pairing code and deliver it through email link flow."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )

        payload = request.get_json(silent=True) if request.is_json else {}
        payload = payload or {}
        request_id = _request_id()
        client_redirect_to = str(payload.get("redirectTo") or payload.get("redirect_to") or "").strip()
        requested_redirect_path = str(
            payload.get("redirectPath") or payload.get("redirect_path") or ""
        ).strip()
        redirect_path = "/app/settings"
        if requested_redirect_path in ALLOWED_PAIRING_REDIRECT_PATHS:
            redirect_path = requested_redirect_path
        elif requested_redirect_path:
            _logger.warning(
                "Pairing code request redirect path rejected request_id=%s requested_redirect_path=%s allowed_paths=%s",
                request_id,
                requested_redirect_path,
                sorted(ALLOWED_PAIRING_REDIRECT_PATHS),
            )

        user = getattr(g, "supabase_user", {}) or {}
        user_id = _get_supabase_user_id(user)
        user_email = _get_supabase_user_email(user)
        if not user_id or not user_email:
            return jsonify({"error": "Authenticated user must have a valid email address."}), 400

        client_ip = _get_request_ip()
        allowed, reason, retry_after_seconds = _is_agent_pairing_action_allowed(
            user_id,
            "pairing-code-request",
        )
        if not allowed:
            _logger.warning(
                "Pairing code request throttled request_id=%s reason=%s throttle_source=%s user=%s ip=%s",
                request_id,
                reason,
                "local-abuse",
                _email_fingerprint(user_email),
                client_ip,
            )
            response = jsonify(
                {
                    "error": "Too many pairing code requests. Please wait and try again.",
                    "reason": reason,
                    "code": "pairing-code-request-throttled",
                    "throttle_source": "local-abuse",
                    "retry_after_seconds": retry_after_seconds,
                }
            )
            if retry_after_seconds > 0:
                response.headers["Retry-After"] = str(retry_after_seconds)
            return response, 429

        pairing_code, gateway_error, gateway_status = _request_gateway_pairing_code()
        if not pairing_code:
            _logger.warning(
                "Pairing code request failed request_id=%s user=%s ip=%s status=%s err=%s",
                request_id,
                _email_fingerprint(user_email),
                client_ip,
                gateway_status,
                gateway_error,
            )
            return (
                jsonify({"error": gateway_error or "Unable to request pairing code from gateway."}),
                gateway_status if gateway_status >= 400 else 502,
            )

        try:
            _send_supabase_email_link(
                user_email,
                "signin",
                client_redirect_to=client_redirect_to,
                redirect_path=redirect_path,
                redirect_query={
                    "agent_pairing_code": pairing_code,
                    "agent_pairing_notice": "code-loaded",
                },
                require_redirect=True,
            )
        except Exception as exc:
            status_code = int(getattr(exc, "status_code", 0) or 0)
            safe_status = status_code if 400 <= status_code <= 599 else 502
            throttle_source = "supabase" if safe_status == 429 else "none"
            _logger.warning(
                "Pairing code email failed request_id=%s throttle_source=%s user=%s ip=%s status=%s error=%s",
                request_id,
                throttle_source,
                _email_fingerprint(user_email),
                client_ip,
                safe_status,
                exc,
            )
            message = str(exc or "").strip()
            if not message:
                message = "Unable to send pairing code email right now. Please retry."
            return (
                jsonify(
                    {
                        "error": message,
                        "code": "pairing-code-email-delivery-failed",
                        "throttle_source": throttle_source,
                    }
                ),
                safe_status,
            )

        return jsonify({"ok": True, "message": "Pairing code email sent."}), 202

    @bp.route("/pairing-confirm", methods=["POST"])
    @require_supabase_user
    @limiter.limit("20 per hour")
    def api_agent_pairing_confirm():
        """Confirm a pair/unpair action using the emailed challenge link."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )

        if not request.is_json:
            return jsonify({"error": "Expected JSON payload"}), 400

        payload = request.get_json(silent=True) or {}
        request_id = _request_id()
        challenge_id = str(payload.get("challenge_id") or payload.get("challengeId") or "").strip()
        if not challenge_id:
            return jsonify({"error": "challenge_id is required"}), 400
        if not PAIRING_CHALLENGE_ID_PATTERN.match(challenge_id):
            return jsonify({"error": "Invalid challenge_id format."}), 400

        user = getattr(g, "supabase_user", {}) or {}
        user_id = _get_supabase_user_id(user)
        user_email = _get_supabase_user_email(user)
        if not user_id or not user_email:
            return jsonify({"error": "Authenticated user must have a valid email address."}), 400
        client_ip = _get_request_ip()

        blocked, retry_after_seconds = _is_agent_pairing_confirm_blocked(user_id, client_ip)
        if blocked:
            _logger.warning(
                "Pairing confirm throttled request_id=%s reason=%s throttle_source=%s user=%s ip=%s retry_after=%s",
                request_id,
                "invalid-attempts",
                "local-abuse",
                _email_fingerprint(user_email),
                client_ip,
                retry_after_seconds,
            )
            response = jsonify(
                {
                    "error": "Too many invalid verification attempts. Please request a new link and try later.",
                    "code": "pairing-confirm-throttled",
                    "throttle_source": "local-abuse",
                    "retry_after_seconds": retry_after_seconds,
                }
            )
            response.headers["Retry-After"] = str(retry_after_seconds)
            return response, 429

        challenge, reason = _consume_agent_pairing_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            email=user_email,
        )
        if not challenge:
            should_count_failure = reason in {"missing", "user-mismatch", "email-mismatch"}
            if should_count_failure:
                blocked_after_failure, blocked_retry_after = _register_agent_pairing_confirm_failure(
                    user_id,
                    client_ip,
                )
                if blocked_after_failure:
                    _logger.warning(
                        "Pairing confirm blocked after failure request_id=%s reason=%s throttle_source=%s user=%s ip=%s retry_after=%s",
                        request_id,
                        reason,
                        "local-abuse",
                        _email_fingerprint(user_email),
                        client_ip,
                        blocked_retry_after,
                    )
                    response = jsonify(
                        {
                            "error": "Too many invalid verification attempts. Please request a new link and try later.",
                            "code": "pairing-confirm-throttled",
                            "throttle_source": "local-abuse",
                            "retry_after_seconds": blocked_retry_after,
                        }
                    )
                    response.headers["Retry-After"] = str(blocked_retry_after)
                    return response, 429
            if reason == "expired":
                return jsonify({"error": "Verification link expired. Request a new one."}), 410
            if reason in {"user-mismatch", "email-mismatch"}:
                return jsonify({"error": "Verification link does not match this user."}), 403
            return jsonify({"error": "Invalid verification link."}), 400

        action = str(challenge.get("action") or "").strip().lower()
        if action == "pair":
            pairing_code = str(challenge.get("pairing_code") or "").strip()
            if not pairing_code:
                _register_agent_pairing_confirm_failure(user_id, client_ip)
                return jsonify({"error": "Pairing challenge is missing code."}), 400
            response = _pair_agent_session_for_user(
                pairing_code,
                user_id,
                extra_payload={"verified": True, "action": "pair"},
            )
            if response[1] < 400:
                _logger.info(
                    "Pairing confirm succeeded request_id=%s action=%s user=%s ip=%s",
                    request_id,
                    action,
                    _email_fingerprint(user_email),
                    client_ip,
                )
                _clear_agent_pairing_confirm_failures(user_id, client_ip)
            return response

        if action == "unpair":
            session = _get_agent_session()
            session_token = ""
            if session and session.get("user_id") == user_id:
                session_token = str(session.get("token") or "")

            revoke_response, revoke_status = _revoke_gateway_agent_token(session_token)
            if revoke_status >= 500:
                return revoke_response, revoke_status

            _clear_agent_session_for_request()
            payload = revoke_response.get_json(silent=True) or {}
            payload.update({"paired": False, "verified": True, "action": "unpair"})
            _clear_agent_pairing_confirm_failures(user_id, client_ip)
            _logger.info(
                "Pairing confirm succeeded request_id=%s action=%s user=%s ip=%s",
                request_id,
                action,
                _email_fingerprint(user_email),
                client_ip,
            )
            resp = jsonify(payload)
            resp.delete_cookie(AGENT_SESSION_COOKIE, path="/")
            return resp, 200

        _register_agent_pairing_confirm_failure(user_id, client_ip)
        return jsonify({"error": "Unsupported challenge action."}), 400

    @bp.route("/health", methods=["GET"])
    @require_supabase_user
    @limiter.limit("30 per minute; 2000 per day")
    def api_agent_health():
        """Proxy ZeroClaw health check through the backend."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )
        try:
            response = requests_module.get(
                f"{AGENT_GATEWAY_URL.rstrip('/')}/health",
                timeout=3,
            )
            return jsonify(response.json()), response.status_code
        except Exception as exc:
            _logger.warning("Agent health proxy failed: %s", exc)
            return jsonify({"error": "Agent gateway unavailable"}), 503

    @bp.route("/config", methods=["GET"])
    @require_supabase_user
    def api_agent_config():
        """Expose broker configuration readiness (no secrets)."""
        return jsonify(_agent_broker_config_status()), 200

    @bp.route("/profiles", methods=["GET"])
    @require_supabase_user
    def api_agent_profiles():
        """Expose profile/model routing metadata for the Suite agent UI."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )

        profiles = _list_agent_profiles() or []
        return jsonify({"ok": True, "profiles": profiles}), 200

    @bp.route("/session", methods=["GET"])
    @require_supabase_user
    @limiter.limit("20 per minute; 1200 per day")
    def api_agent_session():
        """Return whether a valid agent session cookie exists."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "paired": False,
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )
        session = _get_agent_session()
        user_id = _get_supabase_user_id(getattr(g, "supabase_user", {}) or {})
        if session and user_id and session.get("user_id") == user_id:
            return jsonify({"paired": True, "expires_at": _utc_iso(session["expires_at"])})
        return jsonify({"paired": False})

    @bp.route("/pair", methods=["POST"])
    @require_supabase_user
    @limiter.limit("10 per hour")
    def api_agent_pair():
        return (
            jsonify(
                {
                    "error": "Direct pair is disabled. Request email verification first.",
                    "next": [
                        "POST /api/agent/pairing-challenge",
                        "POST /api/agent/pairing-confirm",
                    ],
                }
            ),
            428,
        )

    @bp.route("/unpair", methods=["POST"])
    @require_supabase_user
    def api_agent_unpair():
        return (
            jsonify(
                {
                    "error": "Direct unpair is disabled. Request email verification first.",
                    "next": [
                        "POST /api/agent/pairing-challenge",
                        "POST /api/agent/pairing-confirm",
                    ],
                }
            ),
            428,
        )

    @bp.route("/session/clear", methods=["POST"])
    @require_supabase_user
    def api_agent_session_clear():
        _clear_agent_session_for_request()

        resp = jsonify({"paired": False})
        resp.delete_cookie(AGENT_SESSION_COOKIE, path="/")
        return resp

    @bp.route("/webhook", methods=["POST"])
    @require_supabase_user
    @require_agent_session
    def api_agent_webhook():
        """Proxy webhook requests to ZeroClaw using the server-side session token."""
        config_status = _agent_broker_config_status()
        if not config_status["ok"]:
            return (
                jsonify(
                    {
                        "error": "Agent broker misconfigured",
                        "missing": config_status["missing"],
                        "warnings": config_status["warnings"],
                    }
                ),
                503,
            )
        if not request.is_json:
            return jsonify({"error": "Expected JSON payload"}), 400

        if AGENT_REQUIRE_WEBHOOK_SECRET and not AGENT_WEBHOOK_SECRET:
            return (
                jsonify(
                    {
                        "error": "Agent webhook secret is required but not configured.",
                        "missing": ["AGENT_WEBHOOK_SECRET"],
                    }
                ),
                503,
            )

        payload = request.get_json(silent=False)
        profile_id = str(payload.get("profile_id") or payload.get("profileId") or "").strip().lower()
        route = _resolve_agent_profile_route(profile_id) if profile_id else None

        requested_model_candidates = _normalize_model_candidates(
            payload.get("model_candidates") or payload.get("modelCandidates")
        )
        requested_model_candidates.extend(
            _normalize_model_candidates(
                [
                    payload.get("model"),
                    payload.get("model_hint"),
                    payload.get("modelHint"),
                ]
            )
        )

        if route:
            model_candidates = _normalize_model_candidates(
                [route.get("primary_model"), *(route.get("fallback_models") or [])]
            )
        else:
            model_candidates = _normalize_model_candidates(requested_model_candidates)

        raw_message = payload.get("message")
        task_name = ""
        try:
            if isinstance(raw_message, str):
                parsed = json_module.loads(raw_message)
                if isinstance(parsed, dict):
                    task_name = str(parsed.get("task") or "").strip()
                    timeout_ms = parsed.get("timeout")
                else:
                    timeout_ms = None
            else:
                timeout_ms = None
        except Exception:
            timeout_ms = None

        user = getattr(g, "supabase_user", {}) or {}
        if not task_name and not _is_admin_user(user):
            return jsonify({"error": "Agent task not allowed for this user"}), 403
        if task_name and not _is_agent_task_allowed(task_name, user):
            return jsonify({"error": "Agent task not allowed for this user"}), 403

        timeout_seconds = AGENT_DEFAULT_TIMEOUT_SECONDS
        if isinstance(timeout_ms, (int, float)) and timeout_ms > 0:
            timeout_seconds = min(
                max(int(timeout_ms / 1000), AGENT_DEFAULT_TIMEOUT_SECONDS),
                AGENT_MAX_TIMEOUT_SECONDS,
            )

        session = getattr(g, "agent_session", {})
        token = session.get("token")
        if not token:
            return jsonify({"error": "Agent session missing"}), 401

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if AGENT_WEBHOOK_SECRET:
            headers["X-Webhook-Secret"] = AGENT_WEBHOOK_SECRET

        response = None
        request_exception = None
        model_attempts = model_candidates if model_candidates else [""]

        for attempt_index, attempt_model in enumerate(model_attempts):
            proxy_payload = dict(payload)
            if attempt_model:
                proxy_payload["model"] = attempt_model
            else:
                proxy_payload.pop("model", None)

            if attempt_index < len(model_attempts) - 1:
                proxy_payload["fallback_models"] = model_attempts[attempt_index + 1 :]
            else:
                proxy_payload.pop("fallback_models", None)

            try:
                response = requests_module.post(
                    f"{AGENT_GATEWAY_URL.rstrip('/')}/webhook",
                    headers=headers,
                    json=proxy_payload,
                    timeout=timeout_seconds,
                )
            except Exception as exc:
                request_exception = exc
                if attempt_index < len(model_attempts) - 1:
                    _logger.warning(
                        "Agent webhook proxy attempt failed profile=%s model=%s; trying fallback: %s",
                        profile_id or "default",
                        attempt_model or "default",
                        exc,
                    )
                    continue
                _logger.warning("Agent webhook proxy failed: %s", exc)
                return jsonify({"error": "Agent gateway unavailable"}), 503

            if response.status_code >= 500 and attempt_index < len(model_attempts) - 1:
                _logger.warning(
                    "Agent webhook gateway status=%s profile=%s model=%s; trying fallback model=%s",
                    response.status_code,
                    profile_id or "default",
                    attempt_model or "default",
                    model_attempts[attempt_index + 1],
                )
                continue
            break

        if response is None:
            _logger.warning(
                "Agent webhook proxy returned no response profile=%s err=%s",
                profile_id or "default",
                request_exception,
            )
            return jsonify({"error": "Agent gateway unavailable"}), 503

        if response.status_code in (401, 403):
            session_id = request.cookies.get(AGENT_SESSION_COOKIE)
            if session_id:
                AGENT_SESSIONS.pop(session_id, None)
            resp = jsonify({"error": "Agent session expired. Please pair again."})
            resp.delete_cookie(AGENT_SESSION_COOKIE, path="/")
            return resp, 401

        try:
            data = response.json()
            return jsonify(data), response.status_code
        except Exception:
            return (response.text or ""), response.status_code

    return bp
