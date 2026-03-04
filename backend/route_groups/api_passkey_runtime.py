from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .api_auth_redirect import (
    build_auth_redirect_url as auth_redirect_build_url_helper,
    build_external_passkey_redirect as auth_redirect_build_external_passkey_redirect_helper,
)
from .api_auth_redirect_signature import (
    build_passkey_callback_signature_payload as auth_redirect_signature_build_payload_helper,
    normalize_passkey_callback_timestamp as auth_redirect_signature_normalize_timestamp_helper,
    verify_passkey_callback_signature as auth_redirect_signature_verify_helper,
)
from .api_passkey_capability import auth_passkey_capability as passkey_capability_helper
from .api_passkey_formatting import (
    coerce_webauthn_enum_value as passkey_coerce_webauthn_enum_value,
    extract_passkey_credential_id as passkey_extract_passkey_credential_id,
    normalize_passkey_friendly_name as passkey_normalize_passkey_friendly_name,
    normalize_passkey_transports as passkey_normalize_passkey_transports,
)
from .api_passkey_helpers import (
    purge_expired_passkey_callback_states as passkey_purge_expired_passkey_callback_states,
    purge_expired_passkey_webauthn_states as passkey_purge_expired_passkey_webauthn_states,
)
from .api_passkey_origin import (
    is_valid_webauthn_rp_id_for_origin as passkey_origin_is_valid_webauthn_rp_id_for_origin_helper,
    normalize_absolute_http_url as passkey_origin_normalize_absolute_http_url_helper,
    normalize_origin as passkey_origin_normalize_origin_helper,
    normalized_auth_passkey_allowed_origins as passkey_origin_normalized_allowed_origins_helper,
)
from .api_passkey_request_context import (
    options_to_json_dict as passkey_request_context_options_to_json_dict_helper,
    resolve_passkey_webauthn_expected_origin as passkey_request_context_resolve_expected_origin_helper,
)
from .api_passkey_state import (
    consume_passkey_callback_state as passkey_state_consume_callback_state_helper,
    consume_passkey_webauthn_state as passkey_state_consume_webauthn_state_helper,
    create_passkey_callback_state as passkey_state_create_callback_state_helper,
    create_passkey_webauthn_state as passkey_state_create_webauthn_state_helper,
    get_passkey_callback_state as passkey_state_get_callback_state_helper,
)


@dataclass(frozen=True)
class PasskeyRuntime:
    purge_expired_passkey_callback_states: Callable[[Optional[float]], None]
    create_passkey_callback_state: Callable[[str, str, str, str, str], Tuple[str, int]]
    consume_passkey_callback_state: Callable[[str], Tuple[Optional[Dict[str, Any]], str]]
    get_passkey_callback_state: Callable[[str], Tuple[Optional[Dict[str, Any]], str]]
    purge_expired_passkey_webauthn_states: Callable[[Optional[float]], None]
    create_passkey_webauthn_state: Callable[[str, str, str, str, str, str, str], Tuple[str, int]]
    consume_passkey_webauthn_state: Callable[[str, str], Tuple[Optional[Dict[str, Any]], str]]
    normalize_passkey_transports: Callable[[Any], List[str]]
    normalize_passkey_friendly_name: Callable[[Any], str]
    extract_passkey_credential_id: Callable[[Any], str]
    coerce_webauthn_enum_value: Callable[[Any], str]
    normalize_passkey_callback_timestamp: Callable[[str], Optional[int]]
    build_passkey_callback_signature_payload: Callable[[str, str, str, str, str, int], str]
    verify_passkey_callback_signature: Callable[[str, str, str, str, str, str, str], Tuple[bool, str]]
    normalize_origin: Callable[[str], Optional[str]]
    normalize_absolute_http_url: Callable[[str], Optional[str]]
    normalized_auth_passkey_allowed_origins: Callable[[], List[str]]
    is_valid_webauthn_rp_id_for_origin: Callable[[str, str], bool]
    resolve_passkey_webauthn_expected_origin: Callable[[], Tuple[Optional[str], str]]
    options_to_json_dict: Callable[[Any], Dict[str, Any]]
    build_auth_redirect_url: Callable[[str, str, Optional[Dict[str, str]]], Optional[str]]
    build_external_passkey_redirect: Callable[[str, str, str], Optional[str]]
    auth_passkey_capability: Callable[[], Dict[str, Any]]


def create_passkey_runtime(
    *,
    request_obj: Any,
    logger: Any,
    options_to_json_fn: Any,
    json_module: Any,
    auth_email_redirect_url: str,
    auth_allowed_redirect_origins: List[str],
    auth_passkey_allowed_origins: List[str],
    passkey_callback_states: Dict[str, Dict[str, Any]],
    passkey_callback_states_lock: Any,
    passkey_webauthn_states: Dict[str, Dict[str, Any]],
    passkey_webauthn_states_lock: Any,
    auth_passkey_callback_state_ttl_seconds: int,
    auth_passkey_callback_state_max_entries: int,
    auth_passkey_webauthn_state_ttl_seconds: int,
    auth_passkey_webauthn_state_max_entries: int,
    passkey_credential_id_pattern: Any,
    passkey_callback_state_pattern: Any,
    passkey_callback_signature_pattern: Any,
    passkey_callback_timestamp_pattern: Any,
    auth_passkey_require_signed_callback: bool,
    auth_passkey_callback_signing_secret: str,
    auth_passkey_callback_signature_max_age_seconds: int,
    auth_passkey_callback_signature_max_clock_skew_seconds: int,
    auth_passkey_enabled: bool,
    auth_passkey_provider: str,
    auth_passkey_external_name: str,
    auth_passkey_external_discovery_url: str,
    auth_passkey_external_signin_url: str,
    auth_passkey_external_enroll_url: str,
    webauthn_available: bool,
    supabase_url: str,
    supabase_service_role_key: str,
    auth_passkey_rp_id: str,
    auth_passkey_rp_name: str,
    webauthn_import_error: str,
) -> PasskeyRuntime:
    def purge_expired_passkey_callback_states(now: Optional[float] = None) -> None:
        return passkey_purge_expired_passkey_callback_states(
            passkey_callback_states=passkey_callback_states,
            max_entries=auth_passkey_callback_state_max_entries,
            now=now,
        )

    def create_passkey_callback_state(
        intent: str,
        client_ip: str,
        client_redirect_to: str = "",
        user_id: str = "",
        email: str = "",
    ) -> Tuple[str, int]:
        return passkey_state_create_callback_state_helper(
            intent,
            client_ip,
            client_redirect_to,
            user_id,
            email,
            ttl_seconds=auth_passkey_callback_state_ttl_seconds,
            passkey_callback_states=passkey_callback_states,
            passkey_callback_states_lock=passkey_callback_states_lock,
            max_entries=auth_passkey_callback_state_max_entries,
        )

    def consume_passkey_callback_state(state: str) -> Tuple[Optional[Dict[str, Any]], str]:
        return passkey_state_consume_callback_state_helper(
            state,
            passkey_callback_states=passkey_callback_states,
            passkey_callback_states_lock=passkey_callback_states_lock,
            max_entries=auth_passkey_callback_state_max_entries,
        )

    def get_passkey_callback_state(state: str) -> Tuple[Optional[Dict[str, Any]], str]:
        return passkey_state_get_callback_state_helper(
            state,
            passkey_callback_states=passkey_callback_states,
            passkey_callback_states_lock=passkey_callback_states_lock,
            max_entries=auth_passkey_callback_state_max_entries,
        )

    def purge_expired_passkey_webauthn_states(now: Optional[float] = None) -> None:
        return passkey_purge_expired_passkey_webauthn_states(
            passkey_webauthn_states=passkey_webauthn_states,
            max_entries=auth_passkey_webauthn_state_max_entries,
            now=now,
        )

    def create_passkey_webauthn_state(
        intent: str,
        challenge: str,
        expected_origin: str,
        client_ip: str,
        client_redirect_to: str = "",
        user_id: str = "",
        email: str = "",
    ) -> Tuple[str, int]:
        return passkey_state_create_webauthn_state_helper(
            intent,
            challenge,
            expected_origin,
            client_ip,
            client_redirect_to,
            user_id,
            email,
            ttl_seconds=auth_passkey_webauthn_state_ttl_seconds,
            passkey_webauthn_states=passkey_webauthn_states,
            passkey_webauthn_states_lock=passkey_webauthn_states_lock,
            max_entries=auth_passkey_webauthn_state_max_entries,
        )

    def consume_passkey_webauthn_state(
        state: str,
        expected_intent: str = "",
    ) -> Tuple[Optional[Dict[str, Any]], str]:
        return passkey_state_consume_webauthn_state_helper(
            state,
            expected_intent,
            passkey_webauthn_states=passkey_webauthn_states,
            passkey_webauthn_states_lock=passkey_webauthn_states_lock,
            max_entries=auth_passkey_webauthn_state_max_entries,
        )

    def normalize_passkey_transports(value: Any) -> List[str]:
        return passkey_normalize_passkey_transports(value)

    def normalize_passkey_friendly_name(value: Any) -> str:
        return passkey_normalize_passkey_friendly_name(value)

    def extract_passkey_credential_id(credential_payload: Any) -> str:
        return passkey_extract_passkey_credential_id(
            credential_payload,
            credential_id_pattern=passkey_credential_id_pattern,
        )

    def coerce_webauthn_enum_value(value: Any) -> str:
        return passkey_coerce_webauthn_enum_value(value)

    def normalize_passkey_callback_timestamp(raw_value: str) -> Optional[int]:
        return auth_redirect_signature_normalize_timestamp_helper(
            raw_value,
            timestamp_pattern=passkey_callback_timestamp_pattern,
        )

    def build_passkey_callback_signature_payload(
        state: str,
        intent: str,
        status: str,
        email: str,
        error_message: str,
        timestamp: int,
    ) -> str:
        return auth_redirect_signature_build_payload_helper(
            state,
            intent,
            status,
            email,
            error_message,
            timestamp,
        )

    def verify_passkey_callback_signature(
        state: str,
        intent: str,
        status: str,
        email: str,
        error_message: str,
        signature: str,
        timestamp_raw: str,
    ) -> Tuple[bool, str]:
        return auth_redirect_signature_verify_helper(
            state,
            intent,
            status,
            email,
            error_message,
            signature,
            timestamp_raw,
            require_signed_callback=auth_passkey_require_signed_callback,
            callback_signing_secret=auth_passkey_callback_signing_secret,
            signature_pattern=passkey_callback_signature_pattern,
            timestamp_pattern=passkey_callback_timestamp_pattern,
            max_clock_skew_seconds=auth_passkey_callback_signature_max_clock_skew_seconds,
            max_age_seconds=auth_passkey_callback_signature_max_age_seconds,
        )

    def normalize_origin(candidate: str) -> Optional[str]:
        return passkey_origin_normalize_origin_helper(candidate)

    def normalize_absolute_http_url(candidate: str) -> Optional[str]:
        return passkey_origin_normalize_absolute_http_url_helper(candidate)

    def normalized_auth_passkey_allowed_origins() -> List[str]:
        return passkey_origin_normalized_allowed_origins_helper(auth_passkey_allowed_origins)

    def is_valid_webauthn_rp_id_for_origin(rp_id: str, origin: str) -> bool:
        return passkey_origin_is_valid_webauthn_rp_id_for_origin_helper(rp_id, origin)

    def resolve_passkey_webauthn_expected_origin() -> Tuple[Optional[str], str]:
        return passkey_request_context_resolve_expected_origin_helper(
            request_headers=request_obj.headers,
            auth_email_redirect_url=auth_email_redirect_url,
            allowed_origins=auth_passkey_allowed_origins,
        )

    def options_to_json_dict(options: Any) -> Dict[str, Any]:
        return passkey_request_context_options_to_json_dict_helper(
            options,
            options_to_json_fn=options_to_json_fn,
            json_module=json_module,
        )

    def build_auth_redirect_url(
        path: str,
        client_redirect_to: str = "",
        query_params: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        return auth_redirect_build_url_helper(
            path,
            client_redirect_to,
            query_params=query_params,
            auth_allowed_redirect_origins=auth_allowed_redirect_origins,
            auth_email_redirect_url=auth_email_redirect_url,
            request_headers=request_obj.headers,
            normalize_origin_fn=normalize_origin,
            logger=logger,
        )

    def build_external_passkey_redirect(
        intent: str,
        state_token: str,
        client_redirect_to: str = "",
    ) -> Optional[str]:
        return auth_redirect_build_external_passkey_redirect_helper(
            intent,
            state_token,
            client_redirect_to,
            passkey_callback_state_pattern=passkey_callback_state_pattern,
            auth_passkey_external_signin_url=auth_passkey_external_signin_url,
            auth_passkey_external_enroll_url=auth_passkey_external_enroll_url,
            auth_passkey_require_signed_callback=auth_passkey_require_signed_callback,
            auth_passkey_callback_signature_max_age_seconds=auth_passkey_callback_signature_max_age_seconds,
            normalize_absolute_http_url_fn=normalize_absolute_http_url,
            build_auth_redirect_url_fn=build_auth_redirect_url,
        )

    def auth_passkey_capability() -> Dict[str, Any]:
        return passkey_capability_helper(
            auth_passkey_enabled=auth_passkey_enabled,
            auth_passkey_provider=auth_passkey_provider,
            auth_passkey_external_name=auth_passkey_external_name,
            auth_passkey_external_discovery_url=auth_passkey_external_discovery_url,
            auth_passkey_external_signin_url=auth_passkey_external_signin_url,
            auth_passkey_require_signed_callback=auth_passkey_require_signed_callback,
            auth_passkey_callback_signing_secret=auth_passkey_callback_signing_secret,
            webauthn_available=webauthn_available,
            supabase_url=supabase_url,
            supabase_service_role_key=supabase_service_role_key,
            auth_passkey_rp_id=auth_passkey_rp_id,
            auth_passkey_rp_name=auth_passkey_rp_name,
            webauthn_import_error=webauthn_import_error,
            normalized_auth_passkey_allowed_origins_fn=normalized_auth_passkey_allowed_origins,
            is_valid_webauthn_rp_id_for_origin_fn=is_valid_webauthn_rp_id_for_origin,
            normalize_absolute_http_url_fn=normalize_absolute_http_url,
        )

    return PasskeyRuntime(
        purge_expired_passkey_callback_states=purge_expired_passkey_callback_states,
        create_passkey_callback_state=create_passkey_callback_state,
        consume_passkey_callback_state=consume_passkey_callback_state,
        get_passkey_callback_state=get_passkey_callback_state,
        purge_expired_passkey_webauthn_states=purge_expired_passkey_webauthn_states,
        create_passkey_webauthn_state=create_passkey_webauthn_state,
        consume_passkey_webauthn_state=consume_passkey_webauthn_state,
        normalize_passkey_transports=normalize_passkey_transports,
        normalize_passkey_friendly_name=normalize_passkey_friendly_name,
        extract_passkey_credential_id=extract_passkey_credential_id,
        coerce_webauthn_enum_value=coerce_webauthn_enum_value,
        normalize_passkey_callback_timestamp=normalize_passkey_callback_timestamp,
        build_passkey_callback_signature_payload=build_passkey_callback_signature_payload,
        verify_passkey_callback_signature=verify_passkey_callback_signature,
        normalize_origin=normalize_origin,
        normalize_absolute_http_url=normalize_absolute_http_url,
        normalized_auth_passkey_allowed_origins=normalized_auth_passkey_allowed_origins,
        is_valid_webauthn_rp_id_for_origin=is_valid_webauthn_rp_id_for_origin,
        resolve_passkey_webauthn_expected_origin=resolve_passkey_webauthn_expected_origin,
        options_to_json_dict=options_to_json_dict,
        build_auth_redirect_url=build_auth_redirect_url,
        build_external_passkey_redirect=build_external_passkey_redirect,
        auth_passkey_capability=auth_passkey_capability,
    )
