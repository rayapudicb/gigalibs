"""Execution-plane persistence models.

Control-plane identifiers are opaque strings. This database deliberately owns no
users, tenants, memberships, credentials, or workflow definitions.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionRun(Base):
    __tablename__ = "execution_runs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_execution_run_idempotency"),
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','cancelled','action_required')",
            name="ck_execution_run_status",
        ),
        Index("ix_execution_runs_lease", "status", "lease_expires_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(128), nullable=False)
    workflow_id = Column(String(128), nullable=False)
    workflow_version = Column(Integer, nullable=False)
    workflow_checksum = Column(String(64), nullable=False)
    workflow_schema_version = Column(String(64), nullable=False)
    workflow_compiler_version = Column(String(64), nullable=False)
    initiated_by = Column(String(128), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    correlation_id = Column(String(128), nullable=False, unique=True)
    trigger_type = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="queued")

    graph_snapshot = Column(JSONB, nullable=False)
    input_schema = Column(JSONB, nullable=False)
    output_schema = Column(JSONB, nullable=False)
    input_ciphertext = Column(LargeBinary, nullable=False)
    result_ciphertext = Column(LargeBinary, nullable=True)
    payload_key_version = Column(String(128), nullable=False)

    cancellation_requested = Column(Boolean, nullable=False, default=False)
    lease_token = Column(UUID(as_uuid=True), nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)
    error_class = Column(String(128), nullable=True)
    error_summary = Column(Text, nullable=True)
    revision = Column(Integer, nullable=False, default=0)

    queued_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


Index(
    "ix_execution_runs_tenant_created",
    ExecutionRun.tenant_id,
    ExecutionRun.created_at.desc(),
)
Index(
    "ix_execution_runs_workflow_created",
    ExecutionRun.workflow_id,
    ExecutionRun.created_at.desc(),
)


class ExecutionStep(Base):
    __tablename__ = "execution_steps"
    __table_args__ = (
        UniqueConstraint("run_id", "node_id", "attempt", name="uq_execution_step_attempt"),
        CheckConstraint(
            "status IN ('pending','running','succeeded','failed','skipped','dlq')",
            name="ck_execution_step_status",
        ),
        Index("ix_execution_steps_run", "run_id", "created_at"),
        Index("ix_execution_steps_tenant_status", "tenant_id", "status"),
        Index("ix_execution_steps_lease", "status", "lease_expires_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("execution_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id = Column(String(128), nullable=False)
    node_id = Column(String(128), nullable=False)
    node_type = Column(String(128), nullable=False)
    attempt = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False, default="pending")

    input_hash = Column(String(64), nullable=False)
    output_hash = Column(String(64), nullable=True)
    output_ciphertext = Column(LargeBinary, nullable=True)
    payload_key_version = Column(String(128), nullable=False)
    idempotency_key = Column(String(128), nullable=False)

    lease_token = Column(UUID(as_uuid=True), nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)
    error_class = Column(String(128), nullable=True)
    error_detail = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class SideEffectCheckpoint(Base):
    __tablename__ = "side_effect_checkpoints"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_side_effect_checkpoint"),
        Index("ix_side_effect_checkpoints_run", "run_id", "node_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(128), nullable=False)
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("execution_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_id = Column(String(128), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    output_hash = Column(String(64), nullable=False)
    output_ciphertext = Column(LargeBinary, nullable=False)
    payload_key_version = Column(String(128), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class ExecutionOutbox(Base):
    __tablename__ = "execution_outbox"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','publishing','published','failed')",
            name="ck_execution_outbox_status",
        ),
        Index("ix_execution_outbox_pending", "status", "available_at", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("execution_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type = Column(String(128), nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    lease_token = Column(UUID(as_uuid=True), nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    published_at = Column(DateTime(timezone=True), nullable=True)
