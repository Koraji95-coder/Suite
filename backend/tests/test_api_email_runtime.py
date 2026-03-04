from __future__ import annotations

import threading
import unittest

from backend.route_groups.api_email_runtime import create_email_runtime


class _NowStub:
    def __init__(self, value: float = 1000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


class _PerfCounterStub:
    def __init__(self, value: float = 0.01) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


class _SleepRecorder:
    def __init__(self) -> None:
        self.calls = []

    def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


class _ResponseStub:
    def __init__(self, *, status_code: int, payload: dict | None, has_content: bool = True) -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.content = b"ok" if has_content else b""

    def json(self):
        return self._payload


class _RequestsStub:
    def __init__(self, response: _ResponseStub) -> None:
        self.response = response
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.response


class _LoggerStub:
    def __init__(self) -> None:
        self.warnings = []

    def warning(self, message, *args) -> None:
        self.warnings.append((message, args))


def _build_runtime(
    *,
    now_stub: _NowStub,
    perf_counter_stub: _PerfCounterStub,
    sleep_recorder: _SleepRecorder,
    requests_stub,
    logger_stub: _LoggerStub,
    turnstile_secret: str = "",
):
    return create_email_runtime(
        now_fn=now_stub,
        perf_counter_fn=perf_counter_stub,
        sleep_fn=sleep_recorder,
        randbelow_fn=lambda _n: 0,
        requests_module=requests_stub,
        logger=logger_stub,
        is_valid_email_fn=lambda value: "@" in value,
        auth_email_window_seconds=900,
        auth_email_max_attempts=6,
        auth_email_min_interval_seconds=15,
        auth_email_block_seconds=1800,
        auth_email_ip_window_seconds=900,
        auth_email_ip_max_attempts=30,
        auth_email_ip_block_seconds=1800,
        auth_email_min_response_ms=100,
        auth_email_response_jitter_ms=0,
        auth_email_turnstile_secret=turnstile_secret,
        auth_email_turnstile_verify_url="https://challenges.cloudflare.com/turnstile/v0/siteverify",
        auth_email_turnstile_timeout_seconds=5,
        auth_email_abuse_lock=threading.Lock(),
        auth_email_window={},
        auth_email_last_attempt={},
        auth_email_blocked_until={},
        auth_email_ip_window={},
        auth_email_ip_blocked_until={},
    )


class TestApiEmailRuntime(unittest.TestCase):
    def test_email_fingerprint_and_keys(self) -> None:
        runtime = _build_runtime(
            now_stub=_NowStub(),
            perf_counter_stub=_PerfCounterStub(),
            sleep_recorder=_SleepRecorder(),
            requests_stub=_RequestsStub(_ResponseStub(status_code=200, payload={"success": True})),
            logger_stub=_LoggerStub(),
        )

        fingerprint = runtime.email_fingerprint("user@example.com", 10)
        self.assertEqual(len(fingerprint), 10)
        self.assertTrue(runtime.auth_email_key("user@example.com", "127.0.0.1").startswith("127.0.0.1:"))
        self.assertEqual(runtime.auth_email_ip_key(""), "unknown")

    def test_is_auth_email_request_allowed_respects_min_interval(self) -> None:
        now_stub = _NowStub(1000.0)
        runtime = _build_runtime(
            now_stub=now_stub,
            perf_counter_stub=_PerfCounterStub(),
            sleep_recorder=_SleepRecorder(),
            requests_stub=_RequestsStub(_ResponseStub(status_code=200, payload={"success": True})),
            logger_stub=_LoggerStub(),
        )

        allowed, reason = runtime.is_auth_email_request_allowed("user@example.com", "127.0.0.1")
        self.assertEqual((allowed, reason), (True, "ok"))

        allowed, reason = runtime.is_auth_email_request_allowed("user@example.com", "127.0.0.1")
        self.assertEqual((allowed, reason), (False, "min-interval"))

        now_stub.value = 1020.0
        allowed, reason = runtime.is_auth_email_request_allowed("user@example.com", "127.0.0.1")
        self.assertEqual((allowed, reason), (True, "ok"))

    def test_apply_auth_email_response_floor(self) -> None:
        sleep_recorder = _SleepRecorder()
        runtime = _build_runtime(
            now_stub=_NowStub(),
            perf_counter_stub=_PerfCounterStub(0.01),
            sleep_recorder=sleep_recorder,
            requests_stub=_RequestsStub(_ResponseStub(status_code=200, payload={"success": True})),
            logger_stub=_LoggerStub(),
        )

        runtime.apply_auth_email_response_floor(0.0)
        self.assertEqual(len(sleep_recorder.calls), 1)
        self.assertGreater(sleep_recorder.calls[0], 0.08)

    def test_verify_turnstile_token(self) -> None:
        requests_stub = _RequestsStub(_ResponseStub(status_code=200, payload={"success": True}))
        logger_stub = _LoggerStub()
        runtime = _build_runtime(
            now_stub=_NowStub(),
            perf_counter_stub=_PerfCounterStub(),
            sleep_recorder=_SleepRecorder(),
            requests_stub=requests_stub,
            logger_stub=logger_stub,
            turnstile_secret="secret",
        )

        self.assertTrue(runtime.verify_turnstile_token("token-1", "127.0.0.1"))
        self.assertEqual(len(requests_stub.calls), 1)

    def test_is_valid_email_delegate(self) -> None:
        runtime = _build_runtime(
            now_stub=_NowStub(),
            perf_counter_stub=_PerfCounterStub(),
            sleep_recorder=_SleepRecorder(),
            requests_stub=_RequestsStub(_ResponseStub(status_code=200, payload={"success": True})),
            logger_stub=_LoggerStub(),
        )
        self.assertTrue(runtime.is_valid_email("user@example.com"))
        self.assertFalse(runtime.is_valid_email("invalid"))


if __name__ == "__main__":
    unittest.main()
