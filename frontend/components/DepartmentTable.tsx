// frontend/components/DepartmentTable.tsx
"use client";

import { useState, Fragment } from "react";
import clsx from "clsx";
import { useHospitalStore } from "@/store/hospitalStore";
import type { AlertLevel, DepartmentSnapshot } from "@/types/hospital";

function alertBadge(level: AlertLevel) {
  return (
    <div className={`status-pill status-pill--${level}`}>
      <div className="dot" />
      {level}
    </div>
  );
}

function pct(val: number, decimals = 1) {
  return `${(val * 100).toFixed(decimals)}%`;
}

function waitTime(hours: number) {
  const mins = Math.round(hours * 60);
  return mins < 60 ? `${mins}m` : `${(hours).toFixed(1)}h`;
}

function utilBar(val: number, level: AlertLevel, congestion: number) {
  return (
    <div className="util-bar-wrap" title={`Congestion Probability: ${pct(congestion)}`}>
      <div className="util-bar" data-util={level}>
        <div
          className="util-bar__fill"
          style={{ width: `${Math.min(val * 100, 100)}%` }}
        />
      </div>
      <span className="util-val">
        {pct(val, 0)}
      </span>
    </div>
  );
}

const DEPT_ORDER = ["OPD", "ER", "ICU", "Ward"];
const DEPT_LABELS: Record<string, string> = {
  OPD:  "Outpatient",
  ER:   "Emergency",
  ICU:  "Intensive Care",
  Ward: "General Ward",
};

function DepartmentRow({ snap }: { snap: DepartmentSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const isCritical = snap.alert_level === 'critical';

  return (
    <Fragment>
      <tr 
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          "cursor-pointer transition-colors border-b border-[rgba(255,255,255,0.06)]",
          isCritical ? "hover:bg-red-950/40" : "hover:bg-[#0F1D35]",
          expanded && "bg-[#0F1D35]"
        )}
      >
        <td className="p-4">
          <div className="dept-name text-sm font-bold text-slate-100">{snap.department}</div>
          <div className="dept-subname text-[10px] text-slate-500 uppercase tracking-widest">{DEPT_LABELS[snap.department]}</div>
        </td>
        <td className="p-4">
          {alertBadge(snap.alert_level)}
        </td>
        <td className="p-4">
          <span className="font-mono-data text-sm font-bold" style={{ color: snap.alert_level === 'critical' ? 'var(--status-critical-dot)' : snap.alert_level === 'warning' ? 'var(--status-warning-border)' : 'var(--status-normal-border)' }}>
            {snap.queue_length}
          </span>
        </td>
        <td className="p-4">
          <span className="font-mono-data text-sm font-semibold text-slate-300">
            {snap.patients_in_service}
          </span>
        </td>
        <td className="p-4">
          {utilBar(snap.server_utilization, snap.alert_level, snap.congestion_probability)}
        </td>
        <td className="p-4">
          <span className="font-mono-data text-xs font-semibold text-slate-400">
            {waitTime(snap.avg_wait_time)}
          </span>
        </td>
        <td className="p-4" title={snap.overflow_events > 0 ? `${snap.overflow_events} patients waiting beyond department capacity` : undefined}>
          <span className="font-mono-data text-xs font-semibold" style={{ color: snap.overflow_events > 0 ? 'var(--status-critical-dot)' : 'var(--text-muted)' }}>
            {snap.overflow_events}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#070F20] border-b border-[rgba(255,255,255,0.06)] shadow-inner">
          <td colSpan={7} className="px-6 py-4">
            <div className="flex items-center gap-8 text-xs text-slate-400 font-mono-data">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-sans tracking-widest">Queue Status</span>
                <span className="text-slate-200">{snap.queue_length} pts waiting</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-sans tracking-widest">Congestion Risk</span>
                <span className="text-slate-200">{pct(snap.congestion_probability)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-sans tracking-widest">Overflow Events</span>
                <span className={snap.overflow_events > 0 ? "text-red-400 font-bold" : "text-slate-200"}>{snap.overflow_events}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

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

  const snaps: DepartmentSnapshot[] = DEPT_ORDER
    .map((name) => telemetry.snapshots.find((s) => s.department === name))
    .filter((s): s is DepartmentSnapshot => !!s);

  return (
    <table className="dept-table w-full text-left">
      <thead>
        <tr>
          {["Department", "Status", "Queue", "In Service", "Utilisation", "Avg Wait", "Overflow"].map((col) => (
            <th key={col} className="p-4">{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snaps.map((snap) => (
          <DepartmentRow key={snap.department} snap={snap} />
        ))}
      </tbody>
    </table>
  );
}