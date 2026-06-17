# backend/app/main.py
"""
AI Hospital Command Center — FastAPI Application Entry Point
============================================================
Wires together all application components:
  - Lifespan context (startup / shutdown hooks)
  - CORS middleware
  - Structured logging middleware
  - API router registration
  - WebSocket endpoint
  - Redis pub/sub → WebSocket bridge (background asyncio task)
  - WebSocket heartbeat (background asyncio task)
  - Health check endpoint
  - Global exception handlers

Startup sequence
----------------
1. Initialise async Redis connection pool
2. Start Redis pub/sub → WebSocket bridge (background task)
3. Start WebSocket heartbeat supervisor (background task)
4. Register all API routers
5. Serve requests

Shutdown sequence
-----------------
1. Stop pub/sub bridge
2. Broadcast shutdown notice to all WebSocket clients
3. Close Redis connection pool

Run locally
-----------
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import asyncio
import logging
import time
import traceback
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import clinical, copilot, forecast, simulation
from app.api.routes import websocket_routes
from app.core.config import settings
from app.core.redis_client import (
    close_redis_pool,
    get_redis_async,
    health_check,
    init_redis_pool,
)
from app.schemas.hospital import HealthResponse, WebSocketMessage
from app.websocket.manager import (
    connection_manager,
    init_pubsub_bridge,
)


# ── Logging setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Background task references (kept so they can be cancelled on shutdown)
# ─────────────────────────────────────────────────────────────────────────────

_background_tasks: list[asyncio.Task] = []


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan context manager.

    Everything before `yield` runs at startup.
    Everything after `yield` runs at shutdown.
    """
    logger.info(
        "=== %s v%s starting up [%s] ===",
        settings.app_name,
        settings.app_version,
        settings.environment,
    )

    # ── 1. Initialise Redis connection pool ────────────────────────────────────
    try:
        await init_redis_pool()
        
        logger.info("Redis pool ready.")
    except Exception as exc:
        logger.critical("Redis initialisation failed — cannot start: %s", exc)
        raise

    # ── 2. Start Redis → WebSocket pub/sub bridge ──────────────────────────────
    redis_client = get_redis_async()
    bridge = init_pubsub_bridge(redis_client)
    bridge_task = asyncio.create_task(
        bridge.run(), name="pubsub-bridge"
    )
    _background_tasks.append(bridge_task)
    logger.info("Redis pub/sub bridge started.")

    # ── 3. Start WebSocket heartbeat supervisor ────────────────────────────────
    heartbeat_task = asyncio.create_task(
        connection_manager.run_heartbeat(), name="ws-heartbeat"
    )
    _background_tasks.append(heartbeat_task)
    logger.info(
        "WebSocket heartbeat supervisor started (interval=%ds).",
        settings.ws_heartbeat_interval,
    )

    logger.info("=== Application ready to serve requests ===")

    # ── Application runs here ─────────────────────────────────────────────────
    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    logger.info("=== Application shutting down ===")

    # Notify all connected clients
    try:
        await connection_manager.broadcast_all(
            WebSocketMessage(
                type="error",
                payload={"message": "Server shutting down. Reconnect in a moment."},
            ).model_dump()
        )
    except Exception:
        pass

    # Cancel background tasks
    for task in _background_tasks:
        task.cancel()
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # Close Redis pool
    await close_redis_pool()
    logger.info("=== Shutdown complete ===")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    description=(
        "AI-Powered Hospital Operations Intelligence & Clinical Digital Twin Platform.\n\n"
        "## Key Capabilities\n"
        "- **Discrete Event Simulation** — SimPy M/M/c queue modelling for OPD, ER, ICU, Ward\n"
        "- **ML Forecasting** — XGBoost/RandomForest 12-hour ICU/ER occupancy prediction\n"
        "- **AI Copilot** — LangChain + GPT-4o-mini operational reasoning with live telemetry\n"
        "- **Clinical Screening** — Rule-based urgency scoring with LLM anomaly extraction\n"
        "- **Live Telemetry** — Redis pub/sub → WebSocket streaming to dashboards\n"
    ),
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────

# CORS — allow Next.js dev + production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(
    request: Request, call_next: Any
) -> Any:
    """
    Log every HTTP request with method, path, status code and duration.
    Skips health checks to reduce log noise.
    """
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 2)

    if request.url.path not in ("/health", "/metrics"):
        logger.info(
            "%s %s → %d (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    response.headers["X-App-Version"] = settings.app_version
    return response


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handlers
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    logger.warning(
        "HTTP %d | %s %s | %s",
        exc.status_code,
        request.method,
        request.url.path,
        exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "code": exc.status_code,
            "path": str(request.url.path),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.error(
        "Unhandled exception | %s %s | %s\n%s",
        request.method,
        request.url.path,
        exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.is_development else None,
            "code": 500,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Observability"],
    summary="Application health check",
    description="Returns health status of the application and its dependencies.",
)
async def health() -> HealthResponse:
    """
    Liveness and readiness probe.

    Checks:
    - Application is running
    - Redis connection is alive

    Used by:
    - Docker HEALTHCHECK
    - Kubernetes liveness probe
    - Load balancer health checks
    """
    redis_ok = False
    app_status = "ok"

    try:
        redis_ok = await health_check()
    except Exception as exc:
        logger.warning("Health check Redis ping failed: %s", exc)

    if not redis_ok:
        app_status = "degraded"

    return HealthResponse(
        status=app_status,
        version=settings.app_version,
        environment=settings.environment,
        redis_connected=redis_ok,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket connection stats
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/ws/stats",
    tags=["Observability"],
    summary="WebSocket connection statistics",
)
async def ws_stats() -> dict[str, Any]:
    """Return current WebSocket connection counts per channel."""
    return connection_manager.stats()


# ─────────────────────────────────────────────────────────────────────────────
# API Router registration
# ─────────────────────────────────────────────────────────────────────────────

API_PREFIX = "/api"

app.include_router(simulation.router, prefix=API_PREFIX)
app.include_router(forecast.router, prefix=API_PREFIX)
app.include_router(clinical.router, prefix=API_PREFIX)
app.include_router(copilot.router, prefix=API_PREFIX)

# WebSocket routes (no /api prefix — WS clients connect to /ws/...)
app.include_router(websocket_routes.router)


# ─────────────────────────────────────────────────────────────────────────────
# Root
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "websocket": "ws://host/ws/telemetry",
    }