from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _short_commit_ref(value: str) -> str:
    normalized = _safe_text(value)
    return normalized[:8] if normalized else ""


def _stable_suggestion_id(source_key: str) -> str:
    digest = hashlib.sha256(source_key.encode("utf-8")).hexdigest()
    return f"suggest-{digest[:16]}"


def _basename_from_path(value: str) -> str:
    normalized = _safe_text(value).replace("\\", "/").rstrip("/")
    if not normalized:
        return ""
    return normalized.rsplit("/", 1)[-1]


def _truncate(value: str, limit: int = 160) -> str:
    normalized = _safe_text(value)
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(0, limit - 1)].rstrip()}..."


def _format_duration_ms(duration_ms: Any) -> str:
    try:
        total_minutes = max(1, round(int(duration_ms or 0) / 60000))
    except Exception:
        return "0m"
    if total_minutes < 60:
        return f"{total_minutes}m"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if minutes:
        return f"{hours}h {minutes}m"
    return f"{hours}h"


def _guess_app_area(paths: Sequence[str]) -> Optional[str]:
    for raw_path in paths:
        path_value = _safe_text(raw_path).replace("\\", "/")
        if not path_value:
            continue
        match = re.match(r"src/features/([^/]+)/", path_value)
        if match:
            return match.group(1)
        match = re.match(r"src/components/system/([^/]+)/", path_value)
        if match:
            return match.group(1)
        match = re.match(r"src/services/([^/]+)", path_value)
        if match:
            return match.group(1)
        match = re.match(r"backend/([^/]+)/", path_value)
        if match:
            return match.group(1)
        match = re.match(r"src/routes/([^/]+)/", path_value)
        if match:
            return match.group(1)
    return None


class WorkLedgerSuggestionBuilder:
    def __init__(
        self,
        *,
        repo_root: Path,
        logger: Any,
        subprocess_module: Any,
        watchdog_service: Any = None,
    ) -> None:
        self.repo_root = Path(repo_root).expanduser().resolve()
        self.logger = logger
        self.subprocess = subprocess_module
        self.watchdog_service = watchdog_service

    def _run_git_command(self, command: Sequence[str]) -> str:
        completed = self.subprocess.run(
            list(command),
            cwd=str(self.repo_root),
            capture_output=True,
            text=True,
            check=False,
            shell=False,
        )
        raw_returncode = getattr(completed, "returncode", 1)
        returncode = int(raw_returncode) if raw_returncode is not None else 1
        if returncode != 0:
            stderr = _safe_text(getattr(completed, "stderr", ""))
            raise RuntimeError(stderr or "Git command failed.")
        return str(getattr(completed, "stdout", "") or "")

    @staticmethod
    def _collect_existing_markers(
        entries: Iterable[Mapping[str, Any]],
    ) -> Tuple[Set[str], Set[str]]:
        refs: Set[str] = set()
        commits: Set[str] = set()
        for entry in entries:
            external_reference = _safe_text(entry.get("external_reference"))
            if external_reference:
                refs.add(external_reference)
            for commit_ref in entry.get("commit_refs") or []:
                normalized = _safe_text(commit_ref)
                if not normalized:
                    continue
                commits.add(normalized)
                short_ref = _short_commit_ref(normalized)
                if short_ref:
                    commits.add(short_ref)
        return refs, commits

    def _build_git_suggestions(
        self,
        *,
        existing_refs: Set[str],
        existing_commits: Set[str],
        limit: int,
    ) -> List[Dict[str, Any]]:
        try:
            raw_log = self._run_git_command(
                [
                    "git",
                    "log",
                    f"-n{max(6, limit * 2)}",
                    "--pretty=format:%H%x1f%s%x1f%cI",
                ]
            )
        except Exception as exc:
            self.logger.warning("Unable to generate git work ledger suggestions: %s", exc)
            return []

        suggestions: List[Dict[str, Any]] = []
        for line in raw_log.splitlines():
            commit_hash, subject, committed_at = (
                [segment.strip() for segment in line.split("\x1f", 2)]
                + ["", "", ""]
            )[:3]
            short_ref = _short_commit_ref(commit_hash)
            source_key = f"git:{commit_hash}"
            external_reference = f"suggestion:{source_key}"
            if (
                not commit_hash
                or external_reference in existing_refs
                or commit_hash in existing_commits
                or short_ref in existing_commits
            ):
                continue

            try:
                raw_paths = self._run_git_command(
                    [
                        "git",
                        "show",
                        "--name-only",
                        "--pretty=format:",
                        "--no-renames",
                        commit_hash,
                    ]
                )
            except Exception:
                raw_paths = ""

            paths = [
                path.strip()
                for path in raw_paths.splitlines()
                if path.strip()
                and not path.strip().startswith("backups/")
                and path.strip() != "env"
            ]
            app_area = _guess_app_area(paths)
            path_preview = ", ".join(paths[:3])
            path_summary = (
                f" Affected paths: {path_preview}."
                if path_preview
                else " Review the commit diff and promote it if it reflects a meaningful milestone."
            )
            suggestions.append(
                {
                    "suggestionId": _stable_suggestion_id(source_key),
                    "sourceKey": source_key,
                    "sourceKind": "git_checkpoint",
                    "title": _truncate(subject or f"Git checkpoint {short_ref}", 96),
                    "summary": _truncate(
                        f"Git checkpoint from repo history.{path_summary}", 260
                    ),
                    "commitRefs": [short_ref] if short_ref else [],
                    "projectId": None,
                    "appArea": app_area,
                    "architecturePaths": paths[:4],
                    "hotspotIds": [_safe_text(paths[0])] if paths else [],
                    "lifecycleState": "completed",
                    "publishState": "draft",
                    "externalReference": external_reference,
                    "createdAt": committed_at or "",
                    "details": {
                        "subject": subject,
                        "pathCount": len(paths),
                    },
                }
            )
            if len(suggestions) >= limit:
                break
        return suggestions

    def _build_watchdog_suggestions(
        self,
        *,
        user_id: str,
        existing_refs: Set[str],
        limit: int,
    ) -> List[Dict[str, Any]]:
        if self.watchdog_service is None:
            return []
        try:
            payload = self.watchdog_service.list_sessions(
                f"user:{user_id}",
                limit=max(limit * 4, 12),
                time_window_ms=7 * 24 * 60 * 60 * 1000,
            )
        except Exception as exc:
            self.logger.warning("Unable to generate watchdog suggestions: %s", exc)
            return []

        sessions = list(payload.get("sessions") or [])
        suggestions: List[Dict[str, Any]] = []
        for session in sessions:
            duration_ms = int(session.get("durationMs") or 0)
            command_count = int(session.get("commandCount") or 0)
            if duration_ms < 10 * 60 * 1000 and command_count <= 0:
                continue
            session_id = _safe_text(session.get("sessionId"))
            source_key = f"watchdog:session:{session_id}"
            external_reference = f"suggestion:{source_key}"
            if not session_id or external_reference in existing_refs:
                continue
            drawing_path = _safe_text(session.get("drawingPath"))
            drawing_label = _basename_from_path(drawing_path) or "AutoCAD drawing"
            status = _safe_text(session.get("status")) or "completed"
            workstation_id = _safe_text(session.get("workstationId"))
            suggestions.append(
                {
                    "suggestionId": _stable_suggestion_id(source_key),
                    "sourceKey": source_key,
                    "sourceKind": "watchdog",
                    "title": _truncate(f"CAD session: {drawing_label}", 96),
                    "summary": _truncate(
                        (
                            f"Watchdog captured {drawing_label} for {_format_duration_ms(duration_ms)} "
                            f"with {command_count} command(s) on {workstation_id or 'the active workstation'}."
                        ),
                        260,
                    ),
                    "commitRefs": [],
                    "projectId": _safe_text(session.get("projectId")) or None,
                    "appArea": "watchdog",
                    "architecturePaths": [],
                    "hotspotIds": [drawing_label] if drawing_label else [],
                    "lifecycleState": "active" if status != "completed" else "completed",
                    "publishState": "draft",
                    "externalReference": external_reference,
                    "createdAt": "",
                    "details": {
                        "sessionId": session_id,
                        "drawingPath": drawing_path,
                        "status": status,
                        "durationMs": duration_ms,
                        "commandCount": command_count,
                    },
                }
            )
            if len(suggestions) >= limit:
                break
        return suggestions

    def build(
        self,
        *,
        user_id: str,
        existing_entries: Iterable[Mapping[str, Any]],
        limit: int = 12,
    ) -> Dict[str, Any]:
        safe_limit = max(1, min(int(limit or 12), 24))
        existing_refs, existing_commits = self._collect_existing_markers(existing_entries)

        git_suggestions = self._build_git_suggestions(
            existing_refs=existing_refs,
            existing_commits=existing_commits,
            limit=max(2, safe_limit // 2),
        )
        watchdog_suggestions = self._build_watchdog_suggestions(
            user_id=user_id,
            existing_refs=existing_refs,
            limit=max(2, safe_limit // 2),
        )

        suggestions = sorted(
            [*git_suggestions, *watchdog_suggestions],
            key=lambda item: str(item.get("createdAt") or ""),
            reverse=True,
        )[:safe_limit]

        return {
            "count": len(suggestions),
            "sources": {
                "git": len(git_suggestions),
                "watchdog": len(watchdog_suggestions),
            },
            "suggestions": suggestions,
        }
