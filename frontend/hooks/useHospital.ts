// frontend/hooks/useHospital.ts
/**
 * AI Hospital Command Center — Custom React Hooks
 * ================================================
 * Domain hooks that wire together the WebSocket service, API layer,
 * and Zustand store into clean component-friendly interfaces.
 *
 * Hooks:
 *   useWebSocketBridge   — connect WS, dispatch messages to store
 *   useTelemetry         — live telemetry state from store
 *   useSimulationControl — start/stop/poll simulation tasks
 *   useForecastControl   — trigger forecasts, poll results
 *   useCopilot           — send messages, manage chat state
 *   useSystemHealth      — periodic health check polling
 */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { simulationApi, forecastApi, copilotApi, healthApi } from "@/services/api";
import { hospitalWs }           from "@/services/websocket";
import { useHospitalStore }     from "@/store/hospitalStore";
import type {
  ForecastResult,
  HealthResponse,
  TelemetryEvent,
} from "@/types/hospital";

const ALERT_COOLDOWN_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// useWebSocketBridge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Establishes and maintains the WebSocket connection.
 * Dispatches incoming telemetry/forecast messages to the Zustand store.
 * Should be mounted once at the root layout level.
 */
export function useWebSocketBridge(): void {
  const setTelemetry   = useHospitalStore((s) => s.setTelemetry);
  const setForecast    = useHospitalStore((s) => s.setForecast);
  const setWsState     = useHospitalStore((s) => s.setWsState);
  const setConnectionId = useHospitalStore((s) => s.setConnectionId);
  const pushAlert      = useHospitalStore((s) => s.pushAlert);
  const lastAlertTimes = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Connect
    hospitalWs.connect();

    // State changes
    const unsubState = hospitalWs.onStateChange((state) => {
      setWsState(state);
      if (state === "CONNECTED") {
        toast.success("Live telemetry connected", { id: "ws-connect", duration: 2000 });
      } else if (state === "RECONNECTING") {
        toast.loading("Reconnecting to telemetry…", { id: "ws-reconnect" });
      }
    });

    // Connection ack
    const unsubAck = hospitalWs.onMessage<{ connection_id: string }>(
      "connection_ack",
      (payload) => {
        setConnectionId(payload.connection_id ?? null);
        toast.dismiss("ws-reconnect");
      },
    );

    // Telemetry updates — main data stream from SimPy worker
    const unsubTelemetry = hospitalWs.onMessage<TelemetryEvent>(
      "telemetry_update",
      (payload) => {
        setTelemetry(payload as TelemetryEvent);
      },
    );

    // Forecast updates
    const unsubForecast = hospitalWs.onMessage<ForecastResult>(
      "forecast_update",
      (payload) => {
        setForecast(payload as ForecastResult);
      },
    );

    // Alert banners from server
    const unsubAlert = hospitalWs.onMessage<{
      level: "normal" | "warning" | "critical";
      message: string;
    }>(
      "alert",
      (payload) => {
        const isCritical = payload.level === "critical";
        const now = Date.now();
        const msg = payload.message || "Hospital alert";
        
        // Naive extraction of alert type from message prefix
        const alertType = msg.split("—")[0].split(":")[0].trim();

        if (isCritical) {
          const lastTime = lastAlertTimes.current.get(alertType) || 0;
          if (now - lastTime > ALERT_COOLDOWN_MS) {
            pushAlert(payload.level, msg);
            toast.error(`🚨 ${msg}`, { duration: 8000 });
            lastAlertTimes.current.set(alertType, now);
          }
        } else {
          pushAlert(payload.level ?? "warning", msg);
        }
      },
    );

    return () => {
      unsubState();
      unsubAck();
      unsubTelemetry();
      unsubForecast();
      unsubAlert();
      // Do NOT disconnect on unmount — keep WS alive across route changes
    };
  }, [setTelemetry, setForecast, setWsState, setConnectionId, pushAlert]);
}

// ─────────────────────────────────────────────────────────────────────────────
// useTelemetry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns live telemetry state from the Zustand store.
 * Also polls the REST fallback on mount if WS is not yet connected.
 */
export function useTelemetry() {
  const telemetry        = useHospitalStore((s) => s.latestTelemetry);
  const history          = useHospitalStore((s) => s.telemetryHistory);
  const lastUpdated      = useHospitalStore((s) => s.lastUpdated);
  const setTelemetry     = useHospitalStore((s) => s.setTelemetry);
  const wsState          = useHospitalStore((s) => s.wsState);

  // REST fallback poll if WebSocket isn't connected
  useEffect(() => {
    if (wsState === "CONNECTED") return;

    const poll = async () => {
      try {
        const res = await simulationApi.latestTelemetry();
        if (res.available && res.data) {
          setTelemetry(res.data);
        }
      } catch {
        // silent — WS is primary
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [wsState, setTelemetry]);

  return { telemetry, history, lastUpdated };
}

// ─────────────────────────────────────────────────────────────────────────────
// useSimulationControl
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides controls for starting/cancelling simulations and polling status.
 */
export function useSimulationControl() {
  const simulation    = useHospitalStore((s) => s.simulation);
  const setSimulation = useHospitalStore((s) => s.setSimulation);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await simulationApi.status(taskId);
          setSimulation({ status: res.status });
          if (res.status === "SUCCESS" || res.status === "FAILURE") {
            stopPolling();
            if (res.status === "SUCCESS") {
              toast.success("Simulation completed successfully!");
            } else {
              toast.error(`Simulation failed: ${res.error ?? "Unknown error"}`);
            }
          }
        } catch (err) {
          console.error("Simulation poll error:", err);
        }
      }, 3000); // poll every 3s
    },
    [setSimulation, stopPolling],
  );

  const startSimulation = useCallback(
    async (simHours = 24, seed?: number) => {
      setLoading(true);
      try {
        const res = await simulationApi.start({
          sim_hours:          simHours,
          telemetry_interval: 0.5,
          seed:               seed ?? null,
        });
        setSimulation({
          taskId:    res.task_id,
          status:    "PENDING",
          startedAt: new Date().toISOString(),
        });
        toast.success(`Simulation queued (${simHours}h)`, { icon: "🏥" });
        startPolling(res.task_id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to start simulation: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [setSimulation, startPolling],
  );

  const cancelSimulation = useCallback(async () => {
    if (!simulation.taskId) return;
    try {
      await simulationApi.cancel(simulation.taskId);
      setSimulation({ status: "REVOKED", taskId: null });
      stopPolling();
      toast("Simulation cancelled", { icon: "⛔" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Cancel failed: ${msg}`);
    }
  }, [simulation.taskId, setSimulation, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    simulation,
    loading,
    startSimulation,
    cancelSimulation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useForecastControl
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Triggers ML forecast pipeline and polls for results.
 */
export function useForecastControl() {
  const forecast         = useHospitalStore((s) => s.latestForecast);
  const forecastUpdated  = useHospitalStore((s) => s.forecastUpdatedAt);
  const setForecast      = useHospitalStore((s) => s.setForecast);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId]   = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("IDLE");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch latest on mount
  useEffect(() => {
    forecastApi.latest().then((res) => {
      if (res.available && res.data) setForecast(res.data);
    }).catch(() => {});
  }, [setForecast]);

  const runForecast = useCallback(
    async (trainingHours = 8760) => {
      setLoading(true);
      try {
        const res = await forecastApi.run({ training_hours: trainingHours });
        setTaskId(res.task_id);
        setTaskStatus("PENDING");
        toast.loading("Forecast pipeline running…", { id: "forecast-task" });

        // Poll for result
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await forecastApi.status(res.task_id);
            setTaskStatus(statusRes.status);

            if (statusRes.status === "SUCCESS") {
              clearInterval(pollRef.current!);
              toast.success("Forecast ready!", { id: "forecast-task" });
              // Refresh latest forecast
              const latest = await forecastApi.latest();
              if (latest.available && latest.data) {
                setForecast(latest.data);
              }
            } else if (statusRes.status === "FAILURE") {
              clearInterval(pollRef.current!);
              toast.error("Forecast pipeline failed", { id: "forecast-task" });
            }
          } catch {
            clearInterval(pollRef.current!);
          }
        }, 4000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Forecast error: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [setForecast],
  );

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  return { forecast, forecastUpdated, loading, taskId, taskStatus, runForecast };
}

// ─────────────────────────────────────────────────────────────────────────────
// useCopilot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages AI copilot chat — sending messages, loading state, session management.
 */
export function useCopilot() {
  const messages         = useHospitalStore((s) => s.chatMessages);
  const sessionId        = useHospitalStore((s) => s.sessionId);
  const loading          = useHospitalStore((s) => s.copilotLoading);
  const addMessage       = useHospitalStore((s) => s.addChatMessage);
  const setCopilotLoading = useHospitalStore((s) => s.setCopilotLoading);
  const clearChat        = useHospitalStore((s) => s.clearChat);
  const resetSession     = useHospitalStore((s) => s.resetSession);

  const sendMessage = useCallback(
    async (query: string, useMock = false) => {
      if (!query.trim() || loading) return;

      // Optimistically add user message
      addMessage({ role: "user", content: query });
      setCopilotLoading(true);

      try {
        const res = await copilotApi.query({
          query,
          session_id: sessionId,
          use_mock:   useMock,
        });

        addMessage({
          role:      "assistant",
          content:   res.response,
          latency_ms: res.latency_ms,
          model:     res.model_used,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addMessage({
          role:    "assistant",
          content: `⚠️ Copilot error: ${msg}. Try enabling mock mode or check API connectivity.`,
        });
        toast.error("Copilot request failed");
      } finally {
        setCopilotLoading(false);
      }
    },
    [loading, sessionId, addMessage, setCopilotLoading],
  );

  const clearSession = useCallback(async () => {
    try {
      await copilotApi.clearHistory(sessionId);
    } catch { /* silent */ }
    resetSession();
    toast("Conversation cleared", { icon: "🗑️" });
  }, [sessionId, resetSession]);

  return { messages, sessionId, loading, sendMessage, clearSession, clearChat };
}

// ─────────────────────────────────────────────────────────────────────────────
// useSystemHealth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polls the /health endpoint every 30s and returns the latest status.
 */
export function useSystemHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await healthApi.check();
        setHealth(res);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Health check failed");
      }
    };

    fetch();
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { health, error };
}