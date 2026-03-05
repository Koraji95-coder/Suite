from __future__ import annotations

import json
import unittest

from backend.route_groups.api_websocket_status import (
    websocket_connected_payload,
    websocket_status_bridge,
    websocket_status_payload,
)


class _RequestStub:
    def __init__(
        self,
        *,
        args: dict[str, str],
        remote_addr: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.args = args
        self.remote_addr = remote_addr
        self.headers = headers or {}


class _LoggerStub:
    def __init__(self) -> None:
        self.warning_calls = []
        self.info_calls = []

    def warning(self, message, *args) -> None:
        self.warning_calls.append((message, args))

    def info(self, message, *args) -> None:
        self.info_calls.append((message, args))


class _WsStub:
    def __init__(self, *, receive_result=None, receive_exc: Exception | None = None) -> None:
        self.sent = []
        self.closed = False
        self.receive_result = receive_result
        self.receive_exc = receive_exc
        self.receive_calls = []

    def send(self, payload: str) -> None:
        self.sent.append(payload)

    def close(self) -> None:
        self.closed = True

    def receive(self, timeout: float):
        self.receive_calls.append(timeout)
        if self.receive_exc is not None:
            raise self.receive_exc
        return self.receive_result


class _ManagerStub:
    def __init__(self, status: dict) -> None:
        self.status = status
        self.calls = []

    def get_status(self, *, force_refresh: bool):
        self.calls.append(force_refresh)
        return self.status


class _TimeStub:
    def __init__(self, times: list[float]) -> None:
        self._times = list(times)
        self.sleep_calls = []

    def time(self) -> float:
        if self._times:
            return self._times.pop(0)
        return 0.0

    def sleep(self, seconds: float) -> None:
        self.sleep_calls.append(seconds)


class TestApiWebsocketStatus(unittest.TestCase):
    def test_websocket_connected_payload(self) -> None:
        payload = websocket_connected_payload(
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            timestamp=1700000000.0,
        )
        self.assertEqual(payload["type"], "connected")
        self.assertEqual(payload["backend_id"], "coordinates-grabber-api")
        self.assertEqual(payload["backend_version"], "1.0.0")
        self.assertEqual(payload["timestamp"], 1700000000.0)

    def test_websocket_status_payload_normalizes_shape(self) -> None:
        payload = websocket_status_payload(
            {
                "connected": 1,
                "autocad_running": "",
                "drawing_open": True,
                "drawing_name": "demo.dwg",
                "error": None,
            },
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            timestamp=1700000001.0,
        )
        self.assertEqual(payload["type"], "status")
        self.assertTrue(payload["connected"])
        self.assertFalse(payload["autocad_running"])
        self.assertTrue(payload["drawing_open"])
        self.assertEqual(payload["checks"], {})

    def test_websocket_status_bridge_rejects_invalid_api_key(self) -> None:
        ws = _WsStub()
        logger = _LoggerStub()
        request_obj = _RequestStub(args={"api_key": "bad"}, remote_addr="127.0.0.1")

        websocket_status_bridge(
            ws,
            request_obj=request_obj,
            is_valid_api_key_fn=lambda _provided: False,
            logger=logger,
            get_manager=lambda: _ManagerStub({}),
            json_module=json,
            time_module=_TimeStub([1.0]),
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
        )

        self.assertTrue(ws.closed)
        self.assertEqual(len(ws.sent), 1)
        payload = json.loads(ws.sent[0])
        self.assertEqual(payload["type"], "error")
        self.assertEqual(payload["code"], "AUTH_INVALID")
        self.assertEqual(len(logger.warning_calls), 1)

    def test_websocket_status_bridge_emits_connected_and_status(self) -> None:
        ws = _WsStub(receive_result=None)
        logger = _LoggerStub()
        manager = _ManagerStub(
            {
                "connected": True,
                "autocad_running": True,
                "drawing_open": True,
                "drawing_name": "demo.dwg",
                "error": None,
                "checks": {"acad": "ok"},
            }
        )
        time_stub = _TimeStub([10.0, 11.0])

        websocket_status_bridge(
            ws,
            request_obj=_RequestStub(args={"api_key": "good"}, remote_addr="127.0.0.1"),
            is_valid_api_key_fn=lambda _provided: True,
            logger=logger,
            get_manager=lambda: manager,
            json_module=json,
            time_module=time_stub,
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            max_iterations=1,
        )

        self.assertEqual(len(ws.sent), 2)
        connected = json.loads(ws.sent[0])
        status = json.loads(ws.sent[1])
        self.assertEqual(connected["type"], "connected")
        self.assertEqual(status["type"], "status")
        self.assertEqual(status["drawing_name"], "demo.dwg")
        self.assertEqual(manager.calls, [True])
        self.assertEqual(time_stub.sleep_calls, [])
        self.assertEqual(len(logger.info_calls), 1)

    def test_websocket_status_bridge_tolerates_receive_exception(self) -> None:
        ws = _WsStub(receive_exc=RuntimeError("disconnect"))
        logger = _LoggerStub()
        manager = _ManagerStub({"connected": False, "autocad_running": False, "drawing_open": False})

        websocket_status_bridge(
            ws,
            request_obj=_RequestStub(args={"api_key": "good"}, remote_addr="127.0.0.1"),
            is_valid_api_key_fn=lambda _provided: True,
            logger=logger,
            get_manager=lambda: manager,
            json_module=json,
            time_module=_TimeStub([1.0, 2.0]),
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            max_iterations=1,
        )

        self.assertEqual(len(ws.sent), 2)
        self.assertEqual(manager.calls, [True])

    def test_websocket_status_bridge_accepts_api_key_from_subprotocol(self) -> None:
        ws = _WsStub(receive_result=None)
        logger = _LoggerStub()
        manager = _ManagerStub({"connected": True, "autocad_running": True, "drawing_open": True})

        websocket_status_bridge(
            ws,
            request_obj=_RequestStub(
                args={},
                remote_addr="127.0.0.1",
                headers={"Sec-WebSocket-Protocol": "api-key.Z29vZA"},
            ),
            is_valid_api_key_fn=lambda provided: provided == "good",
            logger=logger,
            get_manager=lambda: manager,
            json_module=json,
            time_module=_TimeStub([1.0, 2.0]),
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            max_iterations=1,
        )

        self.assertEqual(len(ws.sent), 2)
        self.assertEqual(manager.calls, [True])

    def test_websocket_status_bridge_accepts_ticket_auth_without_api_key(self) -> None:
        ws = _WsStub(receive_result=None)
        logger = _LoggerStub()
        manager = _ManagerStub({"connected": True, "autocad_running": True, "drawing_open": True})
        consumed = []

        def consume_ticket(ticket: str, remote_addr: str) -> tuple[bool, str]:
            consumed.append((ticket, remote_addr))
            return ticket == "ticket-good", "ok"

        websocket_status_bridge(
            ws,
            request_obj=_RequestStub(
                args={"ticket": "ticket-good"},
                remote_addr="127.0.0.1",
            ),
            is_valid_api_key_fn=lambda _provided: False,
            consume_ws_ticket_fn=consume_ticket,
            allow_api_key_fallback=False,
            logger=logger,
            get_manager=lambda: manager,
            json_module=json,
            time_module=_TimeStub([1.0, 2.0]),
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
            max_iterations=1,
        )

        self.assertEqual(consumed, [("ticket-good", "127.0.0.1")])
        self.assertEqual(len(ws.sent), 2)
        self.assertEqual(manager.calls, [True])

    def test_websocket_status_bridge_rejects_invalid_ticket_when_fallback_disabled(self) -> None:
        ws = _WsStub(receive_result=None)
        logger = _LoggerStub()

        websocket_status_bridge(
            ws,
            request_obj=_RequestStub(
                args={"ticket": "ticket-bad"},
                remote_addr="127.0.0.1",
            ),
            is_valid_api_key_fn=lambda _provided: False,
            consume_ws_ticket_fn=lambda _ticket, _remote: (False, "missing_or_used"),
            allow_api_key_fallback=False,
            logger=logger,
            get_manager=lambda: _ManagerStub({}),
            json_module=json,
            time_module=_TimeStub([1.0]),
            backend_id="coordinates-grabber-api",
            backend_version="1.0.0",
        )

        self.assertTrue(ws.closed)
        self.assertEqual(len(ws.sent), 1)
        payload = json.loads(ws.sent[0])
        self.assertEqual(payload["code"], "AUTH_INVALID")
        self.assertTrue(logger.warning_calls)


if __name__ == "__main__":
    unittest.main()
