// frontend/components/Sidebar.tsx
"use client";

import { useHospitalStore } from "@/store/hospitalStore";
import clsx from "clsx";

type Panel = "dashboard" | "simulation" | "forecast" | "clinical" | "copilot";

const NAV_GROUPS: {
  label: string;
  items: {
    id:    Panel;
    label: string;
    icon:  string;
  }[];
}[] = [
  {
    label: "Operations",
    items: [
      { id: "dashboard", label: "Command Center", icon: "ti-layout-dashboard" },
      { id: "simulation", label: "Simulation", icon: "ti-cpu" },
    ]
  },
  {
    label: "Intelligence",
    items: [
      { id: "forecast", label: "ML forecast", icon: "ti-chart-line" },
      { id: "clinical", label: "Clinical AI", icon: "ti-stethoscope" },
    ]
  },
  {
    label: "AI Tools",
    items: [
      { id: "copilot", label: "AI Copilot", icon: "ti-message-chatbot" },
    ]
  }
];

export default function Sidebar() {
  const activePanel  = useHospitalStore((s) => s.activePanel);
  const setPanel     = useHospitalStore((s) => s.setActivePanel);
  const wsState      = useHospitalStore((s) => s.wsState);

  const isConnected = wsState === "CONNECTED";

  return (
    <aside className="sidebar-container h-screen flex-shrink-0">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="sidebar__logo">
        <div className="sidebar__logo-pulse" style={{ background: isConnected ? 'var(--status-normal-border)' : 'var(--status-critical-dot)' }} />
        <span className="text-title text-primary">Command Center</span>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto">
        {NAV_GROUPS.map((group, gIdx) => (
          <div key={gIdx}>
            <div className="sidebar__section-label">{group.label}</div>
            {group.items.map((item) => {
              const isActive = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPanel(item.id)}
                  className={clsx("sidebar__item", isActive && "sidebar__item--active")}
                >
                  <i className={`ti ${item.icon}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Status footer ─────────────────────────────────────────────────── */}
      <div className="sidebar__footer">
        <div className="flex items-center gap-2">
          <i className={isConnected ? "ti ti-wifi" : "ti ti-wifi-off"} />
          <span>{wsState.charAt(0) + wsState.slice(1).toLowerCase()}</span>
        </div>
        {isConnected && (
          <span style={{ color: 'var(--status-normal-border)' }}>Telemetry active</span>
        )}
      </div>
    </aside>
  );
}