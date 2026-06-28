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

Run locally
-----------
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
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

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource

from app.api.routes import clinical, copilot, forecast, simulation
from app.services.rate_limit_monitor import limiter
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

# ── Database elements ──────────────────────────────────────────────────────────
from app.core.database import async_engine, Base
# Import models explicitly so SQLAlchemy discovers them during creation
from app.models.simulation import SimulationResultModel 

# ── Logging setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Background task references
# ─────────────────────────────────────────────────────────────────────────────
_background_tasks: list[asyncio.Task] = []


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Lifespan Sequence
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Handles application startup and shutdown lifecycle hooks sequentially.
    """
    logger.info(
        "=== %s v%s starting up [%s] ===",
        settings.app_name,
        settings.app_version,
        settings.environment,
    )

    # ── 1. Initialise Relational Tables & Redis Pool ──────────────────────────
    try:
        # Create database tables automatically if they don't exist
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("PostgreSQL tables checked and verified.")

        # Initialize Redis
        await init_redis_pool()
        logger.info("Redis pool ready.")
    except Exception as exc:
        logger.critical("Database/Redis initialisation failed — cannot start: %s", exc)
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
    yield

    # ── Shutdown Hook ──────────────────────────────────────────────────────────
    logger.info("=== Application shutting down ===")

    try:
        await connection_manager.broadcast_all(
            WebSocketMessage(
                type="error",
                payload={"message": "Server shutting down. Reconnect in a moment."},
            ).model_dump()
        )
    except Exception:
        pass

    for task in _background_tasks:
        task.cancel()
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    await close_redis_pool()
    logger.info("=== Shutdown complete ===")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application Configuration
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    description=(
        "AI-Powered Hospital Operations Intelligence & Clinical Digital Twin Platform.\n\n"
        "## Key Capabilities\n"
        "- **Discrete Event Simulation** — SimPy M/M/c queue modelling\n"
        "- **ML Forecasting** — XGBoost/RandomForest predictions\n"
        "- **AI Copilot** — Operational reasoning\n"
        "- **Live Telemetry** — Streaming dashboards\n"
    ),
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware Configuration
# ─────────────────────────────────────────────────────────────────────────────

# SlowAPI Rate Limiting setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# 1. Prometheus Metrics Configuration
Instrumentator().instrument(app).expose(app)

# 2. OpenTelemetry Tracing Configuration
resource = Resource.create({"service.name": "hospital-command-center"})
provider = TracerProvider(resource=resource)
# Exporter configured to point to Jaeger OTLP port (defaults to localhost:4317 if not set)
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4317", insecure=True))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

FastAPIInstrumentor.instrument_app(app)

@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "retry_after_seconds": int(exc.detail.split(" in ")[-1].replace("ms", "")) // 1000 if " in " in exc.detail else 3600,
            "message": "Copilot limit: 50 requests/hour"
        }
    )

# 1. CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. HTTP Logging Middleware (with WebSocket bypass active)
@app.middleware("http")
async def request_logging_middleware(
    request: Request, call_next: Any
) -> Any:
    """
    Log every HTTP request with status and duration. 
    Bypasses WebSocket upgrades immediately to prevent handshake failure.
    """
    if request.headers.get("upgrade", "").lower() == "websocket" or request.url.path.startswith("/ws"):
        return await call_next(request)

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
# Global Exception Handlers
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
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Observability"],
    summary="Application health check",
)
async def health() -> HealthResponse:
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


@app.get(
    "/ws/stats",
    tags=["Observability"],
    summary="WebSocket connection statistics",
)
async def ws_stats() -> dict[str, Any]:
    return connection_manager.stats()


# ── Router registration ──────────────────────────────────────────────────────
API_PREFIX = "/api"

app.include_router(simulation.router, prefix=API_PREFIX)
app.include_router(forecast.router, prefix=API_PREFIX)
app.include_router(clinical.router, prefix=API_PREFIX)
app.include_router(copilot.router, prefix=API_PREFIX)

# WebSocket routes
app.include_router(websocket_routes.router)


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "websocket": "ws://host/ws/telemetry",
    }