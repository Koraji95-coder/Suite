"""WebSocket ticket management for the Coordinates Grabber API.

Manages short-lived one-time tickets used to authenticate WebSocket
connections without requiring credentials to be sent over the WebSocket
protocol itself.

Usage::

    from backend.websocket_manager import WebSocketTicketManager

    ws_manager = WebSocketTicketManager(
        ttl_seconds=45,
        max_entries=20000,
        bind_remote_addr=False,
        logger=logger,
    )
    ticket = ws_manager.issue_ticket(user_id="u1", auth_mode="bearer", remote_addr="1.2.3.4")
    valid, reason = ws_manager.consume_ticket(ticket["ticket"], "1.2.3.4")
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

__all__ = ["WebSocketTicketManager"]


class WebSocketTicketManager:
    """Thread-safe store for short-lived WebSocket one-time tickets."""

    def __init__(
        self,
        *,
        ttl_seconds: int = 45,
        max_entries: int = 20000,
        bind_remote_addr: bool = False,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._tickets: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._bind_remote_addr = bind_remote_addr
        self._logger = logger or logging.getLogger(__name__)

    # ------------------------------------------------------------------
    # Internal helpers (called while lock is held)
    # ------------------------------------------------------------------

    def _prune_expired_locked(self, now_ts: float) -> int:
        """Remove expired tickets. Must be called with `self._lock` held."""
        expired: List[str] = [
            token
            for token, payload in self._tickets.items()
            if float(payload.get("expires_at") or 0.0) <= now_ts
        ]
        for token in expired:
            self._tickets.pop(token, None)
        return len(expired)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def issue_ticket(
        self,
        *,
        user_id: str,
        auth_mode: str,
        remote_addr: str,
    ) -> Dict[str, Any]:
        """Issue a new short-lived WebSocket ticket and return its metadata."""
        now_ts = time.time()
        expires_at = now_ts + self._ttl_seconds
        ticket_token = secrets.token_urlsafe(40)
        auth_mode_value = str(auth_mode or "unknown").strip() or "unknown"
        user_id_value = str(user_id or "").strip()
        remote_addr_value = str(remote_addr or "unknown").strip() or "unknown"

        with self._lock:
            self._prune_expired_locked(now_ts)

            if len(self._tickets) >= self._max_entries:
                overflow = len(self._tickets) - self._max_entries + 1
                oldest_tokens = sorted(
                    self._tickets.keys(),
                    key=lambda t: float(self._tickets[t].get("issued_at") or 0.0),
                )[:overflow]
                for token in oldest_tokens:
                    self._tickets.pop(token, None)
                if oldest_tokens:
                    self._logger.warning(
                        "Pruned %s websocket tickets due to capacity pressure (max=%s)",
                        len(oldest_tokens),
                        self._max_entries,
                    )

            self._tickets[ticket_token] = {
                "user_id": user_id_value,
                "auth_mode": auth_mode_value,
                "remote_addr": remote_addr_value,
                "issued_at": now_ts,
                "expires_at": expires_at,
            }

        self._logger.info(
            "Issued websocket ticket (user_id=%s, auth_mode=%s, remote=%s, ttl_seconds=%s)",
            user_id_value or "unknown",
            auth_mode_value,
            remote_addr_value,
            self._ttl_seconds,
        )
        return {
            "ticket": ticket_token,
            "expires_at": expires_at,
            "ttl_seconds": self._ttl_seconds,
        }

    def consume_ticket(
        self, ticket_token: str, remote_addr: str
    ) -> Tuple[bool, str]:
        """Consume a one-time ticket. Returns ``(valid, reason_string)``."""
        token_value = str(ticket_token or "").strip()
        remote_addr_value = str(remote_addr or "unknown").strip() or "unknown"
        if not token_value:
            return False, "missing"

        now_ts = time.time()
        with self._lock:
            self._prune_expired_locked(now_ts)
            ticket_payload = self._tickets.pop(token_value, None)

        if not ticket_payload:
            self._logger.warning(
                "Rejected websocket ticket (remote=%s, reason=missing_or_used)",
                remote_addr_value,
            )
            return False, "missing_or_used"

        expires_at = float(ticket_payload.get("expires_at") or 0.0)
        if expires_at <= now_ts:
            self._logger.warning(
                "Rejected websocket ticket (remote=%s, reason=expired)",
                remote_addr_value,
            )
            return False, "expired"

        issued_remote_addr = str(ticket_payload.get("remote_addr") or "").strip()
        if (
            self._bind_remote_addr
            and issued_remote_addr
            and issued_remote_addr != remote_addr_value
        ):
            self._logger.warning(
                "Rejected websocket ticket (remote=%s, reason=ip_mismatch, issued_remote=%s)",
                remote_addr_value,
                issued_remote_addr,
            )
            return False, "ip_mismatch"

        self._logger.info(
            "Accepted websocket ticket (remote=%s, user_id=%s, auth_mode=%s)",
            remote_addr_value,
            str(ticket_payload.get("user_id") or "unknown"),
            str(ticket_payload.get("auth_mode") or "unknown"),
        )
        return True, "ok"
