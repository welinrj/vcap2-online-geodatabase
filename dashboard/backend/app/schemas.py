from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel


# ── Activity Progress ──────────────────────────────────────────────────────────

class ActivityProgressBase(BaseModel):
    quarter: str
    status: str
    actual_usd: Optional[Decimal] = Decimal("0")
    percent_done: Optional[int] = 0
    notes: Optional[str] = None
    updated_by: Optional[str] = None


class ActivityProgressCreate(ActivityProgressBase):
    pass


class ActivityProgressUpdate(BaseModel):
    status: Optional[str] = None
    actual_usd: Optional[Decimal] = None
    percent_done: Optional[int] = None
    notes: Optional[str] = None
    updated_by: Optional[str] = None


class ActivityProgressOut(ActivityProgressBase):
    id: int
    activity_id: int
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Activity ──────────────────────────────────────────────────────────────────

class ActivityBase(BaseModel):
    code: str
    description: str
    output: str
    fund: str
    gl_account: str
    budget_usd: Optional[Decimal] = None
    q1_budget: Optional[Decimal] = None
    q2_budget: Optional[Decimal] = None
    q3_budget: Optional[Decimal] = None
    q4_budget: Optional[Decimal] = None
    responsible: Optional[str] = "IP 009198"
    notes: Optional[str] = None


class ActivityCreate(ActivityBase):
    pass


class ActivityOut(ActivityBase):
    id: int
    progress: List[ActivityProgressOut] = []

    model_config = {"from_attributes": True}


# ── Indicator Progress ─────────────────────────────────────────────────────────

class IndicatorProgressBase(BaseModel):
    quarter: str
    value: Optional[Decimal] = None
    notes: Optional[str] = None


class IndicatorProgressCreate(IndicatorProgressBase):
    pass


class IndicatorProgressOut(IndicatorProgressBase):
    id: int
    indicator_id: int
    recorded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Indicator ─────────────────────────────────────────────────────────────────

class IndicatorBase(BaseModel):
    code: str
    name: str
    baseline_ha: Optional[Decimal] = None
    target_ha: Optional[Decimal] = None
    unit: Optional[str] = "ha"


class IndicatorCreate(IndicatorBase):
    pass


class IndicatorOut(IndicatorBase):
    id: int
    progress: List[IndicatorProgressOut] = []

    model_config = {"from_attributes": True}


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    is_active: bool

    model_config = {"from_attributes": True}


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# ── Summary ───────────────────────────────────────────────────────────────────

class IndicatorSummary(BaseModel):
    code: str
    name: str
    target_ha: Optional[Decimal]
    latest_value: Optional[Decimal]
    percent_achieved: Optional[float]


class SummaryOut(BaseModel):
    total_budget_usd: Decimal
    direct_budget_usd: Decimal
    component3_budget_usd: Decimal
    spent_usd: Decimal
    percent_spent: float
    activities_total: int
    activities_by_status: dict
    activities_by_output: dict
    budget_by_fund: dict
    budget_by_quarter: dict
    spent_by_quarter: dict
    indicators: List[IndicatorSummary]


class BurnRow(BaseModel):
    quarter: str
    planned_usd: Decimal
    actual_usd: Decimal
    cumulative_planned: Decimal
    cumulative_actual: Decimal
