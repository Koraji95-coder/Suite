from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_server_state import create_server_state


class TestApiServerState(unittest.TestCase):
    def test_create_server_state_initializes_expected_stores(self) -> None:
        state = create_server_state(threading_module=threading)

        self.assertEqual(
            state.transmittal_profiles_cache,
            {
                "mtime": None,
                "payload": None,
            },
        )
        self.assertEqual(state.agent_sessions, {})
        self.assertEqual(state.agent_pairing_challenges, {})
        self.assertEqual(state.auth_email_window, {})
        self.assertEqual(state.auth_email_last_attempt, {})
        self.assertEqual(state.auth_email_blocked_until, {})
        self.assertEqual(state.auth_email_ip_window, {})
        self.assertEqual(state.auth_email_ip_blocked_until, {})
        self.assertEqual(state.passkey_callback_states, {})
        self.assertEqual(state.passkey_webauthn_states, {})
        self.assertEqual(state.agent_pairing_action_window, {})
        self.assertEqual(state.agent_pairing_action_last_attempt, {})
        self.assertEqual(state.agent_pairing_action_blocked_until, {})
        self.assertEqual(state.agent_pairing_confirm_failure_window, {})
        self.assertEqual(state.agent_pairing_confirm_blocked_until, {})
        self.assertEqual(state.websocket_tickets, {})

    def test_stores_are_independent_and_locks_exist(self) -> None:
        state = create_server_state(threading_module=threading)

        state.auth_email_window["key-1"] = [1.0]
        self.assertNotIn("key-1", state.auth_email_ip_window)
        self.assertNotIn("key-1", state.agent_pairing_action_window)

        self.assertIsNot(state.auth_email_window, state.auth_email_ip_window)
        self.assertIsNot(
            state.agent_pairing_action_window,
            state.agent_pairing_confirm_failure_window,
        )

        for lock in (
            state.transmittal_profiles_cache_lock,
            state.agent_pairing_challenge_lock,
            state.auth_email_abuse_lock,
            state.passkey_callback_states_lock,
            state.passkey_webauthn_states_lock,
            state.agent_pairing_action_abuse_lock,
            state.agent_pairing_confirm_abuse_lock,
            state.websocket_tickets_lock,
        ):
            self.assertTrue(hasattr(lock, "acquire"))
            self.assertTrue(hasattr(lock, "release"))


if __name__ == "__main__":
    unittest.main()
