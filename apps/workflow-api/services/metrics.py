"""Authenticated, aggregate execution-plane Prometheus exposition."""

import hashlib
import secrets
from collections.abc import Iterable
from dataclasses import dataclass

import structlog
from sqlalchemy import func, select

from config import settings
from db.session import async_session_factory
from models.entities import ExecutionOutbox, ExecutionRun, ExecutionStep


log = structlog.get_logger(__name__)
_expected_token_digest = hashlib.sha256(
    settings.OBSERVABILITY_METRICS_TOKEN.get_secret_value().encode()
).digest()


@dataclass(frozen=True)
class Gauge:
    name: str
    labels: dict[str, str]
    value: int


METRIC_FAMILIES = {
    "gigalibs_execution_runs": "Durable execution runs by lifecycle status.",
    "gigalibs_execution_steps": "Durable execution step attempts by lifecycle status.",
    "gigalibs_execution_outbox_events": "Durable execution outbox events by lifecycle status.",
}


def metrics_token_is_valid(authorization: str | None) -> bool:
    if authorization is None or not authorization.startswith("Bearer "):
        return False
    token = authorization.removeprefix("Bearer ")
    if not token or token.strip() != token:
        return False
    candidate_digest = hashlib.sha256(token.encode()).digest()
    return secrets.compare_digest(candidate_digest, _expected_token_digest)


async def render_execution_metrics() -> str:
    gauges: list[Gauge] = []
    collection_success = 1
    try:
        gauges = await collect_execution_gauges()
    except Exception as exc:
        collection_success = 0
        log.error(
            "execution.metrics_database_collection_failed",
            error_class=type(exc).__name__,
        )

    lines = [
        "# HELP gigalibs_execution_metrics_collection_success Whether the execution database collector succeeded for this scrape.",
        "# TYPE gigalibs_execution_metrics_collection_success gauge",
        f'gigalibs_execution_metrics_collection_success{{collector="database"}} {collection_success}',
    ]
    for name, help_text in METRIC_FAMILIES.items():
        lines.extend((f"# HELP {name} {help_text}", f"# TYPE {name} gauge"))
    lines.extend(render_gauges(gauges))
    return "\n".join(lines) + "\n"


async def collect_execution_gauges() -> list[Gauge]:
    async with async_session_factory() as session:
        run_rows = (
            await session.execute(
                select(ExecutionRun.status, func.count()).group_by(ExecutionRun.status)
            )
        ).all()
        step_rows = (
            await session.execute(
                select(ExecutionStep.status, func.count()).group_by(ExecutionStep.status)
            )
        ).all()
        outbox_rows = (
            await session.execute(
                select(ExecutionOutbox.status, func.count()).group_by(
                    ExecutionOutbox.status
                )
            )
        ).all()

    return [
        *(
            Gauge("gigalibs_execution_runs", {"status": str(status)}, int(count))
            for status, count in run_rows
        ),
        *(
            Gauge("gigalibs_execution_steps", {"status": str(status)}, int(count))
            for status, count in step_rows
        ),
        *(
            Gauge(
                "gigalibs_execution_outbox_events",
                {"status": str(status)},
                int(count),
            )
            for status, count in outbox_rows
        ),
    ]


def render_gauges(gauges: Iterable[Gauge]) -> list[str]:
    return [
        f"{gauge.name}{format_labels(gauge.labels)} {gauge.value}" for gauge in gauges
    ]


def format_labels(labels: dict[str, str]) -> str:
    if not labels:
        return ""
    values = ",".join(
        f'{name}="{escape_label(value)}"' for name, value in labels.items()
    )
    return "{" + values + "}"


def escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')
