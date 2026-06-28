import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string; // e.g. #EF4444, #F59E0B, #10B981
  height?: number;
}

export default function Sparkline({
  data,
  color = "#10B981",
  height = 48, // matching 12 height tailwind class in metriccard
}: SparklineProps) {
  // Ensure we have data
  const chartData = useMemo(
    () => (data && data.length > 0 ? data : [{ value: 0 }]),
    [data]
  );

  const gradId = `fill-${color.replace('#', '')}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
