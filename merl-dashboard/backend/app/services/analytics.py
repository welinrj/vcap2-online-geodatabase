"""
Analytics service layer.

Pure business-logic functions that aggregate data across PostgreSQL and ClickHouse.
These are synchronous helpers designed to be called from async route handlers via
asyncio.get_event_loop().run_in_executor() where necessary.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Dict, List, Optional

from app.database import get_clickhouse

logger = logging.getLogger(__name__)


# ── KPI Progress ──────────────────────────────────────────────────────────────


def compute_kpi_progress(indicator_id: int) -> Dict:
    """
    Retrieve the most recent KPI snapshot from ClickHouse kpi_snapshots and
    compute progress against the target value.

    Returns a dict with keys:
      - indicator_id
      - current_value
      - target_value
      - percent_achieved
      - status
      - snapshot_date
    """
    try:
        with get_clickhouse() as ch:
            rows = ch.execute(
                """
                SELECT
                    indicator_id,
                    current_value,
                    target_value,
                    percent_achieved,
                    status,
                    snapshot_date
                FROM kpi_snapshots
                WHERE indicator_id = %(id)s
                ORDER BY snapshot_date DESC
                LIMIT 1
                """,
                {"id": indicator_id},
            )

        if not rows:
            return {
                "indicator_id": indicator_id,
                "current_value": None,
                "target_value": None,
                "percent_achieved": None,
                "status": "no_data",
                "snapshot_date": None,
            }

        row = rows[0]
        current = float(row[1]) if row[1] is not None else None
        target = float(row[2]) if row[2] is not None else None
        pct = float(row[3]) if row[3] is not None else None

        return {
            "indicator_id": int(row[0]),
            "current_value": current,
            "target_value": target,
            "percent_achieved": pct,
            "status": str(row[4]),
            "snapshot_date": str(row[5]) if row[5] else None,
        }
    except Exception as exc:
        logger.error("compute_kpi_progress(%d) failed: %s", indicator_id, exc)
        return {
            "indicator_id": indicator_id,
            "error": str(exc),
        }


# ── Activity Completion Rate ──────────────────────────────────────────────────


def get_activity_completion_rate() -> Dict:
    """
    Query ClickHouse activity_snapshots to compute the percentage of activities
    in 'completed' status.

    Returns a dict with keys:
      - total_activities
      - completed_activities
      - completion_rate_pct
      - by_domain (list of {domain, total, completed, rate_pct})
    """
    try:
        with get_clickhouse() as ch:
            totals = ch.execute(
                """
                SELECT
                    count()                              AS total,
                    countIf(status = 'completed')        AS completed
                FROM activity_snapshots
                WHERE snapshot_date = (SELECT max(snapshot_date) FROM activity_snapshots)
                """
            )
            domain_rows = ch.execute(
                """
                SELECT
                    domain,
                    count()                              AS total,
                    countIf(status = 'completed')        AS completed
                FROM activity_snapshots
                WHERE snapshot_date = (SELECT max(snapshot_date) FROM activity_snapshots)
                GROUP BY domain
                ORDER BY domain
                """
            )

        total = int(totals[0][0] or 0)
        completed = int(totals[0][1] or 0)
        rate = round(completed / total * 100, 1) if total else 0.0

        by_domain = []
        for r in domain_rows:
            d_total = int(r[1] or 0)
            d_completed = int(r[2] or 0)
            by_domain.append(
                {
                    "domain": r[0],
                    "total": d_total,
                    "completed": d_completed,
                    "rate_pct": round(d_completed / d_total * 100, 1) if d_total else 0.0,
                }
            )

        return {
            "total_activities": total,
            "completed_activities": completed,
            "completion_rate_pct": rate,
            "by_domain": by_domain,
        }
    except Exception as exc:
        logger.error("get_activity_completion_rate() failed: %s", exc)
        return {"error": str(exc)}


# ── Financial Summary ─────────────────────────────────────────────────────────


def aggregate_financial_summary(period: Optional[str] = None) -> Dict:
    """
    Aggregate financial transaction totals from ClickHouse, grouped by domain.

    Args:
        period: Optional period label filter (e.g. "Q2-2024").

    Returns a dict with:
      - period
      - total_committed, total_disbursed, total_spent
      - absorption_rate_pct
      - by_domain (list of per-domain breakdowns)
    """
    where = f"WHERE period_label = '{period}'" if period else ""
    try:
        with get_clickhouse() as ch:
            overview = ch.execute(
                f"""
                SELECT
                    sumIf(amount, transaction_type = 'commitment')   AS committed,
                    sumIf(amount, transaction_type = 'disbursement') AS disbursed,
                    sumIf(amount, transaction_type = 'expenditure')  AS spent
                FROM financial_transactions
                {where}
                """
            )
            domains = ch.execute(
                f"""
                SELECT
                    domain,
                    sumIf(amount, transaction_type = 'commitment')   AS committed,
                    sumIf(amount, transaction_type = 'disbursement') AS disbursed,
                    sumIf(amount, transaction_type = 'expenditure')  AS spent
                FROM financial_transactions
                {where}
                GROUP BY domain
                ORDER BY committed DESC
                """
            )

        committed = float(overview[0][0] or 0)
        disbursed = float(overview[0][1] or 0)
        spent = float(overview[0][2] or 0)
        absorption = round(spent / disbursed * 100, 1) if disbursed else 0.0

        by_domain = [
            {
                "domain": r[0],
                "committed": float(r[1] or 0),
                "disbursed": float(r[2] or 0),
                "spent": float(r[3] or 0),
                "balance": float(r[1] or 0) - float(r[3] or 0),
            }
            for r in domains
        ]

        return {
            "period": period,
            "total_committed": committed,
            "total_disbursed": disbursed,
            "total_spent": spent,
            "absorption_rate_pct": absorption,
            "by_domain": by_domain,
        }
    except Exception as exc:
        logger.error("aggregate_financial_summary() failed: %s", exc)
        return {"period": period, "error": str(exc)}


# ── Engagement Rates ──────────────────────────────────────────────────────────


def compute_engagement_rates() -> Dict:
    """
    Perform GEDSI disaggregation analysis across all community engagements
    stored in ClickHouse.

    Returns a dict with:
      - total_engagements
      - total_participants
      - gender_parity_index   (female / male ratio)
      - female_pct, male_pct
      - youth_pct
      - disability_inclusion_pct
      - indigenous_inclusion_pct
      - by_province           (list)
      - by_engagement_type    (list)
    """
    try:
        with get_clickhouse() as ch:
            summary = ch.execute(
                """
                SELECT
                    count()                                AS engagements,
                    sum(total_participants)                AS total,
                    sum(male_participants)                 AS male,
                    sum(female_participants)               AS female,
                    sum(youth_participants)                AS youth,
                    sum(disability_participants)           AS disability,
                    sum(indigenous_participants)           AS indigenous
                FROM community_engagements
                """
            )
            by_province = ch.execute(
                """
                SELECT
                    province,
                    count()                AS engagements,
                    sum(total_participants) AS participants
                FROM community_engagements
                GROUP BY province
                ORDER BY participants DESC
                LIMIT 20
                """
            )
            by_type = ch.execute(
                """
                SELECT
                    engagement_type,
                    count()                AS engagements,
                    sum(total_participants) AS participants
                FROM community_engagements
                GROUP BY engagement_type
                ORDER BY engagements DESC
                """
            )

        r = summary[0]
        total = int(r[1] or 0)
        male = int(r[2] or 0)
        female = int(r[3] or 0)
        youth = int(r[4] or 0)
        disability = int(r[5] or 0)
        indigenous = int(r[6] or 0)

        def pct(n: int) -> float:
            return round(n / total * 100, 1) if total else 0.0

        gpi = round(female / male, 3) if male else None

        return {
            "total_engagements": int(r[0] or 0),
            "total_participants": total,
            "gender_parity_index": gpi,
            "male_pct": pct(male),
            "female_pct": pct(female),
            "youth_pct": pct(youth),
            "disability_inclusion_pct": pct(disability),
            "indigenous_inclusion_pct": pct(indigenous),
            "by_province": [
                {
                    "province": row[0] or "Unknown",
                    "engagements": int(row[1] or 0),
                    "participants": int(row[2] or 0),
                }
                for row in by_province
            ],
            "by_engagement_type": [
                {
                    "type": row[0],
                    "engagements": int(row[1] or 0),
                    "participants": int(row[2] or 0),
                }
                for row in by_type
            ],
        }
    except Exception as exc:
        logger.error("compute_engagement_rates() failed: %s", exc)
        return {"error": str(exc)}
