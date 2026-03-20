"""
Financial endpoints.

Routes:
  GET  /api/financials/summary       – totals by period from ClickHouse
  GET  /api/financials/transactions  – paginated list of transactions
  POST /api/financials/transactions  – create a new transaction
"""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_clickhouse, get_db
from app.models.financials import (
    DomainFinancialSummary,
    FinancialSummary,
    FinancialTransaction,
    TransactionCreate,
    TransactionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _query_financial_summary(period_label: Optional[str]) -> FinancialSummary:
    """Run synchronous ClickHouse aggregation query."""
    with get_clickhouse() as ch:
        where_clause = (
            f"WHERE period_label = '{period_label}'" if period_label else ""
        )
        domain_rows = ch.execute(
            f"""
            SELECT
                domain,
                sumIf(amount, transaction_type = 'commitment')   AS committed,
                sumIf(amount, transaction_type = 'disbursement') AS disbursed,
                sumIf(amount, transaction_type = 'expenditure')  AS spent
            FROM financial_transactions
            {where_clause}
            GROUP BY domain
            ORDER BY domain
            """
        )
        totals_row = ch.execute(
            f"""
            SELECT
                sumIf(amount, transaction_type = 'commitment')   AS total_committed,
                sumIf(amount, transaction_type = 'disbursement') AS total_disbursed,
                sumIf(amount, transaction_type = 'expenditure')  AS total_spent
            FROM financial_transactions
            {where_clause}
            """
        )
        type_rows = ch.execute(
            f"""
            SELECT transaction_type, sum(amount) AS total
            FROM financial_transactions
            {where_clause}
            GROUP BY transaction_type
            """
        )

    committed = Decimal(str(totals_row[0][0] or 0))
    disbursed = Decimal(str(totals_row[0][1] or 0))
    spent = Decimal(str(totals_row[0][2] or 0))
    balance = committed - spent
    absorption = float(spent / disbursed * 100) if disbursed else 0.0

    by_domain = [
        DomainFinancialSummary(
            domain=r[0],
            total_committed=Decimal(str(r[1] or 0)),
            total_disbursed=Decimal(str(r[2] or 0)),
            total_spent=Decimal(str(r[3] or 0)),
            balance=Decimal(str(r[1] or 0)) - Decimal(str(r[3] or 0)),
        )
        for r in domain_rows
    ]
    by_type = {r[0]: Decimal(str(r[1] or 0)) for r in type_rows}

    return FinancialSummary(
        period_label=period_label,
        total_committed=committed,
        total_disbursed=disbursed,
        total_spent=spent,
        overall_balance=balance,
        absorption_rate=round(absorption, 2),
        by_domain=by_domain,
        by_transaction_type=by_type,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/financials/summary", response_model=FinancialSummary)
async def get_financial_summary(
    period_label: Optional[str] = Query(
        default=None,
        description="Filter by period label, e.g. 'Q1-2024'. Omit for all-time.",
    ),
    _user: User = Depends(get_current_user),
) -> FinancialSummary:
    """
    Aggregate financial totals from ClickHouse.
    Returns overall and per-domain committed / disbursed / spent figures.
    """
    try:
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, _query_financial_summary, period_label
        )
        return summary
    except Exception as exc:
        logger.error("ClickHouse financial summary error: %s", exc)
        # Return empty summary rather than 503 so the dashboard still renders.
        return FinancialSummary(
            period_label=period_label,
            total_committed=Decimal("0"),
            total_disbursed=Decimal("0"),
            total_spent=Decimal("0"),
            overall_balance=Decimal("0"),
            absorption_rate=0.0,
        )


@router.get("/financials/transactions", response_model=List[TransactionResponse])
async def list_transactions(
    domain: Optional[str] = Query(default=None),
    transaction_type: Optional[str] = Query(default=None),
    period_label: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> List[TransactionResponse]:
    """Return a paginated, filtered list of financial transactions from PostgreSQL."""
    stmt = select(FinancialTransaction)
    if domain:
        stmt = stmt.where(FinancialTransaction.domain == domain)
    if transaction_type:
        stmt = stmt.where(FinancialTransaction.transaction_type == transaction_type)
    if period_label:
        stmt = stmt.where(FinancialTransaction.period_label == period_label)
    stmt = (
        stmt.order_by(FinancialTransaction.transaction_date.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(stmt)
    transactions = result.scalars().all()
    return [TransactionResponse.model_validate(t) for t in transactions]


@router.post(
    "/financials/transactions",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TransactionResponse:
    """Record a new financial transaction."""
    tx = FinancialTransaction(**payload.model_dump(), created_by=user.email)
    db.add(tx)
    await db.flush()
    await db.refresh(tx)
    return TransactionResponse.model_validate(tx)
