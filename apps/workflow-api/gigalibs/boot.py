"""Execution-plane startup readiness gate."""

import structlog
from typing import Awaitable, Callable, NamedTuple

from .modules import (
    check_control_plane,
    check_execution_database,
    check_execution_queue,
)

log = structlog.get_logger(__name__)


class ModuleManifest(NamedTuple):
    id: str
    name: str
    version: str
    check: Callable[[], Awaitable[None]]


EXECUTION_MODULES = [
    ModuleManifest(
        "gigalibs.execution.control-plane",
        "Control-plane identity and configuration",
        "0.1.0",
        check_control_plane,
    ),
    ModuleManifest(
        "gigalibs.execution.persistence",
        "Durable execution persistence",
        "0.1.0",
        check_execution_database,
    ),
    ModuleManifest(
        "gigalibs.execution.queue",
        "Celery execution queue",
        "0.1.0",
        check_execution_queue,
    ),
]


class ExecutionRegistry:
    def __init__(self) -> None:
        self._modules: dict[str, dict[str, object]] = {}

    def record(self, manifest: ModuleManifest, ready: bool) -> None:
        self._modules[manifest.id] = {
            "id": manifest.id,
            "name": manifest.name,
            "version": manifest.version,
            "ready": ready,
        }

    def list_modules(self) -> list[dict[str, object]]:
        return list(self._modules.values())


registry = ExecutionRegistry()


async def boot_gigalibs() -> None:
    """Refuse traffic until every required external dependency is ready."""
    log.info("execution.boot_start", modules=[module.id for module in EXECUTION_MODULES])
    for module in EXECUTION_MODULES:
        await module.check()
        registry.record(module, True)
        log.info("execution.module_ready", module=module.id)
    log.info("execution.boot_complete", count=len(EXECUTION_MODULES))


async def shutdown_gigalibs() -> None:
    log.info("execution.shutdown_complete")
