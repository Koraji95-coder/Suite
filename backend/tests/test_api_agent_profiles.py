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
        self.assertIn("gridsage", catalog)
        self.assertEqual(catalog["koro"]["model_primary"], "qwen3:14b")
        self.assertEqual(catalog["devstral"]["model_primary"], "devstral-small-2:latest")
        self.assertEqual(catalog["draftsmith"]["model_primary"], "joshuaokolo/C3Dv0:latest")
        self.assertEqual(
            catalog["gridsage"]["model_primary"],
            "ALIENTELLIGENCE/electricalengineerv2:latest",
        )
        self.assertTrue(all((entry.get("model_fallbacks") or []) == [] for entry in catalog.values()))
        self.assertEqual(logger.warnings, [])

    def test_build_catalog_applies_primary_override_and_ignores_fallback_override(self) -> None:
        logger = _LoggerStub()
        catalog = build_agent_profile_catalog(
            environ={
                "AGENT_MODEL_KORO_PRIMARY": "qwen3:14b",
                "AGENT_MODEL_KORO_FALLBACKS": "gemma3:4b, qwen2.5:7b",
            },
            logger=logger,
        )

        self.assertEqual(catalog["koro"]["model_primary"], "qwen3:14b")
        self.assertEqual(catalog["koro"]["model_fallbacks"], [])
        self.assertTrue(
            any("Ignoring deprecated fallback env override" in message for message, _ in logger.warnings)
        )

    def test_profile_listing_and_route_resolution(self) -> None:
        logger = _LoggerStub()
        catalog = build_agent_profile_catalog(environ={}, logger=logger)

        profiles = list_agent_profiles(catalog)
        self.assertGreaterEqual(len(profiles), 6)
        self.assertEqual(profiles[0]["id"], "koro")
        self.assertIn("gridsage", [str(entry.get("id") or "") for entry in profiles])
        self.assertTrue(all((entry.get("model_fallbacks") or []) == [] for entry in profiles))

        draft_route = resolve_agent_profile_route(catalog, "DRAFTSMITH")
        self.assertIsNotNone(draft_route)
        assert draft_route is not None
        self.assertEqual(draft_route["primary_model"], "joshuaokolo/C3Dv0:latest")
        self.assertEqual(draft_route["fallback_models"], [])

        gridsage_route = resolve_agent_profile_route(catalog, "gridsage")
        self.assertIsNotNone(gridsage_route)
        assert gridsage_route is not None
        self.assertEqual(
            gridsage_route["primary_model"],
            "ALIENTELLIGENCE/electricalengineerv2:latest",
        )
        self.assertEqual(gridsage_route["fallback_models"], [])

        self.assertIsNone(resolve_agent_profile_route(catalog, "missing-profile"))


if __name__ == "__main__":
    unittest.main()
