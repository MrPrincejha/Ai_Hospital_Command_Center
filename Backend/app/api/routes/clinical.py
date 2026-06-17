# backend/app/api/routes/clinical.py
"""
AI Hospital Command Center — Clinical Screening API Routes
==========================================================
REST endpoints for the clinical report AI screening engine.

Endpoints
---------
POST  /api/clinical/screen         — Screen a report, return urgency score
GET   /api/clinical/biomarkers     — List all supported biomarker rules
POST  /api/clinical/score-demo     — Score against built-in demo report

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, status, Depends

from app.schemas.hospital import (
    ClinicalScreenRequest,
    ClinicalScreenResponse,
    ScoredAnomalySchema,
)
from app.services.clinical_scorer import (
    ClinicalScreeningPipeline,
    BIOMARKER_RULES,
    SAMPLE_REPORT,
)
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clinical", tags=["Clinical Screening"])


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/clinical/screen
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/screen",
    response_model=ClinicalScreenResponse,
    status_code=status.HTTP_200_OK,
    summary="Screen a clinical report for anomalies",
    description=(
        "Runs the full clinical AI screening pipeline:\n"
        "1. LLM extracts structured biomarker anomalies from report text\n"
        "2. Rule engine scores each anomaly deterministically\n"
        "3. Returns urgency score (0–100) and triage tier\n\n"
        "**Disclaimer**: AI-assisted screening only. Not a medical diagnosis."
    ),
)
async def screen_clinical_report(
    request: ClinicalScreenRequest,
    settings: Settings = Depends(get_settings),
) -> ClinicalScreenResponse:
    """
    Screen a clinical/lab report and return a structured urgency assessment.

    Set `use_mock_llm=true` to run without a Groq API key (uses built-in
    mock anomalies — useful for testing and demos).
    """
    logger.info(
        "Clinical screen request | report_id=%s | patient_ref=%s | mock=%s",
        request.report_id,
        request.patient_ref,
        request.use_mock_llm,
    )

    # Get Groq API key if available, otherwise falls back to mock mode
    groq_api_key = None
    if settings.groq_api_key is not None:
        groq_api_key = settings.groq_api_key.get_secret_value()

    pipeline = ClinicalScreeningPipeline(
        groq_api_key=groq_api_key,
        use_mock_llm=request.use_mock_llm,
    )

    try:
        result = pipeline.screen(
            report_text=request.report_text,
            report_id=request.report_id,
            patient_ref=request.patient_ref,
        )
    except Exception as exc:
        logger.error("Clinical screening failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Screening pipeline error: {exc}",
        )

    # Validate scored anomalies through schema before returning
    try:
        validated_anomalies = [
            ScoredAnomalySchema(**a) for a in result.scored_anomalies
        ]
    except Exception as exc:
        logger.error("Anomaly schema validation error: %s", exc)
        validated_anomalies = []

    return ClinicalScreenResponse(
        report_id=result.report_id,
        patient_ref=result.patient_ref,
        processed_at=result.processed_at,
        raw_report_excerpt=result.raw_report_excerpt,
        anomalies_extracted=result.anomalies_extracted,
        scored_anomalies=validated_anomalies,
        total_urgency_score=result.total_urgency_score,
        triage_tier=result.triage_tier,
        critical_flags=result.critical_flags,
        llm_model_used=result.llm_model_used,
        scoring_duration_ms=result.scoring_duration_ms,
        disclaimer=result.disclaimer,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/clinical/biomarkers
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/biomarkers",
    status_code=status.HTTP_200_OK,
    summary="List supported biomarker rules",
    description=(
        "Returns the full list of biomarker reference ranges and scoring rules "
        "used by the clinical screening engine."
    ),
)
async def list_biomarker_rules() -> dict[str, Any]:
    """
    Return all configured biomarker rules for transparency and auditing.
    """
    rules = [
        {
            "name": rule.name,
            "aliases": rule.aliases,
            "unit": rule.unit,
            "normal_range": {
                "min": rule.normal_min,
                "max": rule.normal_max,
            },
            "critical_thresholds": {
                "low": rule.critical_low,
                "high": rule.critical_high,
            },
            "scores": {
                "mild": rule.score_mild,
                "moderate": rule.score_moderate,
                "severe": rule.score_severe,
            },
        }
        for rule in BIOMARKER_RULES
    ]

    return {
        "total_biomarkers": len(rules),
        "triage_tiers": {
            "IMMEDIATE": "score ≥ 80 — Life-threatening",
            "URGENT": "score 50–79 — Potentially serious",
            "SEMI_URGENT": "score 25–49 — Needs timely attention",
            "NON_URGENT": "score < 25 — Routine",
        },
        "biomarker_rules": rules,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/clinical/score-demo
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/score-demo",
    response_model=ClinicalScreenResponse,
    status_code=status.HTTP_200_OK,
    summary="Run demo screening on built-in sample report",
    description=(
        "Runs the screening pipeline on a built-in demo report containing "
        "multiple critical anomalies. Always uses mock LLM — no API key required."
    ),
)
async def run_demo_screen() -> ClinicalScreenResponse:
    """
    Screen the built-in SAMPLE_REPORT from clinical_scorer.py.

    Useful for:
    - Dashboard demos
    - Frontend integration testing
    - CI/CD smoke tests
    """
    logger.info("Demo clinical screen requested.")

    # Demo always uses mock mode, no LLM needed
    pipeline = ClinicalScreeningPipeline(groq_api_key=None, use_mock_llm=True)

    try:
        result = pipeline.screen(
            report_text=SAMPLE_REPORT,
            report_id="DEMO-RPT-001",
            patient_ref="DEMO-PATIENT",
        )
    except Exception as exc:
        logger.error("Demo screening failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Demo screening error: {exc}",
        )

    validated_anomalies = [
        ScoredAnomalySchema(**a) for a in result.scored_anomalies
    ]

    return ClinicalScreenResponse(
        report_id=result.report_id,
        patient_ref=result.patient_ref,
        processed_at=result.processed_at,
        raw_report_excerpt=result.raw_report_excerpt,
        anomalies_extracted=result.anomalies_extracted,
        scored_anomalies=validated_anomalies,
        total_urgency_score=result.total_urgency_score,
        triage_tier=result.triage_tier,
        critical_flags=result.critical_flags,
        llm_model_used=result.llm_model_used,
        scoring_duration_ms=result.scoring_duration_ms,
        disclaimer=result.disclaimer,
    )
