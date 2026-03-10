from __future__ import annotations

from typing import Any, Iterable, Mapping


PASSKEY_DEP_KEYS = (
    "AGENT_PAIRING_REDIRECT_PATH",
    "AUTH_PASSKEY_RP_ID",
    "AUTH_PASSKEY_RP_NAME",
    "AUTH_PASSKEY_REQUIRE_USER_VERIFICATION",
    "AUTH_PASSKEY_REQUIRE_RESIDENT_KEY",
    "AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS",
    "SUPABASE_SERVICE_ROLE_KEY",
    "WEBAUTHN_AVAILABLE",
    "PASSKEY_CALLBACK_STATE_PATTERN",
    "PASSKEY_CREDENTIAL_ID_PATTERN",
    "PASSKEY_CALLBACK_STATES",
    "PASSKEY_CALLBACK_STATES_LOCK",
    "_auth_passkey_capability",
    "_get_request_ip",
    "_resolve_passkey_webauthn_expected_origin",
    "_is_valid_webauthn_rp_id_for_origin",
    "_options_to_json_dict",
    "_create_passkey_webauthn_state",
    "_create_passkey_callback_state",
    "_build_external_passkey_redirect",
    "_get_supabase_user_id",
    "_get_supabase_user_email",
    "_fetch_active_passkeys_for_user_id",
    "_normalize_passkey_transports",
    "_consume_passkey_webauthn_state",
    "_extract_passkey_credential_id",
    "_fetch_active_passkey_by_credential_id",
    "_is_valid_email",
    "_update_user_passkey_row",
    "_generate_supabase_magic_link_url",
    "_send_supabase_email_link",
    "_normalize_passkey_friendly_name",
    "_coerce_webauthn_enum_value",
    "_insert_user_passkey_row",
    "_build_auth_redirect_url",
    "_get_passkey_callback_state",
    "_verify_passkey_callback_signature",
    "_consume_passkey_callback_state",
    "generate_authentication_options",
    "generate_registration_options",
    "verify_authentication_response",
    "verify_registration_response",
    "base64url_to_bytes",
    "bytes_to_base64url",
    "UserVerificationRequirement",
    "ResidentKeyRequirement",
    "PublicKeyCredentialDescriptor",
    "AuthenticatorSelectionCriteria",
    "AuthenticatorTransport",
)

AGENT_DEP_KEYS = (
    "_agent_broker_config_status",
    "_list_agent_profiles",
    "_resolve_agent_profile_route",
    "_get_supabase_user_id",
    "_get_supabase_user_email",
    "_get_request_ip",
    "_is_agent_pairing_action_allowed",
    "_create_agent_pairing_challenge",
    "_build_auth_redirect_url",
    "_send_supabase_email_link",
    "_email_fingerprint",
    "_request_gateway_pairing_code",
    "_is_agent_pairing_confirm_blocked",
    "_consume_agent_pairing_challenge",
    "_register_agent_pairing_confirm_failure",
    "_pair_agent_session_for_user",
    "_get_agent_session",
    "_revoke_gateway_agent_token",
    "_clear_agent_session_for_request",
    "_clear_agent_pairing_confirm_failures",
    "_is_admin_user",
    "_is_agent_task_allowed",
    "PAIRING_CODE_PATTERN",
    "PAIRING_CHALLENGE_ID_PATTERN",
    "AGENT_PAIRING_REDIRECT_PATH",
    "AGENT_PAIRING_CHALLENGE_LOCK",
    "AGENT_PAIRING_CHALLENGES",
    "AGENT_SESSION_COOKIE",
    "AGENT_DEFAULT_TIMEOUT_SECONDS",
    "AGENT_MAX_TIMEOUT_SECONDS",
    "AGENT_HEALTH_PROXY_TIMEOUT_SECONDS",
    "AGENT_REQUIRE_WEBHOOK_SECRET",
    "AGENT_WEBHOOK_SECRET",
    "AGENT_GATEWAY_URL",
    "AGENT_SESSIONS",
    "requests_module",
    "json_module",
)

TRANSMITTAL_RENDER_DEP_KEYS = (
    "TRANSMITTAL_RENDER_AVAILABLE",
    "_parse_json_field",
    "_load_transmittal_profiles_payload",
    "_schedule_cleanup",
    "_save_upload",
    "render_cid_transmittal",
    "render_transmittal",
    "_convert_docx_to_pdf",
    "traceback_module",
)


def _bundle_from_namespace(
    keys: Iterable[str],
    namespace: Mapping[str, Any],
) -> dict[str, Any]:
    return {key: namespace[key] for key in keys}


def build_passkey_deps(namespace: Mapping[str, Any]) -> dict[str, Any]:
    return _bundle_from_namespace(PASSKEY_DEP_KEYS, namespace)


def build_agent_deps(namespace: Mapping[str, Any]) -> dict[str, Any]:
    return _bundle_from_namespace(AGENT_DEP_KEYS, namespace)


def build_transmittal_render_deps(namespace: Mapping[str, Any]) -> dict[str, Any]:
    return _bundle_from_namespace(TRANSMITTAL_RENDER_DEP_KEYS, namespace)
