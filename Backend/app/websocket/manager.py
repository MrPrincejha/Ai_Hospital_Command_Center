# backend/app/websocket/manager.py
"""
AI Hospital Command Center — WebSocket Connection Manager
=========================================================
Manages all active WebSocket connections and bridges the Redis pub/sub
channel to connected dashboard clients.

Architecture
------------

    Redis pub/sub channel "hospital:telemetry"
              │
              ▼
    RedisPubSubBridge  (asyncio background task)
              │
              ▼
    ConnectionManager  (in-memory registry of all active WS connections)
              │
         ┌────┴──────┐
         ▼           ▼
    Client A      Client B    …   (browser dashboards / mobile)

Features
--------
- Channel-based subscriptions (clients subscribe to specific rooms)
- Heartbeat ping/pong to detect stale connections
- Graceful disconnect handling
- Broadcast + unicast message sending
- Message type routing via WebSocketMessage schema
- Redis pub/sub bridge runs as a single asyncio task (not per-connection)

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from redis.asyncio import Redis as AsyncRedis

from app.core.config import settings
from app.schemas.hospital import WebSocketMessage

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Connection record
# ─────────────────────────────────────────────────────────────────────────────

class Connection:
    """
    Represents a single active WebSocket client connection.

    Attributes
    ----------
    connection_id : str
        Unique identifier assigned at connect time.
    websocket : WebSocket
        The FastAPI WebSocket instance.
    channels : set[str]
        Channels this connection has subscribed to.
    connected_at : float
        Unix timestamp of connection establishment.
    last_ping : float
        Unix timestamp of last successful ping/pong.
    """

    def __init__(self, websocket: WebSocket) -> None:
        self.connection_id: str = str(uuid.uuid4())[:8]
        self.websocket: WebSocket = websocket
        self.channels: set[str] = {"telemetry"}   # default subscription
        self.connected_at: float = time.time()
        self.last_ping: float = time.time()

    async def send_json(self, message: dict[str, Any]) -> bool:
        """
        Send a JSON message to this client.

        Returns
        -------
        bool
            True if sent successfully, False if connection is broken.
        """
        try:
            await self.websocket.send_text(json.dumps(message, default=str))
            return True
        except Exception as exc:
            logger.debug(
                "Send failed to connection %s: %s", self.connection_id, exc
            )
            return False

    @property
    def age_seconds(self) -> float:
        return time.time() - self.connected_at

    @property
    def seconds_since_ping(self) -> float:
        return time.time() - self.last_ping


# ─────────────────────────────────────────────────────────────────────────────
# Connection manager
# ─────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    """
    Thread-safe (asyncio-safe) registry of all active WebSocket connections.

    Connections are indexed by:
    - connection_id  → fast single-connection lookups
    - channel        → fast channel-based broadcast

    All public methods are coroutines and should only be called from the
    asyncio event loop (FastAPI's event loop).
    """

    def __init__(self) -> None:
        # Primary registry: connection_id → Connection
        self._connections: dict[str, Connection] = {}
        # Channel index: channel_name → set of connection_ids
        self._channel_index: dict[str, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket) -> Connection:
        """
        Accept a new WebSocket connection and register it.

        Returns the Connection object with its assigned ID.
        """
        await websocket.accept()
        conn = Connection(websocket)

        async with self._lock:
            if len(self._connections) >= settings.ws_max_connections:
                logger.warning(
                    "Max WebSocket connections reached (%d). Rejecting %s.",
                    settings.ws_max_connections,
                    conn.connection_id,
                )
                await websocket.close(code=1013, reason="Server at capacity")
                raise ConnectionError("Max connections reached")

            self._connections[conn.connection_id] = conn
            for channel in conn.channels:
                self._channel_index[channel].add(conn.connection_id)

        logger.info(
            "WebSocket connected | id=%s | total=%d",
            conn.connection_id,
            len(self._connections),
        )

        # Send acknowledgement
        await conn.send_json(
            WebSocketMessage(
                type="connection_ack",
                payload={
                    "connection_id": conn.connection_id,
                    "subscribed_channels": list(conn.channels),
                    "server_time": time.time(),
                    "heartbeat_interval": settings.ws_heartbeat_interval,
                },
            ).model_dump()
        )
        return conn

    async def disconnect(self, connection_id: str) -> None:
        """Remove a connection from all registries."""
        async with self._lock:
            conn = self._connections.pop(connection_id, None)
            if conn is None:
                return
            for channel in conn.channels:
                self._channel_index[channel].discard(connection_id)

        logger.info(
            "WebSocket disconnected | id=%s | total=%d",
            connection_id,
            len(self._connections),
        )

    # ── Subscription management ───────────────────────────────────────────────

    async def subscribe(self, connection_id: str, channel: str) -> bool:
        """Add a connection to a channel. Returns True on success."""
        async with self._lock:
            conn = self._connections.get(connection_id)
            if conn is None:
                return False
            conn.channels.add(channel)
            self._channel_index[channel].add(connection_id)
        logger.debug("conn=%s subscribed to channel=%s", connection_id, channel)
        return True

    async def unsubscribe(self, connection_id: str, channel: str) -> bool:
        """Remove a connection from a channel. Returns True on success."""
        async with self._lock:
            conn = self._connections.get(connection_id)
            if conn is None:
                return False
            conn.channels.discard(channel)
            self._channel_index[channel].discard(connection_id)
        logger.debug("conn=%s unsubscribed from channel=%s", connection_id, channel)
        return True

    # ── Broadcasting ──────────────────────────────────────────────────────────

    async def broadcast_to_channel(
        self,
        channel: str,
        message: dict[str, Any],
    ) -> int:
        """
        Send a message to all connections subscribed to `channel`.

        Returns
        -------
        int
            Number of clients that received the message successfully.
        """
        async with self._lock:
            target_ids = list(self._channel_index.get(channel, set()))

        if not target_ids:
            logger.debug("broadcast_to_channel: no subscribers on channel=%s", channel)
            return 0

        # Send concurrently; collect stale connections
        results = await asyncio.gather(
            *(self._safe_send(cid, message) for cid in target_ids),
            return_exceptions=True,
        )

        sent = sum(1 for r in results if r is True)
        failed_ids = [
            target_ids[i]
            for i, r in enumerate(results)
            if r is not True
        ]
        # Prune broken connections
        for cid in failed_ids:
            await self.disconnect(cid)

        logger.debug(
            "broadcast channel=%s | sent=%d | pruned=%d",
            channel, sent, len(failed_ids),
        )
        return sent

    async def broadcast_all(self, message: dict[str, Any]) -> int:
        """Send to every connected client regardless of channel."""
        async with self._lock:
            all_ids = list(self._connections.keys())

        results = await asyncio.gather(
            *(self._safe_send(cid, message) for cid in all_ids),
            return_exceptions=True,
        )
        return sum(1 for r in results if r is True)

    async def send_to_connection(
        self, connection_id: str, message: dict[str, Any]
    ) -> bool:
        """Send a message to a specific connection."""
        return await self._safe_send(connection_id, message)

    async def _safe_send(
        self, connection_id: str, message: dict[str, Any]
    ) -> bool:
        conn = self._connections.get(connection_id)
        if conn is None:
            return False
        return await conn.send_json(message)

    # ── Heartbeat ─────────────────────────────────────────────────────────────

    async def run_heartbeat(self) -> None:
        """
        Background task that periodically pings all connections.
        Stale connections (no pong within 2× heartbeat interval) are pruned.

        Run this as an asyncio task in the FastAPI lifespan.
        """
        stale_threshold = settings.ws_heartbeat_interval * 2

        while True:
            await asyncio.sleep(settings.ws_heartbeat_interval)

            async with self._lock:
                all_ids = list(self._connections.keys())

            stale: list[str] = []
            for cid in all_ids:
                conn = self._connections.get(cid)
                if conn is None:
                    continue

                if conn.seconds_since_ping > stale_threshold:
                    stale.append(cid)
                    logger.info(
                        "Pruning stale connection %s (%.0fs since last ping)",
                        cid, conn.seconds_since_ping,
                    )
                    continue

                # Send heartbeat
                ok = await conn.send_json(
                    WebSocketMessage(
                        type="heartbeat",
                        payload={"server_time": time.time()},
                    ).model_dump()
                )
                if not ok:
                    stale.append(cid)

            for cid in stale:
                await self.disconnect(cid)

            if all_ids:
                logger.debug(
                    "Heartbeat cycle | alive=%d | pruned=%d",
                    len(self._connections),
                    len(stale),
                )

    # ── Stats ─────────────────────────────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        """Return current connection stats for the /health endpoint."""
        return {
            "total_connections": len(self._connections),
            "channels": {
                ch: len(ids)
                for ch, ids in self._channel_index.items()
                if ids
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# Redis pub/sub → WebSocket bridge
# ─────────────────────────────────────────────────────────────────────────────

class RedisPubSubBridge:
    """
    Subscribes to the Redis telemetry pub/sub channel and fans every
    received message out to all subscribed WebSocket clients.

    This runs as a single long-lived asyncio background task so there is
    only one Redis subscriber connection regardless of how many dashboard
    clients are connected.

    Flow
    ----
    SimPy Worker → Redis PUBLISH "hospital:telemetry"
                        │
                        ▼
              RedisPubSubBridge.run()
                        │
                        ▼
              ConnectionManager.broadcast_to_channel("telemetry")
                        │
                 ┌──────┴──────┐
                 ▼             ▼
           Dashboard A    Dashboard B
    """

    def __init__(
        self,
        manager: ConnectionManager,
        redis_client: AsyncRedis,
        channel: str | None = None,
    ) -> None:
        self._manager = manager
        self._redis = redis_client
        self._channel = channel or settings.redis_telemetry_channel
        self._running = False
        self._pubsub = None

    async def run(self) -> None:
        """
        Main loop: subscribe to Redis channel and relay messages to WS clients.
        Reconnects automatically on Redis errors with exponential back-off.
        """
        self._running = True
        retry_delay = 1.0

        while self._running:
            try:
                self._pubsub = self._redis.pubsub()
                await self._pubsub.subscribe(self._channel)
                logger.info(
                    "RedisPubSubBridge subscribed to channel=%s", self._channel
                )
                retry_delay = 1.0   # reset back-off on successful connect

                while self._running:
                    message = await self._pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0
                    )

                    if message is None:
                        continue

                    await self._relay(message["data"])

            except Exception as exc:
                logger.error(
                    "RedisPubSubBridge error: %s — retrying in %.1fs",
                    exc, retry_delay,
                )
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30.0)   # cap at 30s

            finally:
                if self._pubsub is not None:
                    try:
                        await self._pubsub.unsubscribe(self._channel)
                        await self._pubsub.aclose()
                    except Exception:
                        pass

    async def _relay(self, raw_data: str) -> None:
        """
        Parse a raw Redis pub/sub message and broadcast to WebSocket clients.
        """
        try:
            payload = json.loads(raw_data)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("RedisPubSubBridge: unparseable message: %s", exc)
            return

        ws_message = WebSocketMessage(
            type="telemetry_update",
            payload=payload,
        ).model_dump()

        sent = await self._manager.broadcast_to_channel("telemetry", ws_message)
        logger.debug(
            "Telemetry relayed to %d WebSocket clients", sent
        )

        # If event is critical, also broadcast as an alert message
        if payload.get("global_alert") == "critical":
            alert_message = WebSocketMessage(
                type="alert",
                payload={
                    "level": "critical",
                    "message": (
                        "CRITICAL ALERT: Hospital operational state is critical. "
                        "Immediate intervention required."
                    ),
                    "total_queue": payload.get("total_queue", 0),
                    "icu_occupancy_pct": payload.get("icu_occupancy_pct", 0),
                    "er_congestion_pct": payload.get("er_congestion_pct", 0),
                },
            ).model_dump()
            await self._manager.broadcast_all(alert_message)
            logger.warning(
                "Critical alert broadcast | queue=%d | ICU=%.0f%% | ER=%.0f%%",
                payload.get("total_queue", 0),
                payload.get("icu_occupancy_pct", 0) * 100,
                payload.get("er_congestion_pct", 0) * 100,
            )

    async def stop(self) -> None:
        """Signal the bridge to stop after the next iteration."""
        self._running = False
        logger.info("RedisPubSubBridge stop signal sent.")


# ─────────────────────────────────────────────────────────────────────────────
# Singletons — created once in FastAPI lifespan, shared across all routes
# ─────────────────────────────────────────────────────────────────────────────

# Instantiated at module import; populated with Redis client in lifespan
connection_manager = ConnectionManager()
pubsub_bridge: RedisPubSubBridge | None = None


def get_connection_manager() -> ConnectionManager:
    """FastAPI dependency — returns the shared connection manager."""
    return connection_manager


def init_pubsub_bridge(redis_client: AsyncRedis) -> RedisPubSubBridge:
    """Create the pub/sub bridge. Called once in lifespan startup."""
    global pubsub_bridge
    pubsub_bridge = RedisPubSubBridge(
        manager=connection_manager,
        redis_client=redis_client,
    )
    return pubsub_bridge
