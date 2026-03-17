"""
Database connectivity layer.

Provides:
  - Async SQLAlchemy engine + session factory for PostgreSQL (primary store).
  - Synchronous ClickHouse client context manager (analytics store).
  - FastAPI dependency get_db() for injecting DB sessions into route handlers.
  - Declarative Base for ORM models.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import AsyncGenerator, Generator

from clickhouse_driver import Client as ClickHouseClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

# ── PostgreSQL (async) ────────────────────────────────────────────────────────

_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
    future=True,
)

_async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=_engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session and guarantees
    cleanup (commit on success, rollback on exception).
    """
    async with _async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_connection() -> bool:
    """
    Lightweight connectivity check executed on application startup.
    Returns True if the database is reachable, False otherwise.
    """
    from sqlalchemy import text

    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("PostgreSQL connection OK.")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("PostgreSQL connection FAILED: %s", exc)
        return False


async def dispose_engine() -> None:
    """Cleanly dispose of the connection pool on application shutdown."""
    await _engine.dispose()


# ── ClickHouse (synchronous) ──────────────────────────────────────────────────


def _build_clickhouse_client() -> ClickHouseClient:
    """Instantiate a new ClickHouse client from settings."""
    return ClickHouseClient(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        database=settings.CLICKHOUSE_DB,
        user=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        settings={"use_numpy": False},
        connect_timeout=10,
        send_receive_timeout=60,
    )


@contextmanager
def get_clickhouse() -> Generator[ClickHouseClient, None, None]:
    """
    Context manager that yields a synchronous ClickHouse client.

    Usage::

        with get_clickhouse() as ch:
            rows = ch.execute("SELECT count() FROM kpi_snapshots")
    """
    client = _build_clickhouse_client()
    try:
        yield client
    except Exception as exc:
        logger.error("ClickHouse query error: %s", exc)
        raise
    finally:
        client.disconnect()
