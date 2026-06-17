#Backend/app/api/routes/simulation.py

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.redis_client import get_json
from app.schemas.hospital import (
    SimulationStartRequest,
    SimulationStartResponse,
    SimulationStatusResponse,
    TelemetryResponse,
    TelemetryEventSchema,
    DepartmentSnapshotSchema,
)

from worker.celery_app import celery_app, get_simulation_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/simulation", tags=["Simulation"])


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/simulation/start
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/start",
    response_model=SimulationStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a hospital simulation run",
)
async def start_simulation(
    request: SimulationStartRequest,
    settings: Settings = Depends(get_settings),
) -> SimulationStartResponse:

    logger.info(
        "Simulation start requested | sim_hours=%.1f | interval=%.2f | seed=%s",
        request.sim_hours,
        request.telemetry_interval,
        request.seed,
    )

    try:
        simulation_task = get_simulation_task()

        task = simulation_task.apply_async(
            kwargs={
                "sim_hours": request.sim_hours,
                "telemetry_interval": request.telemetry_interval,
                "seed": request.seed,
            },
            queue="simulation",
        )

    except Exception as exc:
        logger.error("Failed to queue simulation task: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Celery broker unavailable: {exc}",
        )

    logger.info("Simulation task queued | task_id=%s", task.id)

    return SimulationStartResponse(
        task_id=task.id,
        status="QUEUED",
        message=(
            f"Simulation queued for {request.sim_hours:.1f} sim-hours. "
            f"Poll /simulation/status/{task.id}"
        ),
        sim_hours=request.sim_hours,
        seed=request.seed,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/simulation/status/{task_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/status/{task_id}",
    response_model=SimulationStatusResponse,
)
async def get_simulation_status(task_id: str):

    try:
        task_id = task_id.strip('"')  # 🔥 IMPORTANT FIX
        result: AsyncResult = celery_app.AsyncResult(task_id)
        state = result.state
    except Exception as exc:
        logger.error("Error fetching task %s: %s", task_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    task_result: dict[str, Any] | None = None
    error_msg: str | None = None

    if state == "SUCCESS":
        try:
            task_result = result.get(timeout=1)
        except Exception as exc:
            logger.warning("Could not fetch result: %s", exc)

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


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/simulation/latest
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/latest",
    response_model=TelemetryResponse,
)
async def get_latest_telemetry(
    settings: Settings = Depends(get_settings),
):

    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        data = await get_json(settings.redis_telemetry_key)
    except Exception as exc:
        logger.error("Redis read failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable",
        )

    if data is None:
        return TelemetryResponse(
            available=False,
            fetched_at=fetched_at,
            data=None,
            message="No telemetry yet. Start simulation first.",
        )

    try:
        snapshots = [
            DepartmentSnapshotSchema(**s)
            for s in data.get("snapshots", [])
        ]

        # Handle timestamp conversion: if it's a string (ISO format), convert to Unix epoch float
        timestamp_value = data.get("timestamp", 0.0)
        if isinstance(timestamp_value, str):
            try:
                dt = datetime.fromisoformat(timestamp_value.replace("Z", "+00:00"))
                timestamp_value = dt.timestamp()
            except (ValueError, AttributeError):
                timestamp_value = 0.0
        
        telemetry_event = TelemetryEventSchema(
            event_id=data.get("event_id", ""),
            event_type=data.get("event_type", "telemetry_tick"),
            timestamp=timestamp_value,
            snapshots=snapshots,
            global_alert=data.get("global_alert", "normal"),
            total_queue=data.get("total_queue", 0),
            icu_occupancy_pct=data.get("icu_occupancy_pct", 0.0),
            er_congestion_pct=data.get("er_congestion_pct", 0.0),
        )

    except Exception as exc:
        logger.error("Telemetry parsing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return TelemetryResponse(
        available=True,
        fetched_at=fetched_at,
        data=telemetry_event,
        message=None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/simulation/cancel/{task_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/cancel/{task_id}",
    status_code=status.HTTP_200_OK,
)
async def cancel_simulation(task_id: str):

    try:
        celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
        logger.info("Revoked task %s", task_id)

        return {
            "task_id": task_id,
            "status": "REVOKED",
            "message": "Task cancelled",
        }

    except Exception as exc:
        logger.error("Failed to revoke task %s: %s", task_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )