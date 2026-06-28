"""
AI Hospital Command Center — Simulation Celery Task Module
==========================================================
This module is the importable task target listed in celery_app.py:
    include=["worker.tasks.simulation_tasks"]

It re-exports the simulation task from celery_app so Celery's
autodiscovery can find it under the canonical task name
"hospital.simulation.run".
"""

from __future__ import annotations

import logging
import time
from typing import Any

from worker.celery_app import celery_app
from app.core.config import settings

# ── Import Relational Persistence Dependencies ───────────────────────────────
from app.core.database import SyncSessionLocal
from app.models.simulation import SimulationResultModel

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
    the result to both Redis (for real-time polling) and PostgreSQL (long-term data warehouse).
    """
    from app.services.simulation_engine import run_hospital_simulation_task
    from app.core.redis_client import sync_set_json

    logger.info(
        "[simulation] Starting | task_id=%s sim_hours=%.1f seed=%s",
        self.request.id, sim_hours, seed,
    )

    try:
        # 1. Execute the SimPy Simulation Engine Engine
        summary = run_hospital_simulation_task(
            sim_hours=sim_hours,
            telemetry_interval=telemetry_interval,
            redis_url=settings.redis_url,
            seed=seed,
        )

        summary["task_id"]      = self.request.id
        summary["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # 2. Long-Term Persistence: Save to Docker PostgreSQL
        db = SyncSessionLocal()
        try:
            db_record = SimulationResultModel(
                task_id=self.request.id,
                sim_hours=sim_hours,
                seed=seed if seed is not None else 42,
                department_summary=summary.get("department_summary", {})
            )
            db.add(db_record)
            db.commit()
            logger.info("[simulation] Successfully committed result to PostgreSQL | task_id=%s", self.request.id)
        except Exception as db_err:
            db.rollback()
            logger.error("[simulation] Database insertion aborted | task_id=%s error=%s", self.request.id, db_err)
            # We log the error but don't crash the task if Redis caching succeeded
        finally:
            db.close()

        # 3. Fast Cache Persistence: Persist result for API polling
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