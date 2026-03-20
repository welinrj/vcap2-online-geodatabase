"""
Loss & Damage Event endpoints.

Routes:
  GET  /api/events      – list events with optional filters
  POST /api/events      – create a new L&D event
  GET  /api/events/map  – GeoJSON FeatureCollection for map display
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_db
from app.models.events import (
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONFeatureProperties,
    GeoJSONGeometry,
    LDEvent,
    LDEventCreate,
    LDEventResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _event_to_geojson_feature(event: LDEvent) -> GeoJSONFeature:
    geometry = None
    if event.latitude is not None and event.longitude is not None:
        geometry = GeoJSONGeometry(
            type="Point",
            coordinates=[float(event.longitude), float(event.latitude)],
        )
    props = GeoJSONFeatureProperties(
        id=event.id,
        title=event.title,
        event_type=event.event_type,
        event_date=event.event_date,
        province=event.province,
        community=event.community,
        affected_people=event.affected_people,
        economic_loss_vuv=event.economic_loss_vuv,
        verified=event.verified,
    )
    return GeoJSONFeature(type="Feature", geometry=geometry, properties=props)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/events", response_model=List[LDEventResponse])
async def list_events(
    event_type: Optional[str] = Query(default=None),
    province: Optional[str] = Query(default=None),
    verified: Optional[bool] = Query(default=None),
    year: Optional[int] = Query(default=None, description="Filter by event year"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[LDEventResponse]:
    """Return a filtered, paginated list of Loss & Damage events."""
    from sqlalchemy import extract

    stmt = select(LDEvent)
    if event_type:
        stmt = stmt.where(LDEvent.event_type == event_type)
    if province:
        stmt = stmt.where(LDEvent.province == province)
    if verified is not None:
        stmt = stmt.where(LDEvent.verified == verified)
    if year:
        stmt = stmt.where(extract("year", LDEvent.event_date) == year)
    stmt = stmt.order_by(LDEvent.event_date.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    events = result.scalars().all()
    return [LDEventResponse.model_validate(e) for e in events]


@router.post("/events", response_model=LDEventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: LDEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LDEventResponse:
    """Record a new Loss & Damage event.  Automatically builds PostGIS geometry."""
    data = payload.model_dump()

    # Build PostGIS POINT geometry when coordinates are provided
    geom = None
    if payload.latitude is not None and payload.longitude is not None:
        geom = ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)

    event = LDEvent(**data, location=geom, created_by=user.email)
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return LDEventResponse.model_validate(event)


@router.get("/events/map", response_model=GeoJSONFeatureCollection)
async def get_events_map(
    event_type: Optional[str] = Query(default=None),
    province: Optional[str] = Query(default=None),
    verified: Optional[bool] = Query(default=None),
    year: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> GeoJSONFeatureCollection:
    """
    Return a GeoJSON FeatureCollection of all matching L&D events.
    Only events with lat/lon coordinates will have non-null geometry.
    """
    from sqlalchemy import extract, func

    stmt = select(LDEvent)
    if event_type:
        stmt = stmt.where(LDEvent.event_type == event_type)
    if province:
        stmt = stmt.where(LDEvent.province == province)
    if verified is not None:
        stmt = stmt.where(LDEvent.verified == verified)
    if year:
        stmt = stmt.where(extract("year", LDEvent.event_date) == year)
    stmt = stmt.order_by(LDEvent.event_date.desc())

    result = await db.execute(stmt)
    events = result.scalars().all()

    features = [_event_to_geojson_feature(e) for e in events]

    # Aggregate metadata
    total_affected = sum(
        e.affected_people or 0 for e in events
    )
    total_economic_loss = sum(
        float(e.economic_loss_vuv or 0) for e in events
    )

    return GeoJSONFeatureCollection(
        type="FeatureCollection",
        features=features,
        metadata={
            "total_events": len(features),
            "total_affected_people": total_affected,
            "total_economic_loss_vuv": total_economic_loss,
        },
    )
