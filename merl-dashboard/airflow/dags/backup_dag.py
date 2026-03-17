"""
backup_dag.py
-------------
Airflow DAG: backup_dag

Runs daily at 15:00 UTC (= ~02:00 Vanuatu time, UTC+11).

Pipeline:
  1. backup_postgres       — pg_dump the merl database to a gzip-compressed file
  2. backup_clickhouse     — call ClickHouse HTTP API to freeze/snapshot tables
  3. verify_backups        — confirm backup files exist and are non-zero
  4. upload_to_s3          — upload to S3-compatible object store (if configured)
  5. cleanup_old_backups   — purge local backup files older than 30 days
  6. notify_status         — log completion summary with file sizes
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKUP_BASE_DIR = Path(os.getenv("BACKUP_DIR", "/backups"))
POSTGRES_BACKUP_DIR = BACKUP_BASE_DIR / "postgres"
CLICKHOUSE_BACKUP_DIR = BACKUP_BASE_DIR / "clickhouse"

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "merl_dashboard")
POSTGRES_USER = os.getenv("POSTGRES_USER", "merl_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_HTTP_PORT = int(os.getenv("CLICKHOUSE_HTTP_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "merl_ch_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")

RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))

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
# Task callables
# ---------------------------------------------------------------------------

def _ensure_dirs() -> None:
    POSTGRES_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    CLICKHOUSE_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def backup_clickhouse(**context: Any) -> None:
    """
    Use ClickHouse HTTP API to create a named backup for each merl_analytics table.
    ClickHouse stores backups on the server under its configured backup path.
    We record the backup name in XCom.
    """
    import requests  # type: ignore[import]

    _ensure_dirs()
    execution_date: datetime = context["execution_date"]
    timestamp = execution_date.strftime("%Y%m%d_%H%M%S")
    backup_name = f"merl_backup_{timestamp}"

    base_url = f"http://{CLICKHOUSE_HOST}:{CLICKHOUSE_HTTP_PORT}"
    auth = (CLICKHOUSE_USER, CLICKHOUSE_PASSWORD) if CLICKHOUSE_PASSWORD else None

    # Trigger a ClickHouse BACKUP to a local disk destination
    # Requires ClickHouse 22.7+ and a [backups] storage config
    backup_sql = f"BACKUP DATABASE merl_analytics TO Disk('backups', '{backup_name}.zip') SETTINGS async=0"

    try:
        resp = requests.post(
            base_url,
            params={"query": backup_sql},
            auth=auth,
            timeout=300,
        )
        resp.raise_for_status()
        log.info("ClickHouse backup initiated: %s | response: %s", backup_name, resp.text[:200])
    except requests.exceptions.RequestException as exc:
        log.error("ClickHouse backup failed: %s", exc)
        raise

    context["ti"].xcom_push(key="ch_backup_name", value=backup_name)
    log.info("ClickHouse backup completed: %s", backup_name)


def verify_backups(**context: Any) -> None:
    """
    Confirm that today's PostgreSQL dump file exists and is non-zero.
    Also logs ClickHouse backup name for reference.
    """
    ti = context["ti"]
    execution_date: datetime = context["execution_date"]
    timestamp = execution_date.strftime("%Y%m%d")

    # Find the most recent postgres backup from today
    pg_pattern = f"merl_{timestamp}*.sql.gz"
    pg_files = sorted(POSTGRES_BACKUP_DIR.glob(pg_pattern), key=lambda p: p.stat().st_mtime, reverse=True)

    if not pg_files:
        raise FileNotFoundError(
            f"No PostgreSQL backup file found matching {POSTGRES_BACKUP_DIR / pg_pattern}"
        )

    pg_backup = pg_files[0]
    pg_size = pg_backup.stat().st_size
    if pg_size == 0:
        raise ValueError(f"PostgreSQL backup file is empty: {pg_backup}")

    log.info("PostgreSQL backup verified: %s (%d bytes)", pg_backup, pg_size)
    ti.xcom_push(key="pg_backup_path", value=str(pg_backup))
    ti.xcom_push(key="pg_backup_size", value=pg_size)

    ch_backup_name = ti.xcom_pull(task_ids="backup_clickhouse", key="ch_backup_name")
    log.info("ClickHouse backup name: %s", ch_backup_name)


def upload_to_s3(**context: Any) -> None:
    """
    Upload today's PostgreSQL backup to S3-compatible object store.
    Skipped if S3_BUCKET is not set.
    """
    if not S3_BUCKET:
        log.info("S3_BUCKET not configured; skipping S3 upload.")
        return

    import boto3  # type: ignore[import]
    from botocore.config import Config  # type: ignore[import]

    ti = context["ti"]
    pg_backup_path_str: str = ti.xcom_pull(task_ids="verify_backups", key="pg_backup_path") or ""

    if not pg_backup_path_str:
        log.warning("No PostgreSQL backup path in XCom; skipping S3 upload.")
        return

    pg_backup_path = Path(pg_backup_path_str)
    if not pg_backup_path.exists():
        raise FileNotFoundError(f"Backup file not found: {pg_backup_path}")

    s3_kwargs: dict[str, Any] = {
        "aws_access_key_id": AWS_ACCESS_KEY_ID or None,
        "aws_secret_access_key": AWS_SECRET_ACCESS_KEY or None,
    }
    if S3_ENDPOINT:
        s3_kwargs["endpoint_url"] = S3_ENDPOINT

    s3_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
    s3 = boto3.client("s3", config=s3_config, **s3_kwargs)

    s3_key = f"backups/postgres/{pg_backup_path.name}"
    log.info("Uploading %s to s3://%s/%s", pg_backup_path, S3_BUCKET, s3_key)

    s3.upload_file(
        str(pg_backup_path),
        S3_BUCKET,
        s3_key,
        ExtraArgs={"StorageClass": "STANDARD_IA"},
    )
    log.info("S3 upload complete: s3://%s/%s", S3_BUCKET, s3_key)
    ti.xcom_push(key="s3_key", value=s3_key)


def cleanup_old_backups(**context: Any) -> None:
    """
    Delete local PostgreSQL backup files older than RETENTION_DAYS.
    """
    _ensure_dirs()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=RETENTION_DAYS)
    deleted_count = 0
    freed_bytes = 0

    for backup_file in POSTGRES_BACKUP_DIR.glob("*.sql.gz"):
        mtime = datetime.fromtimestamp(backup_file.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            freed_bytes += backup_file.stat().st_size
            backup_file.unlink()
            deleted_count += 1
            log.info("Deleted old backup: %s (mtime=%s)", backup_file.name, mtime.date())

    log.info(
        "Cleanup complete: deleted %d file(s), freed %.2f MB.",
        deleted_count,
        freed_bytes / (1024 * 1024),
    )
    context["ti"].xcom_push(key="deleted_count", value=deleted_count)
    context["ti"].xcom_push(key="freed_mb", value=round(freed_bytes / (1024 * 1024), 2))


def notify_status(**context: Any) -> None:
    """
    Log a final backup completion summary.
    """
    ti = context["ti"]
    pg_size: int = ti.xcom_pull(task_ids="verify_backups", key="pg_backup_size") or 0
    pg_path: str = ti.xcom_pull(task_ids="verify_backups", key="pg_backup_path") or "unknown"
    ch_name: str = ti.xcom_pull(task_ids="backup_clickhouse", key="ch_backup_name") or "unknown"
    s3_key: str = ti.xcom_pull(task_ids="upload_to_s3", key="s3_key") or "(not uploaded)"
    deleted: int = ti.xcom_pull(task_ids="cleanup_old_backups", key="deleted_count") or 0
    freed: float = ti.xcom_pull(task_ids="cleanup_old_backups", key="freed_mb") or 0.0

    log.info(
        "=== Backup Summary ===\n"
        "  PostgreSQL backup : %s (%.2f MB)\n"
        "  ClickHouse backup : %s\n"
        "  S3 destination    : %s\n"
        "  Old files deleted : %d (%.2f MB freed)\n"
        "======================",
        pg_path,
        pg_size / (1024 * 1024),
        ch_name,
        s3_key,
        deleted,
        freed,
    )


# ---------------------------------------------------------------------------
# Bash command for pg_dump
# The timestamp uses Bash's $(date) so it evaluates at runtime on the worker.
# ---------------------------------------------------------------------------
PG_DUMP_CMD = (
    "mkdir -p {backup_dir} && "
    'TIMESTAMP=$(date +"%Y%m%d_%H%M%S") && '
    "PGPASSWORD={pg_password} pg_dump "
    "--host={pg_host} "
    "--port={pg_port} "
    "--username={pg_user} "
    "--dbname={pg_db} "
    "--format=custom "
    "--compress=9 "
    "--no-password "
    "--verbose "
    "| gzip > {backup_dir}/merl_${{TIMESTAMP}}.sql.gz && "
    'echo "Backup written to {backup_dir}/merl_${{TIMESTAMP}}.sql.gz"'
).format(
    backup_dir=str(POSTGRES_BACKUP_DIR),
    pg_password=POSTGRES_PASSWORD or '""',
    pg_host=POSTGRES_HOST,
    pg_port=POSTGRES_PORT,
    pg_user=POSTGRES_USER,
    pg_db=POSTGRES_DB,
)

# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------

with DAG(
    dag_id="backup_dag",
    description="Daily database backups: PostgreSQL dump + ClickHouse snapshot, with S3 upload and rotation",
    default_args=default_args,
    schedule_interval="0 15 * * *",
    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["merl", "backup", "ops"],
) as dag:

    t_pg_backup = BashOperator(
        task_id="backup_postgres",
        bash_command=PG_DUMP_CMD,
        env={
            # Ensure pg tools are available; inherit the rest from system env
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "PGPASSWORD": POSTGRES_PASSWORD,
        },
        append_env=True,
    )

    t_ch_backup = PythonOperator(
        task_id="backup_clickhouse",
        python_callable=backup_clickhouse,
    )

    t_verify = PythonOperator(
        task_id="verify_backups",
        python_callable=verify_backups,
    )

    t_s3 = PythonOperator(
        task_id="upload_to_s3",
        python_callable=upload_to_s3,
    )

    t_cleanup = PythonOperator(
        task_id="cleanup_old_backups",
        python_callable=cleanup_old_backups,
    )

    t_notify = PythonOperator(
        task_id="notify_status",
        python_callable=notify_status,
        trigger_rule="all_done",
    )

    [t_pg_backup, t_ch_backup] >> t_verify >> t_s3 >> t_cleanup >> t_notify
