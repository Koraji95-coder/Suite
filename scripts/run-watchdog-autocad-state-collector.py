from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
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
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = load_autocad_state_collector_config(config_path=args.config)
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
