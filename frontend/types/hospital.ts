// frontend/types/hospital.ts
/**
 * AI Hospital Command Center — TypeScript Type Definitions
 * =========================================================
 * Mirrors every Pydantic schema from backend/app/schemas/hospital.py.
 * Keep these in sync with the backend contract.
 *
 * Naming convention:
 *   Backend Python class → TypeScript interface (same name)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type AlertLevel = "normal" | "warning" | "critical";
export type RiskLevel  = "low" | "medium" | "high" | "critical";
export type TriageTier = "IMMEDIATE" | "URGENT" | "SEMI_URGENT" | "NON_URGENT";
export type TaskStatus = "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY" | "REVOKED";
export type WsConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING";

export interface HealthResponse {
  status:          "ok" | "degraded" | "error";
  version:         string;
  environment:     string;
  redis_connected: boolean;
  timestamp:       string;
}

export interface ErrorResponse {
  error:   string;
  detail?: string;
  code:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry / Department
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentSnapshot {
  department:           string;
  sim_time:             number;
  wall_time:            number;
  queue_length:         number;
  patients_in_service:  number;
  patients_completed:   number;
  avg_wait_time:        number;   // hours
  server_utilization:   number;   // 0.0–1.0
  congestion_probability: number; // 0.0–1.0
  overflow_events:      number;
  throughput_per_hour:  number;
  alert_level:          AlertLevel;
}

export interface TelemetryEvent {
  event_id:         string;
  event_type:       "telemetry_tick" | "alert" | "sim_complete";
  timestamp:        number;
  snapshots:        DepartmentSnapshot[];
  global_alert:     AlertLevel;
  total_queue:      number;
  icu_occupancy_pct: number;  // 0.0–1.0
  er_congestion_pct: number;  // 0.0–1.0
}

export interface TelemetryResponse {
  available:   boolean;
  fetched_at:  string;
  data?:       TelemetryEvent;
  message?:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulationStartRequest {
  sim_hours?:          number;   // default 24
  telemetry_interval?: number;   // default 0.5
  seed?:               number | null;
}

export interface SimulationStartResponse {
  task_id:   string;
  status:    string;
  message:   string;
  sim_hours: number;
  seed:      number | null;
}

export interface SimulationStatusResponse {
  task_id:       string;
  status:        TaskStatus;
  result?:       Record<string, unknown>;
  error?:        string;
  started_at?:   string;
  completed_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastTriggerRequest {
  training_hours?: number;  // default 8760
  seed?:           number;
}

export interface ForecastResult {
  forecast_horizon_hours: number;
  generated_at:           string;
  icu_occupancy_t12:      number;  // 0.0–1.0
  er_congestion_t12:      number;  // 0.0–1.0
  patient_inflow_t12:     number;
  risk_level:             RiskLevel;
  model_mae_icu:          number;
  model_mae_er:           number;
  top_features:           Record<string, number>;
}

export interface ForecastResponse {
  available:  boolean;
  fetched_at: string;
  data?:      ForecastResult;
  message?:   string;
}

export interface ForecastTaskResponse {
  task_id: string;
  status:  string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Screening
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicalScreenRequest {
  report_text:  string;
  report_id?:   string;
  patient_ref?: string;
  use_mock_llm?: boolean;
}

export type AnomalyDirection = "NORMAL" | "LOW" | "HIGH" | "CRITICAL_LOW" | "CRITICAL_HIGH";
export type SeverityLabel    = "normal" | "mild" | "moderate" | "severe" | "critical";

export interface ScoredAnomaly {
  biomarker:      string;
  value:          number;
  unit:           string;
  direction:      AnomalyDirection;
  reference_min:  number;
  reference_max:  number;
  severity_score: number;
  severity_label: SeverityLabel;
  clinical_note:  string;
}

export interface ClinicalScreenResponse {
  report_id:           string;
  patient_ref:         string;
  processed_at:        string;
  raw_report_excerpt:  string;
  anomalies_extracted: number;
  scored_anomalies:    ScoredAnomaly[];
  total_urgency_score: number;
  triage_tier:         TriageTier;
  critical_flags:      string[];
  llm_model_used:      string;
  scoring_duration_ms: number;
  disclaimer:          string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Copilot
// ─────────────────────────────────────────────────────────────────────────────

export interface CopilotQueryRequest {
  query:      string;
  session_id?: string;
  use_mock?:  boolean;
}

export interface CopilotQueryResponse {
  session_id:         string;
  query:              string;
  response:           string;
  telemetry_snapshot: Record<string, unknown>;
  forecast_snapshot:  Record<string, unknown>;
  model_used:         string;
  latency_ms:         number;
  generated_at:       string;
  tokens_used?:       number;
}

export interface CopilotClearResponse {
  session_id: string;
  cleared:    boolean;
  message:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket protocol
// ─────────────────────────────────────────────────────────────────────────────

export type WsMessageType =
  | "telemetry_update"
  | "forecast_update"
  | "alert"
  | "heartbeat"
  | "connection_ack"
  | "error";

export interface WsMessage {
  type:      WsMessageType;
  payload:   Record<string, unknown>;
  timestamp: string;
}

export interface WsConnectionAck {
  connection_id:       string;
  subscribed_channels: string[];
  server_time:         number;
  heartbeat_interval:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI-only types (not from backend)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  timestamp:  string;
  latency_ms?: number;
  model?:     string;
}

export interface TelemetryHistoryPoint {
  timestamp:        number;
  icu_occupancy:    number;
  er_congestion:    number;
  total_queue:      number;
  opd_utilization:  number;
  ward_utilization: number;
}

export interface SimulationState {
  taskId:    string | null;
  status:    TaskStatus | "IDLE";
  startedAt: string | null;
}
