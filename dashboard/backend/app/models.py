from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, Text, Numeric, Boolean, ForeignKey, TIMESTAMP, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    output = Column(Text, nullable=False)   # "1.1.1" | "1.1.2" | "1.1.3" | "3.2.1"
    fund = Column(Text, nullable=False)     # "GEF/TF" | "LDCF"
    gl_account = Column(Text, nullable=False)
    budget_usd = Column(Numeric(12, 2))
    q1_budget = Column(Numeric(12, 2))
    q2_budget = Column(Numeric(12, 2))
    q3_budget = Column(Numeric(12, 2))
    q4_budget = Column(Numeric(12, 2))
    responsible = Column(Text, default="IP 009198")
    notes = Column(Text)

    progress = relationship("ActivityProgress", back_populates="activity", cascade="all, delete-orphan")


class ActivityProgress(Base):
    __tablename__ = "activity_progress"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    quarter = Column(Text, nullable=False)   # "Q1" | "Q2" | "Q3" | "Q4"
    status = Column(Text, nullable=False)    # "not_started" | "in_progress" | "completed" | "delayed"
    actual_usd = Column(Numeric(12, 2), default=0)
    percent_done = Column(Integer, default=0)
    notes = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Text)

    activity = relationship("Activity", back_populates="progress")


class Indicator(Base):
    __tablename__ = "indicators"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    baseline_ha = Column(Numeric(10, 2))
    target_ha = Column(Numeric(10, 2))
    unit = Column(Text, default="ha")

    progress = relationship("IndicatorProgress", back_populates="indicator", cascade="all, delete-orphan")


class IndicatorProgress(Base):
    __tablename__ = "indicator_progress"

    id = Column(Integer, primary_key=True, index=True)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), nullable=False)
    quarter = Column(Text, nullable=False)
    value = Column(Numeric(10, 2))
    recorded_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    notes = Column(Text)

    indicator = relationship("Indicator", back_populates="progress")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(Text, unique=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
