# backend/worker/tasks/forecast_tasks.py
"""
AI Hospital Command Center — Forecast Celery Task Module
=========================================================
Importable task target for Celery autodiscovery:
    include=["worker.tasks.forecast_tasks"]

Publishes the canonical task "hospital.forecast.run".
Stores the result at settings.redis_forecast_key so the
AI copilot and REST API can read it without hitting Celery.

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from worker.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="hospital.forecast.run",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="forecast",
    track_started=True,
    soft_time_limit=settings.celery_task_soft_time_limit,
    time_limit=settings.celery_task_time_limit,
)
def run_forecast(
    self: Any,
    training_hours: int = 8760,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Celery task: train ML models and produce a 12-hour forecast.

    Parameters
    ----------
    training_hours : int
        Hours of synthetic data to generate for training.
    seed : int
        RNG seed for reproducible training runs.

    Returns
    -------
    dict
        Full pipeline result including MAE scores and forecast values.
    """
    from app.services.forecast_engine import run_forecasting_pipeline
    from app.core.redis_client import sync_set_json

    logger.info(
        "[forecast] Starting | task_id=%s training_hours=%d seed=%d",
        self.request.id, training_hours, seed,
    )

    try:
        result = run_forecasting_pipeline(
            n_training_hours=training_hours,
            seed=seed,
        )

        # Store canonical forecast for copilot + REST API
        forecast_payload = result.get("forecast", {})
        forecast_payload["task_id"] = self.request.id
        sync_set_json(
            key=settings.redis_forecast_key,
            value=forecast_payload,
            ttl=7200,
        )

        # Store full result keyed by task ID
        result["task_id"]      = self.request.id
        result["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        sync_set_json(
            key=f"forecast:result:{self.request.id}",
            value=result,
            ttl=3600,
        )

        logger.info(
            "[forecast] Complete | task_id=%s risk=%s",
            self.request.id,
            forecast_payload.get("risk_level", "?"),
        )
        return result

    except Exception as exc:
        logger.error("[forecast] Failed | task_id=%s error=%s", self.request.id, exc)
        raise self.retry(exc=exc, countdown=60)
