from __future__ import annotations

from typing import Any, Optional, Tuple

from .api_passkey_signature import (
    build_passkey_callback_signature_payload as passkey_build_passkey_callback_signature_payload,
    normalize_passkey_callback_timestamp as passkey_normalize_passkey_callback_timestamp,
    verify_passkey_callback_signature as passkey_verify_passkey_callback_signature,
)


def normalize_passkey_callback_timestamp(
    raw_value: str,
    *,
    timestamp_pattern: Any,
) -> Optional[int]:
    return passkey_normalize_passkey_callback_timestamp(
        raw_value,
        timestamp_pattern=timestamp_pattern,
    )


def build_passkey_callback_signature_payload(
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    timestamp: int,
) -> str:
    return passkey_build_passkey_callback_signature_payload(
        state=state,
        intent=intent,
        status=status,
        email=email,
        error_message=error_message,
        timestamp=timestamp,
    )


def verify_passkey_callback_signature(
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    signature: str,
    timestamp_raw: str,
    *,
    require_signed_callback: bool,
    callback_signing_secret: str,
    signature_pattern: Any,
    timestamp_pattern: Any,
    max_clock_skew_seconds: int,
    max_age_seconds: int,
) -> Tuple[bool, str]:
    return passkey_verify_passkey_callback_signature(
        state=state,
        intent=intent,
        status=status,
        email=email,
        error_message=error_message,
        signature=signature,
        timestamp_raw=timestamp_raw,
        require_signed_callback=require_signed_callback,
        callback_signing_secret=callback_signing_secret,
        signature_pattern=signature_pattern,
        timestamp_pattern=timestamp_pattern,
        max_clock_skew_seconds=max_clock_skew_seconds,
        max_age_seconds=max_age_seconds,
    )
