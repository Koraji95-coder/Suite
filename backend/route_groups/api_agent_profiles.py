from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional


DEFAULT_AGENT_PROFILE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "koro",
        "name": "Koro",
        "tagline": "Workflow orchestration and execution",
        "focus": "Planning, orchestration, and multi-step coordination.",
        "memory_namespace": "koro",
        "model_primary": "qwen3:14b",
        "model_fallbacks": ["gemma3:12b"],
    },
    {
        "id": "devstral",
        "name": "Devstral",
        "tagline": "Code and automation specialist",
        "focus": "Refactors, diagnostics, scripts, and technical implementation.",
        "memory_namespace": "devstral",
        "model_primary": "devstral-small-2:latest",
        "model_fallbacks": ["qwen2.5-coder:14b"],
    },
    {
        "id": "sentinel",
        "name": "Sentinel",
        "tagline": "QA and standards verification",
        "focus": "Checks, risk reviews, and standards-compliance validation.",
        "memory_namespace": "sentinel",
        "model_primary": "gemma3:12b",
        "model_fallbacks": ["qwen3:8b"],
    },
    {
        "id": "forge",
        "name": "Forge",
        "tagline": "Content, docs, and output generation",
        "focus": "Structured output generation for docs, summaries, and artifacts.",
        "memory_namespace": "forge",
        "model_primary": "qwen2.5-coder:14b",
        "model_fallbacks": ["devstral-small-2:latest"],
    },
    {
        "id": "draftsmith",
        "name": "Draftsmith",
        "tagline": "CAD intent and electrical drafting",
        "focus": "CAD-aware drafting intent, electrical reasoning, and route guidance.",
        "memory_namespace": "draftsmith",
        "model_primary": "joshuaokolo/C3Dv0:latest",
        "model_fallbacks": ["ALIENTELLIGENCE/electricalengineerv2:latest"],
    },
)


def _normalize_model(value: Any) -> str:
    return str(value or "").strip()


def _parse_model_fallbacks(raw_value: Any) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, (list, tuple)):
        values = [str(entry or "").strip() for entry in raw_value]
    else:
        values = [entry.strip() for entry in str(raw_value).split(",")]
    return [value for value in values if value]


def build_agent_profile_catalog(*, environ: Mapping[str, Any], logger: Any) -> Dict[str, Dict[str, Any]]:
    catalog: Dict[str, Dict[str, Any]] = {
        str(entry["id"]).strip().lower(): {
            **entry,
            "id": str(entry["id"]).strip().lower(),
            "model_primary": _normalize_model(entry.get("model_primary")),
            "model_fallbacks": _parse_model_fallbacks(entry.get("model_fallbacks")),
        }
        for entry in DEFAULT_AGENT_PROFILE_CATALOG
    }

    for profile_id, profile in catalog.items():
        profile_key = profile_id.upper()
        primary_env_key = f"AGENT_MODEL_{profile_key}_PRIMARY"
        fallback_env_key = f"AGENT_MODEL_{profile_key}_FALLBACKS"

        env_primary = _normalize_model(environ.get(primary_env_key))
        if env_primary:
            profile["model_primary"] = env_primary

        env_fallbacks_raw = environ.get(fallback_env_key)
        if env_fallbacks_raw is not None and str(env_fallbacks_raw).strip():
            profile["model_fallbacks"] = _parse_model_fallbacks(env_fallbacks_raw)

    for profile_id, profile in catalog.items():
        if not profile.get("model_primary"):
            logger.warning(
                "Agent profile model config missing primary model for profile=%s; profile route disabled.",
                profile_id,
            )

    return catalog


def list_agent_profiles(catalog: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    ordered_ids: list[str] = [str(entry["id"]).strip().lower() for entry in DEFAULT_AGENT_PROFILE_CATALOG]
    result: list[dict[str, Any]] = []
    for profile_id in ordered_ids:
        profile = catalog.get(profile_id)
        if not profile:
            continue
        result.append(
            {
                "id": profile_id,
                "name": str(profile.get("name") or profile_id.title()),
                "tagline": str(profile.get("tagline") or ""),
                "focus": str(profile.get("focus") or ""),
                "memory_namespace": str(profile.get("memory_namespace") or profile_id),
                "model_primary": _normalize_model(profile.get("model_primary")),
                "model_fallbacks": _parse_model_fallbacks(profile.get("model_fallbacks")),
            }
        )
    return result


def resolve_agent_profile_route(
    catalog: Mapping[str, Mapping[str, Any]],
    profile_id: str,
) -> Optional[dict[str, Any]]:
    normalized_id = str(profile_id or "").strip().lower()
    if not normalized_id:
        return None

    profile = catalog.get(normalized_id)
    if not profile:
        return None

    primary = _normalize_model(profile.get("model_primary"))
    if not primary:
        return None

    fallbacks = _parse_model_fallbacks(profile.get("model_fallbacks"))
    return {
        "id": normalized_id,
        "primary_model": primary,
        "fallback_models": fallbacks,
    }


def dedupe_model_candidates(candidates: Iterable[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        value = _normalize_model(candidate)
        if not value or value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
