"""Typed access to authoritative control-plane execution contracts."""

from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from config import settings


class ControlPlaneError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class ExecutionSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str = Field(alias="tenantId", min_length=1, max_length=128)
    workflow_id: str = Field(alias="workflowId", min_length=1, max_length=128)
    version: int = Field(gt=0)
    definition: dict[str, Any]
    input_schema: dict[str, Any] = Field(alias="inputSchema")
    output_schema: dict[str, Any] = Field(alias="outputSchema")
    checksum: str = Field(min_length=64, max_length=64)
    schema_version: str = Field(alias="schemaVersion", min_length=1, max_length=64)
    compiler_version: str = Field(alias="compilerVersion", min_length=1, max_length=64)


async def fetch_execution_spec(workflow_id: str, authorization: str) -> ExecutionSpec:
    url = (
        f"{settings.CONTROL_PLANE_API_URL.rstrip('/')}"
        f"/api/v1/workflows/pipelines/{workflow_id}/execution-spec"
    )
    try:
        async with httpx.AsyncClient(timeout=settings.CONTROL_PLANE_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers={"Authorization": authorization})
    except httpx.HTTPError as exc:
        raise ControlPlaneError("Control plane is unavailable.") from exc

    if response.status_code == 404:
        raise ControlPlaneError("Active workflow was not found.", status_code=404)
    if response.status_code in {401, 403}:
        raise ControlPlaneError("Workflow execution is not authorized.", status_code=response.status_code)
    if response.status_code != 200:
        raise ControlPlaneError("Control plane could not provide an execution specification.")
    try:
        return ExecutionSpec.model_validate(response.json())
    except (ValueError, ValidationError) as exc:
        raise ControlPlaneError("Control plane returned an invalid execution contract.") from exc
