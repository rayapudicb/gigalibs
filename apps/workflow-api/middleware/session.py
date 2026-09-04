"""Fail-closed identity resolution through the authoritative control plane."""

import re
import uuid

import httpx
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from config import settings

log = structlog.get_logger(__name__)
CORRELATION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")


def resolve_correlation_id(value: str | None) -> str:
    if value is not None and CORRELATION_ID_PATTERN.fullmatch(value):
        return value
    return str(uuid.uuid4())


def error_response(status_code: int, detail: str, correlation_id: str) -> JSONResponse:
    response = JSONResponse(status_code=status_code, content={"detail": detail})
    response.headers["X-Correlation-ID"] = correlation_id
    return response

class SessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = resolve_correlation_id(request.headers.get("X-Correlation-ID"))
        request.state.correlation_id = correlation_id
        if request.method == "OPTIONS" or request.url.path in {
            "/health",
            "/ready",
            "/api/v1/internal/metrics",
        }:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return error_response(401, "Bearer authentication is required.", correlation_id)

        context_url = (
            f"{settings.CONTROL_PLANE_API_URL.rstrip('/')}"
            "/api/v1/authorization/context"
        )
        try:
            async with httpx.AsyncClient(timeout=settings.CONTROL_PLANE_TIMEOUT_SECONDS) as client:
                upstream = await client.get(
                    context_url,
                    headers={"Authorization": auth_header},
                )
        except httpx.HTTPError as exc:
            log.error(
                "control_plane.identity_unavailable",
                correlation_id=correlation_id,
                error_class=type(exc).__name__,
            )
            return error_response(503, "Identity service is unavailable.", correlation_id)

        if upstream.status_code in {401, 403}:
            return error_response(
                upstream.status_code,
                "Session is invalid or no longer authorized.",
                correlation_id,
            )
        if upstream.status_code != 200:
            log.error(
                "control_plane.identity_error",
                status_code=upstream.status_code,
                correlation_id=correlation_id,
            )
            return error_response(
                503,
                "Identity service could not validate the session.",
                correlation_id,
            )

        try:
            context = upstream.json()
        except ValueError:
            return error_response(
                502,
                "Identity service returned an invalid response.",
                correlation_id,
            )
        user = context.get("user")
        tenant = context.get("tenant")
        if not isinstance(user, dict):
            return error_response(
                502,
                "Identity service returned an invalid context contract.",
                correlation_id,
            )
        if not isinstance(user.get("id"), str) or not isinstance(tenant, dict) or not isinstance(tenant.get("id"), str):
            return error_response(
                403,
                "Select an authorized tenant before using the execution plane.",
                correlation_id,
            )

        roles = context.get("roles")
        permissions = context.get("permissions")
        if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
            return error_response(502, "Identity roles contract is invalid.", correlation_id)
        if not isinstance(permissions, list) or not all(
            isinstance(permission, str) for permission in permissions
        ):
            return error_response(
                502,
                "Identity permissions contract is invalid.",
                correlation_id,
            )

        request.state.identity = context
        request.state.auth_header = auth_header
        request.state.member_id = user.get("id")
        request.state.tenant_id = tenant.get("id")
        request.state.roles = roles
        request.state.permissions = permissions
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response
