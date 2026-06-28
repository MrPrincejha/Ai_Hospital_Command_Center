// frontend/components/MetricCard.tsx
"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import Sparkline from "@/components/Sparkline";
import type { AlertLevel } from "@/types/hospital";

interface MetricCardProps {
  title:       string;
  value:       string | number;
  unit?:       string;
  subtitle?:   string;
  alertLevel?: AlertLevel;
  progress?:   number;
  index?:      number;
  sparkline?:  Array<{ value: number }>;
  variant?:    "hero" | "medium" | "compact";
  className?:  string;
}

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  alertLevel = "normal",
  index = 0,
  sparkline,
  variant = "medium",
  className,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      className={clsx(
        "kpi-card",
        variant === "hero" && "kpi-card--hero",
        alertLevel === "critical" && "kpi-card--critical",
        alertLevel === "warning" && "kpi-card--warning",
        alertLevel === "normal" && "kpi-card--normal",
        className
      )}
    >
      <div className="kpi-card__label">
        {title}
      </div>

      <div className="flex items-baseline">
        <span className="kpi-card__value">{value}</span>
        {unit && <span className="kpi-card__unit">{unit}</span>}
      </div>

      {subtitle && (
        <div className="kpi-card__subtext">{subtitle}</div>
      )}

      {alertLevel !== "normal" && (
        <div className={clsx("kpi-badge", `kpi-badge--${alertLevel}`)}>
          {alertLevel}
        </div>
      )}

      {/* ── Sparkline ───────────────────────────────────────────────────────── */}
      {sparkline && sparkline.length > 0 && (
        <div className={clsx(
          "relative",
          variant === "hero" ? "mt-4 -mx-[24px] -mb-[20px] h-[60px]" : "mt-4 -mx-[20px] -mb-[16px] h-[48px]"
        )}>
          <Sparkline
            data={sparkline}
            color={
              alertLevel === "critical"
                ? "#EF4444"
                : alertLevel === "warning"
                  ? "#F59E0B"
                  : "#10B981"
            }
          />
        </div>
      )}
    </motion.div>
  );
}