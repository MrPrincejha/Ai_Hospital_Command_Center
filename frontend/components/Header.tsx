// frontend/components/Header.tsx
/**
 * AI Hospital Command Center — Top Header Bar
 * ============================================
 * Fixed top bar displaying:
 * - Current active panel title
 * - Real-time clock
 * - Global hospital alert level badge
 * - WebSocket connection indicator
 * - Quick-start simulation button
 * - Last telemetry update timestamp
 */

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Play,
  Radio,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { useHospitalStore } from "@/store/hospitalStore";
import { useSimulationControl } from "@/hooks/useHospital";
import { relativeTime } from "@/lib/utils";
import ConnectionStatusPill from "@/components/ConnectionStatusPill";
import type { AlertLevel } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_TITLES: Record<string, { title: string; sub: string }> = {
  dashboard:  { title: "Command Center",    sub: "Live Operational Intelligence" },
  simulation: { title: "Simulation Engine", sub: "SimPy M/M/c Discrete Event Simulation" },
  forecast:   { title: "ML Forecast",       sub: "12-Hour Horizon · XGBoost Predictions" },
  clinical:   { title: "Clinical AI Screen",sub: "Report Urgency Scoring Engine" },
  copilot:    { title: "AI Copilot",        sub: "LangChain Operational Advisor" },
};

function GlobalAlertBadge({ level }: { level: AlertLevel }) {
  const config = {
    normal:   { icon: CheckCircle, cls: "bg-emerald-950/40 text-emerald-300 border border-emerald-700/50", label: "All Clear" },
    warning:  { icon: AlertTriangle, cls: "bg-amber-950/40 text-amber-300 border border-amber-700/50", label: "Warning" },
    critical: { icon: Zap, cls: "bg-red-950/40 text-red-300 border border-red-700/50 animate-pulse", label: "Critical" },
  }[level];

  const Icon = config.icon;

  return (
    <div className={clsx(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium",
      config.cls,
    )}>
      <Icon size={14} />
      {config.label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Header() {
  const activePanel  = useHospitalStore((s) => s.activePanel);
  const telemetry    = useHospitalStore((s) => s.latestTelemetry);
  const lastUpdated  = useHospitalStore((s) => s.lastUpdated);
  const simulation   = useHospitalStore((s) => s.simulation);

  const { startSimulation, loading: simLoading } = useSimulationControl();

  const [clock, setClock] = useState("");

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h   = String(now.getHours()).padStart(2, "0");
      const m   = String(now.getMinutes()).padStart(2, "0");
      const s   = String(now.getSeconds()).padStart(2, "0");
      setClock(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const panelMeta   = PANEL_TITLES[activePanel] ?? PANEL_TITLES.dashboard;
  const globalAlert = telemetry?.global_alert ?? "normal";
  const simRunning  = simulation.status === "PENDING" || simulation.status === "STARTED";

  return (
    <header className="h-[68px] flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm z-40 gap-4">

      {/* ── Left: Panel title ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activePanel}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 min-w-0"
        >
          <Activity size={16} className="text-emerald-400 flex-shrink-0" />
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-slate-100 leading-none">
              {panelMeta.title}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 leading-none">
              {panelMeta.sub}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Center: Spacer ─────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Right: Status indicators ───────────────────────────────────────── */}
      <div className="flex items-center gap-2">

        {/* Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
          <Clock size={12} className="text-slate-400" />
          <span className="font-mono-data text-xs text-slate-300">
            {clock}
          </span>
        </div>

        {/* Last telemetry update */}
        {lastUpdated && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
            <Radio size={11} className="text-emerald-400/60 animate-pulse" />
            <span className="text-xs text-slate-400">
              {relativeTime(lastUpdated)}
            </span>
          </div>
        )}

        {/* Global alert badge */}
        <GlobalAlertBadge level={globalAlert} />

        {/* WebSocket status — animated pill */}
        <ConnectionStatusPill />

        {/* Quick-start simulation button */}
        <button
          onClick={() => startSimulation(24)}
          disabled={simLoading || simRunning}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
            simRunning || simLoading
              ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
              : "bg-cyan-950/40 border-cyan-700/50 text-cyan-300 hover:bg-cyan-950/60",
          )}
        >
          <Play size={11} className={simRunning ? "animate-pulse" : ""} />
          <span className="hidden sm:inline">
            {simRunning ? "Running" : "Run Sim"}
          </span>
        </button>
      </div>
    </header>
  );
}
