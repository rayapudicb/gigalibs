"""
Enterprise Audit Trail Service (gigalibs.audit integration).
Implements append-only event creation with tamper-evident cryptographic hash chaining (prev_hash -> event_hash).
"""

import hashlib
import json
import uuid
from typing import Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from ..models.entities import AuditEvent

log = structlog.get_logger(__name__)


class AuditService:
    @staticmethod
    def _compute_hash(data: dict[str, Any], prev_hash: str | None) -> str:
        """Computes deterministic SHA-256 hash over canonical JSON payload and prev_hash."""
        canonical_payload = json.dumps(data, sort_keys=True, separators=(",", ":"))
        seed = f"{prev_hash or 'GENESIS'}:{canonical_payload}"
        return hashlib.sha256(seed.encode("utf-8")).hexdigest()

    @classmethod
    async def emit(
        cls,
        session: AsyncSession,
        org_id: str,
        action: str,
        actor_id: str | None = None,
        actor_email: str | None = None,
        actor_type: str = "member",
        resource_type: str | None = None,
        resource_id: str | None = None,
        result: str = "success",
        ip_address: str | None = None,
        user_agent: str | None = None,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditEvent:
        """Emits and commits an immutable, hash-chained audit event."""
        # Find latest event hash for this org to link the chain
        query = (
            select(AuditEvent.event_hash)
            .where(AuditEvent.org_id == org_id)
            .order_by(desc(AuditEvent.occurred_at))
            .limit(1)
        )
        res = await session.execute(query)
        prev_hash = res.scalar_one_or_none()

        meta = metadata or {}
        hash_payload = {
            "org_id": org_id,
            "action": action,
            "actor_id": actor_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "result": result,
            "correlation_id": correlation_id,
            "metadata": meta,
        }
        event_hash = cls._compute_hash(hash_payload, prev_hash)

        event = AuditEvent(
            id=str(uuid.uuid4()),
            org_id=org_id,
            actor_id=actor_id,
            actor_email=actor_email,
            actor_type=actor_type,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            result=result,
            ip_address=ip_address,
            user_agent=user_agent,
            correlation_id=correlation_id,
            metadata_json=meta,
            prev_hash=prev_hash,
            event_hash=event_hash,
        )
        session.add(event)
        await session.flush()

        log.info(
            "audit.event_emitted",
            action=action,
            org_id=org_id,
            actor=actor_email or actor_id,
            event_hash=event_hash[:16],
        )
        return event
