from __future__ import annotations

from typing import Any, Callable, Dict

import requests
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter

from backend.domains.project_standards import (
    fetch_latest_review_row,
    fetch_profile_row,
    upsert_latest_review_row,
    upsert_profile_row,
)
from backend.domains.project_setup import create_ticket_payload

from .api_autocad_error_helpers import (
    build_error_payload as autocad_build_error_payload,
    derive_request_id as autocad_derive_request_id,
)


def create_project_standards_blueprint(
    *,
    limiter: Limiter,
    logger: Any,
    require_supabase_user: Callable,
    api_key: str,
    supabase_url: str,
    supabase_api_key: str,
    requests_module: Any = requests,
) -> Blueprint:
    bp = Blueprint(
        "project_standards_api",
        __name__,
        url_prefix="/api/project-standards",
    )

    def _request_id() -> str:
        raw = request.headers.get("X-Request-ID") or request.headers.get("X-Request-Id")
        if not raw:
            payload = request.get_json(silent=True) or {}
            raw = payload.get("requestId") or payload.get("request_id")
        return autocad_derive_request_id(raw)

    def _error_response(
        *,
        code: str,
        message: str,
        status_code: int,
        request_id: str,
        meta: Dict[str, Any] | None = None,
    ):
        payload = autocad_build_error_payload(
            code=code,
            message=message,
            request_id=request_id,
            meta=meta,
        )
        return jsonify(payload), status_code

    def _parse_json_body() -> Dict[str, Any]:
        payload = request.get_json(silent=True)
        return payload if isinstance(payload, dict) else {}

    def _normalize_text(value: Any) -> str:
        return str(value or "").strip()

    def _extract_bearer_token() -> str:
        authorization = _normalize_text(request.headers.get("Authorization"))
        if authorization.lower().startswith("bearer "):
            return authorization[7:].strip()
        return ""

    @bp.route("/tickets", methods=["POST"])
    @require_supabase_user
    @limiter.limit("600 per hour")
    def api_project_standards_ticket():
        request_id = _request_id()
        payload = _parse_json_body()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _normalize_text(user.get("id"))
        if not user_id:
            return _error_response(
                code="AUTH_REQUIRED",
                message="Authenticated user id not found.",
                status_code=401,
                request_id=request_id,
                meta={"stage": "ticket.issue"},
            )

        action = _normalize_text(payload.get("action"))
        if not action:
            return _error_response(
                code="INVALID_REQUEST",
                message="action is required.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "ticket.issue.validate"},
            )

        origin = _normalize_text(payload.get("origin") or request.headers.get("Origin"))
        ticket = create_ticket_payload(
            secret=api_key,
            user_id=user_id,
            action=action,
            request_id=request_id,
            origin=origin,
            project_id=_normalize_text(payload.get("projectId")),
            ttl_seconds=int(payload.get("ttlSeconds") or 180),
        )
        return jsonify({"ok": True, **ticket}), 200

    @bp.route("/projects/<project_id>/profile", methods=["GET", "PUT"])
    @require_supabase_user
    @limiter.limit("1500 per hour")
    def api_project_standards_profile(project_id: str):
        request_id = _request_id()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _normalize_text(user.get("id"))
        token = _extract_bearer_token()

        if request.method == "GET":
            row, error_message, status_code = fetch_profile_row(
                project_id=_normalize_text(project_id),
                user_id=user_id,
                user_token=token,
                supabase_url=supabase_url,
                supabase_api_key=supabase_api_key,
                requests_module=requests_module,
            )
            if error_message and status_code >= 400:
                logger.warning(
                    "Project standards profile fetch failed (request_id=%s, project_id=%s): %s",
                    request_id,
                    project_id,
                    error_message,
                )
                return _error_response(
                    code="PROJECT_STANDARDS_PROFILE_FETCH_FAILED",
                    message=error_message,
                    status_code=status_code or 500,
                    request_id=request_id,
                    meta={"stage": "profile.fetch"},
                )
            return jsonify(
                {
                    "success": True,
                    "code": "",
                    "message": "Project standards profile is ready.",
                    "requestId": request_id,
                    "data": row,
                    "warnings": [] if not error_message else [error_message],
                    "meta": {"stage": "profile.fetch"},
                }
            ), 200

        payload = _parse_json_body()
        row, error_message, status_code = upsert_profile_row(
            project_id=_normalize_text(project_id),
            user_id=user_id,
            user_token=token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            payload=payload,
            requests_module=requests_module,
        )
        if error_message:
            logger.warning(
                "Project standards profile save failed (request_id=%s, project_id=%s): %s",
                request_id,
                project_id,
                error_message,
            )
            return _error_response(
                code="PROJECT_STANDARDS_PROFILE_SAVE_FAILED",
                message=error_message,
                status_code=status_code or 500,
                request_id=request_id,
                meta={"stage": "profile.save"},
            )
        return jsonify(
            {
                "success": True,
                "code": "",
                "message": "Project standards profile saved.",
                "requestId": request_id,
                "data": row,
                "warnings": [],
                "meta": {"stage": "profile.save"},
            }
        ), 200

    @bp.route("/projects/<project_id>/latest-review", methods=["GET"])
    @require_supabase_user
    @limiter.limit("1500 per hour")
    def api_project_standards_latest_review(project_id: str):
        request_id = _request_id()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _normalize_text(user.get("id"))
        token = _extract_bearer_token()

        row, error_message, status_code = fetch_latest_review_row(
            project_id=_normalize_text(project_id),
            user_id=user_id,
            user_token=token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            requests_module=requests_module,
        )
        if error_message and status_code >= 400:
            logger.warning(
                "Project standards latest review fetch failed (request_id=%s, project_id=%s): %s",
                request_id,
                project_id,
                error_message,
            )
            return _error_response(
                code="PROJECT_STANDARDS_REVIEW_FETCH_FAILED",
                message=error_message,
                status_code=status_code or 500,
                request_id=request_id,
                meta={"stage": "review.fetch"},
            )

        return jsonify(
            {
                "success": True,
                "code": "",
                "message": "Project standards latest review is ready.",
                "requestId": request_id,
                "data": row,
                "warnings": [] if not error_message else [error_message],
                "meta": {"stage": "review.fetch"},
            }
        ), 200

    @bp.route("/results", methods=["POST"])
    @require_supabase_user
    @limiter.limit("1200 per hour")
    def api_project_standards_results():
        request_id = _request_id()
        payload = _parse_json_body()
        user = getattr(g, "supabase_user", {}) or {}
        user_id = _normalize_text(user.get("id"))
        token = _extract_bearer_token()
        project_id = _normalize_text(payload.get("projectId"))
        if not project_id:
            return _error_response(
                code="INVALID_REQUEST",
                message="projectId is required.",
                status_code=400,
                request_id=request_id,
                meta={"stage": "review.save.validate"},
            )

        row, error_message, status_code = upsert_latest_review_row(
            project_id=project_id,
            user_id=user_id,
            user_token=token,
            supabase_url=supabase_url,
            supabase_api_key=supabase_api_key,
            payload=payload,
            requests_module=requests_module,
        )
        if error_message:
            logger.warning(
                "Project standards latest review save failed (request_id=%s, project_id=%s): %s",
                request_id,
                project_id,
                error_message,
            )
            return _error_response(
                code="PROJECT_STANDARDS_REVIEW_SAVE_FAILED",
                message=error_message,
                status_code=status_code or 500,
                request_id=request_id,
                meta={"stage": "review.save"},
            )

        logger.info(
            "Project standards native review recorded (request_id=%s, user_id=%s, project_id=%s, overall_status=%s)",
            request_id,
            user_id,
            project_id,
            _normalize_text(row.get("overallStatus")),
        )
        return jsonify(
            {
                "success": True,
                "code": "",
                "message": "Project standards latest review recorded.",
                "requestId": request_id,
                "data": row,
                "warnings": [],
                "meta": {"stage": "review.save"},
            }
        ), 200

    return bp
