from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend import dotnet_bridge


class TestDotNetBridgeContract(unittest.TestCase):
    def test_send_dotnet_command_builds_expected_request_payload(self) -> None:
        captured: dict[str, object] = {}

        class _ClientStub:
            def __init__(self, *, pipe_name: str, timeout_ms: int) -> None:
                captured["pipe_name"] = pipe_name
                captured["timeout_ms"] = timeout_ms

            def send_request(self, payload):
                captured["payload"] = payload
                return {"id": "bridge-1", "ok": True, "result": {"success": True}}

        with patch.object(dotnet_bridge, "DotNetPipeClient", _ClientStub):
            with patch.object(dotnet_bridge.time, "time", return_value=1700000000.123):
                response = dotnet_bridge.send_dotnet_command(
                    action="conduit_route_terminal_scan",
                    payload={"requestId": "req-123", "selectionOnly": True},
                    token="pipe-token",
                    pipe_name="TEST_PIPE",
                    timeout_ms=45678,
                )

        self.assertEqual(captured.get("pipe_name"), "TEST_PIPE")
        self.assertEqual(captured.get("timeout_ms"), 45678)
        payload = captured.get("payload") or {}
        self.assertEqual(payload.get("id"), "job-1700000000123")
        self.assertEqual(payload.get("action"), "conduit_route_terminal_scan")
        self.assertEqual(
            payload.get("payload"),
            {"requestId": "req-123", "selectionOnly": True},
        )
        self.assertEqual(payload.get("token"), "pipe-token")
        self.assertEqual(response.get("ok"), True)

    def test_send_dotnet_command_defaults_include_null_token(self) -> None:
        captured: dict[str, object] = {}

        class _ClientStub:
            def __init__(self, *, pipe_name: str, timeout_ms: int) -> None:
                captured["pipe_name"] = pipe_name
                captured["timeout_ms"] = timeout_ms

            def send_request(self, payload):
                captured["payload"] = payload
                return {"id": payload.get("id"), "ok": True, "result": {"success": True}}

        with patch.object(dotnet_bridge, "DotNetPipeClient", _ClientStub):
            with patch.object(dotnet_bridge.time, "time", return_value=1700000001.0):
                dotnet_bridge.send_dotnet_command(
                    action="conduit_route_obstacle_scan",
                    payload={"requestId": "req-abc"},
                )

        self.assertEqual(captured.get("pipe_name"), "SUITE_AUTOCAD_PIPE")
        self.assertEqual(captured.get("timeout_ms"), 30000)
        payload = captured.get("payload") or {}
        self.assertEqual(payload.get("token"), None)
        self.assertEqual(payload.get("action"), "conduit_route_obstacle_scan")

    def test_pipe_client_autostarts_bridge_when_pipe_is_missing(self) -> None:
        captured: dict[str, object] = {"create_calls": 0}
        handle = object()

        def create_file(*_args, **_kwargs):
            captured["create_calls"] = int(captured["create_calls"]) + 1
            if captured["create_calls"] == 1:
                raise OSError(2, "pipe missing")
            return handle

        def write_file(_handle, payload_bytes):
            captured["request_bytes"] = payload_bytes
            return 0, None

        def read_file(_handle, _size):
            return 0, b'{"id":"bridge-1","ok":true,"result":{"success":true}}\n'

        file_stub = SimpleNamespace(
            GENERIC_READ=1,
            GENERIC_WRITE=2,
            OPEN_EXISTING=3,
            CreateFile=create_file,
            WriteFile=write_file,
            ReadFile=read_file,
            CloseHandle=lambda _handle: None,
        )
        pipe_stub = SimpleNamespace(
            PIPE_READMODE_MESSAGE=4,
            SetNamedPipeHandleState=lambda *_args, **_kwargs: None,
        )

        with patch.object(dotnet_bridge, "win32file", file_stub):
            with patch.object(dotnet_bridge, "win32pipe", pipe_stub):
                with patch.object(
                    dotnet_bridge,
                    "_autostart_named_pipe_bridge",
                    return_value=True,
                ) as autostart_mock:
                    client = dotnet_bridge.DotNetPipeClient(
                        pipe_name="TEST_PIPE",
                        timeout_ms=30_000,
                    )
                    response = client.send_request({"id": "job-1", "action": "ping"})

        autostart_mock.assert_called_once_with("TEST_PIPE")
        self.assertEqual(captured.get("create_calls"), 2)
        self.assertEqual(response.get("ok"), True)
        self.assertIn(b'"action":"ping"', captured.get("request_bytes") or b"")


if __name__ == "__main__":
    unittest.main()
