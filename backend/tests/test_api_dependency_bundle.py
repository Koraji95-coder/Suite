from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
