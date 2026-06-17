// frontend/components/SimulationPanel.tsx
/**
 * AI Hospital Command Center — Simulation Control Panel
 * ======================================================
 * Full UI for the SimPy M/M/c discrete event simulation engine.
 *
 * Features:
 * - Simulation parameter configuration (hours, interval, seed)
 * - Start / Cancel controls
 * - Real-time Celery task status polling with progress indicator
 * - Department configuration display (arrival rates, server counts)
 * - Live telemetry snapshot table (mirrors DepartmentTable but compact)
 * - Simulation result summary on completion
 * - Queue theory metrics display (Erlang-C, ρ utilisation)
 */

"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ChevronRight,
  Cpu,
  GitBranch,
  Layers,
  Play,
  RotateCcw,
  Square,
  Timer,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { useSimulationControl } from "@/hooks/useHospital";
import { useHospitalStore } from "@/store/hospitalStore";
import {
  fmtPct,
  fmtWaitTime,
  taskStatusLabel,
  taskStatusColour,
  isTaskRunning,
} from "@/lib/utils";
import type { AlertLevel } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Static department config reference (mirrors backend DEFAULT_DEPARTMENTS)
// ─────────────────────────────────────────────────────────────────────────────

const DEPT_CONFIGS = [
  { name: "OPD",  servers: 8,  arrival_rate: 24.0, service_rate: 6.0,  capacity: 60,  color: "#06b6d4" },
  { name: "ER",   servers: 4,  arrival_rate: 12.0, service_rate: 3.0,  capacity: 20,  color: "#f59e0b" },
  { name: "ICU",  servers: 10, arrival_rate: 2.0,  service_rate: 0.1,  capacity: 10,  color: "#ef4444" },
  { name: "Ward", servers: 30, arrival_rate: 8.0,  service_rate: 0.5,  capacity: 30,  color: "#10b981" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Small sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-surface-700 rounded-lg px-3 py-2.5 border border-[rgba(6,182,212,0.06)]">
      <p className="font-display text-[10px] text-ink-muted tracking-widest uppercase mb-1">
        {label}
      </p>
      <p
        className="font-display text-sm font-bold"
        style={{ color: color ?? "#e2e8f7" }}
      >
        {value}
      </p>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const color = taskStatusColour(status);
  const label = taskStatusLabel(status);
  const pulse = isTaskRunning(status);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border font-display text-[11px] font-bold tracking-widest uppercase"
      style={{
        color,
        background: `${color}14`,
        borderColor: `${color}30`,
      }}
    >
      <span
        className={clsx("w-2 h-2 rounded-full", pulse && "animate-pulse")}
        style={{ background: color }}
      />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SimulationPanel() {
  const { simulation, loading, startSimulation, cancelSimulation } =
    useSimulationControl();
  const telemetry = useHospitalStore((s) => s.latestTelemetry);

  // Form state
  const [simHours,  setSimHours]  = useState(24);
  const [seed,      setSeed]      = useState<number | "">("");
  const [useSeed,   setUseSeed]   = useState(false);

  const simRunning = isTaskRunning(simulation.status);
  const simDone    = simulation.status === "SUCCESS";

  const handleStart = useCallback(() => {
    startSimulation(simHours, useSeed && seed !== "" ? Number(seed) : undefined);
  }, [simHours, seed, useSeed, startSimulation]);

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Cpu size={20} className="text-cyan-400" />
        <div>
          <h2 className="font-display text-sm font-bold text-ink-primary tracking-wider uppercase">
            Simulation Engine
          </h2>
          <p className="font-display text-[10px] text-ink-muted tracking-widest">
            SIMPY M/M/C · POISSON ARRIVALS · EXPONENTIAL SERVICE
          </p>
        </div>
      </div>

      {/* ── Control card ─────────────────────────────────────────────────── */}
      <div className="card p-5 space-y-5">
        <h3 className="font-display text-xs font-bold text-ink-secondary tracking-widest uppercase flex items-center gap-2">
          <GitBranch size={13} />
          Simulation Parameters
        </h3>

        {/* Parameter grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Hours */}
          <div className="space-y-2">
            <label className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
              Sim Duration (hours)
            </label>
            <div className="flex gap-2">
              {[8, 24, 48, 72].map((h) => (
                <button
                  key={h}
                  onClick={() => setSimHours(h)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg font-display text-xs font-bold border transition-all",
                    simHours === h
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
                      : "bg-surface-700 border-[rgba(6,182,212,0.08)] text-ink-muted hover:border-cyan-500/25 hover:text-ink-secondary",
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Seed toggle */}
          <div className="space-y-2">
            <label className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
              Random Seed
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUseSeed(!useSeed)}
                className={clsx(
                  "relative w-10 h-5 rounded-full border transition-all",
                  useSeed
                    ? "bg-cyan-500/20 border-cyan-500/40"
                    : "bg-surface-700 border-[rgba(6,182,212,0.1)]",
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                    useSeed
                      ? "left-5 bg-cyan-400"
                      : "left-0.5 bg-ink-muted",
                  )}
                />
              </button>
              {useSeed && (
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 42"
                  className="w-24 px-3 py-1.5 rounded-lg bg-surface-700 border border-[rgba(6,182,212,0.15)] text-ink-primary font-display text-xs focus:outline-none focus:border-cyan-500/40"
                />
              )}
              {!useSeed && (
                <span className="font-display text-[11px] text-ink-muted">Random</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <label className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
              Controls
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleStart}
                disabled={loading || simRunning}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-bold tracking-widest uppercase transition-all",
                  loading || simRunning
                    ? "bg-surface-700 text-ink-muted cursor-not-allowed border border-[rgba(6,182,212,0.06)]"
                    : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25",
                )}
              >
                <Play size={12} className={simRunning ? "animate-pulse" : ""} />
                {loading ? "Queuing…" : simRunning ? "Running" : "Start"}
              </button>

              {simRunning && (
                <button
                  onClick={cancelSimulation}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg font-display text-xs font-bold tracking-widest uppercase bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-all"
                >
                  <Square size={11} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Task status row */}
        {simulation.status !== "IDLE" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-4 pt-4 border-t border-[rgba(6,182,212,0.06)]"
          >
            <TaskStatusBadge status={simulation.status} />
            {simulation.taskId && (
              <span className="font-display text-[10px] text-ink-muted tracking-wider">
                Task: {simulation.taskId.slice(0, 16)}…
              </span>
            )}
            {simulation.startedAt && (
              <span className="font-display text-[10px] text-ink-muted tracking-wider">
                Started: {new Date(simulation.startedAt).toLocaleTimeString()}
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Queue theory config ───────────────────────────────────────────── */}
      <div className="card p-5">
        <h3 className="font-display text-xs font-bold text-ink-secondary tracking-widest uppercase mb-4 flex items-center gap-2">
          <Layers size={13} />
          Department Queue Configuration (M/M/c)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEPT_CONFIGS.map((dept, idx) => {
            const rho = dept.arrival_rate / (dept.servers * dept.service_rate);
            const avgServiceMin = (1 / dept.service_rate) * 60;
            return (
              <motion.div
                key={dept.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="bg-surface-700 rounded-xl border border-[rgba(6,182,212,0.06)] p-4 space-y-3"
              >
                {/* Dept header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: dept.color }}
                    />
                    <span className="font-display text-sm font-bold text-ink-primary">
                      {dept.name}
                    </span>
                  </div>
                  <span
                    className="font-display text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
                    style={{ color: dept.color, background: `${dept.color}15` }}
                  >
                    ρ = {rho.toFixed(2)}
                  </span>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="Servers (c)" value={String(dept.servers)} color={dept.color} />
                  <StatBox label="λ arr/h" value={dept.arrival_rate.toFixed(1)} />
                  <StatBox label="μ svc/h" value={dept.service_rate.toFixed(1)} />
                  <StatBox label="Avg Svc" value={`${avgServiceMin.toFixed(0)}m`} />
                  <StatBox label="Capacity" value={String(dept.capacity)} />
                  <StatBox
                    label="Util"
                    value={fmtPct(Math.min(rho, 1), 0)}
                    color={rho > 0.85 ? "#ef4444" : rho > 0.7 ? "#f59e0b" : "#10b981"}
                  />
                </div>

                {/* Utilisation bar */}
                <div className="progress-track">
                  <motion.div
                    className="progress-fill"
                    style={{ background: dept.color, width: `${Math.min(rho * 100, 100)}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(rho * 100, 100)}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Live telemetry snapshot (if sim is running/done) ──────────────── */}
      <AnimatePresence>
        {telemetry && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card p-5"
          >
            <h3 className="font-display text-xs font-bold text-ink-secondary tracking-widest uppercase mb-4 flex items-center gap-2">
              <Activity size={13} className="text-cyan-400" />
              Live Simulation Output
              <span className="font-display text-[10px] text-ink-muted ml-auto normal-case">
                t = {telemetry.snapshots[0]?.sim_time?.toFixed(2)}h sim-time
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {telemetry.snapshots.map((snap, idx) => {
                const cfg   = DEPT_CONFIGS.find((d) => d.name === snap.department);
                const color = cfg?.color ?? "#06b6d4";
                const alert = snap.alert_level as AlertLevel;
                return (
                  <motion.div
                    key={snap.department}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.06 }}
                    className={clsx(
                      "bg-surface-700 rounded-xl border p-4 space-y-2",
                      alert === "critical" ? "border-red-500/30" :
                      alert === "warning"  ? "border-amber-400/25" :
                                             "border-[rgba(6,182,212,0.08)]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-bold text-ink-primary">
                        {snap.department}
                      </span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: color }}
                      />
                    </div>

                    <div>
                      <p className="font-display text-xl font-bold" style={{ color }}>
                        {snap.queue_length}
                      </p>
                      <p className="font-display text-[10px] text-ink-muted">in queue</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between font-display text-[10px]">
                        <span className="text-ink-muted">Util</span>
                        <span style={{ color }}>{fmtPct(snap.server_utilization, 0)}</span>
                      </div>
                      <div className="flex justify-between font-display text-[10px]">
                        <span className="text-ink-muted">Wait</span>
                        <span className="text-ink-secondary">{fmtWaitTime(snap.avg_wait_time)}</span>
                      </div>
                      <div className="flex justify-between font-display text-[10px]">
                        <span className="text-ink-muted">Overflow</span>
                        <span className={snap.overflow_events > 0 ? "text-red-400" : "text-ink-muted"}>
                          {snap.overflow_events}
                        </span>
                      </div>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-fill transition-all duration-500"
                        style={{
                          background: color,
                          width: `${Math.min(snap.server_utilization * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Global summary row */}
            <div className="mt-4 pt-4 border-t border-[rgba(6,182,212,0.06)] grid grid-cols-3 gap-3">
              <StatBox
                label="Total Queue"
                value={String(telemetry.total_queue)}
                color="#06b6d4"
              />
              <StatBox
                label="ICU Occupancy"
                value={fmtPct(telemetry.icu_occupancy_pct)}
                color={telemetry.icu_occupancy_pct > 0.9 ? "#ef4444" : "#06b6d4"}
              />
              <StatBox
                label="ER Congestion"
                value={fmtPct(telemetry.er_congestion_pct)}
                color={telemetry.er_congestion_pct > 0.7 ? "#f59e0b" : "#10b981"}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success result summary ────────────────────────────────────────── */}
      {simDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 border-emerald-400/20 bg-emerald-400/5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Timer size={14} className="text-emerald-400" />
            <h3 className="font-display text-xs font-bold text-emerald-400 tracking-widest uppercase">
              Simulation Complete
            </h3>
          </div>
          <p className="font-body text-sm text-ink-secondary">
            {simHours}-hour simulation finished. Live telemetry has been published
            to the WebSocket channel. Switch to the{" "}
            <strong className="text-cyan-400">Command Center</strong> panel
            to view the full dashboard update.
          </p>
        </motion.div>
      )}
    </div>
  );
}
