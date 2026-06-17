/**
 * Sparkline Component
 * Tiny area chart for embedding in metric cards
 */

import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
}

export default function Sparkline({
  data,
  color = "#10b981",
  height = 40,
}: SparklineProps) {
  // Ensure we have data
  const chartData = useMemo(
    () => data && data.length > 0 ? data : [{ value: 0 }],
    [data]
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
