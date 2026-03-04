from __future__ import annotations

import unittest

from backend.route_groups.api_env_parsing import create_env_parsing_runtime


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message: str, *args) -> None:
        self.warnings.append((message, args))


class _OSStub:
    def __init__(self, environ: dict[str, str]) -> None:
        self.environ = environ


def _build_runtime(environ: dict[str, str], logger: _LoggerStub | None = None):
    logger = logger or _LoggerStub()
    runtime = create_env_parsing_runtime(
        os_module=_OSStub(environ),
        logger=logger,
    )
    return runtime, logger


class TestApiEnvParsing(unittest.TestCase):
    def test_parse_csv_env(self) -> None:
        runtime, _logger = _build_runtime({"ALLOWED": " a, b , ,c "})
        self.assertEqual(runtime.parse_csv_env("ALLOWED", ["x"]), ["a", "b", "c"])
        self.assertEqual(runtime.parse_csv_env("MISSING", ["x"]), ["x"])

    def test_parse_int_env(self) -> None:
        runtime, logger = _build_runtime({"TTL": "10", "BAD": "oops"})
        self.assertEqual(runtime.parse_int_env("TTL", 5, 1), 10)
        self.assertEqual(runtime.parse_int_env("TTL", 5, 20), 20)
        self.assertEqual(runtime.parse_int_env("MISSING", 5, 1), 5)
        self.assertEqual(runtime.parse_int_env("BAD", 5, 1), 5)
        self.assertEqual(len(logger.warnings), 1)

    def test_parse_bool_env(self) -> None:
        runtime, logger = _build_runtime(
            {
                "YES": "true",
                "NO": "0",
                "INVALID": "maybe",
            }
        )
        self.assertTrue(runtime.parse_bool_env("YES", False))
        self.assertFalse(runtime.parse_bool_env("NO", True))
        self.assertTrue(runtime.parse_bool_env("MISSING", True))
        self.assertFalse(runtime.parse_bool_env("INVALID", False))
        self.assertEqual(len(logger.warnings), 1)


if __name__ == "__main__":
    unittest.main()
