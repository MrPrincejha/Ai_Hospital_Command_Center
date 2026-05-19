
# backend/app/services/telemetry_service.py

from __future__ import annotations

import asyncio
import random
from datetime import datetime

from app.core.config import settings
from app.core.redis_client import publish, set_json


async def telemetry_loop() -> None:
    """
    Mock telemetry producer loop.
    Continuously publishes telemetry snapshots to Redis.
    """

    while True:
        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "bed_occupancy": random.randint(55, 98),
            "icu_occupancy": random.randint(40, 95),
            "waiting_patients": random.randint(5, 40),
            "emergency_load": random.choice([
                "LOW",
                "MODERATE",
                "HIGH",
                "CRITICAL",
            ]),
        }

        await set_json(
            settings.redis_telemetry_key,
            payload,
        )

        await publish(
            settings.redis_telemetry_channel,
            payload,
        )

        await asyncio.sleep(5)
