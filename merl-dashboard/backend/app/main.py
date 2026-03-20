"""
MERL Dashboard API – application entry point.

Wires together:
  - FastAPI application instance with metadata
  - CORS middleware
  - All feature routers (prefixed under /api)
  - Startup / shutdown lifespan events
  - Health-check and root redirect endpoints
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import check_db_connection, dispose_engine

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Run startup/shutdown logic around the application lifetime."""
    # Startup
    logger.info("Starting MERL Dashboard API …")
    db_ok = await check_db_connection()
    if not db_ok:
        logger.warning(
            "Could not reach PostgreSQL at startup – "
            "some endpoints will be unavailable."
        )
    yield
    # Shutdown
    logger.info("Shutting down MERL Dashboard API …")
    await dispose_engine()


# ── Application factory ───────────────────────────────────────────────────────


def create_app() -> FastAPI:
    # Disable interactive API docs in production to avoid leaking the full
    # API schema to unauthenticated attackers.
    _docs_url = "/docs" if settings.DEBUG else None
    _redoc_url = "/redoc" if settings.DEBUG else None
    _openapi_url = "/openapi.json" if settings.DEBUG else None

    app = FastAPI(
        title="MERL Dashboard API",
        version="1.0.0",
        description=(
            "Monitoring, Evaluation, Research and Learning (MERL) Dashboard "
            "for the Vanuatu Loss and Damage Fund Development Project."
        ),
        contact={
            "name": "VCAP2 Project Team",
            "email": "merl@example.com",
        },
        license_info={"name": "Proprietary"},
        docs_url=_docs_url,
        redoc_url=_redoc_url,
        openapi_url=_openapi_url,
        lifespan=lifespan,
    )

    # ── Security headers middleware ────────────────────────────────────────
    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            response: Response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = (
                "camera=(), microphone=(), geolocation=(self)"
            )
            if not settings.DEBUG:
                response.headers["Strict-Transport-Security"] = (
                    "max-age=63072000; includeSubDomains; preload"
                )
            return response

    app.add_middleware(SecurityHeadersMiddleware)

    # ── Middleware ────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-CSRFToken",
            "X-Requested-With",
        ],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    # Import here to avoid circular imports at module level.
    from app.routers import (
        activities,
        community,
        events,
        financials,
        indicators,
        reports,
        uploads,
    )

    app.include_router(indicators.router, prefix="/api", tags=["Indicators"])
    app.include_router(activities.router, prefix="/api", tags=["Activities"])
    app.include_router(financials.router, prefix="/api", tags=["Financials"])
    app.include_router(events.router, prefix="/api", tags=["Events"])
    app.include_router(community.router, prefix="/api", tags=["Community"])
    app.include_router(reports.router, prefix="/api", tags=["Reports"])
    app.include_router(uploads.router, prefix="/api", tags=["Uploads"])

    # ── Core endpoints ────────────────────────────────────────────────────────

    @app.get("/health", tags=["System"], summary="Health check")
    async def health_check() -> dict:
        """Returns service liveness status and basic metadata."""
        db_status = await check_db_connection()
        return {
            "status": "ok" if db_status else "degraded",
            "version": app.version,
            "database": "connected" if db_status else "unreachable",
        }

    @app.get("/", include_in_schema=False)
    async def root_redirect() -> RedirectResponse:
        """Redirect bare root to the interactive API docs."""
        return RedirectResponse(url="/docs")

    return app


app: FastAPI = create_app()
