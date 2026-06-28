// frontend/components/Header.tsx
"use client";

import { useHospitalStore, useActiveAlerts } from "@/store/hospitalStore";
import { UserCircle, LogOut } from "lucide-react";

const PANEL_TITLES: Record<string, string> = {
  dashboard:  "Command Center",
  simulation: "Simulation Engine",
  forecast:   "ML Forecast",
  clinical:   "Clinical AI Screen",
  copilot:    "AI Copilot",
};

export default function Header() {
  const activePanel  = useHospitalStore((s) => s.activePanel);
  const wsState      = useHospitalStore((s) => s.wsState);
  const activeAlerts = useActiveAlerts();
  const user = useHospitalStore((s) => s.user);
  const logout = useHospitalStore((s) => s.logout);

  const panelTitle = PANEL_TITLES[activePanel] ?? "Command Center";
  const criticalCount = activeAlerts.filter(a => a.level === "critical").length;

  return (
    <header className="page-header">
      {/* ── Left: breadcrumb ──────────────────────────────────────────────── */}
      <div className="header__breadcrumb">
        <span className="header__breadcrumb-root">Workspace</span>
        <span className="header__breadcrumb-sep">/</span>
        <span className="header__breadcrumb-current">{panelTitle}</span>
      </div>

      {/* ── Right: status cluster ───────────────────────────────────────── */}
      <div className="header__status" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        
        {/* User Profile */}
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#161b22", border: "1px solid #30363d", padding: "4px 12px", borderRadius: "100px" }}>
            <UserCircle className="w-5 h-5 text-[#8b949e]" />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#e6edf3", lineHeight: 1 }}>{user.username}</span>
              <span style={{ fontSize: "10px", color: "#3fb950", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>{user.role}</span>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              style={{ marginLeft: "8px", color: "#8b949e", cursor: "pointer", background: "none", border: "none", padding: 0 }}
              onMouseOver={(e) => e.currentTarget.style.color = "#f85149"}
              onMouseOut={(e) => e.currentTarget.style.color = "#8b949e"}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="header__ws-pill">
          <div className="dot" style={{ 
            background: wsState === 'CONNECTED' ? 'var(--status-normal-border)' : 'var(--status-critical-dot)' 
          }} />
          {wsState === "CONNECTED" ? "Connected" : "Disconnected"}
        </div>

        <button className="header__alert-button">
          <i className="ti ti-bell" style={{ fontSize: '18px' }} />
          {criticalCount > 0 && (
            <div className="badge">{criticalCount}</div>
          )}
        </button>
      </div>
    </header>
  );
}
