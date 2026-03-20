# Backup and Restore — MERL Dashboard

## Table of Contents

1. [Backup Overview](#1-backup-overview)
2. [Automated Backup Schedule](#2-automated-backup-schedule)
3. [Manual PostgreSQL Backup](#3-manual-postgresql-backup)
4. [Manual ClickHouse Backup](#4-manual-clickhouse-backup)
5. [Manual Uploads Backup](#5-manual-uploads-backup)
6. [S3 Upload Configuration](#6-s3-upload-configuration)
7. [Restore Procedures](#7-restore-procedures)
8. [Backup Verification](#8-backup-verification)
9. [Recovery Time and Point Objectives](#9-recovery-time-and-point-objectives)
10. [Backup Monitoring and Alerting](#10-backup-monitoring-and-alerting)

---

## 1. Backup Overview

The MERL Dashboard protects data through a layered backup strategy:

| Layer | Method | Frequency | Retention | Storage |
|-------|--------|-----------|-----------|---------|
| PostgreSQL logical dump | `pg_dump` | Daily | 30 days | Local volume + S3 |
| ClickHouse table export | `clickhouse-client` | Daily | 30 days | Local volume + S3 |
| Uploads volume | Docker volume tar | Daily | 30 days | Local volume + S3 |
| Weekly archive | Combined tar.gz | Weekly | 1 year | S3 (separate prefix) |

Backups are orchestrated by the Airflow DAG `dag_daily_backup.py`, which runs nightly at 02:00 Vanuatu Time (UTC+11). Completion notifications are sent to the address configured in `ALERT_EMAIL`.

**Local backup location:** `backups_data` Docker volume, mounted at `/opt/airflow/backups` inside the Airflow container.

**S3 backup structure:**

```
s3://${BACKUP_S3_BUCKET}/
  postgres/
    merl_postgres_YYYYMMDD_HHMMSS.sql.gz
  clickhouse/
    merl_clickhouse_YYYYMMDD_HHMMSS.tar.gz
  uploads/
    merl_uploads_YYYYMMDD_HHMMSS.tar.gz
  weekly/
    YYYY-WXX/
      merl_full_backup_YYYYMMDD.tar.gz
```

---

## 2. Automated Backup Schedule

The Airflow DAG `dag_daily_backup` runs on schedule `0 15 * * *` (UTC), which corresponds to **02:00 Vanuatu Time (UTC+11)**.

To verify the backup DAG is scheduled:

```bash
docker compose exec airflow airflow dags list | grep backup
docker compose exec airflow airflow dags state dag_daily_backup $(date +%Y-%m-%d)
```

To trigger the backup DAG manually:

```bash
docker compose exec airflow airflow dags trigger dag_daily_backup
```

Monitor execution:

```bash
docker compose exec airflow airflow dags show-run dag_daily_backup
# Or open Airflow UI: http://localhost/airflow → DAGs → dag_daily_backup
```

---

## 3. Manual PostgreSQL Backup

### 3.1 Full Database Dump (Custom Format)

The custom format (`-Fc`) is preferred because it supports parallel restore with `pg_restore`.

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="merl_postgres_${TIMESTAMP}.sql.gz"

docker compose exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --format=custom \
    --compress=9 \
    --verbose \
  | gzip > backups/${BACKUP_FILE}

echo "Backup written to: backups/${BACKUP_FILE}"
echo "Size: $(du -sh backups/${BACKUP_FILE})"
```

### 3.2 Schema-Only Dump

Useful for capturing the database schema without data (e.g., for new environment setup):

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker compose exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --schema-only \
    --format=plain \
  > backups/merl_schema_${TIMESTAMP}.sql

echo "Schema dump: backups/merl_schema_${TIMESTAMP}.sql"
```

### 3.3 Single Table Dump

When you need to back up only a specific table (e.g., before a risky migration):

```bash
TABLE_NAME="indicator_values"   # replace with target table
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker compose exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --table="${TABLE_NAME}" \
    --format=custom \
  | gzip > backups/merl_table_${TABLE_NAME}_${TIMESTAMP}.sql.gz

echo "Table backup: backups/merl_table_${TABLE_NAME}_${TIMESTAMP}.sql.gz"
```

---

## 4. Manual ClickHouse Backup

### 4.1 Export All Tables

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CH_DIR="backups/clickhouse_${TIMESTAMP}"
mkdir -p "${CH_DIR}"

# Get list of tables
TABLES=$(docker compose exec -T clickhouse \
  clickhouse-client \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="SHOW TABLES FROM ${CLICKHOUSE_DB}" 2>/dev/null)

for table in $TABLES; do
  echo "Backing up table: $table"
  docker compose exec -T clickhouse \
    clickhouse-client \
      --user="${CLICKHOUSE_USER}" \
      --password="${CLICKHOUSE_PASSWORD}" \
      --query="SELECT * FROM ${CLICKHOUSE_DB}.${table} FORMAT Native" \
    > "${CH_DIR}/${table}.native"
done

# Compress
tar -czf "backups/merl_clickhouse_${TIMESTAMP}.tar.gz" -C backups "clickhouse_${TIMESTAMP}/"
rm -rf "${CH_DIR}"

echo "ClickHouse backup: backups/merl_clickhouse_${TIMESTAMP}.tar.gz"
echo "Size: $(du -sh backups/merl_clickhouse_${TIMESTAMP}.tar.gz)"
```

### 4.2 Export a Single ClickHouse Table

```bash
TABLE_NAME="indicator_values_mv"  # replace with target table
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker compose exec -T clickhouse \
  clickhouse-client \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="SELECT * FROM ${CLICKHOUSE_DB}.${TABLE_NAME} FORMAT Native" \
  | gzip > backups/merl_ch_${TABLE_NAME}_${TIMESTAMP}.native.gz

echo "Table backup: backups/merl_ch_${TABLE_NAME}_${TIMESTAMP}.native.gz"
```

---

## 5. Manual Uploads Backup

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker run --rm \
  -v merl-dashboard_uploads_data:/source:ro \
  -v "$(pwd)/backups":/backup \
  alpine \
  tar czf /backup/merl_uploads_${TIMESTAMP}.tar.gz -C /source .

echo "Uploads backup: backups/merl_uploads_${TIMESTAMP}.tar.gz"
echo "Size: $(du -sh backups/merl_uploads_${TIMESTAMP}.tar.gz)"
```

---

## 6. S3 Upload Configuration

### 6.1 Required Environment Variables

Set these in `.env`:

```bash
BACKUP_S3_BUCKET=merl-backups-gov-vu
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_DEFAULT_REGION=ap-southeast-2
```

### 6.2 Manual Upload to S3

Install the AWS CLI if not present:

```bash
sudo apt-get install -y awscli
aws configure  # or rely on environment variables in .env
```

Upload a backup:

```bash
export $(grep -v '^#' .env | xargs)

# Upload PostgreSQL backup
aws s3 cp backups/merl_postgres_*.sql.gz s3://${BACKUP_S3_BUCKET}/postgres/

# Upload ClickHouse backup
aws s3 cp backups/merl_clickhouse_*.tar.gz s3://${BACKUP_S3_BUCKET}/clickhouse/

# Upload uploads backup
aws s3 cp backups/merl_uploads_*.tar.gz s3://${BACKUP_S3_BUCKET}/uploads/

# Verify upload
aws s3 ls s3://${BACKUP_S3_BUCKET}/postgres/ --human-readable | tail -5
```

### 6.3 S3 Lifecycle Policy

Configure the S3 bucket lifecycle to automatically delete old backups:

```json
{
  "Rules": [
    {
      "ID": "MERLDailyBackupExpiry",
      "Filter": {"Prefix": "postgres/"},
      "Status": "Enabled",
      "Expiration": {"Days": 30}
    },
    {
      "ID": "MERLWeeklyBackupExpiry",
      "Filter": {"Prefix": "weekly/"},
      "Status": "Enabled",
      "Expiration": {"Days": 365}
    }
  ]
}
```

Apply via AWS CLI:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket ${BACKUP_S3_BUCKET} \
  --lifecycle-configuration file://s3_lifecycle.json
```

---

## 7. Restore Procedures

### 7.1 PostgreSQL Restore — Full Database

> **Warning:** This procedure drops all existing data in the database and replaces it with the backup contents. Only proceed during a maintenance window.

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

# Identify the backup to restore
ls -lh backups/merl_postgres_*.sql.gz
BACKUP_FILE="backups/merl_postgres_YYYYMMDD_HHMMSS.sql.gz"  # update this

# Stop the application (keep postgres running)
docker compose stop backend frontend airflow superset keycloak peerdb

# Restore
gunzip -c "${BACKUP_FILE}" | \
docker compose exec -T postgres \
  pg_restore \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --no-password \
    --verbose \
    --clean \
    --if-exists

echo "Restore exit code: $?"

# Verify
docker compose exec postgres psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -c "\dt"

# Restart application
docker compose up -d
```

### 7.2 PostgreSQL Restore — Single Table

```bash
TABLE_NAME="indicator_values"
BACKUP_FILE="backups/merl_table_${TABLE_NAME}_YYYYMMDD_HHMMSS.sql.gz"

gunzip -c "${BACKUP_FILE}" | \
docker compose exec -T postgres \
  pg_restore \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --table="${TABLE_NAME}" \
    --no-password \
    --verbose \
    --data-only

echo "Table restore exit code: $?"
```

### 7.3 ClickHouse Restore — All Tables

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

BACKUP_ARCHIVE="backups/merl_clickhouse_YYYYMMDD_HHMMSS.tar.gz"  # update this

# Extract
TMPDIR=$(mktemp -d)
tar -xzf "${BACKUP_ARCHIVE}" -C "${TMPDIR}"
CH_DIR=$(ls "${TMPDIR}")

# Truncate existing tables before restore
docker compose exec clickhouse \
  clickhouse-client \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="TRUNCATE TABLE ${CLICKHOUSE_DB}.indicator_values"
# Repeat for each table that needs restoring

# Restore each table
for f in "${TMPDIR}/${CH_DIR}"/*.native; do
  table=$(basename "$f" .native)
  echo "Restoring: $table"
  cat "$f" | docker compose exec -T clickhouse \
    clickhouse-client \
      --user="${CLICKHOUSE_USER}" \
      --password="${CLICKHOUSE_PASSWORD}" \
      --query="INSERT INTO ${CLICKHOUSE_DB}.${table} FORMAT Native"
done

rm -rf "${TMPDIR}"
echo "ClickHouse restore complete"
```

### 7.4 Uploads Volume Restore

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
BACKUP_ARCHIVE="backups/merl_uploads_YYYYMMDD_HHMMSS.tar.gz"  # update this

docker run --rm \
  -v merl-dashboard_uploads_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine \
  sh -c "rm -rf /data/* && cd /data && tar xzf /backup/$(basename ${BACKUP_ARCHIVE})"

echo "Uploads volume restored"
```

### 7.5 Restore from S3

```bash
export $(grep -v '^#' .env | xargs)

# List available backups in S3
aws s3 ls s3://${BACKUP_S3_BUCKET}/postgres/ --human-readable

# Download a specific backup
aws s3 cp s3://${BACKUP_S3_BUCKET}/postgres/merl_postgres_YYYYMMDD_HHMMSS.sql.gz backups/

# Then follow the restore procedure in section 7.1
```

---

## 8. Backup Verification

Run these commands regularly (or after each backup) to verify backup integrity.

### 8.1 Verify PostgreSQL Backup Integrity

```bash
BACKUP_FILE="backups/merl_postgres_YYYYMMDD_HHMMSS.sql.gz"

# Test decompression without writing output
gunzip -t "${BACKUP_FILE}" && echo "Gzip integrity OK" || echo "GZIP CORRUPT"

# Test pg_restore can read the file structure
gunzip -c "${BACKUP_FILE}" | \
docker compose exec -T postgres \
  pg_restore \
    --username="${POSTGRES_USER}" \
    --list \
  | head -20

echo "pg_restore listing succeeded — backup is readable"
```

### 8.2 Verify ClickHouse Backup Integrity

```bash
BACKUP_ARCHIVE="backups/merl_clickhouse_YYYYMMDD_HHMMSS.tar.gz"

# Test archive integrity
tar -tzf "${BACKUP_ARCHIVE}" | head -10 && echo "Tar integrity OK" || echo "TAR CORRUPT"

# Check expected file sizes
tar -tzf "${BACKUP_ARCHIVE}" --verbose | awk '{print $3, $6}'
```

### 8.3 Automated Verification via Airflow

The `dag_backup_verify` DAG (runs weekly on Monday 03:00 VUT) performs:

1. Downloads the most recent backup from S3.
2. Runs `pg_restore --list` on the PostgreSQL backup.
3. Runs `tar -tzf` on the ClickHouse backup.
4. Emails a verification report to `ALERT_EMAIL`.

Trigger manually:

```bash
docker compose exec airflow airflow dags trigger dag_backup_verify
```

---

## 9. Recovery Time and Point Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| Recovery Point Objective (RPO) | 24 hours | Daily backups at 02:00 VUT |
| Recovery Time Objective (RTO) | 4 hours | Full restore from local backup |
| RTO from S3 | 6 hours | Includes S3 download time over VUT internet |
| Tested recovery frequency | Monthly | Admin should run a test restore to a spare environment |

### Improving RPO

If the project requires a tighter RPO (e.g., 1 hour), consider:

- Enabling PostgreSQL WAL archiving to S3 (Point-In-Time Recovery / PITR).
- Increasing the backup DAG frequency (change cron schedule to `0 */4 * * *` for 4-hourly backups).

---

## 10. Backup Monitoring and Alerting

### 10.1 Airflow Alerts

The backup DAG sends an email to `ALERT_EMAIL` on:

- Successful completion (daily summary)
- Any task failure (immediate alert)

Configure SMTP in `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=merl-alerts@climate.gov.vu
SMTP_PASSWORD=<app-password>
ALERT_EMAIL=ict-admin@climate.gov.vu
```

### 10.2 Check Backup Age Manually

```bash
# Check when last backup was created
ls -lht backups/merl_postgres_*.sql.gz | head -3

# Check S3
export $(grep -v '^#' .env | xargs)
aws s3 ls s3://${BACKUP_S3_BUCKET}/postgres/ | tail -3
```

### 10.3 Check Disk Usage

```bash
# Local backup volume
docker system df -v | grep backup

# Host disk usage
df -h /var/lib/docker
```

If local backup volume exceeds 20 GB, manually delete backups older than 7 days:

```bash
docker compose exec airflow \
  find /opt/airflow/backups -name "*.sql.gz" -mtime +7 -delete
docker compose exec airflow \
  find /opt/airflow/backups -name "*.tar.gz" -mtime +7 -delete
```

---

*Document version: 1.0 | March 2026 | Vanua Spatial Solutions*
