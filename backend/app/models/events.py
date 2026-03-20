"""
ORM models and Pydantic schemas for Loss & Damage Events.

Tables (schema: merl):
  - merl.ld_events            – loss and damage event records
  - merl.community_engagements – community consultation / engagement records
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# ── ORM Models ────────────────────────────────────────────────────────────────


class LDEvent(Base):
    """A recorded loss and damage event."""

    __tablename__ = "ld_events"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # cyclone | flood | drought | sea_level_rise | other
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    province: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    island: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    community: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # PostGIS geometry column (POINT, WGS 84)
    location: Mapped[Optional[Any]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    affected_people: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    affected_households: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    economic_loss_vuv: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    infrastructure_damage_vuv: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    agricultural_loss_vuv: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    fatalities: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    injuries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    data_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CommunityEngagement(Base):
    """A community consultation / engagement session."""

    __tablename__ = "community_engagements"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    engagement_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    engagement_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # consultation | workshop | focus_group | survey | field_visit
    province: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    island: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    community: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location: Mapped[Optional[Any]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    total_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    male_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    female_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    youth_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    elderly_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disability_participants: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    indigenous_participants: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    facilitator: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    key_issues_raised: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outcomes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    follow_up_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    follow_up_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    activity_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402


class LDEventCreate(BaseModel):
    event_code: Optional[str] = None
    title: str = Field(..., max_length=500)
    description: Optional[str] = None
    event_type: str = Field(..., max_length=100)
    event_date: date
    province: Optional[str] = None
    island: Optional[str] = None
    community: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    affected_people: Optional[int] = Field(default=None, ge=0)
    affected_households: Optional[int] = Field(default=None, ge=0)
    economic_loss_vuv: Optional[Decimal] = None
    infrastructure_damage_vuv: Optional[Decimal] = None
    agricultural_loss_vuv: Optional[Decimal] = None
    fatalities: int = Field(default=0, ge=0)
    injuries: int = Field(default=0, ge=0)
    verified: bool = False
    data_source: Optional[str] = None
    notes: Optional[str] = None


class LDEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_code: Optional[str]
    title: str
    description: Optional[str]
    event_type: str
    event_date: date
    province: Optional[str]
    island: Optional[str]
    community: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    affected_people: Optional[int]
    affected_households: Optional[int]
    economic_loss_vuv: Optional[Decimal]
    infrastructure_damage_vuv: Optional[Decimal]
    agricultural_loss_vuv: Optional[Decimal]
    fatalities: int
    injuries: int
    verified: bool
    data_source: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float]  # [longitude, latitude]


class GeoJSONFeatureProperties(BaseModel):
    id: int
    title: str
    event_type: str
    event_date: date
    province: Optional[str]
    community: Optional[str]
    affected_people: Optional[int]
    economic_loss_vuv: Optional[Decimal]
    verified: bool


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: Optional[GeoJSONGeometry]
    properties: GeoJSONFeatureProperties


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
