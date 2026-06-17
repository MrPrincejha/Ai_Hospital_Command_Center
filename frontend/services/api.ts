// frontend/services/api.ts
/**
 * AI Hospital Command Center — API Service Layer
 * ===============================================
 * Typed fetch wrappers for every backend REST endpoint.
 * All functions are async and return typed responses.
 *
 * Base URL is read from NEXT_PUBLIC_API_URL environment variable,
 * falling back to localhost:8000 for local development.
 *
 * Error handling:
 * - HTTP 4xx/5xx → throws ApiError with structured detail
 * - Network errors → re-thrown with context
 */

import type {
  ClinicalScreenRequest,
  ClinicalScreenResponse,
  CopilotClearResponse,
  CopilotQueryRequest,
  CopilotQueryResponse,
  ForecastResponse,
  ForecastTaskResponse,
  ForecastTriggerRequest,
  HealthResponse,
  SimulationStartRequest,
  SimulationStartResponse,
  SimulationStatusResponse,
  TelemetryResponse,
} from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly endpoint: string,
  ) {
    super(`API ${status} @ ${endpoint}: ${detail}`);
    this.name = "ApiError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
    });
  } catch (err) {
    throw new ApiError(0, `Network error: ${err}`, path);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // ignore parse errors on error bodies
    }
    throw new ApiError(response.status, detail, path);
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

export const healthApi = {
  check: (): Promise<HealthResponse> =>
    request<HealthResponse>("/health"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────────────────────

export const simulationApi = {
  /** Queue a new simulation run. Returns task_id immediately. */
  start: (body: SimulationStartRequest = {}): Promise<SimulationStartResponse> =>
    request<SimulationStartResponse>("/api/simulation/start", {
      method: "POST",
      body:   JSON.stringify(body),
    }),

  /** Poll Celery task status by task_id. */
  status: (taskId: string): Promise<SimulationStatusResponse> =>
    request<SimulationStatusResponse>(`/api/simulation/status/${taskId}`),

  /** Get the latest telemetry snapshot from Redis. */
  latestTelemetry: (): Promise<TelemetryResponse> =>
    request<TelemetryResponse>("/api/simulation/latest"),

  /** Cancel a running or pending simulation. */
  cancel: (taskId: string): Promise<{ task_id: string; status: string; message: string }> =>
    request(`/api/simulation/cancel/${taskId}`, { method: "DELETE" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Forecast
// ─────────────────────────────────────────────────────────────────────────────

export const forecastApi = {
  /** Trigger ML training + forecast pipeline. */
  run: (body: ForecastTriggerRequest = {}): Promise<ForecastTaskResponse> =>
    request<ForecastTaskResponse>("/api/forecast/run", {
      method: "POST",
      body:   JSON.stringify(body),
    }),

  /** Get the latest stored forecast from Redis. */
  latest: (): Promise<ForecastResponse> =>
    request<ForecastResponse>("/api/forecast/latest"),

  /** Poll forecast task status. */
  status: (taskId: string): Promise<SimulationStatusResponse> =>
    request<SimulationStatusResponse>(`/api/forecast/status/${taskId}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Screening
// ─────────────────────────────────────────────────────────────────────────────

export const clinicalApi = {
  /** Screen a clinical report for anomalies and urgency. */
  screen: (body: ClinicalScreenRequest): Promise<ClinicalScreenResponse> =>
    request<ClinicalScreenResponse>("/api/clinical/screen", {
      method: "POST",
      body:   JSON.stringify(body),
    }),

  /** Screen the built-in demo report (no LLM key needed). */
  demo: (): Promise<ClinicalScreenResponse> =>
    request<ClinicalScreenResponse>("/api/clinical/score-demo", {
      method: "POST",
    }),

  /** List all supported biomarker rules. */
  biomarkers: (): Promise<{
    total_biomarkers: number;
    triage_tiers: Record<string, string>;
    biomarker_rules: unknown[];
  }> => request("/api/clinical/biomarkers"),
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Copilot
// ─────────────────────────────────────────────────────────────────────────────

export const copilotApi = {
  /** Submit a natural language operational query. */
  query: (body: CopilotQueryRequest): Promise<CopilotQueryResponse> =>
    request<CopilotQueryResponse>("/api/copilot/query", {
      method: "POST",
      body:   JSON.stringify(body),
    }),

  /** Clear conversation history for a session. */
  clearHistory: (sessionId: string): Promise<CopilotClearResponse> =>
    request<CopilotClearResponse>("/api/copilot/clear", {
      method: "POST",
      body:   JSON.stringify({ session_id: sessionId }),
    }),

  /** Get copilot readiness status. */
  status: (): Promise<{
    copilot_ready:        boolean;
    mode:                 string;
    llm_model:            string;
    api_key_configured:   boolean;
    redis_connected:      boolean;
    telemetry_available:  boolean;
    forecast_available:   boolean;
    notes?:               string;
  }> => request("/api/copilot/status"),
};
