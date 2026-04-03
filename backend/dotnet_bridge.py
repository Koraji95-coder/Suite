"""
Named pipe client stub for communicating with a .NET AutoCAD automation service.

This is a local IPC client intended for Windows + pywin32.
It is wired into conduit-route endpoints via backend/api_server.py.
"""

from __future__ import annotations

import json
import logging
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

_LOG = logging.getLogger(__name__)

_AUTO_STARTED_BRIDGE_PROCESS: Optional[subprocess.Popen[Any]] = None
_AUTO_STARTED_ACADE_PROCESS: Optional[subprocess.Popen[Any]] = None
_AUTO_START_LOCK = threading.Lock()
_ACADE_PIPE_NAME_FALLBACK = "SUITE_ACADE_PIPE"


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
    return _parse_bool_env(os.environ.get("AUTOCAD_DOTNET_AUTOSTART_BRIDGE"), False)


def _resolve_inprocess_acade_pipe_name() -> str:
    return (
        (os.environ.get("AUTOCAD_DOTNET_ACADE_PIPE_NAME") or "").strip()
        or _ACADE_PIPE_NAME_FALLBACK
    )


def _is_inprocess_acade_pipe_name(pipe_name: str) -> bool:
    return pipe_name.strip().lower() == _resolve_inprocess_acade_pipe_name().lower()


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


def _resolve_acade_launch_profile_name() -> str:
    return (os.environ.get("AUTOCAD_DOTNET_ACADE_PROFILE_NAME") or "").strip() or "<<ACADE>>"


def _resolve_acade_launch_commands(pipe_name: str) -> list[tuple[list[str], str, dict[str, str]]]:
    override_path = (
        os.environ.get("AUTOCAD_DOTNET_ACADE_EXE_PATH") or ""
    ).strip().strip('"')
    profile_name = _resolve_acade_launch_profile_name()
    args_override = (os.environ.get("AUTOCAD_DOTNET_ACADE_LAUNCH_ARGS") or "").strip()
    if args_override:
        arguments = [item for item in args_override.split(" ") if item]
    else:
        arguments = [
            "/language",
            "en-US",
            "/product",
            "ACADE",
            "/p",
            profile_name,
        ]

    candidate_paths: list[Path] = []
    if override_path:
        candidate_paths.append(Path(override_path))

    install_dir = (os.environ.get("AUTOCAD_INSTALL_DIR") or "").strip().strip('"')
    if install_dir:
        candidate_paths.append(Path(install_dir) / "acad.exe")

    for candidate in (
        Path(r"C:\Program Files\Autodesk\AutoCAD 2026\acad.exe"),
        Path(r"C:\Program Files\Autodesk\AutoCAD 2025\acad.exe"),
        Path(r"C:\Program Files\Autodesk\AutoCAD 2024\acad.exe"),
    ):
        candidate_paths.append(candidate)

    commands: list[tuple[list[str], str, dict[str, str]]] = []
    seen: set[str] = set()
    for candidate_path in candidate_paths:
        try:
            normalized = str(candidate_path.resolve())
        except Exception:
            normalized = str(candidate_path)
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        if not candidate_path.exists():
            continue

        launch_env = os.environ.copy()
        launch_env["AUTOCAD_DOTNET_ACADE_PIPE_NAME"] = pipe_name
        commands.append(
            (
                [normalized, *arguments],
                str(candidate_path.parent),
                launch_env,
            )
        )

    return commands


def _autostart_inprocess_acade_host(pipe_name: str) -> bool:
    global _AUTO_STARTED_ACADE_PROCESS

    with _AUTO_START_LOCK:
        if _AUTO_STARTED_ACADE_PROCESS is not None and _AUTO_STARTED_ACADE_PROCESS.poll() is None:
            return True

        for command, cwd, launch_env in _resolve_acade_launch_commands(pipe_name):
            try:
                _LOG.info(
                    "AutoCAD in-process pipe host autostart launching (pipe=%s, command=%s, cwd=%s)",
                    pipe_name,
                    command,
                    cwd,
                )
                _AUTO_STARTED_ACADE_PROCESS = subprocess.Popen(
                    command,
                    cwd=cwd,
                    env=launch_env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=_bridge_creation_flags(),
                )
                return True
            except OSError:
                continue

    return False


def _autostart_named_pipe_bridge(pipe_name: str) -> bool:
    global _AUTO_STARTED_BRIDGE_PROCESS

    if os.name != "nt":
        return False

    if _is_inprocess_acade_pipe_name(pipe_name):
        return _autostart_inprocess_acade_host(pipe_name)

    if not _named_pipe_bridge_autostart_enabled():
        return False

    with _AUTO_START_LOCK:
        if _AUTO_STARTED_BRIDGE_PROCESS is not None and _AUTO_STARTED_BRIDGE_PROCESS.poll() is None:
            return True

        repo_root = _repo_root()
        for command in _named_pipe_bridge_launch_commands(pipe_name):
            try:
                _LOG.info(
                    "Named pipe bridge autostart launching (pipe=%s, command=%s)",
                    pipe_name,
                    command,
                )
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
        self._last_auto_started = False

    def _pipe_path(self) -> str:
        return rf"\\.\pipe\{self.pipe_name}"

    def _format_pipe_open_error(self, exc: Exception) -> str:
        error_code = _extract_pipe_error_code(exc)

        pipe_path = self._pipe_path()
        if error_code == 2:
            if _is_inprocess_acade_pipe_name(self.pipe_name):
                return (
                    f"Named pipe '{pipe_path}' not found. "
                    "Start AutoCAD/ACADE with the suite-cad-authoring host loaded, "
                    "or allow the in-process ACADE host autostart to launch it."
                )
            return (
                f"Named pipe '{pipe_path}' not found. "
                "The legacy named-pipe bridge is not started by default. "
                "Start the .NET named pipe bridge server manually for explicit diagnostics "
                "and verify AUTOCAD_DOTNET_PIPE_NAME matches the server pipe name."
            )
        if error_code == 231:
            return (
                f"Named pipe '{pipe_path}' is busy. "
                "Wait for the current bridge request to finish and retry."
            )
        if error_code == 5:
            return (
                f"Access denied opening named pipe '{pipe_path}'. "
                "Verify AutoCAD and Suite runtime are running at the same privilege level "
                "and that the in-process pipe host was installed with the updated pipe ACL configuration."
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
        self._last_auto_started = False
        try:
            return self._open_pipe_handle()
        except Exception as exc:
            if _extract_pipe_error_code(exc) != 2 or not _autostart_named_pipe_bridge(self.pipe_name):
                raise

            self._last_auto_started = True
            autostart_wait_ms = 90_000 if _is_inprocess_acade_pipe_name(self.pipe_name) else 15_000
            deadline = start_time + min(self.timeout_ms, autostart_wait_ms) / 1000.0
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
        request_id = str(
            payload.get("payload", {}).get("requestId")
            or payload.get("id")
            or "unknown"
        )
        action = str(payload.get("action") or "unknown")
        _LOG.info(
            "DotNet bridge send start (request_id=%s, action=%s, pipe=%s, timeout_ms=%s)",
            request_id,
            action,
            self.pipe_name,
            self.timeout_ms,
        )

        try:
            handle = self._connect_handle(start)
        except Exception as exc:
            _LOG.warning(
                "DotNet bridge pipe open failed (request_id=%s, action=%s, pipe=%s, detail=%s)",
                request_id,
                action,
                self.pipe_name,
                exc,
            )
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
            response = json.loads(response_bytes.decode("utf-8"))
            if (
                self._last_auto_started
                and isinstance(response, dict)
                and bool(response.get("ok"))
                and isinstance(response.get("result"), dict)
                and payload.get("action") in {"suite_acade_project_open", "suite_acade_project_create"}
            ):
                result = response.get("result") or {}
                data = result.get("data")
                if isinstance(data, dict):
                    data["acadeLaunched"] = bool(data.get("acadeLaunched")) or True
            elapsed_ms = int((time.time() - start) * 1000)
            result = response.get("result") if isinstance(response, dict) else None
            result_code = result.get("code") if isinstance(result, dict) else ""
            result_success = result.get("success") if isinstance(result, dict) else None
            trace_path = (
                ((result.get("meta") or {}).get("tracePath"))
                if isinstance(result, dict)
                else ""
            )
            _LOG.info(
                "DotNet bridge send finish (request_id=%s, action=%s, pipe=%s, elapsed_ms=%s, success=%s, code=%s, trace_path=%s)",
                request_id,
                action,
                self.pipe_name,
                elapsed_ms,
                result_success,
                result_code,
                trace_path,
            )
            return response
        finally:
            try:
                win32file.CloseHandle(handle)
            except Exception:
                pass

    def _read_line(self, handle, start_time: float) -> bytes:
        buffer = b""
        while True:
            if (time.time() - start_time) * 1000 > self.timeout_ms:
                _LOG.warning(
                    "DotNet bridge timed out waiting for pipe response (pipe=%s, timeout_ms=%s)",
                    self.pipe_name,
                    self.timeout_ms,
                )
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
