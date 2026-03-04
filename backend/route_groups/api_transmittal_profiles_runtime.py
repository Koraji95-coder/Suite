from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass(frozen=True)
class TransmittalProfilesRuntime:
    slugify_transmittal_profile_id: Callable[[str], str]
    normalize_transmittal_profile: Callable[[Dict[str, Any], int], Optional[Dict[str, str]]]
    load_transmittal_profiles_payload: Callable[[], Dict[str, Any]]


def create_transmittal_profiles_runtime(
    *,
    transmittal_config_path: Any,
    transmittal_fallback_profiles: List[Dict[str, str]],
    transmittal_fallback_firms: List[str],
    transmittal_profiles_cache: Dict[str, Any],
    transmittal_profiles_cache_lock: Any,
    is_valid_email_fn: Callable[[str], bool],
    re_module: Any,
    json_module: Any,
    logger: Any,
    yaml_safe_load_fn: Optional[Callable[[str], Any]] = None,
) -> TransmittalProfilesRuntime:
    def slugify_transmittal_profile_id(value: str) -> str:
        normalized = re_module.sub(r"[^a-z0-9]+", "-", value.strip().lower())
        normalized = normalized.strip("-")
        return normalized[:64]

    def normalize_transmittal_profile(
        row: Dict[str, Any], fallback_index: int
    ) -> Optional[Dict[str, str]]:
        name = str(row.get("name") or "").strip()
        if not name:
            return None

        profile_id = str(row.get("id") or "").strip()
        if not profile_id:
            profile_id = (
                slugify_transmittal_profile_id(name) or f"profile-{fallback_index}"
            )
        else:
            profile_id = (
                slugify_transmittal_profile_id(profile_id) or f"profile-{fallback_index}"
            )

        title = str(row.get("title") or "").strip()[:120]
        email = str(row.get("email") or "").strip().lower()[:254]
        if email and not is_valid_email_fn(email):
            email = ""
        phone = str(row.get("phone") or "").strip()[:64]

        return {
            "id": profile_id,
            "name": name[:120],
            "title": title,
            "email": email,
            "phone": phone,
        }

    def load_transmittal_profiles_payload() -> Dict[str, Any]:
        cfg_mtime = None
        try:
            if transmittal_config_path.exists():
                cfg_mtime = transmittal_config_path.stat().st_mtime
        except Exception:
            cfg_mtime = None

        with transmittal_profiles_cache_lock:
            cached = transmittal_profiles_cache.get("payload")
            if cached and transmittal_profiles_cache.get("mtime") == cfg_mtime:
                return cached

            raw_cfg: Dict[str, Any] = {}
            if transmittal_config_path.exists():
                try:
                    raw_text = transmittal_config_path.read_text(encoding="utf-8")
                    if raw_text.strip():
                        try:
                            if yaml_safe_load_fn is not None:
                                loaded = yaml_safe_load_fn(raw_text)
                            else:
                                import yaml  # type: ignore

                                loaded = yaml.safe_load(raw_text)
                            if isinstance(loaded, dict):
                                raw_cfg = loaded
                        except Exception:
                            parsed = json_module.loads(raw_text)
                            if isinstance(parsed, dict):
                                raw_cfg = parsed
                except Exception as exc:
                    logger.warning("Failed to load transmittal config yaml: %s", exc)

            business = raw_cfg.get("business", {})
            ui = raw_cfg.get("ui", {})

            raw_profiles = business.get("pe_profiles", [])
            normalized_profiles: List[Dict[str, str]] = []
            seen_ids: Set[str] = set()
            if isinstance(raw_profiles, list):
                for index, row in enumerate(raw_profiles, start=1):
                    if not isinstance(row, dict):
                        continue
                    normalized = normalize_transmittal_profile(row, index)
                    if not normalized:
                        continue
                    base_id = normalized["id"]
                    dedupe_id = base_id
                    suffix = 2
                    while dedupe_id in seen_ids:
                        dedupe_id = f"{base_id}-{suffix}"
                        suffix += 1
                    normalized["id"] = dedupe_id
                    seen_ids.add(dedupe_id)
                    normalized_profiles.append(normalized)

            if not normalized_profiles:
                normalized_profiles = [dict(item) for item in transmittal_fallback_profiles]

            raw_firms = business.get("firm_numbers", [])
            firm_numbers: List[str] = []
            seen_firms: Set[str] = set()
            if isinstance(raw_firms, list):
                for value in raw_firms:
                    firm = str(value or "").strip()[:80]
                    if not firm or firm in seen_firms:
                        continue
                    seen_firms.add(firm)
                    firm_numbers.append(firm)

            if not firm_numbers:
                firm_numbers = list(transmittal_fallback_firms)

            default_profile = str(ui.get("default_pe") or "").strip()
            default_profile_id = ""
            if default_profile:
                for profile in normalized_profiles:
                    if default_profile in {profile["id"], profile["name"]}:
                        default_profile_id = profile["id"]
                        break
            if not default_profile_id:
                default_profile_id = normalized_profiles[0]["id"]

            default_firm = str(ui.get("default_firm") or "").strip()
            if default_firm not in firm_numbers:
                default_firm = firm_numbers[0]

            payload = {
                "profiles": normalized_profiles,
                "firm_numbers": firm_numbers,
                "defaults": {
                    "profile_id": default_profile_id,
                    "firm": default_firm,
                },
                "source": str(transmittal_config_path),
            }

            transmittal_profiles_cache["mtime"] = cfg_mtime
            transmittal_profiles_cache["payload"] = payload
            return payload

    return TransmittalProfilesRuntime(
        slugify_transmittal_profile_id=slugify_transmittal_profile_id,
        normalize_transmittal_profile=normalize_transmittal_profile,
        load_transmittal_profiles_payload=load_transmittal_profiles_payload,
    )
