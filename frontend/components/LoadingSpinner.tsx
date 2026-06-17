// frontend/components/LoadingSpinner.tsx
/**
 * AI Hospital Command Center — Loading Spinner
 * ============================================
 * Reusable loading indicator used across panels
 * while async data is being fetched.
 */

"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

interface LoadingSpinnerProps {
  size?:    "sm" | "md" | "lg";
  label?:   string;
  fullPage?: boolean;
}

const SIZES = {
  sm: { outer: 24, inner: 16, border: 2 },
  md: { outer: 40, inner: 28, border: 3 },
  lg: { outer: 64, inner: 44, border: 4 },
};

export default function LoadingSpinner({
  size     = "md",
  label,
  fullPage = false,
}: LoadingSpinnerProps) {
  const s = SIZES[size];

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Outer ring */}
      <div className="relative" style={{ width: s.outer, height: s.outer }}>
        <div
          className="absolute inset-0 rounded-full border-cyan-500/20"
          style={{ borderWidth: s.border }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent"
          style={{ borderWidth: s.border }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        />
        {/* Inner dot */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/30"
          style={{ width: s.border * 2, height: s.border * 2 }}
        />
      </div>

      {label && (
        <p className="font-display text-[11px] text-ink-muted tracking-widest uppercase animate-pulse">
          {label}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surface-950/80 backdrop-blur-sm z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}
