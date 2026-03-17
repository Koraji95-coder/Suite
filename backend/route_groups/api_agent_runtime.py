from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .api_agent_abuse_controls import (
    agent_pairing_action_key as agent_abuse_action_key_helper,
    agent_pairing_confirm_key as agent_abuse_confirm_key_helper,
    clear_agent_pairing_confirm_failures as agent_abuse_clear_confirm_failures_helper,
    compact_agent_pairing_action_state as agent_abuse_compact_action_state_helper,
    compact_agent_pairing_confirm_state as agent_abuse_compact_confirm_state_helper,
    is_agent_pairing_action_allowed as agent_abuse_is_action_allowed_helper,
    is_agent_pairing_confirm_blocked as agent_abuse_is_confirm_blocked_helper,
    register_agent_pairing_confirm_failure as agent_abuse_register_confirm_failure_helper,
)
from .api_agent_helpers import (
    pair_agent_session_for_user as agent_helpers_pair_session_helper,
    request_gateway_pairing_code as agent_helpers_request_pairing_code_helper,
    revoke_gateway_agent_token as agent_helpers_revoke_token_helper,
)
from .api_agent_pairing_challenge import (
    consume_agent_pairing_challenge as agent_pairing_consume_challenge_helper,
    create_agent_pairing_challenge as agent_pairing_create_challenge_helper,
    purge_expired_agent_pairing_challenges as agent_pairing_purge_expired_challenges_helper,
)


@dataclass(frozen=True)
class AgentRuntime:
    purge_expired_agent_sessions: Callable[[], None]
    purge_expired_agent_pairing_challenges: Callable[[Optional[float]], None]
    create_agent_pairing_challenge: Callable[[str, str, str, str, str], Tuple[str, int]]
    consume_agent_pairing_challenge: Callable[[str, str, str], Tuple[Optional[Dict[str, Any]], str]]
    agent_pairing_action_key: Callable[[str, str], str]
    compact_agent_pairing_action_state: Callable[[float], None]
    is_agent_pairing_action_allowed: Callable[[str, str], Tuple[bool, str, int]]
    agent_pairing_confirm_key: Callable[[str, str], str]
    compact_agent_pairing_confirm_state: Callable[[float], None]
    is_agent_pairing_confirm_blocked: Callable[[str, str], Tuple[bool, int]]
    register_agent_pairing_confirm_failure: Callable[[str, str], Tuple[bool, int]]
    clear_agent_pairing_confirm_failures: Callable[[str, str], None]
    is_admin_user: Callable[[Dict[str, Any]], bool]
    is_agent_task_allowed: Callable[[str, Dict[str, Any]], bool]
    request_gateway_pairing_code: Callable[[], Tuple[Optional[str], Optional[str], int]]
    pair_agent_session_for_user: Callable[[str, str, Callable[[str, str], Tuple[str, int]], Optional[Dict[str, Any]]], Any]
    revoke_gateway_agent_token: Callable[[str], Any]


def create_agent_runtime(
    *,
    now_fn: Callable[[], float],
    token_urlsafe_fn: Callable[[int], str],
    agent_sessions_store: Dict[str, Dict[str, Any]],
    agent_pairing_challenges_store: Dict[str, Dict[str, Any]],
    agent_pairing_challenge_lock: Any,
    agent_pairing_challenge_ttl_seconds: int,
    agent_pairing_challenge_max_entries: int,
    agent_pairing_action_abuse_lock: Any,
    agent_pairing_action_window: Dict[str, List[float]],
    agent_pairing_action_last_attempt: Dict[str, float],
    agent_pairing_action_blocked_until: Dict[str, float],
    agent_pairing_action_window_seconds: int,
    agent_pairing_action_max_attempts: int,
    agent_pairing_action_min_interval_seconds: int,
    agent_pairing_action_block_seconds: int,
    agent_pairing_confirm_abuse_lock: Any,
    agent_pairing_confirm_failure_window: Dict[str, List[float]],
    agent_pairing_confirm_blocked_until: Dict[str, float],
    agent_pairing_confirm_failure_window_seconds: int,
    agent_pairing_confirm_failure_max_attempts: int,
    agent_pairing_confirm_failure_block_seconds: int,
    agent_gateway_url: str,
    agent_webhook_secret: str,
    pairing_code_pattern: Any,
    jsonify_fn: Callable[[Dict[str, Any]], Any],
    agent_session_cookie: str,
    agent_session_samesite: str,
    agent_session_secure: bool,
    agent_session_ttl_seconds: int,
    requests_module: Any,
    logger: Any,
) -> AgentRuntime:
    def purge_expired_agent_sessions() -> None:
        if bool(getattr(agent_sessions_store, "supports_native_ttl", False)):
            return
        now = now_fn()
        expired = [
            sid
            for sid, session in agent_sessions_store.items()
            if session.get("expires_at", 0) <= now
        ]
        for sid in expired:
            agent_sessions_store.pop(sid, None)

    def purge_expired_agent_pairing_challenges(now: Optional[float] = None) -> None:
        return agent_pairing_purge_expired_challenges_helper(
            agent_pairing_challenges_store=agent_pairing_challenges_store,
            agent_pairing_challenge_max_entries=agent_pairing_challenge_max_entries,
            now_fn=now_fn,
            now=now,
        )

    def create_agent_pairing_challenge(
        action: str,
        user_id: str,
        email: str,
        pairing_code: str,
        client_ip: str,
    ) -> Tuple[str, int]:
        return agent_pairing_create_challenge_helper(
            action,
            user_id,
            email,
            pairing_code,
            client_ip,
            purge_expired_agent_pairing_challenges_fn=purge_expired_agent_pairing_challenges,
            token_urlsafe_fn=token_urlsafe_fn,
            now_fn=now_fn,
            agent_pairing_challenge_ttl_seconds=agent_pairing_challenge_ttl_seconds,
            agent_pairing_challenge_lock=agent_pairing_challenge_lock,
            agent_pairing_challenges_store=agent_pairing_challenges_store,
        )

    def consume_agent_pairing_challenge(
        challenge_id: str,
        user_id: str,
        email: str,
    ) -> Tuple[Optional[Dict[str, Any]], str]:
        return agent_pairing_consume_challenge_helper(
            challenge_id,
            user_id,
            email,
            purge_expired_agent_pairing_challenges_fn=purge_expired_agent_pairing_challenges,
            now_fn=now_fn,
            agent_pairing_challenge_lock=agent_pairing_challenge_lock,
            agent_pairing_challenges_store=agent_pairing_challenges_store,
        )

    def agent_pairing_action_key(user_id: str, action: str) -> str:
        return agent_abuse_action_key_helper(user_id, action)

    def compact_agent_pairing_action_state(now: float) -> None:
        return agent_abuse_compact_action_state_helper(
            now,
            agent_pairing_action_window=agent_pairing_action_window,
            agent_pairing_action_last_attempt=agent_pairing_action_last_attempt,
            agent_pairing_action_blocked_until=agent_pairing_action_blocked_until,
            agent_pairing_action_window_seconds=agent_pairing_action_window_seconds,
        )

    def is_agent_pairing_action_allowed(user_id: str, action: str) -> Tuple[bool, str, int]:
        return agent_abuse_is_action_allowed_helper(
            user_id,
            action,
            now_fn=now_fn,
            agent_pairing_action_abuse_lock=agent_pairing_action_abuse_lock,
            agent_pairing_action_window=agent_pairing_action_window,
            agent_pairing_action_last_attempt=agent_pairing_action_last_attempt,
            agent_pairing_action_blocked_until=agent_pairing_action_blocked_until,
            agent_pairing_action_window_seconds=agent_pairing_action_window_seconds,
            agent_pairing_action_max_attempts=agent_pairing_action_max_attempts,
            agent_pairing_action_min_interval_seconds=agent_pairing_action_min_interval_seconds,
            agent_pairing_action_block_seconds=agent_pairing_action_block_seconds,
        )

    def agent_pairing_confirm_key(user_id: str, client_ip: str) -> str:
        return agent_abuse_confirm_key_helper(user_id, client_ip)

    def compact_agent_pairing_confirm_state(now: float) -> None:
        return agent_abuse_compact_confirm_state_helper(
            now,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
            agent_pairing_confirm_failure_window_seconds=agent_pairing_confirm_failure_window_seconds,
        )

    def is_agent_pairing_confirm_blocked(user_id: str, client_ip: str) -> Tuple[bool, int]:
        return agent_abuse_is_confirm_blocked_helper(
            user_id,
            client_ip,
            now_fn=now_fn,
            agent_pairing_confirm_abuse_lock=agent_pairing_confirm_abuse_lock,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
            agent_pairing_confirm_failure_window_seconds=agent_pairing_confirm_failure_window_seconds,
        )

    def register_agent_pairing_confirm_failure(user_id: str, client_ip: str) -> Tuple[bool, int]:
        return agent_abuse_register_confirm_failure_helper(
            user_id,
            client_ip,
            now_fn=now_fn,
            agent_pairing_confirm_abuse_lock=agent_pairing_confirm_abuse_lock,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
            agent_pairing_confirm_failure_window_seconds=agent_pairing_confirm_failure_window_seconds,
            agent_pairing_confirm_failure_max_attempts=agent_pairing_confirm_failure_max_attempts,
            agent_pairing_confirm_failure_block_seconds=agent_pairing_confirm_failure_block_seconds,
        )

    def clear_agent_pairing_confirm_failures(user_id: str, client_ip: str) -> None:
        return agent_abuse_clear_confirm_failures_helper(
            user_id,
            client_ip,
            agent_pairing_confirm_abuse_lock=agent_pairing_confirm_abuse_lock,
            agent_pairing_confirm_failure_window=agent_pairing_confirm_failure_window,
            agent_pairing_confirm_blocked_until=agent_pairing_confirm_blocked_until,
        )

    def is_admin_user(user: Dict[str, Any]) -> bool:
        app_meta = user.get("app_metadata") or {}
        role = app_meta.get("role")
        if isinstance(role, str) and role.strip().lower() == "admin":
            return True

        roles = app_meta.get("roles")
        if isinstance(roles, list):
            return any(
                isinstance(entry, str) and entry.strip().lower() == "admin"
                for entry in roles
            )

        return False

    def is_agent_task_allowed(task_name: str, user: Dict[str, Any]) -> bool:
        if is_admin_user(user):
            return True
        return task_name == "chat"

    def request_gateway_pairing_code() -> Tuple[Optional[str], Optional[str], int]:
        return agent_helpers_request_pairing_code_helper(
            agent_gateway_url=agent_gateway_url,
            agent_webhook_secret=agent_webhook_secret,
            pairing_code_pattern=pairing_code_pattern,
            requests_module=requests_module,
            logger=logger,
        )

    def pair_agent_session_for_user(
        pairing_code: str,
        user_id: str,
        create_agent_session_fn: Callable[[str, str], Tuple[str, int]],
        extra_payload: Optional[Dict[str, Any]] = None,
    ):
        return agent_helpers_pair_session_helper(
            pairing_code,
            user_id,
            agent_gateway_url=agent_gateway_url,
            create_agent_session=create_agent_session_fn,
            jsonify_fn=jsonify_fn,
            agent_session_cookie=agent_session_cookie,
            agent_session_samesite=agent_session_samesite,
            agent_session_secure=agent_session_secure,
            agent_session_ttl_seconds=agent_session_ttl_seconds,
            requests_module=requests_module,
            logger=logger,
            extra_payload=extra_payload,
        )

    def revoke_gateway_agent_token(token: str):
        return agent_helpers_revoke_token_helper(
            token,
            agent_gateway_url=agent_gateway_url,
            jsonify_fn=jsonify_fn,
            requests_module=requests_module,
            logger=logger,
        )

    return AgentRuntime(
        purge_expired_agent_sessions=purge_expired_agent_sessions,
        purge_expired_agent_pairing_challenges=purge_expired_agent_pairing_challenges,
        create_agent_pairing_challenge=create_agent_pairing_challenge,
        consume_agent_pairing_challenge=consume_agent_pairing_challenge,
        agent_pairing_action_key=agent_pairing_action_key,
        compact_agent_pairing_action_state=compact_agent_pairing_action_state,
        is_agent_pairing_action_allowed=is_agent_pairing_action_allowed,
        agent_pairing_confirm_key=agent_pairing_confirm_key,
        compact_agent_pairing_confirm_state=compact_agent_pairing_confirm_state,
        is_agent_pairing_confirm_blocked=is_agent_pairing_confirm_blocked,
        register_agent_pairing_confirm_failure=register_agent_pairing_confirm_failure,
        clear_agent_pairing_confirm_failures=clear_agent_pairing_confirm_failures,
        is_admin_user=is_admin_user,
        is_agent_task_allowed=is_agent_task_allowed,
        request_gateway_pairing_code=request_gateway_pairing_code,
        pair_agent_session_for_user=pair_agent_session_for_user,
        revoke_gateway_agent_token=revoke_gateway_agent_token,
    )
