// frontend/components/MetricCard.tsx
/**
 * AI Hospital Command Center — Metric KPI Card
 * =============================================
 * Displays a single operational metric with:
 * - Large monospaced value
 * - Alert-level colour coding (normal/warning/critical)
 * - Optional progress bar
 * - Optional trend delta
 * - Framer Motion entrance animation
 */

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import Sparkline from "@/components/Sparkline";
import { useMetricPulse } from "@/hooks/useMetricPulse";
import type { AlertLevel } from "@/types/hospital";

interface MetricCardProps {
  title:       string;
  value:       string | number;
  unit?:       string;
  subtitle?:   string;
  alertLevel?: AlertLevel;
  progress?:   number;        // 0–1 for the bar fill
  delta?:      number;        // change since last tick (+/-)
  deltaUnit?:  string;
  icon?:       React.ReactNode;
  index?:      number;        // stagger order
  onClick?:    () => void;
  sparkline?:  Array<{ value: number }>; // optional mini chart data
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert theme helpers
// ─────────────────────────────────────────────────────────────────────────────

function alertTheme(level: AlertLevel = "normal") {
  switch (level) {
    case "critical":
      return {
        card:     "border-red-700/50 bg-red-950/20",
        value:    "text-red-400",
        progress: "bg-red-500",
        badge:    "badge-critical",
      };
    case "warning":
      return {
        card:     "border-amber-700/50 bg-amber-950/20",
        value:    "text-amber-400",
        progress: "bg-amber-500",
        badge:    "badge-warning",
      };
    default:
      return {
        card:     "border-slate-700",
        value:    "text-cyan-400",
        progress: "bg-cyan-500",
        badge:    "badge-normal",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  alertLevel = "normal",
  progress,
  delta,
  deltaUnit = "",
  icon,
  index = 0,
  onClick,
  sparkline,
}: MetricCardProps) {
  const theme = alertTheme(alertLevel);
  const [pulseKey, setPulseKey] = useState(0);
  
  // Convert value to number for pulse detection
  const numericValue = typeof value === "number" ? value : parseFloat(String(value)) || 0;
  
  // Detect significant changes in critical metrics
  useMetricPulse({
    value: numericValue,
    isCritical: alertLevel === "critical",
    onChange: () => setPulseKey((k) => k + 1),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      onClick={onClick}
      className={clsx(
        "card p-5 flex flex-col gap-3 relative overflow-hidden group",
        theme.card,
        onClick && "cursor-pointer hover:shadow-lg",
      )}
    >
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className={clsx("flex-shrink-0 opacity-70", theme.value)}>
              {icon}
            </span>
          )}
          <span className="text-xs font-medium text-slate-400 truncate">
            {title}
          </span>
        </div>

        {alertLevel !== "normal" && (
          <span className={clsx("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0", theme.badge)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {alertLevel}
          </span>
        )}
      </div>

      {/* ── Value ────────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-1.5">
        <motion.span
          key={`${String(value)}-${pulseKey}`}
          initial={{ opacity: 0.6, y: 4 }}
          animate={
            alertLevel === "critical" && pulseKey > 0
              ? { opacity: [1, 0.8, 1], scale: [1, 1.05, 1] }
              : { opacity: 1, y: 0 }
          }
          transition={
            alertLevel === "critical" && pulseKey > 0
              ? { duration: 0.6, ease: "easeInOut" }
              : { duration: 0.2 }
          }
          className={clsx("text-3xl font-bold font-mono-data tracking-tight", theme.value)}
        >
          {value}
        </motion.span>
        {unit && (
          <span className="text-sm text-slate-400 pb-1">
            {unit}
          </span>
        )}

        {/* Delta indicator */}
        {delta !== undefined && delta !== 0 && (
          <span
            className={clsx(
              "text-xs font-mono-data pb-1 ml-1",
              delta > 0 ? "text-red-400" : "text-emerald-400",
            )}
          >
            {delta > 0 ? "↑" : "↓"}
            {Math.abs(delta).toFixed(1)}
            {deltaUnit}
          </span>
        )}
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      {progress !== undefined && (
        <div className="progress-track">
          <motion.div
            className={clsx("progress-fill", theme.progress)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress * 100, 100)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      )}

      {/* ── Sparkline ───────────────────────────────────────────────────────── */}
      {sparkline && sparkline.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="-mx-5 -mb-3 pt-2"
        >
          <Sparkline
            data={sparkline}
            color={
              alertLevel === "critical"
                ? "#ef4444"
                : alertLevel === "warning"
                  ? "#f59e0b"
                  : "#10b981"
            }
            height={32}
          />
        </motion.div>
      )}

      {/* ── Subtitle ─────────────────────────────────────────────────────── */}
      {subtitle && (
        <p className="text-xs text-slate-400 leading-relaxed">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}