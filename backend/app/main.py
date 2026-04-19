from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.middleware import (
    RequestContextMiddleware,
    configure_logging,
    http_exception_handler,
    prod_openapi_disabled,
    validation_exception_handler,
)
from app.routes.v1 import router as v1_router
from app.schemas import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(json_logs=settings.env == "production")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    docs_url = "/docs" if not prod_openapi_disabled() else None
    redoc_url = "/redoc" if not prod_openapi_disabled() else None
    openapi_url = "/openapi.json" if not prod_openapi_disabled() else None

    app = FastAPI(
        title="TwinMind API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=openapi_url,
    )

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Groq-API-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    from fastapi import HTTPException

    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return await http_exception_handler(request, exc)

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse()

    app.include_router(v1_router, prefix="/api/v1")

    if docs_url is not None:

        @app.get(docs_url, include_in_schema=False)
        async def swagger_docs() -> object:
            return get_swagger_ui_html(
                openapi_url=openapi_url or "/openapi.json",
                title=app.title + " docs",
            )

    return app


app = create_app()
