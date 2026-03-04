from __future__ import annotations

from typing import Any, Dict, Iterable, Mapping, Optional, Tuple

from .api_passkey_helpers import (
    options_to_json_dict as passkey_options_to_json_dict,
    resolve_passkey_webauthn_expected_origin as passkey_resolve_passkey_webauthn_expected_origin,
)


def resolve_passkey_webauthn_expected_origin(
    *,
    request_headers: Mapping[str, Any],
    auth_email_redirect_url: str,
    allowed_origins: Iterable[str],
) -> Tuple[Optional[str], str]:
    return passkey_resolve_passkey_webauthn_expected_origin(
        request_headers=request_headers,
        auth_email_redirect_url=auth_email_redirect_url,
        allowed_origins=allowed_origins,
    )


def options_to_json_dict(
    options: Any,
    *,
    options_to_json_fn: Any,
    json_module: Any,
) -> Dict[str, Any]:
    return passkey_options_to_json_dict(
        options,
        options_to_json_fn=options_to_json_fn,
        json_module=json_module,
    )
