"""
Named pipe client stub for communicating with a .NET AutoCAD automation service.

This is a local IPC client intended for Windows + pywin32.
It is not wired into any endpoints yet.
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

    def send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send a single JSON request and return the JSON response."""
        if win32file is None or win32pipe is None:
            raise RuntimeError("pywin32 is required for named pipe IPC.")

        request = json.dumps(payload, separators=(",", ":")) + "\n"
        start = time.time()

        handle = win32file.CreateFile(
            self._pipe_path(),
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0,
            None,
            win32file.OPEN_EXISTING,
            0,
            None,
        )

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
) -> Dict[str, Any]:
    request = {
        "id": f"job-{int(time.time() * 1000)}",
        "action": action,
        "payload": payload,
        "token": token,
    }
    client = DotNetPipeClient(pipe_name=pipe_name)
    return client.send_request(request)
