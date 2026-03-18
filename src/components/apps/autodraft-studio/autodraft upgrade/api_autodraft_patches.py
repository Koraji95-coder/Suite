# api_autodraft.py — Two surgical patches
# Apply these changes to your existing file.
# No other lines change.

# ============================================================
# PATCH 1: _proxy_json — Forward auth headers to .NET API
# Location: around line 338
# Replace the entire _proxy_json function with this:
# ============================================================

def _proxy_json(
    *,
    base_url: str,
    method: str,
    path: str,
    timeout_seconds: int,
    payload: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    if not base_url:
        return None, "AutoDraft .NET API URL is not configured.", 503

    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"

    # Forward auth headers from the original request to .NET upstream
    proxy_headers: Dict[str, str] = {}
    if request:
        api_key = request.headers.get("X-API-Key")
        if api_key:
            proxy_headers["X-API-Key"] = api_key
        auth_header = request.headers.get("Authorization")
        if auth_header:
            proxy_headers["Authorization"] = auth_header

    try:
        response = requests.request(
            method=method.upper(),
            url=url,
            json=payload,
            timeout=timeout_seconds,
            headers=proxy_headers if proxy_headers else None,
        )
    except Exception as exc:
        return None, str(exc), 503

    if not response.ok:
        return None, _read_json_error(response), response.status_code

    try:
        parsed = response.json()
    except Exception:
        return None, "Upstream response was not valid JSON.", 502

    if not isinstance(parsed, dict):
        return None, "Upstream response must be a JSON object.", 502
    return parsed, None, response.status_code


# ============================================================
# PATCH 2: _build_local_plan summary — count semantic matches
# Location: around line 1113-1118
# Replace the summary block at the end of _build_local_plan:
# ============================================================

    # OLD (Bug 6 — semantic matches counted as needs_review):
    # summary = {
    #     "total_markups": len(effective_markups),
    #     "actions_proposed": len(actions),
    #     "classified": sum(1 for item in actions if item["rule_id"]),
    #     "needs_review": sum(1 for item in actions if not item["rule_id"]),
    # }

    # NEW — semantic inferences with a valid category count as classified:
    summary = {
        "total_markups": len(effective_markups),
        "actions_proposed": len(actions),
        "classified": sum(
            1 for item in actions
            if item.get("rule_id") or (
                item.get("category", "UNCLASSIFIED") != "UNCLASSIFIED"
                and item.get("confidence", 0) > 0
            )
        ),
        "needs_review": sum(
            1 for item in actions
            if not item.get("rule_id") and (
                item.get("category", "UNCLASSIFIED") == "UNCLASSIFIED"
                or item.get("confidence", 0) <= 0
            )
        ),
    }
