# backend/app/api/routes/websocket_routes.py
"""
AI Hospital Command Center — WebSocket Endpoint
================================================
Exposes the live telemetry WebSocket endpoint used by the Next.js dashboard.

Endpoint
--------
WS  /ws/telemetry   — Live telemetry stream (pub/sub relay)

Protocol
--------
Client connects → receives connection_ack with connection_id
Client optionally sends subscribe/unsubscribe JSON frames
Server streams telemetry_update events as simulation publishes
Server sends heartbeat every N seconds (configurable)
Server sends alert frames when global_alert == "critical"

Inbound frames from client (optional)
--------------------------------------
  { "action": "subscribe",   "channel": "telemetry" }
  { "action": "unsubscribe", "channel": "telemetry" }
  { "action": "ping" }

Outbound frames from server
-----------------------------
  { "type": "connection_ack",   "payload": { ... } }
  { "type": "telemetry_update", "payload": { telemetry event } }
  { "type": "alert",            "payload": { level, message, ... } }
  { "type": "heartbeat",        "payload": { server_time } }
  { "type": "error",            "payload": { message } }

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.schemas.hospital import WebSocketMessage, WebSocketSubscribeMessage
from app.websocket.manager import ConnectionManager, get_connection_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


# ─────────────────────────────────────────────────────────────────────────────
# WS /ws/telemetry
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/telemetry")
async def telemetry_websocket(
    websocket: WebSocket,
    manager: ConnectionManager = Depends(get_connection_manager),
) -> None:
    """
    WebSocket endpoint for live hospital telemetry streaming.

    Each connected client receives:
    1. connection_ack immediately on connect
    2. telemetry_update events relayed from Redis pub/sub
    3. alert events when global_alert reaches "critical"
    4. heartbeat pings every ws_heartbeat_interval seconds

    Clients can send subscribe/unsubscribe frames to manage channels,
    or ping frames to reset their heartbeat timer.
    """
    conn = None
    try:
        # Accept + register connection
        conn = await manager.connect(websocket)
        logger.info("WS client connected | id=%s", conn.connection_id)

        # Client message loop
        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            # Parse inbound control frame
            await _handle_client_message(raw, conn.connection_id, manager)

    except ConnectionError as exc:
        # Raised by manager when at max capacity
        logger.warning("WS connection rejected: %s", exc)
        return

    except WebSocketDisconnect as exc:
        logger.info(
            "WS client disconnected | id=%s | code=%s",
            conn.connection_id if conn else "unknown",
            exc.code,
        )

    except Exception as exc:
        logger.error(
            "Unexpected WS error | id=%s | error=%s",
            conn.connection_id if conn else "unknown",
            exc,
            exc_info=True,
        )

    finally:
        if conn is not None:
            await manager.disconnect(conn.connection_id)


# ─────────────────────────────────────────────────────────────────────────────
# Inbound message handler
# ─────────────────────────────────────────────────────────────────────────────

async def _handle_client_message(
    raw: str,
    connection_id: str,
    manager: ConnectionManager,
) -> None:
    """
    Parse and dispatch an inbound WebSocket frame from a client.

    Supported actions: subscribe, unsubscribe, ping.
    Invalid frames receive an error response.
    """
    try:
        data = json.loads(raw)
        msg = WebSocketSubscribeMessage(**data)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.debug("Invalid WS frame from %s: %s", connection_id, exc)
        await manager.send_to_connection(
            connection_id,
            WebSocketMessage(
                type="error",
                payload={"message": f"Invalid frame: {exc}"},
            ).model_dump(),
        )
        return

    if msg.action == "subscribe" and msg.channel:
        ok = await manager.subscribe(connection_id, msg.channel)
        await manager.send_to_connection(
            connection_id,
            WebSocketMessage(
                type="connection_ack",
                payload={
                    "action": "subscribed",
                    "channel": msg.channel,
                    "ok": ok,
                    "server_time": time.time(),
                },
            ).model_dump(),
        )
        logger.debug("conn=%s subscribed to %s", connection_id, msg.channel)

    elif msg.action == "unsubscribe" and msg.channel:
        ok = await manager.unsubscribe(connection_id, msg.channel)
        await manager.send_to_connection(
            connection_id,
            WebSocketMessage(
                type="connection_ack",
                payload={
                    "action": "unsubscribed",
                    "channel": msg.channel,
                    "ok": ok,
                    "server_time": time.time(),
                },
            ).model_dump(),
        )

    elif msg.action == "ping":
        # Update last_ping timestamp for heartbeat tracking
        conn = manager._connections.get(connection_id)
        if conn:
            conn.last_ping = time.time()
        await manager.send_to_connection(
            connection_id,
            WebSocketMessage(
                type="heartbeat",
                payload={"pong": True, "server_time": time.time()},
            ).model_dump(),
        )

    else:
        await manager.send_to_connection(
            connection_id,
            WebSocketMessage(
                type="error",
                payload={"message": f"Unknown action: {msg.action}"},
            ).model_dump(),
        )
