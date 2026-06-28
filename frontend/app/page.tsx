// frontend/app/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
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
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import AlertToast from "@/components/AlertToast";
import LoginOverlay from "@/components/LoginOverlay";

// Panel components
import TelemetryChart from "@/components/TelemetryChart";
import DepartmentTable from "@/components/DepartmentTable";
import ForecastPanel from "@/components/ForecastPanel";
import SimulationPanel from "@/components/SimulationPanel";
import ClinicalPanel from "@/components/ClinicalPanel";
import CopilotPanel from "@/components/CopilotPanel";

// Hooks & store
import { useWebSocketBridge, useTelemetry, useSimulationControl } from "@/hooks/useHospital";
import { useHospitalStore, useDepartmentSnapshot } from "@/store/hospitalStore";
import { fmtPct, fmtWaitTime, alertTextClass } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────────────────────────────────────

function AnimatedKPIMetric({ value, suffix = "", isTime = false }: { value: string | number, suffix?: string, isTime?: boolean }) {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);
  const [displayVal, setDisplayVal] = useState(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setFlash(true);
      
      if (typeof value === 'number' && typeof prevValue.current === 'number') {
        const start = prevValue.current;
        const end = value;
        const diff = Math.abs(end - start);
        const duration = diff > 5 ? 600 : 300;
        let startTime: number | null = null;
        
        const step = (timestamp: number) => {
          if (!startTime) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          setDisplayVal(start + (end - start) * progress);
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            setDisplayVal(end);
          }
        };
        window.requestAnimationFrame(step);
      } else {
        setDisplayVal(value);
      }
      
      prevValue.current = value;
      setTimeout(() => setFlash(false), 800);
    }
  }, [value]);

  const finalStr = typeof value === 'number' && !isTime ? (Number.isInteger(value) ? Math.round(displayVal as number).toString() : (displayVal as number).toFixed(1)) : displayVal;

  return (
    <span style={{ 
      background: flash ? 'rgba(88,166,255,0.15)' : 'transparent',
      transition: 'background 0.8s ease-out',
      borderRadius: 4,
      padding: '0 4px',
      marginLeft: -4
    }}>
      {finalStr}{suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard KPI grid
// ─────────────────────────────────────────────────────────────────────────────

function DashboardKPIs() {
  const { telemetry } = useTelemetry();
  const er = useDepartmentSnapshot("ER");
  const icu = useDepartmentSnapshot("ICU");
  const opd = useDepartmentSnapshot("OPD");
  const ward = useDepartmentSnapshot("Ward");

  if (!telemetry) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-3 h-[140px] skeleton-loading col-span-12 md:col-span-3">
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

  const getCardStyle = (alertLevel: string) => {
    if (alertLevel === 'critical') return { border: '#f85149', bg: '#1a0a0a' };
    if (alertLevel === 'warning') return { border: '#f0883e', bg: '#1a110a' };
    return { border: '#30363d', bg: '#161b22' };
  };

  const getBadgeStyle = (alertLevel: string) => {
    if (alertLevel === 'critical') return { bg: '#3d0000', color: '#f85149', text: 'CRITICAL', dot: true };
    if (alertLevel === 'warning') return { bg: '#2d1b00', color: '#f0883e', text: 'WARNING', dot: false };
    return { bg: '#0d2d16', color: '#3fb950', text: 'NORMAL', dot: false };
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ── Row 1: Global KPIs ───────────────────────────────────────── */}

      {[
        { 
          title: "ICU Occupancy", 
          val: telemetry.icu_occupancy_pct * 100, 
          suffix: "%",
          alert: telemetry.icu_occupancy_pct > 0.9 ? "critical" : telemetry.icu_occupancy_pct > 0.75 ? "warning" : "normal",
          sub: `${icu?.patients_in_service ?? "—"} of 10 beds occupied`
        },
        { 
          title: "ER Congestion", 
          val: telemetry.er_congestion_pct * 100,
          suffix: "%",
          alert: telemetry.er_congestion_pct > 0.8 ? "critical" : telemetry.er_congestion_pct > 0.6 ? "warning" : "normal",
          sub: `${er?.queue_length ?? "—"} waiting · ${fmtWaitTime(er?.avg_wait_time ?? 0)} avg`
        },
        { 
          title: "Global Alert", 
          val: telemetry.global_alert.toUpperCase(),
          suffix: "",
          alert: telemetry.global_alert,
          sub: "Highest priority across all depts"
        }
      ].map((kpi, idx) => {
        const cStyle = getCardStyle(kpi.alert);
        const bStyle = getBadgeStyle(kpi.alert);
        return (
          <div key={idx} className="col-span-4 lg:col-span-4" style={{ background: cStyle.bg, border: `1px solid ${cStyle.border}`, borderRadius: 12, padding: "20px 24px", transition: "border-color 0.4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px" }}>{kpi.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: bStyle.bg, color: bStyle.color, padding: "4px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, transition: "opacity 0.2s" }}>
                {bStyle.dot && <div className="critical-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#f85149" }}></div>}
                {bStyle.text}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#e6edf3", lineHeight: 1 }}>
              <AnimatedKPIMetric value={kpi.val} suffix={kpi.suffix} />
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4, lineHeight: 1.4 }}>{kpi.sub}</div>
          </div>
        )
      })}

      {/* ── Row 2: Department Utilisation ────────────────────────────── */}
      <div className="col-span-12" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { name: "OPD", dept: opd },
          { name: "ER", dept: er },
          { name: "Ward", dept: ward }
        ].map((d, i) => {
          const util = d.dept?.server_utilization ?? 0;
          const alert = d.dept?.alert_level ?? 'normal';
          const uStyle = getCardStyle(alert);
          return (
            <div key={i} style={{ background: "#161b22", border: `1px solid #30363d`, borderLeft: `3px solid ${uStyle.border}`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 10, uppercase: true, fontWeight: 700, color: "#8b949e", marginBottom: 4, letterSpacing: "0.6px" }}>{d.name} Utilisation</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#e6edf3" }}>
                <AnimatedKPIMetric value={util * 100} suffix="%" />
              </div>
              <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4, marginBottom: 12 }}>
                {d.dept?.queue_length ?? "—"} in queue {d.name === "OPD" && `· ${fmtWaitTime(d.dept?.avg_wait_time ?? 0)} wait`} {d.name === "ER" && `· ${d.dept?.overflow_events ?? 0} overflow`}
              </div>
              <div style={{ background: "#21262d", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ background: uStyle.border, height: "100%", width: `${Math.min(util * 100, 100)}%`, transition: "width 0.6s ease-out, background 0.3s" }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast mini card for dashboard
// ─────────────────────────────────────────────────────────────────────────────

function ForecastBanner() {
  const forecast = useHospitalStore((s) => s.latestForecast);
  const setPanel = useHospitalStore((s) => s.setActivePanel);

  if (!forecast) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#2d1b00", border: "1px solid #7a4500", borderRadius: 8, padding: "10px 16px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <i className="ti ti-chart-line" style={{ fontSize: 16, color: "#f0883e", flexShrink: 0 }} aria-hidden="true"></i>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#f0883e", marginRight: 8 }}>Forecast alert</span>
          <span style={{ fontSize: 12, color: "#c9a46e" }}>ICU occupancy forecast: {fmtPct(forecast.icu_occupancy_t12)} in 12 hours</span>
        </div>
      </div>
      <a href="#" onClick={(e) => { e.preventDefault(); setPanel("forecast"); }} style={{ fontSize: 12, color: "#f0883e", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
        View forecast
        <i className="ti ti-arrow-right" style={{ fontSize: 13 }}></i>
      </a>
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
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity:1; transform:scale(1) }
          50%      { opacity:0.5; transform:scale(0.85) }
        }
        @keyframes critical-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248,81,73,0.6); transform: scale(1); }
          50%      { box-shadow: 0 0 0 6px rgba(248,81,73,0); transform: scale(1.1); }
        }
        .critical-dot { animation: critical-pulse 1.5s ease-in-out infinite; }
      `}</style>
      
      {/* KPI grid */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#e6edf3", margin: 0 }}>Operational KPIs</h2>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* TOTAL QUEUE PILL */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "6px 14px" }}>
              <i className="ti ti-users" style={{ fontSize: 14, color: "#8b949e" }} aria-hidden="true"></i>
              <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 500 }}>Total queue</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3", marginLeft: 4 }}>
                <AnimatedKPIMetric value={telemetry?.total_queue ?? 0} />
              </span>
            </div>

            {/* LIVE CLOCK */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "6px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", animation: "pulse-dot 2s infinite" }}></div>
              <span id="liveClock" style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", fontVariantNumeric: "tabular-nums", letterSpacing: "0.5px" }}>
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--"}
              </span>
            </div>
          </div>
        </div>
        
        <DashboardKPIs />
      </div>

      <ForecastBanner />

      {/* Telemetry chart */}
      <div className="card p-6 min-h-[280px] flex flex-col relative" style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[14px] font-semibold text-[#e6edf3] flex items-center gap-2 m-0">
              Live Telemetry Stream
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </h3>
            <p className="text-[12px] text-[#8b949e] mt-1 m-0">
              Rolling 60-tick history
            </p>
          </div>
        </div>
        <TelemetryChart height={260} />
      </div>

      {/* Department table */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e6edf3", marginBottom: 16 }}>Department Status</h2>
        <DepartmentTable />
      </div>
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
  useWebSocketBridge();

  const activePanel = useHospitalStore((s) => s.activePanel);
  const sidebarOpen = useHospitalStore((s) => s.sidebarOpen);
  const token       = useHospitalStore((s) => s.token);

  const { simulation, startSimulation } = useSimulationControl();
  useEffect(() => {
    if (simulation.status === "IDLE" && token) {
      startSimulation(24, 42);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0d1117" }}>
      {!token && <LoginOverlay />}
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <AlertToast />
            <AnimatePresence mode="wait">
              <motion.div key={activePanel} variants={panelVariants} initial="initial" animate="animate" exit="exit">
                {activePanel === "dashboard"  && <DashboardPanel />}
                {activePanel === "simulation" && <SimulationPanel />}
                {activePanel === "forecast"   && <ForecastPanel />}
                {activePanel === "clinical"   && <ClinicalPanel />}
                {activePanel === "copilot"    && <CopilotPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <StatusBar />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar() {
  const wsState     = useHospitalStore((s) => s.wsState);
  const lastUpdated = useHospitalStore((s) => s.lastUpdated);

  return (
    <div className="flex-shrink-0 h-7 flex items-center justify-between px-5 border-t border-[#30363d]" style={{ background: '#161b22' }}>
      <div className="text-[11px] text-[#8b949e]">
        <span>
          WS {wsState.toLowerCase()}
          {lastUpdated && ` · updated ${new Date(lastUpdated).toLocaleTimeString()}`}
        </span>
      </div>
      <div className="text-[11px]" style={{ color: '#8b949e' }}>
        PMAI Command Center v1.0.0
      </div>
    </div>
  );
}
