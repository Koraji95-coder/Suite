from __future__ import annotations

import argparse
import json
import os
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CODEX_CONFIG = Path.home() / ".codex" / "config.toml"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.watchdog.autocad_state_collector import (
    AutoCadStateCollector,
    load_autocad_state_collector_config,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the local Watchdog AutoCAD state collector.",
    )
    parser.add_argument(
        "--config",
        help="Path to a JSON config file. Environment variables override file values.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single register/scan/flush/heartbeat cycle, then exit.",
    )
    parser.add_argument(
        "--codex-config",
        default=str(DEFAULT_CODEX_CONFIG),
        help="Path to Codex config.toml used to discover workstation-local collector config.",
    )
    return parser


def _read_suite_repo_env(codex_config_path: str | os.PathLike[str] | None) -> dict[str, str]:
    if not codex_config_path:
        return {}

    path = Path(codex_config_path).expanduser()
    if not path.is_file():
        return {}

    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    parsed = tomllib.loads(raw.decode("utf-8"))

    env_section = (
        parsed.get("mcp_servers", {})
        .get("suite_repo_mcp", {})
        .get("env", {})
    )
    return {
        str(key): str(value)
        for key, value in env_section.items()
        if isinstance(key, str) and value is not None
    }


def _resolve_config_path(
    explicit_config_path: str | None,
    codex_config_path: str | os.PathLike[str] | None,
    *,
    suite_env_key: str,
    legacy_env_key: str,
) -> str | None:
    if explicit_config_path:
        return explicit_config_path

    for env_key in (suite_env_key, legacy_env_key):
        env_value = os.environ.get(env_key)
        if env_value:
            return env_value

    suite_repo_env = _read_suite_repo_env(codex_config_path)
    return suite_repo_env.get(suite_env_key)


def main() -> int:
    args = build_parser().parse_args()
    config_path = _resolve_config_path(
        args.config,
        args.codex_config,
        suite_env_key="SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG",
        legacy_env_key="WATCHDOG_AUTOCAD_COLLECTOR_CONFIG",
    )
    config = load_autocad_state_collector_config(config_path=config_path)
    collector = AutoCadStateCollector(config)

    if args.once:
        result = collector.run_once()
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0

    try:
        collector.run_forever()
    except KeyboardInterrupt:
        collector.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
