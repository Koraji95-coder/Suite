from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend import dotnet_bridge


class TestDotNetBridgeContract(unittest.TestCase):
    def setUp(self) -> None:
        dotnet_bridge._AUTO_STARTED_BRIDGE_PROCESS = None
        dotnet_bridge._AUTO_STARTED_ACADE_PROCESS = None

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

    def test_named_pipe_bridge_autostart_is_disabled_by_default(self) -> None:
        with patch.dict(dotnet_bridge.os.environ, {}, clear=True):
            self.assertFalse(dotnet_bridge._named_pipe_bridge_autostart_enabled())

        with patch.dict(
            dotnet_bridge.os.environ,
            {"AUTOCAD_DOTNET_AUTOSTART_BRIDGE": "true"},
            clear=True,
        ):
            self.assertTrue(dotnet_bridge._named_pipe_bridge_autostart_enabled())

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

    def test_inprocess_acade_pipe_autostarts_autocad_and_marks_launch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            acad_exe = Path(temp_dir) / "acad.exe"
            acad_exe.write_text("", encoding="utf-8")

            captured: dict[str, object] = {}

            class _ProcessStub:
                def __init__(self) -> None:
                    self.returncode = None

                def poll(self):
                    return self.returncode

            process_stub = _ProcessStub()

            with patch.dict(
                dotnet_bridge.os.environ,
                {
                    "AUTOCAD_DOTNET_ACADE_PIPE_NAME": "SUITE_ACADE_PIPE",
                    "AUTOCAD_DOTNET_ACADE_EXE_PATH": str(acad_exe),
                },
                clear=False,
            ):
                with patch.object(
                    dotnet_bridge.subprocess,
                    "Popen",
                    side_effect=lambda *args, **kwargs: captured.update(
                        {"args": args, "kwargs": kwargs}
                    )
                    or process_stub,
                ):
                    started = dotnet_bridge._autostart_named_pipe_bridge("SUITE_ACADE_PIPE")

            self.assertTrue(started)
            command = list(captured.get("args", [()])[0])
            self.assertEqual(command[0], str(acad_exe.resolve()))
            self.assertIn("/product", command)
            self.assertIn("ACADE", command)
            launch_env = captured.get("kwargs", {}).get("env") or {}
            self.assertEqual(launch_env.get("AUTOCAD_DOTNET_ACADE_PIPE_NAME"), "SUITE_ACADE_PIPE")


if __name__ == "__main__":
    unittest.main()
