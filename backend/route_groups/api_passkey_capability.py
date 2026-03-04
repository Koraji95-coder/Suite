from __future__ import annotations

from typing import Any, Callable, Dict, List


def auth_passkey_capability(
    *,
    auth_passkey_enabled: bool,
    auth_passkey_provider: str,
    auth_passkey_external_name: str,
    auth_passkey_external_discovery_url: str,
    auth_passkey_external_signin_url: str,
    auth_passkey_require_signed_callback: bool,
    auth_passkey_callback_signing_secret: str,
    webauthn_available: bool,
    supabase_url: str,
    supabase_service_role_key: str,
    auth_passkey_rp_id: str,
    auth_passkey_rp_name: str,
    webauthn_import_error: str,
    normalized_auth_passkey_allowed_origins_fn: Callable[[], List[str]],
    is_valid_webauthn_rp_id_for_origin_fn: Callable[[str, str], bool],
    normalize_absolute_http_url_fn: Callable[[str], str | None],
) -> Dict[str, Any]:
    config_missing: List[str] = []
    warnings: List[str] = []
    provider_label = "Supabase"
    handlers_ready = False

    if auth_passkey_provider == "supabase":
        provider_label = "Supabase"
        if not supabase_url:
            config_missing.append("SUPABASE_URL")
    elif auth_passkey_provider == "external":
        provider_label = auth_passkey_external_name
        if not auth_passkey_external_signin_url:
            config_missing.append("AUTH_PASSKEY_EXTERNAL_SIGNIN_URL")
        elif not normalize_absolute_http_url_fn(auth_passkey_external_signin_url):
            config_missing.append("AUTH_PASSKEY_EXTERNAL_SIGNIN_URL (must be absolute http(s) URL)")
        if auth_passkey_require_signed_callback and not auth_passkey_callback_signing_secret:
            config_missing.append("AUTH_PASSKEY_CALLBACK_SIGNING_SECRET")
        if not auth_passkey_require_signed_callback:
            warnings.append(
                "AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=false; external callback trust is reduced."
            )
        if auth_passkey_external_discovery_url and not auth_passkey_external_discovery_url.startswith(
            ("http://", "https://")
        ):
            warnings.append("AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL must be an absolute http(s) URL.")
    elif auth_passkey_provider == "first-party":
        provider_label = "Suite First-Party WebAuthn"
        if not webauthn_available:
            config_missing.append("python package webauthn")
        if not supabase_url:
            config_missing.append("SUPABASE_URL")
        if not supabase_service_role_key:
            config_missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if not auth_passkey_rp_id:
            config_missing.append("AUTH_PASSKEY_RP_ID")
        if not auth_passkey_rp_name:
            config_missing.append("AUTH_PASSKEY_RP_NAME")

        allowed_origins = normalized_auth_passkey_allowed_origins_fn()
        if not allowed_origins:
            config_missing.append("AUTH_PASSKEY_ALLOWED_ORIGINS")
        elif auth_passkey_rp_id:
            invalid_origins = [
                origin
                for origin in allowed_origins
                if not is_valid_webauthn_rp_id_for_origin_fn(auth_passkey_rp_id, origin)
            ]
            if invalid_origins:
                config_missing.append(
                    "AUTH_PASSKEY_RP_ID must match AUTH_PASSKEY_ALLOWED_ORIGINS hostname."
                )
        if webauthn_import_error:
            warnings.append(f"WebAuthn import warning: {webauthn_import_error}")

    if auth_passkey_provider == "supabase":
        warnings.append(
            "Passkey enrollment/login handlers are not wired in this build yet."
        )
    elif auth_passkey_provider == "first-party":
        warnings.append(
            "First-party passkey flow is active; keep AUTH_PASSKEY_ALLOWED_ORIGINS restricted to trusted app origins."
        )
    else:
        warnings.append("External provider redirect flow is enabled when configured.")

    config_ready = len(config_missing) == 0
    if not auth_passkey_enabled:
        rollout_state = "disabled"
        next_step = "Set AUTH_PASSKEY_ENABLED=true and restart backend."
    elif not config_ready:
        rollout_state = "needs-config"
        missing_list = ", ".join(config_missing)
        next_step = f"Set missing passkey config: {missing_list}."
    else:
        if auth_passkey_provider == "external":
            handlers_ready = True
            rollout_state = "ready"
            next_step = "External provider passkey start handlers are ready."
        elif auth_passkey_provider == "first-party":
            handlers_ready = True
            rollout_state = "ready"
            next_step = "First-party WebAuthn passkey start/verify handlers are ready."
        else:
            rollout_state = "planned"
            next_step = "Provider selected, but passkey handlers are not available in this build."

    return {
        "enabled": auth_passkey_enabled,
        "provider": auth_passkey_provider,
        "provider_label": provider_label,
        "rollout_state": rollout_state,
        "handlers_ready": handlers_ready,
        "signed_callback_required": auth_passkey_require_signed_callback,
        "config_ready": config_ready,
        "config_missing": config_missing,
        "warnings": warnings,
        "next_step": next_step,
    }
