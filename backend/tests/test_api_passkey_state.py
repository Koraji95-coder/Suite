from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_passkey_state import (
    consume_passkey_callback_state,
    consume_passkey_webauthn_state,
    create_passkey_callback_state,
    create_passkey_webauthn_state,
    get_passkey_callback_state,
)


class TestApiPasskeyState(unittest.TestCase):
    def test_callback_state_create_get_consume(self) -> None:
        states = {}
        lock = threading.Lock()

        state, _expires_at = create_passkey_callback_state(
            "sign-in",
            "127.0.0.1",
            "https://app.example.com",
            "user-1",
            "User@Example.com",
            ttl_seconds=300,
            passkey_callback_states=states,
            passkey_callback_states_lock=lock,
            max_entries=100,
        )
        self.assertIn(state, states)

        payload, reason = get_passkey_callback_state(
            state,
            passkey_callback_states=states,
            passkey_callback_states_lock=lock,
            max_entries=100,
        )
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(payload)
        self.assertEqual((payload or {}).get("email"), "user@example.com")

        consumed, reason = consume_passkey_callback_state(
            state,
            passkey_callback_states=states,
            passkey_callback_states_lock=lock,
            max_entries=100,
        )
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(consumed)
        self.assertNotIn(state, states)

    def test_webauthn_state_create_and_consume_intent_match(self) -> None:
        states = {}
        lock = threading.Lock()

        state, _expires_at = create_passkey_webauthn_state(
            "enroll",
            "challenge-1",
            "https://app.example.com",
            "127.0.0.1",
            "https://app.example.com/settings",
            "user-1",
            "user@example.com",
            ttl_seconds=300,
            passkey_webauthn_states=states,
            passkey_webauthn_states_lock=lock,
            max_entries=100,
        )
        self.assertIn(state, states)

        consumed, reason = consume_passkey_webauthn_state(
            state,
            "enroll",
            passkey_webauthn_states=states,
            passkey_webauthn_states_lock=lock,
            max_entries=100,
        )
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(consumed)
        self.assertNotIn(state, states)

    def test_webauthn_state_consume_intent_mismatch(self) -> None:
        states = {}
        lock = threading.Lock()

        state, _expires_at = create_passkey_webauthn_state(
            "sign-in",
            "challenge-1",
            "https://app.example.com",
            "127.0.0.1",
            "",
            "user-1",
            "user@example.com",
            ttl_seconds=300,
            passkey_webauthn_states=states,
            passkey_webauthn_states_lock=lock,
            max_entries=100,
        )

        consumed, reason = consume_passkey_webauthn_state(
            state,
            "enroll",
            passkey_webauthn_states=states,
            passkey_webauthn_states_lock=lock,
            max_entries=100,
        )
        self.assertIsNone(consumed)
        self.assertEqual(reason, "intent-mismatch")
        self.assertIn(state, states)


if __name__ == "__main__":
    unittest.main()
