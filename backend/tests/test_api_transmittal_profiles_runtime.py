from __future__ import annotations

import json
import re
import tempfile
import threading
import unittest
from pathlib import Path
from typing import Any, Dict, List

from backend.route_groups.api_transmittal_profiles_runtime import (
    create_transmittal_profiles_runtime,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message: str, *args) -> None:
        self.warnings.append((message, args))


def _is_valid_email(value: str) -> bool:
    return "@" in value and "." in value


def _build_runtime(
    *,
    config_path: Path,
    fallback_profiles: List[Dict[str, str]] | None = None,
    fallback_firms: List[str] | None = None,
    cache: Dict[str, Any] | None = None,
    logger: _LoggerStub | None = None,
    yaml_safe_load_fn=None,
):
    return create_transmittal_profiles_runtime(
        transmittal_config_path=config_path,
        transmittal_fallback_profiles=fallback_profiles
        or [
            {
                "id": "sample-engineer",
                "name": "Sample Engineer",
                "title": "Engineering Lead",
                "email": "engineer@example.com",
                "phone": "(000) 000-0000",
            }
        ],
        transmittal_fallback_firms=fallback_firms or ["TX - Firm #00000"],
        transmittal_profiles_cache=cache or {"mtime": None, "payload": None},
        transmittal_profiles_cache_lock=threading.Lock(),
        is_valid_email_fn=_is_valid_email,
        re_module=re,
        json_module=json,
        logger=logger or _LoggerStub(),
        yaml_safe_load_fn=yaml_safe_load_fn,
    )


class TestApiTransmittalProfilesRuntime(unittest.TestCase):
    def test_slugify_and_normalize_profile(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime = _build_runtime(config_path=Path(temp_dir) / "missing.json")

            self.assertEqual(
                runtime.slugify_transmittal_profile_id("  John Doe, PE  "),
                "john-doe-pe",
            )
            self.assertEqual(
                len(runtime.slugify_transmittal_profile_id("A" * 200)),
                64,
            )

            self.assertIsNone(runtime.normalize_transmittal_profile({}, 1))
            normalized = runtime.normalize_transmittal_profile(
                {
                    "name": "  Principal Engineer  ",
                    "id": " engineer id ",
                    "title": " Lead ",
                    "email": "not-an-email",
                    "phone": " 123 ",
                },
                1,
            )
            self.assertEqual(
                normalized,
                {
                    "id": "engineer-id",
                    "name": "Principal Engineer",
                    "title": "Lead",
                    "email": "",
                    "phone": "123",
                },
            )

    def test_load_payload_uses_fallback_when_config_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            runtime = _build_runtime(config_path=config_path)

            payload = runtime.load_transmittal_profiles_payload()
            self.assertEqual(payload["profiles"][0]["id"], "sample-engineer")
            self.assertEqual(payload["firm_numbers"], ["TX - Firm #00000"])
            self.assertEqual(payload["defaults"]["profile_id"], "sample-engineer")
            self.assertEqual(payload["defaults"]["firm"], "TX - Firm #00000")
            self.assertEqual(payload["source"], str(config_path))

    def test_load_payload_json_config_dedupes_and_sets_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config = {
                "business": {
                    "pe_profiles": [
                        {
                            "id": "chief",
                            "name": "Chief Engineer",
                            "title": "Lead",
                            "email": "chief@example.com",
                            "phone": "111",
                        },
                        {
                            "id": "chief",
                            "name": "Chief Engineer Backup",
                            "title": "Backup",
                            "email": "backup@example.com",
                            "phone": "222",
                        },
                        {
                            "name": "Invalid Email Person",
                            "email": "invalid-email",
                        },
                    ],
                    "firm_numbers": ["TX-1", "TX-1", " ", "TX-2"],
                },
                "ui": {
                    "default_pe": "Chief Engineer Backup",
                    "default_firm": "TX-2",
                },
            }
            config_path.write_text(json.dumps(config), encoding="utf-8")
            runtime = _build_runtime(config_path=config_path)

            payload = runtime.load_transmittal_profiles_payload()
            profiles = payload["profiles"]
            self.assertEqual([p["id"] for p in profiles], ["chief", "chief-2", "invalid-email-person"])
            self.assertEqual(profiles[2]["email"], "")
            self.assertEqual(payload["firm_numbers"], ["TX-1", "TX-2"])
            self.assertEqual(payload["defaults"]["profile_id"], "chief-2")
            self.assertEqual(payload["defaults"]["firm"], "TX-2")

    def test_load_payload_uses_cache_when_mtime_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                json.dumps(
                    {
                        "business": {"pe_profiles": [{"name": "A", "email": "a@example.com"}]},
                    }
                ),
                encoding="utf-8",
            )
            cache = {"mtime": None, "payload": None}
            runtime = _build_runtime(config_path=config_path, cache=cache)

            payload_one = runtime.load_transmittal_profiles_payload()
            payload_two = runtime.load_transmittal_profiles_payload()
            self.assertIs(payload_one, payload_two)

    def test_load_payload_falls_back_to_json_when_yaml_loader_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                json.dumps(
                    {
                        "business": {
                            "pe_profiles": [{"name": "Json Person", "email": "json@example.com"}]
                        }
                    }
                ),
                encoding="utf-8",
            )
            logger = _LoggerStub()
            runtime = _build_runtime(
                config_path=config_path,
                logger=logger,
                yaml_safe_load_fn=lambda _text: (_ for _ in ()).throw(
                    RuntimeError("yaml failed")
                ),
            )

            payload = runtime.load_transmittal_profiles_payload()
            self.assertEqual(payload["profiles"][0]["name"], "Json Person")
            self.assertEqual(len(logger.warnings), 0)


if __name__ == "__main__":
    unittest.main()
