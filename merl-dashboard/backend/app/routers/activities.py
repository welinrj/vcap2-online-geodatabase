"""
Activity endpoints.

Routes:
  GET  /api/activities           – list with optional filters
  GET  /api/activities/gantt     – Gantt-formatted data
  GET  /api/activities/{id}      – detail with milestones
  PUT  /api/activities/{id}/status – update activity status / progress
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import User, get_current_user
from app.database import get_db
from app.models.activities import (
    Activity,
    ActivityCreate,
    ActivityResponse,
    ActivityUpdate,
    GanttItem,
    MilestoneResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────


def _activity_to_gantt(activity: Activity) -> GanttItem:
    return GanttItem(
        id=activity.id,
        code=activity.code,
        name=activity.name,
        domain=activity.domain,
        responsible_party=activity.responsible_party,
        planned_start=activity.planned_start_date,
        planned_end=activity.planned_end_date,
        actual_start=activity.actual_start_date,
        actual_end=activity.actual_end_date,
        status=activity.status,
        completion_percentage=activity.completion_percentage,
        milestones=[MilestoneResponse.model_validate(m) for m in activity.milestones],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/activities", response_model=List[ActivityResponse])
async def list_activities(
    domain: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    responsible_party: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=True),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[ActivityResponse]:
    """Return a filtered, paginated list of activities including their milestones."""
    stmt = (
        select(Activity)
        .options(selectinload(Activity.milestones))
    )
    if domain:
        stmt = stmt.where(Activity.domain == domain)
    if status_filter:
        stmt = stmt.where(Activity.status == status_filter)
    if responsible_party:
        stmt = stmt.where(Activity.responsible_party == responsible_party)
    if is_active is not None:
        stmt = stmt.where(Activity.is_active == is_active)
    stmt = stmt.order_by(Activity.code).offset(skip).limit(limit)

    result = await db.execute(stmt)
    activities = result.scalars().all()
    return [ActivityResponse.model_validate(a) for a in activities]


@router.get("/activities/gantt", response_model=List[GanttItem])
async def get_gantt_data(
    domain: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[GanttItem]:
    """
    Return all active activities formatted for Gantt-chart consumption.
    Includes planned vs actual dates and milestone markers.
    """
    stmt = (
        select(Activity)
        .where(Activity.is_active == True)  # noqa: E712
        .options(selectinload(Activity.milestones))
        .order_by(Activity.planned_start_date.asc().nulls_last(), Activity.code)
    )
    if domain:
        stmt = stmt.where(Activity.domain == domain)

    result = await db.execute(stmt)
    activities = result.scalars().all()
    return [_activity_to_gantt(a) for a in activities]


@router.get("/activities/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> ActivityResponse:
    """Return a single activity with full milestone detail."""
    stmt = (
        select(Activity)
        .where(Activity.id == activity_id)
        .options(selectinload(Activity.milestones))
    )
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity {activity_id} not found.",
        )
    return ActivityResponse.model_validate(activity)


@router.put("/activities/{activity_id}/status", response_model=ActivityResponse)
async def update_activity_status(
    activity_id: int,
    payload: ActivityUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    """
    Partial update for an activity.  Accepts any subset of ActivityUpdate fields.
    Only non-None values are applied.
    """
    stmt = (
        select(Activity)
        .where(Activity.id == activity_id)
        .options(selectinload(Activity.milestones))
    )
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Activity {activity_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True, exclude_none=True)
    for field_name, value in update_data.items():
        setattr(activity, field_name, value)

    await db.flush()
    await db.refresh(activity)
    return ActivityResponse.model_validate(activity)


@router.post(
    "/activities",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_activity(
    payload: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    """Create a new activity."""
    # Check for duplicate code
    existing = await db.execute(
        select(Activity).where(Activity.code == payload.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Activity with code '{payload.code}' already exists.",
        )

    activity = Activity(**payload.model_dump())
    db.add(activity)
    await db.flush()
    await db.refresh(activity)
    return ActivityResponse.model_validate(activity)
