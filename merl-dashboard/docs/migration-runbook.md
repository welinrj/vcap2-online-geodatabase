# Migration Runbook — Cloud to GoV Server

## Purpose

This runbook provides step-by-step instructions for migrating the MERL Dashboard from its initial cloud deployment to the Government of Vanuatu (GoV) on-premises server. Follow every step in order. Each step includes a verification command so you can confirm success before proceeding.

**Estimated total time:** 4–8 hours (depending on data volume and network speed)

**Required personnel:**
- System administrator with SSH access to both source and destination servers
- GoV ICT officer with sudo access on the destination server
- MERL project manager (for post-migration smoke testing)

---

## Table of Contents

1. [Pre-Migration Checklist](#1-pre-migration-checklist)
2. [Pre-Migration Data Export](#2-pre-migration-data-export)
3. [Application Transfer](#3-application-transfer)
4. [Environment Configuration](#4-environment-configuration)
5. [Starting Services](#5-starting-services)
6. [Database Restore](#6-database-restore)
7. [Service Verification](#7-service-verification)
8. [DNS and SSL Setup](#8-dns-and-ssl-setup)
9. [Post-Migration Smoke Test](#9-post-migration-smoke-test)

---

## 1. Pre-Migration Checklist

Complete every item before beginning the migration. Check off each item as you confirm it.

### 1.1 Destination Server Requirements

- [ ] **CPU:** Minimum 4 cores, 8+ recommended
- [ ] **RAM:** Minimum 8 GB, 16 GB recommended
- [ ] **Disk:** At minimum 50 GB free on the volume that will hold Docker data (`/var/lib/docker` or a dedicated mount)
- [ ] **OS:** Ubuntu 22.04 LTS (preferred) or Ubuntu 20.04 LTS
- [ ] **Static IP address** assigned to the server
- [ ] **Hostname** configured (`hostnamectl set-hostname merl.gov.vu`)

### 1.2 Software Prerequisites on Destination Server

Run these commands as a user with sudo access on the **destination server**:

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker Engine (official method)
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (log out and back in after this)
sudo usermod -aG docker $USER

# Verify Docker version (must be 24+)
docker --version
docker compose version

# Install additional utilities
sudo apt-get install -y git curl wget unzip net-tools certbot python3-certbot-nginx
```

- [ ] `docker --version` shows 24.0+
- [ ] `docker compose version` shows v2.20+
- [ ] `git --version` shows 2.x

### 1.3 Network and Firewall Rules

Ensure the following ports are open **inbound** on the destination server:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Admin IPs only | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 8085 | TCP | Admin IPs only | PeerDB UI |

```bash
# Example UFW configuration (adjust admin IP)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <ADMIN_IP> to any port 8085
sudo ufw enable
sudo ufw status
```

- [ ] UFW enabled with correct rules

### 1.4 DNS

- [ ] Domain name (e.g. `merl.climate.gov.vu`) created with your DNS provider
- [ ] A record pointing to the destination server's public IP address
- [ ] TTL set to 300 seconds (5 minutes) for fast propagation during cutover
- [ ] DNS propagation verified: `dig merl.climate.gov.vu` returns the new server IP

### 1.5 Pre-Migration Downtime Window

- [ ] Downtime window communicated to all stakeholders (recommend a Saturday night)
- [ ] All active users notified 48 hours in advance

---

## 2. Pre-Migration Data Export

Perform these steps on the **source (cloud) server** while the application is still running.

### 2.1 PostgreSQL Backup

```bash
# SSH into the source server
ssh user@<SOURCE_SERVER_IP>

cd /path/to/merl-dashboard

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Create a timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="merl_postgres_${TIMESTAMP}.sql.gz"

docker compose exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --format=custom \
    --verbose \
    --no-password \
  | gzip > /tmp/${BACKUP_FILE}

echo "PostgreSQL backup size: $(du -sh /tmp/${BACKUP_FILE})"
```

Verify the backup is not empty:

```bash
ls -lh /tmp/${BACKUP_FILE}
# Should show a non-zero file size
```

### 2.2 ClickHouse Backup

```bash
# Export ClickHouse data as CSV files for each table
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p /tmp/clickhouse_backup_${TIMESTAMP}

# List all tables in the MERL database
docker compose exec clickhouse \
  clickhouse-client \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="SHOW TABLES FROM ${CLICKHOUSE_DB}" \
  > /tmp/clickhouse_tables.txt

# Export each table (run this for each table shown)
while IFS= read -r table; do
  echo "Exporting table: $table"
  docker compose exec -T clickhouse \
    clickhouse-client \
      --user="${CLICKHOUSE_USER}" \
      --password="${CLICKHOUSE_PASSWORD}" \
      --query="SELECT * FROM ${CLICKHOUSE_DB}.${table} FORMAT Native" \
    > /tmp/clickhouse_backup_${TIMESTAMP}/${table}.native
done < /tmp/clickhouse_tables.txt

# Compress the backup
tar -czf /tmp/merl_clickhouse_${TIMESTAMP}.tar.gz -C /tmp clickhouse_backup_${TIMESTAMP}/
echo "ClickHouse backup size: $(du -sh /tmp/merl_clickhouse_${TIMESTAMP}.tar.gz)"
```

### 2.3 Upload Volumes Backup

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup uploaded files
docker run --rm \
  -v merl-dashboard_uploads_data:/data \
  -v /tmp:/backup \
  alpine \
  tar czf /backup/merl_uploads_${TIMESTAMP}.tar.gz -C /data .

echo "Uploads backup size: $(du -sh /tmp/merl_uploads_${TIMESTAMP}.tar.gz)"
```

### 2.4 Put Application in Maintenance Mode

Before transferring, put the application in maintenance mode to prevent new writes during the migration window:

```bash
# Scale down backend to prevent new data entry
docker compose stop backend frontend

echo "Application is now in maintenance mode. No new data can be submitted."
```

### 2.5 Take Final Backup

After stopping the backend, take a final consistent backup:

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FINAL_BACKUP="merl_postgres_FINAL_${TIMESTAMP}.sql.gz"

docker compose exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --format=custom \
    --verbose \
  | gzip > /tmp/${FINAL_BACKUP}

echo "Final backup: /tmp/${FINAL_BACKUP}"
echo "Size: $(du -sh /tmp/${FINAL_BACKUP})"
```

---

## 3. Application Transfer

### 3.1 Option A — Git Clone (Recommended)

On the **destination server**:

```bash
# Create application directory
sudo mkdir -p /opt/merl-dashboard
sudo chown $USER:$USER /opt/merl-dashboard

# Clone the repository
git clone https://github.com/welinrj/vcap2-online-geodatabase.git /opt/vcap2-online-geodatabase

cd /opt/vcap2-online-geodatabase/merl-dashboard
ls -la
```

### 3.2 Option B — Transfer via SCP / tar.gz

If the destination server does not have internet access:

```bash
# On the SOURCE server — create archive
cd /path/to
tar -czf /tmp/merl-dashboard-app.tar.gz \
  vcap2-online-geodatabase/merl-dashboard \
  --exclude='*/node_modules' \
  --exclude='*/__pycache__' \
  --exclude='*/.git'

# Transfer to destination server
scp /tmp/merl-dashboard-app.tar.gz user@<DESTINATION_SERVER_IP>:/tmp/

# On the DESTINATION server — extract
sudo mkdir -p /opt
cd /opt
sudo tar -xzf /tmp/merl-dashboard-app.tar.gz
sudo chown -R $USER:$USER vcap2-online-geodatabase
cd vcap2-online-geodatabase/merl-dashboard
ls -la
```

### 3.3 Transfer Backup Files

```bash
# Transfer backup files from source to destination
scp /tmp/merl_postgres_FINAL_*.sql.gz user@<DESTINATION_SERVER_IP>:/opt/vcap2-online-geodatabase/merl-dashboard/
scp /tmp/merl_clickhouse_*.tar.gz user@<DESTINATION_SERVER_IP>:/opt/vcap2-online-geodatabase/merl-dashboard/
scp /tmp/merl_uploads_*.tar.gz user@<DESTINATION_SERVER_IP>:/opt/vcap2-online-geodatabase/merl-dashboard/
```

---

## 4. Environment Configuration

On the **destination server**, inside `/opt/vcap2-online-geodatabase/merl-dashboard`:

### 4.1 Create Environment File

```bash
cp .env.example .env
nano .env   # or use your preferred editor
```

Update every variable for the new environment. Critical changes from the cloud deployment:

```bash
# Server-specific settings
ENVIRONMENT=production
ALLOWED_ORIGINS=https://merl.climate.gov.vu

# Use the same database passwords as the source server
# (so the restored dump matches)
POSTGRES_PASSWORD=<same_as_source>
POSTGRES_USER=<same_as_source>
POSTGRES_DB=<same_as_source>

CLICKHOUSE_PASSWORD=<same_as_source>
CLICKHOUSE_USER=<same_as_source>
CLICKHOUSE_DB=<same_as_source>

# Frontend URLs point to the new domain
VITE_API_URL=https://merl.climate.gov.vu/api
VITE_KEYCLOAK_URL=https://merl.climate.gov.vu/auth

# S3 backup bucket (update region/bucket as needed)
BACKUP_S3_BUCKET=merl-backups-gov-vu
AWS_DEFAULT_REGION=ap-southeast-2
```

### 4.2 Create Runtime Directories

```bash
mkdir -p nginx/logs nginx/ssl uploads backups airflow/logs superset/exports

touch nginx/logs/.gitkeep nginx/ssl/.gitkeep uploads/.gitkeep \
      backups/.gitkeep airflow/logs/.gitkeep superset/exports/.gitkeep
```

### 4.3 Verify Configuration

```bash
# Confirm .env is populated (no blank required values)
grep -E "^[A-Z_]+=\s*$" .env
# This should return no output (no blank required values)
```

---

## 5. Starting Services

### 5.1 Start Database Services First

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard

# Start only the databases initially
docker compose up -d postgres redis

# Wait for PostgreSQL to be healthy
docker compose ps postgres
# Status should show "healthy"

# Wait up to 60 seconds
timeout 60 bash -c 'until docker compose exec postgres pg_isready -U $POSTGRES_USER; do sleep 2; done'
echo "PostgreSQL is ready"
```

### 5.2 Restore Data (See Section 6 Before Continuing)

**STOP HERE.** Before starting the remaining services, restore the database from the backup as described in Section 6. The application will create a blank database if started before the restore.

### 5.3 Start Remaining Services

After the database restore is complete:

```bash
# Start all remaining services
docker compose up -d

# Monitor startup (Ctrl+C to stop following when all services are up)
docker compose logs -f --tail=50
```

### 5.4 Verify All Services Running

```bash
docker compose ps
```

Expected output — all services should show `running (healthy)` or `running`:

```
NAME               STATUS          PORTS
merl-nginx         running         0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
merl-postgres      running (healthy)   0.0.0.0:5432->5432/tcp
merl-clickhouse    running (healthy)   0.0.0.0:8123->8123/tcp
merl-peerdb        running         0.0.0.0:8085->8085/tcp
merl-backend       running (healthy)   0.0.0.0:8000->8000/tcp
merl-frontend      running         0.0.0.0:3000->3000/tcp
merl-airflow       running         0.0.0.0:8080->8080/tcp
merl-superset      running         0.0.0.0:8088->8088/tcp
merl-keycloak      running         0.0.0.0:8180->8080/tcp
merl-redis         running         0.0.0.0:6379->6379/tcp
```

---

## 6. Database Restore

### 6.1 Restore PostgreSQL

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)

# Identify the final backup file
ls -lh merl_postgres_FINAL_*.sql.gz

# Restore into the running PostgreSQL container
BACKUP_FILE=$(ls merl_postgres_FINAL_*.sql.gz | tail -1)

gunzip -c ${BACKUP_FILE} | \
docker compose exec -T postgres \
  pg_restore \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --no-password \
    --verbose \
    --clean \
    --if-exists

echo "PostgreSQL restore exit code: $?"
```

Verify the restore:

```bash
# Check row counts for key tables
docker compose exec postgres psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
```

### 6.2 Restore ClickHouse

```bash
# Extract the ClickHouse backup
tar -xzf merl_clickhouse_*.tar.gz

# Get the extracted directory name
CH_BACKUP_DIR=$(ls -d clickhouse_backup_*)

# Restore each table
for f in ${CH_BACKUP_DIR}/*.native; do
  table=$(basename "$f" .native)
  echo "Restoring table: $table"
  cat "$f" | docker compose exec -T clickhouse \
    clickhouse-client \
      --user="${CLICKHOUSE_USER}" \
      --password="${CLICKHOUSE_PASSWORD}" \
      --query="INSERT INTO ${CLICKHOUSE_DB}.${table} FORMAT Native"
done

echo "ClickHouse restore complete"
```

Verify ClickHouse restore:

```bash
docker compose exec clickhouse \
  clickhouse-client \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --query="SELECT table, formatReadableQuantity(total_rows) as rows FROM system.tables WHERE database = '${CLICKHOUSE_DB}' ORDER BY total_rows DESC"
```

### 6.3 Restore Uploads Volume

```bash
# Restore uploaded files
docker run --rm \
  -v merl-dashboard_uploads_data:/data \
  -v $(pwd):/backup \
  alpine \
  sh -c "cd /data && tar xzf /backup/merl_uploads_*.tar.gz"

echo "Uploads restore complete"
```

---

## 7. Service Verification

Run these health checks from the destination server to verify each service is responding correctly.

```bash
# Backend API health
curl -sf http://localhost:8000/health && echo "Backend OK" || echo "Backend FAILED"

# Frontend
curl -sf http://localhost:3000 -o /dev/null && echo "Frontend OK" || echo "Frontend FAILED"

# Superset
curl -sf http://localhost:8088/health && echo "Superset OK" || echo "Superset FAILED"

# Airflow
curl -sf http://localhost:8080/health && echo "Airflow OK" || echo "Airflow FAILED"

# Keycloak
curl -sf http://localhost:8180/auth/realms/master && echo "Keycloak OK" || echo "Keycloak FAILED"

# ClickHouse HTTP
curl -sf http://localhost:8123/ping && echo "ClickHouse OK" || echo "ClickHouse FAILED"

# PostgreSQL
docker compose exec postgres pg_isready -U $POSTGRES_USER && echo "PostgreSQL OK" || echo "PostgreSQL FAILED"

# Redis
docker compose exec redis redis-cli ping && echo "Redis OK" || echo "Redis FAILED"

# PeerDB UI (just checks TCP)
curl -sf http://localhost:8085 -o /dev/null && echo "PeerDB OK" || echo "PeerDB FAILED"
```

All services should return `OK`. Investigate any failures with `docker compose logs <service-name>`.

---

## 8. DNS and SSL Setup

### 8.1 Verify DNS Propagation

Before issuing a certificate, confirm DNS is pointing to the new server:

```bash
dig merl.climate.gov.vu +short
# Should return the destination server's IP address
```

### 8.2 Obtain Let's Encrypt SSL Certificate

```bash
# Stop NGINX temporarily so Certbot can bind port 80
docker compose stop nginx

# Issue certificate
sudo certbot certonly \
  --standalone \
  --agree-tos \
  --non-interactive \
  --email admin@climate.gov.vu \
  -d merl.climate.gov.vu

# Certificate will be saved to /etc/letsencrypt/live/merl.climate.gov.vu/
```

### 8.3 Copy Certificates to NGINX SSL Directory

```bash
sudo cp /etc/letsencrypt/live/merl.climate.gov.vu/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/merl.climate.gov.vu/privkey.pem nginx/ssl/
sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem
sudo chown $USER:$USER nginx/ssl/*.pem
```

### 8.4 Update NGINX Configuration for HTTPS

Edit `nginx/nginx.conf` and update the server_name and certificate paths to use the new domain. Ensure the SSL server block references:

```nginx
ssl_certificate /etc/nginx/ssl/fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/privkey.pem;
```

### 8.5 Restart NGINX

```bash
docker compose start nginx

# Verify HTTPS is working
curl -sf https://merl.climate.gov.vu/health && echo "HTTPS OK" || echo "HTTPS FAILED"
```

### 8.6 Configure Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Add cron job for renewal (runs twice daily, standard for Let's Encrypt)
sudo crontab -e
# Add: 0 0,12 * * * certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/merl.climate.gov.vu/*.pem /opt/vcap2-online-geodatabase/merl-dashboard/nginx/ssl/ && docker compose -f /opt/vcap2-online-geodatabase/merl-dashboard/docker-compose.yml restart nginx"
```

---

## 9. Post-Migration Smoke Test

Complete these tests with the MERL project manager after bringing the application up on the new server with SSL.

### Application Access

- [ ] `https://merl.climate.gov.vu` loads the React portal login page
- [ ] SSL padlock shown in browser, no certificate warnings
- [ ] Login with an admin account succeeds (redirects through Keycloak)
- [ ] Login with a field officer account succeeds
- [ ] Dashboard overview page loads with data visible

### Data Integrity

- [ ] Indicator count in portal matches pre-migration record count
- [ ] A recent L&D event submitted before migration is visible
- [ ] Map view shows event markers in correct provinces
- [ ] Superset dashboard shows correct total figures (cross-check with pre-migration export)

### Functionality

- [ ] Submit a new test indicator value — verify it saves and appears in the list
- [ ] Upload a test CSV — verify rows import correctly
- [ ] Superset chart queries complete without error
- [ ] Airflow DAG list is visible; trigger the validation DAG manually and verify it completes

### Infrastructure

- [ ] `docker compose ps` shows all 10 services healthy
- [ ] Backup DAG can be triggered manually and completes without error
- [ ] S3 backup upload succeeds (check S3 bucket for a new file)
- [ ] SMTP alert email is received at `ALERT_EMAIL`

### Decommission Source Server (Only After Successful Smoke Test)

- [ ] Confirm all data is present on new server
- [ ] Notify all users of new URL
- [ ] Update any external integrations pointing to old server
- [ ] Schedule source server shutdown or retain for 30 days as fallback
- [ ] Reduce DNS TTL back to standard (3600 seconds)

---

*Runbook version: 1.0 | March 2026 | Vanua Spatial Solutions*
