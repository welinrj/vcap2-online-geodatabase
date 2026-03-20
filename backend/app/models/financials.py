"""
ORM models and Pydantic schemas for Financial Transactions.

Table (schema: merl):
  - merl.financial_transactions – disbursements, commitments, expenditures
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# ── ORM Model ─────────────────────────────────────────────────────────────────


class FinancialTransaction(Base):
    """A financial transaction entry (disbursement / commitment / expenditure)."""

    __tablename__ = "financial_transactions"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_label: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # e.g. "Q1-2024"
    transaction_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # disbursement | commitment | expenditure | refund
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="VUV")
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    activity_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    donor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    funding_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    implementing_partner: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    reference_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
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


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402


class TransactionCreate(BaseModel):
    transaction_date: date
    period_label: Optional[str] = None
    transaction_type: str = Field(
        ..., pattern="^(disbursement|commitment|expenditure|refund)$"
    )
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="VUV", max_length=10)
    domain: str = Field(..., max_length=100)
    activity_code: Optional[str] = None
    description: Optional[str] = None
    donor: Optional[str] = None
    funding_source: Optional[str] = None
    implementing_partner: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_date: date
    period_label: Optional[str]
    transaction_type: str
    amount: Decimal
    currency: str
    domain: str
    activity_code: Optional[str]
    description: Optional[str]
    donor: Optional[str]
    funding_source: Optional[str]
    implementing_partner: Optional[str]
    reference_number: Optional[str]
    notes: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime


class DomainFinancialSummary(BaseModel):
    """Financial totals for a single domain."""

    domain: str
    total_committed: Decimal
    total_disbursed: Decimal
    total_spent: Decimal
    balance: Decimal  # committed - spent


class FinancialSummary(BaseModel):
    """Aggregated financial summary across all domains for a given period."""

    period_label: Optional[str]
    total_committed: Decimal
    total_disbursed: Decimal
    total_spent: Decimal
    overall_balance: Decimal
    absorption_rate: float  # spent / disbursed * 100
    by_domain: List[DomainFinancialSummary] = Field(default_factory=list)
    by_transaction_type: Dict[str, Decimal] = Field(default_factory=dict)
