# backend/worker/tasks/simulation_tasks.py
"""
AI Hospital Command Center — Simulation Celery Task Module
==========================================================
This module is the importable task target listed in celery_app.py:
    include=["worker.tasks.simulation_tasks"]

It re-exports the simulation task from celery_app so Celery's
autodiscovery can find it under the canonical task name
"hospital.simulation.run".

Having a dedicated module per task domain keeps the include list clean
and allows future expansion (e.g. per-department sub-simulations)
without touching celery_app.py.

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import logging
import time
from typing import Any

from worker.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="hospital.simulation.run",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="simulation",
    track_started=True,
    soft_time_limit=settings.celery_task_soft_time_limit,
    time_limit=settings.celery_task_time_limit,
)
def run_simulation(
    self: Any,
    sim_hours: float = 24.0,
    telemetry_interval: float = 0.5,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Celery task: run a full hospital discrete event simulation.

    Delegates to the core engine in sim_engine.py and persists
    the result to Redis for API consumption.

    Parameters
    ----------
    sim_hours : float
        Simulated duration in hours.
    telemetry_interval : float
        How often (sim-hours) to emit a telemetry snapshot.
    seed : int | None
        RNG seed. None = random.

    Returns
    -------
    dict
        Simulation summary statistics.
    """
    from app.services.simulation_engine import run_hospital_simulation_task
    from app.core.redis_client import sync_set_json

    logger.info(
        "[simulation] Starting | task_id=%s sim_hours=%.1f seed=%s",
        self.request.id, sim_hours, seed,
    )

    try:
        summary = run_hospital_simulation_task(
            sim_hours=sim_hours,
            telemetry_interval=telemetry_interval,
            redis_url=settings.redis_url,
            seed=seed,
        )

        summary["task_id"]      = self.request.id
        summary["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Persist result for API polling
        sync_set_json(
            key=f"simulation:result:{self.request.id}",
            value=summary,
            ttl=3600,
        )

        logger.info("[simulation] Complete | task_id=%s", self.request.id)
        return summary

    except Exception as exc:
        logger.error("[simulation] Failed | task_id=%s error=%s", self.request.id, exc)
        raise self.retry(exc=exc, countdown=30)
