from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple


def _utc_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def request_gateway_pairing_code(
    *,
    agent_gateway_url: str,
    agent_webhook_secret: str,
    pairing_code_pattern: Any,
    requests_module: Any,
    logger: Any,
) -> Tuple[Optional[str], Optional[str], int]:
    headers: Dict[str, str] = {}
    if agent_webhook_secret:
        headers["X-Webhook-Secret"] = agent_webhook_secret

    try:
        response = requests_module.post(
            f"{agent_gateway_url.rstrip('/')}/pairing-code",
            headers=headers if headers else None,
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Pairing code request proxy failed: %s", exc)
        return None, "Agent gateway unavailable", 503

    if response.status_code != 200:
        details = response.text.strip() if response.text else ""
        if details:
            return None, details, response.status_code
        return None, "Gateway pairing code request failed", response.status_code

    try:
        payload = response.json() if response.content else {}
    except Exception:
        payload = {}

    pairing_code = str(payload.get("pairing_code") or "").strip()
    if not pairing_code_pattern.match(pairing_code):
        return None, "Gateway did not return a valid pairing code.", 502

    return pairing_code, None, 200


def pair_agent_session_for_user(
    pairing_code: str,
    user_id: str,
    *,
    agent_gateway_url: str,
    create_agent_session: Callable[[str, str], Tuple[str, int]],
    jsonify_fn: Callable[[Dict[str, Any]], Any],
    agent_session_cookie: str,
    agent_session_samesite: str,
    agent_session_secure: bool,
    agent_session_ttl_seconds: int,
    requests_module: Any,
    logger: Any,
    extra_payload: Optional[Dict[str, Any]] = None,
):
    try:
        response = requests_module.post(
            f"{agent_gateway_url.rstrip('/')}/pair",
            headers={"X-Pairing-Code": pairing_code},
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Pairing proxy failed: %s", exc)
        return jsonify_fn({"error": "Agent gateway unavailable"}), 503

    if response.status_code != 200:
        return (
            jsonify_fn(
                {
                    "error": "Pairing failed",
                    "details": response.text,
                }
            ),
            response.status_code,
        )

    try:
        data = response.json()
    except Exception:
        data = {}

    token = data.get("token")
    if not token:
        return jsonify_fn({"error": "Gateway did not return a token"}), 502

    session_id, expires_at = create_agent_session(token, user_id)
    response_payload: Dict[str, Any] = {
        "paired": True,
        "expires_at": _utc_iso(expires_at),
    }
    if extra_payload:
        response_payload.update(extra_payload)
    resp = jsonify_fn(response_payload)
    resp.set_cookie(
        agent_session_cookie,
        session_id,
        httponly=True,
        samesite=agent_session_samesite,
        secure=agent_session_secure,
        max_age=agent_session_ttl_seconds,
        path="/",
    )
    return resp, 200


def revoke_gateway_agent_token(
    token: str,
    *,
    agent_gateway_url: str,
    jsonify_fn: Callable[[Dict[str, Any]], Any],
    requests_module: Any,
    logger: Any,
):
    if not token:
        return jsonify_fn({"revoked": False, "paired": False}), 200

    try:
        response = requests_module.post(
            f"{agent_gateway_url.rstrip('/')}/unpair",
            headers={
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Unpair proxy failed: %s", exc)
        return jsonify_fn({"error": "Agent gateway unavailable"}), 503

    if response.status_code in (200, 401, 403, 404):
        payload: Dict[str, Any] = {}
        try:
            payload = response.json()
        except Exception:
            payload = {}
        return (
            jsonify_fn(
                {
                    "revoked": response.status_code == 200 or payload.get("revoked") is True,
                    "gateway_status": response.status_code,
                    "paired": bool(payload.get("paired")),
                    "pairing_code": payload.get("pairing_code"),
                }
            ),
            200,
        )

    return (
        jsonify_fn(
            {
                "error": "Gateway unpair failed",
                "details": response.text,
            }
        ),
        response.status_code,
    )
