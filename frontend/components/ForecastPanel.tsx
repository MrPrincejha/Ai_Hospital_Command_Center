// frontend/components/ForecastPanel.tsx
/**
 * AI Hospital Command Center — ML Forecast Panel
 * ===============================================
 * Displays the latest 12-hour ML forecast from the XGBoost pipeline:
 * - ICU occupancy prediction
 * - ER congestion prediction
 * - Patient inflow prediction
 * - Risk level indicator
 * - Top feature importances bar chart
 * - Trigger forecast run button
 */

"use client";

import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BrainCircuit, RefreshCw, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { useForecastControl } from "@/hooks/useHospital";
import type { RiskLevel } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Risk theme
// ─────────────────────────────────────────────────────────────────────────────

function riskTheme(level: RiskLevel) {
  switch (level) {
    case "critical": return { pill: "status-critical", color: "#ef4444", label: "CRITICAL" };
    case "high":     return { pill: "status-warning",  color: "#f59e0b", label: "HIGH" };
    case "medium":   return { pill: "status-warning",  color: "#fbbf24", label: "MEDIUM" };
    default:         return { pill: "status-normal",   color: "#10b981", label: "LOW" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast metric row
// ─────────────────────────────────────────────────────────────────────────────

function ForecastMetric({
  label,
  value,
  unit,
  color,
  progress,
}: {
  label:    string;
  value:    string;
  unit:     string;
  color:    string;
  progress: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] text-ink-muted tracking-widest uppercase">
          {label}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="font-display text-lg font-bold" style={{ color }}>
            {value}
          </span>
          <span className="font-display text-[11px] text-ink-muted">{unit}</span>
        </div>
      </div>
      <div className="progress-track">
        <motion.div
          className="progress-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress * 100, 100)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastPanel() {
  const { forecast, forecastUpdated, loading, taskStatus, runForecast } =
    useForecastControl();

  const isRunning = loading || taskStatus === "PENDING" || taskStatus === "STARTED";

  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-cyan-400" />
          <div>
            <h2 className="font-display text-sm font-bold text-ink-primary tracking-wider">
              ML FORECAST
            </h2>
            <p className="font-display text-[10px] text-ink-muted tracking-widest">
              12-HOUR HORIZON · XGBOOST + RANDOM FOREST
            </p>
          </div>
        </div>

        <button
          onClick={() => runForecast(8760)}
          disabled={isRunning}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-bold tracking-wider uppercase transition-all",
            isRunning
              ? "bg-surface-700 text-ink-muted cursor-not-allowed"
              : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20 hover:border-cyan-500/50",
          )}
        >
          <RefreshCw size={13} className={isRunning ? "animate-spin" : ""} />
          {isRunning ? "Running…" : "Run Forecast"}
        </button>
      </div>

      {/* ── No data state ─────────────────────────────────────────────────── */}
      {!forecast ? (
        <div className="card p-8 flex flex-col items-center justify-center gap-3 min-h-[240px]">
          <TrendingUp size={32} className="text-ink-muted" />
          <p className="font-display text-xs text-ink-muted tracking-widest uppercase text-center">
            No forecast available
          </p>
          <p className="font-body text-sm text-ink-muted text-center max-w-xs">
            Click "Run Forecast" to train XGBoost models and generate
            a 12-hour hospital occupancy prediction.
          </p>
          {isRunning && (
            <div className="flex gap-1 mt-2">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Risk level ─────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              "card p-5 flex items-center justify-between",
              forecast.risk_level === "critical" && "card-glow-red",
              forecast.risk_level === "high"     && "card-glow-amber",
            )}
          >
            <div>
              <p className="font-display text-[10px] text-ink-muted tracking-widest uppercase mb-1">
                12-Hour Risk Assessment
              </p>
              <p className="font-body text-sm text-ink-secondary">
                {forecast.patient_inflow_t12} patients expected in next 12h
              </p>
            </div>
            <div className="text-right">
              <span
                className={clsx(
                  "status-pill text-base px-4 py-2",
                  riskTheme(forecast.risk_level).pill,
                )}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                {riskTheme(forecast.risk_level).label}
              </span>
              {forecastUpdated && (
                <p className="font-display text-[10px] text-ink-muted mt-2">
                  Updated {new Date(forecastUpdated).toLocaleTimeString()}
                </p>
              )}
            </div>
          </motion.div>

          {/* ── Forecast metrics ───────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-5 space-y-5"
          >
            <h3 className="font-display text-[11px] text-ink-muted tracking-widest uppercase">
              Predicted Values (t+12h)
            </h3>

            <ForecastMetric
              label="ICU Occupancy"
              value={`${(forecast.icu_occupancy_t12 * 100).toFixed(1)}`}
              unit="%"
              color={
                forecast.icu_occupancy_t12 > 0.9 ? "#ef4444" :
                forecast.icu_occupancy_t12 > 0.75 ? "#f59e0b" :
                "#06b6d4"
              }
              progress={forecast.icu_occupancy_t12}
            />

            <ForecastMetric
              label="ER Congestion"
              value={`${(forecast.er_congestion_t12 * 100).toFixed(1)}`}
              unit="%"
              color={
                forecast.er_congestion_t12 > 0.8 ? "#ef4444" :
                forecast.er_congestion_t12 > 0.6 ? "#f59e0b" :
                "#06b6d4"
              }
              progress={forecast.er_congestion_t12}
            />

            {/* Model accuracy badges */}
            <div className="flex gap-3 pt-1 border-t border-[rgba(6,182,212,0.06)]">
              <div>
                <p className="font-display text-[10px] text-ink-muted tracking-widest">
                  ICU Model MAE
                </p>
                <p className="font-display text-xs text-emerald-400 mt-0.5">
                  {forecast.model_mae_icu >= 0
                    ? forecast.model_mae_icu.toFixed(4)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="font-display text-[10px] text-ink-muted tracking-widest">
                  ER Model MAE
                </p>
                <p className="font-display text-xs text-emerald-400 mt-0.5">
                  {forecast.model_mae_er >= 0
                    ? forecast.model_mae_er.toFixed(4)
                    : "—"}
                </p>
              </div>
            </div>
          </motion.div>

          {/* ── Feature importance ─────────────────────────────────────────── */}
          {forecast.top_features && Object.keys(forecast.top_features).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card p-5"
            >
              <h3 className="font-display text-[11px] text-ink-muted tracking-widest uppercase mb-4">
                Top Feature Importances
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={Object.entries(forecast.top_features)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([name, value]) => ({
                      name:  name.replace(/_lag\d+|_roll\d+_mean/, "").slice(0, 16),
                      value: parseFloat(value.toFixed(5)),
                    }))}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "#4a5d80", fontSize: 9, fontFamily: "'Space Mono'" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: "#8fa3c8", fontSize: 9, fontFamily: "'Space Mono'" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(6,182,212,0.05)" }}
                    contentStyle={{
                      background:   "#141b2d",
                      border:       "1px solid rgba(6,182,212,0.2)",
                      borderRadius: "6px",
                      fontFamily:   "'Space Mono'",
                      fontSize:     "11px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {Object.entries(forecast.top_features)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map((_, i) => (
                        <Cell
                          key={i}
                          fill={`rgba(6,182,212,${0.85 - i * 0.08})`}
                        />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}