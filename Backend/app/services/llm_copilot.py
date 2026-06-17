# backend/app/services/llm_copilot.py
"""
AI Hospital Command Center — AI Operational Copilot
====================================================
Implements a LangChain-powered hospital operations intelligence assistant.

The copilot is NOT a general chatbot. It is a context-aware operational
reasoning engine that:

  1. Fetches live telemetry state from Redis
  2. Fetches the latest ML forecast results
  3. Constructs a rich dynamic system prompt injected with real operational data
  4. Routes queries through a reasoning chain with structured output
  5. Returns actionable, department-specific operational recommendations

Design goals
------------
- Telemetry-aware: every response is grounded in current hospital state
- Forecast-aware: recommendations account for predicted 12-hour horizon
- Auditable: full prompt + response logged for clinical governance
- Resilient: graceful degradation when Redis / LLM is unavailable
- Modular: easily swappable between GPT-4o, Claude, Gemini backends

Usage (standalone test)
-----------------------
    python -m backend.app.services.llm_copilot

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any

import redis
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough

from langchain_groq import ChatGroq

# ── Structured logger ──────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

# ── Redis keys ─────────────────────────────────────────────────────────────────
REDIS_TELEMETRY_KEY = "hospital:latest_telemetry"
REDIS_FORECAST_KEY = "hospital:latest_forecast"
REDIS_COPILOT_HISTORY_PREFIX = "copilot:history:"  # + session_id

# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TelemetryContext:
    """Live operational snapshot fetched from Redis for prompt injection."""

    available: bool
    fetched_at: str
    global_alert: str
    total_queue: int
    icu_occupancy_pct: float
    er_congestion_pct: float
    departments: list[dict[str, Any]]


@dataclass
class ForecastContext:
    """ML forecast fetched from Redis for prompt injection."""

    available: bool
    fetched_at: str
    icu_occupancy_t12: float
    er_congestion_t12: float
    patient_inflow_t12: int
    risk_level: str


@dataclass
class CopilotResponse:
    """Structured output from the AI copilot."""

    session_id: str
    query: str
    response: str
    telemetry_snapshot: dict[str, Any]
    forecast_snapshot: dict[str, Any]
    model_used: str
    latency_ms: float
    generated_at: str
    tokens_used: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Redis telemetry fetcher
# ─────────────────────────────────────────────────────────────────────────────

class TelemetryFetcher:
    """
    Retrieves the latest hospital operational state from Redis.

    Redis key: hospital:latest_telemetry
    Set by the simulation Celery worker after every telemetry tick.
    """

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    def fetch_telemetry(self) -> TelemetryContext:
        """
        Returns the latest telemetry state or a degraded context if unavailable.
        """
        try:
            raw = self._redis.get(REDIS_TELEMETRY_KEY)
            if raw is None:
                logger.warning("No telemetry found at key %s", REDIS_TELEMETRY_KEY)
                return self._unavailable_telemetry()

            data = json.loads(raw)
            return TelemetryContext(
                available=True,
                fetched_at=datetime.utcnow().isoformat(),
                global_alert=data.get("global_alert", "unknown"),
                total_queue=int(data.get("total_queue", 0)),
                icu_occupancy_pct=float(data.get("icu_occupancy_pct", 0.0)),
                er_congestion_pct=float(data.get("er_congestion_pct", 0.0)),
                departments=data.get("snapshots", []),
            )
        except (redis.RedisError, json.JSONDecodeError, KeyError) as exc:
            logger.error("Telemetry fetch failed: %s", exc)
            return self._unavailable_telemetry()

    def fetch_forecast(self) -> ForecastContext:
        """
        Returns the latest ML forecast or a degraded context if unavailable.
        """
        try:
            raw = self._redis.get(REDIS_FORECAST_KEY)
            if raw is None:
                logger.warning("No forecast found at key %s", REDIS_FORECAST_KEY)
                return self._unavailable_forecast()

            data = json.loads(raw)
            return ForecastContext(
                available=True,
                fetched_at=datetime.utcnow().isoformat(),
                icu_occupancy_t12=float(data.get("icu_occupancy_t12", 0.0)),
                er_congestion_t12=float(data.get("er_congestion_t12", 0.0)),
                patient_inflow_t12=int(data.get("patient_inflow_t12", 0)),
                risk_level=data.get("risk_level", "unknown"),
            )
        except (redis.RedisError, json.JSONDecodeError, KeyError) as exc:
            logger.error("Forecast fetch failed: %s", exc)
            return self._unavailable_forecast()

    @staticmethod
    def _unavailable_telemetry() -> TelemetryContext:
        return TelemetryContext(
            available=False,
            fetched_at=datetime.utcnow().isoformat(),
            global_alert="unknown",
            total_queue=0,
            icu_occupancy_pct=0.0,
            er_congestion_pct=0.0,
            departments=[],
        )

    @staticmethod
    def _unavailable_forecast() -> ForecastContext:
        return ForecastContext(
            available=False,
            fetched_at=datetime.utcnow().isoformat(),
            icu_occupancy_t12=0.0,
            er_congestion_t12=0.0,
            patient_inflow_t12=0,
            risk_level="unknown",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

class OperationalPromptBuilder:
    """
    Constructs a rich, dynamic system prompt injected with live telemetry
    and forecast data.

    The system prompt follows a structured template that:
    1. Defines the copilot's role and boundaries
    2. Injects current operational state
    3. Injects 12-hour forecast
    4. Defines response format expectations
    """

    SYSTEM_TEMPLATE = """
You are the AI Operations Copilot for a hospital command center.
You are a highly intelligent operational advisor embedded in a real-time hospital
management platform. You reason about hospital operations, patient flow, staffing,
and resource utilization based on live telemetry and machine learning forecasts.

═══════════════════════════════════════════════════════
 CURRENT HOSPITAL OPERATIONAL STATE (as of {telemetry_time})
═══════════════════════════════════════════════════════
Data Source Status: {telemetry_status}
Global Alert Level: {global_alert}
Total Patients in Queue: {total_queue}
ICU Occupancy: {icu_occupancy_pct}%
ER Congestion Probability: {er_congestion_pct}%

Department Breakdown:
{department_breakdown}

═══════════════════════════════════════════════════════
 12-HOUR ML FORECAST (generated: {forecast_time})
═══════════════════════════════════════════════════════
Forecast Status: {forecast_status}
Predicted ICU Occupancy (t+12h): {icu_t12}%
Predicted ER Congestion (t+12h): {er_t12}%
Predicted Patient Inflow (t+12h): {inflow_t12} patients
Overall Risk Level: {risk_level}

═══════════════════════════════════════════════════════
 YOUR OPERATIONAL DIRECTIVES
═══════════════════════════════════════════════════════
1. ALWAYS ground your analysis in the telemetry data provided above.
2. Identify bottlenecks, cascade risks, and resource constraints.
3. Provide SPECIFIC, ACTIONABLE recommendations (not generic advice).
4. When recommending staffing changes, cite utilization rates.
5. Flag departments approaching or exceeding 85% utilization.
6. If ICU occupancy > 85%, always assess discharge/transfer opportunities.
7. If ER congestion > 70%, always recommend fast-track protocol activation.
8. Reference forecast data when advising on proactive measures.
9. DO NOT diagnose patients. Operate at system and workflow level only.
10. Structure your response clearly with: Assessment → Root Cause → Recommendations.

Respond concisely and professionally. Use data-driven language.
If telemetry is unavailable, state this clearly and recommend reconnection.
""".strip()

    def build_system_prompt(
        self,
        telemetry: TelemetryContext,
        forecast: ForecastContext,
    ) -> str:
        """
        Construct the full dynamic system prompt with injected context.
        """
        # Format department breakdown table
        dept_lines: list[str] = []
        for dept in telemetry.departments:
            name = dept.get("department", "Unknown")
            q = dept.get("queue_length", 0)
            util = round(float(dept.get("server_utilization", 0)) * 100, 1)
            cong = round(float(dept.get("congestion_probability", 0)) * 100, 1)
            alert = dept.get("alert_level", "normal").upper()
            wait = round(float(dept.get("avg_wait_time", 0)) * 60, 1)  # convert h→min
            dept_lines.append(
                f"  [{alert:8s}] {name:6s} | Queue: {q:3d} | "
                f"Utilization: {util:5.1f}% | Congestion: {cong:5.1f}% | "
                f"Avg Wait: {wait:.0f} min"
            )

        dept_breakdown = "\n".join(dept_lines) if dept_lines else "  No department data available."

        return self.SYSTEM_TEMPLATE.format(
            telemetry_time=telemetry.fetched_at,
            telemetry_status="LIVE" if telemetry.available else "UNAVAILABLE",
            global_alert=telemetry.global_alert.upper(),
            total_queue=telemetry.total_queue,
            icu_occupancy_pct=round(telemetry.icu_occupancy_pct * 100, 1),
            er_congestion_pct=round(telemetry.er_congestion_pct * 100, 1),
            department_breakdown=dept_breakdown,
            forecast_time=forecast.fetched_at,
            forecast_status="AVAILABLE" if forecast.available else "UNAVAILABLE",
            icu_t12=round(forecast.icu_occupancy_t12 * 100, 1),
            er_t12=round(forecast.er_congestion_t12 * 100, 1),
            inflow_t12=forecast.patient_inflow_t12,
            risk_level=forecast.risk_level.upper(),
        )


# ─────────────────────────────────────────────────────────────────────────────
# LangChain copilot service
# ─────────────────────────────────────────────────────────────────────────────

class HospitalCopilotService:
    """
    Main AI operational copilot service.

    Orchestrates:
    - Telemetry + forecast context fetching
    - Dynamic prompt construction
    - LangChain LLM chain execution
    - Conversation history management (per session via Redis)
    - Structured response packaging

    Parameters
    ----------
    redis_client : redis.Redis
        Shared Redis connection.
    model : str
        LLM model identifier (default: gpt-4o-mini).
    temperature : float
        LLM temperature (0.0 for deterministic operational advice).
    max_history_turns : int
        Number of prior conversation turns to include in context window.
    """

    DEFAULT_MODEL = "gpt-4o-mini"
    MAX_RESPONSE_TOKENS = 1200

    def __init__(
        self,
        redis_client: redis.Redis,
        groq_api_key: str,
        model: str | None = None,
        temperature: float = 0.2,
        max_history_turns: int = 6,
    ) -> None:
        self._redis = redis_client
        self.model_name = model or os.getenv("LLM_MODEL", self.DEFAULT_MODEL)
        self.temperature = temperature
        self.max_history_turns = max_history_turns

        self._fetcher = TelemetryFetcher(redis_client)
        self._prompt_builder = OperationalPromptBuilder()

        # Initialise LangChain LLM with Groq
        self._llm = ChatGroq(
            model=self.model_name,
            temperature=self.temperature,
            max_tokens=self.MAX_RESPONSE_TOKENS,
            groq_api_key=groq_api_key,
        )

        self._output_parser = StrOutputParser()
        logger.info("HospitalCopilotService initialised with model=%s", self.model_name)

    # ── Public interface ───────────────────────────────────────────────────────

    def query(
        self,
        user_query: str,
        session_id: str = "default",
    ) -> CopilotResponse:
        """
        Process a natural language operational query and return a copilot response.

        Parameters
        ----------
        user_query : str
            Operator's question or command (e.g. "Why is ER congested?").
        session_id : str
            Conversation session identifier for history management.

        Returns
        -------
        CopilotResponse
            Structured response with reasoning, recommendations, and metadata.
        """
        t_start = time.monotonic()
        logger.info("Copilot query [session=%s]: %s", session_id, user_query[:120])

        # ── Fetch context ──────────────────────────────────────────────────────
        telemetry = self._fetcher.fetch_telemetry()
        forecast = self._fetcher.fetch_forecast()

        logger.debug(
            "Context: telemetry_available=%s | forecast_available=%s",
            telemetry.available, forecast.available,
        )

        # ── Build dynamic system prompt ────────────────────────────────────────
        system_prompt = self._prompt_builder.build_system_prompt(telemetry, forecast)

        # ── Fetch conversation history ─────────────────────────────────────────
        history = self._load_history(session_id)

        # ── Build LangChain messages ───────────────────────────────────────────
        messages: list[Any] = [SystemMessage(content=system_prompt)]
        messages.extend(history)
        messages.append(HumanMessage(content=user_query))

        # ── Invoke LLM ─────────────────────────────────────────────────────────
        try:
            ai_message = self._llm.invoke(messages)
            response_text = self._output_parser.invoke(ai_message)
            tokens_used = getattr(ai_message, "usage_metadata", {})
            tokens_used = (
                tokens_used.get("total_tokens") if isinstance(tokens_used, dict) else None
            )
        except Exception as exc:
            logger.error("LLM invocation failed: %s", exc)
            response_text = (
                f"Copilot temporarily unavailable: {type(exc).__name__}. "
                "Please retry or check LLM API connectivity."
            )
            tokens_used = None

        # ── Persist updated history ────────────────────────────────────────────
        self._save_history(session_id, user_query, response_text)

        latency_ms = round((time.monotonic() - t_start) * 1000, 2)
        logger.info(
            "Copilot response [session=%s] generated in %.1f ms",
            session_id, latency_ms,
        )

        return CopilotResponse(
            session_id=session_id,
            query=user_query,
            response=response_text,
            telemetry_snapshot=asdict(telemetry),
            forecast_snapshot=asdict(forecast),
            model_used=self.model_name,
            latency_ms=latency_ms,
            generated_at=datetime.utcnow().isoformat(),
            tokens_used=tokens_used,
        )

    # ── Conversation history management ───────────────────────────────────────

    def _load_history(self, session_id: str) -> list[HumanMessage | Any]:
        """
        Load recent conversation history from Redis.
        Returns a list of alternating HumanMessage / AIMessage objects.
        """
        key = f"{REDIS_COPILOT_HISTORY_PREFIX}{session_id}"
        try:
            raw = self._redis.get(key)
            if raw is None:
                return []
            turns: list[dict[str, str]] = json.loads(raw)
            # Trim to max_history_turns (each turn = 1 human + 1 AI = 2 messages)
            turns = turns[-(self.max_history_turns):]
            messages: list[Any] = []
            for turn in turns:
                messages.append(HumanMessage(content=turn["human"]))
                from langchain_core.messages import AIMessage
                messages.append(AIMessage(content=turn["ai"]))
            return messages
        except (redis.RedisError, json.JSONDecodeError) as exc:
            logger.warning("History load failed for session %s: %s", session_id, exc)
            return []

    def _save_history(
        self, session_id: str, human_msg: str, ai_msg: str
    ) -> None:
        """
        Append latest turn to conversation history in Redis.
        TTL = 4 hours (session expiry).
        """
        key = f"{REDIS_COPILOT_HISTORY_PREFIX}{session_id}"
        try:
            raw = self._redis.get(key)
            turns: list[dict[str, str]] = json.loads(raw) if raw else []
            turns.append({"human": human_msg, "ai": ai_msg})
            # Keep only last max_history_turns
            turns = turns[-(self.max_history_turns):]
            self._redis.setex(key, 14400, json.dumps(turns))  # TTL 4 hours
        except (redis.RedisError, json.JSONDecodeError) as exc:
            logger.warning("History save failed for session %s: %s", session_id, exc)

    def clear_history(self, session_id: str) -> None:
        """Clear conversation history for a given session."""
        key = f"{REDIS_COPILOT_HISTORY_PREFIX}{session_id}"
        try:
            self._redis.delete(key)
            logger.info("History cleared for session %s", session_id)
        except redis.RedisError as exc:
            logger.warning("History clear failed: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Mock copilot for local testing (no LLM / Redis required)
# ─────────────────────────────────────────────────────────────────────────────

class MockHospitalCopilot:
    """
    Deterministic mock copilot for unit tests and local demos.
    Returns canned responses based on keyword matching — no API calls.
    """

    MOCK_TELEMETRY: dict[str, Any] = {
        "available": True,
        "fetched_at": "2024-06-01T09:00:00",
        "global_alert": "warning",
        "total_queue": 47,
        "icu_occupancy_pct": 0.88,
        "er_congestion_pct": 0.74,
        "departments": [
            {
                "department": "OPD",
                "queue_length": 22,
                "server_utilization": 0.72,
                "congestion_probability": 0.41,
                "avg_wait_time": 0.48,
                "alert_level": "normal",
            },
            {
                "department": "ER",
                "queue_length": 14,
                "server_utilization": 0.91,
                "congestion_probability": 0.74,
                "avg_wait_time": 0.83,
                "alert_level": "critical",
            },
            {
                "department": "ICU",
                "queue_length": 3,
                "server_utilization": 0.88,
                "congestion_probability": 0.62,
                "avg_wait_time": 0.10,
                "alert_level": "warning",
            },
            {
                "department": "Ward",
                "queue_length": 8,
                "server_utilization": 0.65,
                "congestion_probability": 0.29,
                "avg_wait_time": 0.31,
                "alert_level": "normal",
            },
        ],
    }

    MOCK_FORECAST: dict[str, Any] = {
        "available": True,
        "fetched_at": "2024-06-01T09:00:00",
        "icu_occupancy_t12": 0.92,
        "er_congestion_t12": 0.81,
        "patient_inflow_t12": 58,
        "risk_level": "high",
    }

    _RESPONSE_LIBRARY: dict[str, str] = {
        "er": (
            "Assessment: ER is operating at 91% utilization with congestion probability "
            "at 74% — approaching critical threshold.\n\n"
            "Root Cause: ICU discharge delays are creating downstream pressure. "
            "With ICU at 88% occupancy, patients ready for step-down are being held "
            "in ER, reducing available treatment bays.\n\n"
            "Recommendations:\n"
            "1. Activate ER fast-track protocol for ESI 4/5 (minor cases) immediately.\n"
            "2. Request ICU attending to review 3 queued patients for ward step-down.\n"
            "3. Open overflow bay B2 (capacity: +4 beds) within 30 minutes.\n"
            "4. Alert on-call registrar to expedite ER dispositions.\n"
            "5. Forecast shows ER congestion rising to 81% in 12 hours — "
            "consider calling in additional nursing staff for the 18:00 shift."
        ),
        "icu": (
            "Assessment: ICU occupancy at 88% — warning threshold breached. "
            "ML forecast projects occupancy reaching 92% within 12 hours.\n\n"
            "Root Cause: Patient acuity increase and delayed discharge to step-down "
            "wards are compressing ICU capacity.\n\n"
            "Recommendations:\n"
            "1. Review all ICU patients with LOS > 72 hours for step-down eligibility.\n"
            "2. Coordinate with Ward (currently 65% utilized — capacity available) "
            "for immediate step-down transfers.\n"
            "3. Notify ICU consultant and bed manager of 12-hour forecast.\n"
            "4. Place elective surgical ICU admissions on hold pending review.\n"
            "5. Activate ICU surge protocol if occupancy reaches 95%."
        ),
        "staffing": (
            "Assessment: Current staffing analysis based on live utilization metrics.\n\n"
            "Staff Pressure Points:\n"
            "• ER: 91% utilization — understaffed for current demand. "
            "Recommend +2 nurses and +1 senior doctor for next shift.\n"
            "• ICU: 88% utilization — adequate currently but forecasted strain "
            "requires pre-emptive staffing uplift.\n"
            "• OPD: 72% utilization — within acceptable range. No action needed.\n"
            "• Ward: 65% utilization — has capacity to absorb ICU step-downs.\n\n"
            "Recommendations:\n"
            "1. Call in 2 additional ER nurses for 14:00–22:00 shift.\n"
            "2. Extend on-call ICU nurse availability through midnight.\n"
            "3. Redeploy 1 OPD nurse to ER support until 16:00."
        ),
        "default": (
            "Assessment: Hospital is currently operating under WARNING alert status.\n\n"
            "Key Metrics:\n"
            "• Total patients in queue: 47\n"
            "• ER congestion: 74% (critical threshold: 85%)\n"
            "• ICU occupancy: 88% (critical threshold: 90%)\n"
            "• 12-hour forecast risk level: HIGH\n\n"
            "Priority Actions:\n"
            "1. Address ER-ICU bottleneck (most critical pressure point).\n"
            "2. Pre-position staffing resources for predicted inflow of 58 patients.\n"
            "3. Initiate bed management review within the next 30 minutes.\n"
            "4. Brief department heads on current operational status."
        ),
    }

    def query(
        self,
        user_query: str,
        session_id: str = "default",
    ) -> CopilotResponse:
        """Return a keyword-matched canned response with mock telemetry context."""
        t_start = time.monotonic()
        query_lower = user_query.lower()

        if any(kw in query_lower for kw in ["er", "emergency", "congestion"]):
            response = self._RESPONSE_LIBRARY["er"]
        elif any(kw in query_lower for kw in ["icu", "intensive care", "critical care"]):
            response = self._RESPONSE_LIBRARY["icu"]
        elif any(kw in query_lower for kw in ["staff", "nurse", "doctor", "team"]):
            response = self._RESPONSE_LIBRARY["staffing"]
        else:
            response = self._RESPONSE_LIBRARY["default"]

        latency_ms = round((time.monotonic() - t_start) * 1000, 2)

        return CopilotResponse(
            session_id=session_id,
            query=user_query,
            response=response,
            telemetry_snapshot=self.MOCK_TELEMETRY,
            forecast_snapshot=self.MOCK_FORECAST,
            model_used="mock",
            latency_ms=latency_ms,
            generated_at=datetime.utcnow().isoformat(),
            tokens_used=None,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Factory function
# ─────────────────────────────────────────────────────────────────────────────

def build_copilot(
    redis_url: str | None = None,
    use_mock: bool = False,
) -> HospitalCopilotService | MockHospitalCopilot:
    """
    Factory that returns an appropriate copilot instance.

    Parameters
    ----------
    redis_url : str | None
        Redis connection URL. If None, reads REDIS_URL env var.
    use_mock : bool
        If True, returns MockHospitalCopilot (no API keys required).

    Returns
    -------
    HospitalCopilotService or MockHospitalCopilot
    """
    if use_mock:
        logger.info("Building MOCK copilot (no LLM/Redis required)")
        return MockHospitalCopilot()

    url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        r = redis.Redis.from_url(url, decode_responses=True, socket_timeout=3)
        r.ping()
        logger.info("Copilot Redis connected: %s", url)
    except redis.RedisError as exc:
        logger.error(
            "Redis unavailable (%s) — copilot requires Redis for telemetry context.", exc
        )
        raise

    return HospitalCopilotService(redis_client=r)


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== AI Hospital Copilot — Local Test (Mock Mode) ===\n")

    copilot = build_copilot(use_mock=True)

    test_queries = [
        "Why is the ER so congested right now?",
        "What should we do about ICU capacity?",
        "How should we adjust our staffing for the next 12 hours?",
        "Give me an overall hospital status summary.",
    ]

    for query in test_queries:
        print(f"Q: {query}")
        result = copilot.query(query, session_id="test-session")
        print(f"A: {result.response}")
        print(f"   [Latency: {result.latency_ms:.1f}ms | Model: {result.model_used}]")
        print("─" * 70)
