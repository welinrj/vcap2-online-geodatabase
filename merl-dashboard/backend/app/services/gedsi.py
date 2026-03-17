"""
GEDSI (Gender Equality, Disability and Social Inclusion) disaggregation service.

Provides analytical functions for disaggregating community engagement data by:
  - Gender (male / female / unknown)
  - Age group (youth / adult / elderly)
  - Disability inclusion
  - Province (geographic distribution)
  - Full composite GEDSI summary report

These functions operate on either in-memory lists of ORM objects (for fast
route-level use) or query ClickHouse directly for aggregate reporting.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.database import get_clickhouse

logger = logging.getLogger(__name__)


# ── Type alias ────────────────────────────────────────────────────────────────

EngagementLike = Any  # ORM model or dict-like object with participant fields


def _get(obj: EngagementLike, field: str, default: int = 0) -> int:
    """Safely extract an integer field from an ORM model or dict."""
    if isinstance(obj, dict):
        return int(obj.get(field) or default)
    return int(getattr(obj, field, default) or default)


# ── In-memory disaggregation helpers ─────────────────────────────────────────


def disaggregate_by_gender(engagements: List[EngagementLike]) -> Dict:
    """
    Compute male / female / unknown participation rates from a list of
    engagement objects or dicts.

    Returns:
        {
            total_participants, male, female, unknown,
            male_pct, female_pct, unknown_pct,
            gender_parity_index
        }
    """
    total = sum(_get(e, "total_participants") for e in engagements)
    male = sum(_get(e, "male_participants") for e in engagements)
    female = sum(_get(e, "female_participants") for e in engagements)
    unknown = max(0, total - male - female)

    def pct(n: int) -> float:
        return round(n / total * 100, 1) if total else 0.0

    gpi = round(female / male, 3) if male else None

    return {
        "total_participants": total,
        "male": male,
        "female": female,
        "unknown_gender": unknown,
        "male_pct": pct(male),
        "female_pct": pct(female),
        "unknown_pct": pct(unknown),
        "gender_parity_index": gpi,
    }


def disaggregate_by_age(engagements: List[EngagementLike]) -> Dict:
    """
    Compute youth / adult / elderly participation rates.

    Adults are calculated as: total - youth - elderly (residual).

    Returns:
        {
            total_participants, youth, elderly, adult,
            youth_pct, elderly_pct, adult_pct
        }
    """
    total = sum(_get(e, "total_participants") for e in engagements)
    youth = sum(_get(e, "youth_participants") for e in engagements)
    elderly = sum(_get(e, "elderly_participants") for e in engagements)
    adult = max(0, total - youth - elderly)

    def pct(n: int) -> float:
        return round(n / total * 100, 1) if total else 0.0

    return {
        "total_participants": total,
        "youth": youth,
        "elderly": elderly,
        "adult": adult,
        "youth_pct": pct(youth),
        "elderly_pct": pct(elderly),
        "adult_pct": pct(adult),
    }


def disaggregate_by_disability(engagements: List[EngagementLike]) -> Dict:
    """
    Compute disability inclusion rates.

    Returns:
        {
            total_participants, with_disability, without_disability,
            inclusion_rate_pct
        }
    """
    total = sum(_get(e, "total_participants") for e in engagements)
    with_disability = sum(_get(e, "disability_participants") for e in engagements)
    without = max(0, total - with_disability)

    inclusion_rate = round(with_disability / total * 100, 1) if total else 0.0

    return {
        "total_participants": total,
        "with_disability": with_disability,
        "without_disability": without,
        "inclusion_rate_pct": inclusion_rate,
    }


def disaggregate_by_province(engagements: List[EngagementLike]) -> List[Dict]:
    """
    Compute geographic distribution of participants by province.

    Returns a list of dicts sorted by participant count descending:
        [{ province, engagement_count, total_participants, participation_share_pct }, ...]
    """
    province_data: Dict[str, Dict] = {}
    grand_total = sum(_get(e, "total_participants") for e in engagements)

    for e in engagements:
        province = (
            e.get("province") if isinstance(e, dict) else getattr(e, "province", None)
        ) or "Unknown"
        if province not in province_data:
            province_data[province] = {"engagement_count": 0, "total_participants": 0}
        province_data[province]["engagement_count"] += 1
        province_data[province]["total_participants"] += _get(e, "total_participants")

    result = []
    for province, data in sorted(
        province_data.items(), key=lambda x: x[1]["total_participants"], reverse=True
    ):
        share = (
            round(data["total_participants"] / grand_total * 100, 1)
            if grand_total
            else 0.0
        )
        result.append(
            {
                "province": province,
                "engagement_count": data["engagement_count"],
                "total_participants": data["total_participants"],
                "participation_share_pct": share,
            }
        )
    return result


# ── Full GEDSI summary report from ClickHouse ─────────────────────────────────


def get_gedsi_summary_report(
    province: Optional[str] = None,
    period: Optional[str] = None,
) -> Dict:
    """
    Build a comprehensive GEDSI summary report by querying ClickHouse directly.

    Args:
        province: Optional province filter.
        period:   Optional period label filter (e.g. "Q1-2024").

    Returns a full summary dict including gender, age, disability, geographic,
    and indigenous participation breakdowns.
    """
    conditions: List[str] = []
    if province:
        conditions.append(f"province = '{province}'")
    if period:
        conditions.append(f"period_label = '{period}'")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        with get_clickhouse() as ch:
            main = ch.execute(
                f"""
                SELECT
                    count()                                 AS engagements,
                    sum(total_participants)                 AS total,
                    sum(male_participants)                  AS male,
                    sum(female_participants)                AS female,
                    sum(youth_participants)                 AS youth,
                    sum(elderly_participants)               AS elderly,
                    sum(disability_participants)            AS disability,
                    sum(indigenous_participants)            AS indigenous
                FROM community_engagements
                {where}
                """
            )
            prov_rows = ch.execute(
                f"""
                SELECT
                    province,
                    count()                                 AS engagements,
                    sum(total_participants)                 AS participants,
                    sum(female_participants)                AS female,
                    sum(youth_participants)                 AS youth,
                    sum(disability_participants)            AS disability
                FROM community_engagements
                {where}
                GROUP BY province
                ORDER BY participants DESC
                """
            )
            type_rows = ch.execute(
                f"""
                SELECT
                    engagement_type,
                    count()                                 AS engagements,
                    sum(total_participants)                 AS participants
                FROM community_engagements
                {where}
                GROUP BY engagement_type
                ORDER BY engagements DESC
                """
            )

        r = main[0]
        total = int(r[1] or 0)
        male = int(r[2] or 0)
        female = int(r[3] or 0)
        youth = int(r[4] or 0)
        elderly = int(r[5] or 0)
        disability = int(r[6] or 0)
        indigenous = int(r[7] or 0)
        adult = max(0, total - youth - elderly)
        unknown_gender = max(0, total - male - female)

        def pct(n: int) -> float:
            return round(n / total * 100, 1) if total else 0.0

        return {
            "filters": {"province": province, "period": period},
            "total_engagements": int(r[0] or 0),
            "total_participants": total,
            "gender": {
                "male": male,
                "female": female,
                "unknown": unknown_gender,
                "male_pct": pct(male),
                "female_pct": pct(female),
                "gender_parity_index": round(female / male, 3) if male else None,
            },
            "age": {
                "youth": youth,
                "adult": adult,
                "elderly": elderly,
                "youth_pct": pct(youth),
                "adult_pct": pct(adult),
                "elderly_pct": pct(elderly),
            },
            "disability": {
                "with_disability": disability,
                "inclusion_rate_pct": pct(disability),
            },
            "indigenous": {
                "indigenous_participants": indigenous,
                "rate_pct": pct(indigenous),
            },
            "by_province": [
                {
                    "province": row[0] or "Unknown",
                    "engagements": int(row[1] or 0),
                    "participants": int(row[2] or 0),
                    "female": int(row[3] or 0),
                    "youth": int(row[4] or 0),
                    "disability": int(row[5] or 0),
                }
                for row in prov_rows
            ],
            "by_engagement_type": [
                {
                    "type": row[0],
                    "engagements": int(row[1] or 0),
                    "participants": int(row[2] or 0),
                }
                for row in type_rows
            ],
        }

    except Exception as exc:
        logger.error(
            "get_gedsi_summary_report(province=%s, period=%s) failed: %s",
            province,
            period,
            exc,
        )
        return {
            "filters": {"province": province, "period": period},
            "error": str(exc),
        }
