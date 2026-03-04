from __future__ import annotations

import unittest

from backend.route_groups.api_agent_config import agent_broker_config_status


class TestApiAgentConfig(unittest.TestCase):
    def test_reports_missing_required_settings(self) -> None:
        status = agent_broker_config_status(
            supabase_url="",
            agent_gateway_url="",
            agent_require_webhook_secret=True,
            agent_webhook_secret="",
            supabase_jwt_secret="",
            supabase_api_key="",
            supabase_anon_key="",
            looks_like_uuid_fn=lambda _value: False,
        )
        self.assertFalse(status["ok"])
        self.assertEqual(
            status["missing"],
            ["SUPABASE_URL", "AGENT_GATEWAY_URL", "AGENT_WEBHOOK_SECRET"],
        )
        self.assertEqual(status["warnings"], [])
        self.assertTrue(status["require_webhook_secret"])

    def test_uuid_like_jwt_secret_warns(self) -> None:
        status = agent_broker_config_status(
            supabase_url="https://example.supabase.co",
            agent_gateway_url="https://agent.example.com",
            agent_require_webhook_secret=False,
            agent_webhook_secret="",
            supabase_jwt_secret="123e4567-e89b-12d3-a456-426614174000",
            supabase_api_key="service-key",
            supabase_anon_key="anon-key",
            looks_like_uuid_fn=lambda value: value.count("-") == 4 and len(value) == 36,
        )
        self.assertTrue(status["ok"])
        self.assertIn("SUPABASE_JWT_SECRET looks like a key ID", status["warnings"][0])
        self.assertFalse(status["require_webhook_secret"])

    def test_anon_key_backend_warning(self) -> None:
        status = agent_broker_config_status(
            supabase_url="https://example.supabase.co",
            agent_gateway_url="https://agent.example.com",
            agent_require_webhook_secret=False,
            agent_webhook_secret="",
            supabase_jwt_secret="",
            supabase_api_key="anon-key",
            supabase_anon_key="anon-key",
            looks_like_uuid_fn=lambda _value: False,
        )
        self.assertTrue(status["ok"])
        self.assertEqual(
            status["warnings"],
            ["Using SUPABASE_ANON_KEY for backend auth. Prefer service role key."],
        )


if __name__ == "__main__":
    unittest.main()
