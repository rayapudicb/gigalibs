"""Readiness checks for execution-plane production dependencies."""

import httpx
import redis.asyncio as redis
import structlog
from sqlalchemy import text

from config import settings
from db.session import engine

log = structlog.get_logger(__name__)


async def check_control_plane() -> None:
    """Verify the authoritative control plane is reachable and database-ready."""
    readiness_url = f"{settings.CONTROL_PLANE_API_URL.rstrip('/')}/api/v1/ready"
    async with httpx.AsyncClient(timeout=settings.CONTROL_PLANE_TIMEOUT_SECONDS) as client:
        response = await client.get(readiness_url)
    if response.status_code != 200:
        raise RuntimeError(
            f"Control-plane readiness check failed with HTTP {response.status_code}"
        )
    payload = response.json()
    if payload.get("status") != "ready" or payload.get("database") != "connected":
        raise RuntimeError("Control plane did not report a ready database")
    log.debug("execution.control_plane.check_passed")


async def check_execution_database() -> None:
    """Verify execution persistence and required durable tables."""
    async with engine.connect() as connection:
        result = await connection.execute(
            text(
                "SELECT to_regclass('public.execution_runs'), "
                "to_regclass('public.execution_steps'), "
                "to_regclass('public.side_effect_checkpoints'), "
                "to_regclass('public.execution_outbox')"
            )
        )
        tables = result.one()
    if any(table is None for table in tables):
        raise RuntimeError("Execution database is missing required durable tables")
    log.debug("execution.database.check_passed")


async def check_execution_queue() -> None:
    """Verify Celery's Redis broker is reachable."""
    client = redis.from_url(settings.CELERY_BROKER_URL)
    try:
        if not await client.ping():
            raise RuntimeError("Execution queue did not respond to PING")
    finally:
        await client.aclose()
    log.debug("execution.queue.check_passed")
