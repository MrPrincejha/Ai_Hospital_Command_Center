# backend/app/core/redis_client.py
"""
AI Hospital Command Center — Redis Client & Utilities
======================================================
Central Redis connection management for the entire backend.

Provides:
  - Async Redis client  (aioredis via redis-py async)  for FastAPI routes
  - Sync Redis client   (redis-py)                     for Celery workers
  - Typed get/set helpers with JSON serialisation
  - Pub/Sub subscription helpers
  - Connection health-check

All Redis keys and channels are sourced from Settings so there is a
single canonical definition across the whole codebase.

Usage
-----
    # In FastAPI startup lifespan
    from app.core.redis_client import init_redis_pool, close_redis_pool

    # In routes / services
    from app.core.redis_client import get_redis_async, set_json, get_json

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
from typing import Any

import redis
import redis.asyncio as aioredis
from redis.asyncio import Redis as AsyncRedis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Module-level pool references ───────────────────────────────────────────────
_async_pool: AsyncRedis | None = None
_sync_client: redis.Redis | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Async client lifecycle (called from FastAPI lifespan)
# ─────────────────────────────────────────────────────────────────────────────

async def init_redis_pool() -> None:
    """
    Initialise the async Redis connection pool.
    Must be called once at application startup (inside lifespan context).
    """
    global _async_pool
    try:
        _async_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=None,
            socket_connect_timeout=10,
            health_check_interval=30,
            max_connections=50,
        )
        await _async_pool.ping()
        logger.info("Async Redis pool initialised → %s", settings.redis_url)
    except RedisError as exc:
        logger.error("Failed to initialise async Redis pool: %s", exc)
        raise


async def close_redis_pool() -> None:
    """
    Gracefully close the async Redis connection pool.
    Call this in the FastAPI lifespan shutdown hook.
    """
    global _async_pool
    if _async_pool is not None:
        await _async_pool.aclose()
        _async_pool = None
        logger.info("Async Redis pool closed.")


def get_redis_async() -> AsyncRedis:
    """
    Return the shared async Redis client.

    Raises
    ------
    RuntimeError
        If the pool was not initialised via `init_redis_pool()`.
    """
    if _async_pool is None:
        raise RuntimeError(
            "Async Redis pool is not initialised. "
            "Call `await init_redis_pool()` in your lifespan handler."
        )
    return _async_pool


# ─────────────────────────────────────────────────────────────────────────────
# Sync client (Celery workers / background tasks)
# ─────────────────────────────────────────────────────────────────────────────

def get_redis_sync() -> redis.Redis:
    """
    Return a lazily-initialised synchronous Redis client.
    Thread-safe (redis-py uses a connection pool internally).
    """
    global _sync_client
    if _sync_client is None:
        _sync_client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=settings.redis_socket_timeout,
            socket_connect_timeout=settings.redis_socket_timeout,
        )
        logger.info("Sync Redis client initialised → %s", settings.redis_url)
    return _sync_client


# ─────────────────────────────────────────────────────────────────────────────
# Typed helpers — async
# ─────────────────────────────────────────────────────────────────────────────

async def set_json(
    key: str,
    value: Any,
    ttl: int | None = None,
    client: AsyncRedis | None = None,
) -> None:
    """
    Serialise `value` to JSON and store at `key`.

    Parameters
    ----------
    key : str
        Redis key.
    value : Any
        JSON-serialisable Python object.
    ttl : int | None
        Optional TTL in seconds.  None = no expiry.
    client : AsyncRedis | None
        Use provided client or fall back to shared pool.
    """
    r = client or get_redis_async()
    payload = json.dumps(value, default=str)
    try:
        if ttl is not None:
            await r.setex(key, ttl, payload)
        else:
            await r.set(key, payload)
        logger.debug("Redis SET %s (ttl=%s)", key, ttl)
    except RedisError as exc:
        logger.error("Redis SET failed for key=%s: %s", key, exc)
        raise


async def get_json(
    key: str,
    client: AsyncRedis | None = None,
) -> Any | None:
    """
    Retrieve a JSON value from Redis.

    Returns
    -------
    Deserialised Python object, or None if the key does not exist.
    """
    r = client or get_redis_async()
    try:
        raw = await r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except (RedisError, json.JSONDecodeError) as exc:
        logger.error("Redis GET failed for key=%s: %s", key, exc)
        return None


async def delete_key(
    key: str,
    client: AsyncRedis | None = None,
) -> int:
    """Delete a key. Returns number of keys deleted (0 or 1)."""
    r = client or get_redis_async()
    try:
        return await r.delete(key)
    except RedisError as exc:
        logger.error("Redis DELETE failed for key=%s: %s", key, exc)
        return 0


async def publish(
    channel: str,
    payload: Any,
    client: AsyncRedis | None = None,
) -> int:
    """
    Publish a message to a Redis pub/sub channel.

    Parameters
    ----------
    payload : Any
        Will be JSON-serialised before publishing.

    Returns
    -------
    int
        Number of subscribers that received the message.
    """
    r = client or get_redis_async()
    message = json.dumps(payload, default=str)
    try:
        result = await r.publish(channel, message)
        logger.debug("Redis PUBLISH → channel=%s receivers=%d", channel, result)
        return result
    except RedisError as exc:
        logger.error("Redis PUBLISH failed: channel=%s error=%s", channel, exc)
        raise


async def health_check(client: AsyncRedis | None = None) -> bool:
    """
    Ping Redis and return True if healthy.
    """
    r = client or get_redis_async()
    try:
        return await r.ping()
    except RedisError:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Typed helpers — sync (for Celery workers)
# ─────────────────────────────────────────────────────────────────────────────

def sync_set_json(key: str, value: Any, ttl: int | None = None) -> None:
    """Synchronous JSON set — for use in Celery tasks."""
    r = get_redis_sync()
    payload = json.dumps(value, default=str)
    try:
        if ttl is not None:
            r.setex(key, ttl, payload)
        else:
            r.set(key, payload)
        logger.debug("Sync Redis SET %s (ttl=%s)", key, ttl)
    except RedisError as exc:
        logger.error("Sync Redis SET failed key=%s: %s", key, exc)
        raise


def sync_get_json(key: str) -> Any | None:
    """Synchronous JSON get — for use in Celery tasks."""
    r = get_redis_sync()
    try:
        raw = r.get(key)
        return json.loads(raw) if raw else None
    except (RedisError, json.JSONDecodeError) as exc:
        logger.error("Sync Redis GET failed key=%s: %s", key, exc)
        return None


def sync_publish(channel: str, payload: Any) -> int:
    """Synchronous publish — for use in Celery tasks."""
    r = get_redis_sync()
    message = json.dumps(payload, default=str)
    try:
        result = r.publish(channel, message)
        logger.debug("Sync PUBLISH → %s (%d receivers)", channel, result)
        return result
    except RedisError as exc:
        logger.error("Sync PUBLISH failed channel=%s: %s", channel, exc)
        raise
