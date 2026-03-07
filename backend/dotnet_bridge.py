"""
Named pipe client stub for communicating with a .NET AutoCAD automation service.

This is a local IPC client intended for Windows + pywin32.
It is wired into conduit-route endpoints via backend/api_server.py.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional

if os.name == "nt":
    import win32file  # type: ignore
    import win32pipe  # type: ignore
else:
    win32file = None
    win32pipe = None


class DotNetPipeClient:
    def __init__(self, pipe_name: str = "SUITE_AUTOCAD_PIPE", timeout_ms: int = 30_000):
        if os.name != "nt":
            raise RuntimeError("Named pipes are only supported on Windows.")
        self.pipe_name = pipe_name
        self.timeout_ms = timeout_ms

    def _pipe_path(self) -> str:
        return rf"\\.\pipe\{self.pipe_name}"

    def _format_pipe_open_error(self, exc: Exception) -> str:
        error_code = None
        try:
            if getattr(exc, "args", None):
                first = exc.args[0]
                if isinstance(first, int):
                    error_code = first
        except Exception:
            error_code = None

        pipe_path = self._pipe_path()
        if error_code == 2:
            return (
                f"Named pipe '{pipe_path}' not found. "
                "Start the .NET named pipe bridge server and verify "
                "AUTOCAD_DOTNET_PIPE_NAME matches the server pipe name."
            )
        if error_code == 231:
            return (
                f"Named pipe '{pipe_path}' is busy. "
                "Wait for the current bridge request to finish and retry."
            )
        if error_code == 5:
            return (
                f"Access denied opening named pipe '{pipe_path}'. "
                "Verify process permissions and bridge token configuration."
            )
        return f"Failed to open named pipe '{pipe_path}': {exc}"

    def send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send a single JSON request and return the JSON response."""
        if win32file is None or win32pipe is None:
            raise RuntimeError("pywin32 is required for named pipe IPC.")

        request = json.dumps(payload, separators=(",", ":")) + "\n"
        start = time.time()

        try:
            handle = win32file.CreateFile(
                self._pipe_path(),
                win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                0,
                None,
                win32file.OPEN_EXISTING,
                0,
                None,
            )
        except Exception as exc:
            raise RuntimeError(self._format_pipe_open_error(exc)) from exc

        try:
            win32pipe.SetNamedPipeHandleState(
                handle,
                win32pipe.PIPE_READMODE_MESSAGE,
                None,
                None,
            )

            win32file.WriteFile(handle, request.encode("utf-8"))
            response_bytes = self._read_line(handle, start)
            return json.loads(response_bytes.decode("utf-8"))
        finally:
            try:
                win32file.CloseHandle(handle)
            except Exception:
                pass

    def _read_line(self, handle, start_time: float) -> bytes:
        buffer = b""
        while True:
            if (time.time() - start_time) * 1000 > self.timeout_ms:
                raise TimeoutError("Timed out waiting for named pipe response.")
            _, chunk = win32file.ReadFile(handle, 4096)
            if not chunk:
                time.sleep(0.01)
                continue
            buffer += chunk
            if b"\n" in buffer:
                line, _ = buffer.split(b"\n", 1)
                return line


def send_dotnet_command(
    action: str,
    payload: Dict[str, Any],
    token: Optional[str] = None,
    pipe_name: str = "SUITE_AUTOCAD_PIPE",
    timeout_ms: int = 30_000,
) -> Dict[str, Any]:
    request = {
        "id": f"job-{int(time.time() * 1000)}",
        "action": action,
        "payload": payload,
        "token": token,
    }
    client = DotNetPipeClient(pipe_name=pipe_name, timeout_ms=timeout_ms)
    return client.send_request(request)
