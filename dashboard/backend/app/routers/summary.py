from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import models, schemas

router = APIRouter(tags=["summary"])

TOTAL_BUDGET = Decimal("428361")
DIRECT_BUDGET = Decimal("395361")
COMPONENT3_BUDGET = Decimal("33000")

QUARTERS = ["Q1", "Q2", "Q3", "Q4"]


@router.get("/api/summary", response_model=schemas.SummaryOut)
def get_summary(db: Session = Depends(get_db)):
    activities = db.query(models.Activity).all()
    all_progress = db.query(models.ActivityProgress).all()
    indicators = db.query(models.Indicator).all()

    # Spent
    spent_usd = sum(
        (p.actual_usd or Decimal("0")) for p in all_progress
    )

    percent_spent = float(spent_usd / TOTAL_BUDGET * 100) if TOTAL_BUDGET else 0.0

    # Activities by status — use the latest status per activity across all quarters
    # If an activity has no progress rows, count as not_started
    status_map: dict[int, str] = {}
    for p in all_progress:
        # Priority: completed > in_progress > delayed > not_started
        priority = {"completed": 4, "in_progress": 3, "delayed": 2, "not_started": 1}
        current = status_map.get(p.activity_id)
        new_p = priority.get(p.status, 0)
        if current is None or new_p > priority.get(current, 0):
            status_map[p.activity_id] = p.status

    activities_by_status = {"not_started": 0, "in_progress": 0, "completed": 0, "delayed": 0}
    for act in activities:
        s = status_map.get(act.id, "not_started")
        activities_by_status[s] = activities_by_status.get(s, 0) + 1

    # Activities by output
    activities_by_output: dict[str, int] = {}
    for act in activities:
        activities_by_output[act.output] = activities_by_output.get(act.output, 0) + 1

    # Budget by fund
    budget_by_fund: dict[str, Decimal] = {}
    for act in activities:
        f = act.fund
        budget_by_fund[f] = budget_by_fund.get(f, Decimal("0")) + (act.budget_usd or Decimal("0"))

    # Budget by quarter
    budget_by_quarter: dict[str, Decimal] = {q: Decimal("0") for q in QUARTERS}
    q_map = {"Q1": "q1_budget", "Q2": "q2_budget", "Q3": "q3_budget", "Q4": "q4_budget"}
    for act in activities:
        for q, attr in q_map.items():
            budget_by_quarter[q] += getattr(act, attr) or Decimal("0")

    # Spent by quarter
    spent_by_quarter: dict[str, Decimal] = {q: Decimal("0") for q in QUARTERS}
    for p in all_progress:
        if p.quarter in spent_by_quarter:
            spent_by_quarter[p.quarter] += p.actual_usd or Decimal("0")

    # Indicator summaries
    indicator_summaries = []
    for ind in indicators:
        # Find latest value across all quarters (most recently recorded)
        latest_entry = None
        for entry in sorted(ind.progress, key=lambda x: x.recorded_at or 0, reverse=True):
            latest_entry = entry
            break

        latest_value = latest_entry.value if latest_entry else None
        target = ind.target_ha
        pct = None
        if latest_value is not None and target and target != 0:
            pct = float(latest_value / target * 100)

        indicator_summaries.append(
            schemas.IndicatorSummary(
                code=ind.code,
                name=ind.name,
                target_ha=target,
                latest_value=latest_value,
                percent_achieved=pct,
            )
        )

    return schemas.SummaryOut(
        total_budget_usd=TOTAL_BUDGET,
        direct_budget_usd=DIRECT_BUDGET,
        component3_budget_usd=COMPONENT3_BUDGET,
        spent_usd=spent_usd,
        percent_spent=percent_spent,
        activities_total=len(activities),
        activities_by_status=activities_by_status,
        activities_by_output=activities_by_output,
        budget_by_fund={k: v for k, v in budget_by_fund.items()},
        budget_by_quarter={k: v for k, v in budget_by_quarter.items()},
        spent_by_quarter={k: v for k, v in spent_by_quarter.items()},
        indicators=indicator_summaries,
    )


@router.get("/api/budget/burn", response_model=List[schemas.BurnRow])
def get_burn(db: Session = Depends(get_db)):
    activities = db.query(models.Activity).all()
    all_progress = db.query(models.ActivityProgress).all()

    q_map = {"Q1": "q1_budget", "Q2": "q2_budget", "Q3": "q3_budget", "Q4": "q4_budget"}

    planned: dict[str, Decimal] = {q: Decimal("0") for q in QUARTERS}
    actual: dict[str, Decimal] = {q: Decimal("0") for q in QUARTERS}

    for act in activities:
        for q, attr in q_map.items():
            planned[q] += getattr(act, attr) or Decimal("0")

    for p in all_progress:
        if p.quarter in actual:
            actual[p.quarter] += p.actual_usd or Decimal("0")

    rows = []
    cum_planned = Decimal("0")
    cum_actual = Decimal("0")
    for q in QUARTERS:
        cum_planned += planned[q]
        cum_actual += actual[q]
        rows.append(
            schemas.BurnRow(
                quarter=q,
                planned_usd=planned[q],
                actual_usd=actual[q],
                cumulative_planned=cum_planned,
                cumulative_actual=cum_actual,
            )
        )
    return rows


@router.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(models.Activity.__table__.select().limit(1))
        db_status = "connected"
    except Exception:
        db_status = "error"
    return {"status": "ok", "db": db_status}
