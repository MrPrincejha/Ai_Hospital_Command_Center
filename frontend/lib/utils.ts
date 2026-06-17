// frontend/lib/utils.ts
/**
 * AI Hospital Command Center — Shared Utilities
 * ==============================================
 * Pure helper functions shared across all components.
 * No React imports — safe to use in any context.
 */

import { clsx, type ClassValue } from "clsx";
import type { AlertLevel, RiskLevel, SeverityLabel, TriageTier } from "@/types/hospital";

// ── clsx passthrough (single import across the app) ───────────────────────
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Number formatting
// ─────────────────────────────────────────────────────────────────────────────

/** 0.876 → "87.6%" */
export function fmtPct(val: number, decimals = 1): string {
  return `${(val * 100).toFixed(decimals)}%`;
}

/** 0.483 hours → "29 min" | 1.5 hours → "1h 30m" */
export function fmtWaitTime(hours: number): string {
  const totalMins = Math.round(hours * 60);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** 1234567 → "1.2M" | 9500 → "9.5K" | 123 → "123" */
export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Pad a number with leading zeros: 7 → "07" */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Unix epoch → "HH:MM:SS" */
export function fmtTime(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** ISO string → "HH:MM" */
export function fmtTimeIso(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Relative time: "2 min ago" */
export function relativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert / severity colour maps
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_COLOURS: Record<AlertLevel, string> = {
  normal:   "#10b981",
  warning:  "#f59e0b",
  critical: "#ef4444",
};

export const RISK_COLOURS: Record<RiskLevel, string> = {
  low:      "#10b981",
  medium:   "#fbbf24",
  high:     "#f59e0b",
  critical: "#ef4444",
};

export const SEVERITY_COLOURS: Record<SeverityLabel, string> = {
  normal:   "#10b981",
  mild:     "#34d399",
  moderate: "#fbbf24",
  severe:   "#f59e0b",
  critical: "#ef4444",
};

export const TRIAGE_COLOURS: Record<TriageTier, string> = {
  IMMEDIATE:   "#ef4444",
  URGENT:      "#f59e0b",
  SEMI_URGENT: "#fbbf24",
  NON_URGENT:  "#10b981",
};

export const TRIAGE_LABELS: Record<TriageTier, string> = {
  IMMEDIATE:   "Immediate",
  URGENT:      "Urgent",
  SEMI_URGENT: "Semi-Urgent",
  NON_URGENT:  "Non-Urgent",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tailwind class maps
// ─────────────────────────────────────────────────────────────────────────────

export function alertPillClass(level: AlertLevel): string {
  return cn(
    "status-pill",
    level === "critical" && "status-critical",
    level === "warning"  && "status-warning",
    level === "normal"   && "status-normal",
  );
}

export function alertCardClass(level: AlertLevel): string {
  return cn(
    level === "critical" && "border-red-500/30 bg-red-500/5 card-glow-red",
    level === "warning"  && "border-amber-400/25 bg-amber-400/5 card-glow-amber",
    level === "normal"   && "border-[rgba(6,182,212,0.08)]",
  );
}

export function alertTextClass(level: AlertLevel): string {
  return cn(
    level === "critical" && "text-red-400",
    level === "warning"  && "text-amber-400",
    level === "normal"   && "text-cyan-400",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task status helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isTaskRunning(status: string): boolean {
  return status === "PENDING" || status === "STARTED";
}

export function taskStatusLabel(status: string): string {
  const map: Record<string, string> = {
    IDLE:     "Idle",
    PENDING:  "Queued",
    STARTED:  "Running",
    SUCCESS:  "Complete",
    FAILURE:  "Failed",
    REVOKED:  "Cancelled",
    RETRY:    "Retrying",
  };
  return map[status] ?? status;
}

export function taskStatusColour(status: string): string {
  if (status === "SUCCESS")  return "#10b981";
  if (status === "FAILURE")  return "#ef4444";
  if (status === "REVOKED")  return "#8fa3c8";
  if (isTaskRunning(status)) return "#06b6d4";
  return "#4a5d80";
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────

/** Truncate a string to maxLen, appending "…" */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/** Generate a random session-safe ID */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}
