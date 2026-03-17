"""
ORM models and Pydantic schemas for MERL Indicators.

Tables (schema: merl):
  - merl.indicators        – indicator definitions
  - merl.indicator_values  – time-series values per indicator
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ── ORM Models ────────────────────────────────────────────────────────────────


class Indicator(Base):
    """An individual MERL indicator definition."""

    __tablename__ = "indicators"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(100), nullable=False, default="count")
    baseline_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    target_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    baseline_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="on_track"
    )  # on_track | at_risk | off_track | completed
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    frequency: Mapped[str] = mapped_column(
        String(50), nullable=False, default="quarterly"
    )  # monthly | quarterly | annual
    responsible_party: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    values: Mapped[List["IndicatorValue"]] = relationship(
        "IndicatorValue", back_populates="indicator", cascade="all, delete-orphan"
    )


class IndicatorValue(Base):
    """A single time-stamped value recorded against an indicator."""

    __tablename__ = "indicator_values"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    indicator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("merl.indicators.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    recorded_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_label: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # e.g. "Q1-2024"
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_document: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    indicator: Mapped["Indicator"] = relationship(
        "Indicator", back_populates="values"
    )


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402


class IndicatorCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=500)
    description: Optional[str] = None
    domain: str = Field(..., max_length=100)
    unit: str = Field(default="count", max_length=100)
    baseline_value: Optional[Decimal] = None
    target_value: Optional[Decimal] = None
    baseline_year: Optional[int] = None
    target_year: Optional[int] = None
    status: str = Field(default="on_track", pattern="^(on_track|at_risk|off_track|completed)$")
    data_source: Optional[str] = None
    frequency: str = Field(default="quarterly", pattern="^(monthly|quarterly|annual)$")
    responsible_party: Optional[str] = None


class IndicatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str]
    domain: str
    unit: str
    baseline_value: Optional[Decimal]
    target_value: Optional[Decimal]
    baseline_year: Optional[int]
    target_year: Optional[int]
    status: str
    is_active: bool
    data_source: Optional[str]
    frequency: str
    responsible_party: Optional[str]
    created_at: datetime
    updated_at: datetime


class IndicatorValueCreate(BaseModel):
    value: Decimal
    recorded_date: date
    period_label: Optional[str] = None
    notes: Optional[str] = None
    source_document: Optional[str] = None


class IndicatorValueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    indicator_id: int
    value: Decimal
    recorded_date: date
    period_label: Optional[str]
    notes: Optional[str]
    recorded_by: Optional[str]
    source_document: Optional[str]
    created_at: datetime


class IndicatorProgress(BaseModel):
    """Aggregated progress summary for a single indicator."""

    indicator_id: int
    code: str
    name: str
    domain: str
    unit: str
    baseline_value: Optional[Decimal]
    target_value: Optional[Decimal]
    current_value: Optional[Decimal]
    percent_achieved: Optional[float]
    status: str
    trend: str  # "improving" | "stable" | "declining" | "insufficient_data"
    latest_recorded_date: Optional[date]
    value_history: List[IndicatorValueResponse] = Field(default_factory=list)
