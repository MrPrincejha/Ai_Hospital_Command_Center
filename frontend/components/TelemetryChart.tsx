// frontend/components/TelemetryChart.tsx
/**
 * AI Hospital Command Center — Live Telemetry Chart
 * ==================================================
 * Recharts-powered multi-line area chart visualising the rolling
 * 60-point telemetry history from the Zustand store.
 *
 * Series:
 *   - ICU Occupancy %   (cyan)
 *   - ER Congestion %   (amber)
 *   - Total Queue       (red, right Y axis)
 *   - OPD Utilization % (emerald)
 */

"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { useHospitalStore } from "@/store/hospitalStore";
import type { TelemetryHistoryPoint } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip & legend
// ─────────────────────────────────────────────────────────────────────────────

const renderLegend = (props: any) => {
  const { payload } = props;
  return (
    <ul className="flex flex-wrap items-center gap-4 pb-2">
      {payload.map((entry: any, index: number) => (
        <li key={`item-${index}`} className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );
};

interface TooltipPayloadItem {
  name:  string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="custom-tooltip bg-slate-900 border border-slate-800 rounded-lg p-3">
      <p className="font-mono-data text-xs text-slate-300 mb-2">
        {label ? format(new Date(label * 1000), "HH:mm:ss") : ""}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-xs text-slate-300 w-28">
            {entry.name}
          </span>
          <span className="font-mono-data text-xs font-semibold" style={{ color: entry.color }}>
            {typeof entry.value === "number"
              ? entry.name.includes("Queue")
                ? entry.value.toFixed(0)
                : `${(entry.value * 100).toFixed(1)}%`
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart component
// ─────────────────────────────────────────────────────────────────────────────

interface TelemetryChartProps {
  height?: number;
}

export default function TelemetryChart({ height = 280 }: TelemetryChartProps) {
  const history = useHospitalStore((s) => s.telemetryHistory);

  // Memoise chart data to prevent unnecessary re-renders
  const chartData = useMemo(() => {
    if (!history.length) return [];
    return history.map((p: TelemetryHistoryPoint) => ({
      timestamp:        p.timestamp,
      "ICU Occupancy":  p.icu_occupancy,
      "ER Congestion":  p.er_congestion,
      "OPD Util":       p.opd_utilization,
      "Total Queue":    p.total_queue,
    }));
  }, [history]);

  if (!chartData.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center"
      >
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-2">
            Awaiting telemetry data
          </div>
          <div className="flex gap-1 justify-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 40, left: -16, bottom: 0 }}
        >
          {/* Grid */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#64748b"
            vertical={false}
          />

          {/* X axis — timestamps */}
          <XAxis
            dataKey="timestamp"
            tickCount={6}
            interval="preserveStartEnd"
            tickFormatter={(v, idx) =>
              idx % 10 === 0 ? format(new Date(v * 1000), "HH:mm") : ""
            }
            tick={{
              fill:       "#64748b",
              fontSize:   10,
              fontFamily: "system-ui, sans-serif",
            }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
            interval="preserveStartEnd"
          />

          {/* Y axis left — utilisation (0–1) */}
          <YAxis
            yAxisId="util"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{
              fill:       "#64748b",
              fontSize:   10,
              fontFamily: "system-ui, sans-serif",
            }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
            width={40}
          />

          {/* Y axis right — queue count */}
          <YAxis
            yAxisId="queue"
            orientation="right"
            tick={{
              fill:       "#64748b",
              fontSize:   10,
              fontFamily: "system-ui, sans-serif",
            }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
            width={36}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend verticalAlign="top" content={renderLegend} />

          {/* ICU Occupancy — emerald */}
          <Area
            yAxisId="util"
            type="monotone"
            dataKey="ICU Occupancy"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#gradEmerald1)"
            dot={false}
            activeDot={{ r: 4, fill: "#10b981" }}
          />

          {/* ER Congestion — amber */}
          <Area
            yAxisId="util"
            type="monotone"
            dataKey="ER Congestion"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#gradAmber)"
            dot={false}
            activeDot={{ r: 4, fill: "#f59e0b" }}
          />

          {/* OPD Utilisation — emerald (lighter) */}
          <Area
            yAxisId="util"
            type="monotone"
            dataKey="OPD Util"
            stroke="#34d399"
            strokeWidth={1.5}
            fill="url(#gradEmerald2)"
            dot={false}
            activeDot={{ r: 3, fill: "#34d399" }}
          />

          {/* Total Queue — red, right axis */}
          <Area
            yAxisId="queue"
            type="monotone"
            dataKey="Total Queue"
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            fill="none"
            dot={false}
            activeDot={{ r: 3, fill: "#ef4444" }}
          />

          {/* SVG gradients */}
          <defs>
            <linearGradient id="gradEmerald1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradAmber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradEmerald2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#34d399" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
            </linearGradient>
          </defs>
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}