"""
Named pipe client stub for communicating with a .NET AutoCAD automation service.

This is a local IPC client intended for Windows + pywin32.
It is wired into conduit-route endpoints via backend/api_server.py.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

if os.name == "nt":
    import win32file  # type: ignore
    import win32pipe  # type: ignore
else:
    win32file = None
    win32pipe = None


_AUTO_STARTED_BRIDGE_PROCESS: Optional[subprocess.Popen[Any]] = None
_AUTO_START_LOCK = threading.Lock()


def _parse_bool_env(value: Optional[str], fallback: bool) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return fallback
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def _extract_pipe_error_code(exc: Exception) -> Optional[int]:
    try:
        if getattr(exc, "args", None):
            first = exc.args[0]
            if isinstance(first, int):
                return first
    except Exception:
        return None
    return None


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _named_pipe_bridge_autostart_enabled() -> bool:
    return _parse_bool_env(os.environ.get("AUTOCAD_DOTNET_AUTOSTART_BRIDGE"), True)


def _bridge_creation_flags() -> int:
    flags = 0
    for name in ("CREATE_NEW_PROCESS_GROUP", "DETACHED_PROCESS", "CREATE_NO_WINDOW"):
        flags |= int(getattr(subprocess, name, 0) or 0)
    return flags


def _named_pipe_bridge_launch_commands(pipe_name: str) -> list[list[str]]:
    override_path = (os.environ.get("AUTOCAD_DOTNET_BRIDGE_EXE_PATH") or "").strip().strip('"')
    commands: list[list[str]] = []
    if override_path:
        commands.append([override_path, pipe_name])

    repo_root = _repo_root()
    exe_candidates = [
        repo_root / "dotnet" / "named-pipe-bridge" / "bin" / "Debug" / "net8.0" / "NamedPipeServer.exe",
        repo_root / "dotnet" / "named-pipe-bridge" / "bin" / "Release" / "net8.0" / "NamedPipeServer.exe",
    ]
    for exe_path in sorted(
        (path for path in exe_candidates if path.exists()),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ):
        commands.append([str(exe_path), pipe_name])

    project_path = repo_root / "dotnet" / "named-pipe-bridge" / "NamedPipeServer.csproj"
    if project_path.exists() and shutil.which("dotnet"):
        commands.append(
            [
                "dotnet",
                "run",
                "--project",
                str(project_path),
                "--",
                pipe_name,
            ]
        )

    return commands


def _autostart_named_pipe_bridge(pipe_name: str) -> bool:
    global _AUTO_STARTED_BRIDGE_PROCESS

    if os.name != "nt" or not _named_pipe_bridge_autostart_enabled():
        return False

    with _AUTO_START_LOCK:
        if _AUTO_STARTED_BRIDGE_PROCESS is not None and _AUTO_STARTED_BRIDGE_PROCESS.poll() is None:
            return True

        repo_root = _repo_root()
        for command in _named_pipe_bridge_launch_commands(pipe_name):
            try:
                _AUTO_STARTED_BRIDGE_PROCESS = subprocess.Popen(
                    command,
                    cwd=str(repo_root),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=_bridge_creation_flags(),
                )
                return True
            except OSError:
                continue

    return False


class DotNetPipeClient:
    def __init__(self, pipe_name: str = "SUITE_AUTOCAD_PIPE", timeout_ms: int = 30_000):
        if os.name != "nt":
            raise RuntimeError("Named pipes are only supported on Windows.")
        self.pipe_name = pipe_name
        self.timeout_ms = timeout_ms

    def _pipe_path(self) -> str:
        return rf"\\.\pipe\{self.pipe_name}"

    def _format_pipe_open_error(self, exc: Exception) -> str:
        error_code = _extract_pipe_error_code(exc)

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

    def _open_pipe_handle(self):
        return win32file.CreateFile(
            self._pipe_path(),
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0,
            None,
            win32file.OPEN_EXISTING,
            0,
            None,
        )

    def _connect_handle(self, start_time: float):
        try:
            return self._open_pipe_handle()
        except Exception as exc:
            if _extract_pipe_error_code(exc) != 2 or not _autostart_named_pipe_bridge(self.pipe_name):
                raise

            deadline = start_time + min(self.timeout_ms, 15_000) / 1000.0
            last_error = exc
            while time.time() < deadline:
                time.sleep(0.25)
                try:
                    return self._open_pipe_handle()
                except Exception as retry_exc:
                    last_error = retry_exc
                    error_code = _extract_pipe_error_code(retry_exc)
                    if error_code in {2, 231}:
                        continue
                    raise
            raise last_error

    def send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send a single JSON request and return the JSON response."""
        if win32file is None or win32pipe is None:
            raise RuntimeError("pywin32 is required for named pipe IPC.")

        request = json.dumps(payload, separators=(",", ":")) + "\n"
        start = time.time()

        try:
            handle = self._connect_handle(start)
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
