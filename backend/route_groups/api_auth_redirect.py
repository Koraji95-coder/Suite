from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, Mapping, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


def build_auth_redirect_url(
    path: str,
    client_redirect_to: str = "",
    query_params: Optional[Dict[str, str]] = None,
    *,
    auth_allowed_redirect_origins: Iterable[str],
    auth_email_redirect_url: str,
    request_headers: Mapping[str, Any],
    normalize_origin_fn: Callable[[str], Optional[str]],
    logger: Any,
) -> Optional[str]:
    safe_path = path if path.startswith("/") else f"/{path}"
    allowed = {
        origin
        for origin in (
            normalize_origin_fn(entry.strip())
            for entry in auth_allowed_redirect_origins
        )
        if origin
    }

    candidates = [
        client_redirect_to,
        auth_email_redirect_url,
        str(request_headers.get("Origin", "")).strip(),
        str(request_headers.get("Referer", "")).strip(),
    ]
    normalized_candidates: list[str] = []

    for candidate in candidates:
        origin = normalize_origin_fn(candidate.strip())
        if not origin:
            continue
        normalized_candidates.append(origin)
        if allowed and origin not in allowed:
            logger.warning("Rejected auth redirect origin outside allowlist: %s", origin)
            continue

        parsed = urlparse(origin)
        query = ""
        if query_params:
            normalized_query = {
                str(key): str(value)
                for key, value in query_params.items()
                if str(key).strip() and str(value).strip()
            }
            if normalized_query:
                query = urlencode(normalized_query)
        return urlunparse((parsed.scheme, parsed.netloc, safe_path, "", query, ""))

    if normalized_candidates:
        logger.warning(
            "Unable to build auth redirect URL for path=%s using candidates=%s",
            safe_path,
            normalized_candidates,
        )
    else:
        logger.warning(
            "Unable to build auth redirect URL for path=%s because no valid origin candidate was supplied.",
            safe_path,
        )
    return None


def build_external_passkey_redirect(
    intent: str,
    state_token: str,
    client_redirect_to: str = "",
    *,
    passkey_callback_state_pattern: Any,
    auth_passkey_external_signin_url: str,
    auth_passkey_external_enroll_url: str,
    auth_passkey_require_signed_callback: bool,
    auth_passkey_callback_signature_max_age_seconds: int,
    normalize_absolute_http_url_fn: Callable[[str], Optional[str]],
    build_auth_redirect_url_fn: Callable[..., Optional[str]],
) -> Optional[str]:
    normalized_intent = intent.strip().lower()
    if normalized_intent not in {"sign-in", "enroll"}:
        return None
    if not passkey_callback_state_pattern.match(state_token):
        return None

    base_url = auth_passkey_external_signin_url
    if normalized_intent == "enroll":
        base_url = auth_passkey_external_enroll_url or auth_passkey_external_signin_url

    normalized_base = normalize_absolute_http_url_fn(base_url)
    if not normalized_base:
        return None

    return_path = "/login" if normalized_intent == "sign-in" else "/app/settings"
    suite_return_to = build_auth_redirect_url_fn(
        return_path,
        client_redirect_to,
        query_params={
            "passkey_state": state_token,
            "passkey_intent": normalized_intent,
        },
    )
    callback_api = build_auth_redirect_url_fn(
        "/api/auth/passkey/callback/complete",
        client_redirect_to,
    )

    parsed = urlparse(normalized_base)
    query_pairs = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_pairs["suite_intent"] = normalized_intent
    query_pairs["suite_state"] = state_token
    query_pairs["suite_callback_sig_required"] = (
        "1" if auth_passkey_require_signed_callback else "0"
    )
    query_pairs["suite_callback_sig_alg"] = "hmac-sha256"
    query_pairs["suite_callback_sig_payload"] = (
        "state,intent,status,email,error,timestamp"
    )
    query_pairs["suite_callback_sig_max_age_seconds"] = str(
        auth_passkey_callback_signature_max_age_seconds
    )
    query_pairs["suite_claims_required"] = "1"
    query_pairs["suite_claims_format"] = "jwt"
    query_pairs["suite_claims_alg"] = "HS256"
    if suite_return_to:
        query_pairs["suite_return_to"] = suite_return_to
    if callback_api:
        query_pairs["suite_callback_api"] = callback_api

    query = urlencode(query_pairs)
    return urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, query, parsed.fragment)
    )
