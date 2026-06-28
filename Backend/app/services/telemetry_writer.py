# backend/app/services/telemetry_writer.py
import logging
from datetime import datetime
from sqlalchemy import text
from app.core.database import async_engine

logger = logging.getLogger(__name__)

async def write_snapshot(snapshot: dict) -> None:
    """
    Asynchronously writes a telemetry snapshot into the TimescaleDB hypertable.
    """
    try:
        er_queue = snapshot.get("er_queue", 0)
        icu_occ = snapshot.get("icu_occupancy_pct", 0.0)
        ward_occ = snapshot.get("ward_occupancy_pct", 0.0)
        inflow_t12 = snapshot.get("patient_inflow_t12", 0)
        avg_acuity = snapshot.get("avg_acuity", 3.0)
        
        async with async_engine.begin() as conn:
            query = text("""
                INSERT INTO telemetry_snapshots 
                (ts, er_queue, icu_occ, ward_occ, inflow_t12, avg_acuity)
                VALUES (:ts, :er_queue, :icu_occ, :ward_occ, :inflow_t12, :avg_acuity)
            """)
            await conn.execute(
                query,
                {
                    "ts": datetime.utcnow(),
                    "er_queue": er_queue,
                    "icu_occ": icu_occ,
                    "ward_occ": ward_occ,
                    "inflow_t12": inflow_t12,
                    "avg_acuity": avg_acuity
                }
            )
    except Exception as exc:
        logger.error(f"Failed to write telemetry snapshot to TimescaleDB: {exc}")
