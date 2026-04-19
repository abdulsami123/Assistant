import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

logger = structlog.get_logger(__name__)


def configure_logging(*, json_logs: bool) -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="ts"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach request_id and emit structured access logs with latency."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        finally:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            status = getattr(response, "status_code", 500) if response else 500
            log = logger.bind(
                route=str(request.url.path),
                method=request.method,
                latency_ms=latency_ms,
                status=status,
            )
            settings = get_settings()
            client_host = request.client.host if request.client else None
            if settings.env == "production":
                log.info("request_completed")
            else:
                log.info("request_completed", client=client_host)
            if response is not None:
                response.headers["X-Request-ID"] = request_id


def _normalize_http_detail(detail: Any) -> Any:
    if isinstance(detail, str | list | dict):
        return detail
    return str(detail)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from fastapi import HTTPException

    settings = get_settings()
    if isinstance(exc, HTTPException):
        detail = _normalize_http_detail(exc.detail)
        if settings.env == "production" and exc.status_code >= 500:
            detail = "Internal server error"
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})
    if settings.env == "production":
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from fastapi.exceptions import RequestValidationError

    if not isinstance(exc, RequestValidationError):
        return await http_exception_handler(request, exc)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


def prod_openapi_disabled() -> bool:
    settings = get_settings()
    if settings.expose_docs is not None:
        return not settings.expose_docs
    return settings.env == "production" and not settings.debug
