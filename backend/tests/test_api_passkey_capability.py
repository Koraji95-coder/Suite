from __future__ import annotations

import unittest

from backend.route_groups.api_passkey_capability import auth_passkey_capability


class TestApiPasskeyCapability(unittest.TestCase):
    def test_disabled_supabase_state(self) -> None:
        payload = auth_passkey_capability(
            auth_passkey_enabled=False,
            auth_passkey_provider="supabase",
            auth_passkey_external_name="External IdP",
            auth_passkey_external_discovery_url="",
            auth_passkey_external_signin_url="",
            auth_passkey_require_signed_callback=True,
            auth_passkey_callback_signing_secret="",
            webauthn_available=False,
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-key",
            auth_passkey_rp_id="example.com",
            auth_passkey_rp_name="Suite",
            webauthn_import_error="",
            normalized_auth_passkey_allowed_origins_fn=lambda: ["https://app.example.com"],
            is_valid_webauthn_rp_id_for_origin_fn=lambda _rp, _origin: True,
            normalize_absolute_http_url_fn=lambda value: value if value.startswith("http") else None,
        )

        self.assertEqual(payload["provider"], "supabase")
        self.assertEqual(payload["provider_label"], "Supabase")
        self.assertEqual(payload["rollout_state"], "disabled")
        self.assertFalse(payload["handlers_ready"])
        self.assertTrue(payload["config_ready"])
        self.assertEqual(payload["config_missing"], [])
        self.assertIn("not wired in this build yet", payload["warnings"][0])
        self.assertEqual(payload["next_step"], "Set AUTH_PASSKEY_ENABLED=true and restart backend.")

    def test_external_needs_config_with_unsigned_warning(self) -> None:
        payload = auth_passkey_capability(
            auth_passkey_enabled=True,
            auth_passkey_provider="external",
            auth_passkey_external_name="Acme Auth",
            auth_passkey_external_discovery_url="ftp://bad",
            auth_passkey_external_signin_url="not-absolute",
            auth_passkey_require_signed_callback=False,
            auth_passkey_callback_signing_secret="",
            webauthn_available=True,
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-key",
            auth_passkey_rp_id="example.com",
            auth_passkey_rp_name="Suite",
            webauthn_import_error="",
            normalized_auth_passkey_allowed_origins_fn=lambda: ["https://app.example.com"],
            is_valid_webauthn_rp_id_for_origin_fn=lambda _rp, _origin: True,
            normalize_absolute_http_url_fn=lambda value: value if value.startswith("http") else None,
        )

        self.assertEqual(payload["provider_label"], "Acme Auth")
        self.assertEqual(payload["rollout_state"], "needs-config")
        self.assertIn(
            "AUTH_PASSKEY_EXTERNAL_SIGNIN_URL (must be absolute http(s) URL)",
            payload["config_missing"],
        )
        self.assertIn(
            "AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK=false; external callback trust is reduced.",
            payload["warnings"],
        )
        self.assertIn(
            "AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL must be an absolute http(s) URL.",
            payload["warnings"],
        )
        self.assertIn("External provider redirect flow is enabled when configured.", payload["warnings"])
        self.assertIn("Set missing passkey config:", payload["next_step"])

    def test_external_ready_state(self) -> None:
        payload = auth_passkey_capability(
            auth_passkey_enabled=True,
            auth_passkey_provider="external",
            auth_passkey_external_name="Acme Auth",
            auth_passkey_external_discovery_url="https://idp.example.com/.well-known/openid-configuration",
            auth_passkey_external_signin_url="https://idp.example.com/signin",
            auth_passkey_require_signed_callback=True,
            auth_passkey_callback_signing_secret="secret",
            webauthn_available=True,
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-key",
            auth_passkey_rp_id="example.com",
            auth_passkey_rp_name="Suite",
            webauthn_import_error="",
            normalized_auth_passkey_allowed_origins_fn=lambda: ["https://app.example.com"],
            is_valid_webauthn_rp_id_for_origin_fn=lambda _rp, _origin: True,
            normalize_absolute_http_url_fn=lambda value: value if value.startswith("http") else None,
        )

        self.assertTrue(payload["config_ready"])
        self.assertEqual(payload["rollout_state"], "ready")
        self.assertTrue(payload["handlers_ready"])
        self.assertEqual(payload["next_step"], "External provider passkey start handlers are ready.")

    def test_first_party_missing_config_and_import_warning(self) -> None:
        payload = auth_passkey_capability(
            auth_passkey_enabled=True,
            auth_passkey_provider="first-party",
            auth_passkey_external_name="External IdP",
            auth_passkey_external_discovery_url="",
            auth_passkey_external_signin_url="",
            auth_passkey_require_signed_callback=True,
            auth_passkey_callback_signing_secret="",
            webauthn_available=False,
            supabase_url="",
            supabase_service_role_key="",
            auth_passkey_rp_id="",
            auth_passkey_rp_name="",
            webauthn_import_error="missing package",
            normalized_auth_passkey_allowed_origins_fn=lambda: [],
            is_valid_webauthn_rp_id_for_origin_fn=lambda _rp, _origin: True,
            normalize_absolute_http_url_fn=lambda value: value if value.startswith("http") else None,
        )

        self.assertEqual(payload["provider_label"], "Suite First-Party WebAuthn")
        self.assertEqual(payload["rollout_state"], "needs-config")
        self.assertIn("python package webauthn", payload["config_missing"])
        self.assertIn("SUPABASE_URL", payload["config_missing"])
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", payload["config_missing"])
        self.assertIn("AUTH_PASSKEY_RP_ID", payload["config_missing"])
        self.assertIn("AUTH_PASSKEY_RP_NAME", payload["config_missing"])
        self.assertIn("AUTH_PASSKEY_ALLOWED_ORIGINS", payload["config_missing"])
        self.assertIn("WebAuthn import warning: missing package", payload["warnings"])
        self.assertIn(
            "First-party passkey flow is active; keep AUTH_PASSKEY_ALLOWED_ORIGINS restricted to trusted app origins.",
            payload["warnings"],
        )


if __name__ == "__main__":
    unittest.main()
