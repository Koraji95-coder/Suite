from __future__ import annotations

import unittest
from pathlib import Path

from backend.route_groups.api_dependency_bundle import (
    AGENT_DEP_KEYS,
    PASSKEY_DEP_KEYS,
    TRANSMITTAL_RENDER_DEP_KEYS,
    build_agent_deps,
    build_passkey_deps,
    build_transmittal_render_deps,
)


def _build_namespace(keys):
    return {key: object() for key in keys}


class TestApiDependencyBundle(unittest.TestCase):
    def test_build_passkey_deps(self) -> None:
        namespace = _build_namespace(PASSKEY_DEP_KEYS)
        deps = build_passkey_deps(namespace)
        self.assertEqual(set(deps.keys()), set(PASSKEY_DEP_KEYS))
        for key in PASSKEY_DEP_KEYS:
            self.assertIs(deps[key], namespace[key])

    def test_build_agent_deps(self) -> None:
        namespace = _build_namespace(AGENT_DEP_KEYS)
        deps = build_agent_deps(namespace)
        self.assertEqual(set(deps.keys()), set(AGENT_DEP_KEYS))
        for key in AGENT_DEP_KEYS:
            self.assertIs(deps[key], namespace[key])

    def test_build_transmittal_render_deps(self) -> None:
        namespace = _build_namespace(TRANSMITTAL_RENDER_DEP_KEYS)
        deps = build_transmittal_render_deps(namespace)
        self.assertEqual(set(deps.keys()), set(TRANSMITTAL_RENDER_DEP_KEYS))
        for key in TRANSMITTAL_RENDER_DEP_KEYS:
            self.assertIs(deps[key], namespace[key])

    def test_missing_key_raises(self) -> None:
        with self.assertRaises(KeyError):
            build_passkey_deps({})
        with self.assertRaises(KeyError):
            build_agent_deps({})
        with self.assertRaises(KeyError):
            build_transmittal_render_deps({})

    def test_api_server_agent_dependency_namespace_ready_before_registration(self) -> None:
        api_server_path = Path(__file__).resolve().parents[1] / "api_server.py"
        lines = api_server_path.read_text(encoding="utf-8").splitlines()

        register_line = next(
            (
                index + 1
                for index, line in enumerate(lines)
                if "register_route_groups(" in line
            ),
            None,
        )
        self.assertIsNotNone(register_line)
        assert register_line is not None

        for key in AGENT_DEP_KEYS:
            key_line = next(
                (
                    index + 1
                    for index, line in enumerate(lines)
                    if key in line
                ),
                None,
            )
            self.assertIsNotNone(key_line, f"Missing key reference in api_server.py: {key}")
            assert key_line is not None
            self.assertLess(
                key_line,
                register_line,
                f"Dependency key appears after route registration: {key}",
            )

        self.assertTrue(
            any(
                "AGENT_DEP_KEYS_MISSING_BEFORE_REGISTRATION" in line
                for line in lines
            ),
            "api_server.py should guard missing AGENT_DEP_KEYS before route registration.",
        )


if __name__ == "__main__":
    unittest.main()
