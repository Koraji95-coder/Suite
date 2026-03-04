from __future__ import annotations

import unittest

from backend.route_groups.api_auth_email_support import (
    apply_auth_email_response_floor,
    auth_email_generic_response,
    verify_turnstile_token,
)


class _LoggerStub:
    def __init__(self) -> None:
        self.messages = []

    def warning(self, message, *args):
        self.messages.append((message, args))


class _ResponseStub:
    def __init__(self, status_code: int, payload=None, has_content: bool = True):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = b"x" if has_content else b""

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self, response=None, exc: Exception | None = None):
        self.response = response
        self.exc = exc
        self.calls = []

    def post(self, url, data, timeout):
        self.calls.append((url, data, timeout))
        if self.exc is not None:
            raise self.exc
        return self.response


class TestApiAuthEmailSupport(unittest.TestCase):
    def test_auth_email_generic_response(self) -> None:
        payload = auth_email_generic_response()
        self.assertEqual(
            payload,
            {
                "ok": True,
                "message": "If the email is eligible, a link has been sent.",
            },
        )

    def test_apply_response_floor_no_sleep_when_target_zero(self) -> None:
        sleep_calls = []
        apply_auth_email_response_floor(
            100.0,
            auth_email_min_response_ms=0,
            auth_email_response_jitter_ms=0,
            randbelow_fn=lambda _n: 0,
            perf_counter_fn=lambda: 100.1,
            sleep_fn=lambda seconds: sleep_calls.append(seconds),
        )
        self.assertEqual(sleep_calls, [])

    def test_apply_response_floor_sleeps_remaining_time(self) -> None:
        sleep_calls = []
        apply_auth_email_response_floor(
            10.0,
            auth_email_min_response_ms=200,
            auth_email_response_jitter_ms=0,
            randbelow_fn=lambda _n: 0,
            perf_counter_fn=lambda: 10.150,
            sleep_fn=lambda seconds: sleep_calls.append(seconds),
        )
        self.assertEqual(len(sleep_calls), 1)
        self.assertAlmostEqual(sleep_calls[0], 0.05, places=6)

    def test_apply_response_floor_uses_jitter(self) -> None:
        sleep_calls = []
        apply_auth_email_response_floor(
            20.0,
            auth_email_min_response_ms=200,
            auth_email_response_jitter_ms=100,
            randbelow_fn=lambda _n: 50,
            perf_counter_fn=lambda: 20.200,
            sleep_fn=lambda seconds: sleep_calls.append(seconds),
        )
        self.assertEqual(len(sleep_calls), 1)
        self.assertAlmostEqual(sleep_calls[0], 0.05, places=6)

    def test_verify_turnstile_token_secret_missing_allows(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub()
        ok = verify_turnstile_token(
            "token",
            "127.0.0.1",
            auth_email_turnstile_secret="",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertTrue(ok)
        self.assertEqual(requests_stub.calls, [])

    def test_verify_turnstile_token_missing_token_rejects(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub()
        ok = verify_turnstile_token(
            "",
            "127.0.0.1",
            auth_email_turnstile_secret="secret",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertFalse(ok)
        self.assertEqual(requests_stub.calls, [])

    def test_verify_turnstile_token_non_200_rejects(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(response=_ResponseStub(500, {"success": False}))
        ok = verify_turnstile_token(
            "token",
            "127.0.0.1",
            auth_email_turnstile_secret="secret",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertFalse(ok)
        self.assertEqual(len(logger.messages), 1)

    def test_verify_turnstile_token_success(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(response=_ResponseStub(200, {"success": True}))
        ok = verify_turnstile_token(
            "token",
            "127.0.0.1",
            auth_email_turnstile_secret="secret",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertTrue(ok)

    def test_verify_turnstile_token_unsuccessful_payload(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(
            response=_ResponseStub(200, {"success": False, "error-codes": ["timeout-or-duplicate"]})
        )
        ok = verify_turnstile_token(
            "token",
            "127.0.0.1",
            auth_email_turnstile_secret="secret",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertFalse(ok)
        self.assertEqual(len(logger.messages), 1)

    def test_verify_turnstile_token_exception_rejects(self) -> None:
        logger = _LoggerStub()
        requests_stub = _RequestsStub(exc=RuntimeError("network error"))
        ok = verify_turnstile_token(
            "token",
            "127.0.0.1",
            auth_email_turnstile_secret="secret",
            auth_email_turnstile_verify_url="https://verify",
            auth_email_turnstile_timeout_seconds=5,
            requests_module=requests_stub,
            logger=logger,
        )
        self.assertFalse(ok)
        self.assertEqual(len(logger.messages), 1)


if __name__ == "__main__":
    unittest.main()
