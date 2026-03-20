"""
ORM models and Pydantic schemas for Project Activities.

Tables (schema: merl):
  - merl.activities          – work-plan activity definitions
  - merl.activity_milestones – deliverables / milestones per activity
"""

from __future__ import annotations

from datetime import date, datetime
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


class Activity(Base):
    """A project work-plan activity."""

    __tablename__ = "activities"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    responsible_party: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    planned_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    planned_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="not_started"
    )  # not_started | in_progress | completed | delayed | cancelled
    completion_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    budget_allocated: Mapped[Optional[float]] = mapped_column(Numeric(15, 2), nullable=True)
    budget_spent: Mapped[Optional[float]] = mapped_column(Numeric(15, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    milestones: Mapped[List["ActivityMilestone"]] = relationship(
        "ActivityMilestone", back_populates="activity", cascade="all, delete-orphan"
    )


class ActivityMilestone(Base):
    """A deliverable / milestone associated with an activity."""

    __tablename__ = "activity_milestones"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    activity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("merl.activities.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    activity: Mapped["Activity"] = relationship("Activity", back_populates="milestones")


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel, ConfigDict, Field, model_validator  # noqa: E402


class ActivityCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=500)
    description: Optional[str] = None
    output: Optional[str] = None
    domain: str = Field(..., max_length=100)
    responsible_party: Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    budget_allocated: Optional[float] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _dates_consistent(self) -> "ActivityCreate":
        if (
            self.planned_start_date
            and self.planned_end_date
            and self.planned_end_date < self.planned_start_date
        ):
            raise ValueError("planned_end_date must be on or after planned_start_date.")
        return self


class ActivityUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(not_started|in_progress|completed|delayed|cancelled)$",
    )
    completion_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    budget_spent: Optional[float] = None
    notes: Optional[str] = None


class MilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    activity_id: int
    title: str
    description: Optional[str]
    due_date: Optional[date]
    completed_date: Optional[date]
    is_completed: bool
    sort_order: int
    created_at: datetime


class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str]
    output: Optional[str]
    domain: str
    responsible_party: Optional[str]
    planned_start_date: Optional[date]
    planned_end_date: Optional[date]
    actual_start_date: Optional[date]
    actual_end_date: Optional[date]
    status: str
    completion_percentage: int
    budget_allocated: Optional[float]
    budget_spent: Optional[float]
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    milestones: List[MilestoneResponse] = Field(default_factory=list)


class GanttItem(BaseModel):
    """A single row in the Gantt chart view."""

    id: int
    code: str
    name: str
    domain: str
    responsible_party: Optional[str]
    planned_start: Optional[date]
    planned_end: Optional[date]
    actual_start: Optional[date]
    actual_end: Optional[date]
    status: str
    completion_percentage: int
    milestones: List[MilestoneResponse] = Field(default_factory=list)
