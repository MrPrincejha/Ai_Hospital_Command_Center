# backend/worker/celery_app.py
"""
AI Hospital Command Center — Celery Application & Task Registry
===============================================================
Configures the Celery distributed task queue and registers all
background tasks for:

  - Hospital discrete event simulation  (runs SimPy engine)
  - ML forecasting pipeline             (trains + serves XGBoost models)
  - Telemetry snapshot persistence      (writes to Redis after each tick)
  - Scheduled periodic tasks            (Celery Beat)

Broker  : Redis (DB 1) — separate from cache/telemetry DB
Backend : Redis (DB 2) — task result storage

Task naming convention
----------------------
  hospital.<domain>.<action>

  hospital.simulation.run
  hospital.forecast.run
  hospital.telemetry.persist_snapshot

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from celery import Celery
from celery.signals import task_failure, task_postrun, task_prerun, worker_ready
from celery.utils.log import get_task_logger

from app.core.config import settings

# ── Structured logger ──────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)
task_logger = get_task_logger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Celery application factory
# ─────────────────────────────────────────────────────────────────────────────

def create_celery_app() -> Celery:
    """
    Instantiate and configure the Celery application.

    All configuration is read from pydantic Settings so nothing is
    hardcoded here.
    """
    app = Celery(
        "hospital_command_center",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=[
            "app.services.simulation_engine",
            "app.services.forecast_engine",
            "app.services.telemetry_service",
        ],
    )

    app.conf.update(
        # ── Serialisation ────────────────────────────────────────────────────
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        # ── Timezone ─────────────────────────────────────────────────────────
        timezone="UTC",
        enable_utc=True,
        # ── Task behaviour ───────────────────────────────────────────────────
        task_acks_late=True,             # ack only after task completes
        task_reject_on_worker_lost=True, # re-queue if worker dies mid-task
        task_soft_time_limit=settings.celery_task_soft_time_limit,
        task_time_limit=settings.celery_task_time_limit,
        worker_prefetch_multiplier=1,    # fair dispatch for long tasks
        # ── Result backend ───────────────────────────────────────────────────
        result_expires=3600,             # keep results 1 hour
        result_extended=True,            # store task metadata
        # ── Retry defaults ───────────────────────────────────────────────────
        task_max_retries=3,
        # ── Beat schedule (periodic tasks) ───────────────────────────────────
        beat_schedule={
            "run-simulation-every-15min": {
                "task": "hospital.simulation.run",
                "schedule": 900.0,       # every 15 minutes
                "args": [],
                "kwargs": {
                    "sim_hours": settings.sim_default_hours,
                    "telemetry_interval": settings.sim_telemetry_interval,
                    "seed": None,        # random each run
                },
                "options": {"queue": "simulation"},
            },
            "run-forecast-every-hour": {
                "task": "hospital.forecast.run",
                "schedule": 3600.0,      # every hour
                "args": [],
                "kwargs": {
                    "training_hours": settings.forecast_training_hours,
                    "seed": settings.sim_default_seed,
                },
                "options": {"queue": "forecast"},
            },
        },
        # ── Queue routing ─────────────────────────────────────────────────────
        task_routes={
            "hospital.simulation.*": {"queue": "simulation"},
            "hospital.forecast.*":   {"queue": "forecast"},
            "hospital.telemetry.*":  {"queue": "default"},
        },
    )

    return app


# ── Singleton Celery app ────────────────────────────────────────────────────────
celery_app: Celery = create_celery_app()


# ─────────────────────────────────────────────────────────────────────────────
# Celery signals — structured observability
# ─────────────────────────────────────────────────────────────────────────────

@worker_ready.connect
def on_worker_ready(sender: Any, **kwargs: Any) -> None:
    logger.info(
        "Celery worker ready | broker=%s | queues=simulation,forecast,default",
        settings.celery_broker_url,
    )


@task_prerun.connect
def on_task_prerun(
    task_id: str,
    task: Any,
    args: tuple,
    kwargs: dict,
    **extra: Any,
) -> None:
    task_logger.info(
        "TASK START | id=%s | name=%s | args=%s | kwargs=%s",
        task_id,
        task.name,
        args,
        {k: v for k, v in kwargs.items() if k != "api_key"},
    )


@task_postrun.connect
def on_task_postrun(
    task_id: str,
    task: Any,
    args: tuple,
    kwargs: dict,
    retval: Any,
    state: str,
    **extra: Any,
) -> None:
    task_logger.info(
        "TASK END | id=%s | name=%s | state=%s",
        task_id,
        task.name,
        state,
    )


@task_failure.connect
def on_task_failure(
    task_id: str,
    exception: Exception,
    traceback: Any,
    sender: Any,
    **kwargs: Any,
) -> None:
    task_logger.error(
        "TASK FAILED | id=%s | name=%s | error=%s: %s",
        task_id,
        sender.name,
        type(exception).__name__,
        exception,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Task definitions
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(
    name="hospital.simulation.run",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="simulation",
    track_started=True,
)
def run_simulation_task(
    self: Any,
    sim_hours: float = 24.0,
    telemetry_interval: float = 0.5,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Celery task: run the full hospital discrete event simulation.

    Wraps `run_hospital_simulation_task` from simulation_engine.py.
    After completion, persists the final telemetry snapshot to Redis
    so the FastAPI WebSocket bridge can serve it.

    Parameters
    ----------
    sim_hours : float
        Simulated hours to run.
    telemetry_interval : float
        Snapshot interval in sim-hours.
    seed : int | None
        RNG seed. None = random.

    Returns
    -------
    dict
        Summary statistics from the simulation run.
    """
    from app.services.simulation_engine import run_hospital_simulation_task
    from app.core.redis_client import sync_set_json

    task_logger.info(
        "Starting simulation task | sim_hours=%.1f | seed=%s",
        sim_hours, seed,
    )

    try:
        summary = run_hospital_simulation_task(
            sim_hours=sim_hours,
            telemetry_interval=telemetry_interval,
            redis_url=settings.redis_url,
            seed=seed,
        )

        # Persist summary to Redis for API reads
        summary["task_id"] = self.request.id
        summary["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        sync_set_json(
            key=f"simulation:result:{self.request.id}",
            value=summary,
            ttl=3600,
        )

        task_logger.info("Simulation task complete | task_id=%s", self.request.id)
        return summary

    except Exception as exc:
        task_logger.error("Simulation task failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(
    name="hospital.forecast.run",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="forecast",
    track_started=True,
)
def run_forecast_task(
    self: Any,
    training_hours: int = 8760,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Celery task: train ML models and generate a 12-hour hospital forecast.

    Wraps `run_forecasting_pipeline` from forecast_engine.py.
    Persists the forecast result to Redis under the canonical key
    `hospital:latest_forecast` so the AI copilot and API can read it.

    Parameters
    ----------
    training_hours : int
        Hours of synthetic history to generate for training.
    seed : int
        RNG seed for reproducibility.

    Returns
    -------
    dict
        Pipeline result including MAE scores and forecast values.
    """
    from app.services.forecast_engine import run_forecasting_pipeline
    from app.core.redis_client import sync_set_json

    task_logger.info(
        "Starting forecast task | training_hours=%d | seed=%d",
        training_hours, seed,
    )

    try:
        result = run_forecasting_pipeline(
            n_training_hours=training_hours,
            seed=seed,
        )

        # Persist canonical forecast for copilot + API reads
        forecast_payload = result.get("forecast", {})
        forecast_payload["task_id"] = self.request.id
        sync_set_json(
            key=settings.redis_forecast_key,
            value=forecast_payload,
            ttl=7200,   # valid for 2 hours
        )

        # Also persist full result under task ID
        result["task_id"] = self.request.id
        result["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        sync_set_json(
            key=f"forecast:result:{self.request.id}",
            value=result,
            ttl=3600,
        )

        task_logger.info("Forecast task complete | task_id=%s", self.request.id)
        return result

    except Exception as exc:
        task_logger.error("Forecast task failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(
    name="hospital.telemetry.persist_snapshot",
    bind=False,
    queue="default",
    ignore_result=True,    # fire-and-forget
)
def persist_telemetry_snapshot(telemetry_json: str) -> None:
    """
    Celery task: persist a single telemetry snapshot to Redis.

    Called by the simulation worker after each telemetry tick to ensure
    the latest snapshot is always available at the canonical Redis key
    `hospital:latest_telemetry`.

    Parameters
    ----------
    telemetry_json : str
        JSON-encoded HospitalTelemetryEvent.
    """
    from app.core.redis_client import sync_set_json

    try:
        data = json.loads(telemetry_json)
        sync_set_json(
            key=settings.redis_telemetry_key,
            value=data,
            ttl=300,   # 5-minute TTL; refreshed on every tick
        )
        task_logger.debug("Telemetry snapshot persisted to Redis.")
    except (json.JSONDecodeError, Exception) as exc:
        task_logger.error("Failed to persist telemetry snapshot: %s", exc)