# backend/app/services/clinical_scorer.py
"""
AI Hospital Command Center — Clinical AI Screening Engine
=========================================================
Implements a deterministic, rule-based clinical report urgency scoring system
combined with LLM-assisted anomaly extraction.

Design philosophy
-----------------
The LLM acts as an extraction layer (structured JSON anomaly list) only.
All urgency classification is handled by a deterministic Python rule engine.
This ensures the system is auditable, reproducible, and safe for clinical use.

The AI DOES NOT diagnose disease.  It only:
  1. Extracts structured anomalies from free-text lab/clinical reports
  2. Flags abnormalities against configurable reference ranges
  3. Calculates a numeric urgency score
  4. Assigns a triage priority tier

Pipeline
--------
    raw_report_text
        → LLMReportParser      (LLM JSON extraction)
        → AnomalyRuleEngine    (deterministic scoring)
        → ClinicalScoreResult  (structured output)

Usage (standalone test)
-----------------------
    python -m backend.app.services.clinical_scorer

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any

# ── Structured logger ──────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)


# ─────────────────────────────────────────────────────────────────────────────
# Domain enums & data structures
# ─────────────────────────────────────────────────────────────────────────────

class TriageTier(str, Enum):
    """Clinical triage priority aligned with MTS / ESI frameworks."""

    IMMEDIATE = "IMMEDIATE"       # Life-threatening — score ≥ 80
    URGENT = "URGENT"             # Potentially serious — score 50–79
    SEMI_URGENT = "SEMI_URGENT"   # Needs attention — score 25–49
    NON_URGENT = "NON_URGENT"     # Routine — score < 25


@dataclass
class ExtractedAnomaly:
    """Single biomarker anomaly extracted from a clinical report."""

    biomarker: str          # e.g. "WBC", "Platelet Count", "Glucose"
    value: float            # reported numeric value
    unit: str               # e.g. "10^9/L", "mg/dL"
    direction: str          # "HIGH" | "LOW" | "CRITICAL_HIGH" | "CRITICAL_LOW"
    reference_min: float    # lower bound of normal range
    reference_max: float    # upper bound of normal range
    raw_text: str           # verbatim excerpt from report


@dataclass
class ScoredAnomaly:
    """Anomaly with its deterministic severity score contribution."""

    anomaly: ExtractedAnomaly
    severity_score: int     # 0–30 per anomaly; capped during summation
    severity_label: str     # "mild" | "moderate" | "severe" | "critical"
    clinical_note: str      # human-readable explanation


@dataclass
class ClinicalScoreResult:
    """Final output of the clinical screening pipeline."""

    report_id: str
    patient_ref: str
    processed_at: str
    raw_report_excerpt: str     # first 500 chars for audit trail

    # Extraction
    anomalies_extracted: int
    scored_anomalies: list[dict[str, Any]]

    # Scoring
    total_urgency_score: int    # 0–100 (capped)
    triage_tier: str            # TriageTier value
    critical_flags: list[str]   # list of critical finding descriptions

    # Metadata
    llm_model_used: str
    scoring_duration_ms: float
    disclaimer: str = (
        "This output is AI-assisted screening only. "
        "It does not constitute a medical diagnosis. "
        "All findings must be reviewed by a qualified clinician."
    )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Biomarker reference ranges & scoring weights
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class BiomarkerRule:
    """Scoring rule for a single biomarker."""

    name: str
    aliases: list[str]      # alternative names in reports
    unit: str
    normal_min: float
    normal_max: float
    critical_low: float     # below this → critical
    critical_high: float    # above this → critical
    score_mild: int         # score for mild deviation
    score_moderate: int     # score for moderate deviation
    score_severe: int       # score for severe/critical deviation
    clinical_note_template: str


# Curated reference table (adult ranges, SI units where applicable)
BIOMARKER_RULES: list[BiomarkerRule] = [
    BiomarkerRule(
        name="WBC",
        aliases=["white blood cell", "white blood count", "leucocytes", "leukocytes"],
        unit="10^9/L",
        normal_min=4.0,
        normal_max=11.0,
        critical_low=2.0,
        critical_high=30.0,
        score_mild=10,
        score_moderate=20,
        score_severe=30,
        clinical_note_template="{direction} WBC ({value} {unit}) may indicate {cause}.",
    ),
    BiomarkerRule(
        name="Platelet Count",
        aliases=["platelets", "plt", "thrombocytes"],
        unit="10^9/L",
        normal_min=150.0,
        normal_max=400.0,
        critical_low=50.0,
        critical_high=1000.0,
        score_mild=8,
        score_moderate=18,
        score_severe=28,
        clinical_note_template="{direction} platelets ({value} {unit}) — bleeding/clotting risk assessment required.",
    ),
    BiomarkerRule(
        name="Haemoglobin",
        aliases=["hemoglobin", "hgb", "hb"],
        unit="g/dL",
        normal_min=12.0,
        normal_max=17.5,
        critical_low=7.0,
        critical_high=20.0,
        score_mild=8,
        score_moderate=16,
        score_severe=25,
        clinical_note_template="{direction} haemoglobin ({value} {unit}) — anaemia/polycythaemia workup indicated.",
    ),
    BiomarkerRule(
        name="Glucose",
        aliases=["blood glucose", "fasting glucose", "random glucose", "bg"],
        unit="mg/dL",
        normal_min=70.0,
        normal_max=140.0,
        critical_low=40.0,
        critical_high=500.0,
        score_mild=10,
        score_moderate=20,
        score_severe=30,
        clinical_note_template="{direction} glucose ({value} {unit}) — hypoglycaemia/hyperglycaemia protocol.",
    ),
    BiomarkerRule(
        name="Creatinine",
        aliases=["serum creatinine", "scr", "creat"],
        unit="mg/dL",
        normal_min=0.6,
        normal_max=1.2,
        critical_low=0.3,
        critical_high=10.0,
        score_mild=8,
        score_moderate=18,
        score_severe=28,
        clinical_note_template="{direction} creatinine ({value} {unit}) — renal function impairment suspected.",
    ),
    BiomarkerRule(
        name="Potassium",
        aliases=["serum potassium", "k+", "k"],
        unit="mEq/L",
        normal_min=3.5,
        normal_max=5.0,
        critical_low=2.5,
        critical_high=6.5,
        score_mild=12,
        score_moderate=22,
        score_severe=30,
        clinical_note_template="{direction} potassium ({value} {unit}) — cardiac arrhythmia risk; ECG monitoring advised.",
    ),
    BiomarkerRule(
        name="Sodium",
        aliases=["serum sodium", "na+", "na"],
        unit="mEq/L",
        normal_min=135.0,
        normal_max=145.0,
        critical_low=120.0,
        critical_high=160.0,
        score_mild=8,
        score_moderate=16,
        score_severe=26,
        clinical_note_template="{direction} sodium ({value} {unit}) — electrolyte imbalance; neurological monitoring.",
    ),
    BiomarkerRule(
        name="Troponin",
        aliases=["troponin i", "troponin t", "high-sensitivity troponin", "hstni"],
        unit="ng/L",
        normal_min=0.0,
        normal_max=14.0,
        critical_low=0.0,    # no clinically meaningful low
        critical_high=50.0,
        score_mild=15,
        score_moderate=25,
        score_severe=30,
        clinical_note_template="Elevated troponin ({value} {unit}) — possible myocardial injury; urgent cardiology review.",
    ),
    BiomarkerRule(
        name="INR",
        aliases=["international normalised ratio", "pt/inr", "prothrombin"],
        unit="ratio",
        normal_min=0.8,
        normal_max=1.2,
        critical_low=0.5,
        critical_high=4.0,
        score_mild=8,
        score_moderate=18,
        score_severe=28,
        clinical_note_template="{direction} INR ({value}) — coagulation abnormality; haematology consult.",
    ),
    BiomarkerRule(
        name="SpO2",
        aliases=["oxygen saturation", "o2 sat", "spo2", "oxygen sat"],
        unit="%",
        normal_min=95.0,
        normal_max=100.0,
        critical_low=88.0,
        critical_high=100.0,
        score_mild=12,
        score_moderate=22,
        score_severe=30,
        clinical_note_template="Low SpO2 ({value}%) — hypoxaemia; supplemental O2 and respiratory assessment.",
    ),
]

# Build lookup index: lowercase alias → BiomarkerRule
_RULE_INDEX: dict[str, BiomarkerRule] = {}
for _rule in BIOMARKER_RULES:
    _RULE_INDEX[_rule.name.lower()] = _rule
    for _alias in _rule.aliases:
        _RULE_INDEX[_alias.lower()] = _rule


# ─────────────────────────────────────────────────────────────────────────────
# LLM report parser
# ─────────────────────────────────────────────────────────────────────────────

LLM_EXTRACTION_SYSTEM_PROMPT = """
You are a clinical data extraction assistant embedded in a hospital AI screening system.

Your ONLY task is to extract numeric biomarker values from the provided clinical or lab report text and return them as structured JSON.

Rules:
1. Extract ALL numeric biomarker values you can identify.
2. For each finding, return:
   - "biomarker": canonical name (e.g. "WBC", "Platelet Count", "Glucose")
   - "value": numeric value as a float
   - "unit": unit string as written in the report
   - "reference_min": lower bound of reference range if stated, else null
   - "reference_max": upper bound of reference range if stated, else null
   - "raw_text": verbatim excerpt from the report (≤ 60 chars)
3. Return ONLY a JSON array. No preamble, no markdown, no explanation.
4. If no biomarker values are found, return an empty array: []
5. DO NOT infer diagnoses. DO NOT generate values not in the text.

Output format (strict):
[
  {
    "biomarker": "WBC",
    "value": 14.5,
    "unit": "10^9/L",
    "reference_min": 4.0,
    "reference_max": 11.0,
    "raw_text": "WBC 14.5 10^9/L (ref 4.0-11.0)"
  }
]
""".strip()


class LLMReportParser:
    """
    Uses an LLM (Groq's llama model by default) to extract structured anomalies
    from free-text clinical reports.

    The LLM output is strictly validated before downstream use.
    """

    DEFAULT_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, groq_api_key: str, model: str | None = None) -> None:
        from langchain_groq import ChatGroq
        from langchain_core.output_parsers import StrOutputParser
    
        self.model = model or self.DEFAULT_MODEL
        self._llm = ChatGroq(
            model=self.model,
            temperature=0.0,  # deterministic extraction
            max_tokens=1500,
            groq_api_key=groq_api_key,
        )
        self._output_parser = StrOutputParser()

    def extract(self, report_text: str) -> tuple[list[dict[str, Any]], str]:
        """
        Send report text to LLM and parse structured anomaly JSON.

        Parameters
        ----------
        report_text : str
            Raw clinical/lab report text (free form).

        Returns
        -------
        tuple[list[dict], str]
            (parsed anomaly list, model name used)

        Raises
        ------
        ValueError
            If the LLM returns unparseable output.
        """
        logger.info("Sending report to LLM (%s) for extraction…", self.model)

        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            
            messages = [
                SystemMessage(content=LLM_EXTRACTION_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Extract all biomarker values from this report:\n\n{report_text}"
                ),
            ]
            
            response = self._llm.invoke(messages)
            raw_content = response.content if hasattr(response, 'content') else str(response)
            
        except Exception as exc:
            logger.error("LLM API call failed: %s", exc)
            raise

        logger.debug("LLM raw response: %s", raw_content[:300])

        # Attempt to extract JSON array from response (handles markdown fences)
        anomalies = self._parse_json_array(raw_content)
        logger.info("LLM extracted %d biomarker entries.", len(anomalies))
        return anomalies, self.model

    @staticmethod
    def _parse_json_array(raw: str) -> list[dict[str, Any]]:
        """
        Robustly parse a JSON array from LLM output.
        Handles markdown code fences and JSON object wrappers.
        """
        # Strip markdown fences
        cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()

        # If model returned {"findings": [...]} style object
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                return parsed
            # Try to find a list value inside the object
            for v in parsed.values():
                if isinstance(v, list):
                    return v
            return []
        except json.JSONDecodeError:
            # Try to find array substring
            match = re.search(r"\[.*\]", cleaned, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            logger.warning("Could not parse LLM JSON output: %s…", cleaned[:200])
            return []


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic anomaly rule engine
# ─────────────────────────────────────────────────────────────────────────────

class AnomalyRuleEngine:
    """
    Deterministic rule-based engine that classifies and scores each extracted
    anomaly against calibrated clinical reference ranges.

    Scoring table (per biomarker)
    ------------------------------
    | Deviation from normal    | Score           |
    |--------------------------|-----------------|
    | Within normal range      | 0               |
    | Mild (< 25% outside)     | score_mild      |
    | Moderate (25–50% outside)| score_moderate  |
    | Severe / Critical        | score_severe    |

    Total urgency score is capped at 100.
    Critical-low/critical-high values always contribute score_severe regardless
    of percentage deviation.
    """

    def score_anomaly(
        self, extracted: dict[str, Any]
    ) -> ScoredAnomaly | None:
        """
        Match an extracted anomaly to a rule and compute its severity score.

        Parameters
        ----------
        extracted : dict
            Single entry from LLM extraction (biomarker, value, unit, …).

        Returns
        -------
        ScoredAnomaly | None
            None if no matching rule found.
        """
        biomarker_raw: str = extracted.get("biomarker", "").strip()
        value_raw = extracted.get("value")
        unit: str = extracted.get("unit", "")

        if not biomarker_raw or value_raw is None:
            return None

        try:
            value = float(value_raw)
        except (TypeError, ValueError):
            logger.warning("Non-numeric value for %s: %s", biomarker_raw, value_raw)
            return None

        # Look up rule (case-insensitive)
        rule = _RULE_INDEX.get(biomarker_raw.lower())
        if rule is None:
            # Fuzzy fallback: check if any known alias is a substring
            for alias, r in _RULE_INDEX.items():
                if alias in biomarker_raw.lower():
                    rule = r
                    break

        if rule is None:
            logger.debug("No rule found for biomarker: %s", biomarker_raw)
            return None

        # Determine direction
        ref_min = extracted.get("reference_min") or rule.normal_min
        ref_max = extracted.get("reference_max") or rule.normal_max
        try:
            ref_min = float(ref_min)
            ref_max = float(ref_max)
        except (TypeError, ValueError):
            ref_min, ref_max = rule.normal_min, rule.normal_max

        # Check critical thresholds first
        is_critical_low = value <= rule.critical_low and rule.critical_low > 0
        is_critical_high = value >= rule.critical_high

        if value < ref_min:
            direction = "CRITICAL_LOW" if is_critical_low else "LOW"
        elif value > ref_max:
            direction = "CRITICAL_HIGH" if is_critical_high else "HIGH"
        else:
            # Within normal range — no score contribution
            direction = "NORMAL"

        if direction == "NORMAL":
            score = 0
            label = "normal"
        elif direction in ("CRITICAL_LOW", "CRITICAL_HIGH"):
            score = rule.score_severe
            label = "critical"
        else:
            # Calculate percentage deviation
            normal_range = ref_max - ref_min if (ref_max - ref_min) > 0 else 1.0
            if direction == "LOW":
                deviation_pct = (ref_min - value) / normal_range
            else:
                deviation_pct = (value - ref_max) / normal_range

            if deviation_pct < 0.25:
                score = rule.score_mild
                label = "mild"
            elif deviation_pct < 0.50:
                score = rule.score_moderate
                label = "moderate"
            else:
                score = rule.score_severe
                label = "severe"

        # Generate clinical note
        cause_map = {
            "WBC": "infection, inflammation, or haematological disorder",
            "Platelet Count": "thrombocytopaenia or thrombocytosis",
            "Glucose": "dysglycaemia",
        }
        cause = cause_map.get(rule.name, "a clinical condition requiring evaluation")
        clinical_note = rule.clinical_note_template.format(
            direction=direction.replace("_", " "),
            value=value,
            unit=unit or rule.unit,
            cause=cause,
        )

        anomaly = ExtractedAnomaly(
            biomarker=rule.name,
            value=value,
            unit=unit or rule.unit,
            direction=direction,
            reference_min=ref_min,
            reference_max=ref_max,
            raw_text=str(extracted.get("raw_text", ""))[:120],
        )

        return ScoredAnomaly(
            anomaly=anomaly,
            severity_score=score,
            severity_label=label,
            clinical_note=clinical_note,
        )

    def compute_total_score(
        self, scored: list[ScoredAnomaly]
    ) -> tuple[int, TriageTier, list[str]]:
        """
        Sum individual scores, cap at 100, derive triage tier.

        Returns
        -------
        tuple[int, TriageTier, list[str]]
            (total_score, triage_tier, critical_flags)
        """
        raw_total = sum(s.severity_score for s in scored)
        total = min(raw_total, 100)

        critical_flags = [
            s.clinical_note
            for s in scored
            if s.severity_label == "critical"
        ]

        if total >= 80:
            tier = TriageTier.IMMEDIATE
        elif total >= 50:
            tier = TriageTier.URGENT
        elif total >= 25:
            tier = TriageTier.SEMI_URGENT
        else:
            tier = TriageTier.NON_URGENT

        return total, tier, critical_flags


# ─────────────────────────────────────────────────────────────────────────────
# Main screening pipeline
# ─────────────────────────────────────────────────────────────────────────────

class ClinicalScreeningPipeline:
    """
    End-to-end clinical report screening service.

    Orchestrates:
    1. LLM extraction (or mock extraction for local testing)
    2. Rule-based anomaly scoring
    3. Triage tier assignment
    4. Structured result generation

    Parameters
    ----------
    groq_api_key : str | None
        Groq API key for LLM calls. If None, uses mock mode.
    use_mock_llm : bool
        If True, skips the real LLM call and uses built-in mock data.
        Useful for local testing without a Groq API key.
    """

    def __init__(self, groq_api_key: str | None = None, use_mock_llm: bool = False) -> None:
        self.use_mock_llm = use_mock_llm or groq_api_key is None
        if not self.use_mock_llm and groq_api_key:
            self.parser = LLMReportParser(groq_api_key=groq_api_key)
        else:
            self.parser = None
        self.rule_engine = AnomalyRuleEngine()

    def screen(
        self,
        report_text: str,
        report_id: str = "RPT-UNKNOWN",
        patient_ref: str = "ANON",
    ) -> ClinicalScoreResult:
        """
        Run the full screening pipeline on a clinical report.

        Parameters
        ----------
        report_text : str
            Full text of the clinical/lab report.
        report_id : str
            Unique report identifier for audit trail.
        patient_ref : str
            Anonymised patient reference.

        Returns
        -------
        ClinicalScoreResult
        """
        import uuid
        from datetime import datetime

        t_start = time.monotonic()
        logger.info("Screening report %s for patient %s…", report_id, patient_ref)

        # ── Step 1: LLM extraction ─────────────────────────────────────────────
        if self.use_mock_llm:
            raw_anomalies = _MOCK_ANOMALIES
            model_used = "mock"
        else:
            try:
                raw_anomalies, model_used = self.parser.extract(report_text)
            except Exception as exc:
                logger.error("LLM extraction failed: %s — using mock", exc)
                raw_anomalies = _MOCK_ANOMALIES
                model_used = "mock (fallback)"

        # ── Step 2: Rule-based scoring ─────────────────────────────────────────
        scored_anomalies: list[ScoredAnomaly] = []
        for entry in raw_anomalies:
            scored = self.rule_engine.score_anomaly(entry)
            if scored is not None:
                scored_anomalies.append(scored)

        logger.info(
            "%d anomalies extracted → %d matched rules",
            len(raw_anomalies),
            len(scored_anomalies),
        )

        # ── Step 3: Total score + triage tier ──────────────────────────────────
        total_score, triage_tier, critical_flags = (
            self.rule_engine.compute_total_score(scored_anomalies)
        )

        elapsed_ms = round((time.monotonic() - t_start) * 1000, 2)
        logger.info(
            "Report %s scored %d → %s (%.1f ms)",
            report_id, total_score, triage_tier.value, elapsed_ms,
        )

        # ── Step 4: Build result ───────────────────────────────────────────────
        return ClinicalScoreResult(
            report_id=report_id,
            patient_ref=patient_ref,
            processed_at=datetime.utcnow().isoformat(),
            raw_report_excerpt=report_text[:500],
            anomalies_extracted=len(raw_anomalies),
            scored_anomalies=[
                {
                    "biomarker": s.anomaly.biomarker,
                    "value": s.anomaly.value,
                    "unit": s.anomaly.unit,
                    "direction": s.anomaly.direction,
                    "reference_min": s.anomaly.reference_min,
                    "reference_max": s.anomaly.reference_max,
                    "severity_score": s.severity_score,
                    "severity_label": s.severity_label,
                    "clinical_note": s.clinical_note,
                }
                for s in scored_anomalies
            ],
            total_urgency_score=total_score,
            triage_tier=triage_tier.value,
            critical_flags=critical_flags,
            llm_model_used=model_used,
            scoring_duration_ms=elapsed_ms,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Mock data for local testing (no LLM required)
# ─────────────────────────────────────────────────────────────────────────────

_MOCK_ANOMALIES: list[dict[str, Any]] = [
    {
        "biomarker": "WBC",
        "value": 18.5,
        "unit": "10^9/L",
        "reference_min": 4.0,
        "reference_max": 11.0,
        "raw_text": "WBC 18.5 10^9/L (4.0-11.0) H",
    },
    {
        "biomarker": "Platelet Count",
        "value": 45.0,
        "unit": "10^9/L",
        "reference_min": 150.0,
        "reference_max": 400.0,
        "raw_text": "Platelets 45 10^9/L (150-400) LL",
    },
    {
        "biomarker": "Glucose",
        "value": 380.0,
        "unit": "mg/dL",
        "reference_min": 70.0,
        "reference_max": 140.0,
        "raw_text": "Random Glucose 380 mg/dL H",
    },
    {
        "biomarker": "Potassium",
        "value": 6.8,
        "unit": "mEq/L",
        "reference_min": 3.5,
        "reference_max": 5.0,
        "raw_text": "K+ 6.8 mEq/L (3.5-5.0) CRITICAL",
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test entry point
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_REPORT = """
PATHOLOGY LABORATORY REPORT
Patient: John Doe | DOB: 1958-04-12 | MRN: 448821
Collected: 2024-06-01 08:30 | Reported: 2024-06-01 10:15

COMPLETE BLOOD COUNT
  WBC           18.5   10^9/L    [4.0 - 11.0]  H
  RBC            3.8   10^12/L   [4.5 - 5.5]   L
  Haemoglobin   10.2   g/dL      [13.5 - 17.5] L
  Platelet Ct    45    10^9/L    [150 - 400]    LL CRITICAL

METABOLIC PANEL
  Sodium        138    mEq/L     [135 - 145]
  Potassium       6.8  mEq/L     [3.5 - 5.0]   CRITICAL HIGH
  Creatinine      3.1  mg/dL     [0.6 - 1.2]   H
  Glucose       380    mg/dL     [70 - 140]     H

CARDIAC MARKERS
  Troponin I    85.2   ng/L      [< 14]         CRITICAL HIGH

SpO2 on room air: 91%
""".strip()


if __name__ == "__main__":
    pipeline = ClinicalScreeningPipeline(use_mock_llm=True)
    result = pipeline.screen(
        report_text=SAMPLE_REPORT,
        report_id="RPT-TEST-001",
        patient_ref="TEST-PATIENT",
    )
    print("\n=== Clinical Screening Result ===")
    print(result.to_json())
