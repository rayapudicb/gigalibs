"""Lease-based, restartable workflow execution backed by PostgreSQL checkpoints."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from jsonschema import Draft202012Validator
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from config import settings
from db.session import async_session_factory
from models.entities import (
    ExecutionRun,
    ExecutionStep,
    SideEffectCheckpoint,
)
from services.node_handlers import NodeHandlerError, execute_node, is_side_effect_node
from services.audit_outbox import enqueue_execution_audit
from services.payload_crypto import decrypt_json, encrypt_json, payload_hash


log = structlog.get_logger(__name__)
TERMINAL_RUN_STATUSES = {"succeeded", "failed", "cancelled", "action_required"}


class RunNotClaimed(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def execution_stages(graph: dict[str, Any]) -> list[list[str]]:
    raw_nodes = graph.get("nodes")
    raw_edges = graph.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list) or not raw_nodes:
        raise ValueError("Workflow graph is invalid")

    nodes = {node.get("id"): node for node in raw_nodes if isinstance(node, dict)}
    if len(nodes) != len(raw_nodes) or None in nodes:
        raise ValueError("Workflow graph contains invalid or duplicate nodes")
    incoming = {node_id: 0 for node_id in nodes}
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for edge in raw_edges:
        if not isinstance(edge, dict):
            raise ValueError("Workflow graph contains an invalid edge")
        source = edge.get("source")
        target = edge.get("target")
        if source not in nodes or target not in nodes:
            raise ValueError("Workflow edge references an unknown node")
        incoming[target] += 1
        outgoing[source].append(target)

    roots = [node_id for node_id, count in incoming.items() if count == 0]
    if len(roots) != 1:
        raise ValueError("Workflow must have exactly one root node")

    current = roots
    stages: list[list[str]] = []
    visited = 0
    while current:
        stages.append(current)
        visited += len(current)
        following: list[str] = []
        for node_id in current:
            for target in outgoing[node_id]:
                incoming[target] -= 1
                if incoming[target] == 0:
                    following.append(target)
        current = following
    if visited != len(nodes):
        raise ValueError("Workflow graph contains a cycle or unreachable node")
    return stages


async def execute_run(run_id: str) -> dict[str, Any]:
    lease_token = uuid.uuid4()
    run = await _claim_run(run_id, lease_token)
    if run is None:
        raise RunNotClaimed(f"Run {run_id} is terminal or has an active lease")

    try:
        graph = run.graph_snapshot
        stages = execution_stages(graph)
        nodes = {node["id"]: node for node in graph["nodes"]}
        predecessors = {
            node_id: [edge["source"] for edge in graph["edges"] if edge["target"] == node_id]
            for node_id in nodes
        }
        trigger = decrypt_json(
            run.input_ciphertext,
            associated_data=f"run:{run.id}:input",
        )
        context = await _restore_context(run)

        for stage in stages:
            for node_id in stage:
                if node_id in context:
                    continue
                if await _cancel_if_requested(run.id, lease_token):
                    return {"runId": str(run.id), "status": "cancelled"}
                await _renew_lease(run.id, lease_token)
                node_input = _resolve_input(node_id, predecessors, context, trigger)
                output = await _execute_node_with_retries(
                    run,
                    nodes[node_id],
                    node_input,
                    lease_token,
                )
                context[node_id] = output

        leaves = _leaf_nodes(nodes, graph["edges"])
        result = context[leaves[0]] if len(leaves) == 1 else {node_id: context[node_id] for node_id in leaves}
        Draft202012Validator(run.output_schema).validate(result)
        await _complete_run(run.id, lease_token, result)
        return {"runId": str(run.id), "status": "succeeded"}
    except NodeHandlerError as exc:
        await _fail_run(run.id, lease_token, "action_required", type(exc).__name__, str(exc))
        return {"runId": str(run.id), "status": "action_required"}
    except Exception as exc:
        log.exception("execution.run_failed", run_id=run_id, error_class=type(exc).__name__)
        await _fail_run(
            run.id,
            lease_token,
            "failed",
            type(exc).__name__,
            "Workflow execution failed. Inspect the node timeline for safe diagnostic details.",
        )
        raise


async def _claim_run(run_id: str, lease_token: uuid.UUID) -> ExecutionRun | None:
    try:
        parsed_run_id = uuid.UUID(run_id)
    except ValueError as exc:
        raise RunNotClaimed("Run identifier is invalid") from exc

    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(ExecutionRun.id == parsed_run_id).with_for_update()
        )
        if run is None or run.status in TERMINAL_RUN_STATUSES:
            return None
        if run.status == "running" and run.lease_expires_at and run.lease_expires_at > now:
            return None
        if run.cancellation_requested:
            run.status = "cancelled"
            run.completed_at = now
            run.lease_token = None
            run.lease_expires_at = None
            run.updated_at = now
            run.revision += 1
            enqueue_execution_audit(
                session,
                event_type="execution.run.cancelled.v1",
                tenant_id=run.tenant_id,
                run_id=run.id,
                workflow_id=run.workflow_id,
                correlation_id=run.correlation_id,
                actor_id=run.initiated_by,
                occurred_at=now,
                evidence={"status": "cancelled", "phase": "lease-recovery"},
            )
            return None

        stale_steps = (
            await session.scalars(
                select(ExecutionStep).where(
                    ExecutionStep.run_id == parsed_run_id,
                    ExecutionStep.status == "running",
                    ExecutionStep.lease_expires_at <= now,
                ).with_for_update()
            )
        ).all()
        for step in stale_steps:
            step.status = "dlq" if step.attempt >= settings.EXECUTION_MAX_ATTEMPTS else "failed"
            step.error_class = "WorkerLeaseExpired"
            step.error_detail = "The worker lease expired before the node attempt completed."
            step.completed_at = now
            step.duration_ms = (
                max(0, int((now - step.started_at).total_seconds() * 1000))
                if step.started_at is not None
                else None
            )
            step.lease_token = None
            step.lease_expires_at = None
            enqueue_execution_audit(
                session,
                event_type="execution.step.failed.v1",
                tenant_id=run.tenant_id,
                run_id=run.id,
                workflow_id=run.workflow_id,
                correlation_id=run.correlation_id,
                actor_id=run.initiated_by,
                occurred_at=now,
                evidence={
                    "nodeId": step.node_id,
                    "nodeType": step.node_type,
                    "attempt": step.attempt,
                    "status": step.status,
                    "errorClass": "WorkerLeaseExpired",
                },
            )

        was_started = run.started_at is not None
        run.status = "running"
        run.lease_token = lease_token
        run.lease_expires_at = now + timedelta(seconds=settings.EXECUTION_LEASE_SECONDS)
        run.started_at = run.started_at or now
        run.updated_at = now
        run.revision += 1
        enqueue_execution_audit(
            session,
            event_type="execution.run.resumed.v1" if was_started else "execution.run.started.v1",
            tenant_id=run.tenant_id,
            run_id=run.id,
            workflow_id=run.workflow_id,
            correlation_id=run.correlation_id,
            actor_id=run.initiated_by,
            occurred_at=now,
            evidence={
                "status": "running",
                "workflowVersion": run.workflow_version,
                "recoveredAttempts": len(stale_steps),
            },
        )
        await session.flush()
        session.expunge(run)
        return run


async def _restore_context(run: ExecutionRun) -> dict[str, Any]:
    async with async_session_factory() as session:
        steps = (
            await session.scalars(
                select(ExecutionStep)
                .where(ExecutionStep.run_id == run.id, ExecutionStep.status == "succeeded")
                .order_by(ExecutionStep.created_at.asc())
            )
        ).all()
    context: dict[str, Any] = {}
    for step in steps:
        if step.output_ciphertext is None:
            continue
        context[step.node_id] = decrypt_json(
            step.output_ciphertext,
            associated_data=f"run:{run.id}:node:{step.node_id}:output",
        )
    return context


def _resolve_input(
    node_id: str,
    predecessors: dict[str, list[str]],
    context: dict[str, Any],
    trigger: Any,
) -> Any:
    sources = predecessors[node_id]
    if not sources:
        return trigger
    if len(sources) == 1:
        return context[sources[0]]
    return {source: context[source] for source in sources}


async def _execute_node_with_retries(
    run: ExecutionRun,
    node: dict[str, Any],
    node_input: Any,
    run_lease_token: uuid.UUID,
) -> Any:
    node_id = str(node["id"])
    node_type = str(node["type"])
    idempotency_key = payload_hash(
        {
            "tenantId": run.tenant_id,
            "workflowId": run.workflow_id,
            "workflowVersion": run.workflow_version,
            "nodeId": node_id,
            "input": node_input,
        }
    )

    if is_side_effect_node(node_type):
        checkpoint = await _get_checkpoint(run.tenant_id, idempotency_key)
        if checkpoint is not None:
            output = decrypt_json(
                checkpoint.output_ciphertext,
                associated_data=f"checkpoint:{run.tenant_id}:{idempotency_key}",
            )
            await _record_checkpoint_replay(run, node, node_input, output, idempotency_key)
            return output

    prior_attempts = await _attempt_count(run.id, node_id)
    last_error: NodeHandlerError | None = None
    for attempt in range(prior_attempts + 1, settings.EXECUTION_MAX_ATTEMPTS + 1):
        step_id = uuid.uuid4()
        step_lease_token = uuid.uuid4()
        started = utcnow()
        await _start_step(
            step_id,
            run,
            node_id,
            node_type,
            attempt,
            node_input,
            idempotency_key,
            step_lease_token,
        )
        try:
            handler_result = await execute_node(
                node,
                node_input,
                idempotency_key=idempotency_key,
            )
            await _succeed_step(
                step_id,
                step_lease_token,
                run,
                node_id,
                handler_result.output,
                idempotency_key,
                handler_result.is_side_effect,
                started,
            )
            return handler_result.output
        except NodeHandlerError as exc:
            last_error = exc
            exhausted = attempt >= settings.EXECUTION_MAX_ATTEMPTS
            await _fail_step(
                step_id,
                step_lease_token,
                run,
                "dlq" if exhausted or not exc.retryable else "failed",
                type(exc).__name__,
                str(exc),
                started,
            )
            if not exc.retryable or exhausted:
                raise
            await _renew_lease(run.id, run_lease_token)
            await asyncio.sleep(settings.EXECUTION_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))

    if last_error is not None:
        raise last_error
    raise NodeHandlerError("Node exhausted its configured attempts.", retryable=False)


async def _attempt_count(run_id: uuid.UUID, node_id: str) -> int:
    async with async_session_factory() as session:
        return int(
            await session.scalar(
                select(func.count()).select_from(ExecutionStep).where(
                    ExecutionStep.run_id == run_id,
                    ExecutionStep.node_id == node_id,
                )
            )
            or 0
        )


async def _start_step(
    step_id: uuid.UUID,
    run: ExecutionRun,
    node_id: str,
    node_type: str,
    attempt: int,
    node_input: Any,
    idempotency_key: str,
    lease_token: uuid.UUID,
) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        session.add(
            ExecutionStep(
                id=step_id,
                run_id=run.id,
                tenant_id=run.tenant_id,
                node_id=node_id,
                node_type=node_type,
                attempt=attempt,
                status="running",
                input_hash=payload_hash(node_input),
                payload_key_version=settings.EXECUTION_PAYLOAD_KEY_VERSION,
                idempotency_key=idempotency_key,
                lease_token=lease_token,
                lease_expires_at=now + timedelta(seconds=settings.EXECUTION_LEASE_SECONDS),
                started_at=now,
                created_at=now,
            )
        )


async def _succeed_step(
    step_id: uuid.UUID,
    step_lease_token: uuid.UUID,
    run: ExecutionRun,
    node_id: str,
    output: Any,
    idempotency_key: str,
    is_side_effect: bool,
    started: datetime,
) -> None:
    now = utcnow()
    encrypted = encrypt_json(
        output,
        associated_data=f"run:{run.id}:node:{node_id}:output",
    )
    output_digest = payload_hash(output)
    async with async_session_factory() as session, session.begin():
        step = await session.scalar(
            select(ExecutionStep).where(
                ExecutionStep.id == step_id,
                ExecutionStep.lease_token == step_lease_token,
                ExecutionStep.status == "running",
            ).with_for_update()
        )
        if step is None:
            raise RunNotClaimed("Node execution lease was lost")
        step.status = "succeeded"
        step.output_hash = output_digest
        step.output_ciphertext = encrypted
        step.completed_at = now
        step.duration_ms = max(0, int((now - started).total_seconds() * 1000))
        step.lease_token = None
        step.lease_expires_at = None

        if is_side_effect:
            checkpoint_ciphertext = encrypt_json(
                output,
                associated_data=f"checkpoint:{run.tenant_id}:{idempotency_key}",
            )
            statement = insert(SideEffectCheckpoint).values(
                id=uuid.uuid4(),
                tenant_id=run.tenant_id,
                run_id=run.id,
                node_id=node_id,
                idempotency_key=idempotency_key,
                output_hash=output_digest,
                output_ciphertext=checkpoint_ciphertext,
                payload_key_version=settings.EXECUTION_PAYLOAD_KEY_VERSION,
                created_at=now,
            ).on_conflict_do_nothing(constraint="uq_side_effect_checkpoint")
            await session.execute(statement)
            enqueue_execution_audit(
                session,
                event_type="execution.action.succeeded.v1",
                tenant_id=run.tenant_id,
                run_id=run.id,
                workflow_id=run.workflow_id,
                correlation_id=run.correlation_id,
                actor_id=run.initiated_by,
                occurred_at=now,
                evidence={
                    "nodeId": node_id,
                    "attempt": step.attempt,
                    "inputHash": step.input_hash,
                    "outputHash": output_digest,
                    "idempotencyKey": idempotency_key,
                },
            )


async def _record_checkpoint_replay(
    run: ExecutionRun,
    node: dict[str, Any],
    node_input: Any,
    output: Any,
    idempotency_key: str,
) -> None:
    attempt = await _attempt_count(run.id, str(node["id"])) + 1
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        session.add(
            ExecutionStep(
                id=uuid.uuid4(),
                run_id=run.id,
                tenant_id=run.tenant_id,
                node_id=str(node["id"]),
                node_type=str(node["type"]),
                attempt=attempt,
                status="succeeded",
                input_hash=payload_hash(node_input),
                output_hash=payload_hash(output),
                output_ciphertext=encrypt_json(
                    output,
                    associated_data=f"run:{run.id}:node:{node['id']}:output",
                ),
                payload_key_version=settings.EXECUTION_PAYLOAD_KEY_VERSION,
                idempotency_key=idempotency_key,
                started_at=now,
                completed_at=now,
                duration_ms=0,
                created_at=now,
            )
        )


async def _fail_step(
    step_id: uuid.UUID,
    lease_token: uuid.UUID,
    run: ExecutionRun,
    status: str,
    error_class: str,
    error_detail: str,
    started: datetime,
) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        step = await session.scalar(
            select(ExecutionStep).where(
                ExecutionStep.id == step_id,
                ExecutionStep.lease_token == lease_token,
                ExecutionStep.status == "running",
            ).with_for_update()
        )
        if step is None:
            raise RunNotClaimed("Node execution lease was lost")
        step.status = status
        step.error_class = error_class
        step.error_detail = error_detail[:2000]
        step.completed_at = now
        step.duration_ms = max(0, int((now - started).total_seconds() * 1000))
        step.lease_token = None
        step.lease_expires_at = None
        enqueue_execution_audit(
            session,
            event_type="execution.step.failed.v1",
            tenant_id=run.tenant_id,
            run_id=run.id,
            workflow_id=run.workflow_id,
            correlation_id=run.correlation_id,
            actor_id=run.initiated_by,
            occurred_at=now,
            evidence={
                "nodeId": step.node_id,
                "nodeType": step.node_type,
                "attempt": step.attempt,
                "status": status,
                "errorClass": error_class,
            },
        )


async def _get_checkpoint(tenant_id: str, idempotency_key: str) -> SideEffectCheckpoint | None:
    async with async_session_factory() as session:
        return await session.scalar(
            select(SideEffectCheckpoint).where(
                SideEffectCheckpoint.tenant_id == tenant_id,
                SideEffectCheckpoint.idempotency_key == idempotency_key,
            )
        )


async def _renew_lease(run_id: uuid.UUID, lease_token: uuid.UUID) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.lease_token == lease_token,
                ExecutionRun.status == "running",
            ).with_for_update()
        )
        if run is None:
            raise RunNotClaimed("Execution run lease was lost")
        run.lease_expires_at = now + timedelta(seconds=settings.EXECUTION_LEASE_SECONDS)
        run.updated_at = now
        run.revision += 1


async def _cancel_if_requested(run_id: uuid.UUID, lease_token: uuid.UUID) -> bool:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.lease_token == lease_token,
                ExecutionRun.status == "running",
            ).with_for_update()
        )
        if run is None:
            raise RunNotClaimed("Execution run lease was lost")
        if not run.cancellation_requested:
            return False
        run.status = "cancelled"
        run.completed_at = now
        run.lease_token = None
        run.lease_expires_at = None
        run.updated_at = now
        run.revision += 1
        enqueue_execution_audit(
            session,
            event_type="execution.run.cancelled.v1",
            tenant_id=run.tenant_id,
            run_id=run.id,
            workflow_id=run.workflow_id,
            correlation_id=run.correlation_id,
            actor_id=run.initiated_by,
            occurred_at=now,
            evidence={"status": "cancelled", "phase": "running"},
        )
        return True


async def _complete_run(run_id: uuid.UUID, lease_token: uuid.UUID, result: Any) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.lease_token == lease_token,
                ExecutionRun.status == "running",
            ).with_for_update()
        )
        if run is None:
            raise RunNotClaimed("Execution run lease was lost")
        run.status = "succeeded"
        run.result_ciphertext = encrypt_json(result, associated_data=f"run:{run.id}:result")
        run.completed_at = now
        run.lease_token = None
        run.lease_expires_at = None
        run.updated_at = now
        run.revision += 1
        enqueue_execution_audit(
            session,
            event_type="execution.run.succeeded.v1",
            tenant_id=run.tenant_id,
            run_id=run.id,
            workflow_id=run.workflow_id,
            correlation_id=run.correlation_id,
            actor_id=run.initiated_by,
            occurred_at=now,
            evidence={"status": "succeeded", "resultHash": payload_hash(result)},
        )


async def _fail_run(
    run_id: uuid.UUID,
    lease_token: uuid.UUID,
    status: str,
    error_class: str,
    error_summary: str,
) -> None:
    now = utcnow()
    async with async_session_factory() as session, session.begin():
        run = await session.scalar(
            select(ExecutionRun).where(
                ExecutionRun.id == run_id,
                ExecutionRun.lease_token == lease_token,
                ExecutionRun.status == "running",
            ).with_for_update()
        )
        if run is None:
            return
        run.status = status
        run.error_class = error_class[:128]
        run.error_summary = error_summary[:2000]
        run.completed_at = now
        run.lease_token = None
        run.lease_expires_at = None
        run.updated_at = now
        run.revision += 1
        event_type = (
            "execution.run.action_required.v1"
            if status == "action_required"
            else "execution.run.failed.v1"
        )
        enqueue_execution_audit(
            session,
            event_type=event_type,
            tenant_id=run.tenant_id,
            run_id=run.id,
            workflow_id=run.workflow_id,
            correlation_id=run.correlation_id,
            actor_id=run.initiated_by,
            occurred_at=now,
            evidence={"status": status, "errorClass": error_class},
        )


def _leaf_nodes(nodes: dict[str, Any], edges: list[dict[str, str]]) -> list[str]:
    sources = {edge["source"] for edge in edges}
    return [node_id for node_id in nodes if node_id not in sources]
