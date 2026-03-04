from __future__ import annotations

from typing import Any, List

from .api_passkey_helpers import (
    coerce_webauthn_enum_value as passkey_coerce_webauthn_enum_value,
    extract_passkey_credential_id as passkey_extract_passkey_credential_id,
    normalize_passkey_friendly_name as passkey_normalize_passkey_friendly_name,
    normalize_passkey_transports as passkey_normalize_passkey_transports,
)


def normalize_passkey_transports(value: Any) -> List[str]:
    return passkey_normalize_passkey_transports(value)


def normalize_passkey_friendly_name(value: Any) -> str:
    return passkey_normalize_passkey_friendly_name(value)


def extract_passkey_credential_id(
    credential_payload: Any,
    *,
    credential_id_pattern: Any,
) -> str:
    return passkey_extract_passkey_credential_id(
        credential_payload,
        credential_id_pattern=credential_id_pattern,
    )


def coerce_webauthn_enum_value(value: Any) -> str:
    return passkey_coerce_webauthn_enum_value(value)
