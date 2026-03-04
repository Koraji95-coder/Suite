from __future__ import annotations

from typing import Any, Callable, List, Mapping


def startup_banner_lines(api_host: str, api_port: int) -> List[str]:
    return [
        "=" * 60,
        "Coordinates Grabber API Server",
        "=" * 60,
        f"Server starting on: http://{api_host}:{api_port}",
        f"Health check: http://{api_host}:{api_port}/health",
        f"Status endpoint: http://{api_host}:{api_port}/api/status",
        "",
        "Prerequisites:",
        "  - AutoCAD must be running",
        "  - A drawing must be open in AutoCAD",
        "  - React frontend should connect to localhost:5000",
        "",
        "Press Ctrl+C to stop the server",
        "=" * 60,
    ]


def initial_manager_status_lines(initial_status: Mapping[str, Any]) -> List[str]:
    lines: List[str] = []
    if initial_status["autocad_running"]:
        lines.append(f"[OK] AutoCAD detected: {initial_status['autocad_path']}")
        if initial_status["drawing_open"]:
            lines.append(f"[OK] Drawing open: {initial_status['drawing_name']}")
        else:
            lines.append("[WARN] No drawing is currently open")
    else:
        lines.append("[WARN] AutoCAD not detected - waiting for it to start...")
    lines.append("=" * 60)
    lines.append("")
    return lines


def print_startup_banner(
    api_host: str,
    api_port: int,
    *,
    print_fn: Callable[..., Any] = print,
) -> None:
    for line in startup_banner_lines(api_host, api_port):
        print_fn(line)


def print_initial_manager_status(
    initial_status: Mapping[str, Any],
    *,
    print_fn: Callable[..., Any] = print,
) -> None:
    for line in initial_manager_status_lines(initial_status):
        print_fn(line)
