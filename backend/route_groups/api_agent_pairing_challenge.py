from __future__ import annotations

from threading import Lock
from typing import Any, Callable, Dict, Optional, Tuple


def purge_expired_agent_pairing_challenges(
    *,
    agent_pairing_challenges_store: Dict[str, Dict[str, Any]],
    agent_pairing_challenge_max_entries: int,
    now_fn: Callable[[], float],
    now: Optional[float] = None,
) -> None:
    ts = now_fn() if now is None else now
    expired = [
        cid
        for cid, challenge in agent_pairing_challenges_store.items()
        if challenge.get("expires_at", 0) <= ts
    ]
    for cid in expired:
        agent_pairing_challenges_store.pop(cid, None)

    overflow = len(agent_pairing_challenges_store) - agent_pairing_challenge_max_entries
    if overflow <= 0:
        return

    oldest = sorted(
        agent_pairing_challenges_store.items(),
        key=lambda item: item[1].get("created_at", 0),
    )[:overflow]
    for cid, _ in oldest:
        agent_pairing_challenges_store.pop(cid, None)


def create_agent_pairing_challenge(
    action: str,
    user_id: str,
    email: str,
    pairing_code: str,
    client_ip: str,
    *,
    purge_expired_agent_pairing_challenges_fn: Callable[[Optional[float]], None],
    token_urlsafe_fn: Callable[[int], str],
    now_fn: Callable[[], float],
    agent_pairing_challenge_ttl_seconds: int,
    agent_pairing_challenge_lock: Lock,
    agent_pairing_challenges_store: Dict[str, Dict[str, Any]],
) -> Tuple[str, int]:
    now = now_fn()
    expires_at = int(now) + agent_pairing_challenge_ttl_seconds
    challenge_id = token_urlsafe_fn(32)
    payload = {
        "action": action,
        "user_id": user_id,
        "email": email.strip().lower(),
        "pairing_code": pairing_code,
        "created_at": now,
        "expires_at": expires_at,
        "client_ip": client_ip,
    }

    with agent_pairing_challenge_lock:
        purge_expired_agent_pairing_challenges_fn(now)
        agent_pairing_challenges_store[challenge_id] = payload

    return challenge_id, expires_at


def consume_agent_pairing_challenge(
    challenge_id: str,
    user_id: str,
    email: str,
    *,
    purge_expired_agent_pairing_challenges_fn: Callable[[Optional[float]], None],
    now_fn: Callable[[], float],
    agent_pairing_challenge_lock: Lock,
    agent_pairing_challenges_store: Dict[str, Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], str]:
    now = now_fn()
    normalized_email = email.strip().lower()

    with agent_pairing_challenge_lock:
        purge_expired_agent_pairing_challenges_fn(now)
        challenge = agent_pairing_challenges_store.get(challenge_id)
        if not challenge:
            return None, "missing"

        if challenge.get("expires_at", 0) <= now:
            agent_pairing_challenges_store.pop(challenge_id, None)
            return None, "expired"

        if challenge.get("user_id") != user_id:
            return None, "user-mismatch"

        if normalized_email and challenge.get("email") != normalized_email:
            return None, "email-mismatch"

        agent_pairing_challenges_store.pop(challenge_id, None)
        return challenge, "ok"
