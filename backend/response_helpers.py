"""Standard response envelope helpers for Flask route groups.

Usage::

    from backend.response_helpers import make_response, make_error_response

    # Success
    return make_response(data={"key": "value"}, message="OK")

    # Error
    return make_error_response("Something went wrong.", code="INVALID_REQUEST", status=400)

All responses conform to the documented envelope contract::

    {
        "success": bool,
        "code": str,
        "message": str,
        "data": any | null,
        "requestId": str (UUID4),
        "meta": any | null
    }
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

import flask

__all__ = ["make_response", "make_error_response"]


def make_response(
    data: Optional[Any] = None,
    message: str = "OK",
    code: str = "SUCCESS",
    meta: Optional[Any] = None,
    status: int = 200,
) -> tuple:
    """Build a standard success response envelope."""
    return flask.jsonify(
        {
            "success": True,
            "code": code,
            "message": message,
            "data": data,
            "requestId": str(uuid.uuid4()),
            "meta": meta,
        }
    ), status


def make_error_response(
    message: str,
    code: str = "ERROR",
    status: int = 400,
    meta: Optional[Any] = None,
) -> tuple:
    """Build a standard error response envelope."""
    return flask.jsonify(
        {
            "success": False,
            "code": code,
            "message": message,
            "data": None,
            "requestId": str(uuid.uuid4()),
            "meta": meta,
        }
    ), status
