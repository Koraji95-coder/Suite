from __future__ import annotations

from typing import Iterable, List, Optional

from .api_passkey_helpers import (
    is_valid_webauthn_rp_id_for_origin as passkey_is_valid_webauthn_rp_id_for_origin,
    normalize_absolute_http_url as passkey_normalize_absolute_http_url,
    normalize_origin as passkey_normalize_origin,
    normalized_auth_passkey_allowed_origins as passkey_normalized_auth_passkey_allowed_origins,
)


def normalize_origin(candidate: str) -> Optional[str]:
    return passkey_normalize_origin(candidate)


def normalize_absolute_http_url(candidate: str) -> Optional[str]:
    return passkey_normalize_absolute_http_url(candidate)


def normalized_auth_passkey_allowed_origins(allowed_origins: Iterable[str]) -> List[str]:
    return passkey_normalized_auth_passkey_allowed_origins(allowed_origins)


def is_valid_webauthn_rp_id_for_origin(rp_id: str, origin: str) -> bool:
    return passkey_is_valid_webauthn_rp_id_for_origin(rp_id, origin)
