# backend/app/api/routes/copilot.py
"""
AI Hospital Command Center — AI Copilot API Routes
===================================================
REST endpoints for the LangChain-powered hospital operations copilot.

Endpoints
---------
POST  /api/copilot/query     — Submit an operational query, get AI response
POST  /api/copilot/clear     — Clear conversation history for a session
GET   /api/copilot/status    — Copilot health and context availability

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.redis_client import get_redis_sync
from app.schemas.hospital import (
    CopilotQueryRequest,
    CopilotQueryResponse,
    CopilotClearRequest,
    CopilotClearResponse,
)
from app.services.llm_copilot import (
    HospitalCopilotService,
    MockHospitalCopilot,
    build_copilot,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["AI Copilot"])


# ─────────────────────────────────────────────────────────────────────────────
# Dependency: copilot service instance
# ─────────────────────────────────────────────────────────────────────────────

async def get_copilot_service(
    settings: Settings = Depends(get_settings),
) -> HospitalCopilotService | MockHospitalCopilot:
    """
    FastAPI dependency that returns the appropriate copilot instance.

    Uses the real LangChain copilot when GROQ_API_KEY is configured in settings.
    Falls back to MockHospitalCopilot for local development without a key.
    """
    # Check if Groq API key is configured in settings
    has_api_key = settings.groq_api_key is not None

    if not has_api_key:
        logger.warning("GROQ_API_KEY not configured — using mock copilot")
        # Mock mode — no API key required, no Redis required
        return MockHospitalCopilot()

    try:
        redis_client = get_redis_sync()
        return HospitalCopilotService(
            redis_client=redis_client,
            groq_api_key=settings.groq_api_key.get_secret_value(),
            model=settings.llm_model,
            temperature=settings.llm_temperature,
        )
    except Exception as exc:
        logger.warning(
            "Could not initialise real copilot (%s) — falling back to mock.", exc
        )
        return MockHospitalCopilot()


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/copilot/query
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/query",
    response_model=CopilotQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Query the AI hospital operations copilot",
    description=(
        "Submit a natural language operational query to the AI copilot. "
        "The copilot fetches live telemetry from Redis and the latest ML "
        "forecast before generating a contextual response.\n\n"
        "Example queries:\n"
        "- 'Why is the ER so congested right now?'\n"
        "- 'What staffing changes should I make for the next 12 hours?'\n"
        "- 'Give me an ICU capacity assessment.'"
    ),
)
async def query_copilot(
    request: CopilotQueryRequest,
    copilot: HospitalCopilotService | MockHospitalCopilot = Depends(
        get_copilot_service
    ),
) -> CopilotQueryResponse:
    """
    Process a natural language operational query via the AI copilot.

    The copilot uses:
    1. Live Redis telemetry (queue lengths, utilisation, alert levels)
    2. Latest ML forecast (12-hour ICU/ER predictions)
    3. Conversation history (per session_id)
    4. LangChain + GPT-4o-mini reasoning chain
    """
    logger.info(
        "Copilot query | session=%s | query='%s...' | mock=%s",
        request.session_id,
        request.query[:60],
        request.use_mock,
    )

    # Override with mock if explicitly requested
    if request.use_mock and not isinstance(copilot, MockHospitalCopilot):
        copilot = MockHospitalCopilot()

    try:
        result = copilot.query(
            user_query=request.query,
            session_id=request.session_id,
        )
    except Exception as exc:
        logger.error("Copilot query failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Copilot error: {exc}",
        )

    return CopilotQueryResponse(
        session_id=result.session_id,
        query=result.query,
        response=result.response,
        telemetry_snapshot=result.telemetry_snapshot,
        forecast_snapshot=result.forecast_snapshot,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        generated_at=result.generated_at,
        tokens_used=result.tokens_used,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/copilot/clear
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/clear",
    response_model=CopilotClearResponse,
    status_code=status.HTTP_200_OK,
    summary="Clear copilot conversation history",
    description="Clears the conversation history for a given session ID in Redis.",
)
async def clear_copilot_history(
    request: CopilotClearRequest,
    copilot: HospitalCopilotService | MockHospitalCopilot = Depends(
        get_copilot_service
    ),
) -> CopilotClearResponse:
    """
    Clear the session history stored in Redis for the given session_id.
    After clearing, the copilot will have no memory of previous exchanges
    for this session.
    """
    logger.info("Copilot history clear requested | session=%s", request.session_id)

    if isinstance(copilot, MockHospitalCopilot):
        return CopilotClearResponse(
            session_id=request.session_id,
            cleared=True,
            message="Mock copilot — no history to clear.",
        )

    try:
        copilot.clear_history(request.session_id)
        return CopilotClearResponse(
            session_id=request.session_id,
            cleared=True,
            message=f"Conversation history cleared for session '{request.session_id}'.",
        )
    except Exception as exc:
        logger.error("History clear failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not clear history: {exc}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/copilot/status
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/status",
    status_code=status.HTTP_200_OK,
    summary="Copilot health and context availability",
    description=(
        "Returns the current operational status of the copilot, including "
        "whether telemetry and forecast context are available."
    ),
)
async def get_copilot_status(
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Check copilot readiness:
    - Is an LLM API key configured?
    - Is Redis reachable?
    - Is telemetry available?
    - Is a forecast available?
    """
    import os
    from app.core.redis_client import get_json, health_check

    has_api_key = settings.groq_api_key is not None

    redis_ok = False

    telemetry_available = False
    forecast_available = False

    try:
        redis_ok = await health_check()
        if redis_ok:
            telemetry_data = await get_json(settings.redis_telemetry_key)
            telemetry_available = telemetry_data is not None

            forecast_data = await get_json(settings.redis_forecast_key)
            forecast_available = forecast_data is not None
    except Exception as exc:
        logger.warning("Copilot status check failed: %s", exc)

    overall_ready = has_api_key and redis_ok

    return {
        "copilot_ready": overall_ready,
        "mode": "real" if has_api_key else "mock",
        "llm_model": settings.llm_model,
        "api_key_configured": has_api_key,
        "redis_connected": redis_ok,
        "telemetry_available": telemetry_available,
        "forecast_available": forecast_available,
        "notes": (
            None if overall_ready else
            "Set GROQ_API_KEY in .env file and ensure a simulation has been run."
        ),
    }
