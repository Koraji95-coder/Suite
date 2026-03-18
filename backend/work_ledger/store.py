from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from backend.route_groups.api_supabase_service_request import (
    supabase_service_rest_request as supabase_service_rest_request_helper,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkLedgerStore:
    def __init__(
        self,
        *,
        supabase_url: str,
        supabase_api_key: str,
        logger: Any,
        requests_module: Any = requests,
    ) -> None:
        self.supabase_url = str(supabase_url or "").strip()
        self.supabase_api_key = str(supabase_api_key or "").strip()
        self.logger = logger
        self.requests_module = requests_module

    def _resolve_auth(
        self,
        *,
        bearer_token: str | None,
    ) -> Tuple[str, Dict[str, str]]:
        token = str(bearer_token or "").strip()
        if token:
            return token, {"apikey": self.supabase_api_key}
        if self.supabase_api_key:
            return self.supabase_api_key, {}
        raise RuntimeError("Supabase API credentials are not configured.")

    def _request(
        self,
        method: str,
        table_path: str,
        *,
        bearer_token: str | None = None,
        params: Optional[Dict[str, str]] = None,
        payload: Optional[Any] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[Optional[Any], Optional[str], int]:
        auth_key, auth_headers = self._resolve_auth(bearer_token=bearer_token)
        merged_headers = dict(auth_headers)
        if extra_headers:
            merged_headers.update(extra_headers)
        return supabase_service_rest_request_helper(
            method,
            table_path,
            supabase_url=self.supabase_url,
            supabase_service_role_key=auth_key,
            params=params,
            payload=payload,
            extra_headers=merged_headers or None,
            timeout=10,
            requests_module=self.requests_module,
        )

    @staticmethod
    def _first_row(payload: Optional[Any]) -> Optional[Dict[str, Any]]:
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            return payload[0]
        if isinstance(payload, dict):
            return payload
        return None

    def fetch_entry_for_user(
        self,
        *,
        entry_id: str,
        user_id: str,
        bearer_token: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        payload, error, _ = self._request(
            "GET",
            "work_ledger_entries",
            bearer_token=bearer_token,
            params={
                "select": "*",
                "id": f"eq.{entry_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if error:
            raise RuntimeError(error)
        return self._first_row(payload)

    def list_publish_jobs(
        self,
        *,
        entry_id: str,
        user_id: str,
        bearer_token: str | None = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        payload, error, _ = self._request(
            "GET",
            "work_ledger_publish_jobs",
            bearer_token=bearer_token,
            params={
                "select": "*",
                "entry_id": f"eq.{entry_id}",
                "user_id": f"eq.{user_id}",
                "order": "created_at.desc",
                "limit": str(max(1, min(200, int(limit)))),
            },
        )
        if error:
            raise RuntimeError(error)
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        return []

    def fetch_publish_job_for_user(
        self,
        *,
        entry_id: str,
        job_id: str,
        user_id: str,
        bearer_token: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        payload, error, _ = self._request(
            "GET",
            "work_ledger_publish_jobs",
            bearer_token=bearer_token,
            params={
                "select": "*",
                "id": f"eq.{job_id}",
                "entry_id": f"eq.{entry_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if error:
            raise RuntimeError(error)
        return self._first_row(payload)

    def create_publish_job(
        self,
        *,
        entry_id: str,
        user_id: str,
        publisher: str,
        mode: str,
        status: str,
        workstation_id: str,
        repo_path: str,
        artifact_dir: str | None = None,
    ) -> Dict[str, Any]:
        payload, error, _ = self._request(
            "POST",
            "work_ledger_publish_jobs",
            payload={
                "entry_id": entry_id,
                "user_id": user_id,
                "publisher": publisher,
                "mode": mode,
                "status": status,
                "workstation_id": workstation_id,
                "repo_path": repo_path,
                "artifact_dir": artifact_dir,
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if error:
            raise RuntimeError(error)
        row = self._first_row(payload)
        if row is None:
            raise RuntimeError("Failed to create publish job.")
        return row

    def update_publish_job(
        self,
        *,
        job_id: str,
        user_id: str,
        patch: Dict[str, Any],
        bearer_token: str | None = None,
    ) -> Dict[str, Any]:
        payload, error, _ = self._request(
            "PATCH",
            "work_ledger_publish_jobs",
            bearer_token=bearer_token,
            params={
                "id": f"eq.{job_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "limit": "1",
            },
            payload=patch,
            extra_headers={"Prefer": "return=representation"},
        )
        if error:
            raise RuntimeError(error)
        row = self._first_row(payload)
        if row is None:
            raise RuntimeError("Failed to update publish job.")
        return row

    def mark_entry_published(
        self,
        *,
        entry_id: str,
        user_id: str,
        external_reference: str,
        external_url: str | None = None,
        bearer_token: str | None = None,
    ) -> Dict[str, Any]:
        published_at = _utc_now_iso()
        payload, error, _ = self._request(
            "PATCH",
            "work_ledger_entries",
            bearer_token=bearer_token,
            params={
                "id": f"eq.{entry_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "limit": "1",
            },
            payload={
                "lifecycle_state": "completed",
                "publish_state": "published",
                "published_at": published_at,
                "external_reference": external_reference,
                "external_url": external_url,
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if error:
            raise RuntimeError(error)
        row = self._first_row(payload)
        if row is None:
            raise RuntimeError("Failed to mark entry published.")
        return row
