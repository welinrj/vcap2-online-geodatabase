"""
kpi_computation.py
------------------
Airflow DAG: kpi_computation

Runs daily at 01:00 UTC (~midnight Vanuatu time, UTC+11).

Pipeline:
  1. fetch_indicators           — load active indicators from PostgreSQL
  2. compute_kpi_values         — for each indicator, compute current value,
                                  progress %, and trend direction
  3. store_kpi_snapshots        — insert computed snapshots into ClickHouse
  4. compute_financial_summaries — aggregate financial_transactions by domain/month
  5. compute_engagement_summaries — aggregate community_engagements GEDSI stats
  6. notify_completion          — log summary of all computed KPIs
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Connection / environment constants
# ---------------------------------------------------------------------------
POSTGRES_CONN_ID = "postgres_merl"

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "9000"))
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "merl_analytics")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "merl_ch_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

# ---------------------------------------------------------------------------
# Default args
# ---------------------------------------------------------------------------
default_args: dict[str, Any] = {
    "owner": "merl-team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


# ---------------------------------------------------------------------------
# Helper: get a ClickHouse client
# ---------------------------------------------------------------------------
def _get_ch_client():
    from clickhouse_driver import Client  # type: ignore[import]

    return Client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        database=CLICKHOUSE_DB,
        user=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD,
        connect_timeout=10,
        send_receive_timeout=30,
    )


# ---------------------------------------------------------------------------
# Task callables
# ---------------------------------------------------------------------------

def fetch_indicators(**context: Any) -> None:
    """
    Fetch all active indicators from PostgreSQL and push via XCom.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            i.id,
            i.code,
            i.name,
            i.unit,
            i.baseline_value,
            i.target_value,
            i.domain,
            i.data_source,
            i.measurement_frequency
        FROM   merl.indicators i
        WHERE  i.is_active = TRUE
        ORDER  BY i.domain, i.code;
    """
    rows = hook.get_records(sql)
    columns = [
        "id", "code", "name", "unit", "baseline_value",
        "target_value", "domain", "data_source", "measurement_frequency",
    ]
    indicators = [dict(zip(columns, row)) for row in rows]
    log.info("Fetched %d active indicator(s).", len(indicators))
    context["ti"].xcom_push(key="indicators", value=indicators)


def compute_kpi_values(**context: Any) -> None:
    """
    For each indicator:
      - retrieve the most recent indicator_value
      - compute progress % relative to target
      - compute trend vs. prior period value
    Push a list of KPI snapshot dicts via XCom.
    """
    ti = context["ti"]
    indicators: list[dict] = ti.xcom_pull(task_ids="fetch_indicators", key="indicators") or []

    if not indicators:
        log.warning("No active indicators found; nothing to compute.")
        ti.xcom_push(key="kpi_snapshots", value=[])
        return

    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)

    # Fetch latest two values for each indicator in a single query
    latest_sql = """
        SELECT DISTINCT ON (indicator_id)
            indicator_id,
            value,
            reporting_period_end,
            data_quality_score,
            verification_status
        FROM   merl.indicator_values
        WHERE  indicator_id = ANY(%s::uuid[])
        ORDER  BY indicator_id, reporting_period_end DESC;
    """

    prior_sql = """
        SELECT indicator_id, value, reporting_period_end
        FROM (
            SELECT
                indicator_id,
                value,
                reporting_period_end,
                ROW_NUMBER() OVER (
                    PARTITION BY indicator_id
                    ORDER BY reporting_period_end DESC
                ) AS rn
            FROM merl.indicator_values
            WHERE indicator_id = ANY(%s::uuid[])
        ) ranked
        WHERE rn = 2;
    """

    indicator_ids = [str(ind["id"]) for ind in indicators]

    latest_rows = hook.get_records(latest_sql, parameters=(indicator_ids,))
    prior_rows = hook.get_records(prior_sql, parameters=(indicator_ids,))

    # Build lookup dicts keyed by indicator_id (as string)
    latest_map: dict[str, dict] = {}
    for row in latest_rows:
        key = str(row[0])
        latest_map[key] = {
            "value": float(row[1]) if row[1] is not None else None,
            "reporting_period_end": row[2],
            "data_quality_score": row[3],
            "verification_status": row[4],
        }

    prior_map: dict[str, float] = {}
    for row in prior_rows:
        prior_map[str(row[0])] = float(row[1]) if row[1] is not None else None

    snapshots: list[dict] = []
    today = date.today()

    for ind in indicators:
        ind_id = str(ind["id"])
        latest = latest_map.get(ind_id)

        if latest is None or latest["value"] is None:
            log.debug("No values found for indicator %s (%s); skipping.", ind["code"], ind["name"])
            continue

        current_value = latest["value"]
        target_value = float(ind["target_value"]) if ind["target_value"] is not None else None
        baseline_value = float(ind["baseline_value"]) if ind["baseline_value"] is not None else None

        # Progress calculation
        progress_pct: float | None = None
        if target_value is not None and baseline_value is not None:
            total_needed = target_value - baseline_value
            if abs(total_needed) > 1e-9:
                progress_pct = round(((current_value - baseline_value) / total_needed) * 100, 2)
            else:
                progress_pct = 100.0 if current_value >= target_value else 0.0

        # Trend calculation
        prior_value = prior_map.get(ind_id)
        trend: str
        if prior_value is None:
            trend = "no_data"
        elif current_value > prior_value:
            trend = "increasing"
        elif current_value < prior_value:
            trend = "decreasing"
        else:
            trend = "stable"

        # Traffic-light status
        status: str
        if progress_pct is None:
            status = "unknown"
        elif progress_pct >= 90:
            status = "on_track"
        elif progress_pct >= 60:
            status = "at_risk"
        else:
            status = "off_track"

        snapshots.append(
            {
                "indicator_id": ind_id,
                "indicator_code": ind["code"],
                "indicator_name": ind["name"],
                "domain": ind["domain"],
                "unit": ind["unit"],
                "snapshot_date": today.isoformat(),
                "current_value": current_value,
                "baseline_value": baseline_value,
                "target_value": target_value,
                "progress_pct": progress_pct,
                "trend": trend,
                "status": status,
                "data_quality_score": latest.get("data_quality_score"),
                "verification_status": latest.get("verification_status"),
                "last_reported_period": str(latest.get("reporting_period_end", "")),
            }
        )

    log.info("Computed KPI values for %d indicator(s).", len(snapshots))
    ti.xcom_push(key="kpi_snapshots", value=snapshots)


def store_kpi_snapshots(**context: Any) -> None:
    """
    Insert KPI snapshots into ClickHouse ch_merl.kpi_snapshots.

    Expected ClickHouse table (ReplacingMergeTree):
        CREATE TABLE IF NOT EXISTS ch_merl.kpi_snapshots (
            indicator_id        String,
            indicator_code      String,
            indicator_name      String,
            domain              String,
            unit                String,
            snapshot_date       Date,
            current_value       Float64,
            baseline_value      Nullable(Float64),
            target_value        Nullable(Float64),
            progress_pct        Nullable(Float64),
            trend               String,
            status              String,
            data_quality_score  Nullable(Float64),
            verification_status String,
            last_reported_period String,
            inserted_at         DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree(inserted_at)
          ORDER BY (indicator_id, snapshot_date);
    """
    ti = context["ti"]
    snapshots: list[dict] = ti.xcom_pull(task_ids="compute_kpi_values", key="kpi_snapshots") or []

    if not snapshots:
        log.info("No KPI snapshots to store.")
        return

    client = _get_ch_client()

    rows = [
        (
            s["indicator_id"],
            s["indicator_code"],
            s["indicator_name"],
            s["domain"] or "",
            s["unit"] or "",
            date.fromisoformat(s["snapshot_date"]),
            s["current_value"],
            s["baseline_value"],
            s["target_value"],
            s["progress_pct"],
            s["trend"],
            s["status"],
            s["data_quality_score"],
            s["verification_status"] or "",
            s["last_reported_period"],
        )
        for s in snapshots
    ]

    client.execute(
        """
        INSERT INTO ch_merl.kpi_snapshots (
            indicator_id, indicator_code, indicator_name, domain, unit,
            snapshot_date, current_value, baseline_value, target_value,
            progress_pct, trend, status, data_quality_score,
            verification_status, last_reported_period
        ) VALUES
        """,
        rows,
    )
    log.info("Stored %d KPI snapshot(s) in ClickHouse.", len(rows))


def compute_financial_summaries(**context: Any) -> None:
    """
    Aggregate merl.financial_transactions by domain and calendar month,
    then upsert the results into ClickHouse ch_merl.financial_summaries.

    Expected ClickHouse table:
        CREATE TABLE IF NOT EXISTS ch_merl.financial_summaries (
            domain              String,
            summary_month       Date,
            total_allocated     Float64,
            total_disbursed     Float64,
            total_expended      Float64,
            disbursement_rate   Float64,
            expenditure_rate    Float64,
            transaction_count   UInt32,
            inserted_at         DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree(inserted_at)
          ORDER BY (domain, summary_month);
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            COALESCE(domain, 'unspecified')              AS domain,
            DATE_TRUNC('month', transaction_date)::date  AS summary_month,
            SUM(CASE WHEN transaction_type = 'allocation'  THEN amount ELSE 0 END) AS total_allocated,
            SUM(CASE WHEN transaction_type = 'disbursement' THEN amount ELSE 0 END) AS total_disbursed,
            SUM(CASE WHEN transaction_type = 'expenditure'  THEN amount ELSE 0 END) AS total_expended,
            COUNT(*)                                     AS transaction_count
        FROM   merl.financial_transactions
        WHERE  transaction_date >= NOW() - INTERVAL '24 months'
          AND  status != 'cancelled'
        GROUP  BY 1, 2
        ORDER  BY 1, 2;
    """
    rows = hook.get_records(sql)

    if not rows:
        log.info("No financial transaction data to summarise.")
        return

    client = _get_ch_client()

    ch_rows = []
    for row in rows:
        domain, summary_month, allocated, disbursed, expended, count = row
        allocated = float(allocated or 0)
        disbursed = float(disbursed or 0)
        expended = float(expended or 0)
        disbursement_rate = round((disbursed / allocated * 100) if allocated > 0 else 0.0, 2)
        expenditure_rate = round((expended / allocated * 100) if allocated > 0 else 0.0, 2)
        ch_rows.append(
            (
                domain,
                summary_month,
                allocated,
                disbursed,
                expended,
                disbursement_rate,
                expenditure_rate,
                int(count),
            )
        )

    client.execute(
        """
        INSERT INTO ch_merl.financial_summaries (
            domain, summary_month, total_allocated, total_disbursed, total_expended,
            disbursement_rate, expenditure_rate, transaction_count
        ) VALUES
        """,
        ch_rows,
    )
    log.info("Stored %d financial summary row(s) in ClickHouse.", len(ch_rows))


def compute_engagement_summaries(**context: Any) -> None:
    """
    Aggregate GEDSI statistics from merl.community_engagements by
    domain and calendar month, then write to ClickHouse
    ch_merl.engagement_summaries.

    Expected ClickHouse table:
        CREATE TABLE IF NOT EXISTS ch_merl.engagement_summaries (
            domain                  String,
            summary_month           Date,
            total_events            UInt32,
            total_participants      UInt64,
            male_participants       UInt64,
            female_participants     UInt64,
            youth_participants      UInt64,
            pwd_participants        UInt64,
            female_pct              Float64,
            youth_pct               Float64,
            pwd_pct                 Float64,
            unique_communities      UInt32,
            inserted_at             DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree(inserted_at)
          ORDER BY (domain, summary_month);
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            COALESCE(a.domain, 'unspecified')               AS domain,
            DATE_TRUNC('month', ce.engagement_date)::date   AS summary_month,
            COUNT(ce.id)                                    AS total_events,
            SUM(ce.total_participants)                      AS total_participants,
            SUM(ce.male_participants)                       AS male_participants,
            SUM(ce.female_participants)                     AS female_participants,
            SUM(ce.youth_participants)                      AS youth_participants,
            SUM(ce.pwd_participants)                        AS pwd_participants,
            COUNT(DISTINCT ce.community_id)                 AS unique_communities
        FROM   merl.community_engagements ce
        LEFT   JOIN merl.activities a ON a.id = ce.activity_id
        WHERE  ce.engagement_date >= NOW() - INTERVAL '24 months'
        GROUP  BY 1, 2
        ORDER  BY 1, 2;
    """
    rows = hook.get_records(sql)

    if not rows:
        log.info("No community engagement data to summarise.")
        return

    client = _get_ch_client()

    ch_rows = []
    for row in rows:
        (
            domain, summary_month, total_events, total_p,
            male_p, female_p, youth_p, pwd_p, unique_communities,
        ) = row

        total_p = int(total_p or 0)
        male_p = int(male_p or 0)
        female_p = int(female_p or 0)
        youth_p = int(youth_p or 0)
        pwd_p = int(pwd_p or 0)

        female_pct = round((female_p / total_p * 100) if total_p > 0 else 0.0, 2)
        youth_pct = round((youth_p / total_p * 100) if total_p > 0 else 0.0, 2)
        pwd_pct = round((pwd_p / total_p * 100) if total_p > 0 else 0.0, 2)

        ch_rows.append(
            (
                domain,
                summary_month,
                int(total_events),
                total_p,
                male_p,
                female_p,
                youth_p,
                pwd_p,
                female_pct,
                youth_pct,
                pwd_pct,
                int(unique_communities),
            )
        )

    client.execute(
        """
        INSERT INTO ch_merl.engagement_summaries (
            domain, summary_month, total_events, total_participants,
            male_participants, female_participants, youth_participants,
            pwd_participants, female_pct, youth_pct, pwd_pct,
            unique_communities
        ) VALUES
        """,
        ch_rows,
    )
    log.info("Stored %d engagement summary row(s) in ClickHouse.", len(ch_rows))


def notify_completion(**context: Any) -> None:
    """
    Log a human-readable summary of computed KPIs.
    """
    ti = context["ti"]
    snapshots: list[dict] = ti.xcom_pull(task_ids="compute_kpi_values", key="kpi_snapshots") or []

    on_track = sum(1 for s in snapshots if s["status"] == "on_track")
    at_risk = sum(1 for s in snapshots if s["status"] == "at_risk")
    off_track = sum(1 for s in snapshots if s["status"] == "off_track")
    unknown = sum(1 for s in snapshots if s["status"] == "unknown")

    log.info(
        "KPI Computation complete — %d total | on_track=%d | at_risk=%d | off_track=%d | unknown=%d",
        len(snapshots),
        on_track,
        at_risk,
        off_track,
        unknown,
    )

    # Log by domain for operational visibility
    domains: dict[str, list[str]] = {}
    for s in snapshots:
        domains.setdefault(s["domain"] or "unspecified", []).append(s["status"])

    for domain, statuses in sorted(domains.items()):
        log.info(
            "  Domain: %-30s | indicators=%d | on_track=%d | at_risk=%d | off_track=%d",
            domain,
            len(statuses),
            statuses.count("on_track"),
            statuses.count("at_risk"),
            statuses.count("off_track"),
        )


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------

with DAG(
    dag_id="kpi_computation",
    description="Nightly KPI computation: compute indicator progress, financial and engagement summaries",
    default_args=default_args,
    schedule_interval="0 1 * * *",
    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["merl", "kpi", "analytics"],
) as dag:

    t_fetch = PythonOperator(
        task_id="fetch_indicators",
        python_callable=fetch_indicators,
    )

    t_compute = PythonOperator(
        task_id="compute_kpi_values",
        python_callable=compute_kpi_values,
    )

    t_store = PythonOperator(
        task_id="store_kpi_snapshots",
        python_callable=store_kpi_snapshots,
    )

    t_financial = PythonOperator(
        task_id="compute_financial_summaries",
        python_callable=compute_financial_summaries,
    )

    t_engagement = PythonOperator(
        task_id="compute_engagement_summaries",
        python_callable=compute_engagement_summaries,
    )

    t_notify = PythonOperator(
        task_id="notify_completion",
        python_callable=notify_completion,
        trigger_rule="all_done",
    )

    t_fetch >> t_compute >> t_store >> [t_financial, t_engagement] >> t_notify
