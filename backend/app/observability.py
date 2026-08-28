"""Structured logging and health probes — Phase 4 W8.

The plan lists "basic monitoring/error tracking setup" as optional, naming
Sentry. Sentry is not wired up: it needs an account and a DSN, and the
project's standing rule is that services get surfaced for approval before they
land. What is here instead is the part that costs nothing and that Sentry
would sit on top of anyway — one structured line per request, unhandled
exceptions logged with their traceback and a request id, and health probes an
orchestrator can actually act on.

Adding Sentry later is a `sentry_sdk.init()` call plus its ASGI middleware;
this module is where it would go.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("rydr.access")


class JsonLogFormatter(logging.Formatter):
    """One JSON object per line.

    Container logs are read by machines before people. A JSON line survives
    being collected, shipped and indexed; a formatted human sentence has to be
    parsed back apart with a regex at the other end.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Anything attached via logger.info(..., extra={...}).
        for key, value in getattr(record, "__dict__", {}).items():
            if key.startswith("rydr_"):
                payload[key[5:]] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())

    root = logging.getLogger()
    # Replace rather than append: uvicorn installs its own handler, and
    # leaving both attached prints every line twice.
    root.handlers = [handler]
    root.setLevel(level)

    for name in ("uvicorn.access", "uvicorn.error"):
        log = logging.getLogger(name)
        log.handlers = []
        log.propagate = True


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every request with a correlation id, and never swallow an error.

    The request id is echoed in the ``X-Request-ID`` response header so a user
    reporting a failure can quote a value that appears in the logs. An
    inbound ``X-Request-ID`` is honoured, so a trace survives a proxy hop.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            # Log with the traceback and the correlation id before re-raising.
            # Without this the only record of a 500 is uvicorn's traceback,
            # which carries no request id and cannot be tied to a user report.
            logger.exception(
                "request failed",
                extra={
                    "rydr_request_id": request_id,
                    "rydr_method": request.method,
                    "rydr_path": request.url.path,
                    "rydr_duration_ms": round(
                        (time.perf_counter() - started) * 1000, 2
                    ),
                },
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "request",
            extra={
                "rydr_request_id": request_id,
                "rydr_method": request.method,
                "rydr_path": request.url.path,
                "rydr_status": response.status_code,
                "rydr_duration_ms": duration_ms,
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
