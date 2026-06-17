/**
 * Connection Status Pill Component
 * Animated status indicator with live dot when connected, spinner when reconnecting
 */

"use client";

import { motion } from "framer-motion";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useHospitalStore } from "@/store/hospitalStore";

export default function ConnectionStatusPill() {
  const wsState = useHospitalStore((s) => s.wsState);

  const isConnected = wsState === "CONNECTED";
  const isReconnecting = wsState === "RECONNECTING";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium",
        isConnected
          ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
          : isReconnecting
            ? "bg-amber-950/40 border-amber-700/50 text-amber-300"
            : "bg-slate-800 border-slate-700 text-slate-400",
      )}
    >
      {/* Live dot */}
      {isConnected && (
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-emerald-400"
        />
      )}

      {/* Reconnecting spinner */}
      {isReconnecting && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 size={12} className="text-amber-400" />
        </motion.div>
      )}

      {/* Disconnected icon */}
      {!isConnected && !isReconnecting && <WifiOff size={12} />}

      {/* Status text */}
      <span className="hidden sm:inline">
        {isConnected
          ? "Live"
          : isReconnecting
            ? "Reconnecting…"
            : "Offline"}
      </span>
    </motion.div>
  );
}
