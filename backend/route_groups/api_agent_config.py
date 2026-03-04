from __future__ import annotations

from typing import Any, Callable, Dict, List


def agent_broker_config_status(
    *,
    supabase_url: str,
    agent_gateway_url: str,
    agent_require_webhook_secret: bool,
    agent_webhook_secret: str,
    supabase_jwt_secret: str,
    supabase_api_key: str,
    supabase_anon_key: str,
    looks_like_uuid_fn: Callable[[str], bool],
) -> Dict[str, Any]:
    missing: List[str] = []
    warnings: List[str] = []

    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not agent_gateway_url:
        missing.append("AGENT_GATEWAY_URL")
    if agent_require_webhook_secret and not agent_webhook_secret:
        missing.append("AGENT_WEBHOOK_SECRET")

    if supabase_jwt_secret and looks_like_uuid_fn(supabase_jwt_secret):
        warnings.append(
            "SUPABASE_JWT_SECRET looks like a key ID. For ECC keys, leave it empty and use JWKS."
        )

    if supabase_api_key and supabase_api_key == supabase_anon_key:
        warnings.append("Using SUPABASE_ANON_KEY for backend auth. Prefer service role key.")

    return {
        "ok": len(missing) == 0,
        "missing": missing,
        "warnings": warnings,
        "require_webhook_secret": agent_require_webhook_secret,
    }
