from __future__ import annotations

import json
import secrets
import time
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set, Tuple
from urllib.parse import urlparse, urlunparse


def normalize_passkey_transports(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []

    allowed = {"usb", "nfc", "ble", "hybrid", "internal"}
    deduped: List[str] = []
    seen: Set[str] = set()
    for entry in value:
        normalized = str(entry or "").strip().lower()
        if normalized not in allowed or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def purge_expired_passkey_callback_states(
    *,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    max_entries: int,
    now: Optional[float] = None,
) -> None:
    ts = time.time() if now is None else now
    expired = [
        state
        for state, entry in passkey_callback_states.items()
        if entry.get("expires_at", 0) <= ts
    ]
    for state in expired:
        passkey_callback_states.pop(state, None)

    overflow = len(passkey_callback_states) - max_entries
    if overflow <= 0:
        return

    oldest = sorted(
        passkey_callback_states.items(),
        key=lambda item: item[1].get("created_at", 0),
    )[:overflow]
    for state, _ in oldest:
        passkey_callback_states.pop(state, None)


def create_passkey_callback_state(
    *,
    intent: str,
    client_ip: str,
    client_redirect_to: str,
    user_id: str,
    email: str,
    ttl_seconds: int,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[str, int]:
    now = time.time()
    expires_at = int(now) + ttl_seconds
    state = secrets.token_urlsafe(32)
    payload = {
        "intent": intent,
        "user_id": user_id.strip(),
        "email": email.strip().lower(),
        "client_ip": client_ip.strip(),
        "client_redirect_to": client_redirect_to.strip(),
        "created_at": now,
        "expires_at": expires_at,
    }

    with passkey_callback_states_lock:
        purge_expired_passkey_callback_states(
            passkey_callback_states=passkey_callback_states,
            max_entries=max_entries,
            now=now,
        )
        passkey_callback_states[state] = payload

    return state, expires_at


def consume_passkey_callback_state(
    *,
    state: str,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    now = time.time()
    with passkey_callback_states_lock:
        purge_expired_passkey_callback_states(
            passkey_callback_states=passkey_callback_states,
            max_entries=max_entries,
            now=now,
        )
        payload = passkey_callback_states.get(state)
        if not payload:
            return None, "missing"

        if payload.get("expires_at", 0) <= now:
            passkey_callback_states.pop(state, None)
            return None, "expired"

        passkey_callback_states.pop(state, None)
        return payload, "ok"


def get_passkey_callback_state(
    *,
    state: str,
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    now = time.time()
    with passkey_callback_states_lock:
        purge_expired_passkey_callback_states(
            passkey_callback_states=passkey_callback_states,
            max_entries=max_entries,
            now=now,
        )
        payload = passkey_callback_states.get(state)
        if not payload:
            return None, "missing"

        if payload.get("expires_at", 0) <= now:
            passkey_callback_states.pop(state, None)
            return None, "expired"

        return dict(payload), "ok"


def purge_expired_passkey_webauthn_states(
    *,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    max_entries: int,
    now: Optional[float] = None,
) -> None:
    ts = time.time() if now is None else now
    expired = [
        state
        for state, entry in passkey_webauthn_states.items()
        if entry.get("expires_at", 0) <= ts
    ]
    for state in expired:
        passkey_webauthn_states.pop(state, None)

    overflow = len(passkey_webauthn_states) - max_entries
    if overflow <= 0:
        return

    oldest = sorted(
        passkey_webauthn_states.items(),
        key=lambda item: item[1].get("created_at", 0),
    )[:overflow]
    for state, _ in oldest:
        passkey_webauthn_states.pop(state, None)


def create_passkey_webauthn_state(
    *,
    intent: str,
    challenge: str,
    expected_origin: str,
    client_ip: str,
    client_redirect_to: str,
    user_id: str,
    email: str,
    ttl_seconds: int,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    passkey_webauthn_states_lock: Any,
    max_entries: int,
) -> Tuple[str, int]:
    now = time.time()
    expires_at = int(now) + ttl_seconds
    state = secrets.token_urlsafe(32)
    payload = {
        "intent": intent.strip().lower(),
        "user_id": user_id.strip(),
        "email": email.strip().lower(),
        "challenge": challenge.strip(),
        "expected_origin": expected_origin.strip(),
        "client_ip": client_ip.strip(),
        "client_redirect_to": client_redirect_to.strip(),
        "created_at": now,
        "expires_at": expires_at,
    }

    with passkey_webauthn_states_lock:
        purge_expired_passkey_webauthn_states(
            passkey_webauthn_states=passkey_webauthn_states,
            max_entries=max_entries,
            now=now,
        )
        passkey_webauthn_states[state] = payload

    return state, expires_at


def consume_passkey_webauthn_state(
    *,
    state: str,
    expected_intent: str,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    passkey_webauthn_states_lock: Any,
    max_entries: int,
) -> Tuple[Optional[Dict[str, Any]], str]:
    now = time.time()
    normalized_expected_intent = expected_intent.strip().lower()

    with passkey_webauthn_states_lock:
        purge_expired_passkey_webauthn_states(
            passkey_webauthn_states=passkey_webauthn_states,
            max_entries=max_entries,
            now=now,
        )
        payload = passkey_webauthn_states.get(state)
        if not payload:
            return None, "missing"

        if payload.get("expires_at", 0) <= now:
            passkey_webauthn_states.pop(state, None)
            return None, "expired"

        if normalized_expected_intent:
            payload_intent = str(payload.get("intent") or "").strip().lower()
            if payload_intent != normalized_expected_intent:
                return None, "intent-mismatch"

        passkey_webauthn_states.pop(state, None)
        return payload, "ok"


def normalize_passkey_friendly_name(value: Any) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    normalized = normalized.replace("\r", " ").replace("\n", " ").strip()
    return normalized[:80]


def extract_passkey_credential_id(credential_payload: Any, credential_id_pattern: Any) -> str:
    if not isinstance(credential_payload, dict):
        return ""

    credential_id = str(
        credential_payload.get("id")
        or credential_payload.get("rawId")
        or ""
    ).strip()
    if not credential_id:
        return ""
    if not credential_id_pattern.match(credential_id):
        return ""
    return credential_id


def coerce_webauthn_enum_value(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        try:
            return str(value.value)
        except Exception:
            return str(value)
    return str(value)


def normalize_origin(candidate: str) -> Optional[str]:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None

    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def normalize_absolute_http_url(candidate: str) -> Optional[str]:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None

    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.netloc:
        return None

    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))


def normalized_auth_passkey_allowed_origins(allowed_origins: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen: Set[str] = set()
    for entry in allowed_origins:
        candidate = normalize_origin(entry.strip())
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)
    return normalized


def is_valid_webauthn_rp_id_for_origin(rp_id: str, origin: str) -> bool:
    normalized_rp_id = str(rp_id or "").strip().lower()
    if not normalized_rp_id:
        return False

    try:
        hostname = (urlparse(origin).hostname or "").strip().lower()
    except Exception:
        return False
    if not hostname:
        return False
    return hostname == normalized_rp_id or hostname.endswith(f".{normalized_rp_id}")


def resolve_passkey_webauthn_expected_origin(
    *,
    request_headers: Mapping[str, Any],
    auth_email_redirect_url: str,
    allowed_origins: Iterable[str],
) -> Tuple[Optional[str], str]:
    allowed = normalized_auth_passkey_allowed_origins(allowed_origins)
    candidates = [
        str(request_headers.get("Origin", "")).strip(),
        str(request_headers.get("Referer", "")).strip(),
        auth_email_redirect_url,
    ]
    for candidate in candidates:
        origin = normalize_origin(candidate)
        if not origin:
            continue
        if allowed and origin not in allowed:
            continue
        return origin, "ok"

    if allowed:
        return allowed[0], "fallback"

    return None, "missing-origin"


def options_to_json_dict(
    options: Any,
    options_to_json_fn: Any,
    *,
    json_module: Any = json,
) -> Dict[str, Any]:
    if options_to_json_fn is None:
        raise RuntimeError("webauthn options serializer is unavailable.")

    serialized = options_to_json_fn(options)
    if isinstance(serialized, bytes):
        serialized = serialized.decode("utf-8")
    parsed = json_module.loads(serialized)
    if not isinstance(parsed, dict):
        raise RuntimeError("WebAuthn options serialization returned unexpected payload.")
    return parsed
