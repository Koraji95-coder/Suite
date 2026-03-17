from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional, Tuple


class RedisJsonTtlStore:
    """Small mapping-like adapter backed by Redis string keys with TTL."""

    supports_native_ttl = True

    def __init__(
        self,
        *,
        redis_client: Any,
        key_prefix: str,
        now_fn: Any = time.time,
    ) -> None:
        self._redis = redis_client
        self._key_prefix = str(key_prefix or "").strip()
        self._now_fn = now_fn

    def _prefixed_key(self, key: str) -> str:
        return f"{self._key_prefix}{str(key)}"

    def _decode(self, raw_value: Any) -> Optional[Dict[str, Any]]:
        if raw_value is None:
            return None
        if isinstance(raw_value, bytes):
            text = raw_value.decode("utf-8", errors="replace")
        else:
            text = str(raw_value)
        try:
            parsed = json.loads(text)
        except Exception:
            return None
        if not isinstance(parsed, dict):
            return None
        return parsed

    def _encode(self, value: Dict[str, Any]) -> str:
        return json.dumps(value, separators=(",", ":"), sort_keys=True)

    def _ttl_from_payload(self, payload: Dict[str, Any]) -> int:
        expires_at_raw = payload.get("expires_at")
        try:
            expires_at = int(float(expires_at_raw))
        except (TypeError, ValueError):
            expires_at = int(self._now_fn()) + 1
        ttl = expires_at - int(self._now_fn())
        return ttl if ttl > 0 else 1

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        ttl_seconds = self._ttl_from_payload(value)
        self._redis.set(self._prefixed_key(key), self._encode(value), ex=ttl_seconds)

    def get(self, key: str, default: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        parsed = self._decode(self._redis.get(self._prefixed_key(key)))
        if parsed is None:
            return default
        return parsed

    def pop(self, key: str, default: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        redis_key = self._prefixed_key(key)
        raw_value: Any = None
        try:
            pipeline = self._redis.pipeline()
            pipeline.get(redis_key)
            pipeline.delete(redis_key)
            result = pipeline.execute() or []
            if result:
                raw_value = result[0]
        except Exception:
            raw_value = self._redis.get(redis_key)
            self._redis.delete(redis_key)

        parsed = self._decode(raw_value)
        if parsed is None:
            return default
        return parsed

    def items(self) -> List[Tuple[str, Dict[str, Any]]]:
        entries: List[Tuple[str, Dict[str, Any]]] = []
        pattern = self._prefixed_key("*")
        for raw_key in self._redis.scan_iter(match=pattern):
            if isinstance(raw_key, bytes):
                key_text = raw_key.decode("utf-8", errors="replace")
            else:
                key_text = str(raw_key)
            local_key = key_text[len(self._key_prefix) :]
            value = self.get(local_key)
            if value is None:
                continue
            entries.append((local_key, value))
        return entries

    def __len__(self) -> int:
        count = 0
        pattern = self._prefixed_key("*")
        for _ in self._redis.scan_iter(match=pattern):
            count += 1
        return count
