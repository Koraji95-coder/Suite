from __future__ import annotations

import hmac
import re
import unittest
from functools import wraps

from backend.route_groups.api_security_runtime import create_security_runtime


class _RequestStub:
    def __init__(self) -> None:
        self.headers = {}
        self.method = "POST"
        self.path = "/api/execute"
        self.remote_addr = "127.0.0.1"


class _LoggerStub:
    def __init__(self) -> None:
        self.info_logs = []
        self.warning_logs = []

    def info(self, message: str) -> None:
        self.info_logs.append(message)

    def warning(self, message: str) -> None:
        self.warning_logs.append(message)


def _jsonify(payload):
    return payload


def _build_runtime(
    *,
    request_obj: _RequestStub,
    logger: _LoggerStub,
    api_key: str = "test-key",
):
    return create_security_runtime(
        request_obj=request_obj,
        jsonify_fn=_jsonify,
        logger=logger,
        hmac_module=hmac,
        wraps_fn=wraps,
        api_key=api_key,
        re_module=re,
    )


class TestApiSecurityRuntime(unittest.TestCase):
    def test_is_valid_api_key(self) -> None:
        runtime = _build_runtime(
            request_obj=_RequestStub(),
            logger=_LoggerStub(),
            api_key="secret",
        )
        self.assertTrue(runtime.is_valid_api_key("secret"))
        self.assertFalse(runtime.is_valid_api_key("wrong"))
        self.assertFalse(runtime.is_valid_api_key(None))

    def test_require_api_key_missing(self) -> None:
        request_obj = _RequestStub()
        logger = _LoggerStub()
        runtime = _build_runtime(request_obj=request_obj, logger=logger)

        @runtime.require_api_key
        def endpoint():
            return {"ok": True}, 200

        response, status_code = endpoint()
        self.assertEqual(status_code, 401)
        self.assertEqual(response["code"], "AUTH_REQUIRED")
        self.assertEqual(len(logger.warning_logs), 1)

    def test_require_api_key_invalid(self) -> None:
        request_obj = _RequestStub()
        request_obj.headers["X-API-Key"] = "invalid"
        logger = _LoggerStub()
        runtime = _build_runtime(request_obj=request_obj, logger=logger, api_key="secret")

        @runtime.require_api_key
        def endpoint():
            return {"ok": True}, 200

        response, status_code = endpoint()
        self.assertEqual(status_code, 401)
        self.assertEqual(response["code"], "AUTH_INVALID")
        self.assertEqual(len(logger.warning_logs), 1)

    def test_require_api_key_valid(self) -> None:
        request_obj = _RequestStub()
        request_obj.headers["X-API-Key"] = "secret"
        logger = _LoggerStub()
        runtime = _build_runtime(request_obj=request_obj, logger=logger, api_key="secret")

        @runtime.require_api_key
        def endpoint(value: int):
            return {"value": value + 1}, 200

        response, status_code = endpoint(2)
        self.assertEqual(status_code, 200)
        self.assertEqual(response, {"value": 3})
        self.assertEqual(len(logger.warning_logs), 0)
        self.assertEqual(len(logger.info_logs), 1)

    def test_validate_layer_config(self) -> None:
        runtime = _build_runtime(request_obj=_RequestStub(), logger=_LoggerStub())
        result = runtime.validate_layer_config(
            {
                "layers": ["Layer-1", " bad<script> ", 5],
                "ref_dwg": "refs/foundation.dwg",
                "block_name": "Ref-1<script>",
                "export_excel": 1,
            }
        )
        self.assertEqual(result["layers"], ["Layer-1", "badscript"])
        self.assertEqual(result["ref_dwg"], "refs/foundation.dwg")
        self.assertEqual(result["block_name"], "Ref-1script")
        self.assertEqual(result["export_excel"], True)

    def test_validate_layer_config_rejects_invalid_ref_path(self) -> None:
        runtime = _build_runtime(request_obj=_RequestStub(), logger=_LoggerStub())
        with self.assertRaises(ValueError):
            runtime.validate_layer_config({"layers": [], "ref_dwg": "../secret.dwg"})


if __name__ == "__main__":
    unittest.main()
