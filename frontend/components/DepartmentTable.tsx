// frontend/components/DepartmentTable.tsx
/**
 * AI Hospital Command Center — Department Status Table
 * =====================================================
 * Tabular live view of all department operational snapshots
 * from the latest telemetry event.
 *
 * Columns:
 *   Department | Alert | Queue | In Service | Utilisation | Congestion | Avg Wait | Overflow
 */

"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { useHospitalStore } from "@/store/hospitalStore";
import type { AlertLevel, DepartmentSnapshot } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function alertBadge(level: AlertLevel) {
  return (
    <span
      className={clsx(
        level === "critical" ? "badge-critical" :
        level === "warning"  ? "badge-warning"  :
                               "badge-normal",
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {level}
    </span>
  );
}

function pct(val: number, decimals = 1) {
  return `${(val * 100).toFixed(decimals)}%`;
}

function waitTime(hours: number) {
  const mins = Math.round(hours * 60);
  return mins < 60 ? `${mins}m` : `${(hours).toFixed(1)}h`;
}

function utilBar(val: number, level: AlertLevel) {
  const color =
    level === "critical" ? "bg-red-500" :
    level === "warning"  ? "bg-amber-400" :
                           "bg-emerald-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 progress-track" style={{ minWidth: 60 }}>
        <div
          className={clsx("progress-fill", color)}
          style={{ width: `${Math.min(val * 100, 100)}%` }}
        />
      </div>
      <span
        className={clsx(
          "font-mono-data text-xs w-10 text-right",
          level === "critical" ? "text-red-400" :
          level === "warning"  ? "text-amber-400" :
                                 "text-emerald-400",
        )}
      >
        {pct(val, 0)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DEPT_ORDER = ["OPD", "ER", "ICU", "Ward"];
const DEPT_LABELS: Record<string, string> = {
  OPD:  "Outpatient",
  ER:   "Emergency",
  ICU:  "Intensive Care",
  Ward: "General Ward",
};

export default function DepartmentTable() {
  const telemetry = useHospitalStore((s) => s.latestTelemetry);

  if (!telemetry?.snapshots?.length) {
    return (
      <div className="card p-6 flex items-center justify-center min-h-[180px]">
        <p className="text-xs text-slate-400">
          No department data — start a simulation
        </p>
      </div>
    );
  }

  // Sort by DEPT_ORDER
  const snaps: DepartmentSnapshot[] = DEPT_ORDER
    .map((name) => telemetry.snapshots.find((s) => s.department === name))
    .filter((s): s is DepartmentSnapshot => !!s);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
        <h3 className="text-sm font-semibold text-slate-100">
          Department Status
        </h3>
        <span className="font-mono-data text-xs text-slate-400">
          SIM t={snaps[0]?.sim_time?.toFixed(2)}h
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/40">
              {[
                "Department", "Status", "Queue",
                "In Service", "Utilisation", "Congestion",
                "Avg Wait", "Overflow",
              ].map((col) => (
                <th
                  key={col}
                  className="px-5 py-3 text-left text-xs font-semibold text-slate-300"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snaps.map((snap, idx) => (
              <motion.tr
                key={snap.department}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.25 }}
                className={clsx(
                  "border-b border-slate-700/50 transition-all",
                  "hover:bg-slate-800/40",
                  snap.alert_level === "critical" && "bg-red-500/5",
                  snap.alert_level === "warning"  && "bg-amber-400/5",
                )}
              >
                {/* Department name */}
                <td className="px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      {snap.department}
                    </p>
                    <p className="text-xs text-slate-400">
                      {DEPT_LABELS[snap.department] ?? ""}
                    </p>
                  </div>
                </td>

                {/* Alert badge */}
                <td className="px-5 py-3">
                  {alertBadge(snap.alert_level)}
                </td>

                {/* Queue */}
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "font-mono-data text-sm font-bold",
                      snap.alert_level === "critical" ? "text-red-400" :
                      snap.alert_level === "warning"  ? "text-amber-400" :
                                                        "text-emerald-400",
                    )}
                  >
                    {snap.queue_length}
                  </span>
                </td>

                {/* In service */}
                <td className="px-5 py-3">
                  <span className="font-mono-data text-sm font-semibold text-slate-100">
                    {snap.patients_in_service}
                  </span>
                </td>

                {/* Utilisation bar */}
                <td className="px-5 py-3 min-w-[140px]">
                  {utilBar(snap.server_utilization, snap.alert_level)}
                </td>

                {/* Congestion */}
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "font-mono-data text-xs font-semibold",
                      snap.congestion_probability > 0.7 ? "text-red-400" :
                      snap.congestion_probability > 0.4 ? "text-amber-400" :
                                                          "text-emerald-400",
                    )}
                  >
                    {pct(snap.congestion_probability)}
                  </span>
                </td>

                {/* Avg wait */}
                <td className="px-5 py-3">
                  <span className="font-mono-data text-xs text-slate-300 font-semibold">
                    {waitTime(snap.avg_wait_time)}
                  </span>
                </td>

                {/* Overflow events */}
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "font-mono-data text-xs font-semibold",
                      snap.overflow_events > 0 ? "text-red-400" : "text-slate-400",
                    )}
                  >
                    {snap.overflow_events}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}