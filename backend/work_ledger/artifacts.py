from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict


def _safe_filename(value: str, fallback: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    sanitized = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in raw)
    sanitized = sanitized.strip("-_")
    return sanitized or fallback


def resolve_artifact_root() -> Path:
    configured = str(os.environ.get("SUITE_WORK_LEDGER_ARTIFACT_ROOT") or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    local_appdata = str(os.environ.get("LOCALAPPDATA") or "").strip()
    if local_appdata:
        return (
            Path(local_appdata)
            / "Suite"
            / "work-ledger-publishers"
            / "worktale"
        ).resolve()
    return (
        Path.home()
        / "AppData"
        / "Local"
        / "Suite"
        / "work-ledger-publishers"
        / "worktale"
    ).resolve()


class WorkLedgerArtifactWriter:
    def __init__(self, *, root_dir: Path | None = None) -> None:
        self.root_dir = (root_dir or resolve_artifact_root()).resolve()

    def write_publish_artifacts(
        self,
        *,
        entry_id: str,
        job_id: str,
        markdown: str,
        payload: Dict[str, Any],
    ) -> Dict[str, str]:
        entry_key = _safe_filename(entry_id, "entry")
        job_key = _safe_filename(job_id, "job")
        artifact_dir = (self.root_dir / entry_key / job_key).resolve()
        artifact_dir.mkdir(parents=True, exist_ok=True)

        markdown_path = artifact_dir / "entry.md"
        json_path = artifact_dir / "entry.json"
        markdown_path.write_text(str(markdown or ""), encoding="utf-8")
        json_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        return {
            "artifactDir": str(artifact_dir),
            "markdownPath": str(markdown_path),
            "jsonPath": str(json_path),
        }
