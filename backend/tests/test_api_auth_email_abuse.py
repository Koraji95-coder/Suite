from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_auth_email_abuse import (
    auth_email_ip_key,
    auth_email_key,
    compact_auth_email_state,
    is_auth_email_request_allowed,
)


class TestApiAuthEmailAbuse(unittest.TestCase):
    def test_key_helpers(self) -> None:
        fingerprint_fn = lambda value, length=24: f"{value}:{length}"
        self.assertEqual(
            auth_email_key(
                "user@example.com",
                "127.0.0.1",
                email_fingerprint_fn=fingerprint_fn,
            ),
            "127.0.0.1:user@example.com:24",
        )
        self.assertEqual(auth_email_ip_key(""), "unknown")
        self.assertEqual(auth_email_ip_key("127.0.0.1"), "127.0.0.1")

    def test_first_request_allowed(self) -> None:
        lock = threading.Lock()
        window = {}
        last_attempt = {}
        blocked_until = {}
        ip_window = {}
        ip_blocked_until = {}

        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=6,
            auth_email_min_interval_seconds=15,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=12,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )

        self.assertEqual((allowed, reason), (True, "ok"))
        key = "127.0.0.1:user@example.com:24"
        self.assertEqual(window[key], [100.0])
        self.assertEqual(last_attempt[key], 100.0)
        self.assertEqual(ip_window["127.0.0.1"], [100.0])

    def test_min_interval_rejected(self) -> None:
        lock = threading.Lock()
        key = "127.0.0.1:user@example.com:24"
        window = {key: [95.0]}
        last_attempt = {key: 95.0}
        blocked_until = {}
        ip_window = {}
        ip_blocked_until = {}

        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=6,
            auth_email_min_interval_seconds=15,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=12,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )

        self.assertEqual((allowed, reason), (False, "min-interval"))
        self.assertEqual(last_attempt[key], 100.0)
        self.assertEqual(window[key], [95.0])

    def test_email_window_limit_blocks(self) -> None:
        lock = threading.Lock()
        key = "127.0.0.1:user@example.com:24"
        window = {key: [90.0, 91.0]}
        last_attempt = {key: 91.0}
        blocked_until = {}
        ip_window = {"127.0.0.1": [90.0, 91.0]}
        ip_blocked_until = {}

        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=2,
            auth_email_min_interval_seconds=0,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=12,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )

        self.assertEqual((allowed, reason), (False, "window-limit"))
        self.assertEqual(blocked_until[key], 1900.0)

    def test_ip_window_limit_blocks(self) -> None:
        lock = threading.Lock()
        key = "127.0.0.1:user@example.com:24"
        window = {key: [90.0]}
        last_attempt = {key: 90.0}
        blocked_until = {}
        ip_window = {"127.0.0.1": [90.0, 91.0]}
        ip_blocked_until = {}

        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=6,
            auth_email_min_interval_seconds=0,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=2,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )

        self.assertEqual((allowed, reason), (False, "ip-window-limit"))
        self.assertEqual(ip_blocked_until["127.0.0.1"], 1300.0)

    def test_preblocked_states_short_circuit(self) -> None:
        lock = threading.Lock()
        key = "127.0.0.1:user@example.com:24"
        window = {}
        last_attempt = {}
        blocked_until = {key: 130.0}
        ip_window = {}
        ip_blocked_until = {"127.0.0.1": 140.0}

        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=6,
            auth_email_min_interval_seconds=0,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=12,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )
        self.assertEqual((allowed, reason), (False, "blocked"))

        blocked_until = {}
        allowed, reason = is_auth_email_request_allowed(
            "user@example.com",
            "127.0.0.1",
            now_fn=lambda: 100.0,
            auth_email_abuse_lock=lock,
            email_fingerprint_fn=lambda value, length=24: f"{value}:{length}",
            auth_email_window_seconds=900,
            auth_email_max_attempts=6,
            auth_email_min_interval_seconds=0,
            auth_email_block_seconds=1800,
            auth_email_ip_window_seconds=900,
            auth_email_ip_max_attempts=12,
            auth_email_ip_block_seconds=1200,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )
        self.assertEqual((allowed, reason), (False, "ip-blocked"))

    def test_compaction_removes_stale_entries(self) -> None:
        window = {"old": [1.0]}
        last_attempt = {"old": 1.0}
        for idx in range(5000):
            key = f"keep-{idx}"
            window[key] = [395.0]
            last_attempt[key] = 395.0
        blocked_until = {}
        ip_window = {"old-ip": [1.0], "keep-ip": [390.0]}
        ip_blocked_until = {}

        compact_auth_email_state(
            400.0,
            auth_email_window_seconds=30,
            auth_email_ip_window_seconds=30,
            auth_email_window=window,
            auth_email_last_attempt=last_attempt,
            auth_email_blocked_until=blocked_until,
            auth_email_ip_window=ip_window,
            auth_email_ip_blocked_until=ip_blocked_until,
        )

        self.assertNotIn("old", last_attempt)
        self.assertNotIn("old", window)
        self.assertNotIn("old-ip", ip_window)
        self.assertIn("keep-ip", ip_window)


if __name__ == "__main__":
    unittest.main()
