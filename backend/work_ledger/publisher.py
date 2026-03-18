from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .artifacts import WorkLedgerArtifactWriter
from .store import WorkLedgerStore
from .worktale_runtime import WorktaleRuntime


def _sanitize_lines(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value).strip()]


def _excerpt(value: Any, *, max_length: int = 1200) -> str:
    text = str(value or "").strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 3]}..."


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkLedgerPublisher:
    def __init__(
        self,
        *,
        store: WorkLedgerStore,
        runtime: WorktaleRuntime,
        artifact_writer: WorkLedgerArtifactWriter,
        logger: Any,
    ) -> None:
        self.store = store
        self.runtime = runtime
        self.artifact_writer = artifact_writer
        self.logger = logger

    def _build_markdown(self, entry: Dict[str, Any], *, workstation_id: str) -> str:
        lines = [
            f"# {str(entry.get('title') or '').strip()}",
            "",
            str(entry.get("summary") or "").strip(),
            "",
            f"- Source: {str(entry.get('source_kind') or 'manual')}",
            f"- Publish state: {str(entry.get('publish_state') or 'draft')}",
            f"- Workstation: {workstation_id}",
            f"- Published at: {_utc_now_iso()}",
        ]

        project_id = str(entry.get("project_id") or "").strip()
        if project_id:
            lines.append(f"- Project: {project_id}")
        app_area = str(entry.get("app_area") or "").strip()
        if app_area:
            lines.append(f"- App area: {app_area}")

        commit_refs = _sanitize_lines(entry.get("commit_refs"))
        if commit_refs:
            lines.append(f"- Commits: {', '.join(commit_refs)}")

        architecture_paths = _sanitize_lines(entry.get("architecture_paths"))
        if architecture_paths:
            lines.append(f"- Paths: {', '.join(architecture_paths)}")

        hotspot_ids = _sanitize_lines(entry.get("hotspot_ids"))
        if hotspot_ids:
            lines.append(f"- Hotspots: {', '.join(hotspot_ids)}")

        return "\n".join(lines).strip()

    def _build_note_text(self, entry: Dict[str, Any]) -> str:
        title = str(entry.get("title") or "").strip() or "Untitled work item"
        summary = str(entry.get("summary") or "").strip()
        summary_sentence = summary.split(".")[0].strip() if summary else ""
        app_area = str(entry.get("app_area") or "").strip()
        commit_refs = _sanitize_lines(entry.get("commit_refs"))[:2]

        note_parts = [title]
        if summary_sentence:
            note_parts.append(summary_sentence)
        note = " - ".join(note_parts)

        tags: list[str] = []
        if app_area:
            tags.append(f"[{app_area}]")
        if commit_refs:
            tags.append(f"[{', '.join(commit_refs)}]")
        if tags:
            note = f"{note} {' '.join(tags)}"
        return _excerpt(note, max_length=1000)

    def readiness(self, *, workstation_id: str) -> Dict[str, Any]:
        readiness = self.runtime.check_readiness()
        return {
            "publisher": "worktale",
            "workstationId": workstation_id,
            **readiness,
        }

    def bootstrap(self, *, workstation_id: str) -> Dict[str, Any]:
        result = self.runtime.bootstrap_hooks()
        return {
            "publisher": "worktale",
            "workstationId": workstation_id,
            **result,
        }

    def publish_entry(
        self,
        *,
        entry_id: str,
        user_id: str,
        workstation_id: str,
        bearer_token: str | None = None,
    ) -> Dict[str, Any]:
        entry = self.store.fetch_entry_for_user(
            entry_id=entry_id,
            user_id=user_id,
            bearer_token=bearer_token,
        )
        if entry is None:
            raise LookupError("Work ledger entry was not found.")

        publish_state = str(entry.get("publish_state") or "draft").strip().lower()
        if publish_state != "ready":
            raise ValueError("Only `ready` work ledger entries can be published.")

        readiness = self.runtime.check_readiness()
        if not bool(readiness.get("ready")):
            issues = readiness.get("issues") or []
            if isinstance(issues, list) and issues:
                raise RuntimeError(str(issues[0]))
            raise RuntimeError("Worktale is not ready on this workstation.")

        job = self.store.create_publish_job(
            entry_id=entry_id,
            user_id=user_id,
            publisher="worktale",
            mode="note",
            status="pending",
            workstation_id=workstation_id,
            repo_path=str(self.runtime.repo_root),
        )
        job_id = str(job.get("id") or "").strip()
        if not job_id:
            raise RuntimeError("Publish job id was not returned.")

        markdown = self._build_markdown(entry, workstation_id=workstation_id)
        payload = {
            "entryId": str(entry.get("id") or ""),
            "title": str(entry.get("title") or ""),
            "summary": str(entry.get("summary") or ""),
            "sourceKind": str(entry.get("source_kind") or "manual"),
            "commitRefs": _sanitize_lines(entry.get("commit_refs")),
            "projectId": str(entry.get("project_id") or "") or None,
            "appArea": str(entry.get("app_area") or "") or None,
            "architecturePaths": _sanitize_lines(entry.get("architecture_paths")),
            "hotspotIds": _sanitize_lines(entry.get("hotspot_ids")),
            "publishState": "published",
            "publisher": "worktale",
            "workstationId": workstation_id,
            "publishedAt": _utc_now_iso(),
        }
        artifacts = self.artifact_writer.write_publish_artifacts(
            entry_id=entry_id,
            job_id=job_id,
            markdown=markdown,
            payload=payload,
        )
        self.store.update_publish_job(
            job_id=job_id,
            user_id=user_id,
            bearer_token=bearer_token,
            patch={
                "status": "running",
                "artifact_dir": artifacts.get("artifactDir"),
            },
        )

        note_result = self.runtime.publish_note(self._build_note_text(entry))
        if not bool(note_result.get("ok")):
            failed_job = self.store.update_publish_job(
                job_id=job_id,
                user_id=user_id,
                bearer_token=bearer_token,
                patch={
                    "status": "failed",
                    "stdout_excerpt": _excerpt(note_result.get("stdout")),
                    "stderr_excerpt": _excerpt(note_result.get("stderr")),
                    "error_text": _excerpt(
                        note_result.get("stderr")
                        or note_result.get("stdout")
                        or "Worktale publish command failed."
                    ),
                    "artifact_dir": artifacts.get("artifactDir"),
                },
            )
            raise RuntimeError(
                str(
                    failed_job.get("error_text")
                    or "Worktale publish command failed."
                ).strip()
            )

        external_reference = f"worktale:note:{job_id}"
        updated_entry = self.store.mark_entry_published(
            entry_id=entry_id,
            user_id=user_id,
            bearer_token=bearer_token,
            external_reference=external_reference,
            external_url=None,
        )
        succeeded_job = self.store.update_publish_job(
            job_id=job_id,
            user_id=user_id,
            bearer_token=bearer_token,
            patch={
                "status": "succeeded",
                "stdout_excerpt": _excerpt(note_result.get("stdout")),
                "stderr_excerpt": _excerpt(note_result.get("stderr")),
                "external_reference": external_reference,
                "external_url": None,
                "published_at": _utc_now_iso(),
                "artifact_dir": artifacts.get("artifactDir"),
                "error_text": None,
            },
        )
        return {
            "entry": updated_entry,
            "job": succeeded_job,
            "artifacts": artifacts,
            "publisher": "worktale",
            "workstationId": workstation_id,
            "ready": bool(readiness.get("ready")),
            "checks": readiness.get("checks") or {},
            "issues": readiness.get("issues") or [],
            "recommendedActions": readiness.get("recommendedActions") or [],
        }

    def list_entry_jobs(
        self,
        *,
        entry_id: str,
        user_id: str,
        bearer_token: Optional[str],
        limit: int,
    ) -> Dict[str, Any]:
        entry = self.store.fetch_entry_for_user(
            entry_id=entry_id,
            user_id=user_id,
            bearer_token=bearer_token,
        )
        if entry is None:
            raise LookupError("Work ledger entry was not found.")
        jobs = self.store.list_publish_jobs(
            entry_id=entry_id,
            user_id=user_id,
            bearer_token=bearer_token,
            limit=limit,
        )
        return {
            "entry": entry,
            "jobs": jobs,
            "count": len(jobs),
        }
