#!/usr/bin/env python3
"""
Celery Worker Startup Script for AI Hospital Command Center
============================================================

This script ensures proper task registration and worker initialization.

Usage:
    python start_celery_worker.py

Features:
    - Explicit task module loading before worker starts
    - Proper queue configuration
    - Debug logging
    - Graceful shutdown
"""

import sys
import logging
import subprocess
import os

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

logger.info("="*80)
logger.info("CELERY WORKER STARTUP")
logger.info("="*80)

# Import and verify celery_app
logger.info("\n[1] Loading Celery app...")
try:
    from worker.celery_app import celery_app
    logger.info("✓ Celery app loaded")
except Exception as e:
    logger.error(f"✗ Failed to load celery app: {e}")
    sys.exit(1)

# Verify task registration
logger.info("\n[2] Verifying task registration...")
try:
    hospital_tasks = [t for t in celery_app.tasks.keys() if 'hospital' in t]
    if hospital_tasks:
        logger.info(f"✓ Found {len(hospital_tasks)} hospital tasks:")
        for task_name in sorted(hospital_tasks):
            logger.info(f"    - {task_name}")
    else:
        logger.error("✗ No hospital tasks found!")
        logger.error(f"   Available tasks: {list(celery_app.tasks.keys())[:10]}")
        sys.exit(1)
except Exception as e:
    logger.error(f"✗ Error checking tasks: {e}")
    sys.exit(1)

# Verify configuration
logger.info("\n[3] Celery Configuration:")
logger.info(f"    Broker: {celery_app.conf.broker_url}")
logger.info(f"    Backend: {celery_app.conf.result_backend}")
logger.info(f"    Serializer: {celery_app.conf.task_serializer}")
logger.info(f"    Pool: {celery_app.conf.worker_pool}")
logger.info(f"    Prefetch: {celery_app.conf.worker_prefetch_multiplier}")
logger.info(f"    ACKs Late: {celery_app.conf.task_acks_late}")

# Start worker using subprocess (most reliable method)
logger.info("\n[4] Starting Celery worker...")
logger.info("    Listening queues: simulation, forecast, default")
logger.info("    Log level: INFO")
logger.info("    Concurrency: 4 threads")
logger.info("    Press Ctrl+C to stop\n")

if __name__ == "__main__":
    try:
        # Use python -m celery to ensure proper module loading
        cmd = [
            sys.executable,
            "-m", "celery",
            "-A", "worker",
            "worker",
            "-Q", "simulation,forecast,default",
            "-l", "info",
            "--concurrency=4",
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            "--time-limit=3600",
            "--soft-time-limit=3300",
        ]
        
        logger.info(f"Running: {' '.join(cmd)}\n")
        
        # Run celery worker
        result = subprocess.run(cmd, cwd=os.getcwd())
        sys.exit(result.returncode)
        
    except KeyboardInterrupt:
        logger.info("\n\nWorker stopped.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Failed to start worker: {e}")
        sys.exit(1)
