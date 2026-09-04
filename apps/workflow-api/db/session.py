"""PostgreSQL connection pool and async session lifecycle."""

from typing import AsyncGenerator
import structlog
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from config import settings

log = structlog.get_logger(__name__)


class Base(DeclarativeBase):
    pass


_db_url = settings.EXECUTION_DATABASE_URL
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
if not _db_url.startswith("postgresql+asyncpg://"):
    raise RuntimeError("EXECUTION_DATABASE_URL must use PostgreSQL with the asyncpg driver")

engine = create_async_engine(
    _db_url,
    echo=settings.EXECUTION_DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_size=settings.EXECUTION_DB_POOL_SIZE,
    max_overflow=settings.EXECUTION_DB_MAX_OVERFLOW,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields a managed AsyncSession per request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
