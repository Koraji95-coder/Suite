from __future__ import annotations

import unittest
from typing import Any, Dict, List, Optional, Tuple

from backend.route_groups.api_redis_json_store import RedisJsonTtlStore


class _PipelineStub:
    def __init__(self, redis_stub: "_RedisStub") -> None:
        self._redis = redis_stub
        self._ops: List[Tuple[str, str]] = []

    def get(self, key: str) -> "_PipelineStub":
        self._ops.append(("get", key))
        return self

    def delete(self, key: str) -> "_PipelineStub":
        self._ops.append(("delete", key))
        return self

    def execute(self) -> List[Any]:
        results: List[Any] = []
        for operation, key in self._ops:
            if operation == "get":
                results.append(self._redis.get(key))
            elif operation == "delete":
                self._redis.delete(key)
                results.append(1)
        return results


class _RedisStub:
    def __init__(self) -> None:
        self.now = 1000.0
        self._values: Dict[str, Dict[str, Any]] = {}

    def _prune(self) -> None:
        expired = [
            key
            for key, payload in self._values.items()
            if float(payload.get("expires_at") or 0) <= self.now
        ]
        for key in expired:
            self._values.pop(key, None)

    def set(self, key: str, value: str, ex: int) -> bool:
        self._values[key] = {
            "value": value,
            "expires_at": self.now + max(int(ex), 0),
        }
        return True

    def get(self, key: str) -> Optional[str]:
        self._prune()
        payload = self._values.get(key)
        if not payload:
            return None
        return str(payload.get("value") or "")

    def delete(self, key: str) -> int:
        existed = key in self._values
        self._values.pop(key, None)
        return 1 if existed else 0

    def scan_iter(self, match: str) -> List[str]:
        self._prune()
        if match.endswith("*"):
            prefix = match[:-1]
            return [key for key in self._values if key.startswith(prefix)]
        return [key for key in self._values if key == match]

    def pipeline(self) -> _PipelineStub:
        return _PipelineStub(self)


class TestApiRedisJsonStore(unittest.TestCase):
    def test_set_get_and_pop_roundtrip(self) -> None:
        redis_stub = _RedisStub()
        store = RedisJsonTtlStore(
            redis_client=redis_stub,
            key_prefix="suite:agent:session:",
            now_fn=lambda: redis_stub.now,
        )

        store["sid-1"] = {"token": "token-1", "user_id": "user-1", "expires_at": 1300}
        self.assertEqual(
            store.get("sid-1"),
            {"token": "token-1", "user_id": "user-1", "expires_at": 1300},
        )

        popped = store.pop("sid-1")
        self.assertEqual(
            popped,
            {"token": "token-1", "user_id": "user-1", "expires_at": 1300},
        )
        self.assertIsNone(store.get("sid-1"))

    def test_items_and_len_reflect_live_entries(self) -> None:
        redis_stub = _RedisStub()
        store = RedisJsonTtlStore(
            redis_client=redis_stub,
            key_prefix="suite:agent:session:",
            now_fn=lambda: redis_stub.now,
        )

        store["sid-1"] = {"token": "token-1", "user_id": "user-1", "expires_at": 1300}
        store["sid-2"] = {"token": "token-2", "user_id": "user-2", "expires_at": 1310}
        self.assertEqual(len(store), 2)

        entries = dict(store.items())
        self.assertIn("sid-1", entries)
        self.assertIn("sid-2", entries)

    def test_native_ttl_hides_expired_entries(self) -> None:
        redis_stub = _RedisStub()
        store = RedisJsonTtlStore(
            redis_client=redis_stub,
            key_prefix="suite:agent:session:",
            now_fn=lambda: redis_stub.now,
        )

        store["sid-1"] = {"token": "token-1", "user_id": "user-1", "expires_at": 1001}
        self.assertIsNotNone(store.get("sid-1"))

        redis_stub.now = 1002.0
        self.assertIsNone(store.get("sid-1"))
        self.assertEqual(len(store), 0)


if __name__ == "__main__":
    unittest.main()
