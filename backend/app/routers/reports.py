"""
Report generation endpoints.

Routes:
  GET /api/reports/merl-summary     – full JSON status report
  GET /api/reports/export/pdf       – generate and stream a PDF report
  GET /api/reports/export/excel     – generate and stream an Excel workbook
"""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_db
from app.models.activities import Activity
from app.models.financials import FinancialTransaction
from app.models.indicators import Indicator, IndicatorValue
from app.services.exports import generate_excel_report, generate_pdf_report

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Summary builder ───────────────────────────────────────────────────────────


async def _build_merl_summary(db: AsyncSession) -> dict:
    """
    Compile a full MERL summary from PostgreSQL, including:
    - Indicator status counts
    - Activity completion statistics
    - Financial totals
    """
    # Indicator counts by status
    ind_result = await db.execute(
        select(Indicator.status, func.count(Indicator.id).label("count"))
        .where(Indicator.is_active == True)  # noqa: E712
        .group_by(Indicator.status)
    )
    indicator_counts = {row.status: row.count for row in ind_result}

    # Latest indicator values (subquery for latest per indicator)
    from sqlalchemy import and_

    # Activity status breakdown
    act_result = await db.execute(
        select(Activity.status, func.count(Activity.id).label("count"))
        .where(Activity.is_active == True)  # noqa: E712
        .group_by(Activity.status)
    )
    activity_counts = {row.status: row.count for row in act_result}
    total_activities = sum(activity_counts.values())
    completed = activity_counts.get("completed", 0)
    completion_rate = round(completed / total_activities * 100, 1) if total_activities else 0.0

    # Financial totals
    fin_result = await db.execute(
        select(
            FinancialTransaction.transaction_type,
            func.sum(FinancialTransaction.amount).label("total"),
        ).group_by(FinancialTransaction.transaction_type)
    )
    financial_totals = {row.transaction_type: float(row.total or 0) for row in fin_result}

    return {
        "report_type": "merl_summary",
        "indicators": {
            "total_active": sum(indicator_counts.values()),
            "by_status": indicator_counts,
        },
        "activities": {
            "total_active": total_activities,
            "completion_rate_pct": completion_rate,
            "by_status": activity_counts,
        },
        "financials": {
            "by_transaction_type": financial_totals,
            "total_disbursed": financial_totals.get("disbursement", 0.0),
            "total_spent": financial_totals.get("expenditure", 0.0),
        },
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/reports/merl-summary")
async def get_merl_summary(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    """
    Return a full JSON MERL status report, including indicator summary,
    activity completion, and financial totals.
    """
    return await _build_merl_summary(db)


@router.get("/reports/export/pdf")
async def export_pdf(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Generate a PDF MERL summary report and stream it to the client.
    Uses ReportLab under the hood (see services/exports.py).
    """
    summary = await _build_merl_summary(db)

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, generate_pdf_report, summary)

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="merl_summary_report.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/reports/export/excel")
async def export_excel(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Generate an Excel MERL workbook and stream it to the client.
    Uses openpyxl under the hood (see services/exports.py).
    """
    summary = await _build_merl_summary(db)

    # Fetch full tables for Excel sheets
    ind_result = await db.execute(
        select(Indicator).where(Indicator.is_active == True)  # noqa: E712
    )
    indicators = ind_result.scalars().all()

    act_result = await db.execute(
        select(Activity).where(Activity.is_active == True)  # noqa: E712
    )
    activities = act_result.scalars().all()

    fin_result = await db.execute(
        select(FinancialTransaction).order_by(
            FinancialTransaction.transaction_date.desc()
        ).limit(1000)
    )
    transactions = fin_result.scalars().all()

    data_dict = {
        "summary": summary,
        "indicators": [
            {
                "code": i.code,
                "name": i.name,
                "domain": i.domain,
                "status": i.status,
                "target": float(i.target_value or 0),
                "unit": i.unit,
            }
            for i in indicators
        ],
        "activities": [
            {
                "code": a.code,
                "name": a.name,
                "domain": a.domain,
                "status": a.status,
                "completion_pct": a.completion_percentage,
                "planned_start": str(a.planned_start_date or ""),
                "planned_end": str(a.planned_end_date or ""),
            }
            for a in activities
        ],
        "transactions": [
            {
                "date": str(t.transaction_date),
                "type": t.transaction_type,
                "amount": float(t.amount),
                "currency": t.currency,
                "domain": t.domain,
                "description": t.description or "",
            }
            for t in transactions
        ],
    }

    loop = asyncio.get_event_loop()
    excel_bytes = await loop.run_in_executor(None, generate_excel_report, data_dict)

    return StreamingResponse(
        iter([excel_bytes]),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": 'attachment; filename="merl_report.xlsx"',
            "Content-Length": str(len(excel_bytes)),
        },
    )
