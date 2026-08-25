"""Stable, frontend-friendly API error envelopes."""

from __future__ import annotations

import logging
from typing import Any

from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ApiError(APIException):
    status_code = 400
    default_code = "request_failed"
    default_detail = "The request could not be completed."

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        field: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message, code=code)
        self.status_code = status_code
        self.error_code = code
        self.error_message = message
        self.field = field
        self.retryable = retryable


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None:
        logger.error(
            "Unhandled exception while processing an API request",
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "The request could not be completed because of an unexpected error.",
                    "field": None,
                    "retryable": True,
                }
            },
            status=500,
        )

    if isinstance(exc, ApiError):
        code = exc.error_code
        message = exc.error_message
        field = exc.field
        retryable = exc.retryable
    elif isinstance(exc, ValidationError):
        field, message = _first_error(response.data)
        code = "validation_error"
        retryable = False
    else:
        code = getattr(exc, "default_code", "request_failed")
        if code == "error":
            code = exc.__class__.__name__.replace("Error", "").lower() or "request_failed"
        field = None
        message = _stringify_detail(response.data)
        retryable = response.status_code >= 500 or response.status_code == 429

    response.data = {
        "error": {
            "code": str(code),
            "message": message,
            "field": field,
            "retryable": retryable,
        }
    }
    return response


def _first_error(value: Any, prefix: str = "") -> tuple[str | None, str]:
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            return _first_error(child, path)
    if isinstance(value, (list, tuple)):
        if value:
            return _first_error(value[0], prefix)
        return (prefix or None, "Invalid value.")
    return (prefix or None, str(value))


def _stringify_detail(value: Any) -> str:
    if isinstance(value, dict):
        for child in value.values():
            return _stringify_detail(child)
    if isinstance(value, (list, tuple)):
        return _stringify_detail(value[0]) if value else "The request could not be completed."
    return str(value)
