# backend/app/core/config.py
"""
AI Hospital Command Center — Application Configuration
=======================================================
Single source of truth for every runtime setting.

All values are read from environment variables (or a .env file loaded
by python-dotenv at startup).  Pydantic-Settings validates and coerces
types at import time so misconfiguration fails fast.

Usage
-----
    from app.core.config import settings

    print(settings.redis_url)
    print(settings.openai_api_key.get_secret_value())

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import AnyUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """
    Application settings resolved from environment / .env.

    Sections
    --------
    - Application metadata
    - Security
    - Database URLs  (PostgreSQL, MongoDB, Redis)
    - LLM / AI
    - Simulation defaults
    - Celery
    - CORS
    - Observability
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # silently ignore unknown env vars
    )

    # ── Application ────────────────────────────────────────────────────────────
    app_name: str = Field(
        default="AI Hospital Command Center",
        description="Human-readable service name.",
    )
    app_version: str = Field(default="1.0.0")
    environment: Literal["development", "staging", "production"] = Field(
        default="development"
    )
    debug: bool = Field(default=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO"
    )

    # ── Security ───────────────────────────────────────────────────────────────
    secret_key: SecretStr = Field(
        default=SecretStr("CHANGE_ME_IN_PRODUCTION_32_CHARS_MIN"),
        description="Used for JWT signing and session encryption.",
    )
    api_key_header: str = Field(
        default="X-API-Key",
        description="HTTP header name for API key authentication.",
    )
    internal_api_key: SecretStr = Field(
        default=SecretStr("hospital-internal-key"),
        description="Bearer key for inter-service calls (Celery → FastAPI).",
    )

    # ── PostgreSQL ─────────────────────────────────────────────────────────────
    postgres_url: str = Field(
        default="postgresql+asyncpg://hospital:hospital@localhost:5432/hospital_db",
        description="Async PostgreSQL DSN used by SQLAlchemy.",
    )
    postgres_pool_size: int = Field(default=10)
    postgres_max_overflow: int = Field(default=20)

    # ── MongoDB ────────────────────────────────────────────────────────────────
    mongo_uri: str = Field(
        default="mongodb://localhost:27017",
        description="MongoDB connection URI.",
    )
    mongo_db_name: str = Field(default="hospital_logs")

    # ── Redis ──────────────────────────────────────────────────────────────────
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL (used by Celery, pub/sub, cache).",
    )
    redis_telemetry_key: str = Field(
        default="hospital:latest_telemetry",
        description="Redis key where sim worker stores latest telemetry JSON.",
    )
    
    redis_forecast_key: str = Field(
        default="hospital:latest_forecast",
        description="Redis key where forecaster stores latest forecast JSON.",
    )
    redis_telemetry_channel: str = Field(
        default="hospital:telemetry",
        description="Redis pub/sub channel for real-time telemetry events.",
    )

    telemetry_interval_seconds: int = Field(
    default=5,
    description="Interval for background telemetry publishing loop.",
)
    redis_socket_timeout: int = Field(default=5)

    # ── LLM / OpenAI ──────────────────────────────────────────────────────────
    openai_api_key: SecretStr = Field(
        default=SecretStr("sk-placeholder"),
        description="OpenAI API key — set in .env or environment.",
    )
    llm_model: str = Field(
        default="gpt-4o-mini",
        description="Default LLM model for copilot and clinical screening.",
    )
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_max_tokens: int = Field(default=1200, ge=100, le=4096)

    # ── Simulation defaults ────────────────────────────────────────────────────
    sim_default_hours: float = Field(
        default=24.0,
        description="Default simulation horizon in hours.",
    )
    sim_telemetry_interval: float = Field(
        default=0.5,
        description="How often (sim-hours) to emit a telemetry snapshot.",
    )
    sim_default_seed: int = Field(default=42)

    # ── Forecasting ────────────────────────────────────────────────────────────
    forecast_training_hours: int = Field(
        default=8760,
        description="Hours of synthetic history to generate for initial training.",
    )
    model_dir: str = Field(
        default="/tmp/hospital_models",
        description="Directory where trained model artefacts are persisted.",
    )

    # ── Celery ─────────────────────────────────────────────────────────────────
    celery_broker_url: str = Field(
        default="redis://localhost:6379/1",
        description="Celery broker — separate Redis DB from cache.",
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/2",
        description="Celery result backend.",
    )
    celery_task_soft_time_limit: int = Field(
        default=300,
        description="Soft time limit for Celery tasks (seconds).",
    )
    celery_task_time_limit: int = Field(
        default=600,
        description="Hard time limit for Celery tasks (seconds).",
    )

    # ── CORS ───────────────────────────────────────────────────────────────────
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",   # Next.js dev server
            "http://localhost:3001",
            "https://hospital-command.vercel.app",
        ],
        description="Allowed CORS origins.",
    )
    cors_allow_credentials: bool = Field(default=True)

    # ── WebSocket ──────────────────────────────────────────────────────────────
    ws_heartbeat_interval: int = Field(
        default=30,
        description="WebSocket ping interval in seconds.",
    )
    ws_max_connections: int = Field(
        default=500,
        description="Maximum concurrent WebSocket connections.",
    )

    # ── Observability ──────────────────────────────────────────────────────────
    enable_telemetry_logging: bool = Field(
        default=True,
        description="Log every telemetry event (can be noisy in production).",
    )
    sentry_dsn: str | None = Field(
        default=None,
        description="Sentry DSN — leave empty to disable Sentry.",
    )

    # ── Derived helpers ────────────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        """Allow comma-separated string from environment."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the singleton Settings instance (cached after first call).

    Use this in FastAPI dependency injection:
        Depends(get_settings)
    """
    s = Settings()
    logger.info(
        "Settings loaded | env=%s | debug=%s | llm=%s",
        s.environment,
        s.debug,
        s.llm_model,
    )
    return s


# Module-level convenience alias
settings: Settings = get_settings()
