// frontend/app/page.tsx
/**
 * AI Hospital Command Center — Main Dashboard Page
 * =================================================
 * Root Next.js App Router page. Composes:
 *
 * Layout:
 *   ┌──────────────┬────────────────────────────────────┐
 *   │   Sidebar    │          Header (top bar)          │
 *   │  (nav rail)  ├────────────────────────────────────┤
 *   │              │                                    │
 *   │              │   Active Panel Content             │
 *   │              │                                    │
 *   └──────────────┴────────────────────────────────────┘
 *
 * Panels:
 *   dashboard  — KPI grid + telemetry chart + dept table
 *   simulation — SimulationPanel
 *   forecast   — ForecastPanel
 *   clinical   — ClinicalPanel
 *   copilot    — CopilotPanel
 *
 * The WebSocket bridge is mounted here (useWebSocketBridge)
 * so it persists across panel switches.
 */

"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  TrendingUp,
  Users,
} from "lucide-react";

// Layout
import Sidebar        from "@/components/Sidebar";
import Header         from "@/components/Header";
import AlertBanner    from "@/components/AlertBanner";

// Panel components
import MetricCard      from "@/components/MetricCard";
import TelemetryChart  from "@/components/TelemetryChart";
import DepartmentTable from "@/components/DepartmentTable";
import ForecastPanel   from "@/components/ForecastPanel";
import SimulationPanel from "@/components/SimulationPanel";
import ClinicalPanel   from "@/components/ClinicalPanel";
import CopilotPanel    from "@/components/CopilotPanel";

// Hooks & store
import { useWebSocketBridge, useTelemetry, useSimulationControl } from "@/hooks/useHospital";
import { useHospitalStore, useDepartmentSnapshot } from "@/store/hospitalStore";
import { fmtPct, fmtWaitTime, alertTextClass } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard KPI grid
// ─────────────────────────────────────────────────────────────────────────────

function DashboardKPIs() {
  const { telemetry } = useTelemetry();
  const telemetryHistory = useHospitalStore((s) => s.telemetryHistory);
  const er   = useDepartmentSnapshot("ER");
  const icu  = useDepartmentSnapshot("ICU");
  const opd  = useDepartmentSnapshot("OPD");
  const ward = useDepartmentSnapshot("Ward");

  // Extract sparkline data from history
  const queueSparkline = telemetryHistory.map((p) => ({ value: p.total_queue }));
  const icuSparkline = telemetryHistory.map((p) => ({ value: p.icu_occupancy * 100 }));
  const erSparkline = telemetryHistory.map((p) => ({ value: p.er_congestion * 100 }));
  const opdSparkline = telemetryHistory.map((p) => ({ value: p.opd_utilization * 100 }));
  const erUtilSparkline = telemetryHistory.map((p) => ({ value: p.er_congestion * 100 }));
  const wardSparkline = telemetryHistory.map((p) => ({ value: p.ward_utilization * 100 }));

  if (!telemetry) {
    // Skeleton state while awaiting first telemetry
    return (
      <div className="dashboard-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="card p-5 flex flex-col gap-3 h-[140px] skeleton-loading border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 bg-slate-700 rounded w-24" />
              <div className="h-2 bg-slate-700 rounded w-12" />
            </div>
            <div className="h-4 bg-slate-700 rounded w-16 mt-2" />
            <div className="mt-auto h-2 bg-slate-700 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {/* ── Row 1: Global KPIs ───────────────────────────────────────── */}
      <MetricCard
        index={0}
        title="Total Queue"
        value={telemetry.total_queue}
        unit="patients"
        alertLevel={telemetry.global_alert}
        subtitle="All departments combined"
        icon={<Users size={16} />}
        sparkline={queueSparkline}
      />

      <MetricCard
        index={1}
        title="ICU Occupancy"
        value={fmtPct(telemetry.icu_occupancy_pct, 1)}
        alertLevel={
          telemetry.icu_occupancy_pct > 0.9 ? "critical" :
          telemetry.icu_occupancy_pct > 0.75 ? "warning" : "normal"
        }
        progress={telemetry.icu_occupancy_pct}
        subtitle={`${icu?.patients_in_service ?? "—"} of ${10} beds occupied`}
        icon={<Activity size={16} />}
        sparkline={icuSparkline}
      />

      <MetricCard
        index={2}
        title="ER Congestion"
        value={fmtPct(telemetry.er_congestion_pct, 1)}
        alertLevel={
          telemetry.er_congestion_pct > 0.8 ? "critical" :
          telemetry.er_congestion_pct > 0.6 ? "warning" : "normal"
        }
        progress={telemetry.er_congestion_pct}
        subtitle={`${er?.queue_length ?? "—"} waiting · ${fmtWaitTime(er?.avg_wait_time ?? 0)} avg`}
        icon={<AlertTriangle size={16} />}
        sparkline={erSparkline}
      />

      <MetricCard
        index={3}
        title="Global Alert"
        value={telemetry.global_alert.toUpperCase()}
        alertLevel={telemetry.global_alert}
        subtitle="Highest priority across all depts"
        icon={<TrendingUp size={16} />}
      />

      {/* ── Row 2: Department KPIs ───────────────────────────────────── */}
      <MetricCard
        index={4}
        title="OPD Utilisation"
        value={fmtPct(opd?.server_utilization ?? 0, 1)}
        alertLevel={opd?.alert_level ?? "normal"}
        progress={opd?.server_utilization ?? 0}
        subtitle={`${opd?.queue_length ?? "—"} in queue · ${fmtWaitTime(opd?.avg_wait_time ?? 0)} wait`}
        sparkline={opdSparkline}
      />

      <MetricCard
        index={5}
        title="ER Utilisation"
        value={fmtPct(er?.server_utilization ?? 0, 1)}
        alertLevel={er?.alert_level ?? "normal"}
        progress={er?.server_utilization ?? 0}
        subtitle={`${er?.queue_length ?? "—"} queued · ${er?.overflow_events ?? 0} overflow`}
        sparkline={erUtilSparkline}
      />

      <MetricCard
        index={6}
        title="Ward Utilisation"
        value={fmtPct(ward?.server_utilization ?? 0, 1)}
        alertLevel={ward?.alert_level ?? "normal"}
        progress={ward?.server_utilization ?? 0}
        subtitle={`${ward?.queue_length ?? "—"} in queue`}
        sparkline={wardSparkline}
      />

      <MetricCard
        index={7}
        title="ICU Throughput"
        value={(icu?.throughput_per_hour ?? 0).toFixed(2)}
        unit="/h"
        alertLevel="normal"
        subtitle={`${icu?.patients_completed ?? 0} completed`}
        icon={<Database size={16} />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard panel — the default "Command Center" view
// ─────────────────────────────────────────────────────────────────────────────

function DashboardPanel() {
  const { telemetry, lastUpdated } = useTelemetry();

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div>
        <h2 className="section-title">Operational KPIs</h2>
        <DashboardKPIs />
      </div>

      {/* Telemetry chart + forecast side-by-side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chart takes 2/3 width */}
        <div className="xl:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-100">
                Live Telemetry Stream
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rolling 60-tick history · ICU · ER · OPD · Queue
              </p>
            </div>
            {lastUpdated && (
              <span className="font-mono-data text-xs text-slate-400">
                <Clock size={10} className="inline mr-1" />
                {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
          </div>
          <TelemetryChart height={260} />
        </div>

        {/* Forecast mini-panel takes 1/3 */}
        <div className="card p-6 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-100 mb-4">
            ML Forecast
          </h3>
          <ForecastMiniCard />
        </div>
      </div>

      {/* Department table */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Department Status</h2>
        <DepartmentTable />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast mini card for dashboard sidebar
// ─────────────────────────────────────────────────────────────────────────────

function ForecastMiniCard() {
  const forecast = useHospitalStore((s) => s.latestForecast);
  const setPanel = useHospitalStore((s) => s.setActivePanel);

  if (!forecast) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
        <TrendingUp size={28} className="text-slate-400" />
        <p className="text-xs text-slate-400">
          No forecast yet
        </p>
        <button
          onClick={() => setPanel("forecast")}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-950/60 transition-all"
        >
          Run Forecast →
        </button>
      </div>
    );
  }

  const riskColor =
    forecast.risk_level === "critical" ? "#ef4444" :
    forecast.risk_level === "high"     ? "#f59e0b" :
    forecast.risk_level === "medium"   ? "#fbbf24" :
                                         "#10b981";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-semibold text-slate-100">
          12h Forecast
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          XGBoost prediction
        </p>
      </div>

      {/* Risk badge */}
      <div
        className="flex items-center justify-center px-4 py-3 rounded-xl border"
        style={{ color: riskColor, background: `${riskColor}10`, borderColor: `${riskColor}30` }}
      >
        <span className="text-sm font-semibold">
          {forecast.risk_level.charAt(0).toUpperCase() + forecast.risk_level.slice(1)} risk
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        {[
          { label: "ICU t+12h",    val: fmtPct(forecast.icu_occupancy_t12),  color: forecast.icu_occupancy_t12 > 0.85 ? "#ef4444" : "#10b981" },
          { label: "ER t+12h",     val: fmtPct(forecast.er_congestion_t12),  color: forecast.er_congestion_t12 > 0.75 ? "#f59e0b" : "#10b981" },
          { label: "Inflow t+12h", val: `${forecast.patient_inflow_t12} pts`, color: "#94a3b8" },
        ].map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{m.label}</span>
            <span className="font-mono-data text-sm font-semibold" style={{ color: m.color }}>{m.val}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setPanel("forecast")}
        className="mt-auto text-left text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors"
      >
        Full forecast →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page transitions
// ─────────────────────────────────────────────────────────────────────────────

const panelVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0,   transition: { duration: 0.25, ease: "easeOut" } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.15 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Root page
// ─────────────────────────────────────────────────────────────────────────────

export default function HospitalCommandCenter() {
  // Mount the WebSocket bridge once at root level
  useWebSocketBridge();

  const activePanel = useHospitalStore((s) => s.activePanel);
  const sidebarOpen = useHospitalStore((s) => s.sidebarOpen);

  // Kick off a simulation automatically on first load if nothing is running
  const { simulation, startSimulation } = useSimulationControl();
  useEffect(() => {
    if (simulation.status === "IDLE") {
      // Silently start a background 24h simulation on first mount
      startSimulation(24, 42);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <Header />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">

            {/* Alert banners */}
            <AlertBanner />

            {/* Panel routing */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {activePanel === "dashboard"  && <DashboardPanel />}
                {activePanel === "simulation" && <SimulationPanel />}
                {activePanel === "forecast"   && <ForecastPanel />}
                {activePanel === "clinical"   && <ClinicalPanel />}
                {activePanel === "copilot"    && <CopilotPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* ── Status bar ───────────────────────────────────────────────── */}
        <StatusBar />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bar — fixed bottom strip
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar() {
  const wsState     = useHospitalStore((s) => s.wsState);
  const connectionId = useHospitalStore((s) => s.connectionId);
  const simulation  = useHospitalStore((s) => s.simulation);
  const lastUpdated = useHospitalStore((s) => s.lastUpdated);

  return (
    <div className="flex-shrink-0 h-7 flex items-center justify-between px-5 border-t border-slate-800 bg-slate-900">
      <div className="flex items-center gap-4">
        {/* WS state */}
        <span className="font-mono-data text-xs text-slate-400">
          WS:{" "}
          <span className={
            wsState === "CONNECTED"    ? "text-emerald-400" :
            wsState === "RECONNECTING" ? "text-amber-400" :
                                         "text-red-400"
          }>
            {wsState}
          </span>
        </span>

        {/* Connection ID */}
        {connectionId && (
          <span className="font-mono-data text-xs text-slate-400 hidden sm:inline">
            conn:{connectionId}
          </span>
        )}

        {/* Sim status */}
        {simulation.status !== "IDLE" && (
          <span className="font-mono-data text-xs text-slate-400 hidden md:inline">
            sim:{" "}
            <span className={
              simulation.status === "SUCCESS" ? "text-emerald-400" :
              simulation.status === "FAILURE" ? "text-red-400" :
                                                 "text-emerald-400"
            }>
              {simulation.status}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {lastUpdated && (
          <span className="font-mono-data text-xs text-slate-400">
            Last update: {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        <span className="font-mono-data text-xs text-slate-500">
          AI Hospital Command Center v1.0.0
        </span>
      </div>
    </div>
  );
}
