"""
clickhouse_sync_check.py
------------------------
Airflow DAG: data_quality_check

Runs every Monday at 06:00 UTC.

Pipeline:
  1. check_missing_indicator_values  — indicators with no value in the last 30 days
  2. check_stale_data                — indicator_values not updated in 60+ days
  3. check_unverified_entries        — unverified indicator_values older than 7 days
  4. check_postgres_clickhouse_sync  — row-count parity between PostgreSQL and ClickHouse
  5. generate_quality_report         — consolidate all issues into a structured dict
  6. send_quality_report             — email report to MERL officers if issues exist
"""

from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
POSTGRES_CONN_ID = "postgres_merl"

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "9000"))
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "merl_analytics")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "merl_ch_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.example.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@example.gov.vu")
REPORT_RECIPIENTS_RAW = os.getenv("REPORT_RECIPIENTS", "merl@docc.gov.vu")

# Thresholds for quality checks
MISSING_VALUE_DAYS = 30
STALE_DATA_DAYS = 60
UNVERIFIED_AGE_DAYS = 7
# Count-discrepancy tolerance (allow up to 0.5% difference due to in-flight CDC lag)
SYNC_TOLERANCE_PCT = 0.5

# Tables to compare between PostgreSQL (merl schema) and ClickHouse (ch_merl)
SYNC_CHECK_TABLES = [
    ("indicators", "ch_merl.indicators"),
    ("indicator_values", "ch_merl.indicator_values"),
    ("activities", "ch_merl.activities"),
    ("financial_transactions", "ch_merl.financial_transactions"),
    ("community_engagements", "ch_merl.community_engagements"),
    ("ld_events", "ch_merl.ld_events"),
    ("learning_entries", "ch_merl.learning_entries"),
]

# ---------------------------------------------------------------------------
# Default args
# ---------------------------------------------------------------------------
default_args: dict[str, Any] = {
    "owner": "merl-team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}


# ---------------------------------------------------------------------------
# Helpers
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

def check_missing_indicator_values(**context: Any) -> None:
    """
    Find indicators that have no indicator_value recorded in the last MISSING_VALUE_DAYS days.
    Push a list of dicts with indicator details via XCom.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            i.id::text,
            i.code,
            i.name,
            i.measurement_frequency,
            i.domain,
            MAX(iv.reporting_period_end)  AS last_reported
        FROM   merl.indicators i
        LEFT   JOIN merl.indicator_values iv ON iv.indicator_id = i.id
        WHERE  i.is_active = TRUE
        GROUP  BY i.id, i.code, i.name, i.measurement_frequency, i.domain
        HAVING MAX(iv.reporting_period_end) IS NULL
            OR MAX(iv.reporting_period_end) < NOW() - INTERVAL '%s days'
        ORDER  BY i.domain, i.code;
    """ % MISSING_VALUE_DAYS

    rows = hook.get_records(sql)
    issues = [
        {
            "indicator_id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "frequency": r[3],
            "domain": r[4],
            "last_reported": str(r[5]) if r[5] else "Never",
        }
        for r in rows
    ]

    log.info("Missing indicator values: %d indicator(s) with no data in last %d days.", len(issues), MISSING_VALUE_DAYS)
    for issue in issues:
        log.warning("  [MISSING] %s — %s | last reported: %s", issue["code"], issue["name"], issue["last_reported"])

    context["ti"].xcom_push(key="missing_values", value=issues)


def check_stale_data(**context: Any) -> None:
    """
    Find indicator_values records that have not been updated in STALE_DATA_DAYS days.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            iv.id::text,
            i.code,
            i.name,
            i.domain,
            iv.reporting_period_end,
            iv.updated_at,
            EXTRACT(DAY FROM NOW() - iv.updated_at)::int AS days_stale
        FROM   merl.indicator_values iv
        JOIN   merl.indicators i ON i.id = iv.indicator_id
        WHERE  iv.updated_at < NOW() - INTERVAL '%s days'
          AND  i.is_active = TRUE
        ORDER  BY iv.updated_at ASC
        LIMIT  200;
    """ % STALE_DATA_DAYS

    rows = hook.get_records(sql)
    issues = [
        {
            "value_id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "domain": r[3],
            "reporting_period_end": str(r[4]),
            "last_updated": str(r[5]),
            "days_stale": int(r[6]),
        }
        for r in rows
    ]

    log.info("Stale data: %d indicator_value record(s) not updated in %d+ days.", len(issues), STALE_DATA_DAYS)
    context["ti"].xcom_push(key="stale_data", value=issues)


def check_unverified_entries(**context: Any) -> None:
    """
    Count and list indicator_values that are unverified and older than UNVERIFIED_AGE_DAYS.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT
            iv.id::text,
            i.code,
            i.name,
            i.domain,
            iv.value,
            iv.created_at,
            EXTRACT(DAY FROM NOW() - iv.created_at)::int AS age_days
        FROM   merl.indicator_values iv
        JOIN   merl.indicators i ON i.id = iv.indicator_id
        WHERE  iv.verification_status IN ('pending', 'unverified')
          AND  iv.created_at < NOW() - INTERVAL '%s days'
          AND  i.is_active = TRUE
        ORDER  BY iv.created_at ASC
        LIMIT  200;
    """ % UNVERIFIED_AGE_DAYS

    rows = hook.get_records(sql)
    issues = [
        {
            "value_id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "domain": r[3],
            "value": float(r[4]) if r[4] is not None else None,
            "created_at": str(r[5]),
            "age_days": int(r[6]),
        }
        for r in rows
    ]

    log.info(
        "Unverified entries: %d indicator_value(s) pending verification for %d+ days.",
        len(issues),
        UNVERIFIED_AGE_DAYS,
    )
    context["ti"].xcom_push(key="unverified_entries", value=issues)


def check_postgres_clickhouse_sync(**context: Any) -> None:
    """
    Compare row counts between PostgreSQL merl.* tables and ClickHouse ch_merl.* tables.
    Flag any table where the count difference exceeds SYNC_TOLERANCE_PCT.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sync_issues: list[dict] = []
    sync_summary: list[dict] = []

    try:
        ch_client = _get_ch_client()
        ch_available = True
    except Exception as exc:  # noqa: BLE001
        log.error("Cannot connect to ClickHouse for sync check: %s", exc)
        context["ti"].xcom_push(key="sync_issues", value=[{"table": "ALL", "error": str(exc)}])
        context["ti"].xcom_push(key="sync_summary", value=[])
        return

    for pg_table, ch_table in SYNC_CHECK_TABLES:
        try:
            pg_count_row = hook.get_records(f"SELECT COUNT(*) FROM merl.{pg_table};")
            pg_count = int(pg_count_row[0][0]) if pg_count_row else 0
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not count merl.%s: %s", pg_table, exc)
            pg_count = -1

        try:
            ch_count_row = ch_client.execute(f"SELECT COUNT(*) FROM {ch_table};")
            ch_count = int(ch_count_row[0][0]) if ch_count_row else 0
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not count %s: %s", ch_table, exc)
            ch_count = -1

        if pg_count < 0 or ch_count < 0:
            diff_pct = 100.0
            in_sync = False
        elif pg_count == 0 and ch_count == 0:
            diff_pct = 0.0
            in_sync = True
        else:
            diff = abs(pg_count - ch_count)
            diff_pct = round((diff / max(pg_count, 1)) * 100, 3)
            in_sync = diff_pct <= SYNC_TOLERANCE_PCT

        entry = {
            "pg_table": f"merl.{pg_table}",
            "ch_table": ch_table,
            "pg_count": pg_count,
            "ch_count": ch_count,
            "diff_pct": diff_pct,
            "in_sync": in_sync,
        }
        sync_summary.append(entry)

        if not in_sync:
            sync_issues.append(entry)
            log.warning(
                "SYNC MISMATCH: merl.%s (pg=%d) vs %s (ch=%d) — diff=%.3f%%",
                pg_table, pg_count, ch_table, ch_count, diff_pct,
            )
        else:
            log.info(
                "  OK: merl.%s (pg=%d) vs %s (ch=%d)", pg_table, pg_count, ch_table, ch_count
            )

    log.info(
        "Sync check: %d/%d tables in sync.", len(SYNC_CHECK_TABLES) - len(sync_issues), len(SYNC_CHECK_TABLES)
    )
    context["ti"].xcom_push(key="sync_issues", value=sync_issues)
    context["ti"].xcom_push(key="sync_summary", value=sync_summary)


def generate_quality_report(**context: Any) -> None:
    """
    Consolidate all quality-check findings into a single report dict and push via XCom.
    """
    ti = context["ti"]
    missing: list[dict] = ti.xcom_pull(task_ids="check_missing_indicator_values", key="missing_values") or []
    stale: list[dict] = ti.xcom_pull(task_ids="check_stale_data", key="stale_data") or []
    unverified: list[dict] = ti.xcom_pull(task_ids="check_unverified_entries", key="unverified_entries") or []
    sync_issues: list[dict] = ti.xcom_pull(task_ids="check_postgres_clickhouse_sync", key="sync_issues") or []
    sync_summary: list[dict] = ti.xcom_pull(task_ids="check_postgres_clickhouse_sync", key="sync_summary") or []

    total_issues = len(missing) + len(stale) + len(unverified) + len(sync_issues)

    report = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "check_date": datetime.now(tz=timezone.utc).date().isoformat(),
        "total_issues": total_issues,
        "has_issues": total_issues > 0,
        "sections": {
            "missing_indicator_values": {
                "count": len(missing),
                "threshold_days": MISSING_VALUE_DAYS,
                "description": f"Active indicators with no value reported in the last {MISSING_VALUE_DAYS} days",
                "items": missing[:50],  # cap at 50 for XCom size limits
            },
            "stale_data": {
                "count": len(stale),
                "threshold_days": STALE_DATA_DAYS,
                "description": f"Indicator values not updated in {STALE_DATA_DAYS}+ days",
                "items": stale[:50],
            },
            "unverified_entries": {
                "count": len(unverified),
                "threshold_days": UNVERIFIED_AGE_DAYS,
                "description": f"Indicator values pending verification for {UNVERIFIED_AGE_DAYS}+ days",
                "items": unverified[:50],
            },
            "postgres_clickhouse_sync": {
                "tables_checked": len(sync_summary),
                "tables_out_of_sync": len(sync_issues),
                "tolerance_pct": SYNC_TOLERANCE_PCT,
                "description": "Row-count parity between PostgreSQL and ClickHouse tables",
                "issues": sync_issues,
                "summary": sync_summary,
            },
        },
    }

    if total_issues == 0:
        log.info("Data quality check PASSED: no issues found.")
    else:
        log.warning(
            "Data quality check found %d issue(s): "
            "missing=%d, stale=%d, unverified=%d, sync_mismatches=%d",
            total_issues, len(missing), len(stale), len(unverified), len(sync_issues),
        )

    ti.xcom_push(key="quality_report", value=report)


def send_quality_report(**context: Any) -> None:
    """
    Email the quality report to MERL officers if any issues were found.
    Skips gracefully if SMTP is not configured or no issues exist.
    """
    ti = context["ti"]
    report: dict = ti.xcom_pull(task_ids="generate_quality_report", key="quality_report") or {}

    if not report.get("has_issues", False):
        log.info("No data quality issues found; skipping email notification.")
        return

    recipients = [r.strip() for r in REPORT_RECIPIENTS_RAW.split(",") if r.strip()]
    if not recipients:
        log.warning("No REPORT_RECIPIENTS configured; skipping email.")
        return

    if SMTP_HOST in ("", "smtp.example.com"):
        log.warning("SMTP_HOST not configured; skipping quality report email.")
        return

    check_date = report.get("check_date", "")
    total_issues = report.get("total_issues", 0)
    sections = report.get("sections", {})

    # Build plain-text email body
    lines = [
        f"MERL Dashboard — Data Quality Report ({check_date})",
        "=" * 60,
        f"Total issues found: {total_issues}",
        "",
    ]

    # Missing values section
    mv = sections.get("missing_indicator_values", {})
    if mv.get("count", 0) > 0:
        lines.append(f"1. MISSING INDICATOR VALUES ({mv['count']} indicator(s))")
        lines.append(f"   {mv['description']}")
        lines.append("")
        for item in mv.get("items", [])[:20]:
            lines.append(f"   - [{item['domain']}] {item['code']}: {item['name']} | Last: {item['last_reported']}")
        if mv["count"] > 20:
            lines.append(f"   ... and {mv['count'] - 20} more.")
        lines.append("")

    # Stale data section
    sd = sections.get("stale_data", {})
    if sd.get("count", 0) > 0:
        lines.append(f"2. STALE DATA ({sd['count']} record(s))")
        lines.append(f"   {sd['description']}")
        lines.append("")
        for item in sd.get("items", [])[:20]:
            lines.append(
                f"   - [{item['domain']}] {item['code']}: {item['name']} "
                f"| Last updated: {item['last_updated']} ({item['days_stale']} days ago)"
            )
        if sd["count"] > 20:
            lines.append(f"   ... and {sd['count'] - 20} more.")
        lines.append("")

    # Unverified entries section
    ue = sections.get("unverified_entries", {})
    if ue.get("count", 0) > 0:
        lines.append(f"3. UNVERIFIED ENTRIES ({ue['count']} record(s))")
        lines.append(f"   {ue['description']}")
        lines.append("")
        for item in ue.get("items", [])[:20]:
            lines.append(
                f"   - [{item['domain']}] {item['code']}: {item['name']} "
                f"| Submitted: {item['created_at']} ({item['age_days']} days ago)"
            )
        if ue["count"] > 20:
            lines.append(f"   ... and {ue['count'] - 20} more.")
        lines.append("")

    # Sync issues section
    ps = sections.get("postgres_clickhouse_sync", {})
    if ps.get("tables_out_of_sync", 0) > 0:
        lines.append(
            f"4. POSTGRESQL/CLICKHOUSE SYNC ISSUES "
            f"({ps['tables_out_of_sync']}/{ps['tables_checked']} tables out of sync)"
        )
        lines.append(f"   Tolerance: {ps['tolerance_pct']}% row count difference")
        lines.append("")
        for issue in ps.get("issues", []):
            lines.append(
                f"   - {issue['pg_table']}: pg={issue['pg_count']:,} | ch={issue['ch_count']:,} "
                f"| diff={issue['diff_pct']:.2f}%"
            )
        lines.append("")

    lines += [
        "=" * 60,
        "Please review these issues in the MERL Dashboard.",
        "This is an automated message. Do not reply.",
    ]

    body = "\n".join(lines)
    subject = f"[MERL] Data Quality Alert — {total_issues} issue(s) found ({check_date})"

    msg = MIMEMultipart()
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, recipients, msg.as_string())
        log.info("Quality report emailed to: %s", ", ".join(recipients))
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to send quality report email: %s", exc)
        raise


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------

with DAG(
    dag_id="data_quality_check",
    description="Weekly data quality checks: missing values, stale data, unverified entries, PG/CH sync parity",
    default_args=default_args,
    schedule_interval="0 6 * * 1",
    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["merl", "data-quality", "monitoring"],
) as dag:

    t_missing = PythonOperator(
        task_id="check_missing_indicator_values",
        python_callable=check_missing_indicator_values,
    )

    t_stale = PythonOperator(
        task_id="check_stale_data",
        python_callable=check_stale_data,
    )

    t_unverified = PythonOperator(
        task_id="check_unverified_entries",
        python_callable=check_unverified_entries,
    )

    t_sync = PythonOperator(
        task_id="check_postgres_clickhouse_sync",
        python_callable=check_postgres_clickhouse_sync,
    )

    t_report = PythonOperator(
        task_id="generate_quality_report",
        python_callable=generate_quality_report,
        trigger_rule="all_done",
    )

    t_send = PythonOperator(
        task_id="send_quality_report",
        python_callable=send_quality_report,
    )

    # All checks run in parallel; then consolidate and notify
    [t_missing, t_stale, t_unverified, t_sync] >> t_report >> t_send
