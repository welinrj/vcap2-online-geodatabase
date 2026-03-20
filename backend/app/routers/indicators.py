"""
Indicator endpoints.

Routes:
  GET  /api/indicators                – list indicators with optional filters
  GET  /api/indicators/dashboard      – aggregate KPI summary from ClickHouse
  GET  /api/indicators/{id}/progress  – value vs target with trend data
  POST /api/indicators/{id}/values    – insert a new indicator value
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import User, get_current_user
from app.database import get_clickhouse, get_db
from app.models.indicators import (
    Indicator,
    IndicatorCreate,
    IndicatorProgress,
    IndicatorResponse,
    IndicatorValue,
    IndicatorValueCreate,
    IndicatorValueResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────


def _compute_trend(values: list) -> str:
    """
    Determine trend direction from the last three recorded values.
    Returns one of: 'improving' | 'stable' | 'declining' | 'insufficient_data'
    """
    if len(values) < 2:
        return "insufficient_data"
    recent = [float(v.value) for v in sorted(values, key=lambda x: x.recorded_date)[-3:]]
    if len(recent) < 2:
        return "insufficient_data"
    delta = recent[-1] - recent[0]
    if abs(delta) < 1e-6:
        return "stable"
    return "improving" if delta > 0 else "declining"


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/indicators", response_model=List[IndicatorResponse])
async def list_indicators(
    domain: Optional[str] = Query(default=None, description="Filter by domain"),
    status: Optional[str] = Query(
        default=None,
        description="Filter by status (on_track|at_risk|off_track|completed)",
    ),
    is_active: Optional[bool] = Query(default=True),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[IndicatorResponse]:
    """Return a filtered, paginated list of indicator definitions."""
    stmt = select(Indicator)
    if domain:
        stmt = stmt.where(Indicator.domain == domain)
    if status:
        stmt = stmt.where(Indicator.status == status)
    if is_active is not None:
        stmt = stmt.where(Indicator.is_active == is_active)
    stmt = stmt.order_by(Indicator.code).offset(skip).limit(limit)

    result = await db.execute(stmt)
    indicators = result.scalars().all()
    return [IndicatorResponse.model_validate(ind) for ind in indicators]


@router.get("/indicators/dashboard")
async def get_dashboard_kpis(
    _user: User = Depends(get_current_user),
) -> dict:
    """
    Return aggregate KPI summary from ClickHouse kpi_snapshots table.
    Falls back to PostgreSQL counts if ClickHouse is unavailable.
    """

    def _query_clickhouse() -> dict:
        with get_clickhouse() as ch:
            rows = ch.execute(
                """
                SELECT
                    domain,
                    countIf(status = 'on_track')   AS on_track,
                    countIf(status = 'at_risk')    AS at_risk,
                    countIf(status = 'off_track')  AS off_track,
                    countIf(status = 'completed')  AS completed,
                    avg(percent_achieved)          AS avg_pct
                FROM kpi_snapshots
                WHERE snapshot_date = (SELECT max(snapshot_date) FROM kpi_snapshots)
                GROUP BY domain
                ORDER BY domain
                """,
                with_column_types=False,
            )
        return {
            "source": "clickhouse",
            "domains": [
                {
                    "domain": r[0],
                    "on_track": r[1],
                    "at_risk": r[2],
                    "off_track": r[3],
                    "completed": r[4],
                    "avg_percent_achieved": round(float(r[5] or 0), 1),
                }
                for r in rows
            ],
        }

    try:
        # Run the synchronous ClickHouse call in a thread pool
        result = await asyncio.get_event_loop().run_in_executor(None, _query_clickhouse)
        return result
    except Exception as exc:
        logger.warning("ClickHouse unavailable, returning empty dashboard: %s", exc)
        return {"source": "unavailable", "domains": [], "error": str(exc)}


@router.get("/indicators/{indicator_id}/progress", response_model=IndicatorProgress)
async def get_indicator_progress(
    indicator_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> IndicatorProgress:
    """Return current value vs target with trend analysis and value history."""
    stmt = (
        select(Indicator)
        .where(Indicator.id == indicator_id)
        .options(selectinload(Indicator.values))
    )
    result = await db.execute(stmt)
    indicator = result.scalar_one_or_none()
    if not indicator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Indicator {indicator_id} not found.",
        )

    sorted_values = sorted(indicator.values, key=lambda v: v.recorded_date)
    current_value = sorted_values[-1].value if sorted_values else None
    latest_date = sorted_values[-1].recorded_date if sorted_values else None

    percent_achieved: Optional[float] = None
    if current_value is not None and indicator.target_value:
        try:
            percent_achieved = round(
                float(current_value) / float(indicator.target_value) * 100, 2
            )
        except ZeroDivisionError:
            percent_achieved = None

    trend = _compute_trend(sorted_values)

    value_history = [IndicatorValueResponse.model_validate(v) for v in sorted_values]

    return IndicatorProgress(
        indicator_id=indicator.id,
        code=indicator.code,
        name=indicator.name,
        domain=indicator.domain,
        unit=indicator.unit,
        baseline_value=indicator.baseline_value,
        target_value=indicator.target_value,
        current_value=current_value,
        percent_achieved=percent_achieved,
        status=indicator.status,
        trend=trend,
        latest_recorded_date=latest_date,
        value_history=value_history,
    )


@router.post(
    "/indicators/{indicator_id}/values",
    response_model=IndicatorValueResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_indicator_value(
    indicator_id: int,
    payload: IndicatorValueCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IndicatorValueResponse:
    """Record a new value against an indicator."""
    # Verify indicator exists
    stmt = select(Indicator).where(Indicator.id == indicator_id)
    result = await db.execute(stmt)
    indicator = result.scalar_one_or_none()
    if not indicator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Indicator {indicator_id} not found.",
        )

    new_value = IndicatorValue(
        indicator_id=indicator_id,
        value=payload.value,
        recorded_date=payload.recorded_date,
        period_label=payload.period_label,
        notes=payload.notes,
        source_document=payload.source_document,
        recorded_by=user.email,
    )
    db.add(new_value)
    await db.flush()
    await db.refresh(new_value)
    return IndicatorValueResponse.model_validate(new_value)
