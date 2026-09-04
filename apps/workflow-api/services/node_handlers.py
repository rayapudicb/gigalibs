"""Production node handlers. Unsupported integrations fail closed."""

import asyncio
import ipaddress
import json
import socket
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from config import settings


class NodeHandlerError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class NodeHandlerResult:
    output: Any
    is_side_effect: bool


def is_side_effect_node(node_type: str) -> bool:
    return node_type == "http"


async def execute_node(
    node: dict[str, Any],
    node_input: Any,
    *,
    idempotency_key: str,
) -> NodeHandlerResult:
    node_type = node.get("type")
    if node_type in {"trigger", "webhook", "input"}:
        return NodeHandlerResult(output=node_input, is_side_effect=False)
    if node_type == "http":
        return NodeHandlerResult(
            output=await _execute_http(node, node_input, idempotency_key=idempotency_key),
            is_side_effect=True,
        )
    raise NodeHandlerError(
        f"Node type '{node_type}' has no production handler registered.",
        retryable=False,
    )


async def _execute_http(
    node: dict[str, Any],
    node_input: Any,
    *,
    idempotency_key: str,
) -> dict[str, Any]:
    config = node.get("config")
    if not isinstance(config, dict):
        raise NodeHandlerError("HTTP node config is required.", retryable=False)
    if config.get("credentialRef"):
        raise NodeHandlerError(
            "Credential-backed HTTP execution requires the credential broker.",
            retryable=False,
        )

    raw_url = config.get("url")
    method = config.get("method")
    if not isinstance(raw_url, str) or not isinstance(method, str):
        raise NodeHandlerError("HTTP node requires string url and method fields.", retryable=False)
    method = method.upper()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        raise NodeHandlerError(f"HTTP method '{method}' is not permitted.", retryable=False)

    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise NodeHandlerError("HTTP node URL is not an accepted absolute URL.", retryable=False)
    if parsed.fragment:
        raise NodeHandlerError("HTTP node URLs cannot include fragments.", retryable=False)
    if parsed.scheme != "https" and not settings.EXECUTION_ALLOW_INSECURE_HTTP:
        raise NodeHandlerError("Plain HTTP is disabled by execution policy.", retryable=False)

    hostname = parsed.hostname.lower()
    if hostname not in settings.EXECUTION_HTTP_ALLOWED_HOSTS:
        raise NodeHandlerError("HTTP destination is not allowlisted.", retryable=False)
    await _validate_resolved_addresses(hostname, parsed.port)

    configured_headers = config.get("headers", {})
    if not isinstance(configured_headers, dict) or not all(
        isinstance(key, str) and isinstance(value, str)
        for key, value in configured_headers.items()
    ):
        raise NodeHandlerError("HTTP headers must be a string map.", retryable=False)
    if any(
        key.lower() in {"authorization", "proxy-authorization", "cookie", "set-cookie"}
        for key in configured_headers
    ):
        raise NodeHandlerError("Credential headers must come from the credential broker.", retryable=False)

    headers = {**configured_headers, "Idempotency-Key": idempotency_key}
    request_kwargs: dict[str, Any] = {"headers": headers}
    if method != "GET":
        request_kwargs["json"] = node_input

    try:
        async with httpx.AsyncClient(
            timeout=settings.EXECUTION_HTTP_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            async with client.stream(method, raw_url, **request_kwargs) as response:
                if 300 <= response.status_code < 400:
                    raise NodeHandlerError("HTTP redirects are disabled.", retryable=False)
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > settings.EXECUTION_HTTP_MAX_RESPONSE_BYTES:
                        raise NodeHandlerError("HTTP response exceeded the configured limit.", retryable=False)

                if response.status_code >= 400:
                    retryable = response.status_code in {408, 425, 429} or response.status_code >= 500
                    raise NodeHandlerError(
                        f"HTTP destination returned status {response.status_code}.",
                        retryable=retryable,
                    )
                return {
                    "statusCode": response.status_code,
                    "headers": {
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() in {"content-type", "etag", "last-modified", "location"}
                    },
                    "body": _decode_response(bytes(body), response.headers.get("content-type", "")),
                }
    except NodeHandlerError:
        raise
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise NodeHandlerError("HTTP destination was unavailable.", retryable=True) from exc


async def _validate_resolved_addresses(hostname: str, port: int | None) -> None:
    try:
        addresses = await asyncio.to_thread(
            socket.getaddrinfo,
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise NodeHandlerError("HTTP destination DNS resolution failed.", retryable=True) from exc
    if not addresses:
        raise NodeHandlerError("HTTP destination did not resolve.", retryable=True)

    if settings.EXECUTION_HTTP_ALLOW_PRIVATE_NETWORKS:
        return
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise NodeHandlerError(
                "HTTP destination resolved to a non-public network address.",
                retryable=False,
            )


def _decode_response(body: bytes, content_type: str) -> Any:
    if not body:
        return None
    if "application/json" in content_type.lower():
        try:
            return json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise NodeHandlerError("HTTP destination returned invalid JSON.", retryable=False) from exc
    return body.decode("utf-8", errors="replace")
