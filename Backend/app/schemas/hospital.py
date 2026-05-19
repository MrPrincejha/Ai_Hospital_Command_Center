# backend/app/schemas/hospital.py
"""
AI Hospital Command Center — Pydantic API Schemas
==================================================
All request and response models for every API endpoint.

Naming convention
-----------------
  <Domain><Action>Request   — inbound payload
  <Domain><Action>Response  — outbound payload
  <Domain>Schema            — shared data shape (used in both)

These schemas are the contract between frontend and backend.
They are also used by FastAPI to generate the OpenAPI spec automatically.

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# Shared / primitive schemas
# ─────────────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Response for GET /health"""

    status: Literal["ok", "degraded", "error"]
    version: str
    environment: str
    redis_connected: bool
    timestamp: str

    model_config = {"json_schema_extra": {"example": {
        "status": "ok",
        "version": "1.0.0",
        "environment": "development",
        "redis_connected": True,
        "timestamp": "2024-06-01T09:00:00Z",
    }}}


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: str
    detail: str | None = None
    code: int


# ─────────────────────────────────────────────────────────────────────────────
# Department / Telemetry schemas
# ─────────────────────────────────────────────────────────────────────────────

class DepartmentSnapshotSchema(BaseModel):
    """Single department operational snapshot (mirrors sim_engine dataclass)."""

    department: str
    sim_time: float
    wall_time: float
    queue_length: int
    patients_in_service: int
    patients_completed: int
    avg_wait_time: float = Field(description="Average wait time in hours")
    server_utilization: float = Field(ge=0.0, le=1.0)
    congestion_probability: float = Field(ge=0.0, le=1.0)
    overflow_events: int
    throughput_per_hour: float
    alert_level: Literal["normal", "warning", "critical"]


class TelemetryEventSchema(BaseModel):
    """Full hospital telemetry event (mirrors HospitalTelemetryEvent)."""

    event_id: str
    event_type: Literal["telemetry_tick", "alert", "sim_complete"]
    timestamp: float
    snapshots: list[DepartmentSnapshotSchema]
    global_alert: Literal["normal", "warning", "critical"]
    total_queue: int
    icu_occupancy_pct: float = Field(ge=0.0, le=1.0)
    er_congestion_pct: float = Field(ge=0.0, le=1.0)


class TelemetryResponse(BaseModel):
    """Response for GET /api/telemetry/latest"""

    available: bool
    fetched_at: str
    data: TelemetryEventSchema | None = None
    message: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Simulation schemas
# ─────────────────────────────────────────────────────────────────────────────

class SimulationStartRequest(BaseModel):
    """Request body for POST /api/simulation/start"""

    sim_hours: float = Field(
        default=24.0,
        ge=1.0,
        le=168.0,
        description="Simulation horizon in hours (1–168).",
    )
    telemetry_interval: float = Field(
        default=0.5,
        ge=0.1,
        le=4.0,
        description="Telemetry snapshot interval in sim-hours.",
    )
    seed: int | None = Field(
        default=None,
        description="Random seed for reproducibility. None = random.",
    )

    model_config = {"json_schema_extra": {"example": {
        "sim_hours": 24.0,
        "telemetry_interval": 0.5,
        "seed": 42,
    }}}


class SimulationStartResponse(BaseModel):
    """Response for POST /api/simulation/start"""

    task_id: str
    status: str
    message: str
    sim_hours: float
    seed: int | None


class SimulationStatusResponse(BaseModel):
    """Response for GET /api/simulation/status/{task_id}"""

    task_id: str
    status: Literal["PENDING", "STARTED", "SUCCESS", "FAILURE", "RETRY", "REVOKED"]
    result: dict[str, Any] | None = None
    error: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Forecast schemas
# ─────────────────────────────────────────────────────────────────────────────

class ForecastTriggerRequest(BaseModel):
    """Request body for POST /api/forecast/run"""

    training_hours: int = Field(
        default=8760,
        ge=720,
        le=87600,
        description="Hours of training data to generate (min 720 = 1 month).",
    )
    seed: int = Field(default=42)

    model_config = {"json_schema_extra": {"example": {
        "training_hours": 8760,
        "seed": 42,
    }}}


class ForecastResultSchema(BaseModel):
    """Forecast output from ML engine."""

    forecast_horizon_hours: int
    generated_at: str
    icu_occupancy_t12: float = Field(ge=0.0, le=1.0)
    er_congestion_t12: float = Field(ge=0.0, le=1.0)
    patient_inflow_t12: int
    risk_level: Literal["low", "medium", "high", "critical"]
    model_mae_icu: float
    model_mae_er: float
    top_features: dict[str, float] = Field(default_factory=dict)


class ForecastResponse(BaseModel):
    """Response for GET /api/forecast/latest"""

    available: bool
    fetched_at: str
    data: ForecastResultSchema | None = None
    message: str | None = None


class ForecastTaskResponse(BaseModel):
    """Response for POST /api/forecast/run"""

    task_id: str
    status: str
    message: str


# ─────────────────────────────────────────────────────────────────────────────
# Clinical screening schemas
# ─────────────────────────────────────────────────────────────────────────────

class ClinicalScreenRequest(BaseModel):
    """Request body for POST /api/clinical/screen"""

    report_text: str = Field(
        min_length=20,
        max_length=50_000,
        description="Full text of the lab / clinical report.",
    )
    report_id: str = Field(
        default="RPT-UNKNOWN",
        description="Unique report identifier for audit trail.",
    )
    patient_ref: str = Field(
        default="ANON",
        description="Anonymised patient reference.",
    )
    use_mock_llm: bool = Field(
        default=False,
        description="Use built-in mock LLM for testing (no API key required).",
    )

    @field_validator("report_text")
    @classmethod
    def strip_report(cls, v: str) -> str:
        return v.strip()

    model_config = {"json_schema_extra": {"example": {
        "report_text": "WBC 18.5 10^9/L (4.0-11.0) H\nPlatelets 45 10^9/L (150-400) LL",
        "report_id": "RPT-2024-001",
        "patient_ref": "PT-998877",
        "use_mock_llm": False,
    }}}


class ScoredAnomalySchema(BaseModel):
    """Single scored biomarker anomaly."""

    biomarker: str
    value: float
    unit: str
    direction: Literal["NORMAL", "LOW", "HIGH", "CRITICAL_LOW", "CRITICAL_HIGH"]
    reference_min: float
    reference_max: float
    severity_score: int = Field(ge=0, le=30)
    severity_label: Literal["normal", "mild", "moderate", "severe", "critical"]
    clinical_note: str


class ClinicalScreenResponse(BaseModel):
    """Response for POST /api/clinical/screen"""

    report_id: str
    patient_ref: str
    processed_at: str
    raw_report_excerpt: str
    anomalies_extracted: int
    scored_anomalies: list[ScoredAnomalySchema]
    total_urgency_score: int = Field(ge=0, le=100)
    triage_tier: Literal["IMMEDIATE", "URGENT", "SEMI_URGENT", "NON_URGENT"]
    critical_flags: list[str]
    llm_model_used: str
    scoring_duration_ms: float
    disclaimer: str


# ─────────────────────────────────────────────────────────────────────────────
# AI Copilot schemas
# ─────────────────────────────────────────────────────────────────────────────

class CopilotQueryRequest(BaseModel):
    """Request body for POST /api/copilot/query"""

    query: str = Field(
        min_length=3,
        max_length=2000,
        description="Natural language operational query.",
    )
    session_id: str = Field(
        default="default",
        description="Conversation session ID for history continuity.",
        max_length=64,
    )
    use_mock: bool = Field(
        default=False,
        description="Use mock copilot (no LLM API key required).",
    )

    @field_validator("session_id")
    @classmethod
    def sanitise_session(cls, v: str) -> str:
        import re
        return re.sub(r"[^a-zA-Z0-9_\-]", "", v)[:64]

    model_config = {"json_schema_extra": {"example": {
        "query": "Why is the ER so congested right now?",
        "session_id": "dashboard-user-1",
        "use_mock": False,
    }}}


class CopilotQueryResponse(BaseModel):
    """Response for POST /api/copilot/query"""

    session_id: str
    query: str
    response: str
    telemetry_snapshot: dict[str, Any]
    forecast_snapshot: dict[str, Any]
    model_used: str
    latency_ms: float
    generated_at: str
    tokens_used: int | None = None


class CopilotClearRequest(BaseModel):
    """Request body for POST /api/copilot/clear"""

    session_id: str = Field(min_length=1, max_length=64)


class CopilotClearResponse(BaseModel):
    """Response for POST /api/copilot/clear"""

    session_id: str
    cleared: bool
    message: str


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket message schemas
# ─────────────────────────────────────────────────────────────────────────────

class WebSocketMessage(BaseModel):
    """
    Envelope for all messages sent over WebSocket to dashboard clients.
    """

    type: Literal[
        "telemetry_update",
        "forecast_update",
        "alert",
        "heartbeat",
        "connection_ack",
        "error",
    ]
    payload: dict[str, Any]
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_json(self) -> str:
        return self.model_dump_json()


class WebSocketSubscribeMessage(BaseModel):
    """
    Inbound message from a WebSocket client requesting a specific channel.
    """

    action: Literal["subscribe", "unsubscribe", "ping"]
    channel: str | None = None
