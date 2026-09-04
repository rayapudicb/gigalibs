"""Configuration-driven ASGI process entry point."""

import uvicorn

from config import settings


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.EXECUTION_API_HOST,
        port=settings.EXECUTION_API_PORT,
        workers=settings.EXECUTION_API_WORKERS,
        log_level=settings.EXECUTION_LOG_LEVEL.lower(),
        proxy_headers=True,
    )
