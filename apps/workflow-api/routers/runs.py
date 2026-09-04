"""Tenant-scoped durable workflow run API."""

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from config import settings
from db.session import async_session_factory
from models.entities import ExecutionOutbox, ExecutionRun, ExecutionStep
from services.control_plane import ControlPlaneError, fetch_execution_spec
from services.audit_outbox import enqueue_execution_audit
from services.payload_crypto import encrypt_json


router = APIRouter(prefix="/runs", tags=["runs"])
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
RUN_STATUSES = Literal[
    "queued", "running", "succeeded", "failed", "cancelled", "action_required"
]


class StartRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    workflow_id: str = Field(alias="workflowId", min_length=1, max_length=128)
    trigger_type: Literal["manual", "api", "webhook", "schedule"] = Field(alias="triggerType")
    input_payload: dict[str, Any] = Field(alias="inputPayload")


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workflow_id: str
    workflow_version: int
    status: RUN_STATUSES
    trigger_type: str
    correlation_id: str
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_class: str | None
    error_summary: str | None


class StepSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    node_id: str
    node_type: str
    attempt: int
    status: Literal["pending", "running", "succeeded", "failed", "skipped", "dlq"]
    input_hash: str
    output_hash: str | None
    error_class: str | None
    error_detail: str | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None


class RunDetail(RunSummary):
    workflow_checksum: str
    workflow_schema_version: str
    workflow_compiler_version: str
    cancellation_requested: bool
    steps: list[StepSummary]


class RunList(BaseModel):
    items: list[RunSummary]
    total: int
    limit: int
    offset: int


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def require_permission(request: Request, permission: str) -> None:
    permissions = request.state.permissions
    for granted in permissions:
        if granted in {"*", "all", permission}:
            return
        granted_parts = granted.split(":")
        required_parts = permission.split(":")
        if len(granted_parts) >= 2 and len(required_parts) >= 2:
            if granted_parts[0] in {"*", required_parts[0]} and granted_parts[1] in {
                "*",
                required_parts[1],
            }:
                return
    raise HTTPException(status_code=403, detail="Insufficient permission for this operation.")


def validate_idempotency_key(value: str) -> str:
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(value):
        raise HTTPException(
            status_code=422,
            detail="Idempotency-Key must be 8-128 URL-safe characters.",
        )
    return value


@router.post("", response_model=RunSummary, status_code=202)
async def start_run(
    body: StartRunRequest,
    request: Request,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key"),
):
    require_permission(request, "workflows:execute")
    idempotency_key = validate_idempotency_key(idempotency_key)
    try:
        spec = await fetch_execution_spec(body.workflow_id, request.state.auth_header)
    except ControlPlaneError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if spec.tenant_id != request.state.tenant_id or spec.workflow_id != body.workflow_id:
        raise HTTPException(status_code=403, detail="Execution specification tenant mismatch.")

    try:
        Draft202012Validator.check_schema(spec.input_schema)
        Draft202012Validator(spec.input_schema).validate(body.input_payload)
        Draft202012Validator.check_schema(spec.output_schema)
    except SchemaError as exc:
        raise HTTPException(status_code=503, detail="Published workflow schema is invalid.") from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Input payload: {exc.message}") from exc

    run_id = uuid.uuid4()
    outbox_id = uuid.uuid4()
    correlation_id = str(uuid.uuid4())
    now = utcnow()
    run_values = {
        "id": run_id,
        "tenant_id": request.state.tenant_id,
        "workflow_id": spec.workflow_id,
        "workflow_version": spec.version,
        "workflow_checksum": spec.checksum,
        "workflow_schema_version": spec.schema_version,
        "workflow_compiler_version": spec.compiler_version,
        "initiated_by": request.state.member_id,
        "idempotency_key": idempotency_key,
        "correlation_id": correlation_id,
        "trigger_type": body.trigger_type,
        "status": "queued",
        "graph_snapshot": spec.definition,
        "input_schema": spec.input_schema,
        "output_schema": spec.output_schema,
        "input_ciphertext": encrypt_json(
            body.input_payload,
            associated_data=f"run:{run_id}:input",
        ),
        "payload_key_version": settings.EXECUTION_PAYLOAD_KEY_VERSION,
        "cancellation_requested": False,
        "revision": 0,
        "queued_at": now,
        "created_at": now,
        "updated_at": now,
    }

    async with async_session_factory() as session, session.begin():
        inserted_id = await session.scalar(
            insert(ExecutionRun)
            .values(**run_values)
            .on_conflict_do_nothing(constraint="uq_execution_run_idempotency")
            .returning(ExecutionRun.id)
        )
        if inserted_id is None:
            existing = await session.scalar(
                select(ExecutionRun).where(
                    ExecutionRun.tenant_id == request.state.tenant_id,
                    ExecutionRun.idempotency_key == idempotency_key,
                )
            )
            if existing is None:
                raise HTTPException(status_code=409, detail="Run idempotency conflict.")
            if existing.workflow_id != spec.workflow_id:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key is already bound to a different workflow command.",
                )
            response.status_code = 200
            return RunSummary.model_validate(existing)

        session.add(
            ExecutionOutbox(
                id=outbox_id,
                run_id=run_id,
                event_type="execution.command.run.v1",
                payload={"runId": str(run_id)},
                status="pending",
                attempts=0,
                available_at=now,
                created_at=now,
            )
        )
        enqueue_execution_audit(
            session,
            event_type="execution.run.requested.v1",
            tenant_id=request.state.tenant_id,
            run_id=run_id,
            workflow_id=spec.workflow_id,
            correlation_id=correlation_id,
            actor_id=request.state.member_id,
            occurred_at=now,
            evidence={
                "status": "queued",
                "triggerType": body.trigger_type,
                "workflowVersion": spec.version,
                "workflowChecksum": spec.checksum,
            },
        )

    async with async_session_factory() as session:
        created = await session.get(ExecutionRun, run_id)
        if created is None:
            raise HTTPException(status_code=503, detail="Run persistence verification failed.")
        return RunSummary.model_validate(created)


@router.get("", response_model=RunList)
async def list_runs(
    request: Request,
    workflow_id: str | None = Query(default=None, alias="workflowId", max_length=128),
    status: RUN_STATUSES | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    require_permission(request, "workflows:read")
    filters = [ExecutionRun.tenant_id == request.state.tenant_id]
    if workflow_id is not None:
        filters.append(ExecutionRun.workflow_id == workflow_id)
    if status is not None:
        filters.append(ExecutionRun.status == status)

    async with async_session_factory() as session:
        total = int(
            await session.scalar(select(func.count()).select_from(ExecutionRun).where(*filters))
            or 0
        )
        runs = (
            await session.scalars(
                select(ExecutionRun)
                .where(*filters)
                .order_by(ExecutionRun.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    return RunList(
        items=[RunSummary.model_validate(run) for run in runs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: uuid.UUID, request: Request):
    require_permission(request, "workflows:read")
    async with async_session_factory() as session:
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.tenant_id == request.state.tenant_id,
            )
        )
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        steps = (
            await session.scalars(
                select(ExecutionStep)
                .where(
                    ExecutionStep.run_id == run_id,
                    ExecutionStep.tenant_id == request.state.tenant_id,
                )
                .order_by(ExecutionStep.created_at.asc())
            )
        ).all()

    return RunDetail(
        **RunSummary.model_validate(run).model_dump(),
        workflow_checksum=run.workflow_checksum,
        workflow_schema_version=run.workflow_schema_version,
        workflow_compiler_version=run.workflow_compiler_version,
        cancellation_requested=run.cancellation_requested,
        steps=[StepSummary.model_validate(step) for step in steps],
    )


@router.post("/{run_id}/cancel", response_model=RunSummary, status_code=202)
async def cancel_run(run_id: uuid.UUID, request: Request, response: Response):
    require_permission(request, "workflows:execute")
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.tenant_id == request.state.tenant_id,
            ).with_for_update()
        )
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if run.status in {"succeeded", "failed", "cancelled", "action_required"}:
            response.status_code = 200
            return RunSummary.model_validate(run)
        if run.status == "queued":
            run.status = "cancelled"
            run.completed_at = now
            enqueue_execution_audit(
                session,
                event_type="execution.run.cancelled.v1",
                tenant_id=run.tenant_id,
                run_id=run.id,
                workflow_id=run.workflow_id,
                correlation_id=run.correlation_id,
                actor_id=request.state.member_id,
                occurred_at=now,
                evidence={"status": "cancelled", "phase": "queued"},
            )
        else:
            run.cancellation_requested = True
        run.updated_at = now
        run.revision += 1
        await session.flush()
        return RunSummary.model_validate(run)
