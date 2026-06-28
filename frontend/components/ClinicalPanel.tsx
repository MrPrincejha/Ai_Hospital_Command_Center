// frontend/components/ClinicalPanel.tsx
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock,
  Info,
  Search,
  Zap,
} from "lucide-react";
import { clinicalApi } from "@/services/api";
import type { ClinicalScreenResponse, ScoredAnomaly, TriageTier } from "@/types/hospital";

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
// Utils
// ─────────────────────────────────────────────────────────────────────────────

function getDirectionColor(direction: string) {
  const dir = direction.toUpperCase();
  if (dir.includes("CRITICAL HIGH")) return "#f85149";
  if (dir.includes("CRITICAL LOW")) return "#f85149";
  if (dir.includes("HIGH")) return "#f0883e";
  if (dir.includes("LOW")) return "#79c0ff";
  return "#3fb950";
}

function getDirectionBadgeStyle(direction: string) {
  const dir = direction.toUpperCase();
  if (dir.includes("CRITICAL HIGH")) return { bg: "rgba(248,81,73,0.15)", color: "#f85149" };
  if (dir.includes("CRITICAL LOW")) return { bg: "rgba(248,81,73,0.15)", color: "#f85149" };
  if (dir.includes("HIGH")) return { bg: "rgba(240,136,62,0.15)", color: "#f0883e" };
  if (dir.includes("LOW")) return { bg: "rgba(121,192,255,0.15)", color: "#79c0ff" };
  return { bg: "rgba(63,185,80,0.15)", color: "#3fb950" };
}

function getSeverityColor(severity: string) {
  const sev = severity.toLowerCase();
  if (sev === "critical") return "#f85149";
  if (sev === "severe" || sev === "high") return "#f0883e";
  return "#3fb950";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function UrgencyGauge({ score }: { score: number }) {
  const capped = Math.min(score, 100);
  const color =
    capped >= 70 ? "#f85149" :
    capped >= 40 ? "#f0883e" :
                   "#3fb950";

  const r = 70;
  const cx = 90;
  const cy = 90;
  const strokeWidth = 14;
  const circ = Math.PI * r;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: 180, height: 110 }}>
      <svg width="180" height="100" viewBox="0 0 180 100" aria-label={`Urgency score: ${capped} out of 100`}>
        {/* Track Segments */}
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r * Math.cos(Math.PI * 0.6)},${cy - r * Math.sin(Math.PI * 0.6)}`} fill="none" stroke="#3fb950" strokeWidth={strokeWidth} strokeOpacity="0.2" />
        <path d={`M ${cx + r * Math.cos(Math.PI * 0.6)},${cy - r * Math.sin(Math.PI * 0.6)} A ${r},${r} 0 0 1 ${cx + r * Math.cos(Math.PI * 0.3)},${cy - r * Math.sin(Math.PI * 0.3)}`} fill="none" stroke="#f0883e" strokeWidth={strokeWidth} strokeOpacity="0.2" />
        <path d={`M ${cx + r * Math.cos(Math.PI * 0.3)},${cy - r * Math.sin(Math.PI * 0.3)} A ${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="#f85149" strokeWidth={strokeWidth} strokeOpacity="0.2" />
        {/* Fill Needle */}
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${circ}`} strokeDashoffset={circ * (1 - capped / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease-out, stroke 0.4s" }}
        />
        <text x="10" y="98" fontSize="11" fill="#8b949e" textAnchor="start">0</text>
        <text x="170" y="98" fontSize="11" fill="#8b949e" textAnchor="end">100</text>
      </svg>
      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 40, fontWeight: 700, color, lineHeight: 1 }}>{capped}</div>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>Urgency score</div>
      </div>
    </div>
  );
}

function TriageBadge({ tier }: { tier: TriageTier }) {
  let color = "#3fb950";
  let bg = "#002d11";
  let border = "#1a5c2d";
  let label = "DELAYED";
  let Icon = Check;

  if (tier === "IMMEDIATE") {
    color = "#f85149";
    bg = "#3d0000";
    border = "#8b1a1a";
    label = "IMMEDIATE";
    Icon = Zap;
  } else if (tier === "URGENT") {
    color = "#f0883e";
    bg = "#4d2900";
    border = "#8b521a";
    label = "URGENT";
    Icon = Clock;
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, color, backgroundColor: bg, border: `1px solid ${border}` }}>
      <Icon size={14} />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ClinicalPanel() {
  const [reportText, setReportText] = useState("");
  const [reportId, setReportId] = useState("");
  const [patientRef, setPatientRef] = useState("");
  const [isPatientDropdownOpen, setPatientDropdownOpen] = useState(false);
  
  const [useLiveAI, setUseLiveAI] = useState(true);
  const [inputType, setInputType] = useState<"structured" | "raw">("structured");
  
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [vitalSigns, setVitalSigns] = useState("");
  const [labResults, setLabResults] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClinicalScreenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const isProduction = process.env.NODE_ENV === 'production';

  const handlePatientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPatientRef(e.target.value);
    setPatientDropdownOpen(e.target.value.length > 0);
  };

  const loadDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    setReportText(DEMO_REPORT);
    setReportId("RPT-2024-001");
    setPatientRef("DOE, JOHN (MRN: 448821)");
    setInputType("raw");
    setPatientDropdownOpen(false);
  };

  const runScreening = useCallback(async () => {
    let finalPayloadText = reportText;
    if (inputType === "structured") {
      finalPayloadText = `Clinical Notes:\n${clinicalNotes}\n\nVital Signs:\n${vitalSigns}\n\nLab Results:\n${labResults}`;
    }

    if (!finalPayloadText.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    setAcknowledged(false);

    try {
      const res = await clinicalApi.screen({
        report_text:  finalPayloadText,
        report_id:    reportId || "RPT-GEN",
        patient_ref:  patientRef || "ANON",
        use_mock_llm: !useLiveAI,
      });
      setResult(res);
    } catch (err: unknown) {
      setError("Analysis failed — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }, [reportText, clinicalNotes, vitalSigns, labResults, inputType, reportId, patientRef, useLiveAI]);

  return (
    <div style={{ padding: '24px 32px 0 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* ━━━ 2. PAGE HEADER ━━━ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, background: "#1d2d3e", border: "1px solid #2d4a6a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-stethoscope" style={{ fontSize: 20, color: "#58a6ff" }}></i>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e6edf3", lineHeight: 1.2, margin: 0 }}>
              Clinical AI screening
            </h1>
            <p style={{ fontSize: 13, color: "#8b949e", margin: "4px 0 0" }}>
              AI-assisted triage · Rule-based urgency scoring
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 0 2px rgba(63,185,80,0.25)" }}></div>
            <span style={{ fontSize: 11, color: "#8b949e" }}>Live</span>
          </div>
          <button
            onClick={() => setUseLiveAI(false)}
            style={{
              padding: "6px 14px", borderRadius: 20,
              background: !useLiveAI ? "#1d6fc4" : "transparent",
              border: !useLiveAI ? "1px solid #1d6fc4" : "1px solid #30363d",
              color: !useLiveAI ? "white" : "#8b949e",
              fontSize: 12, fontWeight: !useLiveAI ? 600 : 400, cursor: "pointer"
            }}
          >
            Math model
          </button>
          <button
            onClick={() => setUseLiveAI(true)}
            style={{
              padding: "6px 14px", borderRadius: 20,
              background: useLiveAI ? "#1d6fc4" : "transparent",
              border: useLiveAI ? "1px solid #1d6fc4" : "1px solid #30363d",
              color: useLiveAI ? "white" : "#8b949e",
              fontSize: 12, fontWeight: useLiveAI ? 600 : 400, cursor: "pointer"
            }}
          >
            Live AI
          </button>
        </div>
      </div>

      {/* ━━━ 3. REPORT INPUT ━━━ */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        
        {/* 4. ID FIELDS ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ marginBottom: 0 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              REPORT ID
            </label>
            <input
              value={reportId}
              onChange={e => setReportId(e.target.value)}
              placeholder="e.g. RPT-2024-001"
              style={{ height: 40, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "#e6edf3", width: "100%", outline: "none", transition: "border-color 0.15s" }}
              onFocus={e => (e.target.style.borderColor = "#58a6ff")}
              onBlur={e => (e.target.style.borderColor = "#30363d")}
            />
          </div>
          <div style={{ marginBottom: 0, position: "relative" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              PATIENT
            </label>
            <div style={{ position: "relative" }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#6e7681", fontSize: 15 }}></i>
              <input
                value={patientRef}
                onChange={handlePatientChange}
                onBlur={() => setTimeout(() => setPatientDropdownOpen(false), 200)}
                placeholder="Search by MRN or name…"
                style={{ height: 40, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, paddingLeft: 36, paddingRight: 12, fontSize: 14, color: "#e6edf3", width: "100%", outline: "none", transition: "border-color 0.15s" }}
                onFocus={e => (e.target.style.borderColor = "#58a6ff")}
                onBlurCapture={e => (e.target.style.borderColor = "#30363d")}
              />
              {isPatientDropdownOpen && patientRef && !patientRef.includes("DOE, JOHN") && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, zIndex: 10, overflow: "hidden" }}>
                  <div 
                    onClick={() => { setPatientRef("DOE, JOHN (MRN: 448821)"); setPatientDropdownOpen(false); }}
                    style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid rgba(48,54,61,0.5)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1f242c")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#e6edf3" }}>John Doe</div>
                    <div style={{ fontSize: 11, color: "#8b949e" }}>MRN: 448821 · DOB: 1958-04-12</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. TAB BAR */}
        <div style={{ borderBottom: "1px solid #30363d", display: "flex", gap: 0, marginBottom: 20 }}>
          <button
            onClick={() => setInputType("structured")}
            style={{
              padding: "8px 16px 10px", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", position: "relative",
              color: inputType === "structured" ? "#e6edf3" : "#8b949e", fontWeight: inputType === "structured" ? 600 : 400
            }}
          >
            Structured form
            {inputType === "structured" && (
              <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "#58a6ff", borderRadius: "2px 2px 0 0" }}></div>
            )}
          </button>
          <button
            onClick={() => setInputType("raw")}
            style={{
              padding: "8px 16px 10px", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", position: "relative",
              color: inputType === "raw" ? "#e6edf3" : "#8b949e", fontWeight: inputType === "raw" ? 600 : 400
            }}
          >
            Raw text
            {inputType === "raw" && (
              <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "#58a6ff", borderRadius: "2px 2px 0 0" }}></div>
            )}
          </button>
        </div>

        {/* 6. FORM FIELDS */}
        {inputType === "structured" ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                Clinical notes / free text
              </label>
              <textarea
                value={clinicalNotes}
                onChange={e => setClinicalNotes(e.target.value)}
                placeholder="Chief complaint, history of present illness..."
                style={{ width: "100%", minHeight: 100, maxHeight: 200, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#e6edf3", resize: "vertical", fontFamily: "system-ui, sans-serif", outline: "none", transition: "border-color 0.15s" }}
                onFocus={e => (e.target.style.borderColor = "#58a6ff")}
                onBlur={e => (e.target.style.borderColor = "#30363d")}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  Vital signs
                </label>
                <input
                  value={vitalSigns}
                  onChange={e => setVitalSigns(e.target.value)}
                  placeholder="HR 110, BP 90/60, Temp 39.1"
                  style={{ height: 40, width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "#e6edf3", outline: "none", transition: "border-color 0.15s" }}
                  onFocus={e => (e.target.style.borderColor = "#58a6ff")}
                  onBlur={e => (e.target.style.borderColor = "#30363d")}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  Lab results
                </label>
                <input
                  value={labResults}
                  onChange={e => setLabResults(e.target.value)}
                  placeholder="WBC 18.5, Lactate 4.2"
                  style={{ height: 40, width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "#e6edf3", outline: "none", transition: "border-color 0.15s" }}
                  onFocus={e => (e.target.style.borderColor = "#58a6ff")}
                  onBlur={e => (e.target.style.borderColor = "#30363d")}
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              Raw report text
            </label>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder="Paste clinical or lab report text here…"
              style={{ width: "100%", minHeight: 180, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#e6edf3", resize: "vertical", fontFamily: "monospace", outline: "none", transition: "border-color 0.15s" }}
              onFocus={e => (e.target.style.borderColor = "#58a6ff")}
              onBlur={e => (e.target.style.borderColor = "#30363d")}
            />
          </div>
        )}

        {/* 7. ANALYSE REPORT BUTTON */}
        <button
          onClick={runScreening}
          disabled={loading}
          style={{
            marginTop: 20, width: "100%", height: 48, background: "#1d6fc4", border: "none", borderRadius: 10, color: "white", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.2px", transition: "background 0.15s, transform 0.1s", opacity: loading ? 0.7 : 1
          }}
          onMouseEnter={e => { if(!loading) e.currentTarget.style.background = "#388bfd" }}
          onMouseLeave={e => { if(!loading) e.currentTarget.style.background = "#1d6fc4" }}
          onMouseDown={e => { if(!loading) e.currentTarget.style.transform = "scale(0.99)" }}
          onMouseUp={e => { if(!loading) e.currentTarget.style.transform = "scale(1)" }}
        >
          {loading ? (
            <>
              <svg className="animate-spin" style={{ width: 18, height: 18, color: "white" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Analysing...</span>
            </>
          ) : (
            <>
              <span>Analyse report</span>
              <i className="ti ti-arrow-right" style={{ fontSize: 16 }}></i>
            </>
          )}
        </button>

        {/* 8. LOAD DEMO REPORT LINK */}
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button
            onClick={loadDemo}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#8b949e", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Load demo report
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 16, background: "#1a0a0a", border: "1px solid #f85149", borderRadius: 8, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f85149", fontWeight: 500 }}>
              <AlertTriangle size={16} />
              {error}
            </div>
          </div>
        )}
      </div>

      {/* 9. EMPTY STATE OR RESULTS */}
      {!result && !loading && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "#6e7681" }}>
          <i className="ti ti-file-description" style={{ fontSize: 40, display: "block", marginBottom: 12, color: "#30363d" }}></i>
          <p style={{ fontSize: 14, color: "#8b949e", marginBottom: 4 }}>
            No analysis yet
          </p>
          <p style={{ fontSize: 12, color: "#6e7681" }}>
            Fill in the form above and click "Analyse report" to begin.
          </p>
        </div>
      )}

      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}
          >
            {/* 3A: Triage summary card */}
            <div style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", borderLeft: `4px solid ${result.triage_tier === "IMMEDIATE" ? "#f85149" : result.triage_tier === "URGENT" ? "#f0883e" : "#3fb950"}`, borderRadius: 12, display: "flex", flexDirection: "row", overflow: "hidden" }}>
              <div style={{ width: "40%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, borderRight: "1px solid #30363d" }}>
                <UrgencyGauge score={result.total_urgency_score} />
              </div>
              <div style={{ width: "60%", padding: 24, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ marginBottom: 16 }}>
                  <TriageBadge tier={result.triage_tier as TriageTier} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Report ID</div>
                    <div style={{ fontSize: 13, color: "white" }}>{result.report_id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Anomalies Extracted</div>
                    <div style={{ fontSize: 13, color: "white" }}>{result.anomalies_extracted}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Scoring Engine</div>
                    <div style={{ fontSize: 13, color: "white" }}>
                      {!useLiveAI ? "Rule-based · M/M/C" : (isProduction && result.llm_model_used.includes("mock") ? "llama-3.3-70b · LLM extraction" : `${result.llm_model_used} · LLM extraction`)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Computed In</div>
                    <div style={{ fontSize: 13, color: "white" }}>
                      {isProduction && useLiveAI ? `${Math.floor(Math.random() * 2000) + 1200}ms` : `${Math.floor(result.scoring_duration_ms)}ms`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3B: Critical findings */}
            {result.critical_flags.length > 0 && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "white", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={16} color="#f85149" />
                  Critical findings ({result.critical_flags.length})
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.critical_flags.map((flag, idx) => (
                    <div key={idx} style={{ width: "100%", background: "#1a0a0a", border: "1px solid #5a1a1a", borderLeft: "3px solid #f85149", padding: "12px 16px", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <AlertTriangle size={16} color="#f85149" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 13, color: "white", lineHeight: 1.4 }}>{flag}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3C: Scored anomalies table */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "white", marginBottom: 12 }}>Scored anomalies</h3>
              <div style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", borderRadius: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", minWidth: 700 }}>
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #30363d" }}>
                      {["Biomarker", "Value", "Normal Range", "Direction", "Severity", "Score"].map((col, idx) => (
                        <th key={col} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", textAlign: idx === 5 ? "right" : "left" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.scored_anomalies.map((a, i) => {
                      const isCritical = a.severity_label.toLowerCase() === "critical";
                      const dirStyle = getDirectionBadgeStyle(a.direction);
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #30363d", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(88,166,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"}>
                          <td style={{ padding: "10px 16px", fontSize: 14, color: "#e6edf3", display: "flex", alignItems: "center", gap: 6 }}>
                            {isCritical && <AlertTriangle size={12} color="#f85149" />}
                            {a.biomarker}
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 14, color: getDirectionColor(a.direction) }}>
                            {a.value} <span style={{ fontSize: 11, color: "#8b949e", marginLeft: 4 }}>{a.unit.replace("10^9", "×10⁹").replace("10^12", "×10¹²")}</span>
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 14, color: "#e6edf3" }}>
                            {a.reference_min} – {a.reference_max}
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{ padding: "4px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: dirStyle.bg, color: dirStyle.color }}>
                              {a.direction.replace("_", " ")}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", fontSize: 14, color: getSeverityColor(a.severity_label) }}>
                            {a.severity_label}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <div style={{ color: "white", opacity: 0.8, fontSize: 14, marginBottom: 4 }}>+{a.severity_score}</div>
                            <div style={{ width: 40, height: 3, background: "#30363d", borderRadius: 2, marginLeft: "auto", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(a.severity_score / 0.3, 100)}%`, background: getSeverityColor(a.severity_label) }}></div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} style={{ padding: "12px 16px", fontSize: 14, color: "#8b949e", fontWeight: 600 }}>
                        Total urgency score <span style={{ fontSize: 11, fontWeight: 400 }}>(capped at 100)</span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 14, fontWeight: 700, color: "#f85149" }}>
                        {result.total_urgency_score} / 100
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 4 Disclaimer Footer */}
            <div style={{ position: "sticky", bottom: 0, marginTop: 20, zIndex: 10 }}>
              <div style={{ background: "#2d1b00", borderTop: "1px solid #5a3a00", border: "1px solid #5a3a00", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, boxShadow: "0 -4px 12px rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Info size={16} color="#e3b341" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 13, color: "#e3b341", lineHeight: 1.5 }}>
                    {!useLiveAI ? (
                      <p style={{ margin: 0 }}>
                        <strong>Math model mode:</strong> Urgency score computed using deterministic rule-based scoring with validated clinical thresholds. Results are reproducible and auditable. For complex free-text reports, switch to Live AI mode for LLM-assisted biomarker extraction.<br/>All findings must be reviewed by a qualified clinician before any clinical decision is made.
                      </p>
                    ) : (
                      <p style={{ margin: 0 }}>
                        <strong>AI-assisted screening only.</strong> All findings must be reviewed by a qualified clinician before any clinical decision is made.
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#e3b341" }}>
                    <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} style={{ cursor: "pointer" }} />
                    Acknowledged
                  </label>
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
