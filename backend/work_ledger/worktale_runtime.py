from __future__ import annotations

import json
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


def _default_recommended_actions(*, ready: bool, next_step: str | None) -> list[str]:
    if ready:
        return []
    if next_step:
        return [f"Run `{next_step}` to initialize the repository and repair hooks."]
    return ["Run `npm run worktale:bootstrap` to initialize the repository and repair hooks."]


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
        json_module: Any = json,
    ) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.logger = logger
        self.subprocess_module = subprocess_module
        self.shutil_module = shutil_module
        self.os_module = os_module
        self.socket_module = socket_module
        self.json_module = json_module

    def _read_text(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def _resolve_hook_paths(self) -> Dict[str, Path]:
        hooks_root = self.repo_root / ".git" / "hooks"
        return {
            "postCommit": hooks_root / "post-commit",
            "postCommitPs1": hooks_root / "post-commit.ps1",
            "postPush": hooks_root / "post-push",
        }

    def _is_post_commit_hook_installed(self) -> bool:
        hook_paths = self._resolve_hook_paths()
        post_commit = self._read_text(hook_paths["postCommit"]).lower()
        post_commit_ps1 = self._read_text(hook_paths["postCommitPs1"]).lower()
        return (
            "worktale post-commit hook" in post_commit
            or "worktale capture" in post_commit
            or "run-worktale-cli.mjs" in post_commit
            or "worktale post-commit hook" in post_commit_ps1
            or "worktale capture" in post_commit_ps1
            or "run-worktale-cli.mjs" in post_commit_ps1
        )

    def _is_post_push_hook_installed(self) -> bool:
        post_push = self._read_text(self._resolve_hook_paths()["postPush"]).lower()
        return (
            "worktale post-push reminder" in post_push
            or "worktale digest" in post_push
            or "worktale:digest" in post_push
            or "run-worktale-cli.mjs" in post_push
        )

    def _run_checked_command(
        self,
        command: list[str],
        *,
        cwd: Path | None = None,
    ) -> Dict[str, Any]:
        result = self._run_command(command, cwd=cwd)
        if not result["ok"]:
            raise RuntimeError(
                _excerpt(result["stderr"] or result["stdout"] or "Worktale command failed.")
            )
        return result

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

    def _resolve_node_command(self) -> str:
        node_path = self.shutil_module.which("node")
        return str(node_path or "").strip()

    def _resolve_repo_script(self, relative_path: str) -> Path:
        return (self.repo_root / relative_path).resolve()

    def _run_node_script(
        self,
        relative_path: str,
        *,
        args: list[str] | None = None,
    ) -> Dict[str, Any]:
        node_command = self._resolve_node_command()
        if not node_command:
            return {
                "ok": False,
                "returncode": -1,
                "stdout": "",
                "stderr": "node is not available on PATH.",
            }
        script_path = self._resolve_repo_script(relative_path)
        if not script_path.exists():
            return {
                "ok": False,
                "returncode": -1,
                "stdout": "",
                "stderr": f"Script not found: {script_path}",
            }
        command = [node_command, str(script_path), *(args or [])]
        return self._run_command(command, cwd=self.repo_root)

    def _check_readiness_via_scripts(self) -> Dict[str, Any] | None:
        result = self._run_node_script(
            "scripts/check-worktale-readiness.mjs",
            args=["--json"],
        )
        if not result["ok"]:
            return None
        try:
            parsed = self.json_module.loads(str(result["stdout"] or "{}"))
        except Exception:
            return None
        if not isinstance(parsed, dict):
            return None
        checks = parsed.get("checks") if isinstance(parsed.get("checks"), dict) else {}
        issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
        next_step = str(parsed.get("nextStep") or "").strip() or None
        recommended_actions = (
            parsed.get("recommendedActions")
            if isinstance(parsed.get("recommendedActions"), list)
            else _default_recommended_actions(
                ready=bool(parsed.get("ready")),
                next_step=next_step,
            )
        )
        return {
            "ready": bool(parsed.get("ready")),
            "checks": {
                **checks,
                "repoPath": str(checks.get("repoPath") or self.repo_root),
            },
            "issues": [str(item).strip() for item in issues if str(item).strip()],
            "recommendedActions": [
                str(item).strip()
                for item in recommended_actions
                if str(item).strip()
            ],
            "nextStep": next_step,
        }

    def _check_readiness_fallback(self) -> Dict[str, Any]:
        cli_path = self.shutil_module.which("worktale")
        cli_installed = bool(cli_path)
        repo_exists = self.repo_root.exists() and self.repo_root.is_dir()
        git_exists = (self.repo_root / ".git").exists()
        bootstrapped = (self.repo_root / ".worktale").exists()
        post_commit_hook_installed = self._is_post_commit_hook_installed()
        post_push_hook_installed = self._is_post_push_hook_installed()

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
            recommended_actions.append('Run `git config user.email "you@example.com"`.')
        if not bootstrapped:
            issues.append("Worktale is not bootstrapped for this repository yet.")
            recommended_actions.append(
                "Run `npm run worktale:bootstrap` to initialize the repository and install hooks."
            )
        if not post_commit_hook_installed:
            issues.append("Worktale post-commit hook is not installed for automatic commit capture.")
            recommended_actions.append(
                "Run `npm run worktale:bootstrap` to install the automatic capture hook."
            )
        if not post_push_hook_installed:
            issues.append("Worktale post-push hook is not installed for digest reminders.")
            recommended_actions.append(
                "Run `npm run worktale:bootstrap` to repair the Worktale hook set."
            )

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
                "postCommitHookInstalled": post_commit_hook_installed,
                "postPushHookInstalled": post_push_hook_installed,
            },
            "issues": issues,
            "recommendedActions": recommended_actions,
            "nextStep": "npm run worktale:bootstrap" if issues else None,
        }

    def check_readiness(self) -> Dict[str, Any]:
        script_readiness = self._check_readiness_via_scripts()
        if script_readiness is not None:
            return script_readiness
        return self._check_readiness_fallback()

    def bootstrap_hooks(self) -> Dict[str, Any]:
        readiness = self.check_readiness()
        if not readiness["checks"].get("repoExists"):
            raise RuntimeError("Repository path is unavailable.")
        if not readiness["checks"].get("gitRepository"):
            raise RuntimeError("Repository .git folder is missing.")

        bootstrap_result = self._run_node_script("scripts/bootstrap-worktale.mjs")
        if bootstrap_result["ok"]:
            after = self.check_readiness()
            return {
                "ok": True,
                "command": ["node", "scripts/bootstrap-worktale.mjs"],
                "commands": [["node", "scripts/bootstrap-worktale.mjs"]],
                "stdout": _excerpt(bootstrap_result["stdout"]),
                "stderr": _excerpt(bootstrap_result["stderr"]),
                "checks": after["checks"],
                "ready": bool(after["ready"]),
                "issues": list(after["issues"]),
                "recommendedActions": list(after["recommendedActions"]),
            }

        if not readiness["checks"].get("cliInstalled"):
            raise RuntimeError("Worktale CLI is not installed.")

        commands_run: list[list[str]] = []
        stdout_excerpt = ""
        stderr_excerpt = ""

        if not readiness["checks"].get("bootstrapped"):
            init_command = ["worktale", "init"]
            init_result = self._run_checked_command(init_command, cwd=self.repo_root)
            commands_run.append(init_command)
            stdout_excerpt = _excerpt(init_result["stdout"])
            stderr_excerpt = _excerpt(init_result["stderr"])
            readiness = self.check_readiness()

        post_commit_installed = bool(readiness["checks"].get("postCommitHookInstalled"))
        post_push_installed = bool(readiness["checks"].get("postPushHookInstalled"))
        if not post_commit_installed and not post_push_installed:
            install_command = ["worktale", "hook", "install", str(self.repo_root)]
            install_result = self._run_checked_command(install_command, cwd=self.repo_root)
            commands_run.append(install_command)
            stdout_excerpt = _excerpt(install_result["stdout"])
            stderr_excerpt = _excerpt(install_result["stderr"])
            readiness = self.check_readiness()
            post_commit_installed = bool(readiness["checks"].get("postCommitHookInstalled"))
            post_push_installed = bool(readiness["checks"].get("postPushHookInstalled"))

        if post_commit_installed != post_push_installed:
            uninstall_command = ["worktale", "hook", "uninstall", str(self.repo_root)]
            install_command = ["worktale", "hook", "install", str(self.repo_root)]
            self._run_checked_command(uninstall_command, cwd=self.repo_root)
            install_result = self._run_checked_command(install_command, cwd=self.repo_root)
            commands_run.extend([uninstall_command, install_command])
            stdout_excerpt = _excerpt(install_result["stdout"])
            stderr_excerpt = _excerpt(install_result["stderr"])

        after = self.check_readiness()
        return {
            "ok": True,
            "command": commands_run[-1] if commands_run else [],
            "commands": commands_run,
            "stdout": stdout_excerpt,
            "stderr": stderr_excerpt,
            "checks": after["checks"],
            "ready": bool(after["ready"]),
            "issues": list(after["issues"]),
            "recommendedActions": list(after["recommendedActions"]),
        }

    def publish_note(self, note_text: str) -> Dict[str, Any]:
        runner_result = self._run_node_script(
            "scripts/run-worktale-cli.mjs",
            args=["note", str(note_text or "").strip()],
        )
        if runner_result["ok"]:
            return {
                "ok": True,
                "command": ["node", "scripts/run-worktale-cli.mjs", "note", str(note_text or "").strip()],
                "returncode": int(runner_result["returncode"]),
                "stdout": _excerpt(runner_result["stdout"]),
                "stderr": _excerpt(runner_result["stderr"]),
            }

        command = ["worktale", "note", str(note_text or "").strip()]
        result = self._run_command(command, cwd=self.repo_root)
        return {
            "ok": bool(result["ok"]),
            "command": command,
            "returncode": int(result["returncode"]),
            "stdout": _excerpt(result["stdout"]),
            "stderr": _excerpt(result["stderr"]),
        }
