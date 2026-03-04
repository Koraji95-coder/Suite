from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass(frozen=True)
class ServerState:
    transmittal_profiles_cache: Dict[str, Any]
    transmittal_profiles_cache_lock: Any
    agent_sessions: Dict[str, Dict[str, Any]]
    agent_pairing_challenges: Dict[str, Dict[str, Any]]
    agent_pairing_challenge_lock: Any
    auth_email_window: Dict[str, List[float]]
    auth_email_last_attempt: Dict[str, float]
    auth_email_blocked_until: Dict[str, float]
    auth_email_ip_window: Dict[str, List[float]]
    auth_email_ip_blocked_until: Dict[str, float]
    auth_email_abuse_lock: Any
    passkey_callback_states: Dict[str, Dict[str, Any]]
    passkey_callback_states_lock: Any
    passkey_webauthn_states: Dict[str, Dict[str, Any]]
    passkey_webauthn_states_lock: Any
    agent_pairing_action_window: Dict[str, List[float]]
    agent_pairing_action_last_attempt: Dict[str, float]
    agent_pairing_action_blocked_until: Dict[str, float]
    agent_pairing_action_abuse_lock: Any
    agent_pairing_confirm_failure_window: Dict[str, List[float]]
    agent_pairing_confirm_blocked_until: Dict[str, float]
    agent_pairing_confirm_abuse_lock: Any


def create_server_state(
    *,
    threading_module: Any,
) -> ServerState:
    return ServerState(
        transmittal_profiles_cache={"mtime": None, "payload": None},
        transmittal_profiles_cache_lock=threading_module.Lock(),
        agent_sessions={},
        agent_pairing_challenges={},
        agent_pairing_challenge_lock=threading_module.Lock(),
        auth_email_window={},
        auth_email_last_attempt={},
        auth_email_blocked_until={},
        auth_email_ip_window={},
        auth_email_ip_blocked_until={},
        auth_email_abuse_lock=threading_module.Lock(),
        passkey_callback_states={},
        passkey_callback_states_lock=threading_module.Lock(),
        passkey_webauthn_states={},
        passkey_webauthn_states_lock=threading_module.Lock(),
        agent_pairing_action_window={},
        agent_pairing_action_last_attempt={},
        agent_pairing_action_blocked_until={},
        agent_pairing_action_abuse_lock=threading_module.Lock(),
        agent_pairing_confirm_failure_window={},
        agent_pairing_confirm_blocked_until={},
        agent_pairing_confirm_abuse_lock=threading_module.Lock(),
    )
