// frontend/components/Sidebar.tsx
/**
 * AI Hospital Command Center — Sidebar Navigation
 * =================================================
 * Left navigation sidebar with:
 * - Logo / branding
 * - Panel navigation links
 * - WebSocket connection status indicator
 * - System health indicator
 * - Collapsible on mobile
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  HeartPulse,
  LayoutDashboard,
  Radio,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useHospitalStore } from "@/store/hospitalStore";
import clsx from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Nav items
// ─────────────────────────────────────────────────────────────────────────────

type Panel = "dashboard" | "simulation" | "forecast" | "clinical" | "copilot";

const NAV_ITEMS: {
  id:    Panel;
  label: string;
  icon:  React.ComponentType<{ size?: number; className?: string }>;
  desc:  string;
}[] = [
  {
    id:    "dashboard",
    label: "Command Center",
    icon:  LayoutDashboard,
    desc:  "Live telemetry & KPIs",
  },
  {
    id:    "simulation",
    label: "Simulation",
    icon:  Cpu,
    desc:  "SimPy M/M/c engine",
  },
  {
    id:    "forecast",
    label: "ML Forecast",
    icon:  TrendingUp,
    desc:  "12-hour predictions",
  },
  {
    id:    "clinical",
    label: "Clinical AI",
    icon:  ClipboardList,
    desc:  "Report screening",
  },
  {
    id:    "copilot",
    label: "AI Copilot",
    icon:  BrainCircuit,
    desc:  "Operational advisor",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const activePanel  = useHospitalStore((s) => s.activePanel);
  const sidebarOpen  = useHospitalStore((s) => s.sidebarOpen);
  const wsState      = useHospitalStore((s) => s.wsState);
  const setSidebar   = useHospitalStore((s) => s.setSidebarOpen);
  const setPanel     = useHospitalStore((s) => s.setActivePanel);
  const telemetry    = useHospitalStore((s) => s.latestTelemetry);

  const isConnected = wsState === "CONNECTED";

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 64 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="relative flex flex-col h-screen bg-slate-900 border-r border-slate-800 overflow-hidden z-50"
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800 min-h-[68px]">
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <HeartPulse size={18} className="text-emerald-400" />
          </div>
          {/* Connection dot */}
          <span
            className={clsx(
              "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900",
              isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500",
            )}
          />
        </div>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-xs font-semibold text-slate-100 leading-tight">
                Hospital
              </p>
              <p className="text-xs text-emerald-400 leading-tight">
                Command Center
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const Icon     = item.icon;
          const isActive = activePanel === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setPanel(item.id)}
              className={clsx(
                "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent",
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
              )}

              <Icon
                size={18}
                className={clsx(
                  "flex-shrink-0 transition-colors",
                  isActive ? "text-emerald-400" : "text-slate-500",
                )}
              />

              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <p className="text-sm font-medium text-slate-100 leading-none">
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-none">
                      {item.desc}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* ── Status footer ─────────────────────────────────────────────────── */}
      <div className="px-3 py-4 border-t border-slate-800 space-y-2">
        {/* WebSocket status */}
        <div className={clsx(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg",
          isConnected ? "bg-emerald-950/40" : "bg-slate-800",
        )}>
          {isConnected
            ? <Wifi size={14} className="text-emerald-400 flex-shrink-0" />
            : <WifiOff size={14} className="text-slate-400 flex-shrink-0" />
          }
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={clsx(
                  "text-xs font-medium",
                  isConnected ? "text-emerald-400" : "text-slate-400",
                )}
              >
                {wsState === "CONNECTED"    ? "Connected" :
                 wsState === "CONNECTING"   ? "Connecting…" :
                 wsState === "RECONNECTING" ? "Reconnecting…" :
                 "Disconnected"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Live signal indicator */}
        {isConnected && telemetry && (
          <div className="flex items-center gap-2 px-2">
            <Radio size={12} className="text-emerald-400 animate-pulse flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-emerald-300"
                >
                  Telemetry active
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Collapse toggle ───────────────────────────────────────────────── */}
      <button
        onClick={() => setSidebar(!sidebarOpen)}
        className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 hover:border-emerald-600 transition-all z-50"
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen
          ? <ChevronLeft size={12} className="text-slate-400" />
          : <ChevronRight size={12} className="text-slate-400" />
        }
      </button>
    </motion.aside>
  );
}