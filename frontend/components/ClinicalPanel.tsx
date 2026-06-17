// frontend/components/ClinicalPanel.tsx
/**
 * AI Hospital Command Center — Clinical AI Screening Panel
 * =========================================================
 * Full UI for the clinical report anomaly screening engine.
 *
 * Features:
 * - Report text input (paste or type)
 * - One-click demo report loader
 * - Mock LLM toggle (no API key required)
 * - Animated urgency score gauge (0–100)
 * - Triage tier badge (IMMEDIATE / URGENT / SEMI_URGENT / NON_URGENT)
 * - Scored anomaly table with severity colour coding
 * - Critical flags highlighted prominently
 * - Clinical disclaimer shown on every result
 * - Processing time and model info footer
 */

"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  FileText,
  FlaskConical,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { clinicalApi } from "@/services/api";
import {
  SEVERITY_COLOURS,
  TRIAGE_COLOURS,
  TRIAGE_LABELS,
  cn,
} from "@/lib/utils";
import type { ClinicalScreenResponse, ScoredAnomaly, TriageTier } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Demo report (mirrors SAMPLE_REPORT from clinical_scorer.py)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_REPORT = `PATHOLOGY LABORATORY REPORT
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

SpO2 on room air: 91%`;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function UrgencyGauge({ score }: { score: number }) {
  const capped  = Math.min(score, 100);
  const color   =
    capped >= 80 ? "#ef4444" :
    capped >= 50 ? "#f59e0b" :
    capped >= 25 ? "#fbbf24" :
                   "#10b981";

  // SVG arc math
  const r      = 52;
  const cx     = 64;
  const cy     = 64;
  const circ   = Math.PI * r; // half-circle
  const offset = circ * (1 - capped / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="128" height="80" viewBox="0 0 128 80">
        {/* Track */}
        <path
          d={`M 12,64 A ${r},${r} 0 0 1 116,64`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 12,64 A ${r},${r} 0 0 1 116,64`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out, stroke 0.4s" }}
        />
      </svg>
      <div className="text-center -mt-6">
        <motion.p
          key={score}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold font-mono-data"
          style={{ color }}
        >
          {capped}
        </motion.p>
        <p className="text-xs text-slate-400 mt-1">
          Urgency Score
        </p>
      </div>
    </div>
  );
}

function TriageBadge({ tier }: { tier: TriageTier }) {
  const color = TRIAGE_COLOURS[tier];
  const label = TRIAGE_LABELS[tier];
  const Icon  = tier === "IMMEDIATE" ? Zap :
                tier === "URGENT"    ? AlertTriangle :
                                       CheckCircle;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold"
      style={{ color, background: `${color}14`, borderColor: `${color}35` }}
    >
      <Icon size={14} />
      {label}
    </div>
  );
}

function AnomalyRow({ anomaly, index }: { anomaly: ScoredAnomaly; index: number }) {
  const color = SEVERITY_COLOURS[anomaly.severity_label];
  const isCritical = anomaly.severity_label === "critical";

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={clsx(
        "border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors",
        isCritical && "bg-red-500/5",
      )}
    >
      {/* Biomarker */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isCritical && (
            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-100">
            {anomaly.biomarker}
          </span>
        </div>
      </td>

      {/* Value vs range */}
      <td className="px-4 py-3">
        <span className="font-mono-data text-xs font-semibold" style={{ color }}>
          {anomaly.value}
        </span>
        <span className="text-xs text-slate-400 ml-1">
          {anomaly.unit}
        </span>
      </td>

      {/* Reference range */}
      <td className="px-4 py-3">
        <span className="font-mono-data text-xs text-slate-400">
          {anomaly.reference_min} – {anomaly.reference_max}
        </span>
      </td>

      {/* Direction */}
      <td className="px-4 py-3">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded"
          style={{ color, background: `${color}15` }}
        >
          {anomaly.direction.replace("_", " ")}
        </span>
      </td>

      {/* Severity */}
      <td className="px-4 py-3">
        <span className="text-xs" style={{ color }}>
          {anomaly.severity_label}
        </span>
      </td>

      {/* Score */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono-data text-sm font-semibold" style={{ color }}>
          +{anomaly.severity_score}
        </span>
      </td>
    </motion.tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ClinicalPanel() {
  const [reportText, setReportText]       = useState("");
  const [reportId,   setReportId]         = useState("RPT-001");
  const [patientRef, setPatientRef]       = useState("ANON");
  const [useMock,    setUseMock]          = useState(true);
  const [loading,    setLoading]          = useState(false);
  const [result,     setResult]           = useState<ClinicalScreenResponse | null>(null);
  const [error,      setError]            = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    setReportText(DEMO_REPORT);
    setReportId("DEMO-RPT-001");
    setPatientRef("DEMO-PATIENT");
  }, []);

  const runScreening = useCallback(async () => {
    if (!reportText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await clinicalApi.screen({
        report_text:  reportText,
        report_id:    reportId,
        patient_ref:  patientRef,
        use_mock_llm: useMock,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Screening failed");
    } finally {
      setLoading(false);
    }
  }, [reportText, reportId, patientRef, useMock]);

  const runDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await clinicalApi.demo();
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <ClipboardList size={20} className="text-emerald-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Clinical AI Screening
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            LLM Extraction · Rule-Based Urgency Scoring · Deterministic Triage
          </p>
        </div>
      </div>

      {/* ── Input card ───────────────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <FileText size={13} />
            Report Input
          </h3>
          <div className="flex gap-2">
            <button
              onClick={loadDemo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600 transition-all"
            >
              <FlaskConical size={11} />
              Load Demo
            </button>
            <button
              onClick={runDemo}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-950/40 text-amber-300 border border-amber-700/50 hover:bg-amber-950/60 transition-all"
            >
              <Zap size={11} />
              Quick Demo
            </button>
          </div>
        </div>

        {/* Meta fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              Report ID
            </label>
            <input
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              Patient Ref
            </label>
            <input
              value={patientRef}
              onChange={(e) => setPatientRef(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-[rgba(6,182,212,0.12)] text-ink-primary font-display text-xs focus:outline-none focus:border-cyan-500/40"
            />
          </div>
        </div>

        {/* Report textarea */}
        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          placeholder="Paste clinical or lab report text here…"
          rows={10}
          className="w-full px-4 py-3 rounded-lg bg-surface-700 border border-[rgba(6,182,212,0.12)] text-ink-primary font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-cyan-500/30 placeholder-ink-muted"
        />

        {/* Options row */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button
              onClick={() => setUseMock(!useMock)}
              className={clsx(
                "relative w-9 h-5 rounded-full border transition-all",
                useMock
                  ? "bg-cyan-500/20 border-cyan-500/40"
                  : "bg-surface-700 border-[rgba(6,182,212,0.1)]",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                  useMock ? "left-4 bg-cyan-400" : "left-0.5 bg-ink-muted",
                )}
              />
            </button>
            <span className="font-display text-[11px] text-ink-secondary tracking-wider">
              Mock LLM (no API key needed)
            </span>
          </label>

          <button
            onClick={runScreening}
            disabled={loading || !reportText.trim()}
            className={clsx(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg font-display text-xs font-bold tracking-widest uppercase transition-all",
              loading || !reportText.trim()
                ? "bg-surface-700 text-ink-muted cursor-not-allowed border border-[rgba(6,182,212,0.06)]"
                : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25",
            )}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ClipboardList size={13} />
            )}
            {loading ? "Screening…" : "Screen Report"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 font-display text-xs text-red-400">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── Result ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Score + triage summary */}
            <div className="card p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Gauge */}
                <UrgencyGauge score={result.total_urgency_score} />

                {/* Right side */}
                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <p className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
                      Triage Classification
                    </p>
                    <TriageBadge tier={result.triage_tier as TriageTier} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="font-display text-[10px] text-ink-muted tracking-widest">Report ID</p>
                      <p className="font-display text-xs text-ink-secondary mt-0.5">{result.report_id}</p>
                    </div>
                    <div>
                      <p className="font-display text-[10px] text-ink-muted tracking-widest">Anomalies</p>
                      <p className="font-display text-xs text-cyan-400 mt-0.5">{result.anomalies_extracted} extracted</p>
                    </div>
                    <div>
                      <p className="font-display text-[10px] text-ink-muted tracking-widest">Model</p>
                      <p className="font-display text-xs text-ink-secondary mt-0.5">{result.llm_model_used}</p>
                    </div>
                    <div>
                      <p className="font-display text-[10px] text-ink-muted tracking-widest">Duration</p>
                      <p className="font-display text-xs text-ink-secondary mt-0.5">{result.scoring_duration_ms.toFixed(0)}ms</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Critical flags */}
            {result.critical_flags.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="card p-5 border-red-500/30 bg-red-500/5"
              >
                <h3 className="font-display text-xs font-bold text-red-400 tracking-widest uppercase mb-3 flex items-center gap-2">
                  <Zap size={13} />
                  Critical Findings ({result.critical_flags.length})
                </h3>
                <ul className="space-y-2">
                  {result.critical_flags.map((flag, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 font-body text-sm text-red-300"
                    >
                      <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Anomaly table */}
            {result.scored_anomalies.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="card overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-[rgba(6,182,212,0.08)]">
                  <h3 className="font-display text-xs font-bold text-ink-secondary tracking-widest uppercase">
                    Scored Anomalies
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgba(6,182,212,0.05)]">
                        {["Biomarker", "Value", "Normal Range", "Direction", "Severity", "Score"].map((col) => (
                          <th
                            key={col}
                            className={cn(
                              "px-4 py-3 font-display text-[10px] text-ink-muted tracking-widest uppercase font-normal",
                              col === "Score" ? "text-right" : "text-left",
                            )}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.scored_anomalies.map((a, i) => (
                        <AnomalyRow key={i} anomaly={a} index={i} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[rgba(6,182,212,0.08)] bg-surface-700/40">
                        <td colSpan={5} className="px-4 py-3 font-display text-xs text-ink-muted tracking-widest uppercase">
                          Total Urgency Score (capped at 100)
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className="font-display text-lg font-bold"
                            style={{
                              color:
                                result.total_urgency_score >= 80 ? "#ef4444" :
                                result.total_urgency_score >= 50 ? "#f59e0b" :
                                result.total_urgency_score >= 25 ? "#fbbf24" :
                                "#10b981",
                            }}
                          >
                            {result.total_urgency_score}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Disclaimer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-start gap-3 px-4 py-3 rounded-lg bg-surface-700 border border-[rgba(6,182,212,0.06)]"
            >
              <Shield size={14} className="text-ink-muted flex-shrink-0 mt-0.5" />
              <p className="font-body text-xs text-ink-muted leading-relaxed">
                {result.disclaimer}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
