from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any, Callable, Dict, List, Tuple

from .api_auth_email_abuse import (
    auth_email_ip_key as auth_email_abuse_ip_key_helper,
    auth_email_key as auth_email_abuse_key_helper,
    compact_auth_email_state as auth_email_abuse_compact_state_helper,
    is_auth_email_request_allowed as auth_email_abuse_is_request_allowed_helper,
)
from .api_auth_email_support import (
    apply_auth_email_response_floor as auth_email_support_apply_response_floor_helper,
    auth_email_generic_response as auth_email_support_generic_response_helper,
    verify_turnstile_token as auth_email_support_verify_turnstile_token_helper,
)


@dataclass(frozen=True)
class EmailRuntime:
    email_fingerprint: Callable[[str, int], str]
    auth_email_key: Callable[[str, str], str]
    auth_email_ip_key: Callable[[str], str]
    compact_auth_email_state: Callable[[float], None]
    is_auth_email_request_allowed: Callable[[str, str], Tuple[bool, str]]
    auth_email_generic_response: Callable[[], Dict[str, Any]]
    apply_auth_email_response_floor: Callable[[float], None]
    verify_turnstile_token: Callable[[str, str], bool]
    is_valid_email: Callable[[str], bool]


def create_email_runtime(
    *,
    now_fn: Callable[[], float],
    perf_counter_fn: Callable[[], float],
    sleep_fn: Callable[[float], None],
    randbelow_fn: Callable[[int], int],
    requests_module: Any,
    logger: Any,
    is_valid_email_fn: Callable[[str], bool],
    auth_email_window_seconds: int,
    auth_email_max_attempts: int,
    auth_email_min_interval_seconds: int,
    auth_email_block_seconds: int,
    auth_email_ip_window_seconds: int,
    auth_email_ip_max_attempts: int,
    auth_email_ip_block_seconds: int,
    auth_email_min_response_ms: int,
    auth_email_response_jitter_ms: int,
    auth_email_turnstile_secret: str,
    auth_email_turnstile_verify_url: str,
    auth_email_turnstile_timeout_seconds: int,
    auth_email_abuse_lock: Any,
    auth_email_window: Dict[str, List[float]],
    auth_email_last_attempt: Dict[str, float],
    auth_email_blocked_until: Dict[str, float],
    auth_email_ip_window: Dict[str, List[float]],
    auth_email_ip_blocked_until: Dict[str, float],
) -> EmailRuntime:
    def email_fingerprint(email: str, length: int = 12) -> str:
        digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
        return digest[: max(6, length)]

    def auth_email_key(email: str, client_ip: str) -> str:
        return auth_email_abuse_key_helper(
            email,
            client_ip,
            email_fingerprint_fn=email_fingerprint,
        )

    def auth_email_ip_key(client_ip: str) -> str:
        return auth_email_abuse_ip_key_helper(client_ip)

    def compact_auth_email_state(now: float) -> None:
        return auth_email_abuse_compact_state_helper(
            now,
            auth_email_window_seconds=auth_email_window_seconds,
            auth_email_ip_window_seconds=auth_email_ip_window_seconds,
            auth_email_window=auth_email_window,
            auth_email_last_attempt=auth_email_last_attempt,
            auth_email_blocked_until=auth_email_blocked_until,
            auth_email_ip_window=auth_email_ip_window,
            auth_email_ip_blocked_until=auth_email_ip_blocked_until,
        )

    def is_auth_email_request_allowed(email: str, client_ip: str) -> Tuple[bool, str]:
        return auth_email_abuse_is_request_allowed_helper(
            email,
            client_ip,
            now_fn=now_fn,
            auth_email_abuse_lock=auth_email_abuse_lock,
            email_fingerprint_fn=email_fingerprint,
            auth_email_window_seconds=auth_email_window_seconds,
            auth_email_max_attempts=auth_email_max_attempts,
            auth_email_min_interval_seconds=auth_email_min_interval_seconds,
            auth_email_block_seconds=auth_email_block_seconds,
            auth_email_ip_window_seconds=auth_email_ip_window_seconds,
            auth_email_ip_max_attempts=auth_email_ip_max_attempts,
            auth_email_ip_block_seconds=auth_email_ip_block_seconds,
            auth_email_window=auth_email_window,
            auth_email_last_attempt=auth_email_last_attempt,
            auth_email_blocked_until=auth_email_blocked_until,
            auth_email_ip_window=auth_email_ip_window,
            auth_email_ip_blocked_until=auth_email_ip_blocked_until,
        )

    def auth_email_generic_response() -> Dict[str, Any]:
        return auth_email_support_generic_response_helper()

    def apply_auth_email_response_floor(start_time: float) -> None:
        return auth_email_support_apply_response_floor_helper(
            start_time,
            auth_email_min_response_ms=auth_email_min_response_ms,
            auth_email_response_jitter_ms=auth_email_response_jitter_ms,
            randbelow_fn=randbelow_fn,
            perf_counter_fn=perf_counter_fn,
            sleep_fn=sleep_fn,
        )

    def verify_turnstile_token(token: str, client_ip: str) -> bool:
        return auth_email_support_verify_turnstile_token_helper(
            token,
            client_ip,
            auth_email_turnstile_secret=auth_email_turnstile_secret,
            auth_email_turnstile_verify_url=auth_email_turnstile_verify_url,
            auth_email_turnstile_timeout_seconds=auth_email_turnstile_timeout_seconds,
            requests_module=requests_module,
            logger=logger,
        )

    def is_valid_email(value: str) -> bool:
        return is_valid_email_fn(value)

    return EmailRuntime(
        email_fingerprint=email_fingerprint,
        auth_email_key=auth_email_key,
        auth_email_ip_key=auth_email_ip_key,
        compact_auth_email_state=compact_auth_email_state,
        is_auth_email_request_allowed=is_auth_email_request_allowed,
        auth_email_generic_response=auth_email_generic_response,
        apply_auth_email_response_floor=apply_auth_email_response_floor,
        verify_turnstile_token=verify_turnstile_token,
        is_valid_email=is_valid_email,
    )
