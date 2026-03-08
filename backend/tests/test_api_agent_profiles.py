from __future__ import annotations

import unittest

from backend.route_groups.api_agent_profiles import (
    build_agent_profile_catalog,
    list_agent_profiles,
    resolve_agent_profile_route,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings: list[tuple[str, tuple[object, ...]]] = []

    def warning(self, message: str, *args: object) -> None:
        self.warnings.append((message, args))


class TestApiAgentProfiles(unittest.TestCase):
    def test_build_catalog_uses_defaults(self) -> None:
        logger = _LoggerStub()
        catalog = build_agent_profile_catalog(environ={}, logger=logger)

        self.assertIn("koro", catalog)
        self.assertIn("devstral", catalog)
        self.assertIn("draftsmith", catalog)
        self.assertEqual(catalog["devstral"]["model_primary"], "devstral-small-2:latest")
        self.assertEqual(
            catalog["draftsmith"]["model_fallbacks"],
            ["ALIENTELLIGENCE/electricalengineerv2:latest"],
        )
        self.assertEqual(logger.warnings, [])

    def test_build_catalog_applies_env_overrides(self) -> None:
        logger = _LoggerStub()
        catalog = build_agent_profile_catalog(
            environ={
                "AGENT_MODEL_KORO_PRIMARY": "qwen3:8b",
                "AGENT_MODEL_KORO_FALLBACKS": "gemma3:4b, qwen2.5:7b",
            },
            logger=logger,
        )

        self.assertEqual(catalog["koro"]["model_primary"], "qwen3:8b")
        self.assertEqual(
            catalog["koro"]["model_fallbacks"],
            ["gemma3:4b", "qwen2.5:7b"],
        )

    def test_profile_listing_and_route_resolution(self) -> None:
        logger = _LoggerStub()
        catalog = build_agent_profile_catalog(environ={}, logger=logger)

        profiles = list_agent_profiles(catalog)
        self.assertGreaterEqual(len(profiles), 5)
        self.assertEqual(profiles[0]["id"], "koro")

        route = resolve_agent_profile_route(catalog, "DRAFTSMITH")
        self.assertIsNotNone(route)
        assert route is not None
        self.assertEqual(route["primary_model"], "joshuaokolo/C3Dv0:latest")
        self.assertEqual(
            route["fallback_models"],
            ["ALIENTELLIGENCE/electricalengineerv2:latest"],
        )

        self.assertIsNone(resolve_agent_profile_route(catalog, "missing-profile"))


if __name__ == "__main__":
    unittest.main()
