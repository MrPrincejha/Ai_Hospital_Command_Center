// frontend/components/ConnectionStatus.tsx
/**
 * AI Hospital Command Center — Connection Status Badge
 * =====================================================
 * Small inline badge showing WebSocket connection state.
 * Used in header and anywhere a compact status display is needed.
 */

"use client";

import clsx from "clsx";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useHospitalStore } from "@/store/hospitalStore";
import type { WsConnectionState } from "@/types/hospital";

interface ConnectionStatusProps {
  showLabel?: boolean;
  className?: string;
}

const STATE_CONFIG: Record<
  WsConnectionState,
  { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; cls: string }
> = {
  CONNECTED:     { icon: Wifi,     label: "Live",          cls: "text-emerald-400 bg-emerald-400/8 border-emerald-400/20" },
  CONNECTING:    { icon: Loader2,  label: "Connecting…",   cls: "text-cyan-400 bg-cyan-400/8 border-cyan-400/20" },
  RECONNECTING:  { icon: Loader2,  label: "Reconnecting",  cls: "text-amber-400 bg-amber-400/8 border-amber-400/20" },
  DISCONNECTED:  { icon: WifiOff,  label: "Offline",       cls: "text-ink-muted bg-surface-700 border-[rgba(6,182,212,0.08)]" },
};

export default function ConnectionStatus({
  showLabel = true,
  className,
}: ConnectionStatusProps) {
  const wsState = useHospitalStore((s) => s.wsState);
  const config  = STATE_CONFIG[wsState];
  const Icon    = config.icon;
  const isSpinning = wsState === "CONNECTING" || wsState === "RECONNECTING";

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-display text-[10px] font-bold tracking-widest uppercase",
        config.cls,
        className,
      )}
    >
      <Icon size={11} className={isSpinning ? "animate-spin" : ""} />
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}
