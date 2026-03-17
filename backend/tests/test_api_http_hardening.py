from __future__ import annotations

import unittest

from backend.route_groups.api_http_hardening import (
    apply_security_headers,
    configure_cors,
    default_allowed_origins,
    resolve_limiter_default_limits,
    resolve_limiter_storage_runtime,
    resolve_limiter_storage_uri,
)


class _OSStub:
    def __init__(self, environ: dict[str, str]) -> None:
        self.environ = environ


class _ResponseStub:
    def __init__(self) -> None:
        self.headers = {}


class _CorsRecorder:
    def __init__(self) -> None:
        self.calls = []

    def __call__(self, *args, **kwargs) -> None:
        self.calls.append((args, kwargs))


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message: str, *args) -> None:
        self.warnings.append((message, args))


class TestApiHttpHardening(unittest.TestCase):
    def test_default_allowed_origins(self) -> None:
        origins = default_allowed_origins()
        self.assertIn("http://localhost:5173", origins)
        self.assertIn("http://127.0.0.1:3000", origins)
        self.assertEqual(len(origins), 4)

    def test_configure_cors(self) -> None:
        recorder = _CorsRecorder()
        app = object()
        configure_cors(
            app=app,
            cors_fn=recorder,
            allowed_origins=["https://example.com"],
        )
        self.assertEqual(len(recorder.calls), 1)
        args, kwargs = recorder.calls[0]
        self.assertEqual(args[0], app)
        self.assertEqual(kwargs["origins"], ["https://example.com"])
        self.assertEqual(kwargs["methods"], ["GET", "POST", "DELETE", "OPTIONS"])
        self.assertTrue(kwargs["supports_credentials"])

    def test_resolve_limiter_default_limits(self) -> None:
        limits = resolve_limiter_default_limits(
            os_module=_OSStub(
                {
                    "API_RATE_LIMIT_DAY": "500 per day",
                    "API_RATE_LIMIT_HOUR": "75 per hour",
                }
            )
        )
        self.assertEqual(limits, ["500 per day", "75 per hour"])

        limits = resolve_limiter_default_limits(os_module=_OSStub({}))
        self.assertEqual(limits, ["200 per day", "50 per hour"])

    def test_apply_security_headers(self) -> None:
        response = _ResponseStub()
        result = apply_security_headers(response)
        self.assertIs(result, response)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-XSS-Protection"], "1; mode=block")
        self.assertEqual(response.headers["Content-Security-Policy"], "default-src 'self'")
        self.assertEqual(
            response.headers["Referrer-Policy"],
            "strict-origin-when-cross-origin",
        )

    def test_resolve_limiter_storage_uri(self) -> None:
        logger = _LoggerStub()
        self.assertEqual(
            resolve_limiter_storage_uri(
                os_module=_OSStub({"API_LIMITER_STORAGE_URI": "redis://cache:6379/1"}),
                logger=logger,
                redis_probe_fn=lambda _uri, _timeout_ms: True,
            ),
            "redis://cache:6379/1",
        )
        self.assertEqual(
            resolve_limiter_storage_uri(
                os_module=_OSStub({"REDIS_URL": "redis://cache:6379/2"}),
                logger=logger,
                redis_probe_fn=lambda _uri, _timeout_ms: True,
            ),
            "redis://cache:6379/2",
        )
        self.assertEqual(
            resolve_limiter_storage_uri(
                os_module=_OSStub({}),
                logger=logger,
            ),
            "memory://",
        )
        self.assertGreaterEqual(len(logger.warnings), 1)

    def test_resolve_limiter_storage_uri_requires_shared_in_production(self) -> None:
        with self.assertRaises(RuntimeError):
            resolve_limiter_storage_uri(
                os_module=_OSStub({"API_ENV": "production"}),
                logger=_LoggerStub(),
            )

    def test_resolve_limiter_storage_uri_requires_shared_when_flag_enabled(self) -> None:
        with self.assertRaises(RuntimeError):
            resolve_limiter_storage_uri(
                os_module=_OSStub({"API_REQUIRE_SHARED_LIMITER_STORAGE": "true"}),
                logger=_LoggerStub(),
            )

    def test_resolve_limiter_storage_runtime_degrades_when_redis_unreachable(self) -> None:
        logger = _LoggerStub()
        runtime = resolve_limiter_storage_runtime(
            os_module=_OSStub(
                {
                    "API_LIMITER_STORAGE_URI": "redis://cache:6379/1",
                    "API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE": "true",
                }
            ),
            logger=logger,
            redis_probe_fn=lambda _uri, _timeout_ms: False,
        )
        self.assertEqual(runtime["storage_uri"], "memory://")
        self.assertTrue(runtime["degraded"])
        self.assertEqual(runtime["reason"], "redis_unreachable_dev_degrade")
        self.assertGreaterEqual(len(logger.warnings), 1)

    def test_resolve_limiter_storage_runtime_strict_mode_wins_over_degrade(self) -> None:
        with self.assertRaises(RuntimeError):
            resolve_limiter_storage_runtime(
                os_module=_OSStub(
                    {
                        "API_LIMITER_STORAGE_URI": "redis://cache:6379/1",
                        "API_REQUIRE_SHARED_LIMITER_STORAGE": "true",
                        "API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE": "true",
                    }
                ),
                logger=_LoggerStub(),
                redis_probe_fn=lambda _uri, _timeout_ms: False,
            )

    def test_resolve_limiter_storage_runtime_raises_when_degrade_disabled(self) -> None:
        with self.assertRaises(RuntimeError):
            resolve_limiter_storage_runtime(
                os_module=_OSStub(
                    {
                        "API_LIMITER_STORAGE_URI": "redis://cache:6379/1",
                        "API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE": "false",
                    }
                ),
                logger=_LoggerStub(),
                redis_probe_fn=lambda _uri, _timeout_ms: False,
            )

    def test_resolve_limiter_storage_runtime_uses_configured_probe_timeout(self) -> None:
        probe_calls = []

        def _probe(uri: str, timeout_ms: int) -> bool:
            probe_calls.append((uri, timeout_ms))
            return True

        runtime = resolve_limiter_storage_runtime(
            os_module=_OSStub(
                {
                    "API_LIMITER_STORAGE_URI": "redis://cache:6379/1",
                    "API_LIMITER_REDIS_PROBE_TIMEOUT_MS": "1234",
                }
            ),
            logger=_LoggerStub(),
            redis_probe_fn=_probe,
        )
        self.assertEqual(runtime["storage_uri"], "redis://cache:6379/1")
        self.assertFalse(runtime["degraded"])
        self.assertEqual(len(probe_calls), 1)
        self.assertEqual(probe_calls[0][1], 1234)


if __name__ == "__main__":
    unittest.main()
