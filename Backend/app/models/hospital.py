# backend/app/models/hospital.py
"""
AI Hospital Command Center — SQLAlchemy Database Models
=======================================================
Async SQLAlchemy ORM models for persistent operational data.

Tables:
  simulation_runs   — history of every simulation task
  telemetry_snapshots — persisted telemetry tick archive
  forecast_results  — ML forecast history for trend analysis
  clinical_reports  — screened report audit trail

These models complement Redis (real-time) and MongoDB (documents)
with structured relational storage for reporting and audit.

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ── Base class ─────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Simulation Runs
# ─────────────────────────────────────────────────────────────────────────────

class SimulationRun(Base):
    """
    Persists metadata and summary results for every simulation task.
    Enables audit trail and historical trend analysis.
    """

    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    task_id: Mapped[str]      = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str]       = mapped_column(String(20), default="PENDING")
    sim_hours: Mapped[float]  = mapped_column(Float, nullable=False)
    seed: Mapped[int | None]  = mapped_column(Integer, nullable=True)

    # Result summary (JSON blob from Celery task)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<SimulationRun task_id={self.task_id} status={self.status}>"


# ─────────────────────────────────────────────────────────────────────────────
# Telemetry Snapshots
# ─────────────────────────────────────────────────────────────────────────────

class TelemetrySnapshot(Base):
    """
    Archived telemetry events for historical dashboard views.
    High-write table — partition by day in production.
    """

    __tablename__ = "telemetry_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str]     = mapped_column(String(64), unique=True, index=True)
    sim_run_task_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    # Aggregated metrics
    global_alert: Mapped[str]       = mapped_column(String(20))
    total_queue: Mapped[int]         = mapped_column(Integer)
    icu_occupancy_pct: Mapped[float] = mapped_column(Float)
    er_congestion_pct: Mapped[float] = mapped_column(Float)

    # Full snapshot JSON (all department snapshots)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    # Timestamps
    sim_time: Mapped[float]      = mapped_column(Float)
    wall_time: Mapped[float]     = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<TelemetrySnapshot event_id={self.event_id} "
            f"alert={self.global_alert} queue={self.total_queue}>"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Forecast Results
# ─────────────────────────────────────────────────────────────────────────────

class ForecastResult(Base):
    """
    Persisted ML forecast results for trend tracking and model evaluation.
    """

    __tablename__ = "forecast_results"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    task_id: Mapped[str]           = mapped_column(String(64), unique=True, index=True)
    icu_occupancy_t12: Mapped[float] = mapped_column(Float)
    er_congestion_t12: Mapped[float] = mapped_column(Float)
    patient_inflow_t12: Mapped[int]  = mapped_column(Integer)
    risk_level: Mapped[str]          = mapped_column(String(20))
    model_mae_icu: Mapped[float]     = mapped_column(Float)
    model_mae_er: Mapped[float]      = mapped_column(Float)
    training_hours: Mapped[int]      = mapped_column(Integer)

    # Top feature importances JSON
    feature_importances: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<ForecastResult task_id={self.task_id} risk={self.risk_level}>"


# ─────────────────────────────────────────────────────────────────────────────
# Clinical Reports
# ─────────────────────────────────────────────────────────────────────────────

class ClinicalReport(Base):
    """
    Audit trail for all screened clinical reports.
    Stores anonymised results only — no raw PHI.
    """

    __tablename__ = "clinical_reports"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    report_id: Mapped[str]    = mapped_column(String(64), index=True)
    patient_ref: Mapped[str]  = mapped_column(String(64))  # anonymised ref only

    # Screening results
    total_urgency_score: Mapped[int] = mapped_column(Integer)
    triage_tier: Mapped[str]         = mapped_column(String(30))
    anomalies_extracted: Mapped[int] = mapped_column(Integer)
    critical_flag_count: Mapped[int] = mapped_column(Integer, default=0)
    llm_model_used: Mapped[str]      = mapped_column(String(64))
    scoring_duration_ms: Mapped[float] = mapped_column(Float)
    used_mock_llm: Mapped[bool]        = mapped_column(Boolean, default=False)

    # Scored anomalies JSON (no raw report text — PHI concern)
    scored_anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    critical_flags: Mapped[list | None]   = mapped_column(JSON, nullable=True)

    screened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<ClinicalReport report_id={self.report_id} "
            f"score={self.total_urgency_score} tier={self.triage_tier}>"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Patient Encounters
# ─────────────────────────────────────────────────────────────────────────────

class PatientEncounter(Base):
    """
    Source of truth for patient flow. Every real or simulated hospital visit
    is logged here. This table acts as the foundation for the forecasting engine.
    """

    __tablename__ = "patient_encounters"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    mrn: Mapped[str] = mapped_column(String(12))
    arrival_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=datetime.utcnow, 
        index=True
    )
    triage_level: Mapped[int] = mapped_column(Integer)
    department: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="Waiting")
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<PatientEncounter mrn={self.mrn} dept={self.department} status={self.status}>"