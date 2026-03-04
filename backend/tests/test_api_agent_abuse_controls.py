from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_agent_abuse_controls import (
    clear_agent_pairing_confirm_failures,
    is_agent_pairing_action_allowed,
    is_agent_pairing_confirm_blocked,
    register_agent_pairing_confirm_failure,
)


class TestApiAgentAbuseControls(unittest.TestCase):
    def test_action_allowed_initial_attempt(self) -> None:
        window = {}
        last_attempt = {}
        blocked_until = {}
        lock = threading.Lock()

        allowed, reason, retry_after = is_agent_pairing_action_allowed(
            "user-1",
            "pair",
            now_fn=lambda: 100.0,
            agent_pairing_action_abuse_lock=lock,
            agent_pairing_action_window=window,
            agent_pairing_action_last_attempt=last_attempt,
            agent_pairing_action_blocked_until=blocked_until,
            agent_pairing_action_window_seconds=60,
            agent_pairing_action_max_attempts=3,
            agent_pairing_action_min_interval_seconds=5,
            agent_pairing_action_block_seconds=120,
        )

        self.assertEqual((allowed, reason, retry_after), (True, "ok", 0))
        self.assertEqual(window["user-1:pair"], [100.0])
        self.assertEqual(last_attempt["user-1:pair"], 100.0)

    def test_action_min_interval_rejected(self) -> None:
        window = {"user-1:pair": [99.0]}
        last_attempt = {"user-1:pair": 99.0}
        blocked_until = {}
        lock = threading.Lock()

        allowed, reason, retry_after = is_agent_pairing_action_allowed(
            "user-1",
            "pair",
            now_fn=lambda: 100.0,
            agent_pairing_action_abuse_lock=lock,
            agent_pairing_action_window=window,
            agent_pairing_action_last_attempt=last_attempt,
            agent_pairing_action_blocked_until=blocked_until,
            agent_pairing_action_window_seconds=60,
            agent_pairing_action_max_attempts=5,
            agent_pairing_action_min_interval_seconds=5,
            agent_pairing_action_block_seconds=120,
        )

        self.assertEqual((allowed, reason, retry_after), (False, "min-interval", 4))
        self.assertEqual(last_attempt["user-1:pair"], 100.0)
        self.assertEqual(len(window["user-1:pair"]), 2)

    def test_action_window_limit_blocks(self) -> None:
        window = {"user-1:pair": [95.0, 96.0]}
        last_attempt = {"user-1:pair": 96.0}
        blocked_until = {}
        lock = threading.Lock()

        allowed, reason, retry_after = is_agent_pairing_action_allowed(
            "user-1",
            "pair",
            now_fn=lambda: 100.0,
            agent_pairing_action_abuse_lock=lock,
            agent_pairing_action_window=window,
            agent_pairing_action_last_attempt=last_attempt,
            agent_pairing_action_blocked_until=blocked_until,
            agent_pairing_action_window_seconds=60,
            agent_pairing_action_max_attempts=2,
            agent_pairing_action_min_interval_seconds=0,
            agent_pairing_action_block_seconds=30,
        )

        self.assertEqual((allowed, reason, retry_after), (False, "window-limit", 30))
        self.assertEqual(blocked_until["user-1:pair"], 130.0)

    def test_action_blocked_returns_retry_after(self) -> None:
        window = {}
        last_attempt = {}
        blocked_until = {"user-1:pair": 103.2}
        lock = threading.Lock()

        allowed, reason, retry_after = is_agent_pairing_action_allowed(
            "user-1",
            "pair",
            now_fn=lambda: 100.0,
            agent_pairing_action_abuse_lock=lock,
            agent_pairing_action_window=window,
            agent_pairing_action_last_attempt=last_attempt,
            agent_pairing_action_blocked_until=blocked_until,
            agent_pairing_action_window_seconds=60,
            agent_pairing_action_max_attempts=5,
            agent_pairing_action_min_interval_seconds=5,
            agent_pairing_action_block_seconds=30,
        )

        self.assertEqual((allowed, reason, retry_after), (False, "blocked", 4))

    def test_confirm_failure_flow_blocks_and_clear_resets(self) -> None:
        failure_window = {}
        blocked_until = {}
        lock = threading.Lock()

        blocked, retry_after = register_agent_pairing_confirm_failure(
            "user-1",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
            agent_pairing_confirm_failure_window_seconds=60,
            agent_pairing_confirm_failure_max_attempts=2,
            agent_pairing_confirm_failure_block_seconds=30,
        )
        self.assertEqual((blocked, retry_after), (False, 0))

        blocked, retry_after = register_agent_pairing_confirm_failure(
            "user-1",
            "127.0.0.1",
            now_fn=lambda: 101.0,
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
            agent_pairing_confirm_failure_window_seconds=60,
            agent_pairing_confirm_failure_max_attempts=2,
            agent_pairing_confirm_failure_block_seconds=30,
        )
        self.assertEqual((blocked, retry_after), (False, 0))

        blocked, retry_after = register_agent_pairing_confirm_failure(
            "user-1",
            "127.0.0.1",
            now_fn=lambda: 102.0,
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
            agent_pairing_confirm_failure_window_seconds=60,
            agent_pairing_confirm_failure_max_attempts=2,
            agent_pairing_confirm_failure_block_seconds=30,
        )
        self.assertEqual((blocked, retry_after), (True, 30))

        blocked, retry_after = is_agent_pairing_confirm_blocked(
            "user-1",
            "127.0.0.1",
            now_fn=lambda: 110.0,
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
            agent_pairing_confirm_failure_window_seconds=60,
        )
        self.assertEqual((blocked, retry_after), (True, 22))

        clear_agent_pairing_confirm_failures(
            "user-1",
            "127.0.0.1",
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
        )

        blocked, retry_after = is_agent_pairing_confirm_blocked(
            "user-1",
            "127.0.0.1",
            now_fn=lambda: 110.0,
            agent_pairing_confirm_abuse_lock=lock,
            agent_pairing_confirm_failure_window=failure_window,
            agent_pairing_confirm_blocked_until=blocked_until,
            agent_pairing_confirm_failure_window_seconds=60,
        )
        self.assertEqual((blocked, retry_after), (False, 0))


if __name__ == "__main__":
    unittest.main()
