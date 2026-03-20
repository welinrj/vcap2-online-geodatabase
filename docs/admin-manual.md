# Administrator Manual — MERL Dashboard

**Project:** Vanuatu Loss and Damage Fund Development Project
**Audience:** System Administrators, GoV ICT Officers

---

## Table of Contents

1. [System Access and Prerequisites](#1-system-access-and-prerequisites)
2. [User Management in Keycloak](#2-user-management-in-keycloak)
3. [Database Administration](#3-database-administration)
4. [Monitoring Airflow DAGs](#4-monitoring-airflow-dags)
5. [Managing Backups](#5-managing-backups)
6. [Updating Superset Dashboards](#6-updating-superset-dashboards)
7. [Adding New Indicators](#7-adding-new-indicators)
8. [SSL Certificate Renewal](#8-ssl-certificate-renewal)
9. [System Monitoring](#9-system-monitoring)
10. [Troubleshooting Guide](#10-troubleshooting-guide)

---

## 1. System Access and Prerequisites

### Server Access

The MERL Dashboard runs on a GoV server. To perform administrative tasks, you need:

- SSH access to the server as a user in the `docker` group
- Sudo privileges (required for UFW, Certbot, and some Docker operations)

```bash
ssh your-username@<server-ip>
cd /opt/vcap2-online-geodatabase/merl-dashboard
```

### Loading Environment Variables

Many administration commands reference environment variables. Load them into your shell session with:

```bash
export $(grep -v '^#' /opt/vcap2-online-geodatabase/merl-dashboard/.env | xargs)
```

### Quick Health Check

Run this at the start of any admin session to confirm all services are running:

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
docker compose ps
```

---

## 2. User Management in Keycloak

All MERL Dashboard users are managed in the Keycloak admin console at **https://\<domain\>/auth**.

### Accessing the Keycloak Admin Console

1. Open `https://<domain>/auth` in your browser.
2. Click **"Administration Console"**.
3. Log in with the admin credentials from `.env` (`KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`).
4. Ensure you are in the **merl** realm (select it from the top-left dropdown — do not use the `master` realm for user management).

### Adding a New User

1. In the left sidebar, click **Users**.
2. Click **"Add User"** (top right).
3. Fill in the required fields:
   - **Username:** Use lowercase, no spaces (e.g., `j.brown`)
   - **Email:** The user's email address
   - **First Name / Last Name**
   - **Email Verified:** Toggle on if you are creating the account manually
4. Click **"Save"**.
5. Click the **"Credentials"** tab.
6. Click **"Set Password"**.
7. Enter a temporary password and toggle **"Temporary"** to ON (user will be prompted to change it on first login).
8. Click **"Save Password"**.

### Assigning Roles to a User

Roles control what a user can see and do in the portal and dashboards.

1. Open the user's profile in Keycloak.
2. Click the **"Role Mappings"** tab.
3. Under **"Client Roles"**, select **merl-portal** from the dropdown.
4. Select the appropriate role from the list and click **"Add Selected"**.

| Role | Access Level |
|------|-------------|
| `merl-admin` | Full system access |
| `merl-coordinator` | Province-level data entry, approval, and reporting |
| `merl-officer` | Own data entry only |
| `merl-community` | Community reporter — offline-first mobile entry |
| `merl-donor` | Read-only — dashboards and reports only |

> Users should be assigned exactly one primary role. If a user needs to do both coordination and field work, assign the higher role (`merl-coordinator`).

### Disabling a User

When a staff member leaves the project:

1. Open their user profile in Keycloak.
2. Toggle **"Enabled"** to OFF.
3. Click **"Save"**.

This immediately prevents the user from logging in. Their historical data is preserved.

### Resetting a User Password

1. Open the user profile in Keycloak.
2. Click the **"Credentials"** tab.
3. Click **"Reset Password"**.
4. Enter a new temporary password.
5. Toggle **"Temporary"** to ON.
6. Click **"Save"**.

Communicate the temporary password to the user via a secure channel (not email in plain text).

### Exporting and Importing the Realm Configuration

After making significant changes to the realm (new roles, clients, SMTP settings), export the realm configuration:

1. In Keycloak, go to **Realm Settings** → **Action** → **Partial Export**.
2. Enable "Export groups and roles" and "Export clients".
3. Click **"Export"** and save the JSON file to `keycloak/realm-export.json`.
4. Commit this file to git so the realm can be restored on a fresh deployment.

---

## 3. Database Administration

### Connecting to PostgreSQL

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

# Interactive psql session
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB

# Run a single query
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT COUNT(*) FROM merl.indicator_values;"
```

### Checking Database Size

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT pg_database_size(current_database()) / 1024 / 1024 AS db_size_mb;"

# Per-table sizes
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
      FROM pg_tables WHERE schemaname = 'merl' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### Running a Database Migration

When a new application version includes database schema changes, apply the Alembic migration:

```bash
# Ensure the backend container is running
docker compose up -d backend

# Apply migrations
docker compose exec backend alembic upgrade head

# Verify migration applied
docker compose exec backend alembic current
```

### Connecting to ClickHouse

```bash
export $(grep -v '^#' .env | xargs)

# Interactive session
docker compose exec clickhouse \
  clickhouse-client \
    --user=$CLICKHOUSE_USER \
    --password=$CLICKHOUSE_PASSWORD \
    --database=$CLICKHOUSE_DB

# Single query
docker compose exec clickhouse \
  clickhouse-client \
    --user=$CLICKHOUSE_USER \
    --password=$CLICKHOUSE_PASSWORD \
    --query="SELECT COUNT(*) FROM ${CLICKHOUSE_DB}.indicator_values"
```

### PostgreSQL Vacuum and Analyse

Run these periodically (or let autovacuum handle it — it is enabled by default):

```bash
# Manual vacuum on a specific table
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "VACUUM ANALYSE merl.indicator_values;"

# Full vacuum (locks the table — use during maintenance windows only)
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "VACUUM FULL merl.indicator_values;"
```

---

## 4. Monitoring Airflow DAGs

Access the Airflow web UI at **https://\<domain\>/airflow** (admin credentials from `.env`).

### Key DAGs

| DAG ID | Schedule (VUT) | Purpose |
|--------|----------------|---------|
| `dag_daily_backup` | Daily 02:00 | PostgreSQL + ClickHouse backup + S3 upload |
| `dag_data_validation` | Daily 07:00 | Flags missing submissions, emails coordinators |
| `dag_report_generation` | Weekly Mon 08:00 | Generates PDF reports and emails to stakeholders |
| `dag_clickhouse_refresh` | Every 6 hours | Refreshes ClickHouse materialized views |
| `dag_backup_verify` | Weekly Mon 03:00 | Verifies backup integrity |

### Checking DAG Status from the CLI

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard

# List all DAGs
docker compose exec airflow airflow dags list

# Check a specific DAG's last run status
docker compose exec airflow airflow dags last-dagruns dag_daily_backup

# Manually trigger a DAG
docker compose exec airflow airflow dags trigger dag_daily_backup

# View task logs for a specific run
docker compose exec airflow airflow tasks logs dag_daily_backup backup_postgres 2026-03-17
```

### Responding to a Failed DAG

1. In the Airflow UI, navigate to the failed DAG.
2. Click the failed run (shown in red).
3. Click the failed task to see its log output.
4. Diagnose the issue from the error message (common issues: S3 credentials expired, disk full, database unreachable).
5. Fix the underlying issue.
6. Click **"Clear"** on the failed task to retry it, or trigger a new DAG run.

### Pausing and Unpausing DAGs

```bash
# Pause a DAG (prevents scheduled runs, manual triggers still work)
docker compose exec airflow airflow dags pause dag_daily_backup

# Unpause
docker compose exec airflow airflow dags unpause dag_daily_backup
```

---

## 5. Managing Backups

For full backup procedures, see [backup-restore.md](backup-restore.md).

### Verifying Latest Backup

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
# Check local backup files
ls -lht backups/ | head -10

# Check S3
export $(grep -v '^#' .env | xargs)
aws s3 ls s3://${BACKUP_S3_BUCKET}/postgres/ | tail -5
```

### Manual Backup

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker compose exec -T postgres \
  pg_dump -U $POSTGRES_USER -d $POSTGRES_DB --format=custom \
  | gzip > backups/merl_postgres_${TIMESTAMP}.sql.gz

echo "Backup complete: backups/merl_postgres_${TIMESTAMP}.sql.gz"
```

### Disk Space Management

Check disk usage regularly:

```bash
df -h /var/lib/docker
docker system df

# Remove old backup files (older than 35 days)
find /opt/vcap2-online-geodatabase/merl-dashboard/backups -name "*.gz" -mtime +35 -delete
```

---

## 6. Updating Superset Dashboards

### Importing Dashboards

Superset dashboards are defined in JSON export files stored in `superset/exports/`.

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard

# Import a dashboard from a JSON export file
docker compose exec superset \
  superset import-dashboards \
    --path /app/superset_home/exports/merl_dashboards.json \
    --username admin
```

### Exporting Dashboards

After modifying dashboards through the Superset UI, export them for version control:

1. In Superset, go to **Dashboards** → select the dashboard → **Export**.
2. Save the JSON file to `superset/exports/`.
3. Commit the export file to git.

Alternatively, from the CLI:

```bash
docker compose exec superset \
  superset export-dashboards \
    --dashboard-ids 1,2,3 \
    --path /app/superset_home/exports/merl_dashboards_$(date +%Y%m%d).json
```

Then copy the file to the host:

```bash
docker compose cp superset:/app/superset_home/exports/merl_dashboards_YYYYMMDD.json \
  superset/exports/
```

### Adding a New Database Connection in Superset

1. In Superset, go to **Data** → **Databases** → **+ Database**.
2. Select the database type (ClickHouse or PostgreSQL).
3. Enter the connection details using the internal Docker service names:
   - Host: `clickhouse` or `postgres`
   - Port: `8123` (ClickHouse HTTP) or `5432`
   - Database: from `.env`
4. Test the connection and save.

### Managing Superset Users and Roles

Superset has its own RBAC separate from Keycloak. To add a Superset user:

1. Go to **Settings** → **List Users** → **+ Add User**.
2. Fill in email, first name, last name, username, and password.
3. Assign a role: `Admin`, `Alpha` (can create charts), or `Gamma` (view-only).

> For SSO integration with Keycloak, see `superset/superset_config.py`.

---

## 7. Adding New Indicators

When new indicators are added to the project results framework, they must be added to the database.

### Step 1 — Add the Indicator Record to PostgreSQL

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
INSERT INTO merl.indicators (
  code,
  name,
  description,
  unit_of_measure,
  frequency,
  target_value,
  baseline_value,
  output_id,
  is_active,
  created_at
) VALUES (
  '1.3.1',
  'Number of community L&D monitoring systems established',
  'Count of communities with functional loss and damage early warning and monitoring systems',
  'count',
  'quarterly',
  12,
  0,
  1,   -- output_id: FK to merl.outputs table
  true,
  NOW()
);
"
```

### Step 2 — Verify the Indicator Appears in the Portal

1. Log in to the portal as a field officer.
2. Navigate to **Indicators** → **New Submission**.
3. Confirm the new indicator appears in the dropdown.

### Step 3 — Add ClickHouse Table Entry (if needed)

If the indicator requires a separate ClickHouse aggregation, add it to the materialized view:

```bash
docker compose exec clickhouse \
  clickhouse-client \
    --user=$CLICKHOUSE_USER \
    --password=$CLICKHOUSE_PASSWORD \
    --query="ALTER TABLE ${CLICKHOUSE_DB}.indicators_mv ADD COLUMN IF NOT EXISTS new_indicator_value Float64 DEFAULT 0"
```

### Step 4 — Update Superset Dashboards

After adding a new indicator, update the relevant Superset dashboards to include it. See Section 6 for dashboard editing procedures.

---

## 8. SSL Certificate Renewal

SSL certificates from Let's Encrypt expire every 90 days. Renewal should be automated via cron (configured during initial setup), but manual renewal may be needed if the cron fails.

### Check Certificate Expiry

```bash
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -enddate
```

### Manual Certificate Renewal

```bash
# Stop NGINX to free port 80 for standalone Certbot
cd /opt/vcap2-online-geodatabase/merl-dashboard
docker compose stop nginx

# Renew certificates
sudo certbot renew

# Copy renewed certificates
sudo cp /etc/letsencrypt/live/<domain>/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/<domain>/privkey.pem nginx/ssl/
sudo chown $USER:$USER nginx/ssl/*.pem
sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem

# Restart NGINX
docker compose start nginx

# Verify
curl -sv https://<domain> 2>&1 | grep "subject\|expire"
```

### Configuring Auto-Renewal

If the renewal cron job is not set up:

```bash
sudo crontab -e
```

Add this line (replace `<domain>` and paths as appropriate):

```cron
0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/<domain>/*.pem /opt/vcap2-online-geodatabase/merl-dashboard/nginx/ssl/ && docker compose -f /opt/vcap2-online-geodatabase/merl-dashboard/docker-compose.yml restart nginx" >> /var/log/certbot-renew.log 2>&1
```

---

## 9. System Monitoring

### Checking Service Resource Usage

```bash
# Live CPU and memory usage per container
docker stats

# Disk usage summary
docker system df

# Disk usage on host
df -h
```

### Checking Logs

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard

# Follow all service logs
docker compose logs -f

# Follow a specific service
docker compose logs -f backend

# Show last 100 lines
docker compose logs --tail=100 postgres

# NGINX access/error logs
tail -f nginx/logs/access.log
tail -f nginx/logs/error.log
```

### Setting Up Log Rotation

Prevent log files from filling the disk:

```bash
sudo nano /etc/logrotate.d/merl-nginx
```

```logrotate
/opt/vcap2-online-geodatabase/merl-dashboard/nginx/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        docker compose -f /opt/vcap2-online-geodatabase/merl-dashboard/docker-compose.yml exec nginx nginx -s reopen
    endscript
}
```

### Monitoring PeerDB Replication Lag

```bash
# Check PeerDB logs for lag reports
docker compose logs peerdb | grep -i "lag\|error\|mirror"

# Access PeerDB UI
# Open http://<server-ip>:8085 in a browser
```

If replication lag exceeds 5 minutes:

1. Check PostgreSQL WAL slot:
```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT slot_name, active, lag FROM pg_replication_slots;"
```

2. Restart PeerDB:
```bash
docker compose restart peerdb
```

### Alerting Configuration

Airflow sends alert emails on backup failure, validation errors, and DAG failures. Ensure the SMTP settings in `.env` are correct and test them:

```bash
docker compose exec airflow airflow email-test -e $ALERT_EMAIL
```

For more comprehensive monitoring, consider installing Uptime Kuma or Prometheus + Grafana alongside the stack.

---

## 10. Troubleshooting Guide

### Service Won't Start

```bash
# Check the specific service logs
docker compose logs --tail=50 <service-name>

# Check for port conflicts on the host
sudo ss -tulpn | grep -E "80|443|5432|8123"

# Check available disk space
df -h
```

### PostgreSQL Container Keeps Restarting

Common cause: corrupted data directory or wrong password in `.env`.

```bash
docker compose logs postgres | tail -30
```

If the data directory is healthy but the password is wrong, update `.env` and:

```bash
docker compose down postgres
docker compose up -d postgres
```

If the data directory is corrupted (rare), you may need to restore from backup:

```bash
docker compose down postgres
docker volume rm merl-dashboard_postgres_data
docker compose up -d postgres
# Then restore from backup per backup-restore.md
```

### Keycloak Not Accessible

1. Check that PostgreSQL is healthy first (Keycloak depends on it):
```bash
docker compose ps postgres
```

2. Check Keycloak logs:
```bash
docker compose logs keycloak | tail -30
```

3. If Keycloak started before PostgreSQL was ready, restart it:
```bash
docker compose restart keycloak
```

### Backend Returns 401 Unauthorized

1. Verify the Keycloak realm name matches `KEYCLOAK_REALM` in `.env`.
2. Verify the client ID matches `KEYCLOAK_CLIENT_ID`.
3. Check the backend logs for JWT validation errors:
```bash
docker compose logs backend | grep -i "jwt\|token\|auth"
```

### Superset Dashboards Show No Data

1. Verify the ClickHouse database connection in Superset:
   - Go to **Data** → **Databases** → click the ClickHouse connection → **Test Connection**.
2. Check PeerDB is replicating data:
   ```bash
   docker compose logs peerdb | tail -20
   ```
3. Verify data exists in ClickHouse:
   ```bash
   docker compose exec clickhouse clickhouse-client \
     --user=$CLICKHOUSE_USER --password=$CLICKHOUSE_PASSWORD \
     --query="SELECT COUNT(*) FROM $CLICKHOUSE_DB.indicator_values"
   ```

### Airflow DAG Shows "Import Error"

This usually means a Python syntax error or missing dependency in the DAG file.

```bash
docker compose exec airflow airflow dags list-import-errors
```

Fix the DAG file in `airflow/dags/` and the error should clear within 30 seconds (the Airflow scheduler re-scans DAGs automatically).

### Disk Full

```bash
# Check what is using space
du -sh /var/lib/docker/*
docker system df

# Remove stopped containers, unused images, and dangling volumes
docker system prune -f

# Remove old Docker images (keep last 2 versions)
docker image prune -a --filter "until=720h"

# Remove old backup files
find /opt/vcap2-online-geodatabase/merl-dashboard/backups -name "*.gz" -mtime +30 -delete
```

### Applying a System Update

When a new version of the application is released:

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard

# 1. Pull the latest code
git pull origin main

# 2. Pull updated images
docker compose pull

# 3. Apply database migrations (if any)
docker compose run --rm backend alembic upgrade head

# 4. Restart services with new images
docker compose up -d --force-recreate

# 5. Verify all services healthy
docker compose ps
```

---

*Admin Manual version: 1.0 | March 2026 | Vanua Spatial Solutions*

*For the Government of Vanuatu Department of Climate Change / Ministry of Climate Change*
