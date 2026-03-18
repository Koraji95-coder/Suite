from __future__ import annotations

import os
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Any, Dict


def _excerpt(value: Any, *, max_length: int = 1200) -> str:
    text = str(value or "").strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 3]}..."


class WorktaleRuntime:
    def __init__(
        self,
        *,
        repo_root: Path,
        logger: Any,
        subprocess_module: Any = subprocess,
        shutil_module: Any = shutil,
        os_module: Any = os,
        socket_module: Any = socket,
    ) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.logger = logger
        self.subprocess_module = subprocess_module
        self.shutil_module = shutil_module
        self.os_module = os_module
        self.socket_module = socket_module

    def resolve_workstation_id(self) -> str:
        configured = str(self.os_module.environ.get("SUITE_WORKSTATION_ID") or "").strip()
        if configured:
            return configured
        computer_name = str(self.os_module.environ.get("COMPUTERNAME") or "").strip()
        if computer_name:
            return computer_name
        return str(self.socket_module.gethostname() or "unknown-workstation").strip()

    def _run_command(
        self,
        command: list[str],
        *,
        cwd: Path | None = None,
    ) -> Dict[str, Any]:
        try:
            completed = self.subprocess_module.run(
                command,
                cwd=str(cwd or self.repo_root),
                capture_output=True,
                text=True,
                check=False,
                shell=False,
            )
        except Exception as exc:
            return {
                "ok": False,
                "returncode": -1,
                "stdout": "",
                "stderr": str(exc),
            }
        return {
            "ok": int(completed.returncode or 0) == 0,
            "returncode": int(completed.returncode or 0),
            "stdout": str(completed.stdout or ""),
            "stderr": str(completed.stderr or ""),
        }

    def check_readiness(self) -> Dict[str, Any]:
        cli_path = self.shutil_module.which("worktale")
        cli_installed = bool(cli_path)
        repo_exists = self.repo_root.exists() and self.repo_root.is_dir()
        git_exists = (self.repo_root / ".git").exists()
        bootstrapped = (self.repo_root / ".worktale").exists()

        git_email = ""
        git_email_configured = False
        if repo_exists and git_exists:
            git_check = self._run_command(["git", "config", "user.email"])
            if git_check["ok"]:
                git_email = str(git_check["stdout"] or "").strip()
                git_email_configured = bool(git_email)

        issues: list[str] = []
        recommended_actions: list[str] = []
        if not cli_installed:
            issues.append("Worktale CLI is not installed on this workstation.")
            recommended_actions.append("Install Worktale CLI and ensure `worktale` is in PATH.")
        if not repo_exists:
            issues.append("Repository path is not available on this workstation.")
            recommended_actions.append("Verify repository path and restart the backend.")
        if repo_exists and not git_exists:
            issues.append("Repository `.git` folder was not found.")
            recommended_actions.append("Ensure publish runs from a Git repository root.")
        if not git_email_configured:
            issues.append("Git user email is not configured.")
            recommended_actions.append("Run `git config user.email \"you@example.com\"`.")
        if not bootstrapped:
            issues.append("Worktale is not bootstrapped for this repository yet.")
            recommended_actions.append("Run bootstrap to install Worktale hook metadata.")

        return {
            "ready": len(issues) == 0,
            "checks": {
                "cliInstalled": cli_installed,
                "cliPath": str(cli_path or ""),
                "repoPath": str(self.repo_root),
                "repoExists": repo_exists,
                "gitRepository": git_exists,
                "gitEmailConfigured": git_email_configured,
                "gitEmail": git_email,
                "bootstrapped": bootstrapped,
            },
            "issues": issues,
            "recommendedActions": recommended_actions,
        }

    def bootstrap_hooks(self) -> Dict[str, Any]:
        readiness = self.check_readiness()
        if not readiness["checks"]["cliInstalled"]:
            raise RuntimeError("Worktale CLI is not installed.")
        if not readiness["checks"]["repoExists"]:
            raise RuntimeError("Repository path is unavailable.")
        if not readiness["checks"]["gitRepository"]:
            raise RuntimeError("Repository .git folder is missing.")

        command = ["worktale", "hook", "install", str(self.repo_root)]
        result = self._run_command(command, cwd=self.repo_root)
        after = self.check_readiness()
        if not result["ok"]:
            raise RuntimeError(
                _excerpt(result["stderr"] or result["stdout"] or "Worktale bootstrap failed.")
            )
        return {
            "ok": True,
            "command": command,
            "stdout": _excerpt(result["stdout"]),
            "stderr": _excerpt(result["stderr"]),
            "checks": after["checks"],
            "ready": bool(after["ready"]),
            "issues": list(after["issues"]),
            "recommendedActions": list(after["recommendedActions"]),
        }

    def publish_note(self, note_text: str) -> Dict[str, Any]:
        command = ["worktale", "note", str(note_text or "").strip()]
        result = self._run_command(command, cwd=self.repo_root)
        return {
            "ok": bool(result["ok"]),
            "command": command,
            "returncode": int(result["returncode"]),
            "stdout": _excerpt(result["stdout"]),
            "stderr": _excerpt(result["stderr"]),
        }
