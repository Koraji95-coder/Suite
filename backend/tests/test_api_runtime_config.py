from __future__ import annotations

from urllib.parse import urlparse
import unittest

from backend.route_groups.api_runtime_config import (
    AUTODRAFT_DOTNET_API_DEFAULT_URL,
    derive_default_passkey_rp_id,
    normalize_auth_passkey_provider,
    normalize_autodraft_execute_provider,
    resolve_agent_webhook_secret,
    resolve_api_key,
    resolve_autodraft_dotnet_api_url,
    resolve_auth_email_require_turnstile,
    resolve_supabase_api_key,
    resolve_supabase_url,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message: str, *args) -> None:
        self.warnings.append((message, args))


class _OSStub:
    def __init__(self, environ: dict[str, str]) -> None:
        self.environ = environ


class TestApiRuntimeConfig(unittest.TestCase):
    def test_resolve_api_key(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            resolve_api_key(
                os_module=_OSStub({"API_KEY": "x" * 20}),
                logger=logger,
            ),
            "x" * 20,
        )
        self.assertEqual(len(logger.warnings), 0)

    def test_resolve_api_key_missing(self) -> None:
        with self.assertRaises(RuntimeError):
            resolve_api_key(
                os_module=_OSStub({}),
                logger=_LoggerStub(),
            )

    def test_resolve_supabase_url(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            resolve_supabase_url(
                os_module=_OSStub({"SUPABASE_URL": "https://prod.example"}),
                logger=logger,
            ),
            "https://prod.example",
        )
        self.assertEqual(
            resolve_supabase_url(
                os_module=_OSStub({"VITE_SUPABASE_URL": "https://dev.example"}),
                logger=logger,
            ),
            "https://dev.example",
        )
        self.assertEqual(
            resolve_supabase_url(
                os_module=_OSStub({}),
                logger=logger,
            ),
            "",
        )
        self.assertGreaterEqual(len(logger.warnings), 1)

    def test_resolve_supabase_api_key(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            resolve_supabase_api_key(
                supabase_service_role_key="service",
                supabase_anon_key="anon",
                logger=logger,
            ),
            "service",
        )
        self.assertEqual(
            resolve_supabase_api_key(
                supabase_service_role_key="",
                supabase_anon_key="anon",
                logger=logger,
            ),
            "anon",
        )
        self.assertEqual(len(logger.warnings), 1)

    def test_resolve_agent_webhook_secret(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            resolve_agent_webhook_secret(
                os_module=_OSStub({"AGENT_WEBHOOK_SECRET": "prod-secret"}),
                logger=logger,
            ),
            "prod-secret",
        )
        self.assertEqual(
            resolve_agent_webhook_secret(
                os_module=_OSStub({"VITE_AGENT_WEBHOOK_SECRET": "dev-secret"}),
                logger=logger,
            ),
            "dev-secret",
        )
        self.assertEqual(
            resolve_agent_webhook_secret(
                os_module=_OSStub({}),
                logger=logger,
            ),
            "",
        )
        self.assertGreaterEqual(len(logger.warnings), 1)

    def test_normalize_auth_passkey_provider(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            normalize_auth_passkey_provider(raw_value="external", logger=logger),
            "external",
        )
        self.assertEqual(
            normalize_auth_passkey_provider(raw_value="bad", logger=logger),
            "supabase",
        )
        self.assertEqual(len(logger.warnings), 1)

    def test_normalize_autodraft_execute_provider(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            normalize_autodraft_execute_provider(raw_value="bridge", logger=logger),
            "dotnet_bridge",
        )
        self.assertEqual(
            normalize_autodraft_execute_provider(
                raw_value="dotnet_bridge_fallback_api",
                logger=logger,
            ),
            "dotnet_bridge_fallback_api",
        )
        self.assertEqual(
            normalize_autodraft_execute_provider(raw_value="api", logger=logger),
            "dotnet_api",
        )
        self.assertEqual(
            normalize_autodraft_execute_provider(raw_value="bad", logger=logger),
            "dotnet_bridge_fallback_api",
        )
        self.assertEqual(len(logger.warnings), 1)

    def test_derive_default_passkey_rp_id(self) -> None:
        result = derive_default_passkey_rp_id(
            auth_passkey_allowed_origins=[
                "not-a-url",
                "ftp://ignore.example",
                "https://app.example.com",
            ],
            urlparse_fn=urlparse,
        )
        self.assertEqual(result, "app.example.com")

    def test_resolve_auth_email_require_turnstile(self) -> None:
        self.assertTrue(
            resolve_auth_email_require_turnstile(
                os_module=_OSStub({}),
                auth_email_turnstile_secret="secret",
            )
        )
        self.assertFalse(
            resolve_auth_email_require_turnstile(
                os_module=_OSStub({}),
                auth_email_turnstile_secret="",
            )
        )
        self.assertFalse(
            resolve_auth_email_require_turnstile(
                os_module=_OSStub({"AUTH_EMAIL_REQUIRE_TURNSTILE": "false"}),
                auth_email_turnstile_secret="secret",
            )
        )

    def test_resolve_autodraft_dotnet_api_url(self) -> None:
        self.assertEqual(
            resolve_autodraft_dotnet_api_url(
                os_module=_OSStub({"AUTODRAFT_DOTNET_API_URL": "http://localhost:5009"}),
            ),
            "http://localhost:5009",
        )
        self.assertEqual(
            resolve_autodraft_dotnet_api_url(
                os_module=_OSStub({}),
            ),
            AUTODRAFT_DOTNET_API_DEFAULT_URL,
        )


if __name__ == "__main__":
    unittest.main()
