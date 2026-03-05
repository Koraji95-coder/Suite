from __future__ import annotations

import unittest
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


if __name__ == "__main__":
    unittest.main()
