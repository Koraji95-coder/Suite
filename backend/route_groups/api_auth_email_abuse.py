from __future__ import annotations

from threading import Lock
from typing import Callable, Dict, List, Tuple


def auth_email_key(
    email: str,
    client_ip: str,
    *,
    email_fingerprint_fn: Callable[..., str],
) -> str:
    return f"{client_ip}:{email_fingerprint_fn(email, length=24)}"


def auth_email_ip_key(client_ip: str) -> str:
    return client_ip or "unknown"


def compact_auth_email_state(
    now: float,
    *,
    auth_email_window_seconds: int,
    auth_email_ip_window_seconds: int,
    auth_email_window: Dict[str, List[float]],
    auth_email_last_attempt: Dict[str, float],
    auth_email_blocked_until: Dict[str, float],
    auth_email_ip_window: Dict[str, List[float]],
    auth_email_ip_blocked_until: Dict[str, float],
) -> None:
    if len(auth_email_last_attempt) < 5000:
        if len(auth_email_ip_window) < 5000:
            return

    stale_before = now - max(300.0, auth_email_window_seconds * 4)
    for key, last_seen in list(auth_email_last_attempt.items()):
        blocked_until = auth_email_blocked_until.get(key, 0.0)
        if last_seen >= stale_before or blocked_until > now:
            continue
        auth_email_last_attempt.pop(key, None)
        auth_email_window.pop(key, None)
        auth_email_blocked_until.pop(key, None)

    ip_stale_before = now - max(300.0, auth_email_ip_window_seconds * 4)
    for key, attempts in list(auth_email_ip_window.items()):
        blocked_until = auth_email_ip_blocked_until.get(key, 0.0)
        recent_attempts = [
            ts
            for ts in attempts
            if (now - ts) <= auth_email_ip_window_seconds
        ]
        if recent_attempts or blocked_until > now:
            auth_email_ip_window[key] = recent_attempts
            continue
        if attempts and attempts[-1] >= ip_stale_before:
            auth_email_ip_window[key] = recent_attempts
            continue
        auth_email_ip_window.pop(key, None)
        auth_email_ip_blocked_until.pop(key, None)


def is_auth_email_request_allowed(
    email: str,
    client_ip: str,
    *,
    now_fn: Callable[[], float],
    auth_email_abuse_lock: Lock,
    email_fingerprint_fn: Callable[..., str],
    auth_email_window_seconds: int,
    auth_email_max_attempts: int,
    auth_email_min_interval_seconds: int,
    auth_email_block_seconds: int,
    auth_email_ip_window_seconds: int,
    auth_email_ip_max_attempts: int,
    auth_email_ip_block_seconds: int,
    auth_email_window: Dict[str, List[float]],
    auth_email_last_attempt: Dict[str, float],
    auth_email_blocked_until: Dict[str, float],
    auth_email_ip_window: Dict[str, List[float]],
    auth_email_ip_blocked_until: Dict[str, float],
) -> Tuple[bool, str]:
    key = auth_email_key(
        email,
        client_ip,
        email_fingerprint_fn=email_fingerprint_fn,
    )
    ip_key = auth_email_ip_key(client_ip)
    now = now_fn()

    with auth_email_abuse_lock:
        compact_auth_email_state(
            now,
            auth_email_window_seconds=auth_email_window_seconds,
            auth_email_ip_window_seconds=auth_email_ip_window_seconds,
            auth_email_window=auth_email_window,
            auth_email_last_attempt=auth_email_last_attempt,
            auth_email_blocked_until=auth_email_blocked_until,
            auth_email_ip_window=auth_email_ip_window,
            auth_email_ip_blocked_until=auth_email_ip_blocked_until,
        )

        blocked_until = auth_email_blocked_until.get(key, 0.0)
        if blocked_until > now:
            return False, "blocked"

        ip_blocked_until = auth_email_ip_blocked_until.get(ip_key, 0.0)
        if ip_blocked_until > now:
            return False, "ip-blocked"

        window = [
            ts
            for ts in auth_email_window.get(key, [])
            if (now - ts) <= auth_email_window_seconds
        ]
        last_attempt = auth_email_last_attempt.get(key, 0.0)

        if (
            auth_email_min_interval_seconds > 0
            and last_attempt > 0
            and (now - last_attempt) < auth_email_min_interval_seconds
        ):
            auth_email_window[key] = window
            auth_email_last_attempt[key] = now
            if len(window) >= auth_email_max_attempts:
                auth_email_blocked_until[key] = now + auth_email_block_seconds
            return False, "min-interval"

        window.append(now)
        auth_email_window[key] = window
        auth_email_last_attempt[key] = now

        if len(window) > auth_email_max_attempts:
            auth_email_blocked_until[key] = now + auth_email_block_seconds
            return False, "window-limit"

        ip_window = [
            ts
            for ts in auth_email_ip_window.get(ip_key, [])
            if (now - ts) <= auth_email_ip_window_seconds
        ]
        ip_window.append(now)
        auth_email_ip_window[ip_key] = ip_window
        if len(ip_window) > auth_email_ip_max_attempts:
            auth_email_ip_blocked_until[ip_key] = now + auth_email_ip_block_seconds
            return False, "ip-window-limit"

    return True, "ok"
