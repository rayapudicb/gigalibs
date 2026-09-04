"""
Enterprise AI Workflow Orchestration Platform — FastAPI application entry point.
Boots all R0 GigaLibs modules on startup, registers routers, and configures middleware.
"""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from gigalibs.boot import boot_gigalibs, shutdown_gigalibs
from middleware.session import SessionMiddleware
from config import settings
from routers.runs import router as runs_router
from services.metrics import metrics_token_is_valid, render_execution_metrics

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Boot sequence: verify all R0 GigaLibs modules are ready before accepting traffic."""
    log.info("workflow_api.starting", version="0.1.0", env=settings.EXECUTION_ENV)
    await boot_gigalibs()
    log.info("workflow_api.ready")
    yield
    await shutdown_gigalibs()
    log.info("workflow_api.shutdown")


app = FastAPI(
    title="Workflow Platform API",
    description="Enterprise AI Workflow Orchestration Platform",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.EXECUTION_ENV != "production" else None,
    redoc_url=None,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.EXECUTION_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware)

# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    route = request.scope.get("route")
    route_template = getattr(route, "path", "unmatched")
    log.error(
        "unhandled_exception",
        method=request.method,
        route=route_template,
        error_class=type(exc).__name__,
        correlation_id=getattr(request.state, "correlation_id", "unavailable"),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred. Please contact support.",
            "correlation_id": getattr(request.state, "correlation_id", ""),
        },
    )

# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "workflow-api", "version": "0.1.0"}

@app.get("/ready", tags=["system"])
async def ready():
    from gigalibs.modules import check_execution_database, check_execution_queue

    try:
        await check_execution_database()
        await check_execution_queue()
    except Exception:
        log.exception("workflow_api.not_ready")
        return JSONResponse(status_code=503, content={"status": "not-ready"})
    return {"status": "ready", "service": "workflow-api", "version": "0.1.0"}


@app.get("/api/v1/internal/metrics", tags=["system"], include_in_schema=False)
async def metrics(request: Request):
    if not metrics_token_is_valid(request.headers.get("Authorization")):
        return JSONResponse(
            status_code=401,
            content={"detail": "Metrics scraper authentication is invalid."},
        )
    return Response(
        content=await render_execution_metrics(),
        headers={"Content-Type": "text/plain; version=0.0.4; charset=utf-8"},
    )

app.include_router(runs_router, prefix="/api/v1")
