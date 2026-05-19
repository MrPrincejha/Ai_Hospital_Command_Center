# backend/app/api/routes/forecast.py
"""
AI Hospital Command Center — Forecast API Routes
=================================================
REST endpoints for the ML forecasting engine.

Endpoints
---------
POST  /api/forecast/run          — Trigger a training + forecast Celery task
GET   /api/forecast/latest       — Retrieve latest forecast from Redis
GET   /api/forecast/status/{id}  — Poll Celery task status

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import logging
import time

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.redis_client import get_json
from app.schemas.hospital import (
    ForecastTriggerRequest,
    ForecastTaskResponse,
    ForecastResponse,
    ForecastResultSchema,
    SimulationStatusResponse,
)
from worker.celery_app import celery_app, run_forecast_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/forecast", tags=["Forecast"])


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/forecast/run
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/run",
    response_model=ForecastTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger ML forecasting pipeline",
    description=(
        "Queues the full train → forecast pipeline on the Celery forecast "
        "worker. XGBoost + RandomForest models are trained on synthetic "
        "telemetry and a 12-hour forecast is stored in Redis."
    ),
)
async def trigger_forecast(
    request: ForecastTriggerRequest,
    settings: Settings = Depends(get_settings),
) -> ForecastTaskResponse:
    """
    Queue a forecasting task. Returns task_id for polling.

    Training on 8760 hours typically takes 30–90 seconds depending on hardware.
    The result is automatically stored under `hospital:latest_forecast` in Redis
    and will be consumed by the AI copilot.
    """
    logger.info(
        "Forecast run requested | training_hours=%d | seed=%d",
        request.training_hours,
        request.seed,
    )

    try:
        task = run_forecast_task.apply_async(
            kwargs={
                "training_hours": request.training_hours,
                "seed": request.seed,
            },
            queue="forecast",
        )
    except Exception as exc:
        logger.error("Failed to queue forecast task: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Celery broker unavailable: {exc}",
        )

    logger.info("Forecast task queued | task_id=%s", task.id)

    return ForecastTaskResponse(
        task_id=task.id,
        status="QUEUED",
        message=(
            f"Forecast pipeline queued with {request.training_hours} training hours. "
            f"Poll /forecast/status/{task.id} for completion."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/forecast/latest
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/latest",
    response_model=ForecastResponse,
    summary="Get latest ML forecast",
    description=(
        "Returns the most recent 12-hour forecast from Redis. "
        "Includes ICU occupancy, ER congestion, and patient inflow predictions."
    ),
)
async def get_latest_forecast(
    settings: Settings = Depends(get_settings),
) -> ForecastResponse:
    """
    Retrieve the latest stored forecast result.

    Returns 200 with available=False if no forecast has been run yet.
    Trigger a forecast with POST /forecast/run first.
    """
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        data = await get_json(settings.redis_forecast_key)
    except Exception as exc:
        logger.error("Redis read failed for forecast key: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Forecast store temporarily unavailable.",
        )

    if data is None:
        return ForecastResponse(
            available=False,
            fetched_at=fetched_at,
            data=None,
            message=(
                "No forecast available. Trigger one with POST /forecast/run"
            ),
        )

    try:
        forecast = ForecastResultSchema(
            forecast_horizon_hours=data.get("forecast_horizon_hours", 12),
            generated_at=data.get("generated_at", fetched_at),
            icu_occupancy_t12=float(data.get("icu_occupancy_t12", 0.0)),
            er_congestion_t12=float(data.get("er_congestion_t12", 0.0)),
            patient_inflow_t12=int(data.get("patient_inflow_t12", 0)),
            risk_level=data.get("risk_level", "low"),
            model_mae_icu=float(data.get("model_mae_icu", -1.0)),
            model_mae_er=float(data.get("model_mae_er", -1.0)),
            top_features=data.get("top_features", {}),
        )
    except Exception as exc:
        logger.error("Forecast schema validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast data format error: {exc}",
        )

    return ForecastResponse(
        available=True,
        fetched_at=fetched_at,
        data=forecast,
        message=None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/forecast/status/{task_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/status/{task_id}",
    response_model=SimulationStatusResponse,
    summary="Poll forecast task status",
    description="Returns the current Celery task state for a forecast run.",
)
async def get_forecast_status(task_id: str) -> SimulationStatusResponse:
    """Check the state of a queued forecast task."""
    try:
        result: AsyncResult = celery_app.AsyncResult(task_id)
        state = result.state
    except Exception as exc:
        logger.error("Error fetching task %s: %s", task_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not retrieve task status: {exc}",
        )

    task_result = None
    error_msg = None

    if state == "SUCCESS":
        try:
            task_result = result.get(timeout=1)
        except Exception as exc:
            logger.warning("Could not retrieve result for %s: %s", task_id, exc)
    elif state == "FAILURE":
        error_msg = str(result.info) if result.info else "Unknown error"

    return SimulationStatusResponse(
        task_id=task_id,
        status=state,
        result=task_result,
        error=error_msg,
        started_at=None,
        completed_at=None,
    )
