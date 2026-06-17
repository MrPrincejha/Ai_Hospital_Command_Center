// frontend/services/websocket.ts
/**
 * AI Hospital Command Center — WebSocket Service
 * ===============================================
 * Manages the persistent WebSocket connection to the FastAPI
 * telemetry endpoint (ws://host/ws/telemetry).
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s → 30s)
 * - Typed message dispatch via listener callbacks
 * - Heartbeat response (auto-replies to server pings)
 * - Singleton pattern — one connection per browser tab
 * - Connection state tracking (CONNECTING / OPEN / CLOSED)
 *
 * Usage:
 *   const ws = HospitalWebSocket.getInstance();
 *   ws.onMessage("telemetry_update", (payload) => { ... });
 *   ws.connect();
 */

import type { TelemetryEvent, WsMessage, WsMessageType } from "@/types/hospital";
import type { WsConnectionState } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/telemetry";

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS     = 30_000;
const RECONNECT_FACTOR     = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MessageListener<T = unknown> = (payload: T) => void;
type StateListener = (state: WsConnectionState) => void;

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket service class
// ─────────────────────────────────────────────────────────────────────────────

export class HospitalWebSocket {
  private static _instance: HospitalWebSocket | null = null;

  private _ws:            WebSocket | null = null;
  private _state:         WsConnectionState = "DISCONNECTED";
  private _retryDelay:    number = RECONNECT_INITIAL_MS;
  private _retryTimer:    ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;
  private _connectionId:  string | null = null;

  // Listener maps: message_type → Set of callbacks
  private _listeners: Map<WsMessageType, Set<MessageListener>> = new Map();
  // State change listeners
  private _stateListeners: Set<StateListener> = new Set();

  // ── Singleton ──────────────────────────────────────────────────────────────

  static getInstance(): HospitalWebSocket {
    if (!HospitalWebSocket._instance) {
      HospitalWebSocket._instance = new HospitalWebSocket();
    }
    return HospitalWebSocket._instance;
  }

  private constructor() {}

  // ── Public API ─────────────────────────────────────────────────────────────

  get state(): WsConnectionState {
    return this._state;
  }

  get connectionId(): string | null {
    return this._connectionId;
  }

  get isConnected(): boolean {
    return this._state === "CONNECTED";
  }

  /**
   * Open the WebSocket connection.
   * Safe to call multiple times — noops if already connected.
   */
  connect(): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;
    this._intentionalClose = false;
    this._openConnection();
  }

  /**
   * Gracefully close the WebSocket connection.
   * Prevents auto-reconnect.
   */
  disconnect(): void {
    this._intentionalClose = true;
    this._clearRetryTimer();
    if (this._ws) {
      this._ws.close(1000, "Client disconnect");
      this._ws = null;
    }
    this._setState("DISCONNECTED");
  }

  /**
   * Register a typed listener for a specific WebSocket message type.
   * Returns an unsubscribe function.
   */
  onMessage<T = unknown>(
    type: WsMessageType,
    listener: MessageListener<T>,
  ): () => void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener as MessageListener);

    return () => {
      this._listeners.get(type)?.delete(listener as MessageListener);
    };
  }

  /**
   * Register a connection state change listener.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: StateListener): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  /**
   * Send a raw JSON frame to the server.
   */
  send(data: Record<string, unknown>): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  /**
   * Subscribe to a server channel.
   */
  subscribe(channel: string): void {
    this.send({ action: "subscribe", channel });
  }

  /**
   * Unsubscribe from a server channel.
   */
  unsubscribe(channel: string): void {
    this.send({ action: "unsubscribe", channel });
  }

  // ── Private — connection lifecycle ─────────────────────────────────────────

  private _openConnection(): void {
    this._setState(
      this._retryDelay > RECONNECT_INITIAL_MS ? "RECONNECTING" : "CONNECTING",
    );

    try {
      this._ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error("[WS] Failed to create WebSocket:", err);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      console.info("[WS] Connected →", WS_URL);
      this._setState("CONNECTED");
      this._retryDelay = RECONNECT_INITIAL_MS; // reset backoff
    };

    this._ws.onmessage = (event: MessageEvent<string>) => {
      this._handleMessage(event.data);
    };

    this._ws.onclose = (event) => {
      console.warn("[WS] Closed — code:", event.code, "reason:", event.reason);
      this._ws = null;
      this._setState("DISCONNECTED");
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (error) => {
      console.error("[WS] Error:", error);
      // onclose fires after onerror automatically
    };
  }

  private _handleMessage(raw: string): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw) as WsMessage;
    } catch {
      console.warn("[WS] Unparseable message:", raw.slice(0, 100));
      return;
    }

    // Handle connection acknowledgement
    if (msg.type === "connection_ack") {
      const ack = msg.payload as { connection_id?: string };
      this._connectionId = ack.connection_id ?? null;
      console.info("[WS] Connection acknowledged | id:", this._connectionId);
    }

    // Auto-respond to heartbeat
    if (msg.type === "heartbeat") {
      this.send({ action: "ping" });
    }

    // Dispatch to all registered listeners for this message type
    const listeners = this._listeners.get(msg.type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(msg.payload);
        } catch (err) {
          console.error(`[WS] Listener error for type=${msg.type}:`, err);
        }
      });
    }
  }

  private _scheduleReconnect(): void {
    this._clearRetryTimer();
    console.info(`[WS] Reconnecting in ${this._retryDelay}ms…`);
    this._retryTimer = setTimeout(() => {
      this._openConnection();
    }, this._retryDelay);

    // Exponential backoff
    this._retryDelay = Math.min(
      this._retryDelay * RECONNECT_FACTOR,
      RECONNECT_MAX_MS,
    );
  }

  private _clearRetryTimer(): void {
    if (this._retryTimer !== null) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  private _setState(state: WsConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this._stateListeners.forEach((l) => {
      try { l(state); } catch { /* ignore */ }
    });
  }
}

// ── Convenience singleton export ────────────────────────────────────────────
export const hospitalWs = HospitalWebSocket.getInstance();