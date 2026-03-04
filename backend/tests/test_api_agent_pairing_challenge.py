from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_agent_pairing_challenge import (
    consume_agent_pairing_challenge,
    create_agent_pairing_challenge,
    purge_expired_agent_pairing_challenges,
)


class TestApiAgentPairingChallenge(unittest.TestCase):
    def test_purge_removes_expired_entries(self) -> None:
        store = {
            "expired": {"expires_at": 99, "created_at": 1},
            "active": {"expires_at": 150, "created_at": 2},
        }
        purge_expired_agent_pairing_challenges(
            agent_pairing_challenges_store=store,
            agent_pairing_challenge_max_entries=10,
            now_fn=lambda: 100.0,
        )
        self.assertNotIn("expired", store)
        self.assertIn("active", store)

    def test_purge_enforces_max_entries_by_oldest_created(self) -> None:
        store = {
            "a": {"expires_at": 500, "created_at": 1},
            "b": {"expires_at": 500, "created_at": 2},
            "c": {"expires_at": 500, "created_at": 3},
        }
        purge_expired_agent_pairing_challenges(
            agent_pairing_challenges_store=store,
            agent_pairing_challenge_max_entries=2,
            now_fn=lambda: 100.0,
        )
        self.assertNotIn("a", store)
        self.assertIn("b", store)
        self.assertIn("c", store)

    def test_create_stores_challenge_and_returns_expiry(self) -> None:
        store = {}
        lock = threading.Lock()
        purge_calls = {"count": 0, "value": None}

        def purge(now):
            purge_calls["count"] += 1
            purge_calls["value"] = now

        challenge_id, expires_at = create_agent_pairing_challenge(
            "pair",
            "user-1",
            "  USER@example.com ",
            "123456",
            "127.0.0.1",
            purge_expired_agent_pairing_challenges_fn=purge,
            token_urlsafe_fn=lambda _n: "challenge-1",
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_ttl_seconds=900,
            agent_pairing_challenge_lock=lock,
            agent_pairing_challenges_store=store,
        )

        self.assertEqual(challenge_id, "challenge-1")
        self.assertEqual(expires_at, 1900)
        self.assertEqual(purge_calls["count"], 1)
        self.assertEqual(purge_calls["value"], 1000.0)
        self.assertEqual(
            store["challenge-1"],
            {
                "action": "pair",
                "user_id": "user-1",
                "email": "user@example.com",
                "pairing_code": "123456",
                "created_at": 1000.0,
                "expires_at": 1900,
                "client_ip": "127.0.0.1",
            },
        )

    def test_consume_returns_missing_when_not_found(self) -> None:
        challenge, reason = consume_agent_pairing_challenge(
            "missing-id",
            "user-1",
            "user@example.com",
            purge_expired_agent_pairing_challenges_fn=lambda _now: None,
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_lock=threading.Lock(),
            agent_pairing_challenges_store={},
        )
        self.assertIsNone(challenge)
        self.assertEqual(reason, "missing")

    def test_consume_returns_expired_and_removes_entry(self) -> None:
        store = {
            "challenge-1": {
                "user_id": "user-1",
                "email": "user@example.com",
                "expires_at": 900,
            }
        }
        challenge, reason = consume_agent_pairing_challenge(
            "challenge-1",
            "user-1",
            "user@example.com",
            purge_expired_agent_pairing_challenges_fn=lambda _now: None,
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_lock=threading.Lock(),
            agent_pairing_challenges_store=store,
        )
        self.assertIsNone(challenge)
        self.assertEqual(reason, "expired")
        self.assertNotIn("challenge-1", store)

    def test_consume_returns_user_mismatch(self) -> None:
        store = {
            "challenge-1": {
                "user_id": "user-2",
                "email": "user@example.com",
                "expires_at": 1500,
            }
        }
        challenge, reason = consume_agent_pairing_challenge(
            "challenge-1",
            "user-1",
            "user@example.com",
            purge_expired_agent_pairing_challenges_fn=lambda _now: None,
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_lock=threading.Lock(),
            agent_pairing_challenges_store=store,
        )
        self.assertIsNone(challenge)
        self.assertEqual(reason, "user-mismatch")
        self.assertIn("challenge-1", store)

    def test_consume_returns_email_mismatch(self) -> None:
        store = {
            "challenge-1": {
                "user_id": "user-1",
                "email": "user@example.com",
                "expires_at": 1500,
            }
        }
        challenge, reason = consume_agent_pairing_challenge(
            "challenge-1",
            "user-1",
            "other@example.com",
            purge_expired_agent_pairing_challenges_fn=lambda _now: None,
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_lock=threading.Lock(),
            agent_pairing_challenges_store=store,
        )
        self.assertIsNone(challenge)
        self.assertEqual(reason, "email-mismatch")
        self.assertIn("challenge-1", store)

    def test_consume_returns_challenge_and_removes_entry(self) -> None:
        expected = {
            "action": "pair",
            "user_id": "user-1",
            "email": "user@example.com",
            "pairing_code": "123456",
            "created_at": 900.0,
            "expires_at": 1500,
            "client_ip": "127.0.0.1",
        }
        store = {"challenge-1": dict(expected)}
        challenge, reason = consume_agent_pairing_challenge(
            "challenge-1",
            "user-1",
            "user@example.com",
            purge_expired_agent_pairing_challenges_fn=lambda _now: None,
            now_fn=lambda: 1000.0,
            agent_pairing_challenge_lock=threading.Lock(),
            agent_pairing_challenges_store=store,
        )
        self.assertEqual(challenge, expected)
        self.assertEqual(reason, "ok")
        self.assertNotIn("challenge-1", store)


if __name__ == "__main__":
    unittest.main()
