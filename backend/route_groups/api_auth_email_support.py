from __future__ import annotations

from typing import Any, Callable, Dict


def auth_email_generic_response() -> Dict[str, Any]:
    return {
        "ok": True,
        "message": "If the email is eligible, a link has been sent.",
    }


def apply_auth_email_response_floor(
    start_time: float,
    *,
    auth_email_min_response_ms: int,
    auth_email_response_jitter_ms: int,
    randbelow_fn: Callable[[int], int],
    perf_counter_fn: Callable[[], float],
    sleep_fn: Callable[[float], None],
) -> None:
    target_ms = auth_email_min_response_ms
    if auth_email_response_jitter_ms > 0:
        target_ms += randbelow_fn(auth_email_response_jitter_ms + 1)

    if target_ms <= 0:
        return

    elapsed_ms = (perf_counter_fn() - start_time) * 1000.0
    remaining_ms = target_ms - elapsed_ms
    if remaining_ms > 0:
        sleep_fn(remaining_ms / 1000.0)


def verify_turnstile_token(
    token: str,
    client_ip: str,
    *,
    auth_email_turnstile_secret: str,
    auth_email_turnstile_verify_url: str,
    auth_email_turnstile_timeout_seconds: int,
    requests_module: Any,
    logger: Any,
) -> bool:
    if not auth_email_turnstile_secret:
        return True

    if not token:
        return False

    try:
        response = requests_module.post(
            auth_email_turnstile_verify_url,
            data={
                "secret": auth_email_turnstile_secret,
                "response": token,
                "remoteip": client_ip,
            },
            timeout=auth_email_turnstile_timeout_seconds,
        )
        if response.status_code != 200:
            logger.warning(
                "Turnstile verification failed with status=%s",
                response.status_code,
            )
            return False

        payload = response.json() if response.content else {}
        if payload.get("success") is True:
            return True

        logger.warning(
            "Turnstile verification rejected request: codes=%s",
            payload.get("error-codes"),
        )
        return False
    except Exception:
        logger.warning("Turnstile verification error")
        return False
