// frontend/components/AlertBanner.tsx
/**
 * AI Hospital Command Center — Alert Banner Component
 * ====================================================
 * Displays active critical/warning alert banners at the top of the
 * dashboard. Each banner is individually dismissible.
 * Banners auto-remove from state when dismissed.
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import clsx from "clsx";
import { useActiveAlerts, useHospitalStore } from "@/store/hospitalStore";
import type { AlertLevel } from "@/types/hospital";

function bannerStyle(level: AlertLevel) {
  switch (level) {
    case "critical":
      return "bg-red-950/30 border-red-700/50 text-red-300";
    case "warning":
      return "bg-amber-950/30 border-amber-700/50 text-amber-300";
    default:
      return "bg-emerald-950/30 border-emerald-700/50 text-emerald-300";
  }
}

export default function AlertBanner() {
  const alerts       = useActiveAlerts();
  const dismissAlert = useHospitalStore((s) => s.dismissAlert);

  return (
    <div className="space-y-2 mb-4">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, height: 0, y: -12 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={clsx(
              "border rounded-lg px-4 py-3 flex items-start gap-3 overflow-hidden",
              bannerStyle(alert.level),
            )}
          >
            <AlertTriangle
              size={15}
              className={clsx(
                "flex-shrink-0 mt-0.5",
                alert.level === "critical" ? "text-red-400" :
                alert.level === "warning"  ? "text-amber-400" :
                                             "text-cyan-400",
              )}
            />

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5 opacity-90">
                {alert.level.charAt(0).toUpperCase() + alert.level.slice(1)} Alert
              </p>
              <p className="text-sm leading-snug break-words">
                {alert.message}
              </p>
              <p className="font-mono-data text-xs opacity-70 mt-1">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </p>
            </div>

            <button
              onClick={() => dismissAlert(alert.id)}
              className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
              aria-label="Dismiss alert"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}