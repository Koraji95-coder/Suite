from __future__ import annotations

import math
from threading import Lock
from typing import Dict, List, Tuple


def agent_pairing_action_key(user_id: str, action: str) -> str:
    return f"{user_id}:{action}"


def compact_agent_pairing_action_state(
    now: float,
    *,
    agent_pairing_action_window: Dict[str, List[float]],
    agent_pairing_action_last_attempt: Dict[str, float],
    agent_pairing_action_blocked_until: Dict[str, float],
    agent_pairing_action_window_seconds: int,
) -> None:
    if len(agent_pairing_action_last_attempt) < 5000:
        return

    stale_before = now - max(300.0, agent_pairing_action_window_seconds * 4)
    for key, last_seen in list(agent_pairing_action_last_attempt.items()):
        blocked_until = agent_pairing_action_blocked_until.get(key, 0.0)
        if last_seen >= stale_before or blocked_until > now:
            continue
        agent_pairing_action_last_attempt.pop(key, None)
        agent_pairing_action_window.pop(key, None)
        agent_pairing_action_blocked_until.pop(key, None)


def is_agent_pairing_action_allowed(
    user_id: str,
    action: str,
    *,
    now_fn,
    agent_pairing_action_abuse_lock: Lock,
    agent_pairing_action_window: Dict[str, List[float]],
    agent_pairing_action_last_attempt: Dict[str, float],
    agent_pairing_action_blocked_until: Dict[str, float],
    agent_pairing_action_window_seconds: int,
    agent_pairing_action_max_attempts: int,
    agent_pairing_action_min_interval_seconds: int,
    agent_pairing_action_block_seconds: int,
) -> Tuple[bool, str, int]:
    key = agent_pairing_action_key(user_id, action)
    now = now_fn()

    with agent_pairing_action_abuse_lock:
        compact_agent_pairing_action_state(
            now,
            agent_pairing_action_window=agent_pairing_action_window,
            agent_pairing_action_last_attempt=agent_pairing_action_last_attempt,
            agent_pairing_action_blocked_until=agent_pairing_action_blocked_until,
            agent_pairing_action_window_seconds=agent_pairing_action_window_seconds,
        )

        blocked_until = agent_pairing_action_blocked_until.get(key, 0.0)
        if blocked_until > now:
            retry_after = max(1, int(math.ceil(blocked_until - now)))
            return False, "blocked", retry_after

        window = [
            ts
            for ts in agent_pairing_action_window.get(key, [])
            if (now - ts) <= agent_pairing_action_window_seconds
        ]
        last_attempt = agent_pairing_action_last_attempt.get(key, 0.0)

        if (
            agent_pairing_action_min_interval_seconds > 0
            and last_attempt > 0
            and (now - last_attempt) < agent_pairing_action_min_interval_seconds
        ):
            window.append(now)
            agent_pairing_action_window[key] = window
            agent_pairing_action_last_attempt[key] = now
            if len(window) > agent_pairing_action_max_attempts:
                agent_pairing_action_blocked_until[key] = now + agent_pairing_action_block_seconds
                return False, "window-limit", agent_pairing_action_block_seconds
            retry_after = max(
                1,
                int(
                    math.ceil(
                        agent_pairing_action_min_interval_seconds - (now - last_attempt)
                    )
                ),
            )
            return False, "min-interval", retry_after

        window.append(now)
        agent_pairing_action_window[key] = window
        agent_pairing_action_last_attempt[key] = now

        if len(window) > agent_pairing_action_max_attempts:
            agent_pairing_action_blocked_until[key] = now + agent_pairing_action_block_seconds
            return False, "window-limit", agent_pairing_action_block_seconds

    return True, "ok", 0


def agent_pairing_confirm_key(user_id: str, client_ip: str) -> str:
    return f"{user_id}:{client_ip or 'unknown'}"


def compact_agent_pairing_confirm_state(
    now: float,
    *,
    agent_pairing_confirm_failure_window: Dict[str, List[float]],
    agent_pairing_confirm_blocked_until: Dict[str, float],
    agent_pairing_confirm_failure_window_seconds: int,
) -> None:
    if len(agent_pairing_confirm_failure_window) < 5000:
        return

    stale_before = now - max(300.0, agent_pairing_confirm_failure_window_seconds * 4)
    for key, attempts in list(agent_pairing_confirm_failure_window.items()):
        blocked_until = agent_pairing_confirm_blocked_until.get(key, 0.0)
        recent_attempts = [
            ts
            for ts in attempts
            if (now - ts) <= agent_pairing_confirm_failure_window_seconds
        ]
        if recent_attempts or blocked_until > now:
            agent_pairing_confirm_failure_window[key] = recent_attempts
            continue
        agent_pairing_confirm_failure_window.pop(key, None)
        agent_pairing_confirm_blocked_until.pop(key, None)


def is_agent_pairing_confirm_blocked(
    user_id: str,
    client_ip: str,
    *,
    now_fn,
    agent_pairing_confirm_abuse_lock: Lock,
    agent_pairing_confirm_failure_window: Dict[str, List[float]],
    agent_pairing_confirm_blocked_until: Dict[str, float],
    agent_pairing_confirm_failure_window_seconds: int,
) -> Tuple[bool, int]:
    key = agent_pairing_confirm_key(user_id, client_ip)
    now = now_fn()
    with agent_pairing_confirm_abuse_lock:
        compact_agent_pairing_confirm_state(
            now,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
            agent_pairing_confirm_failure_window_seconds=agent_pairing_confirm_failure_window_seconds,
        )
        blocked_until = agent_pairing_confirm_blocked_until.get(key, 0.0)
        if blocked_until <= now:
            return False, 0
        retry_after = max(1, int(math.ceil(blocked_until - now)))
        return True, retry_after


def register_agent_pairing_confirm_failure(
    user_id: str,
    client_ip: str,
    *,
    now_fn,
    agent_pairing_confirm_abuse_lock: Lock,
    agent_pairing_confirm_failure_window: Dict[str, List[float]],
    agent_pairing_confirm_blocked_until: Dict[str, float],
    agent_pairing_confirm_failure_window_seconds: int,
    agent_pairing_confirm_failure_max_attempts: int,
    agent_pairing_confirm_failure_block_seconds: int,
) -> Tuple[bool, int]:
    key = agent_pairing_confirm_key(user_id, client_ip)
    now = now_fn()

    with agent_pairing_confirm_abuse_lock:
        compact_agent_pairing_confirm_state(
            now,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
            agent_pairing_confirm_failure_window_seconds=agent_pairing_confirm_failure_window_seconds,
        )

        blocked_until = agent_pairing_confirm_blocked_until.get(key, 0.0)
        if blocked_until > now:
            retry_after = max(1, int(math.ceil(blocked_until - now)))
            return True, retry_after

        attempts = [
            ts
            for ts in agent_pairing_confirm_failure_window.get(key, [])
            if (now - ts) <= agent_pairing_confirm_failure_window_seconds
        ]
        attempts.append(now)
        agent_pairing_confirm_failure_window[key] = attempts

        if len(attempts) > agent_pairing_confirm_failure_max_attempts:
            agent_pairing_confirm_blocked_until[key] = now + agent_pairing_confirm_failure_block_seconds
            return True, agent_pairing_confirm_failure_block_seconds

    return False, 0


def clear_agent_pairing_confirm_failures(
    user_id: str,
    client_ip: str,
    *,
    agent_pairing_confirm_abuse_lock: Lock,
    agent_pairing_confirm_failure_window: Dict[str, List[float]],
    agent_pairing_confirm_blocked_until: Dict[str, float],
) -> None:
    key = agent_pairing_confirm_key(user_id, client_ip)
    with agent_pairing_confirm_abuse_lock:
        agent_pairing_confirm_failure_window.pop(key, None)
        agent_pairing_confirm_blocked_until.pop(key, None)
