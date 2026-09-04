"""Transactional delivery of execution evidence to the authoritative audit plane."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from models.entities import ExecutionOutbox


def enqueue_execution_audit(
    session: AsyncSession,
    *,
    event_type: str,
    tenant_id: str,
    run_id: uuid.UUID,
    workflow_id: str,
    correlation_id: str,
    actor_id: str | None,
    occurred_at: datetime,
    evidence: dict[str, Any],
) -> uuid.UUID:
    event_id = uuid.uuid4()
    session.add(
        ExecutionOutbox(
            id=event_id,
            run_id=run_id,
            event_type="control.audit.v1",
            payload={
                "eventId": str(event_id),
                "eventType": event_type,
                "tenantId": tenant_id,
                "runId": str(run_id),
                "workflowId": workflow_id,
                "correlationId": correlation_id,
                "actorId": actor_id,
                "occurredAt": occurred_at.isoformat(),
                "evidence": evidence,
            },
            status="pending",
            attempts=0,
            available_at=occurred_at,
            created_at=occurred_at,
        )
    )
    return event_id
