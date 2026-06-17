// frontend/store/hospitalStore.ts
/**
 * AI Hospital Command Center — Zustand Global Store
 * ==================================================
 * Centralised client-side state for the entire dashboard.
 *
 * Slices:
 *   telemetry    — live snapshot + rolling 60-point history
 *   forecast     — latest ML forecast result
 *   simulation   — active task tracking
 *   copilot      — chat message history per session
 *   alerts       — banner alert queue
 *   ui           — sidebar, active panel, connection state
 *
 * Author: AI Hospital Command Center Team
 */

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type {
  AlertLevel,
  ChatMessage,
  DepartmentSnapshot,
  ForecastResult,
  SimulationState,
  TelemetryEvent,
  TelemetryHistoryPoint,
  WsConnectionState,
} from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY_POINTS = 60;  // 60 telemetry ticks in rolling chart
const MAX_CHAT_MESSAGES  = 100;
const MAX_ALERTS         = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Alert banner type
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertBanner {
  id:        string;
  level:     AlertLevel;
  message:   string;
  timestamp: string;
  dismissed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

export interface HospitalStore {
  // ── Telemetry ──────────────────────────────────────────────────────────────
  latestTelemetry:   TelemetryEvent | null;
  telemetryHistory:  TelemetryHistoryPoint[];
  lastUpdated:       string | null;

  // ── Forecast ──────────────────────────────────────────────────────────────
  latestForecast:    ForecastResult | null;
  forecastUpdatedAt: string | null;

  // ── Simulation task ────────────────────────────────────────────────────────
  simulation:        SimulationState;

  // ── Copilot chat ───────────────────────────────────────────────────────────
  chatMessages:      ChatMessage[];
  sessionId:         string;
  copilotLoading:    boolean;

  // ── Alerts ─────────────────────────────────────────────────────────────────
  alerts:            AlertBanner[];

  // ── UI ────────────────────────────────────────────────────────────────────
  sidebarOpen:       boolean;
  activePanel:       "dashboard" | "simulation" | "forecast" | "clinical" | "copilot";
  wsState:           WsConnectionState;
  connectionId:      string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setTelemetry:      (event: TelemetryEvent) => void;
  setForecast:       (forecast: ForecastResult) => void;
  setSimulation:     (state: Partial<SimulationState>) => void;
  addChatMessage:    (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  setCopilotLoading: (loading: boolean) => void;
  clearChat:         () => void;
  pushAlert:         (level: AlertLevel, message: string) => void;
  dismissAlert:      (id: string) => void;
  setSidebarOpen:    (open: boolean) => void;
  setActivePanel:    (panel: HospitalStore["activePanel"]) => void;
  setWsState:        (state: WsConnectionState) => void;
  setConnectionId:   (id: string | null) => void;
  resetSession:      () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store implementation
// ─────────────────────────────────────────────────────────────────────────────

export const useHospitalStore = create<HospitalStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  latestTelemetry:   null,
  telemetryHistory:  [],
  lastUpdated:       null,
  latestForecast:    null,
  forecastUpdatedAt: null,
  simulation: {
    taskId:    null,
    status:    "IDLE",
    startedAt: null,
  },
  chatMessages:   [],
  sessionId:      uuidv4().slice(0, 12),
  copilotLoading: false,
  alerts:         [],
  sidebarOpen:    true,
  activePanel:    "dashboard",
  wsState:        "DISCONNECTED",
  connectionId:   null,

  // ── Telemetry ──────────────────────────────────────────────────────────────

  setTelemetry: (event: TelemetryEvent) => {
    set((state) => {
      // Build history point
      const opdSnap  = event.snapshots.find((s) => s.department === "OPD");
      const wardSnap = event.snapshots.find((s) => s.department === "Ward");

      const point: TelemetryHistoryPoint = {
        timestamp:        event.timestamp,
        icu_occupancy:    event.icu_occupancy_pct,
        er_congestion:    event.er_congestion_pct,
        total_queue:      event.total_queue,
        opd_utilization:  opdSnap?.server_utilization ?? 0,
        ward_utilization: wardSnap?.server_utilization ?? 0,
      };

      const newHistory = [
        ...state.telemetryHistory,
        point,
      ].slice(-MAX_HISTORY_POINTS);

      // If global alert is critical, push a banner
      const shouldAlert =
        event.global_alert === "critical" &&
        state.latestTelemetry?.global_alert !== "critical";

      const newAlerts = shouldAlert
        ? [
            ...state.alerts,
            {
              id:        uuidv4(),
              level:     "critical" as AlertLevel,
              message:   `CRITICAL: Hospital alert — Queue: ${event.total_queue} | ICU: ${Math.round(event.icu_occupancy_pct * 100)}% | ER: ${Math.round(event.er_congestion_pct * 100)}%`,
              timestamp: new Date().toISOString(),
              dismissed: false,
            },
          ].slice(-MAX_ALERTS)
        : state.alerts;

      return {
        latestTelemetry:  event,
        telemetryHistory: newHistory,
        lastUpdated:      new Date().toISOString(),
        alerts:           newAlerts,
      };
    });
  },

  // ── Forecast ──────────────────────────────────────────────────────────────

  setForecast: (forecast: ForecastResult) => {
    set({
      latestForecast:    forecast,
      forecastUpdatedAt: new Date().toISOString(),
    });
  },

  // ── Simulation ────────────────────────────────────────────────────────────

  setSimulation: (partial: Partial<SimulationState>) => {
    set((state) => ({
      simulation: { ...state.simulation, ...partial },
    }));
  },

  // ── Copilot ───────────────────────────────────────────────────────────────

  addChatMessage: (msg) => {
    const full: ChatMessage = {
      ...msg,
      id:        uuidv4(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        full,
      ].slice(-MAX_CHAT_MESSAGES),
    }));
  },

  setCopilotLoading: (loading: boolean) => {
    set({ copilotLoading: loading });
  },

  clearChat: () => {
    set({ chatMessages: [] });
  },

  // ── Alerts ────────────────────────────────────────────────────────────────

  pushAlert: (level: AlertLevel, message: string) => {
    const banner: AlertBanner = {
      id:        uuidv4(),
      level,
      message,
      timestamp: new Date().toISOString(),
      dismissed: false,
    };
    set((state) => ({
      alerts: [...state.alerts, banner].slice(-MAX_ALERTS),
    }));
  },

  dismissAlert: (id: string) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a,
      ),
    }));
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

  setActivePanel: (panel) => set({ activePanel: panel }),

  setWsState: (wsState: WsConnectionState) => set({ wsState }),

  setConnectionId: (connectionId: string | null) => set({ connectionId }),

  // ── Session reset ─────────────────────────────────────────────────────────

  resetSession: () => {
    set({
      chatMessages:   [],
      sessionId:      uuidv4().slice(0, 12),
      copilotLoading: false,
    });
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Selectors — memoised derived values
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the snapshot for a named department, or null. */
export function useDepartmentSnapshot(name: string): DepartmentSnapshot | null {
  return useHospitalStore((s) =>
    s.latestTelemetry?.snapshots.find((d) => d.department === name) ?? null,
  );
}

/** Returns the active (non-dismissed) alerts. */
export function useActiveAlerts(): AlertBanner[] {
  return useHospitalStore((s) => s.alerts.filter((a) => !a.dismissed));
}