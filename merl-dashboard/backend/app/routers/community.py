"""
Community Engagement endpoints.

Routes:
  GET  /api/community/engagements     – list engagements
  POST /api/community/engagements     – create a new engagement
  GET  /api/community/gedsi-summary   – GEDSI disaggregation rates from ClickHouse
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_clickhouse, get_db
from app.models.events import CommunityEngagement

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas (defined inline for self-containment) ─────────────────────

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EngagementCreate(BaseModel):
    engagement_date: date
    title: str = Field(..., max_length=500)
    engagement_type: str = Field(..., max_length=100)
    province: Optional[str] = None
    island: Optional[str] = None
    community: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    total_participants: int = Field(default=0, ge=0)
    male_participants: int = Field(default=0, ge=0)
    female_participants: int = Field(default=0, ge=0)
    youth_participants: int = Field(default=0, ge=0)
    elderly_participants: int = Field(default=0, ge=0)
    disability_participants: int = Field(default=0, ge=0)
    indigenous_participants: int = Field(default=0, ge=0)
    facilitator: Optional[str] = None
    key_issues_raised: Optional[str] = None
    outcomes: Optional[str] = None
    follow_up_required: bool = False
    follow_up_notes: Optional[str] = None
    activity_code: Optional[str] = None


class EngagementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    engagement_date: date
    title: str
    engagement_type: str
    province: Optional[str]
    island: Optional[str]
    community: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    total_participants: int
    male_participants: int
    female_participants: int
    youth_participants: int
    elderly_participants: int
    disability_participants: int
    indigenous_participants: int
    facilitator: Optional[str]
    key_issues_raised: Optional[str]
    outcomes: Optional[str]
    follow_up_required: bool
    follow_up_notes: Optional[str]
    activity_code: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── ClickHouse GEDSI query ────────────────────────────────────────────────────


def _query_gedsi_summary(province: Optional[str], period: Optional[str]) -> dict:
    conditions: List[str] = []
    if province:
        conditions.append(f"province = '{province}'")
    if period:
        conditions.append(f"period_label = '{period}'")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with get_clickhouse() as ch:
        rows = ch.execute(
            f"""
            SELECT
                count()                                        AS total_engagements,
                sum(total_participants)                        AS total_participants,
                sum(male_participants)                         AS total_male,
                sum(female_participants)                       AS total_female,
                sum(youth_participants)                        AS total_youth,
                sum(elderly_participants)                      AS total_elderly,
                sum(disability_participants)                   AS total_disability,
                sum(indigenous_participants)                   AS total_indigenous,
                countIf(province IS NOT NULL) AS engagements_with_province
            FROM community_engagements
            {where}
            """
        )
        province_rows = ch.execute(
            f"""
            SELECT province, sum(total_participants) AS total
            FROM community_engagements
            {where}
            GROUP BY province
            ORDER BY total DESC
            """
        )

    r = rows[0]
    total_p = int(r[1] or 0)

    def pct(n: int) -> float:
        return round(n / total_p * 100, 1) if total_p else 0.0

    return {
        "total_engagements": int(r[0] or 0),
        "total_participants": total_p,
        "gender": {
            "male": int(r[2] or 0),
            "female": int(r[3] or 0),
            "male_pct": pct(int(r[2] or 0)),
            "female_pct": pct(int(r[3] or 0)),
        },
        "age": {
            "youth": int(r[4] or 0),
            "elderly": int(r[5] or 0),
            "youth_pct": pct(int(r[4] or 0)),
            "elderly_pct": pct(int(r[5] or 0)),
        },
        "disability": {
            "total": int(r[6] or 0),
            "inclusion_rate_pct": pct(int(r[6] or 0)),
        },
        "indigenous": {
            "total": int(r[7] or 0),
            "rate_pct": pct(int(r[7] or 0)),
        },
        "by_province": [
            {"province": pr[0] or "Unknown", "total_participants": int(pr[1] or 0)}
            for pr in province_rows
        ],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/community/engagements", response_model=List[EngagementResponse])
async def list_engagements(
    province: Optional[str] = Query(default=None),
    engagement_type: Optional[str] = Query(default=None),
    activity_code: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[EngagementResponse]:
    """Return a filtered, paginated list of community engagements."""
    stmt = select(CommunityEngagement)
    if province:
        stmt = stmt.where(CommunityEngagement.province == province)
    if engagement_type:
        stmt = stmt.where(CommunityEngagement.engagement_type == engagement_type)
    if activity_code:
        stmt = stmt.where(CommunityEngagement.activity_code == activity_code)
    stmt = (
        stmt.order_by(CommunityEngagement.engagement_date.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(stmt)
    engagements = result.scalars().all()
    return [EngagementResponse.model_validate(e) for e in engagements]


@router.post(
    "/community/engagements",
    response_model=EngagementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_engagement(
    payload: EngagementCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EngagementResponse:
    """Record a new community engagement session."""
    from geoalchemy2.functions import ST_MakePoint, ST_SetSRID

    data = payload.model_dump()
    geom = None
    if payload.latitude is not None and payload.longitude is not None:
        geom = ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)

    engagement = CommunityEngagement(**data, location=geom, created_by=user.email)
    db.add(engagement)
    await db.flush()
    await db.refresh(engagement)
    return EngagementResponse.model_validate(engagement)


@router.get("/community/gedsi-summary")
async def get_gedsi_summary(
    province: Optional[str] = Query(default=None),
    period: Optional[str] = Query(
        default=None, description="Period label, e.g. 'Q1-2024'"
    ),
    _user: User = Depends(get_current_user),
) -> dict:
    """
    Return GEDSI disaggregation rates computed from ClickHouse community engagement data.
    Includes gender, age, disability, and geographic distribution.
    """
    try:
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, _query_gedsi_summary, province, period
        )
        return summary
    except Exception as exc:
        logger.error("ClickHouse GEDSI summary error: %s", exc)
        return {
            "error": "Analytics service temporarily unavailable.",
            "detail": str(exc),
        }
