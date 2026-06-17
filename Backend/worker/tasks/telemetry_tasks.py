# backend/worker/tasks/telemetry_tasks.py
"""
AI Hospital Command Center — Telemetry Persistence Task Module
=============================================================
Importable task target for Celery autodiscovery:
    include=["worker.tasks.telemetry_tasks"]

Publishes the fire-and-forget task
"hospital.telemetry.persist_snapshot".

Called by the simulation worker after every telemetry tick to
ensure the latest snapshot is always available at the canonical
Redis key "hospital:latest_telemetry" for REST API polling
and copilot context injection.

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging

from worker.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="hospital.telemetry.persist_snapshot",
    bind=False,
    queue="default",
    ignore_result=True,   # fire-and-forget; caller doesn't need the result
    max_retries=1,
    default_retry_delay=5,
)
def persist_snapshot(telemetry_json: str) -> None:
    """
    Persist a single telemetry snapshot to Redis.

    Called by the simulation worker on every telemetry tick.
    Uses a 5-minute TTL — refreshed on every tick so the key
    never expires while the simulation is running.

    Parameters
    ----------
    telemetry_json : str
        JSON-encoded HospitalTelemetryEvent from sim_engine.py.
    """
    from app.core.redis_client import sync_set_json, sync_publish

    try:
        data = json.loads(telemetry_json)
        sync_set_json(
            key=settings.redis_telemetry_key,
            value=data,
            ttl=300,   # 5-minute TTL refreshed on every tick
        )
        sync_publish(
            channel=settings.redis_telemetry_channel,
            message=data,
        )
        logger.debug(
            "[telemetry] Snapshot persisted | event_id=%s alert=%s queue=%d",
            data.get("event_id", "?"),
            data.get("global_alert", "?"),
            data.get("total_queue", 0),
        )
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("[telemetry] Persist failed: %s", exc)
