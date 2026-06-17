# backend/worker/celery_app.py

from __future__ import annotations

import logging
from typing import Any

from celery import Celery
from celery.signals import (
    task_failure,
    task_postrun,
    task_prerun,
    worker_ready,
)
from celery.utils.log import get_task_logger

from app.core.config import settings

# -------------------------------------------------------------------
# Logging
# -------------------------------------------------------------------

logger = logging.getLogger(__name__)
task_logger = get_task_logger(__name__)


# -------------------------------------------------------------------
# Celery Factory
# -------------------------------------------------------------------

def create_celery_app() -> Celery:
    """
    Create and configure Celery application.
    
    FIX: Use autodiscover_tasks() instead of include[] to avoid circular imports.
    This is the standard Celery pattern and auto-discovers all tasks in worker.tasks
    """

    app = Celery(
        "hospital_command_center",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
    )
    # app.autodiscover_tasks(['worker.tasks'])
    app.conf.update(

        # -----------------------------------------------------------
        # Serialization
        # -----------------------------------------------------------

        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],

        # -----------------------------------------------------------
        # Timezone
        # -----------------------------------------------------------

        timezone="UTC",
        enable_utc=True,

        # -----------------------------------------------------------
        # Worker Pool (CRITICAL FIX)
        # -----------------------------------------------------------
        # Force threading pool instead of solo mode for concurrent task execution
        worker_pool="threads",
        worker_max_tasks_per_child=None,  # No recycling for thread pool
        
        # -----------------------------------------------------------
        # Reliability
        # -----------------------------------------------------------

        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=4,  # Allow fetching multiple tasks

        # -----------------------------------------------------------
        # Task limits
        # -----------------------------------------------------------

        task_soft_time_limit=settings.celery_task_soft_time_limit,
        task_time_limit=settings.celery_task_time_limit,

        # -----------------------------------------------------------
        # Results
        # -----------------------------------------------------------

        result_expires=3600,
        result_extended=True,

        # -----------------------------------------------------------
        # Retry defaults
        # -----------------------------------------------------------

        task_max_retries=3,

        # -----------------------------------------------------------
        # Queue routing
        # -----------------------------------------------------------

        task_routes={
            "hospital.simulation.*": {
                "queue": "simulation"
            },

            "hospital.forecast.*": {
                "queue": "forecast"
            },

            "hospital.telemetry.*": {
                "queue": "default"
            },
        },

        # -----------------------------------------------------------
        # Beat Schedule
        # -----------------------------------------------------------

        beat_schedule={

            # Auto simulation every 15 min
            "run-simulation-every-15min": {
                "task": "hospital.simulation.run",

                "schedule": 900.0,

                "kwargs": {
                    "sim_hours": settings.sim_default_hours,
                    "telemetry_interval": settings.sim_telemetry_interval,
                    "seed": None,
                },

                "options": {
                    "queue": "simulation"
                },
            },

            # Auto forecast every hour
            "run-forecast-every-hour": {
                "task": "hospital.forecast.run",

                "schedule": 3600.0,

                "kwargs": {
                    "training_hours": settings.forecast_training_hours,
                    "seed": settings.sim_default_seed,
                },

                "options": {
                    "queue": "forecast"
                },
            },
        },
    )

    return app


# -------------------------------------------------------------------
# Singleton
# -------------------------------------------------------------------

celery_app: Celery = create_celery_app()

# -------------------------------------------------------------------
# Worker Signals
# -------------------------------------------------------------------

@worker_ready.connect
def on_worker_ready(sender: Any, **kwargs: Any) -> None:
    """
    Called when Celery worker is ready to process tasks.
    """
    logger.info(
        f"✓ Celery worker started | broker={settings.celery_broker_url}"
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
        "TASK START | id=%s | name=%s",
        task_id,
        task.name,
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
        "TASK FAILED | id=%s | task=%s | error=%s",
        task_id,
        sender.name,
        str(exception),
    )


# -------------------------------------------------------------------
# Helper Accessors
# -------------------------------------------------------------------

def get_simulation_task() -> Any:
    return celery_app.tasks["hospital.simulation.run"]


def get_forecast_task() -> Any:
    return celery_app.tasks["hospital.forecast.run"]


# -------------------------------------------------------------------
# Task Registration (MUST be after celery_app and all signal handlers)
# -------------------------------------------------------------------

# Import task modules to register them with @celery_app.task decorators.
# This is done at module-level here (NOT in functions) so that:
# 1. In the API/client process: Tasks are registered when celery_app is imported
# 2. In the worker process: Tasks are available when worker starts
#
# This works because:
# - celery_app is fully initialized before we import task modules
# - all signal handlers (worker_ready, task_prerun, etc.) are already connected
# - when task modules do "from worker.celery_app import celery_app", the module
#   is already in sys.modules with the complete celery_app object
#
from worker.tasks import simulation_tasks, forecast_tasks, telemetry_tasks  # noqa: F401, E402
