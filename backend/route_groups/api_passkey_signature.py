from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Optional, Tuple


def normalize_passkey_callback_timestamp(
    raw_value: str,
    *,
    timestamp_pattern: Any,
) -> Optional[int]:
    value = str(raw_value or "").strip()
    if not timestamp_pattern.match(value):
        return None

    parsed = int(value)
    if parsed > 10_000_000_000:
        parsed = parsed // 1000

    if parsed <= 0:
        return None
    return parsed


def build_passkey_callback_signature_payload(
    *,
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    timestamp: int,
) -> str:
    return "\n".join(
        [
            state.strip(),
            intent.strip().lower(),
            status.strip().lower(),
            email.strip().lower(),
            error_message.replace("\r", " ").replace("\n", " ").strip(),
            str(int(timestamp)),
        ]
    )


def verify_passkey_callback_signature(
    *,
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    signature: str,
    timestamp_raw: str,
    require_signed_callback: bool,
    callback_signing_secret: str,
    signature_pattern: Any,
    timestamp_pattern: Any,
    max_clock_skew_seconds: int,
    max_age_seconds: int,
) -> Tuple[bool, str]:
    if not require_signed_callback:
        return True, "disabled"

    if not callback_signing_secret:
        return False, "missing-secret"

    normalized_signature = str(signature or "").strip().lower()
    if not signature_pattern.match(normalized_signature):
        return False, "invalid-signature-format"

    timestamp = normalize_passkey_callback_timestamp(
        timestamp_raw,
        timestamp_pattern=timestamp_pattern,
    )
    if timestamp is None:
        return False, "invalid-timestamp-format"

    now = int(time.time())
    if timestamp > (now + max_clock_skew_seconds):
        return False, "timestamp-in-future"

    if max_age_seconds > 0 and (now - timestamp) > max_age_seconds:
        return False, "timestamp-expired"

    payload = build_passkey_callback_signature_payload(
        state=state,
        intent=intent,
        status=status,
        email=email,
        error_message=error_message,
        timestamp=timestamp,
    )
    expected_signature = hmac.new(
        callback_signing_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, normalized_signature):
        return False, "signature-mismatch"

    return True, "ok"
