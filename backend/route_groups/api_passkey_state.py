from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from .api_passkey_helpers import (
    consume_passkey_callback_state as passkey_consume_passkey_callback_state,
    consume_passkey_webauthn_state as passkey_consume_passkey_webauthn_state,
    create_passkey_callback_state as passkey_create_passkey_callback_state,
    create_passkey_webauthn_state as passkey_create_passkey_webauthn_state,
    get_passkey_callback_state as passkey_get_passkey_callback_state,
)


def create_passkey_callback_state(
    intent: str,
    client_ip: str,
    client_redirect_to: str = "",
    user_id: str = "",
    email: str = "",
    *,
    ttl_seconds: int,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[str, int]:
    return passkey_create_passkey_callback_state(
        intent=intent,
        client_ip=client_ip,
        client_redirect_to=client_redirect_to,
        user_id=user_id,
        email=email,
        ttl_seconds=ttl_seconds,
        passkey_callback_states=passkey_callback_states,
        passkey_callback_states_lock=passkey_callback_states_lock,
        max_entries=max_entries,
    )


def consume_passkey_callback_state(
    state: str,
    *,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_consume_passkey_callback_state(
        state=state,
        passkey_callback_states=passkey_callback_states,
        passkey_callback_states_lock=passkey_callback_states_lock,
        max_entries=max_entries,
    )


def get_passkey_callback_state(
    state: str,
    *,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_get_passkey_callback_state(
        state=state,
        passkey_callback_states=passkey_callback_states,
        passkey_callback_states_lock=passkey_callback_states_lock,
        max_entries=max_entries,
    )


def create_passkey_webauthn_state(
    intent: str,
    challenge: str,
    expected_origin: str,
    client_ip: str,
    client_redirect_to: str = "",
    user_id: str = "",
    email: str = "",
    *,
    ttl_seconds: int,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    passkey_webauthn_states_lock: Any,
    max_entries: int,
) -> Tuple[str, int]:
    return passkey_create_passkey_webauthn_state(
        intent=intent,
        challenge=challenge,
        expected_origin=expected_origin,
        client_ip=client_ip,
        client_redirect_to=client_redirect_to,
        user_id=user_id,
        email=email,
        ttl_seconds=ttl_seconds,
        passkey_webauthn_states=passkey_webauthn_states,
        passkey_webauthn_states_lock=passkey_webauthn_states_lock,
        max_entries=max_entries,
    )


def consume_passkey_webauthn_state(
    state: str,
    expected_intent: str = "",
    *,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    passkey_webauthn_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_consume_passkey_webauthn_state(
        state=state,
        expected_intent=expected_intent,
        passkey_webauthn_states=passkey_webauthn_states,
        passkey_webauthn_states_lock=passkey_webauthn_states_lock,
        max_entries=max_entries,
    )
