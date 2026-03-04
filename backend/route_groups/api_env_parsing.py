from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List


@dataclass(frozen=True)
class EnvParsingRuntime:
    parse_csv_env: Callable[[str, List[str]], List[str]]
    parse_int_env: Callable[[str, int, int], int]
    parse_bool_env: Callable[[str, bool], bool]


def create_env_parsing_runtime(
    *,
    os_module,
    logger,
) -> EnvParsingRuntime:
    def parse_csv_env(var_name: str, fallback: List[str]) -> List[str]:
        raw = os_module.environ.get(var_name, "")
        if not raw.strip():
            return fallback
        return [item.strip() for item in raw.split(",") if item.strip()]

    def parse_int_env(var_name: str, fallback: int, minimum: int = 1) -> int:
        raw = os_module.environ.get(var_name)
        if raw is None:
            return fallback
        try:
            value = int(raw)
            return max(value, minimum)
        except ValueError:
            logger.warning("Invalid %s=%r; using fallback %s", var_name, raw, fallback)
            return fallback

    def parse_bool_env(var_name: str, fallback: bool = False) -> bool:
        raw = os_module.environ.get(var_name)
        if raw is None:
            return fallback
        normalized = str(raw).strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        logger.warning("Invalid %s=%r; using fallback %s", var_name, raw, fallback)
        return fallback

    return EnvParsingRuntime(
        parse_csv_env=parse_csv_env,
        parse_int_env=parse_int_env,
        parse_bool_env=parse_bool_env,
    )
