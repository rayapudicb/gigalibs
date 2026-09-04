"""Celery worker and transactional-outbox publisher."""

import asyncio
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

import structlog
import httpx
from celery import Celery
from sqlalchemy import or_, select

from config import settings
from db.session import async_session_factory
from models.entities import ExecutionOutbox
from services.run_executor import RunNotClaimed, execute_run


log = structlog.get_logger(__name__)
_worker_event_loop: asyncio.AbstractEventLoop | None = None

celery_app = Celery(
    "gigalibs_execution",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        "visibility_timeout": settings.CELERY_VISIBILITY_TIMEOUT_SECONDS,
    },
    result_expires=settings.CELERY_RESULT_EXPIRES_SECONDS,
    task_soft_time_limit=settings.EXECUTION_TASK_SOFT_TIME_LIMIT_SECONDS,
    task_time_limit=settings.EXECUTION_TASK_TIME_LIMIT_SECONDS,
    beat_schedule={
        "publish-execution-outbox": {
            "task": "gigalibs.execution.publish_outbox",
            "schedule": settings.OUTBOX_POLL_INTERVAL_SECONDS,
        }
    },
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def run_async(awaitable):
    global _worker_event_loop
    if _worker_event_loop is None or _worker_event_loop.is_closed():
        _worker_event_loop = asyncio.new_event_loop()
    return _worker_event_loop.run_until_complete(awaitable)


@celery_app.task(name="gigalibs.execution.run")
def execute_workflow_run(run_id: str):
    try:
        return run_async(execute_run(run_id))
    except RunNotClaimed:
        log.info("execution.run_not_claimed", run_id=run_id)
        return {"runId": run_id, "status": "not_claimed"}
    except Exception as exc:
        log.exception("execution.task_failed", run_id=run_id, error_class=type(exc).__name__)
        return {"runId": run_id, "status": "failed"}


@celery_app.task(name="gigalibs.execution.publish_outbox")
def publish_outbox():
    return run_async(_publish_outbox_batch())


async def _publish_outbox_batch() -> dict[str, int]:
    lease_token = uuid.uuid4()
    now = utcnow()
    lease_expiry = now + timedelta(seconds=settings.EXECUTION_LEASE_SECONDS)

    async with async_session_factory() as session, session.begin():
        records = (
            await session.scalars(
                select(ExecutionOutbox)
                .where(
                    ExecutionOutbox.available_at <= now,
                    or_(
                        ExecutionOutbox.status == "pending",
                        (
                            (ExecutionOutbox.status == "publishing")
                            & (ExecutionOutbox.lease_expires_at < now)
                        ),
                    ),
                )
                .order_by(ExecutionOutbox.created_at.asc())
                .limit(settings.OUTBOX_BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )
        ).all()
        record_ids = [record.id for record in records]
        for record in records:
            record.status = "publishing"
            record.lease_token = lease_token
            record.lease_expires_at = lease_expiry
            record.attempts += 1

    published = 0
    failed = 0
    for record_id in record_ids:
        try:
            async with async_session_factory() as session:
                record = await session.get(ExecutionOutbox, record_id)
                if record is None or record.lease_token != lease_token:
                    continue
                payload = record.payload
                event_type = record.event_type
            if not isinstance(payload, dict):
                raise ValueError("Outbox event payload is invalid")
            if event_type == "execution.command.run.v1":
                run_id = payload.get("runId")
                if not isinstance(run_id, str):
                    raise ValueError("Outbox event has an invalid run identifier")
                execute_workflow_run.apply_async(args=[run_id], task_id=f"execution-run-{run_id}")
            elif event_type == "control.audit.v1":
                await _publish_control_audit(payload)
            else:
                raise ValueError("Outbox event type is not registered")
            await _mark_outbox_published(record_id, lease_token)
            published += 1
        except Exception as exc:
            log.exception("execution.outbox_publish_failed", outbox_id=str(record_id))
            await _mark_outbox_failed(record_id, lease_token, exc)
            failed += 1

    return {"claimed": len(record_ids), "published": published, "failed": failed}


async def _publish_control_audit(payload: dict) -> None:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        settings.EXECUTION_EVENT_SIGNING_SECRET.get_secret_value().encode(),
        timestamp.encode() + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    url = f"{settings.CONTROL_PLANE_API_URL.rstrip('/')}/api/v1/internal/execution-events"
    async with httpx.AsyncClient(timeout=settings.CONTROL_PLANE_TIMEOUT_SECONDS) as client:
        response = await client.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-GigaLibs-Source": settings.EXECUTION_EVENT_SOURCE_ID,
                "X-GigaLibs-Timestamp": timestamp,
                "X-GigaLibs-Signature": f"sha256={signature}",
            },
        )
    response.raise_for_status()


async def _mark_outbox_published(record_id: uuid.UUID, lease_token: uuid.UUID) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        record = await session.scalar(
            select(ExecutionOutbox)
            .where(
                ExecutionOutbox.id == record_id,
                ExecutionOutbox.lease_token == lease_token,
                ExecutionOutbox.status == "publishing",
            )
            .with_for_update()
        )
        if record is None:
            return
        record.status = "published"
        record.published_at = now
        record.lease_token = None
        record.lease_expires_at = None
        record.last_error = None


async def _mark_outbox_failed(
    record_id: uuid.UUID,
    lease_token: uuid.UUID,
    error: Exception,
) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        record = await session.scalar(
            select(ExecutionOutbox)
            .where(
                ExecutionOutbox.id == record_id,
                ExecutionOutbox.lease_token == lease_token,
                ExecutionOutbox.status == "publishing",
            )
            .with_for_update()
        )
        if record is None:
            return
        exhausted = record.attempts >= settings.OUTBOX_MAX_ATTEMPTS
        record.status = "failed" if exhausted else "pending"
        delay = min(
            settings.OUTBOX_RETRY_MAX_SECONDS,
            settings.EXECUTION_RETRY_BASE_SECONDS * (2 ** max(0, record.attempts - 1)),
        )
        record.available_at = now + timedelta(seconds=delay)
        record.lease_token = None
        record.lease_expires_at = None
        record.last_error = f"{type(error).__name__}: outbox publication failed"[:2000]
