"""
field_data_ingestion.py
-----------------------
Airflow DAG: field_data_ingestion

Runs every 15 minutes. Pulls unprocessed field-submission records from a PostgreSQL
staging table, validates them, inserts valid rows into merl.community_engagements,
triggers a ClickHouse sync on the backend, and marks staging records as processed.

Staging table assumed schema (merl.field_data_staging):
    id               SERIAL PRIMARY KEY
    raw_data         JSONB          NOT NULL
    submitted_by     UUID
    submitted_at     TIMESTAMPTZ    DEFAULT now()
    status           TEXT           DEFAULT 'pending'   -- pending | processed | failed
    error_message    TEXT
    processed_at     TIMESTAMPTZ
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

# ---------------------------------------------------------------------------
# Constants / configuration
# ---------------------------------------------------------------------------
POSTGRES_CONN_ID = "postgres_merl"
BACKEND_SYNC_URL = "http://backend:8000/api/internal/sync-clickhouse"
BACKEND_SYNC_TOKEN_ENV = "INTERNAL_SYNC_TOKEN"  # set in Airflow Variables/Connections

REQUIRED_FIELDS: list[str] = [
    "community_id",
    "activity_id",
    "engagement_date",
    "total_participants",
]

FIELD_TYPES: dict[str, type] = {
    "total_participants": int,
    "male_participants": int,
    "female_participants": int,
    "youth_participants": int,
    "pwd_participants": int,
}

FIELD_RANGES: dict[str, tuple[int, int]] = {
    "total_participants": (0, 10_000),
    "male_participants": (0, 10_000),
    "female_participants": (0, 10_000),
    "youth_participants": (0, 10_000),
    "pwd_participants": (0, 10_000),
}

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default args
# ---------------------------------------------------------------------------
default_args: dict[str, Any] = {
    "owner": "merl-team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=10),
}

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _validate_record(record: dict[str, Any]) -> tuple[bool, str]:
    """
    Validate a single raw_data record.
    Returns (is_valid, error_message).
    """
    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in record or record[field] is None:
            return False, f"Missing required field: {field}"

    # Validate date format
    try:
        datetime.fromisoformat(str(record["engagement_date"]))
    except (ValueError, TypeError):
        return False, f"Invalid engagement_date format: {record.get('engagement_date')}"

    # Validate numeric types and ranges
    for field, expected_type in FIELD_TYPES.items():
        if field in record and record[field] is not None:
            try:
                value = expected_type(record[field])
            except (ValueError, TypeError):
                return False, f"Field {field} must be {expected_type.__name__}"

            if field in FIELD_RANGES:
                lo, hi = FIELD_RANGES[field]
                if not (lo <= value <= hi):
                    return False, f"Field {field}={value} out of range [{lo}, {hi}]"

    # Cross-check participant counts
    total = record.get("total_participants") or 0
    male = record.get("male_participants") or 0
    female = record.get("female_participants") or 0
    if male + female > int(total):
        return (
            False,
            f"male_participants ({male}) + female_participants ({female}) "
            f"exceeds total_participants ({total})",
        )

    return True, ""


# ---------------------------------------------------------------------------
# Task callables
# ---------------------------------------------------------------------------

def check_upload_queue(**context: Any) -> None:
    """
    Query the staging table for pending records and push their IDs
    via XCom for downstream tasks.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    sql = """
        SELECT id, raw_data, submitted_by
        FROM   merl.field_data_staging
        WHERE  status = 'pending'
        ORDER  BY submitted_at
        LIMIT  500
        FOR UPDATE SKIP LOCKED;
    """
    rows = hook.get_records(sql)

    if not rows:
        log.info("No pending records found in staging table.")
        context["ti"].xcom_push(key="staging_records", value=[])
        return

    records = [
        {"staging_id": row[0], "raw_data": row[1], "submitted_by": str(row[2]) if row[2] else None}
        for row in rows
    ]
    log.info("Found %d pending staging record(s).", len(records))
    context["ti"].xcom_push(key="staging_records", value=records)


def validate_field_data(**context: Any) -> None:
    """
    Validate each pending record and push valid/invalid splits via XCom.
    """
    ti = context["ti"]
    staging_records: list[dict] = ti.xcom_pull(task_ids="check_upload_queue", key="staging_records") or []

    if not staging_records:
        ti.xcom_push(key="valid_records", value=[])
        ti.xcom_push(key="invalid_records", value=[])
        return

    valid_records: list[dict] = []
    invalid_records: list[dict] = []

    for item in staging_records:
        raw = item["raw_data"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError as exc:
                invalid_records.append({"staging_id": item["staging_id"], "error": f"JSON parse error: {exc}"})
                continue

        is_valid, error_msg = _validate_record(raw)
        if is_valid:
            valid_records.append({"staging_id": item["staging_id"], "data": raw, "submitted_by": item["submitted_by"]})
        else:
            invalid_records.append({"staging_id": item["staging_id"], "error": error_msg})

    log.info(
        "Validation complete: %d valid, %d invalid.",
        len(valid_records),
        len(invalid_records),
    )
    ti.xcom_push(key="valid_records", value=valid_records)
    ti.xcom_push(key="invalid_records", value=invalid_records)


def insert_to_postgres(**context: Any) -> None:
    """
    Insert validated records into merl.community_engagements.
    """
    ti = context["ti"]
    valid_records: list[dict] = ti.xcom_pull(task_ids="validate_field_data", key="valid_records") or []

    if not valid_records:
        log.info("No valid records to insert.")
        ti.xcom_push(key="inserted_count", value=0)
        return

    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    conn = hook.get_conn()
    cursor = conn.cursor()

    insert_sql = """
        INSERT INTO merl.community_engagements (
            activity_id,
            community_id,
            engagement_date,
            total_participants,
            male_participants,
            female_participants,
            youth_participants,
            pwd_participants,
            notes,
            recorded_by,
            created_at,
            updated_at
        ) VALUES (
            %(activity_id)s,
            %(community_id)s,
            %(engagement_date)s,
            %(total_participants)s,
            %(male_participants)s,
            %(female_participants)s,
            %(youth_participants)s,
            %(pwd_participants)s,
            %(notes)s,
            %(recorded_by)s,
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING;
    """

    inserted = 0
    failed_inserts: list[int] = []

    for item in valid_records:
        data = item["data"]
        params = {
            "activity_id": data.get("activity_id"),
            "community_id": data.get("community_id"),
            "engagement_date": data.get("engagement_date"),
            "total_participants": int(data.get("total_participants", 0)),
            "male_participants": int(data.get("male_participants") or 0),
            "female_participants": int(data.get("female_participants") or 0),
            "youth_participants": int(data.get("youth_participants") or 0),
            "pwd_participants": int(data.get("pwd_participants") or 0),
            "notes": data.get("notes"),
            "recorded_by": item.get("submitted_by"),
        }
        try:
            cursor.execute(insert_sql, params)
            inserted += 1
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to insert staging_id=%s: %s", item["staging_id"], exc)
            failed_inserts.append(item["staging_id"])
            conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()

    log.info("Inserted %d record(s) into merl.community_engagements.", inserted)
    ti.xcom_push(key="inserted_count", value=inserted)
    ti.xcom_push(key="failed_insert_ids", value=failed_inserts)


def trigger_clickhouse_sync(**context: Any) -> None:
    """
    POST to backend /api/internal/sync-clickhouse to trigger incremental
    CDC flush for the community_engagements table.
    """
    import os

    ti = context["ti"]
    inserted_count: int = ti.xcom_pull(task_ids="insert_to_postgres", key="inserted_count") or 0

    if inserted_count == 0:
        log.info("No new records inserted; skipping ClickHouse sync trigger.")
        return

    token = os.getenv(BACKEND_SYNC_TOKEN_ENV, "")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {"tables": ["community_engagements"], "triggered_by": "field_data_ingestion_dag"}

    try:
        response = requests.post(
            BACKEND_SYNC_URL,
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        log.info("ClickHouse sync triggered successfully: %s", response.json())
    except requests.exceptions.RequestException as exc:
        # Non-fatal: CDC replication via PeerDB will eventually catch up
        log.warning("ClickHouse sync trigger failed (non-fatal): %s", exc)


def mark_processed(**context: Any) -> None:
    """
    Mark staging records as processed (or failed), and log invalid records.
    """
    ti = context["ti"]
    valid_records: list[dict] = ti.xcom_pull(task_ids="validate_field_data", key="valid_records") or []
    invalid_records: list[dict] = ti.xcom_pull(task_ids="validate_field_data", key="invalid_records") or []
    failed_insert_ids: list[int] = ti.xcom_pull(task_ids="insert_to_postgres", key="failed_insert_ids") or []
    failed_insert_set = set(failed_insert_ids)

    if not valid_records and not invalid_records:
        log.info("Nothing to mark; staging was empty.")
        return

    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    conn = hook.get_conn()
    cursor = conn.cursor()

    now = datetime.now(tz=timezone.utc)

    # Mark successfully inserted records
    successfully_inserted = [
        r["staging_id"] for r in valid_records if r["staging_id"] not in failed_insert_set
    ]
    if successfully_inserted:
        cursor.execute(
            """
            UPDATE merl.field_data_staging
            SET    status       = 'processed',
                   processed_at = %s,
                   error_message = NULL
            WHERE  id = ANY(%s::int[]);
            """,
            (now, successfully_inserted),
        )

    # Mark invalid / failed records
    all_failed = list(failed_insert_set) + [r["staging_id"] for r in invalid_records]
    failed_errors = {r["staging_id"]: r["error"] for r in invalid_records}

    for staging_id in all_failed:
        error_msg = failed_errors.get(staging_id, "Insert failed — see Airflow logs")
        cursor.execute(
            """
            UPDATE merl.field_data_staging
            SET    status        = 'failed',
                   processed_at  = %s,
                   error_message = %s
            WHERE  id = %s;
            """,
            (now, error_msg, staging_id),
        )

    conn.commit()
    cursor.close()
    conn.close()

    log.info(
        "Marked %d as processed, %d as failed.",
        len(successfully_inserted),
        len(all_failed),
    )


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------

with DAG(
    dag_id="field_data_ingestion",
    description="Ingest field submission data from staging into merl.community_engagements every 15 min",
    default_args=default_args,
    schedule_interval="*/15 * * * *",
    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["merl", "ingestion", "field-data"],
) as dag:

    t_check = PythonOperator(
        task_id="check_upload_queue",
        python_callable=check_upload_queue,
    )

    t_validate = PythonOperator(
        task_id="validate_field_data",
        python_callable=validate_field_data,
    )

    t_insert = PythonOperator(
        task_id="insert_to_postgres",
        python_callable=insert_to_postgres,
    )

    t_sync = PythonOperator(
        task_id="trigger_clickhouse_sync",
        python_callable=trigger_clickhouse_sync,
    )

    t_mark = PythonOperator(
        task_id="mark_processed",
        python_callable=mark_processed,
        trigger_rule="all_done",  # run even if upstream partially failed
    )

    t_check >> t_validate >> t_insert >> t_sync >> t_mark
